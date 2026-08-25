<?php
/**
 * OES Panel Themes — Öğrenci paneli banner'ı + banner'a uyan renk teması
 *
 * Kullanıcı, panelinin en üstüne ("Merhaba, X" yazısının hemen üstüne) bir
 * çalışma ortamı görseli seçer; panelin renkleri de o görselin ortamına göre
 * değişir. Seçim kullanıcıya özeldir (user_meta) ve Tercihler & Ayarlar
 * bölümünden istediği zaman değiştirilebilir.
 *
 * TASARIM KURALI — HEADER DEĞİŞMEZ:
 *  Tema değişkenleri `.content` altında tanımlanır. Üst şerit, site header'ı ve
 *  mobil çekmece (#sidebar) `.content` dışında kaldığı için marka renklerini
 *  (navy/mavi) korur. Yalnızca sayfa zemini + içerik alanı temalanır.
 *
 * PALET KURALI — panel HER ZAMAN aydınlık kalır:
 *  Koyu görseller (kütüphane/gece) için de koyu mod yapılmaz; ortamın rengi
 *  vurgu + zemin tonuna taşınır. Böylece tüm bileşenler okunur kalır ve
 *  panel.css'teki tek bir kural bile kırılmaz.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Panel_Themes {

    const META  = '_oes_panel_theme';
    const NONCE = 'oes_panel_theme';

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_panel_set_theme', array($this, 'ajax_set_theme'));
    }

    /* ---------------------------------------------------------------------
     *  Tema kayıt defteri
     *
     *  vars → `.content` altına basılan CSS değişkenleri (panel.css :root ile
     *  birebir aynı isimler). page → <body> zemini. focus → banner kırpma
     *  odağı (görselin ilgi çekici bandı 5:1 şeride sığsın diye).
     * ------------------------------------------------------------------- */
    public static function themes() {
        $themes = array(

            'yok' => array(
                'label' => 'Klasik',
                'desc'  => 'Bannersız, kurumsal navy',
                'img'   => '',
                'page'  => '#ffffff',
                'vars'  => array(), // panel.css :root varsayılanları geçerli
            ),

            'kafe' => array(
                'label' => 'Kafe',
                'desc'  => 'Koyu ahşap, sıcak amber ışık',
                'img'   => 'kafe.jpg',
                'focus' => '50% 58%',
                'page'  => '#fcfaf7',
                'vars'  => array(
                    'card'      => '#f7f1e9',
                    'surface'   => '#fffdfa',
                    'line'      => '#e8ddcf',
                    'line2'     => '#efe6da',
                    'hover'     => '#f2e9dd',
                    'ink'       => '#2c2018',
                    'ink2'      => '#6b5c4e',
                    'ink3'      => '#a5978a',
                    'navy'      => '#6b4423',
                    'navy-d'    => '#4e3119',
                    'navy-soft' => '#f3e7d9',
                    'sky'       => '#c07f26',
                    'sky-soft'  => '#fbf0dd',
                    'gray-soft' => '#f0eae1',
                ),
            ),

            'aydinlik' => array(
                'label' => 'Aydınlık Ofis',
                'desc'  => 'Krem perde, açık ahşap, yeşil',
                'img'   => 'aydinlik.jpg',
                'focus' => '50% 62%',
                'page'  => '#fdfbf7',
                'vars'  => array(
                    'card'      => '#f6f0e6',
                    'surface'   => '#fffdf9',
                    'line'      => '#eae0d2',
                    'line2'     => '#f0e8dc',
                    'hover'     => '#f1e9dc',
                    'ink'       => '#33291f',
                    'ink2'      => '#6d6153',
                    'ink3'      => '#a89b8a',
                    'navy'      => '#8a6a41',
                    'navy-d'    => '#664c2c',
                    'navy-soft' => '#f2e9dc',
                    'sky'       => '#5f8a5c',
                    'sky-soft'  => '#e8f0e5',
                    'gray-soft' => '#efe9df',
                ),
            ),

            'kutuphane' => array(
                'label' => 'Klasik Kütüphane',
                'desc'  => 'Bordo perde, yeşil banker lambası',
                'img'   => 'kutuphane.jpg',
                'focus' => '50% 62%',
                'page'  => '#fdfaf9',
                'vars'  => array(
                    'card'      => '#f8f0ef',
                    'surface'   => '#fffcfb',
                    'line'      => '#ecdcdc',
                    'line2'     => '#f2e5e5',
                    'hover'     => '#f4e7e7',
                    'ink'       => '#2a1b1d',
                    'ink2'      => '#6b5457',
                    'ink3'      => '#a89294',
                    'navy'      => '#7b1f2b',
                    'navy-d'    => '#59151e',
                    'navy-soft' => '#f6e2e4',
                    'sky'       => '#2f5d43',
                    'sky-soft'  => '#e4efe8',
                    'gray-soft' => '#f0e8e8',
                ),
            ),

            'gece' => array(
                'label' => 'Gece Mermeri',
                'desc'  => 'Siyah keten, mermer, pirinç detay',
                'img'   => 'gece.jpg',
                'focus' => '50% 60%',
                'page'  => '#fbfbfc',
                'vars'  => array(
                    'card'      => '#f1f3f5',
                    'surface'   => '#ffffff',
                    'line'      => '#e0e4e8',
                    'line2'     => '#e8ecf0',
                    'hover'     => '#eaedf0',
                    'ink'       => '#1b1f23',
                    'ink2'      => '#5c646c',
                    'ink3'      => '#98a0a8',
                    'navy'      => '#2f3a42',
                    'navy-d'    => '#1c2429',
                    'navy-soft' => '#e6eaee',
                    'sky'       => '#a8814a',
                    'sky-soft'  => '#f4ece0',
                    'gray-soft' => '#edeff2',
                ),
            ),

            'mermer' => array(
                'label' => 'Mermer & Keten',
                'desc'  => 'Açık gri mermer, krem keten',
                'img'   => 'mermer.jpg',
                'focus' => '50% 60%',
                'page'  => '#fcfbf9',
                'vars'  => array(
                    'card'      => '#f4f2ed',
                    'surface'   => '#fffefc',
                    'line'      => '#e5e1d9',
                    'line2'     => '#ece9e2',
                    'hover'     => '#eeebe4',
                    'ink'       => '#25231f',
                    'ink2'      => '#615d56',
                    'ink3'      => '#9e998f',
                    'navy'      => '#55524b',
                    'navy-d'    => '#3a3833',
                    'navy-soft' => '#eae7e0',
                    'sky'       => '#96805e',
                    'sky-soft'  => '#f2ece1',
                    'gray-soft' => '#edeae3',
                ),
            ),
        );

        return apply_filters('fabo_panel_themes', $themes);
    }

    /** Geçerli tema id'si mi? */
    public static function is_valid($id) {
        return is_string($id) && isset(self::themes()[$id]);
    }

    /** Varsayılan tema — site geneli (yönetici filtre/option ile değiştirebilir). */
    public static function default_theme() {
        $opt = get_option('oes_panel_theme_default', 'aydinlik');
        return self::is_valid($opt) ? $opt : 'yok';
    }

    /** Kullanıcının seçtiği tema (yoksa varsayılan). */
    public static function get_user_theme($user_id = 0) {
        $user_id = $user_id ?: get_current_user_id();
        $id = $user_id ? get_user_meta($user_id, self::META, true) : '';
        return self::is_valid($id) ? $id : self::default_theme();
    }

    /** Banner görselinin tam URL'i (tema bannersızsa boş string). */
    public static function image_url($id) {
        $themes = self::themes();
        if (empty($themes[$id]['img'])) return '';
        return OES_PLUGIN_URL . 'assets/img/banners/' . $themes[$id]['img'];
    }

    /**
     * Tüm temaların CSS'i — <head> içine bir kez basılır.
     *
     * Hepsi birden basıldığı için tema değiştirmek sayfa yenilemeden olur:
     * JS yalnızca <body data-fo-theme="..."> değerini değiştirir.
     *
     * @param string $scope Değişkenlerin ineceği kapsayıcı seçici(ler), virgülle
     *                      ayrılabilir. Panelde `.content`; kendi iskeletini kuran
     *                      sayfalar (player gibi) kendi içerik kapsayıcısını verir.
     *                      Header her durumda kapsam dışında kalır.
     */
    public static function css($scope = '.content') {
        $scopes = array_filter(array_map('trim', explode(',', (string) $scope)));
        if (!$scopes) $scopes = array('.content');

        $out = '';
        foreach (self::themes() as $id => $t) {
            $sel = 'body[data-fo-theme="' . $id . '"]';

            if (!empty($t['page'])) {
                $out .= $sel . '{background:' . $t['page'] . ';}';
            }
            if (!empty($t['vars'])) {
                $decl = '';
                foreach ($t['vars'] as $k => $v) $decl .= '--' . $k . ':' . $v . ';';
                // Değişkenler YALNIZCA içerik alanına iner → header dokunulmaz.
                $parts = array();
                foreach ($scopes as $sc) $parts[] = $sel . ' ' . $sc;
                $out .= implode(',', $parts) . '{' . $decl . '}';
            }
            $url = self::image_url($id);
            if ($url) {
                $out .= $sel . ' .fo-banner{background-image:url(' . esc_url_raw($url) . ');'
                      . 'background-position:' . (isset($t['focus']) ? $t['focus'] : '50% 60%') . ';}';
            }
        }
        return $out;
    }

    /* ---------------------------------------------------------------------
     *  AJAX — tema kaydet
     * ------------------------------------------------------------------- */
    public function ajax_set_theme() {
        check_ajax_referer(self::NONCE, 'nonce');

        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error('Giriş yapmalısınız.');

        $id = sanitize_key($_POST['theme'] ?? '');
        if (!self::is_valid($id)) wp_send_json_error('Geçersiz tema.');

        update_user_meta($user_id, self::META, $id);

        $themes = self::themes();
        wp_send_json_success(array(
            'theme'   => $id,
            'label'   => $themes[$id]['label'],
            'image'   => self::image_url($id),
            'message' => 'Panel görünümün güncellendi.',
        ));
    }
}

OES_Panel_Themes::instance();
