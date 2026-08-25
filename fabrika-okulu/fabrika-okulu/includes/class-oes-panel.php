<?php
/**
 * OES Panel — Tam ekran, tema'dan bağımsız öğrenci paneli (PWA destekli)
 *
 * - /panel adresinde kendi layout'unu basar (tema header/footer yok)
 * - "Hesabım" tıklamasını /panel'e yönlendirir
 * - PWA: manifest + service worker + iOS meta ile kurulabilir uygulama
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Panel {

    private static $instance = null;
    const PANEL_SLUG = 'panel';

    /** @var string 'shell' | 'login' — aktif render modu */
    private $render_mode = 'shell';
    /** @var string aktif sekme */
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

        // "Hesabım"ı panele yönlendir
        add_action('template_redirect', array($this, 'redirect_account_to_panel'), 5);

        // Çıkışta panel giriş ekranına yönlendir
        add_filter('logout_redirect', array($this, 'logout_redirect'), 10, 3);

        // WooCommerce'in header'daki "Hesabım" düğmesi/dropdown'ı gizlensin,
        // linki panele ("Çalışma Odam") dönsün.
        add_action('wp_head', array($this, 'account_link_css'), 99);
        add_action('wp_footer', array($this, 'account_link_js'), 99);

        // Şifre sıfırlama: mail bizim şablonumuzla gitsin, bağlantı ve
        // "girişe dön" adımı wp-login.php yerine bizim ekranımıza düşsün.
        add_filter('retrieve_password_notification_email', array($this, 'password_reset_email'), 10, 4);
        add_filter('lostpassword_url', array($this, 'filter_lostpassword_url'), 10, 2);
        add_action('login_init', array($this, 'intercept_login_screens'));

        // Login/Kayıt/Şifre AJAX (giriş yapmamış kullanıcılar için nopriv)
        add_action('wp_ajax_nopriv_oes_panel_login', array($this, 'ajax_login'));
        add_action('wp_ajax_nopriv_oes_panel_register', array($this, 'ajax_register'));
        add_action('wp_ajax_nopriv_oes_panel_lostpass', array($this, 'ajax_lostpass'));
        add_action('wp_ajax_nopriv_oes_panel_resetpass', array($this, 'ajax_resetpass'));

        // Hesap güncelleme (giriş yapmış kullanıcı)
        add_action('wp_ajax_oes_panel_update_account', array($this, 'ajax_update_account'));

        // Rewrite flush (sürüm bazlı)
        if (get_option('oes_panel_rw_version') !== OES_VERSION) {
            add_action('init', function () {
                flush_rewrite_rules(false);
                update_option('oes_panel_rw_version', OES_VERSION);
            }, 99);
        }
    }

    /* ---------------------------------------------------------------------
     *  Auth: giriş / kayıt / şifre sıfırlama (AJAX)
     * ------------------------------------------------------------------- */

    public function ajax_login() {
        check_ajax_referer('oes_panel_auth', 'nonce');
        $creds = array(
            'user_login'    => sanitize_text_field($_POST['log'] ?? ''),
            'user_password' => (string) ($_POST['pwd'] ?? ''),
            'remember'      => !empty($_POST['remember']),
        );
        if (empty($creds['user_login']) || empty($creds['user_password'])) {
            wp_send_json_error('Lütfen tüm alanları doldurun.');
        }
        $user = wp_signon($creds, is_ssl());
        if (is_wp_error($user)) {
            wp_send_json_error('Kullanıcı adı veya şifre hatalı.');
        }
        wp_send_json_success(array('redirect' => $this->login_redirect_target()));
    }

    /** Giriş/kayıt sonrası hedef: güvenli site-içi ?redirect varsa oraya, yoksa panel. */
    private function login_redirect_target() {
        $r = isset($_POST['redirect']) ? wp_unslash($_POST['redirect']) : '';
        if ($r) {
            $safe = wp_validate_redirect($r, '');
            if ($safe) return $safe;
        }
        return $this->panel_url();
    }

    public function ajax_register() {
        check_ajax_referer('oes_panel_auth', 'nonce');

        // Fabrika Okulu öğrenci kaydı her zaman açık (WP "üyelik" ayarından bağımsız).
        // Filtreyle kapatmak istersen: add_filter('fabo_allow_registration','__return_false');
        if (!apply_filters('fabo_allow_registration', true)) {
            wp_send_json_error('Yeni kayıt şu anda kapalı.');
        }

        $email = sanitize_email($_POST['email'] ?? '');
        $pass  = (string) ($_POST['pwd'] ?? '');
        $pass2 = (string) ($_POST['pwd2'] ?? '');
        // Ad-soyad: panelde ve SERTİFİKADA bu kullanılır (kullanıcı adı değil)
        $fname = sanitize_text_field(wp_unslash($_POST['fname'] ?? ''));
        $lname = sanitize_text_field(wp_unslash($_POST['lname'] ?? ''));

        if (!is_email($email)) {
            wp_send_json_error('Geçerli bir e-posta girin.');
        }
        if (mb_strlen(trim($fname)) < 2) {
            wp_send_json_error('Adınızı girin.');
        }
        if (mb_strlen(trim($lname)) < 2) {
            wp_send_json_error('Soyadınızı girin.');
        }
        if (strlen($pass) < 6) {
            wp_send_json_error('Şifre en az 6 karakter olmalı.');
        }
        if ($pass2 !== '' && $pass !== $pass2) {
            wp_send_json_error('Şifreler eşleşmiyor.');
        }
        if (email_exists($email)) {
            wp_send_json_error('Bu e-posta zaten kayıtlı.');
        }

        // Kullanıcı adı = e-posta'nın @ öncesi (benzersiz hale getir)
        $base = sanitize_user(current(explode('@', $email)), true);
        $username = $base; $i = 1;
        while (username_exists($username)) { $username = $base . $i; $i++; }

        $user_id = wp_create_user($username, $pass, $email);
        if (is_wp_error($user_id)) {
            wp_send_json_error('Kayıt oluşturulamadı. Tekrar deneyin.');
        }

        // Ad-soyad — panelde ve sertifikada görünen isim ("snagncc" değil)
        wp_update_user(array(
            'ID'           => $user_id,
            'first_name'   => $fname,
            'last_name'    => $lname,
            'display_name' => trim($fname . ' ' . $lname),
        ));
        // WooCommerce fatura alanları da dolsun (ödeme ekranı tekrar sormasın)
        update_user_meta($user_id, 'billing_first_name', $fname);
        update_user_meta($user_id, 'billing_last_name', $lname);

        // WooCommerce müşteri rolü
        $user = new WP_User($user_id);
        $user->set_role(get_option('default_role', 'customer') ?: 'customer');

        // Otomatik giriş
        wp_set_current_user($user_id);
        wp_set_auth_cookie($user_id, true, is_ssl());

        wp_send_json_success(array('redirect' => $this->login_redirect_target()));
    }

    public function ajax_lostpass() {
        check_ajax_referer('oes_panel_auth', 'nonce');
        $login = sanitize_text_field($_POST['login'] ?? '');
        if (empty($login)) {
            wp_send_json_error('E-posta veya kullanıcı adı girin.');
        }

        // Şifre sıfırlama — retrieve_password yoksa manuel (wp-login.php include etme, riskli)
        if (function_exists('retrieve_password')) {
            $errors = retrieve_password($login);
            if (is_wp_error($errors)) {
                wp_send_json_error('Sıfırlama bağlantısı gönderilemedi. Bilgileri kontrol edin.');
            }
            wp_send_json_success(array('message' => 'Şifre sıfırlama bağlantısı e-postana gönderildi.'));
        }

        // Manuel fallback
        $user_data = is_email($login) ? get_user_by('email', $login) : get_user_by('login', $login);
        if (!$user_data) {
            wp_send_json_error('Bu bilgilerle kullanıcı bulunamadı.');
        }
        $key = get_password_reset_key($user_data);
        if (is_wp_error($key)) {
            wp_send_json_error('Bağlantı oluşturulamadı. Tekrar deneyin.');
        }
        $reset_url = $this->reset_password_url($key, $user_data->user_login);
        $message = "Merhaba,\n\nŞifreni sıfırlamak için aşağıdaki bağlantıya tıkla:\n$reset_url\n\nBu isteği sen yapmadıysan dikkate alma.";
        wp_mail($user_data->user_email, get_bloginfo('name') . ' - Şifre Sıfırlama', $message);
        wp_send_json_success(array('message' => 'Şifre sıfırlama bağlantısı e-postana gönderildi.'));
    }

    /* ---------------------------------------------------------------------
     *  Şifre sıfırlama — mail + kendi ekranımız (wp-login.php YOK)
     * ------------------------------------------------------------------- */

    /** Giriş ekranı = /panel/ (girişi olmayan kullanıcıya login.php basılıyor). */
    public function login_url($args = array()) {
        $url = $this->panel_url();
        return $args ? add_query_arg($args, $url) : $url;
    }

    /** "Şifremi unuttum" ekranı — giriş kartı doğrudan o sekmeyle açılır. */
    public function lost_password_url() {
        return $this->login_url(array('sifre' => 'unuttum'));
    }

    /**
     * Sıfırlama bağlantısı — wp-login.php değil, bizim giriş ekranımız.
     * NOT: add_query_arg değerleri ZATEN kodluyor; burada rawurlencode ÇİFT
     * kodlamaya yol açar (kullanıcı adında boşluk/@ varsa anahtar tutmaz).
     */
    public function reset_password_url($key, $login) {
        return $this->login_url(array('key' => $key, 'login' => $login));
    }

    /** WP'nin "şifremi unuttum" linkleri de bizim ekranımıza gitsin. */
    public function filter_lostpassword_url($url, $redirect = '') {
        return $this->lost_password_url();
    }

    /**
     * Şifre sıfırlama e-postası — marka şablonu + bizim sıfırlama adresimiz.
     *
     * WP'nin varsayılan düz metin maili wp-login.php'ye gönderiyordu; kullanıcı
     * oradan "giriş yap" deyince wp-admin giriş ekranına düşüyordu.
     */
    public function password_reset_email($defaults, $key, $user_login, $user_data) {
        $reset_url = $this->reset_password_url($key, $user_login);
        $site      = get_bloginfo('name');
        $name      = $user_data instanceof WP_User
            ? ($user_data->first_name ?: $user_data->display_name)
            : $user_login;

        $body = '<p>Merhaba <strong>' . esc_html($name) . '</strong>,</p>'
              . '<p>Hesabın için bir şifre sıfırlama isteği aldık. Yeni şifreni belirlemek '
              . 'için aşağıdaki düğmeye tıkla.</p>'
              . '<p style="font-size:13px;color:#64748b;">Bu bağlantı güvenlik gereği kısa süre '
              . 'geçerlidir. İsteği sen yapmadıysan bu e-postayı yok sayabilirsin — şifren '
              . 'değişmez.</p>';

        if (class_exists('OES_Mail_System')) {
            $message = OES_Mail_System::instance()->get_email_template(
                'Şifreni sıfırla', $body, 'Yeni şifremi belirle', $reset_url
            );
        } else {
            // Mail modülü kapalıysa da HTML gitsin (sade sürüm)
            $message = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#334155;">'
                . '<h2 style="color:#012963;">Şifreni sıfırla</h2>' . $body
                . '<p><a href="' . esc_url($reset_url) . '" style="display:inline-block;padding:12px 26px;'
                . 'background:#012963;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">'
                . 'Yeni şifremi belirle</a></p>'
                . '<p style="font-size:12px;color:#94a3b8;">Düğme çalışmazsa: ' . esc_url($reset_url) . '</p>'
                . '</div>';
        }

        $defaults['subject'] = sprintf('[%s] Şifre sıfırlama', $site);
        $defaults['message'] = $message;
        $defaults['headers'] = array('Content-Type: text/html; charset=UTF-8');
        return $defaults;
    }

    /**
     * wp-login.php'nin şifre ekranlarını bizim ekranımıza taşı.
     *
     * Sadece şifre akışına dokunuyoruz — düz wp-login.php girişi (yönetici için
     * gerekli) olduğu gibi kalıyor.
     */
    public function intercept_login_screens() {
        $action = isset($_REQUEST['action']) ? sanitize_key($_REQUEST['action']) : '';

        // Eski maillerden gelen sıfırlama bağlantısı → bizim ekranımız
        if ($action === 'rp' && !empty($_REQUEST['key']) && !empty($_REQUEST['login'])) {
            wp_safe_redirect($this->reset_password_url(
                sanitize_text_field(wp_unslash($_REQUEST['key'])),
                sanitize_text_field(wp_unslash($_REQUEST['login']))
            ));
            exit;
        }

        // Anahtarsız sıfırlama ekranı / "şifremi unuttum" formu
        if (in_array($action, array('resetpass', 'lostpassword', 'retrievepassword'), true)) {
            wp_safe_redirect($this->lost_password_url());
            exit;
        }

        // "Şifren sıfırlandı, giriş yap" ekranı → bizim giriş ekranımız
        if ($action === '' && isset($_GET['password']) && $_GET['password'] === 'reset') {
            wp_safe_redirect($this->login_url(array('sifirlandi' => 1)));
            exit;
        }
    }

    /** Yeni şifreyi kaydet (sıfırlama ekranından). */
    public function ajax_resetpass() {
        check_ajax_referer('oes_panel_auth', 'nonce');

        $key   = sanitize_text_field(wp_unslash($_POST['key'] ?? ''));
        $login = sanitize_text_field(wp_unslash($_POST['login'] ?? ''));
        $pass  = (string) ($_POST['pwd'] ?? '');
        $pass2 = (string) ($_POST['pwd2'] ?? '');

        if ($key === '' || $login === '') {
            wp_send_json_error('Bağlantı geçersiz. Sıfırlama e-postasını yeniden iste.');
        }
        if (strlen($pass) < 6) {
            wp_send_json_error('Şifre en az 6 karakter olmalı.');
        }
        if ($pass !== $pass2) {
            wp_send_json_error('Şifreler eşleşmiyor.');
        }

        $user = check_password_reset_key($key, $login);
        if (is_wp_error($user)) {
            wp_send_json_error('Bağlantının süresi dolmuş. Sıfırlama e-postasını yeniden iste.');
        }

        reset_password($user, $pass);

        // Kullanıcıyı doğrudan içeri al — "şimdi bir de giriş yap" adımı olmasın.
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID, true, is_ssl());

        wp_send_json_success(array('redirect' => $this->panel_url()));
    }

    /* ---------------------------------------------------------------------
     *  Tema header'ındaki WooCommerce "Hesabım" düğmesi
     * ------------------------------------------------------------------- */

    /**
     * Header'daki hesap dropdown'ını / giriş lightbox'ını gizle.
     *
     * Kullanıcının tek hesap yüzeyi panel ("Çalışma Odam") olacak; temanın
     * (Flatsome) hesap menüsü altındaki WooCommerce bağlantıları görünmemeli.
     */
    public function account_link_css() {
        if (is_admin() || get_query_var('oes_panel')) return;
        ?>
<style id="fabo-account-lock">
.account-item .nav-dropdown,
li.account-item ul.nav-dropdown,
.header-block .account-dropdown,
#header .account-dropdown,
.account-item .nav-dropdown-default,
.account-item > a .icon-angle-down,
.header-account-title + .icon-angle-down { display: none !important; }
.account-item.has-dropdown > a::after { content: none !important; }
</style>
        <?php
    }

    /**
     * Hesap linkini panele çevir, açılır menüyü/lightbox'ı devre dışı bırak.
     *
     * Tema dosyasına dokunmadan çalışır: hesabım adresine giden bağlantıları
     * yakalar, hedefini /panel/ yapar, etiketini oturum durumuna göre yazar ve
     * dropdown tetikleyicilerini (data-open, .open-account) söker.
     *
     * ETİKET: giriş yapmamış kullanıcıya "Giriş Yap / Üye Ol", giriş yapmışa
     * "Çalışma Odam". İki durumda da hedef /panel/ — misafire panel kendi giriş
     * ekranını basıyor, girişliye çalışma odasını.
     */
    public function account_link_js() {
        if (is_admin() || get_query_var('oes_panel')) return;

        $account_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : '';
        $account_path = $account_url ? trim((string) wp_parse_url($account_url, PHP_URL_PATH), '/') : '';
        $label = is_user_logged_in() ? 'Çalışma Odam' : 'Giriş Yap / Üye Ol';
        ?>
<script id="fabo-account-lock-js">
(function(){
  var PANEL = <?php echo wp_json_encode($this->panel_url()); ?>;
  var LABEL = <?php echo wp_json_encode($label); ?>;
  var ACC   = <?php echo wp_json_encode($account_path); ?>;

  function isAccountLink(a){
    var h = a.getAttribute('href') || '';
    // ÇIKIŞ linki de /hesabim/customer-logout/ altındadır — ona DOKUNMA,
    // yoksa "Çıkış yap" düğmesi panele giden bir bağlantıya dönerdi.
    if (h.indexOf('customer-logout') !== -1 || h.indexOf('action=logout') !== -1) return false;
    if (h.indexOf('wp-login.php') !== -1) return false;
    if (ACC && h.indexOf('/' + ACC) !== -1) return true;
    return a.classList.contains('open-account') || a.getAttribute('data-open') === '#login-form-popup';
  }

  /* Etiketi "Çalışma Odam" yap — tema başlığı span içine de koyabiliyor,
     bu yüzden ilk dolu metin düğümü değiştirilir (ikon <i> bozulmasın). */
  function relabel(a){
    var t = a.querySelector('.header-account-title');
    if (t) { t.textContent = LABEL; return; }
    var walker = document.createTreeWalker(a, NodeFilter.SHOW_TEXT, null, false), node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim()) { node.nodeValue = LABEL; return; }
    }
    if (a.children.length === 0) a.textContent = LABEL;
  }

  function fix(){
    document.querySelectorAll('a').forEach(function(a){
      if(!isAccountLink(a)) return;
      a.setAttribute('href', PANEL);
      a.removeAttribute('data-open');       // Flatsome giriş lightbox'ı
      a.classList.remove('open-account');
      relabel(a);
      var li = a.closest('li');
      if (li) {
        li.classList.remove('menu-item-has-children','has-dropdown','current-dropdown');
        var dd = li.querySelector('.nav-dropdown');
        if (dd) dd.parentNode.removeChild(dd);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fix);
  else fix();
})();
</script>
        <?php
    }

    /**
     * Çıkış yapınca ANASAYFAYA dön (giriş ekranına değil).
     * Hem öğrenci hem eğitmen paneli için geçerli — ikisinin çıkış linki de
     * wp_logout_url() üretiyor ve bu filtre hedefi son sözü söylüyor.
     */
    public function logout_redirect($redirect_to, $requested_redirect_to, $user) {
        return home_url('/');
    }

    /**
     * Hesap bilgilerini panelden güncelle (ad, soyad, e-posta, şifre)
     */
    public function ajax_update_account() {
        check_ajax_referer('oes_panel_account', 'nonce');
        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error('Giriş yapmalısınız.');

        $first = sanitize_text_field($_POST['first_name'] ?? '');
        $last  = sanitize_text_field($_POST['last_name'] ?? '');
        $cur_pass = (string) ($_POST['current_pass'] ?? '');
        $new_pass = (string) ($_POST['new_pass'] ?? '');

        $current = wp_get_current_user();

        // Şifre değiştirme istendiyse
        if (!empty($new_pass)) {
            if (strlen($new_pass) < 6) {
                wp_send_json_error('Yeni şifre en az 6 karakter olmalı.');
            }
            // Mevcut şifreyi doğrula
            $check = wp_check_password($cur_pass, $current->user_pass, $user_id);
            if (!$check) {
                wp_send_json_error('Mevcut şifren hatalı.');
            }
        }

        // Güncelle (e-posta değiştirilemez)
        $update = array(
            'ID'         => $user_id,
            'first_name' => $first,
            'last_name'  => $last,
        );
        // Görünen isim de ad-soyad olsun: panelde ve SERTİFİKADA kullanıcı adı
        // ("snagncc") değil, gerçek isim yazsın. Ad-soyad boşsa mevcut ismi bozma.
        $full = trim($first . ' ' . $last);
        if ($full !== '') {
            $update['display_name'] = $full;
            update_user_meta($user_id, 'billing_first_name', $first);
            update_user_meta($user_id, 'billing_last_name', $last);
        }
        if (!empty($new_pass)) {
            $update['user_pass'] = $new_pass;
        }

        $result = wp_update_user($update);
        if (is_wp_error($result)) {
            wp_send_json_error('Güncellenemedi: ' . $result->get_error_message());
        }

        // Şifre değiştiyse oturumu koru
        if (!empty($new_pass)) {
            wp_set_auth_cookie($user_id, true, is_ssl());
        }

        wp_send_json_success(array('message' => 'Bilgilerin güncellendi.'));
    }

    /* ---------------------------------------------------------------------
     *  Rewrite & yönlendirme
     * ------------------------------------------------------------------- */

    public function add_rewrite() {
        add_rewrite_rule('^' . self::PANEL_SLUG . '/?$', 'index.php?oes_panel=1', 'top');
        add_rewrite_rule('^' . self::PANEL_SLUG . '/([^/]+)/?$', 'index.php?oes_panel=1&oes_panel_view=$matches[1]', 'top');
    }

    public function add_query_vars($vars) {
        $vars[] = 'oes_panel';
        $vars[] = 'oes_panel_view';
        return $vars;
    }

    public function panel_url($view = '') {
        $base = home_url('/' . self::PANEL_SLUG . '/');
        if (!$view || $view === 'dashboard' || $view === 'panel') return $base;
        return $base . rawurlencode($view) . '/';
    }

    /**
     * "Hesabım" sayfasına gelindiğinde panele yönlendir.
     */
    public function redirect_account_to_panel() {
        if (is_admin()) return;

        // Hesabım sayfasında mıyız? Üç yöntemle kontrol et (kurulum farklılıklarına karşı)
        $is_account = false;
        if (function_exists('is_account_page') && is_account_page()) {
            $is_account = true;
        }
        // Yedek: hesabım sayfa ID'si ile karşılaştır
        if (!$is_account && function_exists('wc_get_page_id')) {
            $account_id = wc_get_page_id('myaccount');
            if ($account_id > 0 && is_page($account_id)) {
                $is_account = true;
            }
        }
        if (!$is_account) return;

        // KURAL: Kullanıcıya WooCommerce'in hesabım yüzeyi HİÇ gösterilmez —
        // tek yüzey bizim panelimiz ("Çalışma Odam"). Bu yüzden ana sayfa da,
        // alt endpoint'ler de (siparişler, adres, hesap düzenle, indirmeler…)
        // panele yönlenir. İki istisna var:
        //   - customer-logout : WC'nin kendi çıkış akışı çalışmalı
        //   - lost-password   : şifre sıfırlama bizim giriş ekranımıza gider
        if (function_exists('WC') && WC()->query) {
            $endpoint = WC()->query->get_current_endpoint();
            if ($endpoint === 'customer-logout') return;
            if ($endpoint === 'lost-password') {
                // WC'nin sıfırlama bağlantısı da bu endpoint'e düşer
                // (/hesabim/lost-password/?action=rp&key=..&login=..) — anahtarı kaybetme.
                if (!empty($_GET['key']) && !empty($_GET['login'])) {
                    wp_safe_redirect($this->reset_password_url(
                        sanitize_text_field(wp_unslash($_GET['key'])),
                        sanitize_text_field(wp_unslash($_GET['login']))
                    ));
                    exit;
                }
                wp_safe_redirect($this->lost_password_url());
                exit;
            }
        }

        // Sonsuz döngü koruması: zaten panel adresindeysek yönlendirme
        if (get_query_var('oes_panel')) return;

        // Eğitmen (panel yetkisi olan) ise eğitmen paneline yönlendir.
        if (is_user_logged_in() && class_exists('OES_Teacher') && OES_Teacher::can_access_panel()) {
            wp_safe_redirect(home_url('/egitmen/'));
            exit;
        }

        // Diğer herkes öğrenci paneline. Giriş yapmamışsa panel kendi giriş ekranını gösterir.
        wp_safe_redirect($this->panel_url());
        exit;
    }

    /* ---------------------------------------------------------------------
     *  Render
     * ------------------------------------------------------------------- */

    public function maybe_render() {
        if (!get_query_var('oes_panel')) return;

        // Başlangıç sekmesi (?view= ile derin link). Panel SPA olduğundan tüm
        // bölümler basılır; bu yalnızca ilk açılan sekmeyi belirler.
        $view = '';
        if (isset($_GET['view']) && $_GET['view'] !== '') {
            $view = sanitize_key($_GET['view']);
        } elseif (get_query_var('oes_panel_view')) {
            $view = sanitize_key(get_query_var('oes_panel_view'));
        }
        // Eski/yönlendirme anahtarlarını yeni anahtarlara eşle.
        // NOT: görev + sınav artık tek bölüm — "Aksiyonlarım" (aksiyon).
        // Eski mail/push bağlantıları (/panel/gorev/, /panel/sinav/) oraya düşsün.
        $map = array(
            'dashboard' => 'panel', 'egitimlerim' => 'egitim',
            'gorevler' => 'aksiyon', 'gorev' => 'aksiyon',
            'sinavlar' => 'aksiyon', 'sinav' => 'aksiyon',
            'siparisler' => 'siparis',
        );
        if (isset($map[$view])) $view = $map[$view];
        $valid = array('panel', 'egitim', 'takvim', 'aksiyon', 'siparis', 'belge', 'sertifika', 'bildirim', 'hesap', 'anket');
        if (empty($view) || !in_array($view, $valid, true)) $view = 'panel';
        $this->active_view = $view;

        global $wp_query;
        if ($wp_query) $wp_query->is_404 = false;
        status_header(200);
        nocache_headers();

        // Standalone doküman — siteye birebir benzeyen kendi header'ımızla.
        // Giriş yapmamış → v2 login sayfası (aynı marka, AJAX giriş/kayıt).
        if (!is_user_logged_in()) {
            // Şifre sıfırlama bağlantısıyla mı gelindi? (mail → /panel/?key=..&login=..)
            // Anahtar burada doğrulanır; geçersizse form gösterilmez.
            $reset = null;
            if (!empty($_GET['key']) && !empty($_GET['login'])) {
                $rk = sanitize_text_field(wp_unslash($_GET['key']));
                $rl = sanitize_text_field(wp_unslash($_GET['login']));
                $chk = check_password_reset_key($rk, $rl);
                $reset = array(
                    'key'   => $rk,
                    'login' => $rl,
                    'valid' => !is_wp_error($chk),
                );
            }
            // Açılış sekmesi: sıfırlama > şifremi unuttum > giriş
            $start = $reset ? 'reset' : ((isset($_GET['sifre']) && $_GET['sifre'] === 'unuttum') ? 'forgot' : 'login');
            $notice = isset($_GET['sifirlandi']) ? 'Şifren güncellendi. Yeni şifrenle giriş yapabilirsin.' : '';

            include OES_PLUGIN_DIR . 'templates/panel/login.php';
            exit;
        }

        // Eğitmenin öğrenci paneli yok — giriş yaptıysa doğrudan eğitmen paneline gider
        if (class_exists('OES_Teacher') && OES_Teacher::can_access_panel()) {
            wp_safe_redirect(home_url('/egitmen/'));
            exit;
        }

        $user = wp_get_current_user();
        $view = $this->active_view;

        // NOT: Anket artık ayrı bir sayfaya YÖNLENDİRMİYOR — panel normal basılır
        // ve OES_Surveys::render_modal() shell.php'nin sonunda üstüne modal açar.
        // (Kullanıcı isteği: "hangi sayfadaysa o sayfada çıksın".)
        $data = $this->collect_data($user->ID);
        include OES_PLUGIN_DIR . 'templates/panel/shell.php';
        exit;
    }

    /** Panel logosu (ayar → site logosu → placeholder) */
    public function get_logo_url() {
        $custom = get_option('oes_panel_login_logo', '');
        if ($custom) return $custom;
        $custom_logo_id = get_theme_mod('custom_logo');
        if ($custom_logo_id) {
            $src = wp_get_attachment_image_src($custom_logo_id, 'full');
            if ($src) return $src[0];
        }
        return 'https://fabrikaokulu.com.tr/wp-content/uploads/2026/02/FABRIKA_OKULU_yazl_transparan_zemin-1-e1771238992964-898x1024.webp';
    }

    /* ---------------------------------------------------------------------
     *  Veri toplama (mevcut sınıflardan)
     * ------------------------------------------------------------------- */

    private function collect_data($user_id) {
        global $wpdb;

        $course_ids = OES_My_Account::get_user_completed_courses($user_id);
        $courses = array();
        $total_completed_lessons = 0;

        if (!empty($course_ids)) {
            $ids_ph = implode(',', array_fill(0, count($course_ids), '%d'));
            $progress_rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT course_id, COUNT(*) as completed
                     FROM {$wpdb->prefix}oes_progress
                     WHERE user_id = %d AND course_id IN ({$ids_ph}) AND status = 'complete'
                     GROUP BY course_id",
                    array_merge(array($user_id), $course_ids)
                ),
                OBJECT_K
            );

            foreach ($course_ids as $cid) {
                $product = wc_get_product($cid);
                if (!$product) continue;

                // Birleşik ilerleme: video/dosya + sınav + görev (sadece oes_progress değil)
                $pp = class_exists('OES_Player')
                    ? OES_Player::compute_course_progress($cid, $user_id)
                    : array('completed' => (isset($progress_rows[$cid]) ? intval($progress_rows[$cid]->completed) : 0), 'total' => 0, 'percent' => 0);
                $total_lessons = $pp['total'];
                $completed     = $pp['completed'];
                $percent       = $pp['percent'];
                $total_completed_lessons += $completed;

                $courses[] = array(
                    'id'        => $cid,
                    'title'     => $product->get_name(),
                    'image'     => get_the_post_thumbnail_url($cid, 'medium_large') ?: '',
                    'total'     => $total_lessons,
                    'completed' => $completed,
                    'percent'   => $percent,
                    'done'      => ($total_lessons > 0 && $completed >= $total_lessons),
                    'player'    => add_query_arg('oes-player', $cid, home_url('/kurs-izle/')),
                    'permalink' => get_permalink($cid),
                );
            }
        }

        return array(
            'user'            => array(
                'name'    => $user_id ? wp_get_current_user()->display_name : '',
                'email'   => $user_id ? wp_get_current_user()->user_email : '',
                'initial' => mb_strtoupper(mb_substr(wp_get_current_user()->display_name, 0, 1)),
            ),
            'courses'         => $courses,
            'course_count'    => count($courses),
            'lessons_done'    => $total_completed_lessons,
            'calendar'        => $this->collect_calendar($user_id),
            'tasks'           => $this->collect_tasks($user_id),
            'quizzes'         => $this->collect_quizzes($user_id),
            'orders'          => $this->collect_orders($user_id),
        );
    }

    /** Takvim — dönem oturumları + görev son teslimleri + sınav son tarihleri (tarih sıralı) */
    private function collect_calendar($user_id) {
        global $wpdb;
        $events = array();

        // 1) Dönem oturumları (gün gün program)
        if (OES_Module_Manager::is_active('periods')) {
            $rows = $wpdb->get_results($wpdb->prepare("
                SELECT p.schedule, pr.post_title AS course_name
                FROM {$wpdb->prefix}oes_period_enrollments pe
                INNER JOIN {$wpdb->prefix}oes_periods p ON pe.period_id = p.id
                LEFT JOIN {$wpdb->posts} pr ON p.course_id = pr.ID
                WHERE pe.user_id = %d", $user_id));
            foreach ($rows as $r) {
                $schedule = json_decode($r->schedule, true);
                if (is_array($schedule)) foreach ($schedule as $ev) {
                    if (empty($ev['date'])) continue;
                    $events[] = array(
                        'type'   => 'session',
                        'date'   => $ev['date'],
                        'time'   => $ev['time'] ?? '',
                        'title'  => !empty($ev['title']) ? $ev['title'] : ($r->course_name . ' canlı ders'),
                        'course' => $r->course_name,
                        'link'   => $ev['link'] ?? '',
                    );
                }
            }
        }

        $course_ids = OES_My_Account::get_user_completed_courses($user_id);
        if (!empty($course_ids)) {
            $ids_ph = implode(',', array_fill(0, count($course_ids), '%d'));

            // 2) Görev son teslimleri (baz anı + extra_days)
            if (OES_Module_Manager::is_active('assignments')) {
                foreach ($wpdb->get_results($wpdb->prepare("
                    SELECT a.id, a.title, a.extra_days, a.course_id, pr.post_title AS course_name, s.id AS sub_id
                    FROM {$wpdb->prefix}oes_assignments a
                    LEFT JOIN {$wpdb->posts} pr ON a.course_id = pr.ID
                    LEFT JOIN {$wpdb->prefix}oes_assignment_submissions s ON s.assignment_id = a.id AND s.user_id = %d
                    WHERE a.course_id IN ({$ids_ph}) AND a.status = 'active'
                ", array_merge(array($user_id), $course_ids))) as $a) {
                    // TEK KAYNAK: baz (dönem başı saatiyle / kursu ilk açma anı) + extra_days
                    $due_ts = fabo_task_due_ts($user_id, $a->course_id, $a->extra_days);
                    if ($due_ts) {
                        $events[] = array(
                            'type'   => 'assignment',
                            'date'   => date('Y-m-d', $due_ts),
                            'time'   => date('H:i', $due_ts),
                            'title'  => $a->title . ' — son teslim',
                            'course' => $a->course_name,
                            'done'   => !empty($a->sub_id),
                            'link'   => self::player_link($a->course_id, array('gorev' => $a->id)),
                        );
                    }
                }
            }

            // 3) Sınav son tarihleri — GÖRELİ (extra_days) ya da mutlak (end_date)
            if (OES_Module_Manager::is_active('quizzes')) {
                foreach ($wpdb->get_results($wpdb->prepare("
                    SELECT q.id, q.title, q.end_date, q.extra_days, q.course_id, pr.post_title AS course_name,
                           (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d) AS attempts
                    FROM {$wpdb->prefix}oes_quizzes q
                    LEFT JOIN {$wpdb->posts} pr ON q.course_id = pr.ID
                    WHERE q.course_id IN ({$ids_ph}) AND q.status = 'active'
                          AND (q.end_date IS NOT NULL OR q.extra_days > 0)
                ", array_merge(array($user_id), $course_ids))) as $q) {
                    // Göreliyse görevlerle AYNI hesap: baz (dönem başı / kursu ilk açma) + N gün
                    $ts = intval($q->extra_days) > 0
                        ? fabo_task_due_ts($user_id, $q->course_id, $q->extra_days)
                        : fabo_deadline_ts($q->end_date);
                    if (!$ts) continue; // süre başlamamış ya da tarih yok
                    $events[] = array(
                        'type'   => 'quiz',
                        'date'   => date('Y-m-d', $ts),
                        'time'   => date('H:i', $ts),
                        'title'  => $q->title . ' — sınav son tarihi',
                        'course' => $q->course_name,
                        'done'   => intval($q->attempts) > 0,
                        'link'   => self::player_link($q->course_id, array('quiz' => $q->id)),
                    );
                }
            }
        }

        usort($events, function ($a, $b) {
            return strcmp($a['date'] . ($a['time'] ?? ''), $b['date'] . ($b['time'] ?? ''));
        });
        return $events;
    }

    /** Görevler — assignments modülü (son teslim = kayıt/dönem başı + extra_days) */
    private function collect_tasks($user_id) {
        if (!OES_Module_Manager::is_active('assignments')) return array();
        global $wpdb;

        $course_ids = OES_My_Account::get_user_completed_courses($user_id);
        if (empty($course_ids)) return array();
        $ids_ph = implode(',', array_fill(0, count($course_ids), '%d'));

        $rows = $wpdb->get_results($wpdb->prepare("
            SELECT a.id, a.title, a.extra_days, a.course_id, pr.post_title AS course_name,
                   s.status AS sub_status
            FROM {$wpdb->prefix}oes_assignments a
            LEFT JOIN {$wpdb->posts} pr ON a.course_id = pr.ID
            LEFT JOIN {$wpdb->prefix}oes_assignment_submissions s
                   ON s.assignment_id = a.id AND s.user_id = %d
            WHERE a.course_id IN ({$ids_ph}) AND a.status = 'active'
        ", array_merge(array($user_id), $course_ids)));

        $tasks = array();
        foreach ($rows as $r) {
            $status = 'pending'; $label = 'Bekliyor';
            if ($r->sub_status === 'graded') { $status = 'graded'; $label = 'Değerlendirildi'; }
            elseif ($r->sub_status) { $status = 'submitted'; $label = 'Teslim edildi'; }

            // TEK KAYNAK: baz (dönem başı saatiyle / kursu ilk açma anı) + extra_days
            $due_ts = fabo_task_due_ts($user_id, $r->course_id, $r->extra_days);
            $due    = $due_ts ? date('Y-m-d', $due_ts) : '';

            $tasks[] = array(
                'id'     => $r->id,
                'title'  => $r->title,
                'course_id' => intval($r->course_id),
                'course'    => $r->course_name,
                'due'    => $due,
                'due_time' => $due_ts ? date('H:i', $due_ts) : '',
                'due_ts'   => $due_ts ?: 0,
                'status' => $status,
                'label'  => $label,
                // Görev doğrudan player'daki akışında açılır (panelde ikinci bir liste yok)
                'link'   => self::player_link($r->course_id, array('gorev' => $r->id)),
            );
        }
        // Son teslim ANINA göre sırala (tarihsizler sona). Aynı gün içindeki görevler
        // saatlerine göre sıralansın diye tarih değil timestamp kullanılır.
        usort($tasks, function ($a, $b) {
            if (!$a['due_ts']) return 1;
            if (!$b['due_ts']) return -1;
            return $a['due_ts'] <=> $b['due_ts'];
        });
        return $tasks;
    }

    /** Sınavlar — quizzes modülü */
    private function collect_quizzes($user_id) {
        if (!OES_Module_Manager::is_active('quizzes')) return array();
        global $wpdb;

        $course_ids = OES_My_Account::get_user_completed_courses($user_id);
        if (empty($course_ids)) return array();
        $ids_ph = implode(',', array_fill(0, count($course_ids), '%d'));

        $rows = $wpdb->get_results($wpdb->prepare("
            SELECT q.id, q.title, q.pass_score, q.max_attempts, q.end_date, q.extra_days,
                   q.course_id, pr.post_title AS course_name,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d AND status='completed') AS attempts,
                   (SELECT MAX(score) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d AND status='completed') AS best
            FROM {$wpdb->prefix}oes_quizzes q
            LEFT JOIN {$wpdb->posts} pr ON q.course_id = pr.ID
            WHERE q.course_id IN ({$ids_ph}) AND q.status = 'active'
            ORDER BY q.created_at DESC
        ", array_merge(array($user_id, $user_id), $course_ids)));

        $quizzes = array();
        foreach ($rows as $r) {
            $taken = intval($r->attempts) > 0;
            $passed = $taken && $r->best !== null && ($r->pass_score == 0 || $r->best >= $r->pass_score);

            // Son tarih: göreliyse görevlerle AYNI hesap (baz + N gün), değilse mutlak
            $due_ts = intval($r->extra_days) > 0
                ? fabo_task_due_ts($user_id, $r->course_id, $r->extra_days)
                : fabo_deadline_ts($r->end_date);

            $quizzes[] = array(
                'id'     => intval($r->id),
                'title'  => $r->title,
                'course_id' => intval($r->course_id),
                'course'    => $r->course_name,
                'taken'  => $taken,
                'passed' => $passed,
                'best'   => $r->best !== null ? round($r->best) : null,
                'due'      => $due_ts ? date('Y-m-d', $due_ts) : '',
                'due_time' => $due_ts ? date('H:i', $due_ts) : '',
                'due_ts'   => $due_ts ?: 0,
                // Sınav da player akışında çözülür (eski WC endpoint'i kaldırıldı)
                'link'   => self::player_link($r->course_id, array('quiz' => $r->id)),
            );
        }
        return $quizzes;
    }

    /* ---------------------------------------------------------------------
     *  Panel ikonları — assets/img/panel/*.png (şeffaf, 500x500, renkli)
     *
     *  Listede olmayan bölüm Tabler webfont ikonuyla devam eder; böylece ikon
     *  seti eksik kaldığı yerde menü bozulmaz.
     *
     *  NOT: mavi zeminli header düğmesinde (.hicon) bu PNG'ler KULLANILMAZ —
     *  ikonların açık mavi dolgusu #5baecf zemine karışıyor. Orada aynı çizimin
     *  currentColor'lı SVG sürümü var (OES_Notifications::icon_mono).
     * ------------------------------------------------------------------- */

    /** Bölüm anahtarı → dosya adı. */
    private static $icons = array(
        'bildirim'       => 'mesajlarim.png',
        'aksiyon'        => 'aksiyonlar.png',
        'sertifika'      => 'sertifika.png',
        'siparis'        => 'satinalma-gecmisi.png',
        'hesap'          => 'ayarlar.png',
        'egitim'         => 'devam-eden-program.png',
        'yeni-program'   => 'yeni-program.png',
        'bitmis-program' => 'bitmis-program.png',
        // Dosyası var ama henüz bölümü yok: kitaplik.png, notlar.png
    );

    public static function icon_url($key) {
        if (!isset(self::$icons[$key])) return '';
        $rel = 'assets/img/panel/' . self::$icons[$key];
        return OES_PLUGIN_URL . $rel . '?v=' . oes_asset_ver($rel);
    }

    /**
     * İkon HTML'i. PNG yoksa $fallback_ti (Tabler sınıfı) basılır.
     * @param string $key         Bölüm anahtarı
     * @param string $fallback_ti ör. 'ti-calendar'
     */
    public static function icon($key, $fallback_ti = '', $class = 'fabo-ic') {
        $url = self::icon_url($key);
        if (!$url) {
            return $fallback_ti ? '<i class="ti ' . esc_attr($fallback_ti) . '"></i>' : '';
        }
        return '<img class="' . esc_attr($class) . '" src="' . esc_url($url) . '" alt="" aria-hidden="true">';
    }

    /** Player'da belirli bir içeriği açan adres (görev: gorev=ID, sınav: quiz=ID). */
    public static function player_link($course_id, $args = array()) {
        return add_query_arg(
            array_merge(array('oes-player' => intval($course_id)), $args),
            home_url('/kurs-izle/')
        );
    }

    /** Siparişler — WooCommerce */
    private function collect_orders($user_id) {
        if (!function_exists('wc_get_orders')) return array();
        $orders = wc_get_orders(array('customer_id' => $user_id, 'limit' => 20, 'orderby' => 'date', 'order' => 'DESC'));
        $out = array();
        foreach ($orders as $order) {
            $items = array();
            foreach ($order->get_items() as $item) {
                $items[] = $item->get_name();
            }
            $out[] = array(
                'number' => $order->get_order_number(),
                'date'   => $order->get_date_created() ? $order->get_date_created()->date_i18n('d M Y') : '',
                'status' => wc_get_order_status_name($order->get_status()),
                'status_key' => $order->get_status(),
                'total'  => $order->get_formatted_order_total(),
                'items'  => $items,
            );
        }
        return $out;
    }

    public function get_icon_url() {
        // Önce ayar, sonra site ikonu (favicon), sonra placeholder
        $custom = get_option('oes_panel_icon');
        if ($custom) return $custom;
        $site_icon = get_site_icon_url(512);
        if ($site_icon) return $site_icon;
        return OES_PLUGIN_URL . 'assets/img/panel-icon.png';
    }
}

OES_Panel::instance();
