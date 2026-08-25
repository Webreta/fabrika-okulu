<?php
/**
 * Fabrika Okulu — Korumalı ders dosyaları
 *
 * Müfredata eklenen 'file' tipi dersler (PDF / görsel) için:
 *  - Dosya, wp-content/uploads içinde TAHMİN EDİLEMEZ adlı, doğrudan erişime
 *    kapalı bir klasörde saklanır (.htaccess + web.config + rastgele klasör adı).
 *    Medya kütüphanesine EKLENMEZ (oradan herkese açık URL üretilirdi).
 *  - Öğrenciye yalnızca akış (stream) ucundan, oturum + kurs erişimi kontrol
 *    edilerek verilir. Ham URL istemciye hiç gitmez; dosya kurs + bölüm + ders
 *    indeksiyle istenir, sunucu müfredattan gerçek yolu çözer.
 *  - Akış ucu, tarayıcıya doğrudan yapıştırılan isteklere kapalıdır: yalnızca
 *    görüntüleyicinin gönderdiği X-OES-Viewer başlığı olan istekler yanıtlanır.
 *    Böylece dosya sekmede ham olarak açılıp "Farklı kaydet" ile alınamaz.
 *
 * NOT: Ekranı gören bir kullanıcının ekran görüntüsü almasını engellemek
 * teknik olarak mümkün değildir; bu yüzden görüntüleyici öğrenciye özel
 * filigran basar (sızıntı halinde kaynak bellidir).
 */

if (!defined('ABSPATH')) exit;

class OES_Course_Files {

    /** Görüntülenebilir (korunabilir) uzantılar */
    const ALLOWED = array('pdf', 'jpg', 'jpeg', 'png', 'gif', 'webp');

    const MAX_SIZE = 52428800; // 50 MB

    public function __construct() {
        add_action('wp_ajax_oes_tp_upload_protected', array($this, 'ajax_upload'));
        add_action('wp_ajax_oes_stream_file', array($this, 'ajax_stream'));
        add_action('wp_ajax_nopriv_oes_stream_file', array($this, 'ajax_stream_denied'));
    }

    /* ---------------------------------------------------------------------
     *  Korumalı depo
     * ------------------------------------------------------------------- */

    /**
     * Korumalı klasörün mutlak yolu. Yoksa oluşturur ve erişimi kapatır.
     * Klasör adı rastgeledir (option'da saklı) — sunucu .htaccess okumasa bile
     * (nginx) yol tahmin edilemez.
     */
    public static function protected_dir() {
        $key = get_option('oes_protected_files_key', '');
        if (!$key) {
            $key = wp_generate_password(20, false, false);
            update_option('oes_protected_files_key', $key, false);
        }
        $up  = wp_upload_dir();
        $dir = trailingslashit($up['basedir']) . 'oes-korumali-' . $key;

        if (!file_exists($dir)) {
            wp_mkdir_p($dir);
        }

        // Apache / LiteSpeed
        $ht = $dir . '/.htaccess';
        if (!file_exists($ht)) {
            file_put_contents($ht,
                "# Fabrika Okulu — korumalı ders dosyaları. Doğrudan erişim kapalıdır.\n" .
                "<IfModule mod_authz_core.c>\n\tRequire all denied\n</IfModule>\n" .
                "<IfModule !mod_authz_core.c>\n\tOrder deny,allow\n\tDeny from all\n</IfModule>\n"
            );
        }
        // IIS
        $wc = $dir . '/web.config';
        if (!file_exists($wc)) {
            file_put_contents($wc,
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<configuration><system.webServer><authorization>" .
                "<deny users=\"*\" /></authorization></system.webServer></configuration>\n"
            );
        }
        // Dizin listeleme
        $ix = $dir . '/index.php';
        if (!file_exists($ix)) {
            file_put_contents($ix, "<?php // Silence is golden.\n");
        }
        return $dir;
    }

    /** Depo anahtarından (dosya adı) mutlak yol. Yol dışına çıkışa izin vermez. */
    public static function path_for_key($key) {
        $key = basename((string) $key); // dizin geçişi (../) engellenir
        if ($key === '') return '';
        $p = self::protected_dir() . '/' . $key;
        return file_exists($p) ? $p : '';
    }

    /** Uzantı → MIME */
    public static function mime_for($file) {
        $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        $map = array(
            'pdf'  => 'application/pdf',
            'jpg'  => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'png'  => 'image/png',
            'gif'  => 'image/gif',
            'webp' => 'image/webp',
        );
        return $map[$ext] ?? 'application/octet-stream';
    }

    /** Görüntüleyici tipi: pdf | image | none */
    public static function viewer_type($mime) {
        if ($mime === 'application/pdf') return 'pdf';
        if (strpos((string) $mime, 'image/') === 0) return 'image';
        return 'none';
    }

    /**
     * Müfredattaki bir 'file' dersinin akış URL'i (ham dosya yolu ASLA verilmez).
     */
    public static function stream_url($course_id, $s, $l) {
        return add_query_arg(array(
            'action'   => 'oes_stream_file',
            'c'        => (int) $course_id,
            's'        => (int) $s,
            'l'        => (int) $l,
            '_wpnonce' => wp_create_nonce('oes_file_view'),
        ), admin_url('admin-ajax.php'));
    }

    /* ---------------------------------------------------------------------
     *  Yükleme (eğitmen paneli + wp-admin gömülü editör)
     * ------------------------------------------------------------------- */

