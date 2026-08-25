<?php
/**
 * Fabrika Okulu — Anket (koşullu form) motoru
 *
 * NE YAPAR:
 * - Kayıt olup giriş yapan öğrenciyi ZORUNLU ankete alır (panel + player kilitli).
 * - Anket tanımı VERİTABANINDA tutulur (option `oes_survey_schema`), koddaki
 *   default_schema()'dan bir kez tohumlanır. wp-admin'den soru/şık eklenebilir.
 * - Koşullu gösterim: her sorunun `show_if` kural listesi vardır (VE'lenir).
 *   Aynı kurallar İSTEMCİDE (canlı göster/gizle) ve SUNUCUDA (kaydetmeden önce)
 *   çalışır — tek kaynak: visible_questions().
 * - Sürüm artınca ("yeni soru eklendi") herkes yeniden ankete düşer.
 *
 * NEDEN AYRI TABLO (soru başına satır):
 * Tek JSON sütunu olsaydı "1 ay içinde iş değiştirmek isteyenler" gibi bir liste
 * SQL'de çıkarılamazdı. Segmentasyon bu sistemin asıl amacı olduğu için cevaplar
 * (user_id, survey_key, question_key) başına tek satır tutulur.
 *
 * @package Fabrika Okulu
 */

if (!defined('ABSPATH')) exit;

class OES_Surveys {

    const NONCE       = 'oes_survey';
    const SCHEMA_OPT  = 'oes_survey_schema';
    /** Kullanıcının tamamladığı anket sürümü: user_meta '_oes_survey_v_{key}' */
    const META_PREFIX = '_oes_survey_v_';

    private static $instance = null;
    /** @var array|null Bellekte tutulan şema (istek başına bir kez okunur) */
    private static $schema_cache = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_survey_save', array($this, 'ajax_save'));
        add_action('wp_ajax_oes_survey_skip', array($this, 'ajax_skip'));

