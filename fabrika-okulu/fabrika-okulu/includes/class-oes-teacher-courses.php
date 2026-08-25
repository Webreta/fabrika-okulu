<?php
/**
 * OES Teacher Courses — Eğitmen panelinden kurs CRUD (AJAX)
 *
 * Eğitmen wp-admin'e girmeden kendi kurslarını oluşturur/düzenler.
 * Tüm yazma işlemleri: nonce + eğitmen yetkisi + SAHİPLİK kontrolü.
 * Kurs = WooCommerce basit ürün + _oes_is_course=yes; müfredat şeması
 * mevcut sistemle birebir aynı (_oes_course_curriculum).
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher_Courses {

    private static $instance = null;
    const NONCE = 'oes_teacher_panel';

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_tp_save_course',      array($this, 'ajax_save_course'));
        add_action('wp_ajax_oes_tp_duplicate_course', array($this, 'ajax_duplicate_course'));
        add_action('wp_ajax_oes_tp_delete_course',    array($this, 'ajax_delete_course'));
        add_action('wp_ajax_oes_tp_upload_image',   array($this, 'ajax_upload_image'));
        add_action('wp_ajax_oes_tp_upload_file',    array($this, 'ajax_upload_file'));
        add_action('wp_ajax_oes_tp_media_library',  array($this, 'ajax_media_library'));
        add_action('wp_ajax_oes_tp_course_periods', array($this, 'ajax_course_periods'));
        add_action('wp_ajax_oes_tp_toggle_course',  array($this, 'ajax_toggle_course'));
        add_action('wp_ajax_oes_tp_quiz_attempt',   array($this, 'ajax_quiz_attempt'));

        // Kapalı eğitim satın alınamaz (yeni kayıt yok); mevcut öğrenciler erişmeye devam eder
        add_filter('woocommerce_is_purchasable', array($this, 'block_closed_purchase'), 10, 2);

        // Kapalı eğitim = HER ZAMAN "stokta yok". Başka bir kod _stock_status'ı 'instock'
        // yazsa bile, etkili stok durumunu nesne seviyesinde zorla dışarı çeker.
        add_filter('woocommerce_product_get_stock_status', array($this, 'force_closed_stock_status'), 99, 2);
        add_filter('woocommerce_product_is_in_stock',      array($this, 'force_closed_in_stock'), 99, 2);

        // wp-admin ürünler listesi: "Eğitimi Kapat / Aç" satır işlemi (yönetici)
        add_filter('post_row_actions',             array($this, 'product_row_action'), 10, 2);
        add_action('admin_post_oes_toggle_course', array($this, 'handle_admin_toggle'));
    }

    /* ---------------------------------------------------------------------
     *  Eğitimi kapat / aç (kayıt kapanır, mağazadan düşer, öğrenciler kalır)
     * ------------------------------------------------------------------- */

    /** Kursu kapatır/açar: meta + katalog görünürlüğü + stok durumu (satın alma engeli filtre ile). */
    public static function set_course_closed($course_id, $closed) {
        $course_id = intval($course_id);
        update_post_meta($course_id, '_oes_course_closed', $closed ? 'yes' : 'no');
        $stock = $closed ? 'outofstock' : 'instock';
        if (function_exists('wc_get_product')) {
            $product = wc_get_product($course_id);
            if ($product) {
                // Kapalı → katalog+aramadan gizle; açık → normal görünür
                $product->set_catalog_visibility($closed ? 'hidden' : 'visible');
                // Eğitimi kapat = stoktan kaldır (WooCommerce'te de "stokta yok")
                $product->set_stock_status($stock);
                $product->save();
            }
        }
        // Garanti: bazı kurulumlarda WC nesne katmanı/önbelleği stoğu yansıtmayabiliyor —
        // meta'yı doğrudan yaz ve ürün önbelleğini temizle.
        update_post_meta($course_id, '_stock_status', $stock);
        if (function_exists('wc_delete_product_transients')) wc_delete_product_transients($course_id);
        clean_post_cache($course_id);
    }

    public static function is_course_closed($course_id) {
        return get_post_meta($course_id, '_oes_course_closed', true) === 'yes';
    }

    /** Eğitmen paneli: kendi kursunu kapat/aç */
    public function ajax_toggle_course() {
        $user_id = $this->guard();
        $course_id = intval($_POST['course_id'] ?? 0);
        if (!$course_id || !OES_Teacher::owns_course($user_id, $course_id)) {
            wp_send_json_error('Bu eğitimi yönetme yetkiniz yok.');
        }
        $closed = !empty($_POST['closed']);
        self::set_course_closed($course_id, $closed);
        wp_send_json_success(array(
            'closed'  => $closed,
            'message' => $closed
                ? 'Eğitim kapatıldı. Yeni kayıt alınmayacak ve mağazadan kalkacak; mevcut öğrenciler erişmeye devam eder.'
                : 'Eğitim yeniden açıldı ve mağazada yayında.',
        ));
    }

    /** Kapalı kurs satın alınamaz */
    public function block_closed_purchase($purchasable, $product) {
        if ($product && get_post_meta($product->get_id(), '_oes_course_closed', true) === 'yes') {
            return false;
        }
        return $purchasable;
    }

    /** Kapalı kurs → etkili stok durumu her zaman "stokta yok" (nesne seviyesinde zorla). */
    public function force_closed_stock_status($status, $product) {
        if ($product && get_post_meta($product->get_id(), '_oes_course_closed', true) === 'yes') {
            return 'outofstock';
        }
        return $status;
    }
    public function force_closed_in_stock($in_stock, $product) {
        if ($product && get_post_meta($product->get_id(), '_oes_course_closed', true) === 'yes') {
            return false;
        }
        return $in_stock;
    }

    /** wp-admin ürünler listesi satır işlemi */
    public function product_row_action($actions, $post) {
        if (!isset($post->post_type) || $post->post_type !== 'product') return $actions;
        if (get_post_meta($post->ID, '_oes_is_course', true) !== 'yes') return $actions;
        if (!current_user_can('manage_options')) return $actions;
        $closed = self::is_course_closed($post->ID);
        $url = wp_nonce_url(
            admin_url('admin-post.php?action=oes_toggle_course&course=' . $post->ID . '&closed=' . ($closed ? '0' : '1')),
            'oes_toggle_course_' . $post->ID
        );
        $actions['oes_toggle'] = '<a href="' . esc_url($url) . '">' . ($closed ? 'Eğitimi Aç' : 'Eğitimi Kapat') . '</a>';
        return $actions;
    }

    /** wp-admin satır işlemini işle */
    public function handle_admin_toggle() {
        $cid = intval($_GET['course'] ?? 0);
        if (!$cid || !current_user_can('manage_options')) wp_die('Yetkiniz yok.');
        check_admin_referer('oes_toggle_course_' . $cid);
        self::set_course_closed($cid, !empty($_GET['closed']));
        wp_safe_redirect(wp_get_referer() ?: admin_url('edit.php?post_type=product'));
        exit;
    }

    /* ---------------------------------------------------------------------
     *  Sınav denemesi inceleme (eğitmen) — hangi soruya doğru/yanlış + açık uçlu
     * ------------------------------------------------------------------- */
    public function ajax_quiz_attempt() {
        $user_id = $this->guard();
        global $wpdb;
        $attempt_id = intval($_POST['attempt_id'] ?? 0);
        $attempt = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quiz_attempts WHERE id = %d", $attempt_id));
        if (!$attempt) wp_send_json_error('Deneme bulunamadı.');
        $quiz = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $attempt->quiz_id));
        if (!$quiz || !OES_Teacher::owns_course($user_id, $quiz->course_id)) {
            wp_send_json_error('Bu sınavı görme yetkiniz yok.');
        }
        $questions = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY id ASC", $attempt->quiz_id));
        $answers = json_decode((string) $attempt->answers, true);
        if (!is_array($answers)) $answers = array();

        $stu = get_userdata($attempt->user_id);
        wp_send_json_success(array(
            'title'   => $quiz->title,
            'student' => $stu ? ($stu->display_name ?: $stu->user_email) : '—',
            'score'   => ($attempt->status === 'pending_review') ? null : round($attempt->score),
            'earned'  => round($attempt->earned_points),
            'total'   => intval($attempt->total_points),
            'pending' => ($attempt->status === 'pending_review'),
            'html'    => $this->render_attempt_html($questions, $answers),
        ));
    }

    /** Sınav denemesini soru soru dökümler (doğru/yanlış + açık uçlu inceleme) */
    private function render_attempt_html($questions, $answers) {
        ob_start();
        $n = 0;
        foreach ($questions as $q) {
            $n++;
            $ua = isset($answers[$q->id]) ? (string) $answers[$q->id] : '';
            echo '<div class="qad-item">';
            echo '<div class="qad-q"><span class="qad-n">' . $n . '.</span> ' . esc_html($q->question_text)
               . ' <span class="qad-pts">' . intval($q->points) . ' puan</span></div>';

            if ($q->question_type === 'open_ended') {
                echo '<div class="qad-open"><div class="qad-lbl"><i class="ti ti-writing"></i> Öğrencinin yanıtı</div><div class="qad-open-txt">'
                   . ($ua !== '' ? nl2br(esc_html($ua)) : '<i style="color:#94a3b8;">Boş bırakıldı</i>') . '</div></div>';
            } elseif ($q->question_type === 'true_false') {
                $ok = ($ua === $q->correct_answer);
                $lbl = function ($v) { return $v === 'true' ? 'Doğru' : ($v === 'false' ? 'Yanlış' : '—'); };
                echo '<div class="qad-tf ' . ($ok ? 'ok' : 'no') . '">' . ($ok ? '✓' : '✗')
                   . ' Öğrenci: <b>' . $lbl($ua) . '</b> · Doğru cevap: <b>' . $lbl($q->correct_answer) . '</b></div>';
            } else {
                $opts = json_decode((string) $q->options, true) ?: array();
                $correct = json_decode((string) $q->correct_answer, true);
                if (!is_array($correct)) $correct = array();
                $uidx = ($ua !== '') ? (ord(strtoupper($ua)) - 65) : -1;
                foreach ($opts as $i => $opt) {
                    $is_correct = in_array($i, $correct);
                    $is_user = ($i === $uidx);
                    $cls = $is_correct ? 'opt-correct' : ($is_user ? 'opt-wrong' : '');
                    $mark = $is_correct ? '✓' : ($is_user ? '✗' : '');
                    echo '<div class="qad-opt ' . $cls . '"><span class="qad-mark">' . $mark . '</span> '
                       . esc_html(chr(65 + $i)) . ') ' . esc_html($opt)
                       . ($is_user ? ' <small>(öğrencinin seçimi)</small>' : '') . '</div>';
                }
                if ($uidx < 0) echo '<div class="qad-tf no">Boş bırakıldı</div>';
            }
            echo '</div>';
        }
        return ob_get_clean();
    }

    /* ---------------------------------------------------------------------
     *  Ortak güvenlik
     * ------------------------------------------------------------------- */

    private function guard() {
        check_ajax_referer(self::NONCE, 'nonce');
        if (!OES_Teacher::can_access_panel()) {
            wp_send_json_error('Yetkiniz yok.');
        }
        return get_current_user_id();
    }

    /* ---------------------------------------------------------------------
     *  Kaydet (oluştur / güncelle)
     * ------------------------------------------------------------------- */

    public function ajax_save_course() {
        global $wpdb;
        $user_id = $this->guard();

        if (!class_exists('WC_Product_Simple')) {
            wp_send_json_error('WooCommerce bulunamadı.');
        }

        $course_id = intval($_POST['course_id'] ?? 0);
        $title     = sanitize_text_field($_POST['title'] ?? '');
        if ($title === '') {
            wp_send_json_error('Kurs başlığı zorunludur.');
        }

        // Düzenlemede sahiplik zorunlu
        $is_new = ($course_id === 0);
        if (!$is_new && !OES_Teacher::owns_course($user_id, $course_id)) {
            wp_send_json_error('Bu kursu düzenleme yetkiniz yok.');
        }

        // Yayına alınmış kurs mu? (ürün kaydından ÖNCE yakala) → yayın sonrası kilit için.
        // Yönetici HER ZAMAN müdahale edebilir → kilit yöneticiye uygulanmaz.
        $was_published = (!$is_new && get_post_status($course_id) === 'publish' && !current_user_can('manage_options'));

        $description = wp_kses_post(wp_unslash($_POST['description'] ?? ''));
        $short_desc  = wp_kses_post(wp_unslash($_POST['short_description'] ?? ''));
        $status      = ($_POST['status'] ?? 'publish') === 'draft' ? 'draft' : 'publish';
        $is_free     = !empty($_POST['is_free']);
        $price       = $is_free ? 0 : floatval($_POST['price'] ?? 0);
        $sale_raw    = isset($_POST['sale_price']) ? trim((string) $_POST['sale_price']) : '';
        $sale        = ($is_free || $sale_raw === '') ? '' : floatval($sale_raw);
        $sale_to_raw = isset($_POST['sale_to']) ? trim((string) $_POST['sale_to']) : '';
        $image_id    = intval($_POST['image_id'] ?? 0);

        // Ürünü al/oluştur
        if ($is_new) {
            $product = new WC_Product_Simple();
        } else {
            $product = wc_get_product($course_id);
            if (!$product) wp_send_json_error('Kurs bulunamadı.');
        }

        $product->set_name($title);
        $product->set_description($description);
        $product->set_short_description($short_desc);
        $product->set_status($status);
        $product->set_virtual(true);
        $product->set_catalog_visibility('visible');
        $product->set_regular_price((string) $price);

        // İndirimli fiyat yalnızca geçerliyse (0 < indirim < normal fiyat)
        if ($sale !== '' && $sale > 0 && $sale < $price) {
            $product->set_sale_price((string) $sale);
            // İndirim bitiş tarihi (girildiyse, o günün sonuna kadar geçerli).
            // Tarih geçmişse WooCommerce indirimi otomatik kaldırır (wc_scheduled_sales).
            $sale_to_ts = ($sale_to_raw !== '') ? strtotime($sale_to_raw . ' 23:59:59') : 0;
            $product->set_date_on_sale_to($sale_to_ts ?: '');
            if ($sale_to_ts && $sale_to_ts < time()) {
                $product->set_price((string) $price); // süresi dolmuş: normal fiyat
            } else {
                $product->set_price((string) $sale);
            }
        } else {
            $product->set_sale_price('');
            $product->set_date_on_sale_to('');
            $product->set_price((string) $price);
        }
        // Editör mevcut görsel id'sini gizli alanda gönderir; 0 = bilinçli kaldırma
        $product->set_image_id($image_id > 0 ? $image_id : '');

        $course_id = $product->save();
        if (!$course_id) {
            wp_send_json_error('Kurs kaydedilemedi.');
        }

        // Yeni kursta yazarı eğitmen yap (sahiplik) + eğitmen profili bağla
        if ($is_new) {
            wp_update_post(array('ID' => $course_id, 'post_author' => $user_id));
            $instructor_id = OES_Teacher::ensure_instructor_profile($user_id);
            if ($instructor_id) {
                update_post_meta($course_id, '_oes_instructor_id', $instructor_id);
            }
        }

        // Kurs meta'ları
        update_post_meta($course_id, '_oes_is_course', 'yes');
        update_post_meta($course_id, '_oes_is_free_course', $is_free ? 'yes' : 'no');

        // Not: Kategori artık eğitmen tarafından seçilmez — dönem/ücret durumuna göre
        // aşağıda (dönem senkronundan sonra) OTOMATİK atanır.

        // Özellikler
        update_post_meta($course_id, '_oes_course_duration', sanitize_text_field($_POST['duration'] ?? ''));
        update_post_meta($course_id, '_oes_course_level', sanitize_text_field($_POST['level'] ?? ''));
        update_post_meta($course_id, '_oes_course_language', sanitize_text_field($_POST['language'] ?? ''));
        update_post_meta($course_id, '_oes_course_certificate', !empty($_POST['certificate']) ? 'yes' : 'no');
        update_post_meta($course_id, '_oes_course_lifetime', !empty($_POST['lifetime']) ? 'yes' : 'no');

        // Ek içerik alanları (kurs sayfasında gösterilir)
        update_post_meta($course_id, '_oes_course_preview_video', esc_url_raw($_POST['preview_video'] ?? ''));
        update_post_meta($course_id, '_oes_course_requirements', sanitize_textarea_field(wp_unslash($_POST['requirements'] ?? '')));
        update_post_meta($course_id, '_oes_course_target', sanitize_textarea_field(wp_unslash($_POST['target'] ?? '')));

        // Kazanımlar (satır satır → dizi)
        $outcomes_raw = wp_unslash($_POST['outcomes'] ?? '');
        $outcomes = array_values(array_filter(array_map('sanitize_text_field', preg_split('/\r\n|\r|\n/', $outcomes_raw)), function ($v) {
            return $v !== '';
        }));
        update_post_meta($course_id, '_oes_course_outcomes', $outcomes);

        // Müfredat pipeline (panel + wp-admin ortak)
        $this->persist_curriculum($course_id, $_POST['curriculum'] ?? '', $was_published);

        // Dönemler (editörden) — senkronla; yayın sonrası sadece Zoom linki güncellenir
        if (OES_Module_Manager::is_active('periods')) {
            $this->sync_periods($course_id, $_POST['periods'] ?? '', $was_published);
        }
        // Dönem varsa kurs otomatik "dönemli" olur (takvimli grup)
        $period_count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_periods WHERE course_id = %d", $course_id));
        update_post_meta($course_id, '_oes_period_based', $period_count > 0 ? 'yes' : 'no');

        // OTOMATİK grup/kategori: dönem varsa Takvimli, ücretsizse Ücretsiz, ikisi de değilse Esnek
        $group = $period_count > 0 ? 'takvimli' : ($is_free ? 'ucretsiz' : 'esnek');
        update_post_meta($course_id, '_oes_group', $group);
        $this->assign_group_category($course_id, $group);

        wp_send_json_success(array(
            'course_id'   => $course_id,
            'message'     => $is_new ? 'Kurs oluşturuldu.' : 'Kurs güncellendi.',
            'redirect'    => home_url('/egitmen/kurslarim/'),
            // Taslak önizleme: sahip/yönetici yayınlanmamış kursu ön yüzde görebilir
            // (OES_Teacher::allow_owner_draft_preview).
            'preview_url' => get_permalink($course_id),
        ));
    }

    /* ---------------------------------------------------------------------
     *  Çoğalt (şablondan yeni eğitim) — kopya HER ZAMAN taslak olur
     * ------------------------------------------------------------------- */

    /**
     * Eğitmen kendi eğitimini çoğaltır: aynı format/müfredat, yeni TASLAK eğitim.
     * Sınav ve görevler için YENİ satırlar açılır (kopyayı düzenlemek aslını bozmasın).
     * Dönemler kopyalanmaz — tarihler her eğitime özgüdür, taslakta yeniden girilir.
     */
    public function ajax_duplicate_course() {
        $user_id = $this->guard();
        $course_id = intval($_POST['course_id'] ?? 0);

        if (!$course_id || !OES_Teacher::owns_course($user_id, $course_id)) {
            wp_send_json_error('Bu eğitimi çoğaltma yetkiniz yok.');
        }
        if (!class_exists('WC_Product_Simple')) {
            wp_send_json_error('WooCommerce bulunamadı.');
        }
        $src = wc_get_product($course_id);
        if (!$src || get_post_meta($course_id, '_oes_is_course', true) !== 'yes') {
            wp_send_json_error('Eğitim bulunamadı.');
        }

        $new = new WC_Product_Simple();
        $new->set_name($src->get_name() . ' (Kopya)');
        $new->set_description($src->get_description());
        $new->set_short_description($src->get_short_description());
        $new->set_status('draft');
        $new->set_virtual(true);
        $new->set_catalog_visibility('visible');
        $new->set_regular_price((string) $src->get_regular_price());
        $new->set_sale_price((string) $src->get_sale_price());
        $new->set_date_on_sale_from($src->get_date_on_sale_from());
        $new->set_date_on_sale_to($src->get_date_on_sale_to());
        $new->set_price((string) ($src->get_sale_price() !== '' ? $src->get_sale_price() : $src->get_regular_price()));
        $new->set_image_id($src->get_image_id() ?: '');
        $new_id = $new->save();
        if (!$new_id) {
            wp_send_json_error('Kopya oluşturulamadı.');
        }

        // Sahiplik aslındaki eğitmende kalır (yönetici çoğaltırsa da kurs eğitmenin olsun)
        $author = (int) get_post_field('post_author', $course_id);
        wp_update_post(array('ID' => $new_id, 'post_author' => $author ?: $user_id));

        foreach (array(
            '_oes_is_free_course', '_oes_course_duration', '_oes_course_level',
            '_oes_course_language', '_oes_course_certificate', '_oes_course_lifetime',
            '_oes_course_preview_video', '_oes_course_requirements', '_oes_course_target',
            '_oes_course_outcomes', '_oes_instructor_id',
        ) as $key) {
            $val = get_post_meta($course_id, $key, true);
            if ($val !== '' && $val !== null) update_post_meta($new_id, $key, $val);
        }
        update_post_meta($new_id, '_oes_is_course', 'yes');
        update_post_meta($new_id, '_oes_course_closed', 'no');
        // Dönem kopyalanmadı → kopya "esnek" başlar; dönem eklenince kayıtta takvimliye döner
        update_post_meta($new_id, '_oes_period_based', 'no');

        // Müfredat: sınav soruları taşınır, sınav/görev id'leri sıfırlanır → yeni satırlar açılır
        $clone = $this->clone_curriculum($course_id);
        $this->persist_curriculum($new_id, $clone, false);

        $group = get_post_meta($new_id, '_oes_is_free_course', true) === 'yes' ? 'ucretsiz' : 'esnek';
        update_post_meta($new_id, '_oes_group', $group);
        $this->assign_group_category($new_id, $group);

        wp_send_json_success(array(
            'course_id' => $new_id,
            'message'   => 'Eğitim çoğaltıldı ve taslak olarak kaydedildi.',
            'redirect'  => home_url('/' . OES_Teacher_Panel::SLUG . '/editor/') . '?edit=' . $new_id,
        ));
    }

    /**
     * Kaynak kursun müfredatını, kaydetme pipeline'ına verilebilecek bir kopyaya çevirir:
     * sınav soruları editör biçiminde taşınır, quiz_id/assignment_id sıfırlanır (yeni satır açılsın).
     * Ders dosyaları aynı korumalı depo anahtarını paylaşır (erişim kurs bazında doğrulanır).
     */
    private function clone_curriculum($course_id) {
        $cur = get_post_meta($course_id, '_oes_course_curriculum', true);
        if (!is_array($cur)) return array();

        $out = array();
        foreach ($cur as $section) {
            if (!is_array($section)) continue;
            $s = array('title' => $section['title'] ?? '', 'lessons' => array());
            foreach (($section['lessons'] ?? array()) as $l) {
                if (!is_array($l)) continue;
                $type = $l['type'] ?? 'video';
                if ($type === 'quiz') {
                    $l['questions'] = $this->export_quiz_questions(intval($l['quiz_id'] ?? 0));
                    $l['quiz_id']   = 0;
                } elseif ($type === 'assign') {
                    $l['assignment_id'] = 0;
                }
                $s['lessons'][] = $l;
            }
            $out[] = $s;
        }
        return $out;
    }

    /** Kayıtlı sınav sorularını editörün gönderdiği biçime çevirir (çoğaltma için). */
    private function export_quiz_questions($quiz_id) {
        global $wpdb;
        if (!$quiz_id) return array();
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY id ASC", $quiz_id));
        $out = array();
        foreach ((array) $rows as $r) {
            $type = in_array($r->question_type, array('multiple_choice', 'true_false', 'open_ended'), true)
                ? $r->question_type : 'multiple_choice';
            $q = array(
                'qtype'  => $type,
                'text'   => $r->question_text,
                'points' => max(1, intval($r->points)),
            );
            if ($type === 'multiple_choice') {
                $opts = json_decode((string) $r->options, true);
                $q['options'] = is_array($opts) ? $opts : array();
                $correct = json_decode((string) $r->correct_answer, true);
                $q['correct'] = (is_array($correct) && isset($correct[0])) ? intval($correct[0]) : 0;
            } elseif ($type === 'true_false') {
                $q['correct'] = ($r->correct_answer === 'true') ? 'true' : 'false';
            }
            $out[] = $q;
        }
        return $out;
    }

    /**
     * Müfredat JSON'unu tam pipeline'dan geçirip kaydeder (panel AJAX + wp-admin metabox ortak).
     * Sınav senkronu → (yayın sonrası kilit merge) → sanitize → görev senkronu → meta.
     * $raw_json: istemciden gelen JSON string VEYA (çoğaltmada) hazır dizi.
     */
    public function persist_curriculum($course_id, $raw_json, $was_published = false) {
        $decoded = is_array($raw_json) ? $raw_json : json_decode(wp_unslash($raw_json), true);
        if (!is_array($decoded)) $decoded = array();
        if ($was_published) {
            $existing_cur = get_post_meta($course_id, '_oes_course_curriculum', true) ?: array();
            $decoded = $this->merge_locked_curriculum($existing_cur, $decoded);
        }
        if (OES_Module_Manager::is_active('quizzes')) {
            $decoded = $this->sync_curriculum_quizzes($course_id, $decoded);
        }
        $curriculum = $this->sanitize_curriculum($decoded);
        if (OES_Module_Manager::is_active('assignments')) {
            $curriculum = $this->sync_curriculum_assignments($course_id, $curriculum);
        }
        update_post_meta($course_id, '_oes_course_curriculum', $curriculum);
        return $curriculum;
    }

    /**
     * İstemciden gelen müfredat JSON'unu güvenli, player-uyumlu diziye çevirir.
     */
    private function sanitize_curriculum($raw) {
        // Dizi (senkron sonrası) veya JSON string kabul eder
        $sections = is_array($raw) ? $raw : json_decode(wp_unslash($raw), true);
        if (!is_array($sections)) return array();

        $out = array();
        foreach ($sections as $section) {
            if (!is_array($section)) continue;
            $s = array(
                'title'   => sanitize_text_field($section['title'] ?? ''),
                'lessons' => array(),
            );
            if (!empty($section['lessons']) && is_array($section['lessons'])) {
                foreach ($section['lessons'] as $l) {
                    if (!is_array($l)) continue;
                    $type = sanitize_text_field($l['type'] ?? 'video');

                    if ($type === 'quiz') {
                        $s['lessons'][] = array(
                            'type'     => 'quiz',
                            'quiz_id'  => intval($l['quiz_id'] ?? 0),
                            'title'    => sanitize_text_field($l['title'] ?? ''),
                            // Son tarih GÖRELİdir (görevlerdeki gibi): kayıttan / dönem
                            // başından sonra N gün. Net an öğrenci bazında hesaplanır.
                            'due_days' => max(0, intval($l['due_days'] ?? 0)),
                            'end_date' => trim((string) ($l['end_date'] ?? '')), // eski/mutlak (wp-admin)
                        );
                    } elseif ($type === 'assign') {
                        // Görev (ödev) — müfredata gömülü. Teslim süresi GÖRELİ tutulur:
                        // kayıttan (dönemliyse dönem başından) sonra N gün. Net tarih öğrenci bazında hesaplanır.
                        $s['lessons'][] = array(
                            'type'          => 'assign',
                            'title'         => sanitize_text_field($l['title'] ?? ''),
                            'description'   => sanitize_textarea_field(wp_unslash($l['description'] ?? '')),
                            'due_days'      => max(0, intval($l['due_days'] ?? 0)),
                            'assignment_id' => intval($l['assignment_id'] ?? 0),
                        );
                    } elseif ($type === 'file') {
                        // Ders dosyası (PDF/görsel) — korumalı depoda tutulur, indirilemez
                        // görüntüleyicide açılır ve İLERLEMEYE DAHİL DEĞİLDİR.
                        // file_key: korumalı depo anahtarı (yeni kayıtlar)
                        // file_url: eski kayıtların açık uploads URL'i (geriye dönük)
                        $s['lessons'][] = array(
                            'type'      => 'file',
                            'title'     => sanitize_text_field($l['title'] ?? ''),
                            'file_key'  => sanitize_file_name($l['file_key'] ?? ''),
                            'file_url'  => esc_url_raw($l['file_url'] ?? ''),
                            'file_name' => sanitize_text_field($l['file_name'] ?? ''),
                            'file_mime' => sanitize_text_field($l['file_mime'] ?? ''),
                        );
                    } else {
                        $s['lessons'][] = array(
                            'type'      => 'video',
                            'title'     => sanitize_text_field($l['title'] ?? ''),
                            'duration'  => sanitize_text_field($l['duration'] ?? ''),
                            'video_url' => esc_url_raw($l['video_url'] ?? ''),
                            'preview'   => !empty($l['preview']),
                        );
                    }
                }
            }
            if ($s['title'] !== '') $out[] = $s;
        }
        return $out;
    }

    /**
     * Müfredattaki 'quiz' öğelerini oes_quizzes + oes_quiz_questions ile senkronlar.
     * Sınav doğrudan kurs editöründe kurulur; ayrı panel yok. quiz_id müfredata geri yazılır.
     * Sorular tam değiştirilir (editördeki güncel hali).
     */
    private function sync_curriculum_quizzes($course_id, $curriculum) {
        global $wpdb;
        $qt  = $wpdb->prefix . 'oes_quizzes';
        $qqt = $wpdb->prefix . 'oes_quiz_questions';
        foreach ($curriculum as &$section) {
            if (empty($section['lessons'])) continue;
            foreach ($section['lessons'] as &$l) {
                if (($l['type'] ?? '') !== 'quiz') continue;
                $qid = intval($l['quiz_id'] ?? 0);
                $due_days = max(0, intval($l['due_days'] ?? 0));
                $qrow = array(
                    'course_id'  => $course_id,
                    'title'      => sanitize_text_field($l['title'] ?? 'Sınav') ?: 'Sınav',
                    'pass_score' => 0, // Geçme notu yok — öğrenci çözer ve otomatik geçer (Udemy tarzı), sadece skorunu görür
                    'status'     => 'active',
                    // GÖRELİ son tarih (görevlerdeki gibi): kayıttan/dönem başından +N gün.
                    // Doluysa mutlak end_date temizlenir — iki kaynak çakışmasın.
                    'extra_days' => $due_days > 0 ? $due_days : null,
                    'end_date'   => $due_days > 0
                        ? null
                        : (!empty($l['end_date']) ? date('Y-m-d H:i:s', strtotime($l['end_date'])) : null),
                );
                $exists = $qid ? (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$qt} WHERE id = %d AND course_id = %d", $qid, $course_id)) : 0;
                if ($exists) {
                    $wpdb->update($qt, $qrow, array('id' => $qid));
                } else {
                    $qrow['created_at'] = current_time('mysql');
                    $wpdb->insert($qt, $qrow);
                    $qid = (int) $wpdb->insert_id;
                }
                // Sorular tam değiştir
                if (isset($l['questions']) && is_array($l['questions'])) {
                    $wpdb->delete($qqt, array('quiz_id' => $qid));
                    foreach ($l['questions'] as $q) {
                        if (!is_array($q)) continue;
                        $qtype = in_array(($q['qtype'] ?? ''), array('multiple_choice', 'true_false', 'open_ended'), true) ? $q['qtype'] : 'multiple_choice';
                        $text  = sanitize_textarea_field(wp_unslash($q['text'] ?? ''));
                        if ($text === '') continue;
                        $points  = max(1, intval($q['points'] ?? 1));
                        $options = ''; $correct = '';
                        if ($qtype === 'multiple_choice') {
                            $opts = array();
                            foreach ((array) ($q['options'] ?? array()) as $o) { $opts[] = sanitize_text_field(wp_unslash($o)); }
                            $options = wp_json_encode(array_values($opts));
                            $correct = wp_json_encode(array(max(0, intval($q['correct'] ?? 0))));
                        } elseif ($qtype === 'true_false') {
                            $correct = (($q['correct'] ?? '') === 'true') ? 'true' : 'false';
                        }
                        $wpdb->insert($qqt, array(
                            'quiz_id'        => $qid,
                            'question_text'  => $text,
                            'question_type'  => $qtype,
                            'options'        => $options,
                            'correct_answer' => $correct,
                            'points'         => $points,
                        ));
                    }
                }
                $l['quiz_id'] = $qid;
            }
            unset($l);
        }
        unset($section);
        return $curriculum;
    }

    /**
     * Müfredattaki 'assign' öğelerini oes_assignments tablosuyla senkronlar.
     * Her görev için bir assignment satırı upsert eder ve id'yi müfredata geri yazar.
     * Böylece player'da teslim + eğitmen gönderimleri çalışır. (Değerlendirme YOK → is_graded=0)
     * due_days müfredatta tutulur; net son teslim tarihi Faz 4'te dönem başlangıcına göre hesaplanır.
     */
    private function sync_curriculum_assignments($course_id, $curriculum) {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_assignments';
        foreach ($curriculum as &$section) {
            if (empty($section['lessons'])) continue;
            foreach ($section['lessons'] as &$l) {
                if (($l['type'] ?? '') !== 'assign') continue;
                $aid = intval($l['assignment_id'] ?? 0);
                $row = array(
                    'course_id'   => $course_id,
                    'title'       => $l['title'] !== '' ? $l['title'] : 'Görev',
                    'description' => $l['description'] ?? '',
                    'status'      => 'active',
                    'is_graded'   => 0,
                    // Göreli teslim süresi (gün). Net tarih öğrenci bazında (kayıt / dönem başı + gün) hesaplanır.
                    'extra_days'  => max(0, intval($l['due_days'] ?? 0)),
                    'due_date'    => null,
                );
                $exists = $aid ? (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$table} WHERE id = %d AND course_id = %d", $aid, $course_id)) : 0;
                if ($exists) {
                    $wpdb->update($table, $row, array('id' => $aid));
                } else {
                    $wpdb->insert($table, $row);
                    $aid = (int) $wpdb->insert_id;
                }
                $l['assignment_id'] = $aid;
            }
            unset($l);
        }
        unset($section);
        return $curriculum;
    }

    /**
     * Yayın sonrası kilit: mevcut (DB) müfredat öğelerini AYNEN korur, gönderilen
     * müfredattan yalnızca YENİ eklenen modül/dersleri sona ekler. Eski öğelere
     * (başlık, video, sınav soruları, tarih vb.) yapılan düzenlemeler yok sayılır.
     * Konum bazlı hizalar: kilitli ekranda sıra değişmez, yeni dersler listenin sonuna eklenir.
     */
    private function merge_locked_curriculum($existing, $submitted) {
        // Yayın sonrası müfredat TAMAMEN kilitli: hiçbir düzenleme/ekleme kabul edilmez,
        // mevcut müfredat aynen korunur. (Değişiklik gerekiyorsa yönetici wp-admin'den yapar.)
        return is_array($existing) ? $existing : array();
    }

    /**
     * Editörden gelen dönemleri oes_periods ile senkronlar.
     * - Taslak/yeni: ad, tarih, kontenjan, Zoom linki upsert; kaldırılan (öğrencisiz) dönemler silinir.
     * - Yayınlanmış: SADECE Zoom linki (meeting_link) güncellenir; yeni dönem/tarih değişikliği yok sayılır.
     */
    private function sync_periods($course_id, $raw, $was_published) {
        global $wpdb;
        $t = $wpdb->prefix . 'oes_periods';
        $periods = json_decode(wp_unslash($raw), true);
        if (!is_array($periods)) $periods = array();

        $submitted_ids = array();

        foreach ($periods as $p) {
            if (!is_array($p)) continue;
            $id    = intval($p['id'] ?? 0);
            $name  = sanitize_text_field($p['name'] ?? '');
            $start = sanitize_text_field($p['start_date'] ?? '');
            $end   = sanitize_text_field($p['end_date'] ?? '');
            $cap   = max(1, intval($p['capacity'] ?? 20));
            // Dönemin başlangıç SAATİ — göreli son teslimler bu saatte biter
            // (ör. 14:00 başlayan dönemde "+7 gün" görev 7 gün sonra 14:00'te biter).
            $stime = sanitize_text_field($p['start_time'] ?? '');
            $stime = preg_match('/^\d{1,2}:\d{2}$/', $stime) ? date('H:i:s', strtotime($stime)) : null;
            $valid_dates = preg_match('/^\d{4}-\d{2}-\d{2}$/', $start) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $end);

            // Ders programı (schedule): [{date,time,title,link,notes}]
            $schedule = array();
            if (!empty($p['schedule']) && is_array($p['schedule'])) {
                foreach ($p['schedule'] as $s) {
                    if (!is_array($s)) continue;
                    $sd = sanitize_text_field($s['date'] ?? '');
                    if ($sd === '') continue;
                    $schedule[] = array(
                        'date'  => $sd,
                        'time'  => sanitize_text_field($s['time'] ?? ''),
                        'title' => sanitize_text_field($s['title'] ?? ''),
                        'link'  => esc_url_raw(wp_unslash($s['link'] ?? '')),
                        'notes' => '',
                    );
                }
            }
            $schedule_json = wp_json_encode($schedule);

            // Kayıt son tarihi = başlangıçtan bir gün önce (o günün 23:59'una kadar kayıt olunabilir)
            $deadline = $valid_dates ? date('Y-m-d', strtotime($start . ' -1 day')) : null;

            if ($id) {
                // Sahiplik: dönem bu kursa ait olmalı
                $owns = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$t} WHERE id = %d AND course_id = %d", $id, $course_id));
                if (!$owns) continue;
                $submitted_ids[] = $id;

                if ($was_published) {
                    // Süresi geçmiş dönem (bitiş tarihinden sonra) → link bile güncellenemez
                    $ex_end = $wpdb->get_var($wpdb->prepare("SELECT end_date FROM {$t} WHERE id = %d", $id));
                    if ($ex_end && strtotime($ex_end) < strtotime('today')) continue;
                    // Kilitli — yalnızca mevcut program satırlarının LİNKLERİ güncellenir.
                    // Tarih/saat/başlık sabit; satır ekleme/silme yok (indeks bazlı link eşle).
                    $ex_sched = json_decode((string) $wpdb->get_var($wpdb->prepare(
                        "SELECT schedule FROM {$t} WHERE id = %d", $id)), true);
                    if (!is_array($ex_sched)) $ex_sched = array();
                    foreach ($ex_sched as $i => &$es) {
                        if (is_array($es) && isset($schedule[$i]['link'])) $es['link'] = $schedule[$i]['link'];
                    }
                    unset($es);
                    $wpdb->update($t, array('schedule' => wp_json_encode($ex_sched)), array('id' => $id));
                } else {
                    if ($name === '' || !$valid_dates) continue;
                    $wpdb->update($t, array(
                        'name'                => $name,
                        'start_date'          => $start,
                        'start_time'          => $stime,
                        'end_date'            => $end,
                        'capacity'            => $cap,
                        'enrollment_deadline' => $deadline,
                        'schedule'            => $schedule_json,
                    ), array('id' => $id));
                }
            } else {
                // Yeni dönem — yayınlanmış kursa dönem eklenemez
                if ($was_published) continue;
                if ($name === '' || !$valid_dates) continue;
                $wpdb->insert($t, array(
                    'course_id'           => $course_id,
                    'name'                => $name,
                    'start_date'          => $start,
                    'start_time'          => $stime,
                    'end_date'            => $end,
                    'capacity'            => $cap,
                    'enrollment_deadline' => $deadline,
                    'schedule'            => $schedule_json,
                    'created_at'          => current_time('mysql'),
                ));
                $submitted_ids[] = (int) $wpdb->insert_id;
            }
        }

        // Taslak/yeni: gönderilmeyen (kaldırılan) dönemleri sil — yalnızca kayıtlı öğrencisi yoksa
        if (!$was_published) {
            $existing_ids = $wpdb->get_col($wpdb->prepare(
                "SELECT id FROM {$t} WHERE course_id = %d", $course_id));
            foreach ($existing_ids as $eid) {
                $eid = (int) $eid;
                if (in_array($eid, $submitted_ids, true)) continue;
                $enr = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d", $eid));
                if ($enr === 0) $wpdb->delete($t, array('id' => $eid));
            }
        }
    }

    /**
     * Grup adına göre product_cat atar (yoksa oluşturur). Kurs tek bir grup kategorisine girer:
     * takvimli → Takvimli Programlar, ucretsiz → Ücretsiz Kaynaklar, esnek → Esnek Programlar.
     */
    private function assign_group_category($course_id, $group) {
        $map = array(
            'takvimli' => array('slug' => 'takvimli-programlar', 'name' => 'Takvimli Programlar'),
            'ucretsiz' => array('slug' => 'ucretsiz-kaynaklar',  'name' => 'Ücretsiz Kaynaklar'),
            'esnek'    => array('slug' => 'esnek-programlar',     'name' => 'Esnek Programlar'),
        );
        if (!isset($map[$group])) return;
        $info = $map[$group];
        $term = get_term_by('slug', $info['slug'], 'product_cat');
        if (!$term) {
            $res = wp_insert_term($info['name'], 'product_cat', array('slug' => $info['slug']));
            if (is_wp_error($res)) return;
            $term_id = (int) $res['term_id'];
        } else {
            $term_id = (int) $term->term_id;
        }
        // Kurs yalnızca grup kategorisinde olsun (otomatik yönetiliyor)
        wp_set_object_terms($course_id, array($term_id), 'product_cat');
    }

    /* ---------------------------------------------------------------------
     *  Sil (çöpe taşı)
     * ------------------------------------------------------------------- */

    public function ajax_delete_course() {
        $user_id = $this->guard();
        $course_id = intval($_POST['course_id'] ?? 0);

        if (!$course_id || !OES_Teacher::owns_course($user_id, $course_id)) {
            wp_send_json_error('Bu kursu silme yetkiniz yok.');
        }

        // Kayıtlı öğrenci varsa silme (veri kaybını önle) — yayından kaldır
        global $wpdb;
        $enrolled = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments WHERE course_id = %d AND status = 'active'",
            $course_id
        ));

        if ($enrolled > 0) {
            // Öğrenci var → sadece taslağa al (satıştan kaldır), veriyi koru
            wp_update_post(array('ID' => $course_id, 'post_status' => 'draft'));
            wp_send_json_success(array('message' => 'Kursta kayıtlı öğrenci olduğu için silinmedi; satıştan kaldırıldı (taslak).'));
        }

        wp_trash_post($course_id);
        wp_send_json_success(array('message' => 'Kurs silindi.'));
    }

    /* ---------------------------------------------------------------------
     *  Kapak görseli yükle
     * ------------------------------------------------------------------- */

    public function ajax_upload_image() {
        $this->guard();

        if (empty($_FILES['file'])) {
            wp_send_json_error('Görsel bulunamadı.');
        }
        $file = $_FILES['file'];

        if ($file['size'] > 5 * 1024 * 1024) {
            wp_send_json_error('Görsel 5MB\'dan büyük olamaz.');
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            wp_send_json_error('Geçersiz yükleme.');
        }

        // Sadece görsel
        $check = wp_check_filetype_and_ext($file['tmp_name'], $file['name']);
        $mime = $check['type'] ?: '';
        if (strpos($mime, 'image/') !== 0) {
            wp_send_json_error('Yalnızca görsel yükleyebilirsiniz.');
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $upload = wp_handle_upload($file, array('test_form' => false));
        if (isset($upload['error'])) {
            wp_send_json_error($upload['error']);
        }

        $attachment = array(
            'post_mime_type' => $upload['type'],
            'post_title'     => sanitize_file_name(pathinfo($upload['file'], PATHINFO_FILENAME)),
            'post_content'   => '',
            'post_status'    => 'inherit',
        );
        $attach_id = wp_insert_attachment($attachment, $upload['file']);
        if (is_wp_error($attach_id) || !$attach_id) {
            wp_send_json_error('Görsel kaydedilemedi.');
        }
        $meta = wp_generate_attachment_metadata($attach_id, $upload['file']);
        wp_update_attachment_metadata($attach_id, $meta);

        wp_send_json_success(array(
            'id'  => $attach_id,
            'url' => wp_get_attachment_image_url($attach_id, 'medium') ?: $upload['url'],
        ));
    }

    /* ---------------------------------------------------------------------
     *  Ders dosyası yükle (pdf/doc vb.)
     * ------------------------------------------------------------------- */

    public function ajax_upload_file() {
        $this->guard();

        if (empty($_FILES['file'])) {
            wp_send_json_error('Dosya bulunamadı.');
        }
        $file = $_FILES['file'];

        if ($file['size'] > 50 * 1024 * 1024) {
            wp_send_json_error('Dosya 50MB\'dan büyük olamaz.');
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            wp_send_json_error('Geçersiz yükleme.');
        }

        $allowed = array('pdf','doc','docx','xls','xlsx','ppt','pptx','txt','zip','jpg','jpeg','png','gif','mp4','mp3');
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed, true)) {
            wp_send_json_error('Bu dosya türü desteklenmiyor.');
        }

        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        $upload = wp_handle_upload($file, array('test_form' => false));
        if (isset($upload['error'])) {
            wp_send_json_error($upload['error']);
        }

        // Medya kütüphanesine ek olarak kaydet (yönetilebilir olsun, yetim dosya kalmasın)
        $attach_id = wp_insert_attachment(array(
            'post_mime_type' => $upload['type'],
            'post_title'     => sanitize_file_name(pathinfo($upload['file'], PATHINFO_FILENAME)),
            'post_content'   => '',
            'post_status'    => 'inherit',
        ), $upload['file']);
        if (!is_wp_error($attach_id) && $attach_id) {
            $meta = wp_generate_attachment_metadata($attach_id, $upload['file']);
            wp_update_attachment_metadata($attach_id, $meta);
        }

        wp_send_json_success(array(
            'url'  => $upload['url'],
            'name' => sanitize_file_name($file['name']),
        ));
    }

    /* ---------------------------------------------------------------------
     *  Sahip olunan kursun dönemleri (görev/sınav editörü için)
     * ------------------------------------------------------------------- */
    public function ajax_course_periods() {
        $user_id = $this->guard();
        $course_id = intval($_POST['course_id'] ?? 0);
        if (!$course_id || !OES_Teacher::owns_course($user_id, $course_id)) {
            wp_send_json_success(array('periods' => array())); // sessiz boş
        }
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id, name FROM {$wpdb->prefix}oes_periods WHERE course_id = %d ORDER BY start_date DESC",
            $course_id
        ));
        wp_send_json_success(array('periods' => $rows ?: array()));
    }

    /* ---------------------------------------------------------------------
     *  Ortam kütüphanesi (görsel seçici) — sayfalı liste + arama
     * ------------------------------------------------------------------- */

    public function ajax_media_library() {
        $user_id = $this->guard();

        $page   = max(1, intval($_POST['page'] ?? 1));
        $search = sanitize_text_field($_POST['search'] ?? '');
        $mode   = ($_POST['mode'] ?? 'image') === 'file' ? 'file' : 'image';
        $per    = 24;

        $args = array(
            'post_type'      => 'attachment',
            'post_status'    => 'inherit',
            'posts_per_page' => $per,
            'paged'          => $page,
            'orderby'        => 'date',
            'order'          => 'DESC',
        );
        // Sahiplik: eğitmen yalnızca KENDİ yüklediklerini görür (yönetici hepsini)
        if (!current_user_can('manage_options')) {
            $args['author'] = $user_id;
        }
        // Görsel modu: sadece resimler. Dosya modu: tüm ortam dosyaları.
        if ($mode === 'image') {
            $args['post_mime_type'] = 'image';
        }
        if ($search !== '') $args['s'] = $search;

        $q = new WP_Query($args);
        $items = array();
        foreach ($q->posts as $att) {
            $url  = wp_get_attachment_url($att->ID);
            if (!$url) continue;
            $mime = get_post_mime_type($att->ID);
            $is_image = strpos((string) $mime, 'image/') === 0;
            $items[] = array(
                'id'       => $att->ID,
                'url'      => $url,
                'thumb'    => $is_image ? (wp_get_attachment_image_url($att->ID, 'thumbnail') ?: $url) : '',
                'full'     => $is_image ? (wp_get_attachment_image_url($att->ID, 'medium') ?: $url) : $url,
                'title'    => get_the_title($att->ID),
                'filename' => wp_basename($url),
                'mime'     => $mime,
                'is_image' => $is_image,
            );
        }

        wp_send_json_success(array(
            'items'    => $items,
            'has_more' => ($page < $q->max_num_pages),
            'page'     => $page,
        ));
    }

    /* ---------------------------------------------------------------------
     *  Görünüm için veri (kurslarim view'i kullanır)
     * ------------------------------------------------------------------- */

    /**
     * Eğitmenin tek bir kursunu düzenleme için tüm verisiyle döndürür.
     * Sahiplik doğrulanır; değilse null.
     */
    public static function get_course_for_edit($user_id, $course_id) {
        $course_id = (int) $course_id;
        if (!$course_id || !OES_Teacher::owns_course($user_id, $course_id)) return null;

        $product = wc_get_product($course_id);
        if (!$product) return null;

        $outcomes = get_post_meta($course_id, '_oes_course_outcomes', true);
        $outcomes = is_array($outcomes) ? $outcomes : array();

        return array(
            'id'            => $course_id,
            'title'         => $product->get_name(),
            'description'   => $product->get_description(),
            'short_desc'    => $product->get_short_description(),
            'status'        => get_post_status($course_id),
            'is_free'       => get_post_meta($course_id, '_oes_is_free_course', true) === 'yes',
            'price'         => $product->get_regular_price(),
            'sale_price'    => $product->get_sale_price(),
            'sale_to'       => ($d = $product->get_date_on_sale_to()) ? $d->date('Y-m-d') : '',
            'image_id'      => $product->get_image_id(),
            'image_url'     => $product->get_image_id() ? wp_get_attachment_image_url($product->get_image_id(), 'medium') : '',
            'categories'    => wp_get_object_terms($course_id, 'product_cat', array('fields' => 'ids')),
            'period_based'  => get_post_meta($course_id, '_oes_period_based', true) === 'yes',
            'duration'      => get_post_meta($course_id, '_oes_course_duration', true),
            'level'         => get_post_meta($course_id, '_oes_course_level', true),
            'language'      => get_post_meta($course_id, '_oes_course_language', true),
            'certificate'   => get_post_meta($course_id, '_oes_course_certificate', true) === 'yes',
            'lifetime'      => get_post_meta($course_id, '_oes_course_lifetime', true) === 'yes',
            'preview_video' => get_post_meta($course_id, '_oes_course_preview_video', true),
            'requirements'  => get_post_meta($course_id, '_oes_course_requirements', true),
            'target'        => get_post_meta($course_id, '_oes_course_target', true),
            'outcomes'      => $outcomes,
            'curriculum'    => get_post_meta($course_id, '_oes_course_curriculum', true) ?: array(),
        );
    }
}

OES_Teacher_Courses::instance();