    public function ajax_upload() {
        if (!check_ajax_referer('oes_teacher_panel', 'nonce', false)) {
            wp_send_json_error('Güvenlik doğrulaması başarısız.');
        }
        if (!is_user_logged_in() || !class_exists('OES_Teacher') || !OES_Teacher::can_access_panel()) {
            wp_send_json_error('Yetkiniz yok.');
        }
        if (empty($_FILES['file'])) {
            wp_send_json_error('Dosya bulunamadı.');
        }
        $file = $_FILES['file'];
        if (!empty($file['error'])) {
            wp_send_json_error('Yükleme başarısız (kod: ' . intval($file['error']) . ').');
        }
        if (!is_uploaded_file($file['tmp_name'])) {
            wp_send_json_error('Geçersiz yükleme.');
        }
        if ($file['size'] > self::MAX_SIZE) {
            wp_send_json_error('Dosya 50MB\'dan büyük olamaz.');
        }

        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, self::ALLOWED, true)) {
            wp_send_json_error('Yalnızca PDF ve görsel (JPG, PNG, GIF, WEBP) yüklenebilir. Bu türler indirilemez şekilde korunabiliyor.');
        }

        // Gerçek içerik kontrolü (uzantı yalanına karşı)
        $check = wp_check_filetype_and_ext($file['tmp_name'], $file['name']);
        if (empty($check['ext']) || !in_array(strtolower($check['ext']), self::ALLOWED, true)) {
            wp_send_json_error('Dosya içeriği türüyle uyuşmuyor.');
        }

        $dir = self::protected_dir();
        // Tahmin edilemez depo adı; orijinal ad ayrıca müfredatta tutulur.
        $key  = wp_generate_password(32, false, false) . '.' . $ext;
        $dest = $dir . '/' . $key;

        if (!@move_uploaded_file($file['tmp_name'], $dest)) {
            wp_send_json_error('Dosya kaydedilemedi. Klasör yazma izinlerini kontrol edin.');
        }
        @chmod($dest, 0644);

        wp_send_json_success(array(
            'file_key'  => $key,
            'file_name' => sanitize_file_name($file['name']),
            'file_mime' => self::mime_for($dest),
        ));
    }

    /* ---------------------------------------------------------------------
     *  Akış (öğrenciye sunum)
     * ------------------------------------------------------------------- */

    public function ajax_stream_denied() {
        status_header(403);
        exit;
    }

    public function ajax_stream() {
        // Yalnızca görüntüleyiciden gelen istekler: URL'i sekmede açıp
        // "farklı kaydet" ile almaya çalışan tarayıcı bu başlığı göndermez.
        if (empty($_SERVER['HTTP_X_OES_VIEWER'])) {
            status_header(403);
            nocache_headers();
            exit('Bu dosya yalnızca ders görüntüleyicisi içinde açılabilir.');
        }
        if (!check_ajax_referer('oes_file_view', '_wpnonce', false)) {
            status_header(403); exit;
        }

        $user_id   = get_current_user_id();
        $course_id = isset($_GET['c']) ? intval($_GET['c']) : 0;
        $s         = isset($_GET['s']) ? intval($_GET['s']) : -1;
        $l         = isset($_GET['l']) ? intval($_GET['l']) : -1;

        if (!$user_id || !$course_id || $s < 0 || $l < 0) { status_header(400); exit; }
        if (!self::can_view($course_id, $user_id)) { status_header(403); exit; }

        $curriculum = get_post_meta($course_id, '_oes_course_curriculum', true) ?: array();
        $lesson = $curriculum[$s]['lessons'][$l] ?? null;
        if (!is_array($lesson) || ($lesson['type'] ?? '') !== 'file') { status_header(404); exit; }

        $path = self::resolve_path($lesson);
        if (!$path) { status_header(404); exit; }

        $mime = self::mime_for($path);
        $size = filesize($path);

        nocache_headers();
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . $size);
        // inline: indirme diyalogu açılmaz (zaten görüntüleyici içinde okunur)
        header('Content-Disposition: inline; filename="' . sanitize_file_name($lesson['file_name'] ?? basename($path)) . '"');
        header('X-Content-Type-Options: nosniff');
        header('X-Robots-Tag: noindex, nofollow, noarchive');
        header('Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('Accept-Ranges: none');

        if (ob_get_level()) { @ob_end_clean(); }
        readfile($path);
        exit;
    }

    /**
     * Müfredat dersinden gerçek dosya yolu.
     * Yeni kayıtlar file_key (korumalı depo) kullanır; eski kayıtlarda
     * file_url (uploads içinde açık dosya) olabilir — geriye dönük çalışır.
     */
    public static function resolve_path($lesson) {
        if (!empty($lesson['file_key'])) {
            $p = self::path_for_key($lesson['file_key']);
            if ($p) return $p;
        }
        if (!empty($lesson['file_url'])) {
            $up   = wp_upload_dir();
            $base = trailingslashit($up['baseurl']);
            $url  = (string) $lesson['file_url'];
            if (strpos($url, $base) === 0) {
                $rel  = ltrim(substr($url, strlen($base)), '/');
                // Dizin geçişi engeli: çözülen yol uploads altında kalmalı
                $abs  = trailingslashit($up['basedir']) . $rel;
                $real = realpath($abs);
                $root = realpath($up['basedir']);
                if ($real && $root && strpos($real, $root) === 0 && is_file($real)) return $real;
            }
        }
        return '';
    }

    /** Öğrenci kursa sahipse, ya da kursun eğitmeni/yöneticiyse görebilir. */
    public static function can_view($course_id, $user_id) {
        if (user_can($user_id, 'manage_options')) return true;
        if (class_exists('OES_Teacher') && OES_Teacher::owns_course($user_id, $course_id)) return true;
        if (class_exists('OES_My_Account')) {
            $courses = OES_My_Account::get_user_completed_courses($user_id);
            if (in_array((int) $course_id, array_map('intval', (array) $courses), true)) return true;
        }
        return false;
    }
}

new OES_Course_Files();