        // Tema sayfalarında modalı bas. Panel/player standalone şablonlar
        // wp_footer çağırmadığı için orada elle çağrılıyor.
        add_action('wp_footer', array($this, 'maybe_modal'), 99);
    }

    /**
     * Tema sayfalarında anket modalı.
     *
     * SEPET/ÖDEME HARİÇ: satın alma akışının üstünü kapatmak satışı bloke ederdi.
     * Anket zaten panelde ve player'da karşılarına çıkıyor.
     */
    public function maybe_modal() {
        if (is_admin()) return;
        if (function_exists('is_cart') && (is_cart() || is_checkout())) return;
        if (!apply_filters('fabo_survey_modal_here', true)) return;
        self::render_modal();
    }

    /** "Şimdilik geç" — kilidi kaldırır, anket eksik olarak kalır. */
    public function ajax_skip() {
        check_ajax_referer(self::NONCE, 'nonce');
        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error(array('message' => 'Giriş yapmalısın.'));
        self::skip($user_id);
        wp_send_json_success(array('redirect' => class_exists('OES_Panel')
            ? OES_Panel::instance()->panel_url() : home_url('/panel/')));
    }

    public static function table() {
        global $wpdb;
        return $wpdb->prefix . 'oes_survey_answers';
    }

    /* =====================================================================
     *  ŞEMA
     * ================================================================== */

    /**
     * Aktif şema. Option boşsa koddaki varsayılandan tohumlanır.
     * `fabo_survey_schema` filtresiyle programatik olarak da değiştirilebilir.
     */
    public static function get_schema() {
        if (self::$schema_cache !== null) return self::$schema_cache;

        $schema = get_option(self::SCHEMA_OPT, null);
        if (!is_array($schema) || empty($schema['questions'])) {
            $schema = self::default_schema();
            update_option(self::SCHEMA_OPT, $schema, false);
        }
        self::$schema_cache = apply_filters('fabo_survey_schema', $schema);
        return self::$schema_cache;
    }

    public static function save_schema($schema) {
        self::$schema_cache = null;
        return update_option(self::SCHEMA_OPT, $schema, false);
    }

    public static function survey_key() {
        $s = self::get_schema();
        return isset($s['key']) ? $s['key'] : 'kariyer_rotam';
    }

    public static function version() {
        $s = self::get_schema();
        return max(1, intval($s['version'] ?? 1));
    }

    /** Soruyu anahtarıyla getir. */
    public static function question($key) {
        foreach (self::get_schema()['questions'] as $q) {
            if ($q['key'] === $key) return $q;
        }
        return null;
    }

    /** Şık etiketi (raporlarda ham anahtar yerine insan okunur metin için). */
    public static function option_label($question_key, $value) {
        $q = self::question($question_key);
        if (!$q || empty($q['options'])) return $value;
        return isset($q['options'][$value]) ? $q['options'][$value] : $value;
    }

    /* =====================================================================
     *  KOŞUL MOTORU — istemci ve sunucu AYNI kuralı uygular
     * ================================================================== */

    /**
     * Tek bir kural doğru mu?
     * Kural: array('q' => 'durum', 'op' => 'in|not_in|filled|empty', 'val' => array(...))
     */
    private static function rule_passes($rule, $answers) {
        $qk  = $rule['q'] ?? '';
        $op  = $rule['op'] ?? 'in';
        $val = (array) ($rule['val'] ?? array());
        $cur = $answers[$qk] ?? '';

        // Çoklu seçim (checkbox) cevabı dizi olarak gelir
        $cur_arr = is_array($cur) ? $cur : ($cur === '' ? array() : array($cur));

        switch ($op) {
            case 'filled':  return !empty($cur_arr);
            case 'empty':   return empty($cur_arr);
            case 'not_in':  return count(array_intersect($cur_arr, $val)) === 0;
            case 'in':
            default:        return count(array_intersect($cur_arr, $val)) > 0;
        }
    }

    /**
     * Verilen cevaplara göre GÖRÜNÜR soruların anahtarları.
     *
     * Sıra önemli: sorular şemadaki sırayla değerlendirilir ve gizli bir sorunun
     * cevabı SİLİNİR. Böylece zincir doğru çöker — ör. kullanıcı önce "Lisans yok"
     * deyip Lise'yi doldurduysa, sonra "Lisans mezunu"na dönünce Lise ve ona bağlı
     * İlk-Orta cevapları da devre dışı kalır (yoksa hayalet cevap kalırdı).
     */
    public static function visible_questions(&$answers) {
        $visible = array();
        foreach (self::get_schema()['questions'] as $q) {
            $ok = true;
            foreach ((array) ($q['show_if'] ?? array()) as $rule) {
                if (!self::rule_passes($rule, $answers)) { $ok = false; break; }
            }
            if ($ok) {
                $visible[] = $q['key'];
            } else {
                unset($answers[$q['key']]); // gizli soru = cevapsız
            }
        }
        return $visible;
    }

    /* =====================================================================
     *  CEVAPLAR
     * ================================================================== */

    /** @return array question_key => value (checkbox'lar dizi) */
    public static function get_answers($user_id, $survey_key = null) {
        global $wpdb;
        $survey_key = $survey_key ?: self::survey_key();
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT question_key, value FROM " . self::table() . "
             WHERE user_id = %d AND survey_key = %s",
            $user_id, $survey_key
        ));
        $out = array();
        foreach ($rows as $r) {
            $decoded = json_decode($r->value, true);
            // Çoklu seçimler JSON dizi olarak yazılır; düz metinler aynen döner.
            $out[$r->question_key] = is_array($decoded) ? $decoded : $r->value;
        }
        return $out;
    }

    /**
     * Birden çok kullanıcının cevapları — TEK sorguda.
     *
     * Liste ekranı satır başına get_answers() çağırıyordu (30 satır = 30 sorgu).
     * @return array user_id => (question_key => value)
     */
    public static function get_answers_bulk($user_ids, $survey_key = null) {
        global $wpdb;
        $ids = array_filter(array_map('intval', (array) $user_ids));
        if (empty($ids)) return array();

        $survey_key = $survey_key ?: self::survey_key();
        $ph = implode(',', array_fill(0, count($ids), '%d'));
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT user_id, question_key, value FROM " . self::table() . "
             WHERE survey_key = %s AND user_id IN ({$ph})",
            array_merge(array($survey_key), $ids)
        ));

        $out = array_fill_keys($ids, array());
        foreach ($rows as $r) {
            $decoded = json_decode($r->value, true);
            $out[intval($r->user_id)][$r->question_key] = is_array($decoded) ? $decoded : $r->value;
        }
        return $out;
    }

    /**
     * Cevapları yaz. GÖRÜNÜR olmayan sorular kaydedilmez ve varsa silinir.
     * @return array ['ok'=>bool,'missing'=>array] eksik zorunlu soru anahtarları
     */
    public static function save_answers($user_id, $answers, $survey_key = null) {
        global $wpdb;
        $survey_key = $survey_key ?: self::survey_key();

        $visible = self::visible_questions($answers); // $answers referansla temizlenir
        $missing = array();

        foreach (self::get_schema()['questions'] as $q) {
            if (!in_array($q['key'], $visible, true)) continue;
            if (empty($q['required'])) continue;
            $v = $answers[$q['key']] ?? '';
            if (is_array($v) ? empty($v) : trim((string) $v) === '') {
                $missing[] = $q['key'];
            }
        }
        if ($missing) return array('ok' => false, 'missing' => $missing);

        $now = current_time('mysql');

        // Görünür olmayanları temizle (dal değişmişse eski cevaplar kalmasın)
        $keep = $visible ? $visible : array('__none__');
        $ph   = implode(',', array_fill(0, count($keep), '%s'));
        $wpdb->query($wpdb->prepare(
            "DELETE FROM " . self::table() . "
             WHERE user_id = %d AND survey_key = %s AND question_key NOT IN ({$ph})",
            array_merge(array($user_id, $survey_key), $keep)
        ));

        $written = 0;
        foreach ($visible as $qk) {
            $v = $answers[$qk] ?? '';
            $stored = is_array($v) ? wp_json_encode(array_values($v)) : (string) $v;
            // UNIQUE(user_id, survey_key, question_key) → REPLACE ile upsert
            $ok = $wpdb->replace(self::table(), array(
                'user_id'      => $user_id,
                'survey_key'   => $survey_key,
                'question_key' => $qk,
                'value'        => $stored,
                'updated_at'   => $now,
            ), array('%d', '%s', '%s', '%s', '%s'));
            if ($ok !== false) $written++;
        }

        /* Yazma BAŞARISIZSA "tamamladı" işaretleme.
           Tablo admin_init'te kuruluyor; yönetici eklenti güncellemesinden sonra
           wp-admin'e uğramadan bir öğrenci giriş yaparsa tablo henüz olmayabilir.
           İşaretleseydik kullanıcı kilidi geçer ama tek bir cevabı kaydedilmezdi. */
        if ($visible && $written === 0) {
            return array('ok' => false, 'missing' => array(), 'db' => true);
        }

        update_user_meta($user_id, self::META_PREFIX . $survey_key, self::version());
        do_action('fabo_survey_completed', $user_id, $survey_key, $answers);

        return array('ok' => true, 'missing' => array());
    }

    /* =====================================================================
     *  DURUM / KİLİT
     * ================================================================== */

    /** Kullanıcı güncel sürümü tamamladı mı? */
    public static function is_complete($user_id) {
        if (!$user_id) return true; // misafirle uğraşma
        $done = intval(get_user_meta($user_id, self::META_PREFIX . self::survey_key(), true));
        return $done >= self::version();
    }

    /** Daha önce doldurmuş ama sürüm arttı mı? ("Yeni anketiniz var") */
    public static function has_update($user_id) {
        $done = intval(get_user_meta($user_id, self::META_PREFIX . self::survey_key(), true));
        return $done > 0 && $done < self::version();
    }

    /** Kullanıcı "şimdilik geç" dedi mi? (user_meta '_oes_survey_skip_{key}') */
    public static function has_skipped($user_id) {
        return get_user_meta($user_id, '_oes_survey_skip_' . self::survey_key(), true) === 'yes';
    }

    /** Anketi ertele — kilit kalkar, panelde hatırlatma şeridi kalır. */
    public static function skip($user_id) {
        update_user_meta($user_id, '_oes_survey_skip_' . self::survey_key(), 'yes');
    }

    /**
     * Anketi SIFIRLA — cevaplar ve tamamlama işareti silinir, kullanıcı yeniden
     * ankete düşer. Yönetici testte aynı kullanıcıyla tekrar tekrar görebilsin diye.
     */
    public static function reset_user($user_id, $survey_key = null) {
        global $wpdb;
        $survey_key = $survey_key ?: self::survey_key();
        $wpdb->delete(self::table(), array('user_id' => $user_id, 'survey_key' => $survey_key), array('%d', '%s'));
        delete_user_meta($user_id, self::META_PREFIX . $survey_key);
        delete_user_meta($user_id, '_oes_survey_skip_' . $survey_key);
    }

    /** Anket zorunlu mu? (wp-admin → Anket Tanımı'ndan kapatılabilir) */
    public static function is_required() {
        $req = get_option('oes_survey_required', 'yes') === 'yes';
        return (bool) apply_filters('fabo_survey_required', $req);
    }

    /**
     * Bu kullanıcı ankete zorlanmalı mı?
     *
     * Yönetici ve eğitmenler HARİÇ — anket öğrenciye yönelik ve yöneticiyi kendi
     * panelinden kilitlemek çalışmayı imkânsız kılardı.
     * "Şimdilik geç" diyen de kilitlenmez; panelde hatırlatma şeridi görür.
     */
    public static function must_answer($user_id = 0) {
        $user_id = $user_id ?: get_current_user_id();
        if (!$user_id) return false;
        if (user_can($user_id, 'manage_options')) return false;
        // $user_id'yi AÇIKÇA geçir: can_access_panel() argümansız çağrılırsa
        // geçerli kullanıcıya bakar ve başka biri için sorulduğunda yanılırdı.
        if (class_exists('OES_Teacher') && OES_Teacher::can_access_panel($user_id)) return false;
        if (self::is_complete($user_id)) return false;
        if (!self::is_required()) return false;
        if (self::has_skipped($user_id)) return false;
        return true;
    }

    /** Panelde "anketin eksik" şeridi gösterilsin mi? */
    public static function needs_attention($user_id) {
        if (!$user_id) return false;
        if (user_can($user_id, 'manage_options')) return false;
        if (class_exists('OES_Teacher') && OES_Teacher::can_access_panel($user_id)) return false;
        return !self::is_complete($user_id);
    }

    /* =====================================================================
     *  FORM
     * ================================================================== */

    public static function form_url() {
        return class_exists('OES_Panel') ? OES_Panel::instance()->panel_url('anket') : home_url('/panel/anket/');
    }

    /** Adım tanımları (şemada yoksa tek adıma düşer — eski kayıtlar bozulmasın). */
    public static function steps() {
        $s = self::get_schema();
        if (!empty($s['steps']) && is_array($s['steps'])) return $s['steps'];
        return array(1 => array('title' => $s['title'] ?? 'Anket', 'sub' => ''));
    }

    /**
     * Anket formunu basar.
     *
     * İKİ MOD:
     * - 'gate' → ADIM ADIM sihirbaz. Zorunlu ilk doldurmada 40 soruyu tek sayfada
     *            göstermek caydırıcı; adımlara bölününce her ekranda 2-4 soru kalır.
     * - 'edit' → panel içinde DÜZ liste. Küçük bir düzeltme için sihirbazda
     *            gezinmek zahmetli olurdu; hepsi açık gelir.
     */
    public static function render_form($user_id, $mode = 'edit') {
        // CSS'i çağıran yüzey basar (standalone anket.php ve panel shell.php kendi
        // <link>'ini koyuyor) — burada enqueue etmek standalone şablonda çalışmazdı.
        if ($mode === 'gate') { self::render_wizard($user_id); return; }
        self::render_flat($user_id);
    }

    /** Panel içi düz form — bölüm başlıklarıyla, hepsi açık. */
    private static function render_flat($user_id) {
        $schema  = self::get_schema();
        $answers = self::get_answers($user_id);
        $update  = self::has_update($user_id);
        ?>
        <form class="sv sv-flat" id="svForm" data-mode="edit">
            <?php if ($update): ?>
                <div class="sv-note upd">
                    <strong>Ankete yeni sorular eklendi.</strong>
                    Önceki cevapların duruyor — yalnızca boş kalan alanları tamamlaman yeterli.
                </div>
            <?php endif; ?>

            <?php foreach ((array) ($schema['sections'] ?? array()) as $skey => $stitle): ?>
                <?php
                $sq = array_filter($schema['questions'], function ($q) use ($skey) {
                    return ($q['section'] ?? '') === $skey;
                });
                if (empty($sq)) continue;
                ?>
                <section class="sv-sec" data-sec="<?php echo esc_attr($skey); ?>">
                    <h3 class="sv-sec-t"><?php echo esc_html($stitle); ?></h3>
                    <?php foreach ($sq as $q) self::render_question($q, $answers); ?>
                </section>
            <?php endforeach; ?>

            <div class="sv-msg" id="svMsg"></div>
            <div class="sv-actions">
                <button type="submit" class="sv-btn" id="svSubmit">Değişiklikleri kaydet</button>
            </div>
        </form>
        <?php
        self::inline_js('edit');
    }

    /**
     * Zorunlu doldurma — adım adım sihirbaz (modal içinde).
     *
     * YAPI ÖNEMLİ: form bir flex sütun; ADIMLAR `.svm-scroll` içinde kayar,
     * ilerleme çubuğu ve alt bar dışında kalır. Böylece sol ray ve düğmeler
     * sabit durur, yalnızca içerik kayar.
     *
     * İkon yok (Tabler'a bağımlı değil): modal tema sayfalarında da açılıyor,
     * oralarda ikon fontu yüklü olmayabilir.
     */
    private static function render_wizard($user_id) {
        $schema  = self::get_schema();
        $answers = self::get_answers($user_id);
        $steps   = self::steps();
        $update  = self::has_update($user_id);
        $req     = self::is_required();
        ?>
        <form class="sv sv-wiz svm-form" id="svForm" data-mode="gate">

          <div class="svm-bar"><span id="svBar"></span></div>

          <div class="svm-scroll">
            <?php if ($update): ?>
                <div class="sv-note upd">
                    <strong>Ankete yeni sorular eklendi.</strong>
                    Önceki cevapların duruyor — yalnızca boş kalanları tamamlaman yeterli.
                </div>
            <?php endif; ?>

            <?php foreach ($steps as $n => $st):
                $sq = array_filter($schema['questions'], function ($q) use ($n) {
                    return intval($q['step'] ?? 1) === intval($n);
                });
                if (empty($sq)) continue; ?>
                <section class="svz-step" data-step="<?php echo intval($n); ?>" hidden>
                    <header class="svz-h">
                        <h2><?php echo esc_html($st['title']); ?></h2>
                        <?php if (!empty($st['sub'])): ?><p><?php echo esc_html($st['sub']); ?></p><?php endif; ?>
                    </header>
                    <?php foreach ($sq as $q) self::render_question($q, $answers); ?>
                </section>
            <?php endforeach; ?>

            <div class="sv-msg" id="svMsg"></div>

            <?php // Erteleme — yalnızca anket zorunlu DEĞİLKEN ?>
            <?php if (!$req): ?>
            <div class="svz-skip">
                <button type="button" id="svSkip">Şimdilik geç, sonra doldururum</button>
            </div>
            <?php endif; ?>
          </div>

          <footer class="svm-foot">
              <button type="button" class="svz-back" id="svBack" hidden>&larr; Geri</button>
              <span class="svz-count" id="svCount"></span>
              <button type="button" class="sv-btn" id="svNext">Devam et &rarr;</button>
              <button type="submit" class="sv-btn" id="svSubmit" hidden>Tamamla ve başla</button>
          </footer>
        </form>
        <?php
        self::inline_js('gate');
    }

    /* ---------------------------------------------------------------------
     *  MODAL — anket, kullanıcının BULUNDUĞU sayfanın üstünde açılır
     *
     *  Ayrı bir /panel/anket/ sayfasına atmak akışı kopartıyordu; kayıt sonrası
     *  hangi sayfaya düşerse anket orada açılır.
     * ------------------------------------------------------------------- */

    /** @var bool Aynı istekte iki kez basılmasın (footer + şablon çağrısı) */
    private static $modal_done = false;

    public static function render_modal($user_id = 0) {
        if (self::$modal_done) return;
        $user_id = $user_id ?: get_current_user_id();
        if (!self::must_answer($user_id)) return;
        self::$modal_done = true;

        $schema = self::get_schema();
        $steps  = self::steps();
        $user   = get_userdata($user_id);
        $uname  = $user ? ($user->first_name ?: $user->display_name) : '';
        ?>
        <link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/survey.css?v=' . oes_asset_ver('assets/css/survey.css')); ?>">
        <div class="svm-ovl" id="svModal" role="dialog" aria-modal="true" aria-labelledby="svmTitle">
          <div class="svm">

            <aside class="svm-side">
              <div class="svm-side-in">
                <h2 id="svmTitle"><?php echo esc_html($schema['title']); ?></h2>
                <p class="svm-tag">
                  <?php if ($uname): ?>Merhaba <b><?php echo esc_html($uname); ?></b>, <?php endif; ?>
                  sana uygun programları önerebilmemiz için birkaç soru.
                </p>
                <ol class="svz-steps">
                  <?php $i = 0; foreach ($steps as $n => $st): $i++; ?>
                  <li class="svz-dot" data-step="<?php echo intval($n); ?>">
                    <span class="svz-n"><?php echo $i; ?></span>
                    <span class="svz-txt">
                      <b><?php echo esc_html($st['title']); ?></b>
                      <?php if (!empty($st['sub'])): ?><i><?php echo esc_html($st['sub']); ?></i><?php endif; ?>
                    </span>
                  </li>
                  <?php endforeach; ?>
                </ol>
                <div class="svm-note">
                  Cevapların yalnızca sana uygun içerik önermek için kullanılır.
                  İstediğin zaman panelinden değiştirebilirsin.
                </div>
              </div>
            </aside>

            <?php self::render_wizard($user_id); ?>
          </div>
        </div>
        <script>
        /* Modal açıkken arka plan kaymasın — yalnızca içerik kaysın. */
        (function(){
          var m = document.getElementById('svModal');
          if (!m) return;
          document.documentElement.classList.add('svm-lock');
          document.body.classList.add('svm-lock');
        })();
        </script>
        <?php
    }

    /** Tek soru. Koşullu sorular DOM'a basılır, görünürlüğü JS belirler. */
    private static function render_question($q, $answers) {
        $key   = $q['key'];
        $type  = $q['type'] ?? 'radio';
        $val   = $answers[$key] ?? ($type === 'checkbox' ? array() : '');
        $rules = wp_json_encode((array) ($q['show_if'] ?? array()));
        $req   = !empty($q['required']);
        ?>
        <div class="sv-q" data-q="<?php echo esc_attr($key); ?>"
             data-rules="<?php echo esc_attr($rules); ?>"
             data-required="<?php echo $req ? '1' : '0'; ?>"
             data-type="<?php echo esc_attr($type); ?>">
            <div class="sv-lbl"><?php echo esc_html($q['label']); ?><?php if ($req): ?><span class="sv-req">*</span><?php endif; ?></div>
            <?php if (!empty($q['help'])): ?><div class="sv-help"><?php echo esc_html($q['help']); ?></div><?php endif; ?>

            <?php if ($type === 'radio' || $type === 'checkbox'):
                $input = ($type === 'checkbox') ? 'checkbox' : 'radio';
                $name  = ($type === 'checkbox') ? $key . '[]' : $key;
                $sel   = is_array($val) ? $val : array($val); ?>
                <div class="sv-opts">
                <?php foreach ((array) ($q['options'] ?? array()) as $ok => $ol): ?>
                    <?php if (strpos($ok, '#') === 0): // '#' ile başlayan anahtar = grup başlığı ?>
                        <div class="sv-group"><?php echo esc_html($ol); ?></div>
                    <?php else: ?>
                        <label class="sv-opt">
                            <input type="<?php echo $input; ?>" name="<?php echo esc_attr($name); ?>"
                                   value="<?php echo esc_attr($ok); ?>"
                                   <?php checked(in_array($ok, $sel, true)); ?>>
                            <span><?php echo esc_html($ol); ?></span>
                        </label>
                    <?php endif; ?>
                <?php endforeach; ?>
                </div>

            <?php elseif ($type === 'textarea'): ?>
                <textarea name="<?php echo esc_attr($key); ?>" rows="4"
                          placeholder="<?php echo esc_attr($q['placeholder'] ?? ''); ?>"><?php echo esc_textarea(is_array($val) ? '' : $val); ?></textarea>

            <?php elseif ($type === 'date'): ?>
                <input type="date" name="<?php echo esc_attr($key); ?>" value="<?php echo esc_attr(is_array($val) ? '' : $val); ?>">

            <?php else: // text ?>
                <input type="text" name="<?php echo esc_attr($key); ?>"
                       placeholder="<?php echo esc_attr($q['placeholder'] ?? ''); ?>"
                       value="<?php echo esc_attr(is_array($val) ? '' : $val); ?>">
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Koşul motorunun İSTEMCİ kopyası.
     * PHP'deki rule_passes/visible_questions ile AYNI mantık — biri değişirse
     * diğeri de değişmeli, yoksa kullanıcı görmediği bir soru için hata alır.
     */
    private static function inline_js($mode) {
        /* Modal, kullanıcının BULUNDUĞU sayfanın üstünde açılıyor; kaydedince
           başka yere göndermek yerine sayfayı tazeliyoruz — modal kapanır,
           arkadaki panel/şerit güncel haliyle gelir. */
        $reload = ($mode === 'gate');
        ?>
        <script>
        (function(){
          var form = document.getElementById('svForm');
          if (!form) return;
          var AJAX  = <?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
          var NONCE = <?php echo wp_json_encode(wp_create_nonce(self::NONCE)); ?>;
          var RELOAD = <?php echo $reload ? 'true' : 'false'; ?>;
          var qs    = Array.prototype.slice.call(form.querySelectorAll('.sv-q'));

          function msgShow(text, ok){
            var m = document.getElementById('svMsg');
            if (!m) return;
            m.className = 'sv-msg' + (text ? ' show ' + (ok ? 'ok' : 'err') : '');
            m.textContent = text || '';
          }

          function valueOf(box){
            var t = box.dataset.type;
            if (t === 'checkbox') {
              return Array.prototype.map.call(
                box.querySelectorAll('input:checked'), function(i){ return i.value; });
            }
            if (t === 'radio') {
              var c = box.querySelector('input:checked');
              return c ? [c.value] : [];
            }
            var f = box.querySelector('input,textarea');
            return (f && f.value.trim() !== '') ? [f.value] : [];
          }

          function answers(){
            var a = {};
            qs.forEach(function(b){ a[b.dataset.q] = valueOf(b); });
            return a;
          }

          function passes(rule, a){
            var cur = a[rule.q] || [];
            var val = rule.val || [];
            var hit = cur.some(function(v){ return val.indexOf(v) !== -1; });
            switch (rule.op) {
              case 'filled':  return cur.length > 0;
              case 'empty':   return cur.length === 0;
              case 'not_in':  return !hit;
              default:        return hit;
            }
          }

          /* Gizlenen sorunun cevabını TEMİZLE — zincirin doğru çökmesi için şart.
             (Aksi halde "Lisans yok → Lise doldurdum" sonrası lisansı değiştirince
              lise cevabı hayalet olarak kalır ve alt sorular açık kalırdı.) */
          function clear(box){
            box.querySelectorAll('input[type=radio],input[type=checkbox]')
               .forEach(function(i){ i.checked = false; });
            box.querySelectorAll('input[type=text],input[type=date],textarea')
               .forEach(function(i){ i.value = ''; });
          }

          function evaluate(){
            // Şema sırasıyla ilerle: üstteki karar alttakini etkiler
            var a = {};
            qs.forEach(function(box){
              var rules = [];
              try { rules = JSON.parse(box.dataset.rules || '[]'); } catch(e){}
              var show = rules.every(function(r){ return passes(r, a); });
              box.hidden = !show;
              if (!show) { clear(box); a[box.dataset.q] = []; }
              else { a[box.dataset.q] = valueOf(box); }
            });
          }

          /* ---------------- SİHİRBAZ ----------------
             Adımın "aktif" olması = içinde EN AZ BİR görünür soru olması.
             Dallanma yüzünden bir adım tamamen boşalabilir (ör. lisans mezunuysa
             "Öğrenim geçmişin" adımının tüm soruları gizlenir) — o adım atlanır ve
             sayaçta da görünmez, yoksa kullanıcı boş ekranla karşılaşırdı. */
          var isWiz  = form.dataset.mode === 'gate';
          var steps  = Array.prototype.slice.call(form.querySelectorAll('.svz-step'));
          var back   = document.getElementById('svBack');
          var next   = document.getElementById('svNext');
          var submit = document.getElementById('svSubmit');
          var count  = document.getElementById('svCount');
          var cur    = 0; // aktif adımlar dizisindeki konum

          function stepOf(box){ var s = box.closest('.svz-step'); return s ? s : null; }

          function activeSteps(){
            return steps.filter(function(s){
              return qs.some(function(b){ return !b.hidden && stepOf(b) === s; });
            });
          }

          function paintAside(act, idx){
            var dots = document.querySelectorAll('.svz-dot');
            if (!dots.length) return;
            var actNums = act.map(function(s){ return s.dataset.step; });
            dots.forEach(function(d){
              var pos = actNums.indexOf(d.dataset.step);
              d.hidden = (pos === -1);            // o dal için geçersiz adım
              d.classList.toggle('done',   pos > -1 && pos <  idx);
              d.classList.toggle('active', pos > -1 && pos === idx);
            });
          }

          function paint(){
            if (!isWiz) return;
            var act = activeSteps();
            if (!act.length) return;
            if (cur > act.length - 1) cur = act.length - 1;
            steps.forEach(function(s){ s.hidden = (s !== act[cur]); });
            var last = (cur === act.length - 1);
            if (back)   back.hidden = (cur === 0);
            if (next)   next.hidden = last;
            if (submit) submit.hidden = !last;
            if (count)  count.textContent = 'Adım ' + (cur + 1) + ' / ' + act.length;
            paintAside(act, cur);
            var bar = document.getElementById('svBar');
            if (bar) bar.style.width = Math.round((cur + 1) / act.length * 100) + '%';
          }

          /** Bu adımdaki görünür + zorunlu alanlar dolu mu? */
          function stepValid(){
            var act = activeSteps();
            var sec = act[cur];
            var bad = null;
            qs.forEach(function(b){
              if (bad || b.hidden || b.dataset.required !== '1') return;
              if (stepOf(b) !== sec) return;
              if (valueOf(b).length === 0) bad = b;
            });
            if (bad) {
              bad.classList.add('miss');
              msgShow('Yıldızlı alanları doldurman gerekiyor.', false);
              bad.scrollIntoView({behavior:'smooth', block:'center'});
              return false;
            }
            form.querySelectorAll('.sv-q.miss').forEach(function(b){ b.classList.remove('miss'); });
            msgShow('');
            return true;
          }

          if (next) next.addEventListener('click', function(){
            if (!stepValid()) return;
            cur++; paint();
            window.scrollTo({top:0, behavior:'smooth'});
          });
          if (back) back.addEventListener('click', function(){
            cur--; if (cur < 0) cur = 0; paint();
            window.scrollTo({top:0, behavior:'smooth'});
          });

          var skip = document.getElementById('svSkip');
          if (skip) skip.addEventListener('click', function(){
            skip.disabled = true;
            var fd = new FormData();
            fd.append('action', 'oes_survey_skip');
            fd.append('nonce', NONCE);
            fetch(AJAX, {method:'POST', body:fd, credentials:'same-origin'})
              .then(function(r){ return r.json(); })
              .then(function(res){
                // Modal olduğu için başka sayfaya gitmeye gerek yok: tazele, kapansın
                if (res.success) location.reload();
                else { skip.disabled = false; msgShow('Şu an geçilemedi, tekrar dene.', false); }
              })
              .catch(function(){ skip.disabled = false; msgShow('Bağlantı hatası.', false); });
          });

          /* Seçili şık vurgusu: CSS'te :has(input:checked) var ama eski tarayıcılar
             desteklemiyor. Sınıfı ayrıca JS ile de basıyoruz — vurgu her yerde çalışsın. */
          function markChecked(){
            form.querySelectorAll('.sv-opt').forEach(function(l){
              var i = l.querySelector('input');
              l.classList.toggle('on', !!(i && i.checked));
            });
          }

          form.addEventListener('change', function(){ evaluate(); paint(); markChecked(); });
          form.addEventListener('input', function(e){
            if (e.target.matches('textarea,input[type=text],input[type=date]')) { evaluate(); paint(); }
          });
          evaluate();
          paint();
          markChecked();

          form.addEventListener('submit', function(e){
            e.preventDefault();
            var btn = document.getElementById('svSubmit');
            msgShow('');

            /* Görünür + zorunlu alanlar dolu mu? (sunucu ayrıca doğrular)
               Sihirbazda başka bir adımda eksik kalmışsa oraya GÖTÜR — yoksa
               kullanıcı göremediği bir alan yüzünden takılırdı. */
            var bad = null;
            qs.forEach(function(b){
              if (bad || b.hidden || b.dataset.required !== '1') return;
              if (valueOf(b).length === 0) bad = b;
            });
            if (bad) {
              if (isWiz) {
                var act = activeSteps(), sec = stepOf(bad);
                var pos = act.indexOf(sec);
                if (pos > -1 && pos !== cur) { cur = pos; paint(); }
              }
              bad.classList.add('miss');
              msgShow('Yıldızlı alanları doldurman gerekiyor.', false);
              bad.scrollIntoView({behavior:'smooth', block:'center'});
              return;
            }
            form.querySelectorAll('.sv-q.miss').forEach(function(b){ b.classList.remove('miss'); });

            var fd = new FormData();
            fd.append('action', 'oes_survey_save');
            fd.append('nonce', NONCE);
            qs.forEach(function(b){
              if (b.hidden) return;
              var v = valueOf(b);
              if (b.dataset.type === 'checkbox') {
                v.forEach(function(x){ fd.append('a[' + b.dataset.q + '][]', x); });
              } else if (v.length) {
                fd.append('a[' + b.dataset.q + ']', v[0]);
              }
            });

            btn.disabled = true;
            fetch(AJAX, {method:'POST', body:fd, credentials:'same-origin'})
              .then(function(r){ return r.json(); })
              .then(function(res){
                btn.disabled = false;
                if (res.success) {
                  msgShow((res.data && res.data.message) || 'Kaydedildi.', true);
                  if (RELOAD) {
                    form.classList.add('sv-done');
                    setTimeout(function(){ location.reload(); }, 700);
                  }
                } else {
                  msgShow((res.data && res.data.message) || 'Kaydedilemedi.', false);
                  if (res.data && res.data.missing && res.data.missing.length) {
                    var f = form.querySelector('.sv-q[data-q="' + res.data.missing[0] + '"]');
                    if (f) { f.classList.add('miss'); f.scrollIntoView({behavior:'smooth', block:'center'}); }
                  }
                }
              })
              .catch(function(){
                btn.disabled = false;
                msgShow('Bağlantı hatası.', false);
              });
          });
        })();
        </script>
        <?php
    }

    public function ajax_save() {
        check_ajax_referer(self::NONCE, 'nonce');
        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error(array('message' => 'Giriş yapmalısın.'));

        $raw = isset($_POST['a']) ? wp_unslash($_POST['a']) : array();
        if (!is_array($raw)) $raw = array();

        $answers = array();
        foreach ($raw as $k => $v) {
            $k = sanitize_key($k);
            if (is_array($v)) {
                $answers[$k] = array_values(array_map('sanitize_text_field', $v));
            } else {
                // Uzun paragraf soruları için satır sonları korunmalı
                $answers[$k] = sanitize_textarea_field($v);
            }
        }

        $res = self::save_answers($user_id, $answers);
        if (!$res['ok']) {
            if (!empty($res['db'])) {
                wp_send_json_error(array(
                    'message' => 'Cevaplar kaydedilemedi (veritabanı hazır değil). '
                               . 'Lütfen site yöneticisine bildir.',
                ));
            }
            wp_send_json_error(array(
                'message' => 'Zorunlu alanlar eksik.',
                'missing' => $res['missing'],
            ));
        }
        wp_send_json_success(array('message' => 'Cevapların kaydedildi.'));
    }

    /* =====================================================================
     *  VARSAYILAN ŞEMA — "Kariyer Rotam"
     *
     *  NOT: "Nasıl bir şey istiyorum / süre / şunu başarmak istiyorum" üçlüsü
     *  kaynak metinde her dalda tekrar ediyordu. TEK sete indirildi: dal ne
     *  olursa olsun sonda sorulur. Yoksa aynı bilgi 6 ayrı sütuna dağılır ve
     *  "1 ay içinde hedefi olanlar" gibi bir liste çıkarılamazdı.
     * ================================================================== */

    public static function default_schema() {
        $sure_opts = array(
            '1ay'    => '1 ay içinde',
            '3ay'    => '3 ay içinde',
            '1yil'   => '1 yıl içinde',
            'tarih'  => 'Belirli bir tarihe kadar',
        );
        $durum3 = array('yok' => 'Yok', 'ogrenci' => 'Öğrencisiyim', 'mezun' => 'Mezunuyum');

        $q = array();

        /* ---------------- BÖLÜM 1: KARİYER ROTAM ---------------- */

        $q[] = array(
            'key' => 'durum', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Şu anda hangisi seni tanımlıyor?',
            'options' => array(
                'calisiyorum' => 'Çalışıyorum',
                'is_ariyorum' => 'İş arıyorum',
                'ogrenci'     => 'Öğrenciyim',
            ),
        );

        // --- Çalışıyorum dalı ---
        $q[] = array(
            'key' => 'calisma_tur', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Şu anda...',
            'show_if' => array(array('q' => 'durum', 'op' => 'in', 'val' => array('calisiyorum'))),
            'options' => array(
                'ozel_ucretli' => 'Özel sektörde ücretli çalışıyorum',
                'kamu_ucretli' => 'Kamuda ücretli çalışıyorum',
                'akademisyen'  => 'Akademisyenim',
                'kendi_isim'   => 'Kendi işimdeyim',
            ),
        );
        $q[] = array(
            'key' => 'yaka', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Hangi konumda çalışıyorsun?',
            'show_if' => array(array('q' => 'calisma_tur', 'op' => 'in', 'val' => array('ozel_ucretli', 'kamu_ucretli'))),
            'options' => array('mavi' => 'Mavi yaka', 'beyaz' => 'Beyaz yaka'),
        );
        $q[] = array(
            'key' => 'ozel_hedef', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Hedefim...',
            'show_if' => array(array('q' => 'calisma_tur', 'op' => 'in', 'val' => array('ozel_ucretli'))),
            'options' => array(
                'yoneticilik'   => 'Yöneticilik rotasında ilerlemek istiyorum',
                'uzmanlasma'    => 'Uzmanlaşma rotasında ilerlemek istiyorum',
                'is_degistirme' => 'İş değiştirmek istiyorum',
            ),
        );

        // --- İş arıyorum / Öğrenciyim dalı ---
        $q[] = array(
            'key' => 'hedef_alan', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Nerede çalışmak istiyorsun?',
            'show_if' => array(array('q' => 'durum', 'op' => 'in', 'val' => array('is_ariyorum', 'ogrenci'))),
            'options' => array(
                'farketmez' => 'Özel / Kamu / Akademi / Kendi işim — tümü olur, henüz bilmiyorum',
                'ozel'      => 'Özel sektörde ücretli çalışmak istiyorum',
                'kamu'      => 'Kamuda ücretli çalışmak istiyorum',
                'akademi'   => 'Akademisyen olmak istiyorum',
                'kendi'     => 'Kendi işimi kurmak istiyorum',
            ),
        );

        // Özel sektör kırılımı
        $q[] = array(
            'key' => 'ozel_kategori', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Özel sektörde hangi alan?',
            'show_if' => array(array('q' => 'hedef_alan', 'op' => 'in', 'val' => array('ozel'))),
            'options' => array(
                'farketmez'   => 'Özel sektörde tümü olur, henüz bilmiyorum',
                'holding'     => 'Holdingler ve Kurumsal Şirketler',
                'sanayi'      => 'Sanayi, Üretim, Ağır Sanayi Kuruluşları',
                'hizmet'      => 'Hizmet, Perakende ve Lojistik Sektörü',
                'teknoloji'   => "Teknoloji Şirketleri ve Start-Up'lar",
                'danismanlik' => 'Danışmanlık, Denetim ve Reklam Ajansları',
            ),
        );
        $q[] = array(
            'key' => 'ozel_alt_holding', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Holdingler ve Kurumsal Şirketler — hangisi?',
            'show_if' => array(array('q' => 'ozel_kategori', 'op' => 'in', 'val' => array('holding'))),
            'options' => array(
                'yerli'  => 'Önde Gelen Yerli Devler',
                'global' => 'Çok Uluslu — Global Şirketler',
                'finans' => 'Finans ve Bankacılık Devleri',
            ),
        );
        $q[] = array(
            'key' => 'ozel_alt_sanayi', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Sanayi ve Üretim — hangisi?',
            'show_if' => array(array('q' => 'ozel_kategori', 'op' => 'in', 'val' => array('sanayi'))),
            'options' => array(
                'otomotiv'    => 'Otomotiv Ana ve Yan Sanayi',
                'demir_celik' => 'Demir-Çelik ve Ağır Sanayi',
                'beyaz_esya'  => 'Beyaz Eşya ve Elektronik',
                'tekstil'     => 'Tekstil ve Hazır Giyim Üretimi',
            ),
        );
        $q[] = array(
            'key' => 'ozel_alt_hizmet', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Hizmet, Perakende ve Lojistik — hangisi?',
            'show_if' => array(array('q' => 'ozel_kategori', 'op' => 'in', 'val' => array('hizmet'))),
            'options' => array(
                'perakende' => 'Hızlı Tüketim ve Perakende Zincirleri',
                'eticaret'  => 'E-Ticaret ve Kurye-Lojistik Devleri',
                'telekom'   => 'Telekomünikasyon',
            ),
        );
        $q[] = array(
            'key' => 'ozel_alt_teknoloji', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Teknoloji — hangisi?',
            'show_if' => array(array('q' => 'ozel_kategori', 'op' => 'in', 'val' => array('teknoloji'))),
            'options' => array(
                'yazilim'  => 'Büyük Teknoloji ve Yazılım Firmaları',
                'savunma'  => 'Savunma Sanayii Şirketleri',
            ),
        );
        $q[] = array(
            'key' => 'ozel_alt_danismanlik', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Danışmanlık, Denetim ve Reklam — hangisi?',
            'show_if' => array(array('q' => 'ozel_kategori', 'op' => 'in', 'val' => array('danismanlik'))),
            'options' => array(
                'bigfour'  => 'Big Four: PwC, E&Y, Deloitte, KPMG vb.',
                'strateji' => 'Stratejik Yönetim Danışmanlığı: McKinsey, BCG, Bain & Company vb.',
                'reklam'   => 'Reklam ve Medya Ajansları: Medina Turgul DDB, Punch BBDO, TBWA, Ogilvy, Havas vb.',
            ),
        );

        // Kamu kırılımı
        $q[] = array(
            'key' => 'kamu_kategori', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Kamuda hangi alan?',
            'show_if' => array(array('q' => 'hedef_alan', 'op' => 'in', 'val' => array('kamu'))),
            'options' => array(
                'farketmez'    => 'Kamuda tümü olur, henüz bilmiyorum',
                'bakanlik'     => 'Bakanlıklar',
                'kit'          => 'KİT\'ler — Genel Müdürlükler',
                'yerel'        => 'Yerel Yönetimler (Belediyeler, İl Özel İdareleri)',
                'uni_savunma'  => 'Üniversiteler ve Savunma Sanayii',
            ),
        );
        $q[] = array(
            'key' => 'kamu_alt_bakanlik', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Hangi bakanlık?',
            'show_if' => array(array('q' => 'kamu_kategori', 'op' => 'in', 'val' => array('bakanlik'))),
            'options' => array(
                'meb'      => 'Milli Eğitim Bakanlığı',
                'saglik'   => 'Sağlık Bakanlığı',
                'adalet'   => 'Adalet Bakanlığı',
                'icisleri' => 'İçişleri Bakanlığı',
                'aile'     => 'Aile ve Sosyal Hizmetler Bakanlığı',
                'diger'    => 'Diğer',
            ),
        );
        $q[] = array(
            'key' => 'kamu_alt_kit', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Hangi KİT / Genel Müdürlük?',
            'show_if' => array(array('q' => 'kamu_kategori', 'op' => 'in', 'val' => array('kit'))),
            'options' => array(
                'dsi'    => 'DSİ — Devlet Su İşleri',
                'ogm'    => 'OGM — Orman Genel Müdürlüğü',
                'tcdd'   => 'TCDD / TÜRASAŞ — Devlet Demiryolları, Raylı Sistemler',
                'enerji' => 'TEİAŞ, EÜAŞ, BOTAŞ, TPAO — Enerji Sektörü',
                'tarim'  => 'ÇAYKUR, Et ve Süt Kurumu, TİGEM — Tarım İşletmeleri',
                'diger'  => 'Diğer',
            ),
        );
        $q[] = array(
            'key' => 'kamu_alt_yerel', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Yerel yönetimlerde hangisi?',
            'show_if' => array(array('q' => 'kamu_kategori', 'op' => 'in', 'val' => array('yerel'))),
            'options' => array(
                'belediye' => 'Büyükşehir ve İlçe Belediyeleri',
                'istirak'  => 'Belediye İştirak Şirketleri',
            ),
        );
        $q[] = array(
            'key' => 'kamu_alt_uni', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Üniversite / Savunma Sanayii — hangisi?',
            'show_if' => array(array('q' => 'kamu_kategori', 'op' => 'in', 'val' => array('uni_savunma'))),
            'options' => array(
                'devlet_uni' => 'Devlet Üniversiteleri',
                'askeri'     => 'Askeri Fabrikalar ve Tersaneler (MSB)',
            ),
        );

        // Akademi — birden çok boyut (kurum türü / kadro / seviye) aynı listede
        // olduğu için ÇOKLU seçim; radyo yanlış veri üretirdi.
        $q[] = array(
            'key' => 'akademi_tercih', 'section' => 'kariyer', 'type' => 'checkbox', 'required' => true,
            'label' => 'Akademide neyi hedefliyorsun?',
            'help'  => 'Birden fazla seçebilirsin.',
            'show_if' => array(array('q' => 'hedef_alan', 'op' => 'in', 'val' => array('akademi'))),
            'options' => array(
                'farketmez'   => 'Akademide tümü olur, henüz bilmiyorum',
                'devlet_uni'  => 'Devlet Üniversiteleri',
                'vakif_uni'   => 'Vakıf Üniversiteleri',
                'arastirma'   => 'Araştırma Görevlisi (asistan) olmak istiyorum',
                'ogretim'     => 'Öğretim Görevlisi olmak istiyorum',
                'myo'         => 'Meslek yüksekokullarında (MYO)',
                'lisans'      => 'Lisans bölümlerinde',
            ),
        );

        // Kendi işim kırılımı
        $q[] = array(
            'key' => 'kendi_kategori', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Kendi işinde hangi alan?',
            'show_if' => array(array('q' => 'hedef_alan', 'op' => 'in', 'val' => array('kendi'))),
            'options' => array(
                'farketmez' => 'Kendi işimde tümü olur, henüz bilmiyorum',
                'dijital'   => 'Düşük Sermayeli ve Dijital Odaklı (Beyaz Yaka Girişim)',
                'saha'      => 'Hizmet ve Saha Odaklı (Gri & Mavi Yaka Girişim)',
                'uretim'    => 'Yüksek Sermayeli ve Fiziksel Yatırım (Üretim — İmalat)',
            ),
        );
        $q[] = array(
            'key' => 'kendi_alt_dijital', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Dijital odaklı — hangisi?',
            'show_if' => array(array('q' => 'kendi_kategori', 'op' => 'in', 'val' => array('dijital'))),
            'options' => array(
                'eticaret' => 'E-Ticaret, Dropshipping, Pazaryeri Mağazacılığı',
                'ajans'    => 'Dijital Hizmet Ajansı / Danışmanlık',
                'saas'     => 'Mikro Yazılım, SaaS (Hizmet olarak Yazılım) Geliştirme',
                'egitim'   => 'Online Eğitim ve İçerik Üretimi',
            ),
        );
        $q[] = array(
            'key' => 'kendi_alt_saha', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Hizmet ve saha odaklı — hangisi?',
            'show_if' => array(array('q' => 'kendi_kategori', 'op' => 'in', 'val' => array('saha'))),
            'options' => array(
                'teknik_servis' => 'Teknik Servis ve Bakım Hizmetleri',
                'lojistik'      => 'Butik Lojistik ve Dağıtım Ağları',
                'temizlik'      => 'Konut Dışı Temizlik Hizmetleri',
                'organizasyon'  => 'Özel Organizasyon ve Mimari Uygulamalar',
            ),
        );
        $q[] = array(
            'key' => 'kendi_alt_uretim', 'section' => 'kariyer', 'type' => 'radio',
            'label' => 'Üretim ve imalat — hangisi?',
            'show_if' => array(array('q' => 'kendi_kategori', 'op' => 'in', 'val' => array('uretim'))),
            'options' => array(
                'nis_imalat'    => 'Niş İmalat ve Atölyecilik',
                'tarim'         => 'Sürdürülebilir Tarım, Topraksız Tarım',
                'gastronomi'    => 'Gastronomi — Dark Kitchen',
                'geri_donusum'  => 'Geri Dönüşüm ve Atık Yönetimi',
            ),
        );

        // --- Ortak hedef üçlüsü (her dalın sonunda) ---
        $q[] = array(
            'key' => 'hedef_aciklama', 'section' => 'kariyer', 'type' => 'textarea', 'required' => true,
            'label' => 'Nasıl bir şey istiyorum, açıklayayım:',
            'placeholder' => 'Hedefini kendi cümlelerinle anlat…',
        );
        $q[] = array(
            'key' => 'hedef_sure', 'section' => 'kariyer', 'type' => 'radio', 'required' => true,
            'label' => 'Bunu ne zaman gerçekleştirmek istiyorsun?',
            'options' => $sure_opts,
        );
        $q[] = array(
            'key' => 'hedef_tarih', 'section' => 'kariyer', 'type' => 'date', 'required' => true,
            'label' => 'Hedef tarih',
            'show_if' => array(array('q' => 'hedef_sure', 'op' => 'in', 'val' => array('tarih'))),
        );
        $q[] = array(
            'key' => 'hedef_basari', 'section' => 'kariyer', 'type' => 'textarea', 'required' => true,
            'label' => 'ŞUNU BAŞARMAK İSTİYORUM:',
            'placeholder' => 'Somut olarak neyi başarmış olmak istiyorsun?',
        );

        /* ---------------- BÖLÜM 2: ÖĞRENİM DURUMUM ----------------
         * Azalan mantık: Lisans varsa MYO sorulmaz, MYO varsa Lise sorulmaz,
         * Lise varsa İlk-Orta sorulmaz. Yüksek lisans ise her hâlükârda sorulur.
         */

        $q[] = array(
            'key' => 'yl_durum', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Yüksek lisans',
            'options' => $durum3,
        );
        $q[] = array(
            'key' => 'yl_bolum', 'section' => 'ogrenim', 'type' => 'text', 'required' => true,
            'label' => 'Yüksek lisans bölümüm',
            'show_if' => array(array('q' => 'yl_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
        );
        $q[] = array(
            'key' => 'yl_tez', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Programın türü',
            'show_if' => array(array('q' => 'yl_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
            'options' => array('tezli' => 'Tezli', 'tezsiz' => 'Tezsiz'),
        );
        $q[] = array(
            'key' => 'yl_alan', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Yüksek lisans alanın hangi bilim dalında?',
            'show_if' => array(array('q' => 'yl_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
            'options' => array(
                'fen'     => 'Fen Bilimleri',
                'sosyal'  => 'Sosyal Bilimler',
                'saglik'  => 'Sağlık Bilimleri',
                'egitim'  => 'Eğitim Bilimleri',
                'diger'   => 'Diğer / Disiplinlerarası',
            ),
        );

        $q[] = array(
            'key' => 'lisans_durum', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Lisans',
            'options' => $durum3,
        );
        $q[] = array(
            'key' => 'lisans_okul', 'section' => 'ogrenim', 'type' => 'text', 'required' => true,
            'label' => 'Okulumun adı',
            'show_if' => array(array('q' => 'lisans_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
        );
        $q[] = array(
            'key' => 'lisans_bolum', 'section' => 'ogrenim', 'type' => 'text', 'required' => true,
            'label' => 'Bölümüm',
            'show_if' => array(array('q' => 'lisans_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
        );
        $q[] = array(
            'key' => 'lisans_alan', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Bölümün hangi alana giriyor?',
            'show_if' => array(array('q' => 'lisans_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
            'options' => array(
                '#say'          => 'SAYISAL',
                'muhendislik'   => 'Mühendislik',
                'saglik_tip'    => 'Sağlık ve Tıp Bilimleri',
                'temel_fen'     => 'Temel Fen Bilimleri',
                'tasarim_mim'   => 'Tasarım ve Mimarlık',
                '#ea'           => 'EŞİT AĞIRLIK',
                'hukuk'         => 'Hukuk',
                'iibf'          => 'İktisadi ve İdari Bilimler',
                'sosyal_dav'    => 'Sosyal ve Davranışsal Bilimler',
                'egitim_ea'     => 'Eğitim (EA öğretmenlikleri)',
                '#soz'          => 'SÖZEL',
                'iletisim'      => 'İletişim ve Medya',
                'insani'        => 'İnsani Bilimler ve Kültür',
                'egitim_soz'    => 'Eğitim (SÖZ öğretmenlikleri)',
                '#dil'          => 'DİL',
                'filoloji'      => 'Filolojiler',
                'egitim_dil'    => 'Eğitim (DİL öğretmenlikleri)',
                '#oys'          => 'ÖZEL YETENEK',
                'guzel_sanat'   => 'Güzel Sanatlar',
                'sahne_muzik'   => 'Sahne Sanatları ve Müzik',
                'spor'          => 'Spor Bilimleri',
            ),
        );

        // MYO — yalnızca lisans YOKSA
        $q[] = array(
            'key' => 'myo_durum', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Meslek Yüksekokulu (MYO)',
            'show_if' => array(array('q' => 'lisans_durum', 'op' => 'in', 'val' => array('yok'))),
            'options' => $durum3,
        );
        $q[] = array(
            'key' => 'myo_okul', 'section' => 'ogrenim', 'type' => 'text', 'required' => true,
            'label' => 'Okulumun adı',
            'show_if' => array(array('q' => 'myo_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
        );
        $q[] = array(
            'key' => 'myo_brans', 'section' => 'ogrenim', 'type' => 'text', 'required' => true,
            'label' => 'Branşım',
            'show_if' => array(array('q' => 'myo_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
        );
        $q[] = array(
            'key' => 'myo_tur', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'MYO türü',
            'show_if' => array(array('q' => 'myo_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
            'options' => array(
                'teknik'     => 'Teknik Bilimler MYO',
                'saglik'     => 'Sağlık Hizmetleri MYO',
                'sosyal'     => 'Sosyal Bilimler MYO',
                'adalet'     => 'Adalet MYO',
                'tasarim'    => 'Tasarım, Sanat ve Medya MYO',
                'ulastirma'  => 'Ulaştırma ve Denizcilik MYO',
                'tarim'      => 'Tarım, Gıda ve Hayvancılık MYO',
                'polis'      => 'Polis MYO',
                'astsubay'   => 'Astsubay MYO',
            ),
        );

        // Lise — lisans YOK ve MYO YOK ise
        $lise_gate = array(
            array('q' => 'lisans_durum', 'op' => 'in', 'val' => array('yok')),
            array('q' => 'myo_durum',    'op' => 'in', 'val' => array('yok')),
        );
        $q[] = array(
            'key' => 'lise_durum', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Lise',
            'show_if' => $lise_gate,
            'options' => $durum3,
        );
        $q[] = array(
            'key' => 'lise_okul', 'section' => 'ogrenim', 'type' => 'text', 'required' => true,
            'label' => 'Lisemin adı',
            'show_if' => array(array('q' => 'lise_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
        );
        $q[] = array(
            'key' => 'lise_brans', 'section' => 'ogrenim', 'type' => 'text',
            'label' => 'Branşım',
            'show_if' => array(array('q' => 'lise_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
        );
        $q[] = array(
            'key' => 'lise_tur', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Lise türü',
            'show_if' => array(array('q' => 'lise_durum', 'op' => 'in', 'val' => array('ogrenci', 'mezun'))),
            'options' => array(
                'anadolu'      => 'Anadolu Lisesi',
                'fen'          => 'Fen Lisesi',
                'sosyal'       => 'Sosyal Bilimler Lisesi',
                'imam_hatip'   => 'Anadolu İmam Hatip Lisesi',
                'cok_programli'=> 'Çok Programlı Anadolu Lisesi',
                'mtal'         => 'Mesleki ve Teknik Anadolu Lisesi (MTAL)',
                'mesem'        => 'Çıraklık Okulu — Mesleki Eğitim Merkezi (MESEM)',
                'tematik_mtal' => 'Tematik Mesleki ve Teknik Anadolu Lisesi',
                'ozel_statulu' => 'Özel Statülü ve Protokollü Meslek Lisesi',
                'guzel_sanat'  => 'Güzel Sanatlar Lisesi',
                'spor'         => 'Spor Lisesi',
                'acik'         => 'Açık Öğretim Lisesi / Akşam Lisesi',
                'diger'        => 'Diğer',
            ),
        );
        $q[] = array(
            'key' => 'lise_mtal_program', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'MTAL programın',
            'show_if' => array(array('q' => 'lise_tur', 'op' => 'in', 'val' => array('mtal'))),
            'options' => array(
                'amp' => 'Anadolu Meslek Programı (AMP)',
                'atp' => 'Anadolu Teknik Programı (ATP)',
            ),
        );

        // İlk-Orta — lise de yoksa
        $q[] = array(
            'key' => 'ilkorta_durum', 'section' => 'ogrenim', 'type' => 'radio', 'required' => true,
            'label' => 'Öğrenim durumun',
            'show_if' => array(array('q' => 'lise_durum', 'op' => 'in', 'val' => array('yok'))),
            'options' => array(
                'ortaokul' => 'Ortaokul mezunuyum',
                'ilkokul'  => 'İlkokul mezunuyum',
            ),
        );
        $q[] = array(
            'key' => 'ilkorta_okul', 'section' => 'ogrenim', 'type' => 'text',
            'label' => 'Okulumun adı',
            'show_if' => array(array('q' => 'ilkorta_durum', 'op' => 'filled', 'val' => array())),
        );

        /* ---------------- SİHİRBAZ ADIMLARI ----------------
         * Zorunlu anket tek uzun sayfa yerine adım adım gösterilir. Eşleme burada
         * TEK yerde duruyor; her soruya elle 'step' yazmaya gerek yok.
         * Listede olmayan soru son adıma düşer (yeni eklenenler kaybolmasın).
         */
        $step_map = array(
            1 => array('durum', 'calisma_tur', 'yaka'),
            2 => array('ozel_hedef', 'hedef_alan',
                       'ozel_kategori', 'ozel_alt_holding', 'ozel_alt_sanayi', 'ozel_alt_hizmet',
                       'ozel_alt_teknoloji', 'ozel_alt_danismanlik',
                       'kamu_kategori', 'kamu_alt_bakanlik', 'kamu_alt_kit', 'kamu_alt_yerel', 'kamu_alt_uni',
                       'akademi_tercih',
                       'kendi_kategori', 'kendi_alt_dijital', 'kendi_alt_saha', 'kendi_alt_uretim'),
            3 => array('hedef_aciklama', 'hedef_sure', 'hedef_tarih', 'hedef_basari'),
            4 => array('yl_durum', 'yl_bolum', 'yl_tez', 'yl_alan',
                       'lisans_durum', 'lisans_okul', 'lisans_bolum', 'lisans_alan'),
            5 => array('myo_durum', 'myo_okul', 'myo_brans', 'myo_tur',
                       'lise_durum', 'lise_okul', 'lise_brans', 'lise_tur', 'lise_mtal_program',
                       'ilkorta_durum', 'ilkorta_okul'),
        );
        foreach ($q as &$item) {
            $item['step'] = 5;
            foreach ($step_map as $n => $keys) {
                if (in_array($item['key'], $keys, true)) { $item['step'] = $n; break; }
            }
        }
        unset($item); // referansı bırak — sonraki foreach'ler son öğeyi ezmesin

        return array(
            'key'      => 'kariyer_rotam',
            'title'    => 'Kariyer Rotam',
            'version'  => 1,
            'intro'    => 'Sana en uygun programları önerebilmemiz için birkaç soru. '
                        . 'Cevaplarını istediğin zaman panelinden güncelleyebilirsin.',
            'sections' => array(
                'kariyer' => 'Kariyer Rotam',
                'ogrenim' => 'Öğrenim Durumum',
            ),
            'steps' => array(
                1 => array('title' => 'Şu an neredesin?',        'sub' => 'Mevcut durumun'),
                2 => array('title' => 'Nereye gitmek istiyorsun?', 'sub' => 'Hedef alanın'),
                3 => array('title' => 'Planın ne?',               'sub' => 'Süre ve başarı hedefin'),
                4 => array('title' => 'Öğrenim durumun',          'sub' => 'Lisans ve üstü'),
                5 => array('title' => 'Öğrenim geçmişin',         'sub' => 'Önceki eğitimlerin'),
            ),
            'questions' => $q,
        );
    }
}

OES_Surveys::instance();
