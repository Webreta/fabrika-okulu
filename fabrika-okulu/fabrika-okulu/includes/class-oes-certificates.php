<?php
/**
 * Fabrika Okulu — Sertifikalar
 *
 * AKIŞ:
 *  1) YÖNETİCİ (yalnızca wp-admin) sertifika TANIMLAR: şablon görseli + üzerinde
 *     "ad soyad" ve "kurs adı" alanlarının konumu + hangi BAŞARIMDA verilebileceği.
 *  2) EĞİTMEN kendi panelinde "Sertifikalar" ekranında, o başarımı sağlamış
 *     öğrencileri listede görür ve ONAYLAYARAK sertifikayı tanımlar (otomatik verilmez).
 *  3) Öğrenciye e-posta + push gider; panelindeki "Belgelerim/Sertifikalarım"da görünür.
 *
 * Sertifika adresi TAHMİN EDİLEMEZ: /sertifika/{64 haneli token}/ — token her
 * verilen sertifika için ayrı üretilir, arama motorlarına kapalıdır. Kimse kurs/kullanıcı
 * id'si deneyerek başkasının sertifikasına ulaşamaz.
 *
 * Sertifika bir GÖRSEL şablon + üzerine yazılan metinlerdir (HTML olarak sunulur;
 * yazdır/PDF tarayıcıdan alınır). Böylece sunucuda PDF kütüphanesi gerekmez.
 */

if (!defined('ABSPATH')) exit;

class OES_Certificates {

    const CPT        = 'fabo_certificate';
    const NONCE      = 'oes_certificates';        // eğitmen paneli (sertifika tanımlama)
    const NONCE_ADMIN = 'oes_certificates_admin'; // wp-admin tanım ekranı — ayrı tutulur
    const RW_VERSION = 'cert1';

    /** Başarım koşulları */
    const COND_ENROLLED  = 'enrolled';   // kursa kayıt oldu
    const COND_STARTED   = 'started';    // kursu açtı / ilk içeriği görüntüledi
    const COND_COMPLETED = 'completed';  // kursu bitirdi (%100)

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('init', array($this, 'register_cpt'));
        add_action('init', array($this, 'add_rewrite'));
        add_action('init', array($this, 'maybe_flush'), 99); // tüm kurallar eklendikten SONRA
        add_filter('query_vars', array($this, 'query_vars'));
        add_action('template_redirect', array($this, 'maybe_render'));

        // wp-admin — klasik yazı ekranı DEĞİL, kendi panelimiz
        add_action('admin_menu', array($this, 'admin_menu'), 25);
        add_action('admin_enqueue_scripts', array($this, 'admin_assets'));
        add_action('admin_post_fabo_cert_save', array($this, 'handle_save'));
        add_action('admin_post_fabo_cert_delete', array($this, 'handle_delete'));

