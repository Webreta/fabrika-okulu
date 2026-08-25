<?php
/**
 * OES Documents — Kullanıcı belgeleri (ücretsiz/indirimli eğitim başvurusu)
 *
 * Akış:
 *  - Kullanıcı öğrenci panelinden belge yükler → oes_documents tablosuna kaydedilir
 *    ve belirlenen e-posta adresine gönderilir (bu mail "eklenti bildirimleri" kapsamında DEĞİL).
 *  - Yönetici (wp-admin "Belgeler") veya Süper Eğitmen (eğitmen panelinde) belgeye bakıp
 *    o kullanıcıya belirli bir eğitim için WooCommerce kuponu tanımlar. Üç seçenek var:
 *    Öğrenci indirimi (%90), Yeni mezun (%50), Özel (yüzdeyi tanımlayan girer).
 *  - Kapsam varsayılan olarak TÜM EĞİTİMLERdir (course_id = 0); tek bir eğitim seçilirse
 *    kupon yalnızca onda geçerli olur.
 *  - Kupon KİŞİYE ÖZELDİR: tek kullanımlık ve yalnızca o kullanıcının HESABINDA çalışır
 *    (bkz. restrict_coupon_to_owner). Aynı kullanıcıya sonradan tekrar kupon tanımlanabilir.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Documents {

    private static $instance = null;
    const NONCE_UPLOAD = 'oes_documents_upload';
    const NONCE_MANAGE = 'oes_documents_manage';

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_upload_document',        array($this, 'ajax_upload_document'));
        add_action('wp_ajax_oes_issue_document_coupon',  array($this, 'ajax_issue_coupon'));
        add_action('wp_ajax_oes_issue_coupon_direct',    array($this, 'ajax_issue_coupon_direct'));
        add_action('wp_ajax_oes_delete_document',        array($this, 'ajax_delete_document'));
        add_action('admin_menu',                         array($this, 'add_admin_menu'), 20);
        // Kupon yalnızca tanımlandığı HESAPTA geçerli olsun (aşağıya bak)
        add_filter('woocommerce_coupon_is_valid',        array($this, 'restrict_coupon_to_owner'), 10, 3);
        // "Tüm eğitimler" kapsamlı kuponlar yalnızca EĞİTİM ürünlerinde geçsin
        add_filter('woocommerce_coupon_is_valid_for_product', array($this, 'limit_all_courses_coupon'), 10, 3);
        // Eski (bu özellikten önce verilmiş) kuponları da sahibine bağla — tek seferlik
        add_action('admin_init',                         array($this, 'maybe_backfill_coupon_owners'));
    }

    /* ---------------------------------------------------------------------
     *  İndirim seçenekleri
     * ------------------------------------------------------------------- */

    /**
     * Belge karşılığı tanımlanabilen indirimler. Üçü de YÜZDE indirimidir:
     *  - student  : Öğrenci indirimi  (%90, sabit)
     *  - graduate : Yeni mezun        (%50, sabit)
     *  - custom   : Özel              (yüzdeyi tanımlayan girer)
     * Oranları değiştirmek için 'fabo_discount_presets' filtresi kullanılabilir.
     */
    public static function discount_presets() {
        return apply_filters('fabo_discount_presets', array(
            'student'  => array('label' => 'Öğrenci indirimi', 'percent' => 90, 'fixed' => true),
            'graduate' => array('label' => 'Yeni mezun',       'percent' => 50, 'fixed' => true),
            'custom'   => array('label' => 'Özel indirim',     'percent' => 0,  'fixed' => false),
        ));
    }

    /** İndirim türü + (özelse) girilen yüzde → ['percent'=>int,'label'=>string] veya WP_Error */
    public static function resolve_discount($type, $amount) {
        $presets = self::discount_presets();

        // Kaldırılan eski türler (açık kalmış eski bir sekmeden gelirse)
        if (in_array($type, array('free', 'percent', 'fixed'), true)) {
            return new WP_Error('oldtype', 'Bu ekran güncellendi. Sayfayı yenileyip Öğrenci indirimi / Yeni mezun / Özel seçeneklerinden birini seçin.');
        }
        if (!isset($presets[$type])) return new WP_Error('badtype', 'Geçersiz indirim türü.');

        // Sabit oranlı (Öğrenci / Yeni mezun) — oran filtreyle değiştirilebildiği için
        // burada da doğrulanır; hatalı filtre %0 veya %120 kupon üretmesin.
        if (!empty($presets[$type]['fixed'])) {
            $pc = (int) round(floatval($presets[$type]['percent']));
            if ($pc < 1 || $pc > 100) return new WP_Error('badpreset', 'Tanımlı indirim oranı geçersiz (1–100 olmalı).');
            return array('percent' => $pc, 'label' => $presets[$type]['label']);
        }

        $pc = (int) round(floatval($amount));
        if ($pc < 1 || $pc > 100) return new WP_Error('badamount', 'Özel indirim için 1–100 arası bir yüzde girin.');
        return array('percent' => $pc, 'label' => $presets[$type]['label']);
    }

    /** İndirim türü <option> listesi (tek kaynak — tüm ekranlar bunu kullanır) */
    public static function preset_options_html($selected = 'student') {
        $out = '';
        foreach (self::discount_presets() as $key => $p) {
            $label = $p['label'] . (!empty($p['fixed']) ? ' (%' . intval($p['percent']) . ')' : ' (% gir)');
            $out .= '<option value="' . esc_attr($key) . '"' . selected($selected, $key, false) . '>' . esc_html($label) . '</option>';
        }
        return $out;
    }

    /* ---------------------------------------------------------------------
     *  Kuponu hesaba kilitle
     * ------------------------------------------------------------------- */

    /**
     * Kupon, yalnızca tanımlandığı kullanıcının HESABINDA geçerlidir.
     *
     * WooCommerce'in kendi "e-posta kısıtlaması" yeterli DEĞİLDİR: o kısıtlama
     * sepetteki FATURA e-postasına bakar, yani kodu ele geçiren biri o e-postayı
     * fatura alanına yazıp kuponu kullanabilirdi. Bu yüzden kupona sahibinin
     * kullanıcı ID'si (_oes_coupon_user) yazılır ve burada giriş yapmış kullanıcı
     * ile karşılaştırılır.
     */
    public function restrict_coupon_to_owner($valid, $coupon, $discounts = null) {
        if (!is_a($coupon, 'WC_Coupon')) return $valid;
        $owner = (int) $coupon->get_meta('_oes_coupon_user');
        if (!$owner) return $valid; // bizim kuponumuz değil → dokunma

        // Kimin adına doğrulanıyor? Sepet/ödeme → giriş yapan kullanıcı.
        // Yönetici bir SİPARİŞE elle kupon eklediğinde ise siparişin müşterisi
        // bakılmalı; yoksa müşterinin kendi kuponu yöneticide reddedilirdi.
        $customer_id = get_current_user_id();
        if ($discounts && method_exists($discounts, 'get_object')) {
            $obj = $discounts->get_object();
            if (is_a($obj, 'WC_Order')) {
                $customer_id = (int) $obj->get_customer_id();
            }
        }

        if ($customer_id !== $owner) {
            throw new Exception('Bu kupon kişiye özeldir ve yalnızca tanımlandığı hesapta kullanılabilir. Lütfen kuponun tanımlandığı hesapla giriş yap.');
        }

        // NOT: "Tüm eğitimler" kuponu eğitim olmayan bir sepete uygulanırsa ayrıca
        // kontrol etmeye gerek yok — WC, limit_all_courses_coupon() her ürünü
        // elediği için "Bu kupon seçili ürünlerde geçerli değil" hatasını kendisi verir.
        return $valid;
    }

    /**
     * "Tüm eğitimler" kapsamlı kuponda ürün kısıtı yoktur (yeni eğitimler de kapsansın diye),
     * bu yüzden WC onu sepetteki HER ürüne uygulardı. Burada eğitim olmayan ürünlere
     * (varsa) uygulanması engellenir.
     */
    public function limit_all_courses_coupon($valid, $product, $coupon) {
        if (!is_a($coupon, 'WC_Coupon') || $coupon->get_meta('_oes_coupon_all_courses') !== 'yes') {
            return $valid;
        }
        if (!is_a($product, 'WC_Product')) return $valid;
        $pid = $product->get_parent_id() ? $product->get_parent_id() : $product->get_id();
        // Yalnızca DARALT: gelen $valid false ise (WC'nin hariç tutulan ürün/kategori/
        // indirimli ürün kuralları) onu true'ya çevirme.
        return $valid && get_post_meta($pid, '_oes_is_course', true) === 'yes';
    }

    /**
     * Bu özellikten ÖNCE verilmiş kuponlarda _oes_coupon_user yoktur; onlar yalnızca
     * WC'nin (fatura e-postasına bakan, dolayısıyla aşılabilen) kısıtlamasıyla korunur.
     * oes_documents tablosundaki kod → kullanıcı eşlemesinden tek seferlik doldurulur.
     */
    public function maybe_backfill_coupon_owners() {
        if (get_option('oes_coupon_owner_backfill') === 'done') return;
        if (!function_exists('wc_get_coupon_id_by_code') || !class_exists('WC_Coupon')) return;

        global $wpdb;
        $t = $wpdb->prefix . 'oes_documents';
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return;

        $rows = $wpdb->get_results(
            "SELECT user_id, coupon_code FROM {$t} WHERE coupon_code IS NOT NULL AND coupon_code <> '' AND user_id > 0"
        );
        if (is_array($rows)) {
            foreach ($rows as $r) {
                $id = wc_get_coupon_id_by_code($r->coupon_code);
                if (!$id) continue;
                $c = new WC_Coupon($id);
                if ($c->get_meta('_oes_coupon_user')) continue;
                $c->update_meta_data('_oes_coupon_user', (int) $r->user_id);
                $c->save();
            }
        }
        update_option('oes_coupon_owner_backfill', 'done', false);
    }

    /* ---------------------------------------------------------------------
     *  Yardımcılar
     * ------------------------------------------------------------------- */

    /** Belgelerin gönderileceği e-posta (ayar yoksa site yöneticisi) */
    public static function delivery_email() {
        $e = get_option('oes_documents_email', '');
        return $e ? $e : get_option('admin_email');
    }

    /** Bir kullanıcının kendi belgeleri (öğrenci panelinde "Belgelerim") */
    public static function get_user_documents($user_id, $limit = 50) {
        global $wpdb;
        $t = $wpdb->prefix . 'oes_documents';
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$t} WHERE user_id = %d ORDER BY id DESC LIMIT %d", $user_id, $limit));
    }

    /** Tüm belgeler (kullanıcı bilgisiyle) — admin + eğitmen paneli listesi için */
    public static function get_all($limit = 200) {
        global $wpdb;
        $t = $wpdb->prefix . 'oes_documents';
        return $wpdb->get_results($wpdb->prepare(
            "SELECT d.*, u.display_name, u.user_email
             FROM {$t} d LEFT JOIN {$wpdb->users} u ON u.ID = d.user_id
             ORDER BY d.id DESC LIMIT %d", $limit));
    }

    /**
     * Kupon kapsamı etiketi. 0 = tüm eğitimler.
     */
    public static function course_label($course_id) {
        return $course_id ? get_the_title($course_id) : 'Tüm eğitimler';
    }

    /** Kupon kapsamının bağlantısı (tüm eğitimlerde mağaza sayfası) */
    public static function course_link($course_id) {
        if ($course_id) return get_permalink($course_id);
        $shop = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : '';
        return $shop ? $shop : home_url('/');
    }

    /**
     * Kurs ürünleri için <option> listesi.
     * İlk seçenek (value 0) VARSAYILANDIR — kuponda "Tüm eğitimler" anlamına gelir.
     * $zero_label ile başka bağlamlarda etiketi değiştirilebilir (ör. sertifika
     * kuralında "— eğitim seç —"), çünkü orada 0 "tümü" demek DEĞİLDİR.
     */
    public static function course_options_html($selected = 0, $zero_label = 'Tüm eğitimler') {
        $q = new WP_Query(array(
            'post_type'      => 'product',
            'post_status'    => array('publish', 'draft'),
            'posts_per_page' => -1,
            'meta_key'       => '_oes_is_course',
            'meta_value'     => 'yes',
            'orderby'        => 'title',
            'order'          => 'ASC',
            'fields'         => 'ids',
            'no_found_rows'  => true,
        ));
        $out = '<option value="0"' . selected($selected, 0, false) . '>' . esc_html($zero_label) . '</option>';
        foreach ($q->posts as $pid) {
            $out .= '<option value="' . intval($pid) . '"' . selected($selected, $pid, false) . '>' . esc_html(get_the_title($pid)) . '</option>';
        }
        return $out;
    }

    /* ---------------------------------------------------------------------
     *  Yükleme (öğrenci paneli)
     * ------------------------------------------------------------------- */

    public function ajax_upload_document() {
        check_ajax_referer(self::NONCE_UPLOAD, 'nonce');
        if (!is_user_logged_in()) wp_send_json_error('Giriş yapmalısınız.');
        $user = wp_get_current_user();

        if (empty($_FILES['file'])) wp_send_json_error('Dosya bulunamadı.');
        $file = $_FILES['file'];
        if ($file['size'] > 10 * 1024 * 1024) wp_send_json_error('Dosya 10MB\'dan büyük olamaz.');
        if (!is_uploaded_file($file['tmp_name'])) wp_send_json_error('Geçersiz yükleme.');

        $allowed = array('pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx');
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed, true)) wp_send_json_error('Desteklenmeyen dosya türü. (PDF, görsel veya Word)');

        require_once ABSPATH . 'wp-admin/includes/file.php';
        $up = wp_handle_upload($file, array('test_form' => false));
        if (isset($up['error'])) wp_send_json_error($up['error']);

        $note = sanitize_textarea_field(wp_unslash($_POST['note'] ?? ''));

        global $wpdb;
        $wpdb->insert($wpdb->prefix . 'oes_documents', array(
            'user_id'    => $user->ID,
            'file_url'   => esc_url_raw($up['url']),
            'file_name'  => sanitize_file_name($file['name']),
            'note'       => $note,
            'status'     => 'pending',
            'created_at' => current_time('mysql'),
        ));
        $doc_id = (int) $wpdb->insert_id;

        $this->notify_new_document($user, $up['url'], $file['name'], $note);

        wp_send_json_success(array(
            'id'      => $doc_id,
            'message' => 'Belgen alındı. İncelendikten sonra sana özel eğitim kuponu tanımlanacak.',
        ));
    }

    /** Belge yüklenince yetkiliye e-posta — YENİ e-posta sistemi gelene kadar doğrudan gönderilir (bildirim susturmasından bağımsız). */
    private function notify_new_document($user, $url, $name, $note) {
        $to = self::delivery_email();
        if (!$to) return;
        $subject = 'Yeni belge yüklendi — ' . $user->display_name;
        $body  = '<p><strong>' . esc_html($user->display_name) . '</strong> (' . esc_html($user->user_email) . ') bir belge yükledi.</p>';
        if ($note !== '') $body .= '<p><strong>Not:</strong> ' . nl2br(esc_html($note)) . '</p>';
        $body .= '<p><a href="' . esc_url($url) . '">Belgeyi görüntüle / indir (' . esc_html($name) . ')</a></p>';
        $body .= '<p style="color:#888;font-size:12px;">wp-admin → Online Kurs Sistemi → Belgeler ekranından kupon tanımlayabilirsiniz.</p>';
        wp_mail($to, $subject, $body, array('Content-Type: text/html; charset=UTF-8'));
    }

    /* ---------------------------------------------------------------------
     *  Kupon tanımla (Süper Eğitmen / Yönetici)
     * ------------------------------------------------------------------- */

    public function ajax_issue_coupon() {
        check_ajax_referer(self::NONCE_MANAGE, 'nonce');
        if (!class_exists('OES_Teacher') || !OES_Teacher::is_super_teacher()) {
            wp_send_json_error('Bu işlem yalnızca yönetici ve süper eğitmenlere açıktır.');
        }
        $doc_id    = intval($_POST['doc_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        $type      = sanitize_key($_POST['type'] ?? ''); // geçerliliği resolve_discount denetler
        $amount    = floatval($_POST['amount'] ?? 0);
        $expiry    = max(0, intval($_POST['expiry_days'] ?? 0));

        global $wpdb;
        $t   = $wpdb->prefix . 'oes_documents';
        $doc = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$t} WHERE id = %d", $doc_id));
        if (!$doc) wp_send_json_error('Belge bulunamadı.');
        // $course_id = 0 → tüm eğitimlerde geçerli (varsayılan)

        $user = get_userdata($doc->user_id);
        $code = $this->create_coupon($user, $course_id, $type, $amount, $expiry);
        if (is_wp_error($code)) wp_send_json_error($code->get_error_message());

        $wpdb->update($t, array(
            'status'      => 'coupon_issued',
            'coupon_code' => $code,
            'course_id'   => $course_id,
        ), array('id' => $doc_id));

        // Kullanıcıya push bildirim (varsa)
        if (class_exists('OES_Push')) {
            OES_Push::send_to_user($doc->user_id, '🎟️ Eğitim kuponun hazır',
                self::course_label($course_id) . ' için kupon kodun: ' . $code,
                self::course_link($course_id), 'doc-coupon-' . $doc_id);
        }

        // Kullanıcıya kupon e-postası (işlemsel)
        $this->send_coupon_email($user, $course_id, $type, $amount, $code);

        wp_send_json_success(array(
            'code'    => $code,
            'course'  => self::course_label($course_id),
            'message' => 'Kupon oluşturuldu (' . self::course_label($course_id) . '): ' . $code,
        ));
    }

    /**
     * Belge OLMADAN doğrudan kupon tanımla (Süper Eğitmen / Yönetici).
     * Aynı kullanıcıya istediğin kadar kupon verebilirsin — belge yüklemesi gerekmez.
     */
    public function ajax_issue_coupon_direct() {
        check_ajax_referer(self::NONCE_MANAGE, 'nonce');
        if (!class_exists('OES_Teacher') || !OES_Teacher::is_super_teacher()) {
            wp_send_json_error('Bu işlem yalnızca yönetici ve süper eğitmenlere açıktır.');
        }
        $email     = sanitize_email($_POST['email'] ?? '');
        $course_id = intval($_POST['course_id'] ?? 0);
        $type      = sanitize_key($_POST['type'] ?? ''); // geçerliliği resolve_discount denetler
        $amount    = floatval($_POST['amount'] ?? 0);
        $expiry    = max(0, intval($_POST['expiry_days'] ?? 0));

        if (!is_email($email)) wp_send_json_error('Geçerli bir e-posta girin.');
        // $course_id = 0 → tüm eğitimlerde geçerli (varsayılan)
        $user = get_user_by('email', $email);
        if (!$user) wp_send_json_error('Bu e-posta ile kayıtlı kullanıcı bulunamadı.');

        $code = $this->create_coupon($user, $course_id, $type, $amount, $expiry);
        if (is_wp_error($code)) wp_send_json_error($code->get_error_message());

        // Kayıt için (listede görünsün) hafif bir belge satırı aç
        global $wpdb;
        $wpdb->insert($wpdb->prefix . 'oes_documents', array(
            'user_id'     => $user->ID,
            'file_url'    => '',
            'file_name'   => '(doğrudan kupon)',
            'note'        => 'Belge olmadan doğrudan tanımlandı',
            'status'      => 'coupon_issued',
            'coupon_code' => $code,
            'course_id'   => $course_id,
            'created_at'  => current_time('mysql'),
        ));

        if (class_exists('OES_Push')) {
            OES_Push::send_to_user($user->ID, '🎟️ Eğitim kuponun hazır',
                self::course_label($course_id) . ' için kupon kodun: ' . $code,
                self::course_link($course_id), 'coupon-direct-' . $user->ID);
        }
        $this->send_coupon_email($user, $course_id, $type, $amount, $code);

        wp_send_json_success(array('code' => $code, 'message' => 'Kupon oluşturuldu (' . self::course_label($course_id) . '): ' . $code));
    }

    /** Kullanıcıya kupon e-postası (işlemsel — bildirim susturmasından bağımsız) */
    private function send_coupon_email($user, $course_id, $type, $amount, $code) {
        if (!$user || !$user->user_email) return;
        $course_id = intval($course_id);
        $ct = self::course_label($course_id);
        $d  = self::resolve_discount($type, $amount);
        if (is_wp_error($d)) return;
        $desc = ($d['percent'] >= 100) ? 'ücretsiz' : '%' . $d['percent'] . ' indirimli';
        // Kapsam: tek eğitim mi, tüm eğitimler mi?
        $scope_line  = $course_id
            ? '<p><strong>' . esc_html($ct) . '</strong> eğitimini <strong>' . $desc . '</strong> almak için kupon kodun:</p>'
            : '<p><strong>Tüm eğitimlerde</strong> geçerli <strong>' . $desc . '</strong> kupon kodun:</p>';
        $scope_note  = $course_id ? 'yalnızca bu eğitim için' : 'dilediğin bir eğitimde';
        $subject = 'Eğitim kuponun hazır — ' . $ct;
        $body = '<p>Merhaba ' . esc_html($user->display_name) . ',</p>'
            . $scope_line
            . '<p style="font-size:22px;font-weight:800;letter-spacing:1px;background:#f2f6fb;border:1px dashed #c3d0e0;border-radius:10px;padding:12px 16px;display:inline-block;">' . esc_html($code) . '</p>'
            . '<p>Sepette bu kodu girerek indirimini uygula. Kupon <strong>tek kullanımlıktır</strong>, ' . $scope_note . ' ve '
            . '<strong>yalnızca senin hesabında</strong> geçerlidir — başkasına verilirse çalışmaz.</p>'
            . '<p>Bu yüzden alışverişini <strong>' . esc_html($user->user_email) . '</strong> hesabınla giriş yapmış olarak tamamla.</p>'
            . '<p><a href="' . esc_url(self::course_link($course_id)) . '">' . ($course_id ? 'Eğitime git' : 'Eğitimlere göz at') . '</a></p>';
        wp_mail($user->user_email, $subject, $body, array('Content-Type: text/html; charset=UTF-8'));
    }

    /**
     * WooCommerce kuponu üretir. Kişiye özeldir:
     *  - $course_id > 0 → yalnızca o eğitimde (product_ids); $course_id = 0 → tüm eğitimlerde
     *    (ürün kısıtı yok + _oes_coupon_all_courses meta → limit_all_courses_coupon)
     *  - tek kullanımlık (usage_limit 1)
     *  - kullanıcının e-postasına kısıtlı (WC'nin kendi kontrolü)
     *  - VE kullanıcının hesabına kilitli (_oes_coupon_user → restrict_coupon_to_owner)
     * Üç indirim de yüzde tabanlıdır (bkz. discount_presets).
     */
    private function create_coupon($user, $course_id, $type, $amount, $expiry_days = 0) {
        if (!class_exists('WC_Coupon')) return new WP_Error('nowc', 'WooCommerce bulunamadı.');
        $course_id = intval($course_id);
        // $course_id = 0 → tüm eğitimler (varsayılan). Tek eğitim seçildiyse var olmalı.
        if ($course_id && (!function_exists('wc_get_product') || !wc_get_product($course_id))) {
            return new WP_Error('noproduct', 'Eğitim bulunamadı.');
        }
        if (!$user || !$user->ID) return new WP_Error('nouser', 'Kullanıcı bulunamadı.');

        $d = self::resolve_discount($type, $amount);
        if (is_wp_error($d)) return $d;

        // Tahmin edilemez rastgele kod (prefix yok)
        $code   = strtoupper(wp_generate_password(10, false, false));
        $coupon = new WC_Coupon();
        $coupon->set_code($code);
        $coupon->set_discount_type('percent');
        $coupon->set_amount($d['percent']);
        $coupon->set_individual_use(true);
        if ($course_id) {
            $coupon->set_product_ids(array($course_id));
        } else {
            // Tüm eğitimler: ürün kısıtı yok; kapsam is_valid_for_product filtresiyle
            // EĞİTİM ürünleriyle sınırlanır (yeni açılan eğitimler de kendiliğinden kapsanır).
            $coupon->update_meta_data('_oes_coupon_all_courses', 'yes');
        }
        $coupon->set_usage_limit(1);
        $coupon->set_usage_limit_per_user(1);
        if ($user->user_email) {
            $coupon->set_email_restrictions(array($user->user_email));
        }
        // Hesaba kilit: kod paylaşılsa bile başka hesapta çalışmaz
        $coupon->update_meta_data('_oes_coupon_user', (int) $user->ID);
        $coupon->set_description(
            $d['label'] . ' %' . $d['percent'] . ' — ' . self::course_label($course_id) . ' (' . $user->user_email . ')'
        );
        // Son kullanma (opsiyonel): bugünden itibaren N gün geçerli
        if ($expiry_days > 0) {
            $coupon->set_date_expires(time() + ($expiry_days * DAY_IN_SECONDS));
        }
        $coupon->save();
        return $code;
    }

    public function ajax_delete_document() {
        check_ajax_referer(self::NONCE_MANAGE, 'nonce');
        if (!class_exists('OES_Teacher') || !OES_Teacher::is_super_teacher()) {
            wp_send_json_error('Yetkiniz yok.');
        }
        $doc_id = intval($_POST['doc_id'] ?? 0);
        global $wpdb;
        $wpdb->delete($wpdb->prefix . 'oes_documents', array('id' => $doc_id));
        wp_send_json_success(array('message' => 'Belge silindi.'));
    }

    /* ---------------------------------------------------------------------
     *  wp-admin "Belgeler" sayfası
     * ------------------------------------------------------------------- */

    public function add_admin_menu() {
        add_submenu_page('online-kurs-sistemi', 'Belgeler', 'Belgeler', 'manage_options', 'oes-belgeler', array($this, 'render_admin'));
    }

    public function render_admin() {
        if (!current_user_can('manage_options')) return;

        // E-posta ayarını kaydet
        if (isset($_POST['oes_docs_save_email']) && check_admin_referer('oes_docs_settings')) {
            update_option('oes_documents_email', sanitize_email($_POST['oes_documents_email'] ?? ''));
            echo '<div class="notice notice-success is-dismissible"><p>E-posta adresi kaydedildi.</p></div>';
        }

        $docs  = self::get_all();
        $email = get_option('oes_documents_email', '');
        $nonce = wp_create_nonce(self::NONCE_MANAGE);
        $ajax  = admin_url('admin-ajax.php');
        $copts = self::course_options_html();
        $topts = self::preset_options_html();
        ?>
        <div class="wrap fabo-wrap">
          <div class="fabo-head"><div>
          <h1>Belgeler</h1>
          <p>Kullanıcıların yüklediği belgeler. İncele ve ilgili kullanıcıya bir eğitim için indirim kuponu tanımla:
             <strong>Öğrenci indirimi (%90)</strong>, <strong>Yeni mezun (%50)</strong> veya <strong>Özel</strong> (yüzdeyi sen girersin).
             Kapsam varsayılan olarak <strong>tüm eğitimlerdir</strong>; listeden tek bir eğitim seçersen kupon yalnızca onda geçerli olur.
             Üretilen kod <strong>kişiye özeldir</strong>: yalnızca o kullanıcının hesabında ve bir kez çalışır —
             kod başkasına verilse bile kullanılamaz. Aynı kullanıcıya sonradan tekrar kupon tanımlayabilirsin.</p>
          </div></div><?php // /.fabo-head ?>

          <form method="post" style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:16px;max-width:520px;margin:14px 0;">
            <?php wp_nonce_field('oes_docs_settings'); ?>
            <label style="font-weight:600;display:block;margin-bottom:6px;">Belgelerin gönderileceği e-posta</label>
            <input type="email" name="oes_documents_email" value="<?php echo esc_attr($email); ?>" placeholder="<?php echo esc_attr(get_option('admin_email')); ?>" class="regular-text">
            <p class="description">Boş bırakılırsa site yöneticisi e-postası (<?php echo esc_html(get_option('admin_email')); ?>) kullanılır.</p>
            <button type="submit" name="oes_docs_save_email" class="button button-primary" style="margin-top:8px;">Kaydet</button>
          </form>

          <div style="background:#fff;border:1px solid #dcdcde;border-radius:8px;padding:16px;margin:0 0 16px;max-width:760px;">
            <h2 style="margin-top:0;font-size:15px;">Doğrudan kupon tanımla <span style="font-weight:400;color:#777;font-size:12px;">(belge gerekmez)</span></h2>
            <p class="description" style="margin-top:0;">Bir kullanıcıya kupon üret. Kapsam varsayılan olarak tüm eğitimlerdir; istersen tek bir eğitim seç. Aynı kişiye istediğin kadar kupon verebilirsin — tekrar belge yüklemesi gerekmez.</p>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
              <input type="email" id="dcEmail" placeholder="Kullanıcı e-postası" class="regular-text" style="min-width:210px;">
              <select id="dcCourse"><?php echo $copts; ?></select>
              <select id="dcType"><?php echo $topts; ?></select>
              <input type="number" id="dcAmount" placeholder="Yüzde (1-100)" min="1" max="100" style="width:110px;" disabled>
              <input type="number" id="dcExpiry" placeholder="Geçerlilik (gün)" style="width:120px;" title="Boş = süresiz">
              <button type="button" class="button button-primary" id="dcBtn">Kupon oluştur</button>
              <span id="dcResult" style="font-weight:600;"></span>
            </div>
          </div>

          <table class="widefat striped" style="margin-top:10px;">
            <thead><tr><th>Kullanıcı</th><th>Belge</th><th>Not</th><th>Tarih</th><th>Durum</th><th style="width:260px;">İşlem</th></tr></thead>
            <tbody>
            <?php if (empty($docs)): ?>
              <tr><td colspan="6">Henüz belge yüklenmemiş.</td></tr>
            <?php else: foreach ($docs as $d):
              $issued = ($d->status === 'coupon_issued'); ?>
              <tr data-doc="<?php echo intval($d->id); ?>">
                <td><strong><?php echo esc_html($d->display_name ?: '—'); ?></strong><br><span style="color:#888;font-size:12px;"><?php echo esc_html($d->user_email); ?></span></td>
                <td><a href="<?php echo esc_url($d->file_url); ?>" target="_blank" rel="noopener"><?php echo esc_html($d->file_name ?: 'Belge'); ?></a></td>
                <td style="max-width:220px;"><?php echo $d->note ? nl2br(esc_html($d->note)) : '—'; ?></td>
                <td><?php echo esc_html(date_i18n('d M Y H:i', strtotime($d->created_at))); ?></td>
                <td>
                  <?php if ($issued): ?>
                    <span style="color:#0f6e56;font-weight:600;">Kupon verildi</span><br><code><?php echo esc_html($d->coupon_code); ?></code>
                  <?php else: ?>
                    <span style="color:#b26a00;">Bekliyor</span>
                  <?php endif; ?>
                </td>
                <td>
                  <?php // Kupon verilmiş olsa bile tekrar tanımlanabilir (yeni kod üretilir) ?>
                  <button type="button" class="button button-primary docs-coupon-btn"><?php echo $issued ? 'Yeni kupon tanımla' : 'Kupon tanımla'; ?></button>
                  <button type="button" class="button docs-del-btn">Sil</button>
                  <div class="docs-coupon-form" style="display:none;margin-top:8px;background:#f6f7f7;border:1px solid #dcdcde;border-radius:6px;padding:10px;">
                    <select class="docs-course" style="width:100%;margin-bottom:6px;"><?php echo $copts; ?></select>
                    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;">
                      <select class="docs-type"><?php echo $topts; ?></select>
                      <input type="number" class="docs-amount" placeholder="Yüzde (1-100)" min="1" max="100" style="width:110px;" disabled>
                      <input type="number" class="docs-expiry" placeholder="Geçerlilik (gün)" style="width:120px;" title="Boş = süresiz">
                    </div>
                    <button type="button" class="button button-primary docs-issue">Kupon oluştur</button>
                    <span class="docs-result" style="margin-left:8px;"></span>
                  </div>
                </td>
              </tr>
            <?php endforeach; endif; ?>
            </tbody>
          </table>
        </div>

        <script>
        (function(){
          var AJAX=<?php echo wp_json_encode($ajax); ?>, NONCE=<?php echo wp_json_encode($nonce); ?>;
          function post(data){var body='';for(var k in data)body+=(body?'&':'')+k+'='+encodeURIComponent(data[k]);
            return fetch(AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'}).then(function(r){return r.json();});}
          document.querySelectorAll('.docs-coupon-btn').forEach(function(b){b.addEventListener('click',function(){
            var f=b.parentNode.querySelector('.docs-coupon-form'); f.style.display=f.style.display==='none'?'block':'none';});});
          // Yüzde alanı yalnızca "Özel" seçilince açılır (diğerleri sabit oranlı)
          document.querySelectorAll('.docs-type').forEach(function(s){s.addEventListener('change',function(){
            var a=s.parentNode.querySelector('.docs-amount'); a.disabled=(s.value!=='custom'); if(a.disabled)a.value='';});});
          document.querySelectorAll('.docs-issue').forEach(function(b){b.addEventListener('click',function(){
            var row=b.closest('tr'), form=b.closest('.docs-coupon-form');
            var course=form.querySelector('.docs-course').value, type=form.querySelector('.docs-type').value, amount=form.querySelector('.docs-amount').value, expiry=form.querySelector('.docs-expiry').value;
            var res=form.querySelector('.docs-result');
            // course = "0" → tüm eğitimler (varsayılan), seçim zorunlu değil
            b.disabled=true;res.textContent='Oluşturuluyor…';res.style.color='#555';
            post({action:'oes_issue_document_coupon',nonce:NONCE,doc_id:row.getAttribute('data-doc'),course_id:course,type:type,amount:amount,expiry_days:expiry}).then(function(r){
              b.disabled=false;
              if(r&&r.success){res.textContent=r.data.message;res.style.color='#0f6e56';setTimeout(function(){location.reload();},900);}
              else{res.textContent=(r&&r.data)||'Hata';res.style.color='#b32d2e';}
            }).catch(function(){b.disabled=false;res.textContent='Bağlantı hatası';res.style.color='#b32d2e';});
          });});
          document.querySelectorAll('.docs-del-btn').forEach(function(b){b.addEventListener('click',function(){
            if(!confirm('Bu belgeyi silmek istediğine emin misin?'))return; var row=b.closest('tr'); b.disabled=true;
            post({action:'oes_delete_document',nonce:NONCE,doc_id:row.getAttribute('data-doc')}).then(function(r){
              if(r&&r.success){row.remove();}else{b.disabled=false;alert((r&&r.data)||'Hata');}
            }).catch(function(){b.disabled=false;alert('Bağlantı hatası');});
          });});
          // Doğrudan kupon (belge gerekmez)
          var dcType=document.getElementById('dcType');
          if(dcType) dcType.addEventListener('change',function(){
            var a=document.getElementById('dcAmount'); a.disabled=(this.value!=='custom'); if(a.disabled)a.value='';});
          var dcBtn=document.getElementById('dcBtn');
          if(dcBtn) dcBtn.addEventListener('click',function(){
            var email=document.getElementById('dcEmail').value.trim(), course=document.getElementById('dcCourse').value,
                type=document.getElementById('dcType').value, amount=document.getElementById('dcAmount').value,
                expiry=document.getElementById('dcExpiry').value, res=document.getElementById('dcResult');
            if(!email){res.textContent='Kullanıcı e-postası gerekli.';res.style.color='#b32d2e';return;}
            dcBtn.disabled=true;res.textContent='Oluşturuluyor…';res.style.color='#555';
            post({action:'oes_issue_coupon_direct',nonce:NONCE,email:email,course_id:course,type:type,amount:amount,expiry_days:expiry}).then(function(r){
              dcBtn.disabled=false;
              if(r&&r.success){res.textContent=r.data.message;res.style.color='#0f6e56';setTimeout(function(){location.reload();},1200);}
              else{res.textContent=(r&&r.data)||'Hata';res.style.color='#b32d2e';}
            }).catch(function(){dcBtn.disabled=false;res.textContent='Bağlantı hatası';res.style.color='#b32d2e';});
          });
        })();
        </script>
        <?php
    }
}

OES_Documents::instance();
