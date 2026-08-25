<?php
/**
 * Fabrika Okulu — Anket yönetimi (sonuçlar + segmentasyon + soru düzenleyici)
 *
 * İKİ YÜZEY, TEK KOD:
 * - wp-admin → Anketler (kendi üst menüsü)      (manage_options)
 * - Eğitmen paneli → Anketler view              (süper eğitmen)
 * Belgeler sisteminde kurulan desenin aynısı: render_* metotları statik, iki
 * yüzey de aynı çıktıyı basar; ayrışma olmasın.
 *
 * SORU DÜZENLEYİCİ yalnızca yöneticide — anket tanımını değiştirmek tüm
 * kullanıcıları yeniden ankete düşürebilir, bu süper eğitmene açılmamalı.
 *
 * @package Fabrika Okulu
 */

if (!defined('ABSPATH')) exit;

class OES_Surveys_Admin {

    const NONCE    = 'oes_survey_admin';
    const PER_PAGE = 30;

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', array($this, 'menu'), 20);
        add_filter('submenu_file', array($this, 'highlight_submenu'));
        add_action('admin_enqueue_scripts', array($this, 'assets'));
        add_action('admin_post_fabo_survey_schema', array($this, 'handle_schema_save'));
        add_action('admin_post_fabo_survey_export', array($this, 'handle_export'));
        add_action('admin_post_fabo_survey_reset',  array($this, 'handle_reset'));
    }

    /**
     * Bir kullanıcının anketini sıfırla — cevaplar silinir, yeniden sorulur.
     * Test sırasında aynı kullanıcıyla akışı tekrar tekrar görebilmek için.
     */
    public function handle_reset() {
        if (!current_user_can('manage_options')) wp_die('Yetkiniz yok.');
        check_admin_referer(self::NONCE);

        $uid = intval($_GET['uid'] ?? 0);
        if ($uid) OES_Surveys::reset_user($uid);

        wp_safe_redirect(add_query_arg(
            array('page' => 'oes-anketler', 'uid' => $uid, 'sifirlandi' => 1),
            admin_url('admin.php')
        ));
        exit;
    }

    /**
     * survey.css'in admin bölümü. fabo-admin.css'i OES_Admin zaten oes-* sayfalara
     * yüklüyor; bu dosya onun ÜSTÜNE gelmeli (değişkenler oradan çözülüyor).
     */
    public function assets() {
        $page = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
        if ($page !== 'oes-anketler') return;
        wp_enqueue_style('oes-survey', OES_PLUGIN_URL . 'assets/css/survey.css',
            array('fabo-admin'), oes_asset_ver('assets/css/survey.css'));
    }

    /**
     * Anketler ARTIK KENDİ ÜST MENÜSÜ — "Online Kurs Sistemi" altından çıkarıldı.
     * Anket, kursa bağlı bir araç değil; kullanıcıyı tanıma/segmentasyon aracı.
     * Alt menüler doğrudan sekmelere gider (Sonuçlar / Anket Tanımı) ki soru
     * düzenleyiciye wp-admin'den tek tıkla ulaşılsın.
     */
    public function menu() {
        add_menu_page(
            'Anketler', 'Anketler', 'manage_options', 'oes-anketler',
            array($this, 'render_admin'), 'dashicons-forms', 31
        );
        add_submenu_page(
            'oes-anketler', 'Sonuçlar', 'Sonuçlar',
            'manage_options', 'oes-anketler', array($this, 'render_admin')
        );
        // Slug yerine URL: WP alt menüyü doğrudan o sekmeye bağlar.
        add_submenu_page(
            'oes-anketler', 'Anket Tanımı', 'Anket Tanımı',
            'manage_options', 'admin.php?page=oes-anketler&sekme=tanim'
        );
    }

    /**
     * Alt menü URL ile eklendiği için WP hangi satırın aktif olduğunu bilemiyor;
     * ?sekme=tanim'dayken vurguyu "Anket Tanımı" satırına taşı.
     */
    public function highlight_submenu($file) {
        $page = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
        if ($page !== 'oes-anketler') return $file;
        $tab = isset($_GET['sekme']) ? sanitize_key($_GET['sekme']) : '';
        return $tab === 'tanim' ? 'admin.php?page=oes-anketler&sekme=tanim' : 'oes-anketler';
    }

    /** Sonuçları kim görebilir? Yönetici + süper eğitmen (kullanıcı kararı). */
    public static function can_view() {
        if (current_user_can('manage_options')) return true;
        return class_exists('OES_Teacher') && OES_Teacher::is_super_teacher();
    }

    /** Anket tanımını yalnızca yönetici değiştirir. */
    public static function can_edit_schema() {
        return current_user_can('manage_options');
    }

    /* =====================================================================
     *  SORGU — filtreli kullanıcı listesi
     * ================================================================== */

    /**
     * Aktif filtreler: ?f[question_key]=value  (+ ?durum=, ?s=)
     * @return array
     */
    public static function active_filters() {
        $f = isset($_GET['f']) ? (array) wp_unslash($_GET['f']) : array();
        $out = array();
        foreach ($f as $k => $v) {
            $k = sanitize_key($k);
            $v = sanitize_text_field($v);
            if ($k !== '' && $v !== '') $out[$k] = $v;
        }
        return $out;
    }

    /**
     * Kullanıcıları getir.
     *
     * @return array ['rows'=>[], 'total'=>int]
     */
    public static function query_users($filters, $status, $search, $paged) {
        global $wpdb;

        $skey  = OES_Surveys::survey_key();
        $ver   = OES_Surveys::version();
        $meta  = OES_Surveys::META_PREFIX . $skey;
        $table = OES_Surveys::table();

        $where  = array('1=1');
        $params = array();

        // Cevap filtreleri — her biri ayrı EXISTS (VE'lenir).
        // Çoklu seçim cevabı JSON dizi olarak saklanır; hem düz eşitlik hem
        // dizi içi arama denenir, yoksa checkbox filtreleri hiç eşleşmezdi.
        foreach ($filters as $qk => $val) {
            $where[]  = "EXISTS (SELECT 1 FROM {$table} a WHERE a.user_id = u.ID
                          AND a.survey_key = %s AND a.question_key = %s
                          AND (a.value = %s OR a.value LIKE %s))";
            $params[] = $skey;
            $params[] = $qk;
            $params[] = $val;
            $params[] = '%' . $wpdb->esc_like('"' . $val . '"') . '%';
        }

        // Tamamlama durumu
        if ($status === 'done') {
            $where[]  = "(CAST(m.meta_value AS UNSIGNED) >= %d)";
            $params[] = $ver;
        } elseif ($status === 'pending') {
            // Hiç doldurmamış VEYA sürümü eski
            $where[]  = "(m.meta_value IS NULL OR CAST(m.meta_value AS UNSIGNED) < %d)";
            $params[] = $ver;
        } elseif ($status === 'never') {
            $where[] = "(m.meta_value IS NULL)";
        }

        if ($search !== '') {
            $like     = '%' . $wpdb->esc_like($search) . '%';
            $where[]  = "(u.display_name LIKE %s OR u.user_email LIKE %s OR u.user_login LIKE %s)";
            $params[] = $like; $params[] = $like; $params[] = $like;
        }

        $where_sql = implode(' AND ', $where);
        $offset    = max(0, ($paged - 1) * self::PER_PAGE);

        $sql = "SELECT SQL_CALC_FOUND_ROWS u.ID, u.display_name, u.user_email, u.user_registered,
                       m.meta_value AS done_v
                FROM {$wpdb->users} u
                LEFT JOIN {$wpdb->usermeta} m ON m.user_id = u.ID AND m.meta_key = %s
                WHERE {$where_sql}
                ORDER BY u.user_registered DESC
                LIMIT %d OFFSET %d";

        // prepare KONUMA göre bağlar: meta_key en başta, limit/offset en sonda.
        $all = array_merge(array($meta), $params, array(self::PER_PAGE, $offset));
        $rows = $wpdb->get_results($wpdb->prepare($sql, $all));
        $total = (int) $wpdb->get_var('SELECT FOUND_ROWS()');

        return array('rows' => $rows, 'total' => $total);
    }

    /**
     * Üstteki KPI kartları için sayılar.
     * NOT: "Kayıtlı kullanıcı" tüm WP kullanıcılarıdır (yönetici/eğitmen dahil);
     * liste de aynı kümeyi gösterdiği için sayılar tutarlı kalıyor.
     */
    public static function stats() {
        global $wpdb;
        $meta = OES_Surveys::META_PREFIX . OES_Surveys::survey_key();
        $ver  = OES_Surveys::version();

        $total   = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->users}");
        $started = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->usermeta} WHERE meta_key = %s AND meta_value <> ''", $meta));
        $done    = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->usermeta}
             WHERE meta_key = %s AND CAST(meta_value AS UNSIGNED) >= %d", $meta, $ver));

        return array(
            'total' => $total,
            'done'  => $done,
            'stale' => max(0, $started - $done), // eski sürümü doldurmuş
            'never' => max(0, $total - $started),
            'rate'  => $total ? (int) round($done / $total * 100) : 0,
        );
    }

    /**
     * Listede gösterilecek özet sütun(lar).
     * Kullanıcı isteği: liste sade kalsın — Kullanıcı / Durum / "Şu anda hangisi
     * seni tanımlıyor" / Kayıt / Detay. Gerisi detay ekranında.
     */
    public static function summary_keys() {
        return apply_filters('fabo_survey_summary_keys', array('durum'));
    }

    /* =====================================================================
     *  EKRAN — SONUÇLAR
     * ================================================================== */

    /**
     * @param string $base_url Filtre/sayfa linklerinin kurulacağı temel adres
     *                         (wp-admin sayfası ya da eğitmen panel view'u).
     */
    public static function render_results($base_url) {
        $schema   = OES_Surveys::get_schema();
        $filters  = self::active_filters();
        $status   = isset($_GET['durum']) ? sanitize_key($_GET['durum']) : '';
        $search   = isset($_GET['s']) ? sanitize_text_field(wp_unslash($_GET['s'])) : '';
        $paged    = max(1, intval($_GET['sayfa'] ?? 1));
        $uid      = intval($_GET['uid'] ?? 0);

        if ($uid) { self::render_user_detail($uid, $base_url); return; }

        $res   = self::query_users($filters, $status, $search, $paged);
        $rows  = $res['rows'];
        $total = $res['total'];
        $pages = (int) ceil($total / self::PER_PAGE);
        $ver   = OES_Surveys::version();

        // Filtrelenebilir sorular: yalnızca şıklı olanlar (metin alanı filtrelenmez)
        $filterable = array_filter($schema['questions'], function ($q) {
            return in_array(($q['type'] ?? ''), array('radio', 'checkbox'), true) && !empty($q['options']);
        });
        $st      = self::stats();
        $nfilter = count($filters) + ($status !== '' ? 1 : 0) + ($search !== '' ? 1 : 0);
        ?>
        <div class="fabo-kpis">
          <div class="fabo-kpi"><div class="ic ic-navy"><span class="dashicons dashicons-groups"></span></div>
            <div><div class="v"><?php echo intval($st['total']); ?></div><div class="l">Kayıtlı kullanıcı</div></div></div>
          <div class="fabo-kpi"><div class="ic ic-green"><span class="dashicons dashicons-yes-alt"></span></div>
            <div><div class="v"><?php echo intval($st['done']); ?></div><div class="l">Anketi tamamladı</div></div></div>
          <div class="fabo-kpi"><div class="ic ic-amber"><span class="dashicons dashicons-update"></span></div>
            <div><div class="v"><?php echo intval($st['stale']); ?></div><div class="l">Güncelleme bekliyor</div></div></div>
          <div class="fabo-kpi"><div class="ic ic-sky"><span class="dashicons dashicons-chart-pie"></span></div>
            <div><div class="v">%<?php echo intval($st['rate']); ?></div><div class="l">Tamamlama oranı</div></div></div>
        </div>

        <?php // Filtreler katlanabilir: 20+ açılır kutu her zaman açık durunca ekran boğuluyordu ?>
        <details class="sv-filterbox"<?php echo $nfilter ? ' open' : ''; ?>>
          <summary>
            Filtreler
            <?php if ($nfilter): ?><span class="sv-fcount"><?php echo intval($nfilter); ?> aktif</span><?php endif; ?>
          </summary>
          <div class="sv-fbody">
            <form method="get">
              <?php foreach (self::preserved_query_args() as $k => $v): ?>
                <input type="hidden" name="<?php echo esc_attr($k); ?>" value="<?php echo esc_attr($v); ?>">
              <?php endforeach; ?>

              <div class="sv-frow">
                <input type="search" name="s" value="<?php echo esc_attr($search); ?>" placeholder="Ad, e-posta veya kullanıcı adı…">
                <select name="durum">
                  <option value="">Tüm kullanıcılar</option>
                  <option value="done"    <?php selected($status, 'done'); ?>>Anketi tamamlayanlar</option>
                  <option value="pending" <?php selected($status, 'pending'); ?>>Eksik olanlar (hiç / güncelleme bekleyen)</option>
                  <option value="never"   <?php selected($status, 'never'); ?>>Hiç doldurmayanlar</option>
                </select>
                <button type="submit" class="button button-primary">Filtrele</button>
                <?php if ($nfilter): ?>
                  <a class="button" href="<?php echo esc_url($base_url); ?>">Temizle</a>
                <?php endif; ?>
              </div>

              <div class="sv-fgrid">
                <?php foreach ($filterable as $q): ?>
                  <label class="sv-fq">
                    <span title="<?php echo esc_attr($q['label']); ?>"><?php echo esc_html($q['label']); ?></span>
                    <select name="f[<?php echo esc_attr($q['key']); ?>]">
                      <option value="">— hepsi —</option>
                      <?php foreach ($q['options'] as $ok => $ol): ?>
                        <?php if (strpos($ok, '#') === 0) continue; ?>
                        <option value="<?php echo esc_attr($ok); ?>" <?php selected($filters[$q['key']] ?? '', $ok); ?>>
                          <?php echo esc_html($ol); ?>
                        </option>
                      <?php endforeach; ?>
                    </select>
                  </label>
                <?php endforeach; ?>
              </div>
            </form>
          </div>
        </details>

        <div class="fabo-panel">
          <div class="sv-resbar">
            <strong><?php echo intval($total); ?></strong> kullanıcı listeleniyor.
            <?php if (current_user_can('manage_options')): ?>
              <span class="sp"></span>
              <a class="button" href="<?php echo esc_url(self::export_url()); ?>">
                <span class="dashicons dashicons-download" style="vertical-align:-4px"></span> CSV indir
              </a>
            <?php endif; ?>
          </div>

          <?php if (empty($rows)): ?>
            <div class="fabo-empty"><p>Bu filtrelerle eşleşen kullanıcı yok.</p></div>
          <?php else: ?>
          <div class="fabo-tablewrap">
          <table class="fabo-table">
            <thead>
              <tr>
                <th>Kullanıcı</th>
                <th>Durum</th>
                <?php foreach (self::summary_keys() as $sk):
                    $sq = OES_Surveys::question($sk); if (!$sq) continue; ?>
                  <th><?php echo esc_html($sq['label']); ?></th>
                <?php endforeach; ?>
                <th>Kayıt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
            <?php
            // Sayfadaki tüm cevaplar TEK sorguda (satır başına sorgu atmamak için)
            $bulk = OES_Surveys::get_answers_bulk(wp_list_pluck($rows, 'ID'));
            foreach ($rows as $r):
              $ans  = $bulk[intval($r->ID)] ?? array();
              $done = intval($r->done_v);
              if ($done >= $ver) { $badge = '<span class="fabo-chip c-green">Tamamladı</span>'; }
              elseif ($done > 0) { $badge = '<span class="fabo-chip c-amber">Güncelleme bekliyor</span>'; }
              else               { $badge = '<span class="fabo-chip c-red">Doldurmadı</span>'; }
            ?>
              <tr>
                <td>
                  <div class="fabo-person">
                    <span class="fabo-av"><?php echo esc_html(mb_substr($r->display_name, 0, 1)); ?></span>
                    <span style="min-width:0">
                      <span class="n"><?php echo esc_html($r->display_name); ?></span>
                      <span class="e"><?php echo esc_html($r->user_email); ?></span>
                    </span>
                  </div>
                </td>
                <td><?php echo $badge; ?></td>
                <?php foreach (self::summary_keys() as $sk):
                    if (!OES_Surveys::question($sk)) continue;
                    $v = $ans[$sk] ?? ''; ?>
                  <td><?php echo esc_html(self::pretty($sk, $v)); ?></td>
                <?php endforeach; ?>
                <td><?php echo esc_html(date_i18n('d M Y', strtotime($r->user_registered))); ?></td>
                <td><a class="button button-small" href="<?php echo esc_url(add_query_arg('uid', $r->ID, $base_url)); ?>">Detay</a></td>
              </tr>
            <?php endforeach; ?>
            </tbody>
          </table>
          </div>

          <?php if ($pages > 1): ?>
            <div class="sv-pager">
              <?php for ($i = 1; $i <= $pages; $i++): ?>
                <?php if ($i === $paged): ?>
                  <span class="cur"><?php echo $i; ?></span>
                <?php else: ?>
                  <a href="<?php echo esc_url(add_query_arg('sayfa', $i)); ?>"><?php echo $i; ?></a>
                <?php endif; ?>
              <?php endfor; ?>
            </div>
          <?php endif; ?>
          <?php endif; ?>
        </div>
        <?php
    }

    /** Değeri okunur metne çevir (checkbox dizileri virgülle). */
    public static function pretty($qkey, $value) {
        if (is_array($value)) {
            $out = array();
            foreach ($value as $v) $out[] = OES_Surveys::option_label($qkey, $v);
            return implode(', ', $out);
        }
        if ($value === '' || $value === null) return '—';
        return OES_Surveys::option_label($qkey, $value);
    }

    private static function render_user_detail($uid, $base_url) {
        $u = get_userdata($uid);
        if (!$u) { echo '<div class="fabo-empty">Kullanıcı bulunamadı.</div>'; return; }

        $ans    = OES_Surveys::get_answers($uid);
        $schema = OES_Surveys::get_schema();
        $ver    = OES_Surveys::version();
        $done   = intval(get_user_meta($uid, OES_Surveys::META_PREFIX . OES_Surveys::survey_key(), true));

        // Hangi sorular bu kişi için geçerliydi? (dallanma sonrası)
        $probe   = $ans;
        $visible = OES_Surveys::visible_questions($probe);

        $courses = class_exists('OES_My_Account') ? OES_My_Account::get_user_completed_courses($uid) : array();

        if ($done >= $ver)                     { $badge = '<span class="fabo-chip c-green">Tamamladı</span>'; }
        elseif ($done > 0)                     { $badge = '<span class="fabo-chip c-amber">Güncelleme bekliyor (v' . $done . ')</span>'; }
        elseif (OES_Surveys::has_skipped($uid)) { $badge = '<span class="fabo-chip c-amber">Erteledi</span>'; }
        else                                   { $badge = '<span class="fabo-chip c-red">Doldurmadı</span>'; }

        // Testte aynı kullanıcıyla anketi tekrar tekrar görebilmek için
        $reset_url = wp_nonce_url(add_query_arg(array(
            'action' => 'fabo_survey_reset', 'uid' => $uid,
        ), admin_url('admin-post.php')), self::NONCE);
        ?>
        <div class="fabo-panel">
          <p><a class="button" href="<?php echo esc_url(remove_query_arg('uid', $base_url)); ?>">← Listeye dön</a></p>

          <div class="fabo-head">
            <div>
              <h2><?php echo esc_html($u->display_name); ?> <?php echo $badge; ?></h2>
              <p>Anket sürümü <?php echo intval($ver); ?> · Kullanıcı #<?php echo intval($uid); ?></p>
            </div>
            <?php if (current_user_can('manage_options')): ?>
            <div class="fabo-head-actions">
              <a class="button" href="<?php echo esc_url(get_edit_user_link($uid)); ?>">Kullanıcı profili</a>
              <a class="button" href="<?php echo esc_url($reset_url); ?>"
                 onclick="return confirm('Bu kullanıcının anket cevapları SİLİNECEK ve anket yeniden sorulacak. Onaylıyor musun?');">
                 Anketi sıfırla</a>
            </div>
            <?php endif; ?>
          </div>

          <h3 class="sv-dsec">Hesap bilgileri</h3>
          <table class="fabo-table"><tbody>
            <tr><th style="width:34%">Ad soyad</th><td><?php echo esc_html(trim($u->first_name . ' ' . $u->last_name) ?: '—'); ?></td></tr>
            <tr><th>Görünen isim</th><td><?php echo esc_html($u->display_name); ?></td></tr>
            <tr><th>E-posta</th><td><a href="mailto:<?php echo esc_attr($u->user_email); ?>"><?php echo esc_html($u->user_email); ?></a></td></tr>
            <tr><th>Kullanıcı adı</th><td><?php echo esc_html($u->user_login); ?></td></tr>
            <?php $phone = get_user_meta($uid, 'billing_phone', true); if ($phone): ?>
            <tr><th>Telefon</th><td><?php echo esc_html($phone); ?></td></tr>
            <?php endif; ?>
            <tr><th>Rol</th><td><?php echo esc_html(implode(', ', (array) $u->roles) ?: '—'); ?></td></tr>
            <tr><th>Kayıt tarihi</th><td><?php echo esc_html(date_i18n('d M Y H:i', strtotime($u->user_registered))); ?></td></tr>
            <tr><th>Kayıtlı eğitimler</th>
              <td>
                <?php if (empty($courses)) { echo '—'; } else {
                    $names = array();
                    foreach ($courses as $cid) { $t = get_the_title($cid); if ($t) $names[] = $t; }
                    echo esc_html($names ? implode(' · ', $names) : count($courses) . ' eğitim');
                } ?>
              </td>
            </tr>
          </tbody></table>

          <?php if (empty($ans)): ?>
            <h3 class="sv-dsec">Anket</h3>
            <div class="fabo-empty"><p>Bu kullanıcı anketi henüz doldurmadı.</p></div>
          <?php else: ?>
            <?php foreach ((array) $schema['sections'] as $skey => $stitle): ?>
              <?php
              // Bu bölümde bu kişiye sorulmuş soru yoksa başlığı hiç basma
              $rowsq = array_filter($schema['questions'], function ($q) use ($skey, $visible) {
                  return ($q['section'] ?? '') === $skey && in_array($q['key'], $visible, true);
              });
              if (empty($rowsq)) continue;
              ?>
              <h3 class="sv-dsec"><?php echo esc_html($stitle); ?></h3>
              <table class="fabo-table">
                <tbody>
                <?php foreach ($rowsq as $q): $v = $ans[$q['key']] ?? ''; ?>
                  <tr>
                    <th style="width:34%"><?php echo esc_html($q['label']); ?></th>
                    <td><?php echo nl2br(esc_html(self::pretty($q['key'], $v))); ?></td>
                  </tr>
                <?php endforeach; ?>
                </tbody>
              </table>
            <?php endforeach; ?>
          <?php endif; ?>
        </div>
        <?php
    }

    /** Filtreleri koruyarak CSV adresi üret. */
    private static function export_url() {
        $args = array('action' => 'fabo_survey_export', '_wpnonce' => wp_create_nonce(self::NONCE));
        foreach (self::active_filters() as $k => $v) $args['f'][$k] = $v;
        if (!empty($_GET['durum'])) $args['durum'] = sanitize_key($_GET['durum']);
        if (!empty($_GET['s']))     $args['s'] = sanitize_text_field(wp_unslash($_GET['s']));
        return add_query_arg($args, admin_url('admin-post.php'));
    }

    /** Form gönderiminde korunacak ekran parametreleri (page / view vb.). */
    private static function preserved_query_args() {
        $keep = array();
        foreach (array('page', 'sekme') as $k) {
            if (!empty($_GET[$k])) $keep[$k] = sanitize_key($_GET[$k]);
        }
        return $keep;
    }

    /* =====================================================================
     *  CSV
     * ================================================================== */

    public function handle_export() {
        if (!current_user_can('manage_options')) wp_die('Yetkiniz yok.');
        check_admin_referer(self::NONCE);

        $schema  = OES_Surveys::get_schema();
        $filters = self::active_filters();
        $status  = isset($_GET['durum']) ? sanitize_key($_GET['durum']) : '';
        $search  = isset($_GET['s']) ? sanitize_text_field(wp_unslash($_GET['s'])) : '';

        // Dışa aktarımda sayfalama yok: geçici olarak büyük bir sayfa çek
        $rows = array();
        $page = 1;
        do {
            $res = self::query_users($filters, $status, $search, $page);
            $rows = array_merge($rows, $res['rows']);
            $page++;
        } while (count($rows) < $res['total'] && $page < 500); // 500 sayfa = güvenlik freni

        nocache_headers();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename=anket-' . date('Y-m-d') . '.csv');

        $out = fopen('php://output', 'w');
        fwrite($out, "\xEF\xBB\xBF"); // Excel'in Türkçe karakterleri doğru okuması için BOM

        $head = array('Ad Soyad', 'E-posta', 'Kayıt tarihi', 'Anket durumu');
        foreach ($schema['questions'] as $q) $head[] = $q['label'];
        fputcsv($out, $head, ';');

        $ver  = OES_Surveys::version();
        $bulk = OES_Surveys::get_answers_bulk(wp_list_pluck($rows, 'ID'));
        foreach ($rows as $r) {
            $ans  = $bulk[intval($r->ID)] ?? array();
            $done = intval($r->done_v);
            $line = array(
                $r->display_name,
                $r->user_email,
                date_i18n('Y-m-d', strtotime($r->user_registered)),
                $done >= $ver ? 'Tamamladı' : ($done > 0 ? 'Güncelleme bekliyor' : 'Doldurmadı'),
            );
            foreach ($schema['questions'] as $q) {
                $v = $ans[$q['key']] ?? '';
                $line[] = ($v === '' || $v === array()) ? '' : self::pretty($q['key'], $v);
            }
            fputcsv($out, $line, ';');
        }
        fclose($out);
        exit;
    }

    /* =====================================================================
     *  wp-admin ana ekran
     * ================================================================== */

    public function render_admin() {
        if (!self::can_view()) wp_die('Yetkiniz yok.');
        $tab  = isset($_GET['sekme']) ? sanitize_key($_GET['sekme']) : 'sonuclar';
        $base = admin_url('admin.php?page=oes-anketler');
        $schema = OES_Surveys::get_schema();
        ?>
        <div class="wrap">
          <div class="fabo-wrap">
            <div class="fabo-head">
              <div>
                <h1>Anketler</h1>
                <p><?php echo esc_html($schema['title']); ?> — sürüm <?php echo intval($schema['version']); ?>.
                   Kullanıcıları cevaplarına göre filtreleyip liste çıkarabilirsin.</p>
              </div>
            </div>

            <div class="fabo-tabs">
              <a class="<?php echo $tab === 'sonuclar' ? 'active' : ''; ?>"
                 href="<?php echo esc_url($base); ?>">Sonuçlar</a>
              <?php if (self::can_edit_schema()): ?>
                <a class="<?php echo $tab === 'tanim' ? 'active' : ''; ?>"
                   href="<?php echo esc_url(add_query_arg('sekme', 'tanim', $base)); ?>">Anket Tanımı</a>
              <?php endif; ?>
            </div>

            <?php if (!empty($_GET['sifirlandi'])): ?>
              <div class="notice notice-success"><p>Anket sıfırlandı — kullanıcı bir sonraki girişinde yeniden dolduracak.</p></div>
            <?php endif; ?>

            <?php
            if ($tab === 'tanim' && self::can_edit_schema()) {
                self::render_schema_editor($base);
            } else {
                self::render_results($base);
            }
            ?>
          </div>
        </div>
        <?php
    }

    /* =====================================================================
     *  SORU DÜZENLEYİCİ
     * ================================================================== */

    public static function render_schema_editor($base) {
        $schema = OES_Surveys::get_schema();
        $types  = array(
            'radio'    => 'Tek seçim (radyo)',
            'checkbox' => 'Çoklu seçim',
            'text'     => 'Kısa metin',
            'textarea' => 'Uzun metin (paragraf)',
            'date'     => 'Tarih',
        );
        $ops = array(
            'in'     => 'şu cevabı verenlere',
            'not_in' => 'şu cevabı VERMEYENLERE',
            'filled' => 'bu soruyu cevaplayanlara',
            'empty'  => 'bu soruyu cevaplamayanlara',
        );

        if (!empty($_GET['kaydedildi'])) {
            echo '<div class="notice notice-success"><p>Anket tanımı kaydedildi'
               . (!empty($_GET['surum']) ? ' — sürüm ' . intval($_GET['surum']) . '. Kullanıcılar yeniden ankete alınacak.' : '.')
               . '</p></div>';
        }
        ?>
        <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" id="svEditor">
          <input type="hidden" name="action" value="fabo_survey_schema">
          <?php wp_nonce_field(self::NONCE); ?>

          <div class="fabo-panel">
            <h3>Genel</h3>
            <p>
              <label>Anket başlığı<br>
                <input type="text" name="title" class="regular-text" value="<?php echo esc_attr($schema['title']); ?>"></label>
            </p>
            <p>
              <label>Giriş metni<br>
                <textarea name="intro" rows="2" class="large-text"><?php echo esc_textarea($schema['intro'] ?? ''); ?></textarea></label>
            </p>
            <p class="fabo-hint">
              Şu anki sürüm: <strong><?php echo intval($schema['version']); ?></strong>.
              <strong>Yeni soru eklersen sürüm otomatik artar</strong> ve daha önce dolduran herkes
              "yeni anketiniz var" uyarısıyla eksik soruları görmek üzere ankete alınır.
            </p>
            <p>
              <label><input type="checkbox" name="bump" value="1">
                Soru eklemesem de sürümü artır (herkese yeniden sor)</label>
            </p>
            <p>
              <label><input type="checkbox" name="required" value="1"
                <?php checked(get_option('oes_survey_required', 'yes'), 'yes'); ?>>
                <strong>Anket zorunlu olsun</strong> — doldurmadan panele girilemez</label>
              <br><span class="fabo-hint" style="margin-left:24px">
                Kapalıyken anket yine gösterilir ama "Şimdilik geç" ile atlanabilir;
                panelde hatırlatma şeridi kalır.
              </span>
            </p>
          </div>

          <div class="fabo-panel">
            <h3>Sorular</h3>
            <p class="fabo-hint">
              <strong>Şıklar:</strong> her satıra <code>anahtar|Görünen metin</code> yaz.
              Satır <code>#</code> ile başlarsa grup başlığı olur (seçilemez), ör. <code>#say|SAYISAL</code>.<br>
              <strong>Anahtarları değiştirme:</strong> mevcut soruların anahtarı kilitli — değiştirilirse
              o soruya verilmiş tüm cevaplar sahipsiz kalır.
            </p>

            <p class="fabo-hint">
              Satır başlığına tıklayınca soru açılır.
              <button type="button" class="button button-small" id="svAll">Tümünü aç / kapa</button>
            </p>

            <div id="svQList">
              <?php foreach ($schema['questions'] as $i => $q) self::render_q_row($i, $q, $schema, $types, $ops, false); ?>
            </div>

            <p>
              <button type="button" class="button" id="svAddQ">+ Soru ekle</button>
            </p>
          </div>

          <?php
          /* Şablonlar AYRI ve İÇ İÇE DEĞİL.
             Bir text/template betiğinin içine ikinci bir betik etiketi konamaz:
             ilk kapanış etiketi dıştakini erken kapatır ve düzenleyici bozulur.
             Bu yüzden kural şablonu soru şablonunun DIŞINDA, üst seviyede duruyor. */
          ?>
          <script type="text/template" id="svTpl">
            <?php self::render_q_row('__i__', array(), $schema, $types, $ops, true); ?>
          </script>
          <script type="text/template" id="svRuleTpl">
            <?php self::render_rule_row('__i__', '__r__', array(), $schema, $ops); ?>
          </script>

          <div class="sv-savebar">
            <button type="submit" class="button button-primary button-hero">Anketi kaydet</button>
            <span class="fabo-hint" style="margin:0">
              Kaydettiğinde yeni eklenen sorular tüm kullanıcılara sorulur.
            </span>
          </div>
        </form>

        <script>
        (function(){
          var list = document.getElementById('svQList');
          var tpl  = document.getElementById('svTpl');
          var rtpl = document.getElementById('svRuleTpl');
          var add  = document.getElementById('svAddQ');
          if (!list || !tpl || !add) return;
          var n = <?php echo count($schema['questions']); ?>;

          function build(html){
            var wrap = document.createElement('div');
            wrap.innerHTML = html.trim();
            return wrap.firstElementChild;
          }

          add.addEventListener('click', function(){
            var idx = 'n' + (n++);
            var row = build(tpl.innerHTML.replace(/__i__/g, idx));
            list.appendChild(row);
            row.scrollIntoView({behavior:'smooth', block:'center'});
          });

          var all = document.getElementById('svAll');
          if (all) all.addEventListener('click', function(){
            var rows = list.querySelectorAll('.sv-qrow');
            var anyClosed = Array.prototype.some.call(rows, function(r){ return !r.classList.contains('open'); });
            rows.forEach(function(r){ r.classList.toggle('open', anyClosed); });
          });

          /* Başlıktaki özet metni yazarken canlı güncelle — kapalı satırda
             hangi soru olduğunu görebilmek için. */
          list.addEventListener('input', function(e){
            if (!e.target.matches('input[name$="[label]"]')) return;
            var row = e.target.closest('.sv-qrow');
            var sum = row && row.querySelector('.sv-qsum');
            if (sum) sum.textContent = e.target.value || 'Yeni soru';
          });

          list.addEventListener('click', function(e){
            var row = e.target.closest('.sv-qrow');
            if (!row) return;

            // Başlığa tıkla → aç/kapa (araç düğmeleri hariç)
            if (e.target.closest('.sv-qhead') && !e.target.closest('.sv-qtools')) {
              row.classList.toggle('open');
              return;
            }
            if (e.target.matches('.sv-del')) {
              if (confirm('Bu soru silinsin mi? Verilmiş cevapları da erişilemez hale gelir.')) row.remove();
            }
            if (e.target.matches('.sv-up')   && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
            if (e.target.matches('.sv-down') && row.nextElementSibling)     row.parentNode.insertBefore(row.nextElementSibling, row);
            if (e.target.matches('.sv-addrule') && rtpl) {
              // Kural şablonu tek ve üst seviyede: soru indeksi ile benzersiz
              // kural indeksi buraya yazılır.
              var html = rtpl.innerHTML
                .replace(/__i__/g, row.dataset.i)
                .replace(/__r__/g, 'r' + Date.now());
              row.querySelector('.sv-rules').appendChild(build(html));
            }
            if (e.target.matches('.sv-delrule')) e.target.closest('.sv-rule').remove();
          });
        })();
        </script>
        <?php
    }

    /** Tek soru satırı (düzenleyicide). $i dizin, $new ise anahtar düzenlenebilir. */
    private static function render_q_row($i, $q, $schema, $types, $ops, $new) {
        $key   = $q['key'] ?? '';
        $rules = (array) ($q['show_if'] ?? array());
        // Şık metnini "anahtar|Etiket" satırlarına çevir
        $opt_lines = '';
        foreach ((array) ($q['options'] ?? array()) as $ok => $ol) {
            $opt_lines .= $ok . '|' . $ol . "\n";
        }
        ?>
        <?php
        // data-i: "+ Kural ekle" hangi sorunun altına ekleyeceğini bilsin.
        // Akordiyon: yeni eklenen soru AÇIK, mevcutlar kapalı gelir — 38 soru
        // hepsi açıkken ekran okunmaz hale geliyordu.
        $type_lbl = $types[$q['type'] ?? 'radio'] ?? '';
        $nrule    = count($rules);
        ?>
        <div class="sv-qrow<?php echo $new ? ' open' : ''; ?>" data-i="<?php echo esc_attr($i); ?>">
          <div class="sv-qhead">
            <span class="sv-caret dashicons dashicons-arrow-right-alt2"></span>
            <span class="sv-qkey"><?php echo esc_html($key ?: 'yeni'); ?></span>
            <span class="sv-qsum"><?php echo esc_html($q['label'] ?? 'Yeni soru'); ?></span>
            <span class="sv-qmeta">
              <span class="fabo-chip c-navy"><?php echo esc_html($type_lbl); ?></span>
              <?php if (!empty($q['required'])): ?><span class="fabo-chip c-red">zorunlu</span><?php endif; ?>
              <?php if ($nrule): ?><span class="fabo-chip c-amber"><?php echo intval($nrule); ?> koşul</span><?php endif; ?>
            </span>
            <span class="sv-qtools">
              <button type="button" class="button button-small sv-up" title="Yukarı taşı">↑</button>
              <button type="button" class="button button-small sv-down" title="Aşağı taşı">↓</button>
              <button type="button" class="button button-small sv-del" title="Sil">✕</button>
            </span>
          </div>

          <div class="sv-qbody">
          <div class="sv-qgrid">
            <label>Anahtar
              <?php if ($new): ?>
                <input type="text" name="q[<?php echo esc_attr($i); ?>][key]" value="" placeholder="ornek_soru">
              <?php else: ?>
                <input type="text" value="<?php echo esc_attr($key); ?>" readonly>
                <input type="hidden" name="q[<?php echo esc_attr($i); ?>][key]" value="<?php echo esc_attr($key); ?>">
              <?php endif; ?>
            </label>

            <label>Bölüm
              <select name="q[<?php echo esc_attr($i); ?>][section]">
                <?php foreach ((array) $schema['sections'] as $sk => $st): ?>
                  <option value="<?php echo esc_attr($sk); ?>" <?php selected($q['section'] ?? '', $sk); ?>><?php echo esc_html($st); ?></option>
                <?php endforeach; ?>
              </select>
            </label>

            <label>Tip
              <select name="q[<?php echo esc_attr($i); ?>][type]">
                <?php foreach ($types as $tk => $tl): ?>
                  <option value="<?php echo esc_attr($tk); ?>" <?php selected($q['type'] ?? 'radio', $tk); ?>><?php echo esc_html($tl); ?></option>
                <?php endforeach; ?>
              </select>
            </label>

            <?php // Sihirbazda hangi ekranda görünecek (zorunlu anket adım adım ilerliyor) ?>
            <label>Adım
              <select name="q[<?php echo esc_attr($i); ?>][step]">
                <?php foreach ((array) ($schema['steps'] ?? array()) as $sn => $sd): ?>
                  <option value="<?php echo intval($sn); ?>" <?php selected(intval($q['step'] ?? 1), intval($sn)); ?>>
                    <?php echo intval($sn) . '. ' . esc_html($sd['title']); ?>
                  </option>
                <?php endforeach; ?>
              </select>
            </label>

            <label class="sv-req-lbl">
              <input type="checkbox" name="q[<?php echo esc_attr($i); ?>][required]" value="1" <?php checked(!empty($q['required'])); ?>> Zorunlu
            </label>
          </div>

          <label class="sv-full">Soru metni
            <input type="text" name="q[<?php echo esc_attr($i); ?>][label]" value="<?php echo esc_attr($q['label'] ?? ''); ?>">
          </label>

          <label class="sv-full">Yardım metni (isteğe bağlı)
            <input type="text" name="q[<?php echo esc_attr($i); ?>][help]" value="<?php echo esc_attr($q['help'] ?? ''); ?>">
          </label>

          <label class="sv-full">Şıklar (<code>anahtar|Etiket</code>, <code>#</code> ile grup başlığı)
            <textarea name="q[<?php echo esc_attr($i); ?>][options]" rows="4"><?php echo esc_textarea(trim($opt_lines)); ?></textarea>
          </label>

          <div class="sv-rulebox">
            <strong>Ne zaman görünsün?</strong>
            <p class="fabo-hint">Kural yoksa soru herkese görünür. Birden fazla kural VE ile birleşir.</p>
            <div class="sv-rules">
              <?php foreach ($rules as $ri => $rule) self::render_rule_row($i, $ri, $rule, $schema, $ops); ?>
            </div>
            <button type="button" class="button button-small sv-addrule">+ Kural ekle</button>
          </div>
          </div><!-- /.sv-qbody -->
        </div>
        <?php
    }

    private static function render_rule_row($qi, $ri, $rule, $schema, $ops) {
        $vals = implode(',', (array) ($rule['val'] ?? array()));
        ?>
        <div class="sv-rule">
          <select name="q[<?php echo esc_attr($qi); ?>][rules][<?php echo esc_attr($ri); ?>][q]">
            <option value="">— soru seç —</option>
            <?php foreach ($schema['questions'] as $oq): ?>
              <option value="<?php echo esc_attr($oq['key']); ?>" <?php selected($rule['q'] ?? '', $oq['key']); ?>>
                <?php echo esc_html($oq['key'] . ' — ' . mb_substr($oq['label'], 0, 45)); ?>
              </option>
            <?php endforeach; ?>
          </select>
          <select name="q[<?php echo esc_attr($qi); ?>][rules][<?php echo esc_attr($ri); ?>][op]">
            <?php foreach ($ops as $ok => $ol): ?>
              <option value="<?php echo esc_attr($ok); ?>" <?php selected($rule['op'] ?? 'in', $ok); ?>><?php echo esc_html($ol); ?></option>
            <?php endforeach; ?>
          </select>
          <input type="text" name="q[<?php echo esc_attr($qi); ?>][rules][<?php echo esc_attr($ri); ?>][val]"
                 value="<?php echo esc_attr($vals); ?>" placeholder="şık anahtarları, virgülle">
          <button type="button" class="button button-small sv-delrule">×</button>
        </div>
        <?php
    }

    /* =====================================================================
     *  KAYDET
     * ================================================================== */

    public function handle_schema_save() {
        if (!self::can_edit_schema()) wp_die('Yetkiniz yok.');
        check_admin_referer(self::NONCE);

        $old = OES_Surveys::get_schema();
        $raw = isset($_POST['q']) ? (array) wp_unslash($_POST['q']) : array();

        $questions = array();
        $seen      = array();
        foreach ($raw as $item) {
            $key = sanitize_key($item['key'] ?? '');
            if ($key === '' || isset($seen[$key])) continue; // anahtarsız/yinelenen atlanır
            $seen[$key] = true;

            // Şıklar: "anahtar|Etiket" satırları
            $options = array();
            foreach (preg_split('/\r\n|\r|\n/', (string) ($item['options'] ?? '')) as $line) {
                $line = trim($line);
                if ($line === '') continue;
                $parts = explode('|', $line, 2);
                $ok = trim($parts[0]);
                $ol = isset($parts[1]) ? trim($parts[1]) : $ok;
                // '#' önekli anahtar grup başlığıdır; sanitize_key '#'i yer, korunmalı
                $ok = (strpos($ok, '#') === 0) ? '#' . sanitize_key(substr($ok, 1)) : sanitize_key($ok);
                if ($ok === '' || $ok === '#') continue;
                $options[$ok] = sanitize_text_field($ol);
            }

            // Koşul kuralları
            $rules = array();
            foreach ((array) ($item['rules'] ?? array()) as $r) {
                $rq = sanitize_key($r['q'] ?? '');
                if ($rq === '') continue;
                $op = in_array(($r['op'] ?? ''), array('in', 'not_in', 'filled', 'empty'), true) ? $r['op'] : 'in';
                $val = array();
                foreach (explode(',', (string) ($r['val'] ?? '')) as $v) {
                    $v = trim($v);
                    if ($v !== '') $val[] = sanitize_key($v);
                }
                if (($op === 'in' || $op === 'not_in') && empty($val)) continue; // anlamsız kural
                $rules[] = array('q' => $rq, 'op' => $op, 'val' => $val);
            }

            $type = in_array(($item['type'] ?? ''), array('radio', 'checkbox', 'text', 'textarea', 'date'), true)
                ? $item['type'] : 'radio';

            $questions[] = array(
                'key'      => $key,
                'section'  => sanitize_key($item['section'] ?? 'kariyer'),
                // Sihirbaz adımı — geçersizse 1'e düşer (soru kaybolmasın)
                'step'     => max(1, intval($item['step'] ?? 1)),
                'type'     => $type,
                'label'    => sanitize_text_field($item['label'] ?? $key),
                'help'     => sanitize_text_field($item['help'] ?? ''),
                'required' => !empty($item['required']),
                'options'  => $options,
                'show_if'  => $rules,
            );
        }

        // Hiç soru kalmadıysa kaydetme — anketi yanlışlıkla boşaltmayı engelle
        if (empty($questions)) {
            wp_safe_redirect(add_query_arg('hata', 'bos', admin_url('admin.php?page=oes-anketler&sekme=tanim')));
            exit;
        }

        // SÜRÜM: yeni soru anahtarı eklendiyse otomatik artar (kullanıcı isteği:
        // "ankete ekleme yapılırsa mevcut kullanıcıya da yeni soru belirsin").
        $old_keys = wp_list_pluck($old['questions'], 'key');
        $new_keys = wp_list_pluck($questions, 'key');
        $added    = array_diff($new_keys, $old_keys);
        $version  = intval($old['version'] ?? 1);
        if (!empty($added) || !empty($_POST['bump'])) $version++;

        $schema = array(
            'key'       => $old['key'] ?? 'kariyer_rotam',
            'title'     => sanitize_text_field($_POST['title'] ?? $old['title']),
            'version'   => $version,
            'intro'     => sanitize_textarea_field($_POST['intro'] ?? ''),
            'sections'  => $old['sections'],
            // Adım başlıkları düzenleyicide değiştirilmiyor — olduğu gibi taşınır
            'steps'     => $old['steps'] ?? array(),
            'questions' => $questions,
        );
        OES_Surveys::save_schema($schema);
        update_option('oes_survey_required', empty($_POST['required']) ? 'no' : 'yes');

        // Sürüm arttıysa daha önce dolduranlara haber ver (push varsa telefona da).
        if ($version > intval($old['version'] ?? 1)) {
            self::notify_update();
        }

        wp_safe_redirect(add_query_arg(
            array('page' => 'oes-anketler', 'sekme' => 'tanim', 'kaydedildi' => 1, 'surum' => $version),
            admin_url('admin.php')
        ));
        exit;
    }

    /**
     * "Yeni anketiniz var" bildirimi.
     *
     * Zorunlu anket zaten girişte kilit uyguluyor; bu bildirim kullanıcı henüz
     * panele uğramadan haberdar olsun diye. Push kapalıysa da OES_Push
     * bildirimi kullanıcının Mesajlarım kutusuna yazar.
     */
    private static function notify_update() {
        if (!class_exists('OES_Push')) return;
        global $wpdb;

        $meta = OES_Surveys::META_PREFIX . OES_Surveys::survey_key();
        // Yalnızca DAHA ÖNCE dolduranlar — hiç doldurmayan zaten kilitte.
        $ids = $wpdb->get_col($wpdb->prepare(
            "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = %s AND meta_value <> '' LIMIT 5000",
            $meta
        ));
        if (empty($ids)) return;

        // İmza KONUMSAL: (ids, title, body, url, tag, log)
        OES_Push::send_to_users(
            $ids,
            'Yeni anketiniz var',
            OES_Surveys::get_schema()['title'] . ' anketine yeni sorular eklendi. Birkaç dakikanı ayırıp tamamlayabilirsin.',
            OES_Surveys::form_url(),
            'survey-update',
            count($ids) . ' kullanıcıya anket güncelleme bildirimi'
        );
    }
}

OES_Surveys_Admin::instance();