        // Eğitmen paneli: sertifika tanımlama
        add_action('wp_ajax_oes_tp_issue_certificate', array($this, 'ajax_issue'));
        add_action('wp_ajax_oes_tp_revoke_certificate', array($this, 'ajax_revoke'));
    }

    /* =====================================================================
     *  Tanım (CPT) — yalnızca yönetici
     * ================================================================== */

    public function register_cpt() {
        register_post_type(self::CPT, array(
            'labels' => array(
                'name'          => 'Sertifikalar',
                'singular_name' => 'Sertifika',
                'add_new'       => 'Yeni Sertifika',
                'add_new_item'  => 'Yeni Sertifika Tanımla',
                'edit_item'     => 'Sertifikayı Düzenle',
                'menu_name'     => 'Sertifikalar',
            ),
            // Klasik WP yazı arayüzü KAPALI — yönetim kendi panelimizden yapılır
            // (Online Kurs Sistemi → Sertifikalar). CPT yalnızca veri kabıdır.
            'public'             => false,
            'show_ui'            => false,
            'show_in_menu'       => false,
            'supports'           => array('title'),
            // Sertifika tanımı YALNIZCA yöneticiye ait. Tüm yetkiler manage_options'a
            // eşlenir; aksi halde editör/shop_manager gibi roller (edit_others_posts)
            // tanımı silip yeniden adlandırabilirdi.
            'capability_type'    => 'post',
            'capabilities'       => array(
                'edit_post'              => 'manage_options',
                'read_post'              => 'manage_options',
                'delete_post'            => 'manage_options',
                'edit_posts'             => 'manage_options',
                'edit_others_posts'      => 'manage_options',
                'delete_posts'           => 'manage_options',
                'delete_others_posts'    => 'manage_options',
                'publish_posts'          => 'manage_options',
                'read_private_posts'     => 'manage_options',
                'create_posts'           => 'manage_options',
            ),
            'map_meta_cap'       => false,
            'publicly_queryable' => false,
            'has_archive'        => false,
            'rewrite'            => false,
        ));
    }

    /** Tanımlı (yayınlanmış) sertifikalar */
    public static function get_all() {
        return get_posts(array(
            'post_type'      => self::CPT,
            'post_status'    => 'publish',
            'posts_per_page' => -1,
            'orderby'        => 'title',
            'order'          => 'ASC',
        ));
    }

    /**
     * Sertifikada kullanılabilecek yazı tipleri.
     * 'google' dolu olanlar Google Fonts'tan yüklenir (hem admin önizlemesinde hem
     * de sertifika sayfasında AYNI kaynak kullanılır → çıktı birebir aynı olur).
     */
    /**
     * Sertifikada kullanılabilecek yazı tipleri.
     *
     * ÖNEMLİ: Yazı tipleri EKLENTİYE GÖMÜLÜDÜR (assets/fonts/*.ttf) çünkü sertifika
     * metni sunucuda GD ile görselin üstüne basılır — tarayıcı fontu kullanılmaz.
     * Admin önizlemesi de @font-face ile AYNI TTF'i yükler → önizleme = çıktı.
     * ('file' = assets/fonts altındaki dosya, 'css' = @font-face aile adı)
     */
    public static function fonts() {
        return self::font_map();
    }

    private static function font_map() {
        return array(
            // — Başlık / anıtsal
            'cinzel'      => array('grup' => 'Başlık',    'label' => 'Cinzel',             'file' => 'cinzel.ttf'),
            'cinzeldec'   => array('grup' => 'Başlık',    'label' => 'Cinzel Decorative',  'file' => 'cinzeldec.ttf'),
            'marcellus'   => array('grup' => 'Başlık',    'label' => 'Marcellus',          'file' => 'marcellus.ttf'),
            'trajan'      => array('grup' => 'Başlık',    'label' => 'Forum',              'file' => 'forum.ttf'),
            'bebas'       => array('grup' => 'Başlık',    'label' => 'Bebas Neue',         'file' => 'bebas.ttf'),
            'anton'       => array('grup' => 'Başlık',    'label' => 'Anton',              'file' => 'anton.ttf'),
            'oswald'      => array('grup' => 'Başlık',    'label' => 'Oswald',             'file' => 'oswald.ttf'),

            // — Klasik serif
            'playfair'    => array('grup' => 'Serif',     'label' => 'Playfair Display',   'file' => 'playfair.ttf'),
            'cormorant'   => array('grup' => 'Serif',     'label' => 'Cormorant Garamond', 'file' => 'cormorant.ttf'),
            'ebgaramond'  => array('grup' => 'Serif',     'label' => 'EB Garamond',        'file' => 'ebgaramond.ttf'),
            'lora'        => array('grup' => 'Serif',     'label' => 'Lora',               'file' => 'lora.ttf'),
            'merriweather'=> array('grup' => 'Serif',     'label' => 'Merriweather',       'file' => 'merriweather.ttf'),

            // — Modern sans
            'montserrat'  => array('grup' => 'Sans',      'label' => 'Montserrat',         'file' => 'montserrat.ttf'),
            'poppins'     => array('grup' => 'Sans',      'label' => 'Poppins',            'file' => 'poppins.ttf'),
            'raleway'     => array('grup' => 'Sans',      'label' => 'Raleway',            'file' => 'raleway.ttf'),
            'josefin'     => array('grup' => 'Sans',      'label' => 'Josefin Sans',       'file' => 'josefin.ttf'),

            // — El yazısı
            'greatvibes'  => array('grup' => 'El yazısı', 'label' => 'Great Vibes',        'file' => 'GreatVibes-Regular.ttf'),
            'dancing'     => array('grup' => 'El yazısı', 'label' => 'Dancing Script',     'file' => 'dancing.ttf'),
            'pinyon'      => array('grup' => 'El yazısı', 'label' => 'Pinyon Script',      'file' => 'pinyon.ttf'),
            'parisienne'  => array('grup' => 'El yazısı', 'label' => 'Parisienne',         'file' => 'parisienne.ttf'),
            'alexbrush'   => array('grup' => 'El yazısı', 'label' => 'Alex Brush',         'file' => 'alexbrush.ttf'),
            'allura'      => array('grup' => 'El yazısı', 'label' => 'Allura',             'file' => 'allura.ttf'),
            'italianno'   => array('grup' => 'El yazısı', 'label' => 'Italianno',          'file' => 'italianno.ttf'),
            'sacramento'  => array('grup' => 'El yazısı', 'label' => 'Sacramento',         'file' => 'sacramento.ttf'),
            'tangerine'   => array('grup' => 'El yazısı', 'label' => 'Tangerine',          'file' => 'tangerine.ttf'),
        );
    }

    /** Yazı tiplerini grup grup <optgroup> olarak basar */
    public static function font_options_html($selected) {
        $out = ''; $last = null;
        foreach (self::fonts() as $k => $f) {
            if ($f['grup'] !== $last) {
                if ($last !== null) $out .= '</optgroup>';
                $out .= '<optgroup label="' . esc_attr($f['grup']) . '">';
                $last = $f['grup'];
            }
            $out .= '<option value="' . esc_attr($k) . '"' . selected($selected, $k, false) . '>' . esc_html($f['label']) . '</option>';
        }
        if ($last !== null) $out .= '</optgroup>';
        return $out;
    }

    /** Yazı tipinin TTF dosya yolu (sunucu tarafı çizim için) */
    public static function font_path($key) {
        $f = self::fonts();
        $file = isset($f[$key]['file']) ? $f[$key]['file'] : 'montserrat.ttf';
        $p = OES_PLUGIN_DIR . 'assets/fonts/' . $file;
        if (file_exists($p)) return $p;
        $fb = OES_PLUGIN_DIR . 'assets/fonts/montserrat.ttf';
        return file_exists($fb) ? $fb : '';
    }

    /** CSS aile adı (@font-face ile aynı TTF yüklenir → önizleme = çıktı) */
    public static function font_family($key) {
        return 'fabo-' . preg_replace('/[^a-z0-9]/', '', strtolower($key));
    }

    /**
     * Tüm yazı tipleri için @font-face CSS'i.
     * Google Fonts YERİNE eklentiye gömülü TTF'ler kullanılır: sertifika sunucuda
     * bu TTF'lerle çizildiği için önizlemenin de aynı dosyayı kullanması şart.
     */
    public static function fontface_css() {
        $css = '';
        foreach (self::fonts() as $k => $f) {
            $url = OES_PLUGIN_URL . 'assets/fonts/' . $f['file'];
            $css .= "@font-face{font-family:'" . self::font_family($k) . "';src:url('" . esc_url_raw($url) . "') format('truetype');font-display:swap;}";
        }
        return $css;
    }

    /** Admin önizlemesinde kullanılacak CSS font-family */
    public static function font_stack($key) {
        $fonts = self::fonts();
        if (!isset($fonts[$key])) $key = 'montserrat';
        return "'" . self::font_family($key) . "', serif";
    }

    /* =====================================================================
     *  SUNUCU TARAFI ÇİZİM (GD)
     *
     *  Sertifika metni HTML olarak basılMAZ. Aksi halde herkes tarayıcının
     *  geliştirici araçlarıyla ismi değiştirip başkasının adına PDF alabilirdi.
     *  Ad, eğitim adı ve QR sunucuda görselin ÜZERİNE çizilir; tarayıcıya yalnızca
     *  hazır PNG gider — düzenlenebilecek bir metin katmanı yoktur.
     * ================================================================== */

    /** GD ile çizim mümkün mü? (değilse HTML'e düşülür) */
    public static function can_render_image() {
        return function_exists('imagecreatetruecolor') && function_exists('imagettftext') && function_exists('imagettfbbox');
    }

    private static function hex_to_rgb($hex) {
        $hex = ltrim((string) $hex, '#');
        if (strlen($hex) === 3) $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        if (strlen($hex) !== 6) $hex = '194977';
        return array(hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2)));
    }

    /** Şablon görselini GD kaynağına yükler (jpg/png/webp/gif) */
    private static function load_template($path) {
        $info = @getimagesize($path);
        if (!$info) return null;
        switch ($info[2]) {
            case IMAGETYPE_JPEG: return @imagecreatefromjpeg($path);
            case IMAGETYPE_PNG:  return @imagecreatefrompng($path);
            case IMAGETYPE_GIF:  return @imagecreatefromgif($path);
            case IMAGETYPE_WEBP: return function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($path) : null;
        }
        return null;
    }

    /**
     * Bir metni verilen kutuya çizer. Harf aralığı GD'de olmadığı için
     * gerekirse karakter karakter ilerlenir.
     */
    private static function draw_text($im, $text, $f, $W, $H) {
        $font = self::font_path($f['font']);
        if (!$font || $text === '') return;

        $size    = max(1, (float) $f['size']);
        $spacing = (float) $f['spacing'];
        list($r, $g, $b) = self::hex_to_rgb($f['color']);
        $color = imagecolorallocate($im, $r, $g, $b);

        if (!empty($f['caps'])) $text = self::tr_upper($text);

        // Karakter ilerleme genişlikleri (advance). DİKKAT: tek karakterin bbox'ı
        // MÜREKKEP genişliğidir — boşlukta 0 çıkar ve kelimeler birleşirdi. Bu yüzden
        // "önek + karakter" ile "önek" bbox'larının farkı alınır (gerçek ilerleme).
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY);
        $adv = array();
        if (abs($spacing) > 0.01) {
            $prefix = '';
            $prev_w = 0;
            foreach ($chars as $ch) {
                $prefix .= $ch;
                $bb = imagettfbbox($size, 0, $font, $prefix);
                $w  = $bb[2] - $bb[0];
                $adv[] = $w - $prev_w;
                $prev_w = $w;
            }
            // CSS letter-spacing SON harften sonra da boşluk ekler; hizalama
            // tarayıcıda o genişliğe göre yapılır. Önizleme ile çıktı ayrışmasın
            // diye burada da aynı davranış uygulanır (n-1 değil, n kez).
            $width = array_sum($adv) + $spacing * count($chars);
        } else {
            $bb = imagettfbbox($size, 0, $font, $text);
            $width = $bb[2] - $bb[0];
        }

        // Dikey ortalama: büyük harf yüksekliğine göre (tarayıcıdaki gibi)
        $mb = imagettfbbox($size, 0, $font, 'Hg');
        $asc = -$mb[7];
        $desc = $mb[1];
        $x = ($f['x'] / 100) * $W;
        $y = ($f['y'] / 100) * $H + ($asc - ($asc + $desc) / 2);

        if ($f['align'] === 'center')     $x -= $width / 2;
        elseif ($f['align'] === 'right')  $x -= $width;

        // Kalınlık: değişken fontların varsayılan kalınlığı 400 → 600/700 için
        // hafif kalınlaştırma (aynı metni komşu piksellere basma)
        $bold = ($f['weight'] === '700') ? 0.7 : (($f['weight'] === '600') ? 0.35 : 0);

        $draw = function ($dx, $dy) use ($im, $size, $font, $color, $chars, $adv, $spacing, $x, $y) {
            if (abs($spacing) > 0.01) {
                $cx = $x;
                foreach ($chars as $i => $ch) {
                    imagettftext($im, $size, 0, (int) round($cx + $dx), (int) round($y + $dy), $color, $font, $ch);
                    $cx += $adv[$i] + $spacing; // ölçümle AYNI ilerleme
                }
            } else {
                imagettftext($im, $size, 0, (int) round($x + $dx), (int) round($y + $dy), $color, $font, implode('', $chars));
            }
        };
        $draw(0, 0);
        if ($bold > 0) { $draw($bold, 0); $draw(0, $bold); $draw($bold, $bold); }
    }

    /** QR kodu görselin üstüne çizer (sunucuda üretilir) */
    private static function draw_qr($im, $url, $qr, $W, $H) {
        $file = OES_PLUGIN_DIR . 'includes/vendor/qrcode.php';
        if (!file_exists($file)) return;
        require_once $file;
        if (!class_exists('QRCode')) return;

        // NOT: Bu kütüphane hata durumunda istisna DEĞİL, E_USER_ERROR tetikler —
        // yani isteği anında öldürür ve yarım PNG kalır. Bu yüzden yakalamaya
        // çalışmak yerine girdi baştan sınırlanır (QR kapasitesi sınırlıdır).
        $url = (string) $url;
        if ($url === '' || strlen($url) > 900) return;

        $code = QRCode::getMinimumQRCode($url, QR_ERROR_CORRECT_LEVEL_M);
        if (!$code) return;

        $n    = $code->getModuleCount();
        $size = max(40, (int) $qr['size']);
        $cell = max(1, (int) floor($size / ($n + 2)));   // 1 modül kaç piksel
        $quiet = $cell;                                   // sessiz alan
        $full = $n * $cell + $quiet * 2;

        $x0 = (int) round(($qr['x'] / 100) * $W - $full / 2);
        $y0 = (int) round(($qr['y'] / 100) * $H - $full / 2);

        $white = imagecolorallocate($im, 255, 255, 255);
        $black = imagecolorallocate($im, 0, 0, 0);
        imagefilledrectangle($im, $x0, $y0, $x0 + $full, $y0 + $full, $white);
        for ($row = 0; $row < $n; $row++) {
            for ($col = 0; $col < $n; $col++) {
                if (!$code->isDark($row, $col)) continue;
                $px = $x0 + $quiet + $col * $cell;
                $py = $y0 + $quiet + $row * $cell;
                imagefilledrectangle($im, $px, $py, $px + $cell - 1, $py + $cell - 1, $black);
            }
        }
    }

    /**
     * Sertifikayı PNG olarak üretir ve doğrudan çıktılar.
     * Metin buraya gömülür → istemcide değiştirilemez.
     */
    private function output_png($cert_id, $name, $course, $verify_url) {
        $c    = self::get_config($cert_id);
        $path = $c['template'] ? get_attached_file($c['template']) : '';
        if (!$path || !file_exists($path) || !self::can_render_image()) { status_header(404); exit; }

        $im = self::load_template($path);
        if (!$im) { status_header(500); exit; }

        // Şeffaf şablonlar siyaha basmasın
        if (function_exists('imagesavealpha')) { imagealphablending($im, true); imagesavealpha($im, true); }

        $W = imagesx($im); $H = imagesy($im);
        self::draw_text($im, $name,   $c['name'],   $W, $H);
        self::draw_text($im, $course, $c['course'], $W, $H);
        if (!empty($c['qr']['enabled']) && $verify_url !== '') {
            self::draw_qr($im, $verify_url, $c['qr'], $W, $H);
        }

        nocache_headers();
        header('Content-Type: image/png');
        header('X-Robots-Tag: noindex, nofollow, noarchive');
        header('Content-Disposition: inline; filename="sertifika.png"');
        if (ob_get_level()) { @ob_end_clean(); }
        imagepng($im);
        imagedestroy($im);
        exit;
    }

    /**
     * TÜRKÇE büyük harf: i → İ, ı → I.
     * mb_strtoupper 'i' harfini 'I' yapardı; admin önizlemesi JS tarafında
     * toLocaleUpperCase('tr-TR') kullandığı için önizleme ile çıktı ayrışırdı.
     */
    public static function tr_upper($s) {
        $s = str_replace(array('i', 'ı'), array('İ', 'I'), (string) $s);
        return mb_strtoupper($s, 'UTF-8');
    }

    /** Sertifika ayarları (alan konumları + kural) */
    public static function get_config($cert_id) {
        $fields = get_post_meta($cert_id, '_fabo_cert_fields', true);
        $rule   = get_post_meta($cert_id, '_fabo_cert_rule', true);
        if (!is_array($fields)) $fields = array();
        if (!is_array($rule))   $rule   = array();

        $d = array('x' => 50, 'y' => 50, 'size' => 32, 'color' => '#194977', 'align' => 'center', 'weight' => '700', 'font' => 'playfair', 'italic' => 0, 'caps' => 0, 'spacing' => 0);
        return array(
            'template' => (int) get_post_meta($cert_id, '_fabo_cert_template', true),
            'name'     => wp_parse_args(isset($fields['name']) && is_array($fields['name']) ? $fields['name'] : array(), $d),
            'course'   => wp_parse_args(isset($fields['course']) && is_array($fields['course']) ? $fields['course'] : array(), array_merge($d, array('y' => 65, 'size' => 22, 'weight' => '600', 'font' => 'montserrat'))),
            // QR kod (doğrulama bağlantısı) — konum/boyut buradan ayarlanır
            'qr'       => wp_parse_args(isset($fields['qr']) && is_array($fields['qr']) ? $fields['qr'] : array(),
                            array('enabled' => 0, 'x' => 88, 'y' => 82, 'size' => 120)),
            'rule'     => wp_parse_args($rule, array('scope' => 'all', 'course_id' => 0, 'condition' => self::COND_COMPLETED)),
        );
    }

    /* =====================================================================
     *  ÖZGÜN YÖNETİM PANELİ (klasik WP yazı ekranı DEĞİL)
     *  Online Kurs Sistemi → Sertifikalar
     * ================================================================== */

    public function admin_menu() {
        add_submenu_page(
            'online-kurs-sistemi', 'Sertifikalar', 'Sertifikalar',
            'manage_options', 'oes-sertifikalar', array($this, 'render_admin')
        );
    }

    public function admin_assets($hook) {
        if (strpos((string) $hook, 'oes-sertifikalar') === false) return;
        wp_enqueue_media(); // şablon görseli seçimi
        wp_enqueue_style('fabo-admin', OES_PLUGIN_URL . 'assets/css/fabo-admin.css',
            array(), oes_asset_ver('assets/css/fabo-admin.css'));
        // Önizleme, sertifikanın SUNUCUDA çizildiği TTF'lerin aynısını yükler
        // (Google Fonts değil) → önizleme ile basılan çıktı ayrışmaz.
        wp_register_style('fabo-cert-fonts', false, array(), OES_VERSION);
        wp_enqueue_style('fabo-cert-fonts');
        wp_add_inline_style('fabo-cert-fonts', self::fontface_css());
    }

    public static function admin_url_for($args = array()) {
        return add_query_arg(array_merge(array('page' => 'oes-sertifikalar'), $args), admin_url('admin.php'));
    }

    /** Bu sertifikadan kaç tane verilmiş? */
    public static function issued_count($cert_id) {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_certificates WHERE cert_id = %d", $cert_id));
    }

    public function render_admin() {
        if (!current_user_can('manage_options')) return;
        if (isset($_GET['edit']) || isset($_GET['new'])) {
            $this->render_edit(isset($_GET['edit']) ? intval($_GET['edit']) : 0);
        } elseif (isset($_GET['sekme']) && $_GET['sekme'] === 'verilenler') {
            $this->render_issued();
        } else {
            $this->render_list();
        }
    }

    /** Ortak sekme çubuğu: Tasarımlar | Verilenler */
    private function tabs($active) {
        $total = (int) wp_count_posts(self::CPT)->publish;
        global $wpdb;
        $issued = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}oes_certificates");
        ?>
        <div class="fabo-tabs">
            <a class="fabo-tab<?php echo $active === 'tasarim' ? ' active' : ''; ?>" href="<?php echo esc_url(self::admin_url_for()); ?>">
                Sertifika tasarımları <span class="count"><?php echo $total; ?></span>
            </a>
            <a class="fabo-tab<?php echo $active === 'verilenler' ? ' active' : ''; ?>" href="<?php echo esc_url(self::admin_url_for(array('sekme' => 'verilenler'))); ?>">
                Verilen sertifikalar <span class="count"><?php echo $issued; ?></span>
            </a>
        </div>
        <?php
    }

    /**
     * Sistemde VERİLMİŞ tüm sertifikalar — kim, hangi eğitim, kim verdi, ne zaman.
     * Yönetici buradan hepsini görür, açar ve gerekirse geri alır.
     */
    private function render_issued() {
        global $wpdb;

        $q_cert = isset($_GET['cert']) ? intval($_GET['cert']) : 0;
        $search = isset($_GET['s']) ? sanitize_text_field(wp_unslash($_GET['s'])) : '';

        $where = array('1=1'); $args = array();
        if ($q_cert) { $where[] = 'c.cert_id = %d'; $args[] = $q_cert; }
        if ($search !== '') {
            $where[] = '(u.display_name LIKE %s OR u.user_email LIKE %s)';
            $like = '%' . $wpdb->esc_like($search) . '%';
            $args[] = $like; $args[] = $like;
        }
        $sql = "SELECT c.*, u.display_name, u.user_email
                  FROM {$wpdb->prefix}oes_certificates c
                  LEFT JOIN {$wpdb->users} u ON u.ID = c.user_id
                 WHERE " . implode(' AND ', $where) . "
                 ORDER BY c.issued_at DESC LIMIT 300";
        $rows = $args ? $wpdb->get_results($wpdb->prepare($sql, $args)) : $wpdb->get_results($sql);
        $certs = self::get_all();
        ?>
        <div class="wrap"><div class="fabo-wrap">
            <div class="fabo-head">
                <div>
                    <h1>Sertifikalar</h1>
                    <p>Sistemde verilmiş tüm sertifikalar. Her satırdaki bağlantı, öğrencinin gördüğü doğrulama sayfasıdır.</p>
                </div>
                <form method="get" class="fabo-head-actions">
                    <input type="hidden" name="page" value="oes-sertifikalar">
                    <input type="hidden" name="sekme" value="verilenler">
                    <select name="cert">
                        <option value="0">Tüm sertifikalar</option>
                        <?php foreach ($certs as $c): ?>
                        <option value="<?php echo intval($c->ID); ?>" <?php selected($q_cert, $c->ID); ?>><?php echo esc_html($c->post_title); ?></option>
                        <?php endforeach; ?>
                    </select>
                    <input type="search" name="s" value="<?php echo esc_attr($search); ?>" placeholder="Öğrenci adı / e-posta">
                    <button class="button button-primary">Filtrele</button>
                </form>
            </div>

            <?php $this->tabs('verilenler'); ?>

            <?php if (empty($rows)): ?>
                <div class="fabo-panel"><div class="fabo-empty">
                    <span class="dashicons dashicons-awards"></span>
                    <p>Kayıt bulunamadı. Sertifikaları eğitmenler kendi panellerinden tanımlar.</p>
                </div></div>
            <?php else: ?>
            <div class="fabo-tablewrap">
                <table class="fabo-table">
                    <thead><tr><th>Öğrenci</th><th>Sertifika</th><th>Eğitim</th><th>Veren</th><th>Tarih</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($rows as $r):
                        $by = $r->issued_by ? get_userdata($r->issued_by) : null;
                        // Belgede YAZAN ad (veriliş anında dondurulmuş); hesap adı sonradan
                        // değişmiş olabilir — o zaman ikisini de gösteririz.
                        $on_cert = !empty($r->holder_name) ? $r->holder_name : $r->display_name;
                        $renamed = ($r->display_name && $on_cert && $r->display_name !== $on_cert);
                    ?>
                    <tr>
                        <td>
                            <div class="fabo-person">
                                <span class="fabo-av"><?php echo esc_html(mb_substr($on_cert ?: '?', 0, 1)); ?></span>
                                <div style="min-width:0;">
                                    <div class="n"><?php echo esc_html($on_cert ?: '—'); ?></div>
                                    <div class="e"><?php echo esc_html($r->user_email); ?></div>
                                    <?php if ($renamed): ?>
                                        <div class="e" style="color:#d9871a;">hesap adı şimdi: <?php echo esc_html($r->display_name); ?></div>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </td>
                        <td><?php echo esc_html(get_the_title($r->cert_id) ?: '(silinmiş tasarım)'); ?></td>
                        <td><?php echo esc_html(!empty($r->course_name) ? $r->course_name : get_the_title($r->course_id)); ?></td>
                        <td><?php echo esc_html($by ? $by->display_name : '—'); ?></td>
                        <td style="white-space:nowrap;"><?php echo esc_html(date_i18n('d M Y', strtotime($r->issued_at))); ?></td>
                        <td style="white-space:nowrap;">
                            <a class="button button-small" target="_blank" rel="noopener"
                               href="<?php echo esc_url(self::certificate_url($r->token)); ?>">Aç</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <p class="description" style="margin-top:10px;">En son verilenler üstte · en fazla 300 kayıt gösterilir.</p>
            <?php endif; ?>
        </div></div>
        <?php
    }

    /* ------------------------- Liste ------------------------- */

    private function render_list() {
        // Taslak kavramı yok: kaydedilen sertifika her zaman yayında (handle_save)
        $certs = get_posts(array(
            'post_type' => self::CPT, 'post_status' => 'publish',
            'posts_per_page' => -1, 'orderby' => 'title', 'order' => 'ASC',
        ));
        $notice = isset($_GET['fabo_msg']) ? sanitize_key($_GET['fabo_msg']) : '';
        ?>
        <?php // .fabo-wrap ŞART: tasarım değişkenleri (--navy, --line…) orada tanımlı,
              // yoksa başlık/sekmeler renksiz kalır ve aktif sekme ayırt edilemez ?>
        <div class="wrap fabo-certs"><div class="fabo-wrap">
            <div class="fabo-head">
                <div>
                    <h1>Sertifikalar</h1>
                    <p>Sertifika tasarımlarını burada yönetirsin. Bir sertifika tanımladıktan sonra <strong>eğitmenler kendi panellerinde</strong>
                       şartı sağlayan öğrencileri görür ve onaylayarak sertifikayı tanımlar — sertifika kendiliğinden verilmez.
                       Verilmiş belgelerin tamamını <strong>Verilen sertifikalar</strong> sekmesinde görürsün.</p>
                </div>
                <div class="fabo-head-actions">
                    <a class="button button-primary" href="<?php echo esc_url(self::admin_url_for(array('new' => 1))); ?>">Yeni sertifika</a>
                </div>
            </div>

            <?php $this->tabs('tasarim'); // sekme çubuğu BURADA da olmalı — yoksa
                                          // "Verilen sertifikalar"a gidilecek link olmaz ?>

            <?php if ($notice === 'saved'): ?>
                <div class="notice notice-success is-dismissible"><p>Sertifika kaydedildi.</p></div>
            <?php elseif ($notice === 'deleted'): ?>
                <div class="notice notice-success is-dismissible"><p>Sertifika silindi.</p></div>
            <?php elseif ($notice === 'nodelete'): ?>
                <div class="notice notice-error is-dismissible"><p>Sertifika silinemedi.</p></div>
            <?php endif; ?>

            <?php if (empty($certs)): ?>
                <div class="fabo-empty">
                    <span class="dashicons dashicons-awards"></span>
                    <h2>Henüz sertifika yok</h2>
                    <p>Boş sertifika tasarımını yükle, ad ve eğitim adının yazılacağı yerleri belirle, şartını seç.</p>
                    <a class="button button-primary button-hero" href="<?php echo esc_url(self::admin_url_for(array('new' => 1))); ?>">İlk sertifikayı oluştur</a>
                </div>
            <?php else: ?>
            <div class="fabo-grid">
                <?php foreach ($certs as $c):
                    $cfg   = self::get_config($c->ID);
                    $thumb = $cfg['template'] ? wp_get_attachment_image_url($cfg['template'], 'medium') : '';
                    $cnt   = self::issued_count($c->ID);
                    $rl    = $cfg['rule'];
                    ?>
                <div class="fabo-card">
                    <div class="fabo-thumb">
                        <?php if ($thumb): ?><img src="<?php echo esc_url($thumb); ?>" alt="">
                        <?php else: ?><span class="fabo-nothumb">Şablon görseli yok</span><?php endif; ?>
                    </div>
                    <div class="fabo-body">
                        <h3><?php echo esc_html($c->post_title ?: '(isimsiz)'); ?></h3>
                        <p class="fabo-rule">
                            <strong><?php echo esc_html(self::condition_label($rl['condition'])); ?></strong><br>
                            <?php echo $rl['scope'] === 'course'
                                ? esc_html(get_the_title($rl['course_id']) ?: 'Eğitim seçilmemiş')
                                : 'Tüm eğitimler'; ?>
                        </p>
                        <p class="fabo-count"><span class="dashicons dashicons-groups"></span> <?php echo intval($cnt); ?> öğrenciye verildi</p>
                    </div>
                    <div class="fabo-foot">
                        <a class="button button-primary" href="<?php echo esc_url(self::admin_url_for(array('edit' => $c->ID))); ?>">Düzenle</a>
                        <a class="button" target="_blank" rel="noopener"
                           href="<?php echo esc_url(add_query_arg(array('fabo_cert_preview' => $c->ID), home_url('/'))); ?>">Önizle</a>
                        <button type="button" class="button fabo-del" data-id="<?php echo intval($c->ID); ?>"
                                data-title="<?php echo esc_attr($c->post_title); ?>" data-count="<?php echo intval($cnt); ?>">Sil</button>
                    </div>
                </div>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>
        </div></div>

        <form id="fabo-del-form" method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:none;">
            <input type="hidden" name="action" value="fabo_cert_delete">
            <input type="hidden" name="cert_id" id="fabo-del-id" value="">
            <?php wp_nonce_field('fabo_cert_delete'); ?>
        </form>

        <style>
            .fabo-certs .fabo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px;margin-top:18px;}
            .fabo-card{background:#fff;border:1px solid #dcdcde;border-radius:10px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.04);}
            .fabo-thumb{position:relative;background:#f0f0f1;aspect-ratio:1.414/1;display:flex;align-items:center;justify-content:center;overflow:hidden;}
            .fabo-thumb img{width:100%;height:100%;object-fit:contain;}
            .fabo-nothumb{color:#8c8f94;font-size:13px;}
            .fabo-badge.draft{position:absolute;top:8px;left:8px;background:#b26a00;color:#fff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;}
            .fabo-body{padding:12px 14px;flex:1;}
            .fabo-body h3{margin:0 0 8px;font-size:15px;}
            .fabo-rule{margin:0 0 8px;font-size:12.5px;color:#50575e;line-height:1.5;}
            .fabo-count{margin:0;font-size:12.5px;color:#646970;display:flex;align-items:center;gap:5px;}
            .fabo-count .dashicons{font-size:16px;width:16px;height:16px;}
            .fabo-foot{padding:10px 14px;border-top:1px solid #f0f0f1;display:flex;gap:6px;flex-wrap:wrap;}
            .fabo-foot .fabo-del{color:#b32d2e;border-color:#d9a5a5;}
            .fabo-foot .fabo-del:hover{background:#fcf0f1;border-color:#b32d2e;}
            .fabo-empty{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:48px 24px;text-align:center;margin-top:18px;}
            .fabo-empty .dashicons{font-size:44px;width:44px;height:44px;color:#c3c4c7;}
            .fabo-empty h2{margin:12px 0 6px;}
            .fabo-empty p{color:#646970;margin:0 0 18px;}
        </style>
        <script>
        (function(){
            // Silme geri alınamaz → ÜÇ kez sor (verilmiş sertifika varsa ayrıca uyar)
            document.querySelectorAll('.fabo-del').forEach(function(b){
                b.addEventListener('click',function(){
                    var t=b.getAttribute('data-title')||'(isimsiz)', n=parseInt(b.getAttribute('data-count'),10)||0;
                    if(!confirm('1/3 — "'+t+'" sertifikasını silmek istiyor musun?')) return;
                    var msg='2/3 — Bu işlem GERİ ALINAMAZ. Tasarım, alan konumları ve şart ayarları silinecek.';
                    if(n>0) msg+='\n\nDİKKAT: Bu sertifika '+n+' öğrenciye verilmiş. Silersen onların sertifika bağlantıları ÇALIŞMAZ hale gelir.';
                    if(!confirm(msg)) return;
                    var ans=prompt('3/3 — Onaylamak için sertifikanın adını birebir yaz:\n\n'+t);
                    if(ans===null) return;
                    if(ans.trim()!==t.trim()){ alert('Ad eşleşmedi. Silme iptal edildi.'); return; }
                    document.getElementById('fabo-del-id').value=b.getAttribute('data-id');
                    document.getElementById('fabo-del-form').submit();
                });
            });
        })();
        </script>
        <?php
    }

    public function handle_delete() {
        if (!current_user_can('manage_options')) wp_die('Yetkiniz yok.');
        check_admin_referer('fabo_cert_delete');
        $id = intval($_POST['cert_id'] ?? 0);
        $ok = false;
        if ($id && get_post_type($id) === self::CPT) {
            $ok = (bool) wp_delete_post($id, true);
            if ($ok) {
                // Verilmiş kayıtları da temizle — yoksa öğrencilerin token'ları
                // çözülmeye devam eder ve tasarımı olmayan bozuk bir sayfa açardı.
                global $wpdb;
                $wpdb->delete($wpdb->prefix . 'oes_certificates', array('cert_id' => $id), array('%d'));
            }
        }
        wp_safe_redirect(self::admin_url_for(array('fabo_msg' => $ok ? 'deleted' : 'nodelete')));
        exit;
    }

    /* ------------------------- Düzenleme ------------------------- */

    public function handle_save() {
        if (!current_user_can('manage_options')) wp_die('Yetkiniz yok.');
        check_admin_referer(self::NONCE_ADMIN);

        $id    = intval($_POST['cert_id'] ?? 0);
        $title = sanitize_text_field(wp_unslash($_POST['fabo_cert_title'] ?? ''));
        if ($title === '') $title = 'İsimsiz sertifika';

        $post = array('post_title' => $title, 'post_type' => self::CPT, 'post_status' => 'publish');
        if ($id && get_post_type($id) === self::CPT) {
            $post['ID'] = $id;
            wp_update_post($post);
        } else {
            $id = wp_insert_post($post);
        }
        if (!$id || is_wp_error($id)) {
            wp_safe_redirect(self::admin_url_for(array('fabo_msg' => 'nodelete')));
            exit;
        }

        update_post_meta($id, '_fabo_cert_template', intval($_POST['fabo_cert_template'] ?? 0));
        update_post_meta($id, '_fabo_cert_sample_name', sanitize_text_field(wp_unslash($_POST['fabo_cert_sample_name'] ?? '')));
        update_post_meta($id, '_fabo_cert_sample_course', sanitize_text_field(wp_unslash($_POST['fabo_cert_sample_course'] ?? '')));

        $font_keys = array_keys(self::fonts());
        $in = isset($_POST['fabo_cert']) && is_array($_POST['fabo_cert']) ? $_POST['fabo_cert'] : array();
        $fields = array();
        foreach (array('name', 'course') as $k) {
            $f = isset($in[$k]) && is_array($in[$k]) ? $in[$k] : array();
            $fields[$k] = array(
                'x'       => max(0, min(100, (float) ($f['x'] ?? 50))),
                'y'       => max(0, min(100, (float) ($f['y'] ?? 50))),
                'size'    => max(8, min(200, (int) ($f['size'] ?? 32))),
                'color'   => sanitize_hex_color(trim((string) ($f['color'] ?? ''))) ?: '#194977',
                'align'   => in_array(($f['align'] ?? ''), array('left', 'center', 'right'), true) ? $f['align'] : 'center',
                'weight'  => in_array(($f['weight'] ?? ''), array('400', '600', '700'), true) ? $f['weight'] : '700',
                'font'    => in_array(($f['font'] ?? ''), $font_keys, true) ? $f['font'] : 'montserrat',
                'italic'  => !empty($f['italic']) ? 1 : 0,
                'caps'    => !empty($f['caps']) ? 1 : 0,
                'spacing' => max(-5, min(30, (float) ($f['spacing'] ?? 0))),
            );
        }
        // QR kod alanı (doğrulama bağlantısı)
        $q = isset($in['qr']) && is_array($in['qr']) ? $in['qr'] : array();
        $fields['qr'] = array(
            'enabled' => !empty($q['enabled']) ? 1 : 0,
            'x'       => max(0, min(100, (float) ($q['x'] ?? 88))),
            'y'       => max(0, min(100, (float) ($q['y'] ?? 82))),
            'size'    => max(40, min(600, (int) ($q['size'] ?? 120))),
        );
        update_post_meta($id, '_fabo_cert_fields', $fields);

        $r = isset($_POST['fabo_cert_rule']) && is_array($_POST['fabo_cert_rule']) ? $_POST['fabo_cert_rule'] : array();
        update_post_meta($id, '_fabo_cert_rule', array(
            'scope'     => (($r['scope'] ?? 'all') === 'course') ? 'course' : 'all',
            'course_id' => intval($r['course_id'] ?? 0),
            'condition' => in_array(($r['condition'] ?? ''), array(self::COND_ENROLLED, self::COND_STARTED, self::COND_COMPLETED), true)
                ? $r['condition'] : self::COND_COMPLETED,
        ));

        wp_safe_redirect(self::admin_url_for(array('edit' => $id, 'fabo_msg' => 'saved')));
        exit;
    }

    private function render_edit($cert_id) {
        $is_new = !$cert_id || get_post_type($cert_id) !== self::CPT;
        $title  = $is_new ? '' : get_the_title($cert_id);
        $c      = self::get_config($cert_id);
        $img    = $c['template'] ? wp_get_attachment_image_url($c['template'], 'full') : '';
        $qr     = $c['qr'];

        $s_name   = $cert_id ? get_post_meta($cert_id, '_fabo_cert_sample_name', true) : '';
        $s_course = $cert_id ? get_post_meta($cert_id, '_fabo_cert_sample_course', true) : '';
        if ($s_name === '')   $s_name   = 'Ad Soyad';
        if ($s_course === '') $s_course = 'Örnek Eğitim Adı';

        $preview_url = $cert_id ? add_query_arg(array(
            'fabo_cert_preview' => $cert_id, 'ad' => $s_name, 'kurs' => $s_course,
        ), home_url('/')) : '';
        $saved = (isset($_GET['fabo_msg']) && $_GET['fabo_msg'] === 'saved');
        ?>
        <div class="wrap fabo-cert-edit fabo-wrap">
            <h1><?php echo $is_new ? 'Yeni sertifika' : 'Sertifikayı düzenle'; ?>
                <a class="page-title-action" href="<?php echo esc_url(self::admin_url_for()); ?>">← Tüm sertifikalar</a>
            </h1>
            <?php if ($saved): ?><div class="notice notice-success is-dismissible"><p>Kaydedildi.</p></div><?php endif; ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" id="faboCertForm">
                <input type="hidden" name="action" value="fabo_cert_save">
                <input type="hidden" name="cert_id" value="<?php echo intval($cert_id); ?>">
                <?php wp_nonce_field(self::NONCE_ADMIN); ?>

                <div class="fabo-edit-grid">
                    <div class="fabo-col-main">
                        <div class="fabo-panel">
                            <label class="fabo-lbl">Sertifika adı</label>
                            <input type="text" name="fabo_cert_title" value="<?php echo esc_attr($title); ?>"
                                   placeholder="ör. Kursa Katılım Sertifikası" class="large-text" required>
                        </div>

                        <div class="fabo-panel">
                            <div class="fabo-panel-head">
                                <h2>Tasarım</h2>
                                <div>
                                    <input type="hidden" id="fabo_cert_template" name="fabo_cert_template" value="<?php echo esc_attr($c['template']); ?>">
                                    <button type="button" class="button button-primary" id="fabo_pick_tpl">Şablon görseli seç</button>
                                    <button type="button" class="button" id="fabo_clear_tpl"<?php echo $img ? '' : ' style="display:none"'; ?>>Kaldır</button>
                                </div>
                            </div>
                            <p class="description">
                                Önizlemeye <strong>tıkla</strong> ya da kutuyu <strong>sürükle</strong> — seçili alan oraya taşınır.
                                Ok tuşlarıyla ince ayar yapabilirsin (Shift ile daha büyük adım).
                                Konumlar yüzde saklanır, punto şablonun gerçek boyutuna göre ölçeklenir:
                                <strong>gördüğün çıktı, basılan çıktıdır.</strong>
                            </p>

                            <div class="fabo-fldpick">
                                <span>Yerleştirilen alan:</span>
                                <label><input type="radio" name="fabo_active_fld" value="name" checked> Ad soyad</label>
                                <label><input type="radio" name="fabo_active_fld" value="course"> Eğitim adı</label>
                                <label><input type="radio" name="fabo_active_fld" value="qr"> QR kod</label>
                            </div>

                            <div id="fabo_cert_stage" style="display:<?php echo $img ? 'inline-block' : 'none'; ?>;">
                                <img id="fabo_cert_img" src="<?php echo esc_url($img); ?>" draggable="false">
                                <div id="fabo_fld_name"   class="fabo-fld" data-key="name"></div>
                                <div id="fabo_fld_course" class="fabo-fld" data-key="course"></div>
                                <div id="fabo_fld_qr"     class="fabo-fld fabo-qr" data-key="qr"></div>
                            </div>
                            <p id="fabo_cert_empty" class="description"<?php echo $img ? ' style="display:none"' : ''; ?>>
                                <em>Önce bir şablon görseli seç.</em>
                            </p>
                        </div>

                        <?php foreach (array('name' => 'Ad soyad', 'course' => 'Eğitim adı') as $k => $lbl):
                            $f = $c[$k]; ?>
                        <div class="fabo-panel">
                            <h2><?php echo esc_html($lbl); ?> alanı</h2>
                            <div class="fabo-row">
                                <label class="fabo-f">Yazı tipi
                                    <select class="fabo-in" data-k="<?php echo $k; ?>" data-p="font" name="fabo_cert[<?php echo $k; ?>][font]">
                                        <?php echo self::font_options_html($f['font']); ?>
                                    </select>
                                </label>
                                <label class="fabo-f sm">Punto
                                    <input type="number" min="8" max="200" class="fabo-in" data-k="<?php echo $k; ?>" data-p="size" name="fabo_cert[<?php echo $k; ?>][size]" value="<?php echo esc_attr($f['size']); ?>">
                                </label>
                                <label class="fabo-f sm">Kalınlık
                                    <select class="fabo-in" data-k="<?php echo $k; ?>" data-p="weight" name="fabo_cert[<?php echo $k; ?>][weight]">
                                        <?php foreach (array('400' => 'Normal', '600' => 'Yarı kalın', '700' => 'Kalın') as $v => $t): ?>
                                        <option value="<?php echo $v; ?>" <?php selected($f['weight'], $v); ?>><?php echo $t; ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                </label>
                                <label class="fabo-f sm">Hiza
                                    <select class="fabo-in" data-k="<?php echo $k; ?>" data-p="align" name="fabo_cert[<?php echo $k; ?>][align]">
                                        <?php foreach (array('center' => 'Ortalı', 'left' => 'Sola', 'right' => 'Sağa') as $v => $t): ?>
                                        <option value="<?php echo $v; ?>" <?php selected($f['align'], $v); ?>><?php echo $t; ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                </label>
                            </div>
                            <div class="fabo-row">
                                <label class="fabo-f sm">Renk (hex)
                                    <span class="fabo-hexwrap">
                                        <input type="text" class="fabo-in fabo-hex" data-k="<?php echo $k; ?>" data-p="color"
                                               name="fabo_cert[<?php echo $k; ?>][color]" value="<?php echo esc_attr($f['color']); ?>"
                                               placeholder="#194977" maxlength="7" spellcheck="false">
                                        <span class="fabo-swatch" data-for="<?php echo $k; ?>" style="background:<?php echo esc_attr($f['color']); ?>"></span>
                                    </span>
                                </label>
                                <label class="fabo-f sm">Yatay %
                                    <input type="number" step="0.1" min="0" max="100" class="fabo-in" data-k="<?php echo $k; ?>" data-p="x" name="fabo_cert[<?php echo $k; ?>][x]" value="<?php echo esc_attr($f['x']); ?>">
                                </label>
                                <label class="fabo-f sm">Dikey %
                                    <input type="number" step="0.1" min="0" max="100" class="fabo-in" data-k="<?php echo $k; ?>" data-p="y" name="fabo_cert[<?php echo $k; ?>][y]" value="<?php echo esc_attr($f['y']); ?>">
                                </label>
                                <label class="fabo-f sm">Harf aralığı
                                    <input type="number" step="0.5" min="-5" max="30" class="fabo-in" data-k="<?php echo $k; ?>" data-p="spacing" name="fabo_cert[<?php echo $k; ?>][spacing]" value="<?php echo esc_attr($f['spacing']); ?>">
                                </label>
                                <?php // İtalik seçeneği YOK: sertifika sunucuda çizilir, gömülü TTF'lerin
                                      // italik kesimi yok ve GD eğik üretemez → önizlemede italik görünüp
                                      // çıktıda düz basardı. Yanıltmamak için sunulmuyor. ?>
                                <label class="fabo-chk"><input type="checkbox" class="fabo-in" data-k="<?php echo $k; ?>" data-p="caps" name="fabo_cert[<?php echo $k; ?>][caps]" value="1" <?php checked(!empty($f['caps'])); ?>> BÜYÜK HARF</label>
                            </div>
                        </div>
                        <?php endforeach; ?>

                        <div class="fabo-panel">
                            <h2>QR kod (doğrulama)</h2>
                            <p class="description">Sertifikanın kendi doğrulama adresini taşır. Okutan kişi belgenin gerçek olduğunu görür.</p>
                            <div class="fabo-row">
                                <label class="fabo-chk"><input type="checkbox" class="fabo-in" data-k="qr" data-p="enabled" name="fabo_cert[qr][enabled]" value="1" <?php checked(!empty($qr['enabled'])); ?>> QR kodu göster</label>
                                <label class="fabo-f sm">Boyut (px)
                                    <input type="number" min="40" max="600" class="fabo-in" data-k="qr" data-p="size" name="fabo_cert[qr][size]" value="<?php echo esc_attr($qr['size']); ?>">
                                </label>
                                <label class="fabo-f sm">Yatay %
                                    <input type="number" step="0.1" min="0" max="100" class="fabo-in" data-k="qr" data-p="x" name="fabo_cert[qr][x]" value="<?php echo esc_attr($qr['x']); ?>">
                                </label>
                                <label class="fabo-f sm">Dikey %
                                    <input type="number" step="0.1" min="0" max="100" class="fabo-in" data-k="qr" data-p="y" name="fabo_cert[qr][y]" value="<?php echo esc_attr($qr['y']); ?>">
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="fabo-col-side">
                        <div class="fabo-panel sticky">
                            <h2>Kaydet</h2>
                            <p class="description">Değişiklikler kaydedilene kadar uygulanmaz.</p>
                            <button type="submit" class="button button-primary button-hero" style="width:100%;">Kaydet</button>
                            <?php if ($preview_url): ?>
                            <a class="button" style="width:100%;text-align:center;margin-top:8px;" href="<?php echo esc_url($preview_url); ?>" target="_blank" rel="noopener">
                                Tam ekran önizleme
                            </a>
                            <p class="description" style="margin-top:6px;">Yayına almadan gerçek çıktıyı görürsün.</p>
                            <?php else: ?>
                            <p class="description" style="margin-top:8px;">Tam ekran önizleme için önce kaydet.</p>
                            <?php endif; ?>
                        </div>

                        <div class="fabo-panel">
                            <h2>Önizleme metni</h2>
                            <p class="description">Sadece önizleme için. Sertifikada öğrencinin gerçek adı ve eğitim adı yazar.</p>
                            <label class="fabo-lbl">Örnek ad soyad</label>
                            <input type="text" id="fabo_s_name" name="fabo_cert_sample_name" value="<?php echo esc_attr($s_name); ?>" class="widefat">
                            <label class="fabo-lbl" style="margin-top:10px;">Örnek eğitim adı</label>
                            <input type="text" id="fabo_s_course" name="fabo_cert_sample_course" value="<?php echo esc_attr($s_course); ?>" class="widefat">
                        </div>

                        <div class="fabo-panel">
                            <h2>Verilme şartı</h2>
                            <p class="description">Şartı sağlayan öğrenciler eğitmenin listesinde çıkar. <strong>Otomatik verilmez.</strong></p>
                            <label class="fabo-lbl">Koşul</label>
                            <select name="fabo_cert_rule[condition]" class="widefat">
                                <option value="<?php echo self::COND_ENROLLED; ?>"  <?php selected($c['rule']['condition'], self::COND_ENROLLED); ?>>Kursa kayıt oldu</option>
                                <option value="<?php echo self::COND_STARTED; ?>"   <?php selected($c['rule']['condition'], self::COND_STARTED); ?>>Kursu başlattı (ilk içeriği görüntüledi)</option>
                                <option value="<?php echo self::COND_COMPLETED; ?>" <?php selected($c['rule']['condition'], self::COND_COMPLETED); ?>>Kursu bitirdi (%100)</option>
                            </select>
                            <label class="fabo-lbl" style="margin-top:10px;">Kapsam</label>
                            <select name="fabo_cert_rule[scope]" id="fabo_rule_scope" class="widefat">
                                <option value="all"    <?php selected($c['rule']['scope'], 'all'); ?>>Tüm eğitimler</option>
                                <option value="course" <?php selected($c['rule']['scope'], 'course'); ?>>Belirli bir eğitim</option>
                            </select>
                            <div id="fabo_rule_course_wrap"<?php echo $c['rule']['scope'] === 'course' ? '' : ' style="display:none"'; ?>>
                                <label class="fabo-lbl" style="margin-top:10px;">Eğitim</label>
                                <select name="fabo_cert_rule[course_id]" class="widefat">
                                    <?php echo class_exists('OES_Documents') ? OES_Documents::course_options_html((int) $c['rule']['course_id'], '— eğitim seç —') : ''; ?>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </div>

        <style>
            .fabo-cert-edit .fabo-edit-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:start;margin-top:16px;}
            @media(max-width:1100px){.fabo-cert-edit .fabo-edit-grid{grid-template-columns:1fr;}}
            .fabo-panel{background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:16px 18px;margin-bottom:16px;}
            .fabo-panel.sticky{position:sticky;top:46px;}
            .fabo-panel h2{margin:0 0 8px;font-size:15px;}
            .fabo-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;}
            .fabo-panel-head h2{margin:0;}
            .fabo-lbl{display:block;font-weight:600;font-size:13px;margin-bottom:5px;}
            .fabo-row{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;margin-top:10px;}
            .fabo-f{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:#50575e;}
            .fabo-f.sm input,.fabo-f.sm select{width:110px;}
            .fabo-f select,.fabo-f input{font-weight:400;}
            .fabo-chk{display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;color:#50575e;padding-bottom:6px;}
            .fabo-hexwrap{position:relative;display:inline-flex;align-items:center;}
            .fabo-hex{width:110px;font-family:monospace;text-transform:lowercase;}
            .fabo-hex.bad{border-color:#b32d2e;background:#fcf0f1;}
            .fabo-swatch{width:22px;height:22px;border-radius:5px;border:1px solid #dcdcde;margin-left:7px;flex:none;}
            .fabo-fldpick{display:flex;gap:16px;align-items:center;flex-wrap:wrap;background:#f6f7f7;border:1px solid #dcdcde;border-radius:8px;padding:9px 12px;margin:10px 0;font-size:13px;}
            .fabo-fldpick span{font-weight:600;}
            #fabo_cert_stage{position:relative;max-width:100%;border:1px solid #dcdcde;border-radius:8px;overflow:hidden;background:#f6f7f7;}
            #fabo_cert_img{display:block;max-width:100%;height:auto;user-select:none;}
            .fabo-fld{position:absolute;white-space:nowrap;cursor:move;padding:0;line-height:1.25;
                outline:1px dashed rgba(25,73,119,.5);outline-offset:3px;background:rgba(255,255,255,.25);}
            .fabo-fld.on{outline:2px solid #2271b1;background:rgba(34,113,177,.10);}
            .fabo-fld.fabo-qr{background:#fff;padding:0;display:flex;align-items:center;justify-content:center;}
            .fabo-fld.fabo-qr svg{display:block;width:100%;height:100%;}
        </style>
        <script>
        (function(){
            var stage=document.getElementById('fabo_cert_stage'), img=document.getElementById('fabo_cert_img'),
                empty=document.getElementById('fabo_cert_empty'), tplIn=document.getElementById('fabo_cert_template');
            if(!stage) return;
            var STACKS=<?php
                // font_stack(): sunucudaki TTF'in @font-face aile adı → önizleme,
                // basılan PNG ile AYNI yazı tipini gösterir.
                $st = array(); foreach (self::fonts() as $fk => $fv) $st[$fk] = self::font_stack($fk);
                echo wp_json_encode($st); ?>;
            var QR_DEMO=<?php echo wp_json_encode(home_url('/sertifika/ornek/')); ?>;

            function el(k){return document.getElementById('fabo_fld_'+k);}
            function inp(k,p){return document.querySelector('.fabo-in[data-k="'+k+'"][data-p="'+p+'"]');}
            function val(k,p){var e=inp(k,p);if(!e)return '';return e.type==='checkbox'?(e.checked?1:0):e.value;}
            function setVal(k,p,v){var e=inp(k,p);if(e)e.value=v;}
            function ratio(){var n=img.naturalWidth||1000, s=img.clientWidth||n; return s/n;}
            function sample(k){
                var e=document.getElementById(k==='name'?'fabo_s_name':'fabo_s_course');
                return (e&&e.value.trim())||(k==='name'?'Ad Soyad':'Eğitim Adı');
            }
            function drawText(k){
                var e=el(k); if(!e)return;
                var txt=sample(k);
                // Sunucudaki tr_upper() ile AYNI kural (i→İ, ı→I)
                e.textContent = val(k,'caps') ? txt.toLocaleUpperCase('tr-TR') : txt;
                e.style.left=val(k,'x')+'%'; e.style.top=val(k,'y')+'%';
                e.style.color=val(k,'color'); e.style.fontWeight=val(k,'weight');
                e.style.textAlign=val(k,'align');
                e.style.fontFamily=STACKS[val(k,'font')]||STACKS['montserrat'];
                e.style.fontStyle='normal'; // italik desteklenmiyor (sunucu çizimi)
                var r=ratio();
                e.style.fontSize=(parseFloat(val(k,'size')||16)*r)+'px';
                e.style.letterSpacing=(parseFloat(val(k,'spacing')||0)*r)+'px';
                var a=val(k,'align');
                e.style.transform='translate('+(a==='left'?'0':(a==='right'?'-100%':'-50%'))+',-50%)';
            }
            var qrDrawn=false;
            function drawQR(){
                var e=el('qr'); if(!e)return;
                var on=!!val('qr','enabled');
                e.style.display=on?'flex':'none';
                if(!on) return;
                var r=ratio(), px=parseFloat(val('qr','size')||120)*r;
                e.style.left=val('qr','x')+'%'; e.style.top=val('qr','y')+'%';
                e.style.width=px+'px'; e.style.height=px+'px';
                e.style.transform='translate(-50%,-50%)';
                if(!qrDrawn && window.qrcode){
                    var q=qrcode(0,'M'); q.addData(QR_DEMO); q.make();
                    e.innerHTML=q.createSvgTag({scalable:true});
                    qrDrawn=true;
                }
            }
            function drawAll(){drawText('name');drawText('course');drawQR();}
            function activeKey(){var r=document.querySelector('input[name="fabo_active_fld"]:checked');return r?r.value:'name';}
            function mark(){['name','course','qr'].forEach(function(k){var e=el(k);if(e)e.classList.toggle('on',k===activeKey());});}

            // Hex renk: elle yazılır, geçerliyse kutucuk anında güncellenir
            document.querySelectorAll('.fabo-hex').forEach(function(e){
                e.addEventListener('input',function(){
                    var v=e.value.trim(); if(v && v[0]!=='#'){v='#'+v; e.value=v;}
                    var ok=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
                    e.classList.toggle('bad',!ok);
                    var sw=document.querySelector('.fabo-swatch[data-for="'+e.getAttribute('data-k')+'"]');
                    if(ok&&sw) sw.style.background=v;
                    if(ok) drawAll();
                });
            });

            document.querySelectorAll('.fabo-in').forEach(function(e){
                e.addEventListener('input',drawAll); e.addEventListener('change',drawAll);
            });
            ['fabo_s_name','fabo_s_course'].forEach(function(id){
                var e=document.getElementById(id); if(e) e.addEventListener('input',drawAll);
            });
            document.querySelectorAll('input[name="fabo_active_fld"]').forEach(function(r){r.addEventListener('change',mark);});

            var scope=document.getElementById('fabo_rule_scope'), wrap=document.getElementById('fabo_rule_course_wrap');
            if(scope) scope.addEventListener('change',function(){ wrap.style.display=(this.value==='course')?'':'none'; });

            stage.addEventListener('click',function(ev){
                if(ev.target.closest && ev.target.closest('.fabo-fld')) return;
                var r=img.getBoundingClientRect(), k=activeKey();
                setVal(k,'x',(((ev.clientX-r.left)/r.width)*100).toFixed(1));
                setVal(k,'y',(((ev.clientY-r.top)/r.height)*100).toFixed(1));
                drawAll();
            });
            ['name','course','qr'].forEach(function(k){
                var e=el(k); if(!e)return;
                e.addEventListener('mousedown',function(ev){
                    ev.preventDefault();
                    var r=img.getBoundingClientRect();
                    var sel=document.querySelector('input[name="fabo_active_fld"][value="'+k+'"]'); if(sel){sel.checked=true;mark();}
                    function mv(e2){
                        setVal(k,'x',Math.max(0,Math.min(100,((e2.clientX-r.left)/r.width)*100)).toFixed(1));
                        setVal(k,'y',Math.max(0,Math.min(100,((e2.clientY-r.top)/r.height)*100)).toFixed(1));
                        drawAll();
                    }
                    function up(){document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);}
                    document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up);
                });
            });
            document.addEventListener('keydown',function(ev){
                if(!/^Arrow/.test(ev.key)) return;
                var t=ev.target; if(t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
                var k=activeKey(), step=ev.shiftKey?1:0.1;
                if(ev.key==='ArrowLeft')  setVal(k,'x',(parseFloat(val(k,'x'))-step).toFixed(1));
                if(ev.key==='ArrowRight') setVal(k,'x',(parseFloat(val(k,'x'))+step).toFixed(1));
                if(ev.key==='ArrowUp')    setVal(k,'y',(parseFloat(val(k,'y'))-step).toFixed(1));
                if(ev.key==='ArrowDown')  setVal(k,'y',(parseFloat(val(k,'y'))+step).toFixed(1));
                ev.preventDefault(); drawAll();
            });

            var frame=null;
            document.getElementById('fabo_pick_tpl').addEventListener('click',function(){
                if(frame){frame.open();return;}
                frame=wp.media({title:'Sertifika şablonu seç',library:{type:'image'},button:{text:'Seç'},multiple:false});
                frame.on('select',function(){
                    var a=frame.state().get('selection').first().toJSON();
                    tplIn.value=a.id; img.src=a.url; stage.style.display='inline-block';
                    empty.style.display='none'; document.getElementById('fabo_clear_tpl').style.display='';
                });
                frame.open();
            });
            document.getElementById('fabo_clear_tpl').addEventListener('click',function(){
                tplIn.value=''; img.src=''; stage.style.display='none'; empty.style.display='';
                this.style.display='none';
            });

            if(img.complete) drawAll(); else img.addEventListener('load',drawAll);
            window.addEventListener('resize',drawAll);
            if(document.fonts && document.fonts.ready) document.fonts.ready.then(drawAll);
            mark();

            // QR üreteci eklentiye gömülü (dış CDN YOK — yönetici oturumunda
            // 3. taraf script çalıştırmayalım; internet olmasa da çalışır)
            var s=document.createElement('script');
            s.src=<?php echo wp_json_encode(OES_PLUGIN_URL . 'assets/js/qrcode.js?v=' . oes_asset_ver('assets/js/qrcode.js')); ?>;
            s.onload=function(){ qrDrawn=false; drawQR(); };
            document.head.appendChild(s);
        })();
        </script>
        <?php
    }

    /* =====================================================================
     *  Başarım kontrolü
     * ================================================================== */

    /** Kullanıcı bu sertifikanın şartını bu kursta sağlıyor mu? */
    public static function meets($cert_id, $user_id, $course_id) {
        $c = self::get_config($cert_id);
        $r = $c['rule'];
        if ($r['scope'] === 'course' && (int) $r['course_id'] !== (int) $course_id) return false;

        global $wpdb;
        switch ($r['condition']) {
            case self::COND_ENROLLED:
                return (bool) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments
                      WHERE user_id = %d AND course_id = %d AND status = 'active'", $user_id, $course_id));

            case self::COND_STARTED:
                return (bool) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments
                      WHERE user_id = %d AND course_id = %d AND status = 'active' AND started_at IS NOT NULL",
                    $user_id, $course_id));

            case self::COND_COMPLETED:
            default:
                if (!class_exists('OES_Player')) return false;
                // Diğer koşullar gibi burada da AKTİF kayıt aranır: kaydı iptal edilmiş
                // eski bir öğrencinin ilerleme satırları duruyor diye sertifika çıkmasın.
                $enrolled = (bool) $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments
                      WHERE user_id = %d AND course_id = %d AND status = 'active'", $user_id, $course_id));
                if (!$enrolled) return false;
                $p = OES_Player::compute_course_progress($course_id, $user_id);
                return !empty($p['total']) && $p['completed'] >= $p['total'];
        }
    }

    /** Koşulun okunabilir adı */
    public static function condition_label($cond) {
        $map = array(
            self::COND_ENROLLED  => 'Kursa kayıt oldu',
            self::COND_STARTED   => 'Kursu başlattı',
            self::COND_COMPLETED => 'Kursu bitirdi',
        );
        return $map[$cond] ?? $cond;
    }

    /* =====================================================================
     *  Verilen sertifikalar
     * ================================================================== */

    /** Bu kullanıcı+kurs+sertifika için verilmiş kayıt (yoksa null) */
    public static function issued_row($cert_id, $user_id, $course_id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_certificates
              WHERE cert_id = %d AND user_id = %d AND course_id = %d LIMIT 1",
            $cert_id, $user_id, $course_id));
    }

    /** Öğrencinin sertifikaları (panel) */
    public static function get_user_certificates($user_id) {
        global $wpdb;
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_certificates WHERE user_id = %d ORDER BY id DESC", $user_id));
    }

    public static function certificate_url($token) {
        return home_url('/sertifika/' . rawurlencode($token) . '/');
    }

    /** Sertifikada yazacak isim: ad-soyad (yoksa görünen ad) */
    public static function display_name($user) {
        if (!$user) return '';
        $full = trim($user->first_name . ' ' . $user->last_name);
        return $full !== '' ? $full : $user->display_name;
    }

    public function ajax_issue() {
        check_ajax_referer(self::NONCE, 'nonce');
        $cert_id   = intval($_POST['cert_id'] ?? 0);
        $user_id   = intval($_POST['user_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);

        if (!$cert_id || !$user_id || !$course_id) wp_send_json_error('Eksik bilgi.');
        if (!self::can_manage($course_id)) wp_send_json_error('Bu eğitim için yetkiniz yok.');
        if (get_post_type($cert_id) !== self::CPT) wp_send_json_error('Sertifika bulunamadı.');

        // Şart hâlâ sağlanıyor mu? (liste eskimiş olabilir)
        if (!self::meets($cert_id, $user_id, $course_id)) {
            wp_send_json_error('Bu öğrenci sertifikanın şartını sağlamıyor.');
        }
        if (self::issued_row($cert_id, $user_id, $course_id)) {
            wp_send_json_error('Bu sertifika bu öğrenciye zaten tanımlanmış.');
        }

        $user = get_userdata($user_id);
        if (!$user) wp_send_json_error('Kullanıcı bulunamadı.');

        // Tahmin edilemez adres (192 bit). random_bytes CSPRNG yoksa istisna atar →
        // beyaz ekran yerine düzgün hata dönelim.
        try {
            $token = bin2hex(random_bytes(24)); // 48 karakter
        } catch (Exception $e) {
            wp_send_json_error('Güvenli adres üretilemedi, lütfen tekrar deneyin.');
        }

        global $wpdb;
        $ok = $wpdb->insert($wpdb->prefix . 'oes_certificates', array(
            'cert_id'    => $cert_id,
            'user_id'    => $user_id,
            // Ad ve eğitim adı VERİLDİĞİ AN dondurulur. Canlı okunsaydı, öğrenci
            // hesabından adını değiştirdiğinde belgesi de değişir; başkasının adına
            // sertifika bastırılabilirdi.
            'holder_name' => self::display_name($user),
            'course_id'   => $course_id,
            'course_name' => get_the_title($course_id),
            'token'      => $token,
            'issued_by'  => get_current_user_id(),
            'issued_at'  => current_time('mysql'),
        ));
        if (!$ok) wp_send_json_error('Sertifika kaydedilemedi.');

        $url = self::certificate_url($token);
        $this->notify($user, $cert_id, $course_id, $url);

        wp_send_json_success(array('url' => $url, 'message' => 'Sertifika tanımlandı ve öğrenciye gönderildi.'));
    }

    public function ajax_revoke() {
        check_ajax_referer(self::NONCE, 'nonce');
        $id = intval($_POST['id'] ?? 0);
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_certificates WHERE id = %d", $id));
        if (!$row) wp_send_json_error('Kayıt bulunamadı.');
        if (!self::can_manage($row->course_id)) wp_send_json_error('Yetkiniz yok.');

        $wpdb->delete($wpdb->prefix . 'oes_certificates', array('id' => $id));
        wp_send_json_success(array('message' => 'Sertifika geri alındı.'));
    }

    /** Bu kursun sertifikasını kim tanımlayabilir: kursun eğitmeni ya da yönetici */
    public static function can_manage($course_id) {
        if (current_user_can('manage_options')) return true;
        return class_exists('OES_Teacher') && OES_Teacher::owns_course(get_current_user_id(), $course_id);
    }

    private function notify($user, $cert_id, $course_id, $url) {
        $cert   = get_the_title($cert_id);
        $course = get_the_title($course_id);

        if (class_exists('OES_Push')) {
            OES_Push::send_to_user($user->ID, '🎓 Sertifikan hazır',
                $course . ' — ' . $cert, $url, 'cert-' . $cert_id . '-' . $course_id);
        }
        if (!$user->user_email) return;

        $content = '<p>Merhaba ' . esc_html(self::display_name($user)) . ',</p>'
            . '<p><strong>' . esc_html($course) . '</strong> eğitimi için <strong>' . esc_html($cert) . '</strong> belgen hazır.</p>'
            . '<p>Sertifikan kişiye özel bir adreste tutulur; bu bağlantıyı paylaşarak belgeni doğrulatabilirsin.</p>';

        if (class_exists('OES_Mail_System')) {
            $html = OES_Mail_System::instance()->get_email_template('Sertifikan hazır', $content, 'Sertifikamı görüntüle', $url);
        } else {
            $html = $content . '<p><a href="' . esc_url($url) . '">Sertifikamı görüntüle</a></p>';
        }
        // İşlemsel e-posta: bildirim susturmasından bağımsız gönderilir
        wp_mail($user->user_email, 'Sertifikan hazır — ' . $course, $html, array('Content-Type: text/html; charset=UTF-8'));
    }

    /* =====================================================================
     *  Herkese açık ama TAHMİN EDİLEMEZ adres: /sertifika/{token}/
     * ================================================================== */

    public function add_rewrite() {
        add_rewrite_rule('^sertifika/([A-Za-z0-9]+)/?$', 'index.php?fabo_cert_token=$matches[1]', 'top');
    }

    /**
     * Flush AYRI ve GEÇ (init/99) yapılır — eklentideki diğer sınıfların da yaptığı gibi.
     * add_rewrite() içinde (init/10) flush edilirse, kendisinden SONRA kural ekleyen
     * sınıfların (ör. OES_PWA → /oes-sw.js, /oes-manifest.json) kuralları kaydedilmiş
     * option'a girmez ve kalıcı olarak 404 olur.
     */
    public function maybe_flush() {
        if (get_option('oes_cert_rw') !== self::RW_VERSION) {
            flush_rewrite_rules(false);
            update_option('oes_cert_rw', self::RW_VERSION);
        }
    }

    public function query_vars($vars) {
        $vars[] = 'fabo_cert_token';
        return $vars;
    }

    public function maybe_render() {
        // ÖNİZLEME (yalnızca yönetici): yayına almadan gerçek çıktıyı gösterir.
        // Gerçek sayfayla AYNI render'ı kullanır → gördüğün birebir basılan çıktıdır.
        if (!empty($_GET['fabo_cert_preview'])) {
            $cert_id = intval($_GET['fabo_cert_preview']);
            if (!current_user_can('manage_options') || get_post_type($cert_id) !== self::CPT) {
                return; // yetkisiz → normal sayfa akışı
            }
            $ad   = sanitize_text_field(wp_unslash($_GET['ad'] ?? '')) ?: 'Ad Soyad';
            $kurs = sanitize_text_field(wp_unslash($_GET['kurs'] ?? '')) ?: 'Eğitim Adı';
            $vurl = home_url('/sertifika/ornek/'); // önizlemede örnek doğrulama adresi

            if (!empty($_GET['png'])) { $this->output_png($cert_id, $ad, $kurs, $vurl); }

            nocache_headers();
            header('X-Robots-Tag: noindex, nofollow, noarchive');
            status_header(200);
            $this->render_html($cert_id, $ad, $kurs, current_time('mysql'), true, $vurl);
            exit;
        }

        $token = get_query_var('fabo_cert_token');
        if (!$token) return;

        global $wpdb, $wp_query;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_certificates WHERE token = %s LIMIT 1", $token));

        // Tanım silinmişse (yetim kayıt) sertifika yok sayılır → düzgün 404
        if ($row && get_post_type($row->cert_id) !== self::CPT) $row = null;

        if ($wp_query) $wp_query->is_404 = false;
        nocache_headers();
        // Sertifikalar arama motorlarında listelenmesin
        header('X-Robots-Tag: noindex, nofollow, noarchive');

        if (!$row) {
            status_header(404);
            echo '<!DOCTYPE html><meta charset="utf-8"><title>Sertifika bulunamadı</title>'
               . '<body style="font-family:system-ui,sans-serif;text-align:center;padding:60px;color:#12233a">'
               . '<h1 style="color:#194977">Sertifika bulunamadı</h1><p>Bu bağlantı geçersiz veya sertifika geri alınmış olabilir.</p></body>';
            exit;
        }
        status_header(200);
        $this->render_certificate($row);
        exit;
    }

    private function render_certificate($row) {
        // Belgedeki ad/eğitim adı, VERİLDİĞİ ANDA dondurulmuş değerlerdir —
        // kullanıcı sonradan adını değiştirse bile belge değişmez.
        // (Eski kayıtlarda kolon boşsa canlı veriye düşülür.)
        $name   = !empty($row->holder_name) ? $row->holder_name : self::display_name(get_userdata($row->user_id));
        $course = !empty($row->course_name) ? $row->course_name : get_the_title($row->course_id);
        $vurl   = self::certificate_url($row->token); // QR: kendi doğrulama adresi

        // Görsel isteği: metin sunucuda basılır (istemcide değiştirilemez)
        if (!empty($_GET['png'])) { $this->output_png($row->cert_id, $name, $course, $vurl); }

        $this->render_html($row->cert_id, $name, $course, $row->issued_at, false, $vurl);
    }

    /**
     * Sertifika sayfası. Hem gerçek sertifika hem de admin önizlemesi BURAYI kullanır;
     * böylece önizleme ile çıktı asla ayrışmaz.
     */
    private function render_html($cert_id, $name, $course, $issued_at, $is_preview = false, $verify_url = '') {
        $cert    = get_post($cert_id);
        $c       = self::get_config($cert_id);
        $meta    = $c['template'] ? wp_get_attachment_metadata($c['template']) : array();
        $natural = !empty($meta['width']) ? (int) $meta['width'] : 1000;
        $nat_h   = !empty($meta['height']) ? (int) $meta['height'] : 0;

        /* Sertifika, metni GÖMÜLMÜŞ tek bir PNG'dir: aynı adrese &png=1 eklenir.
           Metin HTML olarak basılsaydı, geliştirici araçlarıyla isim değiştirilip
           başkasının adına PDF alınabilirdi. Artık istemcide değiştirilebilecek
           bir metin katmanı YOK. */
        $img = add_query_arg('png', '1', $is_preview
            ? add_query_arg(array('fabo_cert_preview' => $cert_id, 'ad' => $name, 'kurs' => $course), home_url('/'))
            : $verify_url);

        $has_tpl   = !empty($c['template']) && self::can_render_image();
        // Yazdırmada sayfa şablonun oranında olsun (A4'e zorlanıp kenarlarda boşluk kalmasın)
        $page_size = ($natural && $nat_h) ? ($natural . 'px ' . $nat_h . 'px') : 'auto';
        ?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?php echo esc_html($name . ' — ' . ($cert ? $cert->post_title : 'Sertifika')); ?></title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    background:#eef1f6;color:#12233a;min-height:100vh;display:flex;flex-direction:column}
  a{color:inherit}
  /* Marka şeridi + header — sitenin diğer sayfalarıyla BİREBİR aynı ölçüler
     (39px şerit, 113px header, 100px ortalı logo, 1310px kap) */
  .site-top{background:#194977;min-height:39px;display:flex;align-items:center;justify-content:center;padding:0 15px}
  .site-top span{max-width:1310px;width:100%;text-align:center;color:#fff;font-size:13px;letter-spacing:.2px;line-height:1.5}
  .site-head{background:#fff;border-bottom:1px solid #e3e8ef}
  .site-head-in{height:113px;max-width:1310px;margin:0 auto;padding:0 15px;display:flex;align-items:center;justify-content:center}
  .brand{display:flex;align-items:center}
  .brand img{height:100px;width:auto;display:block}
  .brand-txt{font-size:22px;font-weight:700;color:#194977}
  /* Doğrulama rozeti: başlığın yanında, belgenin ne olduğunu söylediği yerde */
  .verify{display:inline-flex;align-items:center;gap:7px;background:#e7f6ee;color:#1f9d5b;border:1px solid #b9e3cc;
    border-radius:20px;padding:5px 12px;font-size:12.5px;font-weight:600;margin-bottom:8px}
  .verify.pv{background:#fff6e2;color:#7a5310;border-color:#f0c96b}
  .verify .tick{width:16px;height:16px;border-radius:50%;background:#1f9d5b;color:#fff;display:flex;align-items:center;
    justify-content:center;font-size:10px;line-height:1;flex:none}
  .verify.pv .tick{background:#b6851f}
  .wrap{max-width:1100px;margin:0 auto;padding:28px 20px 40px;width:100%;flex:1}
  .bar{display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:18px}
  .bar h1{font-size:22px;color:#194977;line-height:1.3}
  .bar .sub{font-size:13.5px;color:#5a6577;margin-top:5px;line-height:1.6}
  .bar .sub b{color:#12233a}
  .btn{background:#194977;color:#fff;border:none;border-radius:10px;padding:11px 18px;font-size:14px;font-weight:600;
    cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;gap:8px}
  .btn:hover{background:#142b56}
  /* Sertifika tek parça PNG: metin sunucuda basıldığı için istemcide font
     ölçeklemesi YOK → yazdırırken punto kayması da olmaz. */
  .cert{position:relative;background:#fff;box-shadow:0 14px 44px rgba(20,43,86,.18);border-radius:10px;overflow:hidden}
  .cert img{display:block;width:100%;height:auto;-webkit-user-drag:none;user-select:none;pointer-events:none}
  /* Alt bilgi — doğrulama açıklaması */
  .site-foot{background:#fff;border-top:1px solid #e3e8ef;padding:18px 20px;text-align:center;color:#98a1b3;font-size:12.5px;line-height:1.6}
  .site-foot a{color:#194977;font-weight:600;text-decoration:none}
  @media(max-width:640px){
    .site-head-in{height:auto;padding:12px 14px}
    .brand img{height:64px}
    .wrap{padding:18px 14px 28px}
    .bar h1{font-size:19px}
  }
  .miss{padding:60px;text-align:center;color:#5a6577}
  .pv-note{background:#fff6e2;border:1px solid #f0c96b;color:#7a5310;border-radius:10px;padding:11px 14px;font-size:13px;margin-bottom:14px;line-height:1.5}
  /* Yazdırma: sayfa TAM ŞABLON BOYUTUNDA — A4'e zorlanmaz, altta boşluk kalmaz,
     ikinci boş sayfa oluşmaz. margin:0 ayrıca tarayıcının bastığı site adresi /
     tarih başlık-altbilgisini de kaldırır. */
  @page{size:<?php echo esc_html($page_size); ?>;margin:0}
  @media print{
    html,body{background:#fff;padding:0;margin:0;width:100%;height:auto;overflow:hidden;
      -webkit-print-color-adjust:exact;print-color-adjust:exact}
    /* Yazdırmada YALNIZCA sertifika: marka şeridi/başlık/altbilgi çıkmaz */
    .bar,.pv-note,.site-top,.site-head,.site-foot{display:none !important}
    .wrap{max-width:none;margin:0;padding:0}
    .cert{box-shadow:none;border-radius:0;overflow:hidden;page-break-inside:avoid;break-inside:avoid;
      page-break-after:avoid;break-after:avoid}
    .cert img{width:100%;height:auto;display:block}
  }
</style>
</head>
<body>
<?php
$logo = class_exists('OES_Panel') ? OES_Panel::instance()->get_logo_url() : '';
$home = home_url('/');
?>
<div class="site-top"><span>İhtiyacına göre seç, kendi ritminde ilerle.</span></div>
<div class="site-head">
  <div class="site-head-in">
    <a class="brand" href="<?php echo esc_url($home); ?>" title="<?php echo esc_attr(get_bloginfo('name')); ?>">
      <?php if ($logo): ?>
        <img src="<?php echo esc_url($logo); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>">
      <?php else: ?>
        <span class="brand-txt"><?php echo esc_html(get_bloginfo('name')); ?></span>
      <?php endif; ?>
    </a>
  </div>
</div>

<div class="wrap">
  <?php if ($is_preview): ?>
  <div class="pv-note">
    <strong>ÖNİZLEME</strong> — bu sertifika kimseye verilmedi. Aşağıdaki görüntü, gerçek sertifikanın birebir aynısıdır.
    Ad ve eğitim adı örnek değerlerdir.
  </div>
  <?php endif; ?>
  <div class="bar">
    <div>
      <?php // Rozet burada: belgenin ne olduğunu anlattığımız yerde duruyor ?>
      <span class="verify<?php echo $is_preview ? ' pv' : ''; ?>">
        <span class="tick"><?php echo $is_preview ? '!' : '✓'; ?></span>
        <?php echo $is_preview ? 'Önizleme — verilmiş bir belge değil' : 'Doğrulanmış belge'; ?>
      </span>
      <h1><?php echo esc_html($cert ? $cert->post_title : 'Sertifika'); ?></h1>
      <div class="sub">
        Bu belge <b><?php echo esc_html($name); ?></b> adına, <b><?php echo esc_html($course); ?></b> eğitimi için
        <b><?php echo esc_html(date_i18n('d F Y', strtotime($issued_at))); ?></b> tarihinde düzenlenmiştir.
      </div>
    </div>
    <a class="btn" href="#" onclick="window.print();return false;">
      <span aria-hidden="true">⤓</span> Yazdır / PDF olarak kaydet
    </a>
  </div>

  <?php if (!$has_tpl): ?>
    <div class="cert"><div class="miss">Bu sertifikanın şablon görseli tanımlanmamış ya da sunucuda görsel işleme (GD) kapalı. Lütfen yöneticiyle iletişime geç.</div></div>
  <?php else: ?>
  <?php
    /* Sertifika TEK PARÇA GÖRSELDİR: ad, eğitim adı ve QR sunucuda görselin
       üstüne çizilir. Sayfada düzenlenebilir metin katmanı yoktur — kimse
       geliştirici araçlarıyla ismi değiştirip PDF alamaz. */
  ?>
  <div class="cert" id="cert">
    <img id="tpl" src="<?php echo esc_url($img); ?>" alt="<?php echo esc_attr($name . " — " . $course); ?>">
  </div>
  <script>
  (function(){
    // Metin ve QR görselin içinde; yine de sağ tık/sürükleme kapatılır.
    var cert = document.getElementById("cert");
    if (cert) {
      cert.addEventListener("contextmenu", function(e){ e.preventDefault(); });
      cert.addEventListener("dragstart", function(e){ e.preventDefault(); });
    }
  })();
  </script>
  <?php endif; ?>
</div>

<div class="site-foot">
  Bu sayfa belgenin doğrulama adresidir; bağlantıyı yalnızca belge sahibi paylaşabilir.
  <br><a href="<?php echo esc_url($home); ?>"><?php echo esc_html(get_bloginfo('name')); ?></a>
</div>
</body>
</html>
        <?php
    }
}

OES_Certificates::instance();
