<?php
/**
 * OES Teacher Panel — Eğitmen paneli (/egitmen/)
 *
 * Öğrenci panelinden (/panel/) ayrı, tam ekran, tema'dan bağımsız.
 * Aynı görsel dil (panel.css / oesp-* sınıfları) kullanılır.
 * Erişim: yalnızca `oes_teacher` rolü (veya yönetici).
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher_Panel {

    private static $instance = null;
    const SLUG = 'egitmen';
    const RW_VERSION = 'tp4'; // rewrite kuralları değişince artır (PWA rule'ları kaldırıldı)

    /** @var string aktif view */
    private $active_view = 'dashboard';

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('init', array($this, 'add_rewrite'));
        add_filter('query_vars', array($this, 'add_query_vars'));
        add_action('template_redirect', array($this, 'maybe_render'), 1);

        // Eğitmen girişi (nopriv)
        add_action('wp_ajax_nopriv_oes_teacher_login', array($this, 'ajax_login'));
        add_action('wp_ajax_nopriv_oes_teacher_lostpass', array($this, 'ajax_lostpass'));

        // Rewrite flush (bir kez)
        if (get_option('oes_teacher_panel_rw') !== self::RW_VERSION) {
            add_action('init', function () {
                flush_rewrite_rules(false);
                update_option('oes_teacher_panel_rw', self::RW_VERSION);
            }, 99);
        }
    }

    /* ---------------------------------------------------------------------
     *  Rewrite
     * ------------------------------------------------------------------- */

    public function add_rewrite() {
        add_rewrite_rule('^' . self::SLUG . '/?$', 'index.php?oes_teacher_panel=1', 'top');
        add_rewrite_rule('^' . self::SLUG . '/([^/]+)/?$', 'index.php?oes_teacher_panel=1&oes_teacher_view=$matches[1]', 'top');
    }

    public function add_query_vars($vars) {
        $vars[] = 'oes_teacher_panel';
        $vars[] = 'oes_teacher_view';
        return $vars;
    }

    public function panel_url($view = '') {
        $base = home_url('/' . self::SLUG . '/');
        if (!$view || $view === 'dashboard') return $base;
        return $base . rawurlencode($view) . '/';
    }

    /* ---------------------------------------------------------------------
     *  Auth (AJAX)
     * ------------------------------------------------------------------- */

    public function ajax_login() {
        check_ajax_referer('oes_teacher_auth', 'nonce');

        $login = sanitize_text_field($_POST['log'] ?? '');
        $pass  = (string) ($_POST['pwd'] ?? '');
        $remember = !empty($_POST['remember']);

        if ($login === '' || $pass === '') {
            wp_send_json_error('Lütfen tüm alanları doldurun.');
        }

        // Önce kimlik doğrula (çerez set etmeden)
        $user = wp_authenticate($login, $pass);
        if (is_wp_error($user)) {
            wp_send_json_error('Kullanıcı adı veya şifre hatalı.');
        }

        // Eğitmen mi? (yönetici de girebilir)
        if (!OES_Teacher::can_access_panel($user->ID)) {
            wp_send_json_error('Bu alana yalnızca eğitmenler girebilir.');
        }

        // Girişi tamamla
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID, $remember, is_ssl());

        wp_send_json_success(array('redirect' => $this->panel_url()));
    }

    public function ajax_lostpass() {
        check_ajax_referer('oes_teacher_auth', 'nonce');
        $login = sanitize_text_field($_POST['login'] ?? '');
        if ($login === '') {
            wp_send_json_error('E-posta veya kullanıcı adı girin.');
        }
        if (function_exists('retrieve_password')) {
            $result = retrieve_password($login);
            if (is_wp_error($result)) {
                wp_send_json_error('Sıfırlama bağlantısı gönderilemedi. Bilgileri kontrol edin.');
            }
        }
        // Bilgi ifşasını önlemek için her durumda aynı mesaj
        wp_send_json_success(array('message' => 'Kayıtlıysa şifre sıfırlama bağlantısı e-postana gönderildi.'));
    }

    /* ---------------------------------------------------------------------
     *  Render
     * ------------------------------------------------------------------- */

    public function maybe_render() {
        if (!get_query_var('oes_teacher_panel')) return;

        // Giriş yok → v1 eğitmen login sayfası (AJAX giriş)
        if (!is_user_logged_in()) {
            include OES_PLUGIN_DIR . 'templates/teacher/login.php';
            exit;
        }
        // Eğitmen değil → erişim yok ekranı
        if (!OES_Teacher::can_access_panel()) {
            $this->render_no_access();
            exit;
        }

        // View tespiti (+ eski→yeni eşleme)
        $view = '';
        if (isset($_GET['view']) && $_GET['view'] !== '') $view = sanitize_key($_GET['view']);
        elseif (get_query_var('oes_teacher_view')) $view = sanitize_key(get_query_var('oes_teacher_view'));
        $map = array('gorevler' => 'gonderim', 'sinavlar' => 'gonderim', 'duyuru' => 'dashboard');
        if (isset($map[$view])) $view = $map[$view];
        if (empty($view)) $view = 'dashboard';
        $valid = array('dashboard', 'kurslarim', 'editor', 'detay', 'ogrenciler', 'gonderim', 'sorular', 'bildirim', 'belgeler', 'anketler', 'sertifika', 'takvim', 'hesap');
        if (!in_array($view, $valid, true)) $view = 'dashboard';
        $this->active_view = $view;

        global $wp_query;
        if ($wp_query) $wp_query->is_404 = false;
        status_header(200);
        nocache_headers();

        $user = wp_get_current_user();
        $data = $this->collect_data($user->ID, $view);

        // Gömülü mod (wp-admin iframe): header/nav olmadan yalnızca görünüm
        if (!empty($_GET['embed'])) {
            include OES_PLUGIN_DIR . 'templates/teacher/embed.php';
            exit;
        }

        include OES_PLUGIN_DIR . 'templates/teacher/shell.php';
        exit;
    }

    private function render_no_access() {
        status_header(200); nocache_headers();
        $home = home_url('/');
        echo '<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Erişim yok</title>'
           . '<style>body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:#f5f7fa;color:#12233a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}'
           . '.box{background:#fff;border:1px solid #e3e8ef;border-radius:16px;padding:40px;max-width:420px;box-shadow:0 8px 30px rgba(20,43,86,.08)}h1{font-size:20px;color:#194977;margin:0 0 8px}p{color:#5a6577;font-size:14px;line-height:1.6;margin:0}a{display:inline-block;margin-top:18px;background:#194977;color:#fff;padding:11px 20px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px}</style></head><body>'
           . '<div class="box"><h1>Eğitmen paneline erişim yok</h1><p>Bu alana yalnızca eğitmen yetkisi olan hesaplar girebilir. Eğitmen olduğunu düşünüyorsan yöneticiyle iletişime geç.</p>'
           . '<a href="' . esc_url($home) . '">Anasayfaya dön</a></div></body></html>';
    }

    /* Marka / logo yardımcıları */
    public function get_icon_url() {
        $custom = get_option('oes_panel_icon');
        if ($custom) return $custom;
        $site_icon = get_site_icon_url(512);
        if ($site_icon) return $site_icon;
        return OES_PLUGIN_URL . 'assets/img/panel-icon.png';
    }

    public function get_logo_url() {
        $custom = get_option('oes_panel_login_logo', '');
        if ($custom) return $custom;
        $lid = get_theme_mod('custom_logo');
        if ($lid) { $src = wp_get_attachment_image_src($lid, 'full'); if ($src) return $src[0]; }
        return 'https://fabrikaokulu.com.tr/wp-content/uploads/2026/02/FABRIKA_OKULU_yazl_transparan_zemin-1-e1771238992964-898x1024.webp';
    }

    public function get_active_view() { return $this->active_view; }

    /* ---------------------------------------------------------------------
     *  Veri toplama
     * ------------------------------------------------------------------- */

    private function collect_data($user_id, $view) {
        global $wpdb;

        $user = get_userdata($user_id);
        $name = trim($user->first_name . ' ' . $user->last_name);
        if ($name === '') $name = $user->display_name ?: $user->user_login;

        $course_ids = OES_Teacher::get_teacher_course_ids($user_id);

        $data = array(
            'user' => array(
                'id'      => $user_id,
                'name'    => $name,
                'email'   => $user->user_email,
                'initial' => mb_strtoupper(mb_substr($name, 0, 1)),
                'first'   => $user->first_name,
                'last'    => $user->last_name,
            ),
            'course_ids'          => $course_ids,
            'course_count'        => count($course_ids),
            'student_count'       => 0,
            'pending_assignments' => 0,
            'pending_quizzes'     => 0,
            'courses'             => array(),
        );

        if (!empty($course_ids)) {
            $ph = implode(',', array_fill(0, count($course_ids), '%d'));

            // Aktif öğrenci sayısı (benzersiz)
            $data['student_count'] = (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(DISTINCT user_id) FROM {$wpdb->prefix}oes_enrollments
                 WHERE status = 'active' AND course_id IN ($ph)",
                $course_ids
            ));

            // Değerlendirme bekleyen görev gönderimleri
            if (OES_Module_Manager::is_active('assignments')) {
                $data['pending_assignments'] = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_assignment_submissions s
                     INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id
                     WHERE s.status = 'pending' AND a.is_graded = 1 AND a.course_id IN ($ph)",
                    $course_ids
                ));
            }

            // Değerlendirme bekleyen (açık uçlu) sınav denemeleri
            if (OES_Module_Manager::is_active('quizzes')) {
                $data['pending_quizzes'] = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts qa
                     INNER JOIN {$wpdb->prefix}oes_quizzes q ON q.id = qa.quiz_id
                     WHERE qa.status = 'pending_review' AND q.course_id IN ($ph)",
                    $course_ids
                ));
            }

            // Kurs kartları (dashboard önizleme + kurslarım için temel)
            foreach ($course_ids as $cid) {
                $product = function_exists('wc_get_product') ? wc_get_product($cid) : null;
                if (!$product) continue;
                $enrolled = (int) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments WHERE status='active' AND course_id = %d",
                    $cid
                ));
                $data['courses'][] = array(
                    'id'       => $cid,
                    'title'    => $product->get_name(),
                    'status'   => get_post_status($cid),
                    'closed'   => (get_post_meta($cid, '_oes_course_closed', true) === 'yes'),
                    'price'    => $product->get_price_html(),
                    'image'    => get_the_post_thumbnail_url($cid, 'medium') ?: '',
                    'students' => $enrolled,
                    'edit'     => $this->panel_url('editor') . '?edit=' . $cid,
                );
            }
        }

        return $data;
    }
}

OES_Teacher_Panel::instance();
