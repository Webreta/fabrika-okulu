<?php
/**
 * OES PWA — Kurulabilir uygulama (manifest + service worker) + web push bağlama.
 *
 * - /oes-manifest.json ve /oes-sw.js kök kapsamda (rewrite + template_redirect) sunulur.
 * - head_tags(): manifest linki + tema/iOS meta + push.js (girişliyse) çıktısı.
 *   Normal site sayfalarında wp_head ile; standalone panel/player şablonlarında elle çağrılır.
 * - Sunucu tarafı push (OES_Push) + istemci push.js zaten hazır; burada bağlanır.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_PWA {

    private static $instance = null;
    const RW_VERSION = 'pwa1';

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('init', array($this, 'add_rewrite'));
        add_filter('query_vars', array($this, 'query_vars'));
        add_action('template_redirect', array($this, 'maybe_serve'), 0);
        add_action('wp_head', array($this, 'head_tags'), 1);

        if (get_option('oes_pwa_rw') !== self::RW_VERSION) {
            add_action('init', function () {
                flush_rewrite_rules(false);
                update_option('oes_pwa_rw', self::RW_VERSION);
            }, 99);
        }
    }

    public function add_rewrite() {
        add_rewrite_rule('^oes-sw\.js$', 'index.php?oes_sw=1', 'top');
        add_rewrite_rule('^oes-manifest\.json$', 'index.php?oes_manifest=1', 'top');
    }

    public function query_vars($vars) {
        $vars[] = 'oes_sw';
        $vars[] = 'oes_manifest';
        return $vars;
    }

    /* İkon: site ikonu → panel ikonu (yedek) */
    public static function icon_url($size = 192) {
        $i = get_site_icon_url($size);
        if ($i) return $i;
        if (class_exists('OES_Teacher_Panel')) return OES_Teacher_Panel::instance()->get_icon_url();
        return OES_PLUGIN_URL . 'assets/img/panel-icon.png';
    }

    public function maybe_serve() {
        if (get_query_var('oes_manifest')) {
            nocache_headers();
            header('Content-Type: application/manifest+json; charset=utf-8');
            $name  = get_bloginfo('name');
            $scope = parse_url(home_url('/'), PHP_URL_PATH) ?: '/';
            echo wp_json_encode(array(
                'name'             => $name,
                'short_name'       => mb_substr($name, 0, 16),
                'start_url'        => home_url('/panel/'),
                'scope'            => $scope,
                'display'          => 'standalone',
                'orientation'      => 'portrait-primary',
                'background_color' => '#ffffff',
                'theme_color'      => '#194977',
                'lang'             => 'tr',
                'icons'            => array(
                    array('src' => self::icon_url(192), 'sizes' => '192x192', 'type' => 'image/png', 'purpose' => 'any maskable'),
                    array('src' => self::icon_url(512), 'sizes' => '512x512', 'type' => 'image/png', 'purpose' => 'any maskable'),
                ),
            ));
            exit;
        }

        if (get_query_var('oes_sw')) {
            nocache_headers();
            header('Content-Type: application/javascript; charset=utf-8');
            header('Service-Worker-Allowed: /');
            $icon = self::icon_url(192);
            ?>
/* Fabrika Okulu — Service Worker (push + installability) */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Fabrika Okulu', body: (e.data ? e.data.text() : '') }; }
  var opts = {
    body: d.body || '',
    icon: d.icon || <?php echo wp_json_encode($icon); ?>,
    badge: d.badge || d.icon || <?php echo wp_json_encode($icon); ?>,
    data: { url: d.url || '/' },
    tag: d.tag || undefined,
    renotify: !!d.tag,
    vibrate: [80, 40, 80]
  };
  e.waitUntil(self.registration.showNotification(d.title || 'Fabrika Okulu', opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
      for (var i = 0; i < cl.length; i++) {
        if (cl[i].url.indexOf(url) !== -1 && 'focus' in cl[i]) return cl[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
            <?php
            exit;
        }
    }

    /**
     * <head> etiketleri: manifest + tema/iOS meta + (girişliyse) push.js.
     * Standalone şablonlarda: <?php OES_PWA::head_tags(); ?> ile çağır.
     */
    public static function head_tags() {
        $sw    = home_url('/oes-sw.js');
        $scope = parse_url(home_url('/'), PHP_URL_PATH) ?: '/';
        echo '<link rel="manifest" href="' . esc_url(home_url('/oes-manifest.json')) . '">' . "\n";
        echo '<meta name="theme-color" content="#194977">' . "\n";
        echo '<meta name="apple-mobile-web-app-capable" content="yes">' . "\n";
        echo '<meta name="mobile-web-app-capable" content="yes">' . "\n";
        echo '<meta name="apple-mobile-web-app-status-bar-style" content="default">' . "\n";
        echo '<meta name="apple-mobile-web-app-title" content="' . esc_attr(get_bloginfo('name')) . '">' . "\n";
        $ai = self::icon_url(180);
        if ($ai) echo '<link rel="apple-touch-icon" href="' . esc_url($ai) . '">' . "\n";

        // push.js'in enjekte ettiği bildirim çubuğu için stil (her yüzeyde tutarlı görünsün)
        echo '<style>'
            . '.oesp-push-banner{position:fixed;bottom:18px;right:18px;left:auto;width:auto;max-width:360px;z-index:99999;display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #e3e8ef;border-radius:14px;box-shadow:0 16px 44px rgba(20,43,86,.20);padding:14px 16px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;transform:translateY(160%);opacity:0;transition:transform .3s ease,opacity .3s ease;}'
            . '.oesp-push-banner.show{transform:translateY(0);opacity:1;}'
            . '.oesp-push-banner>i{font-size:24px;color:#194977;flex-shrink:0;}'
            . '.oesp-pb-txt{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;line-height:1.4;}'
            . '.oesp-pb-txt strong{font-size:14px;color:#12233a;}'
            . '.oesp-pb-txt span{font-size:12.5px;color:#5a6577;}'
            . '.oesp-pb-yes{background:#194977;color:#fff;border:none;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;flex-shrink:0;}'
            . '.oesp-pb-yes:hover{background:#142b56;}'
            . '.oesp-pb-no{background:none;border:none;color:#9aa7b8;font-size:22px;line-height:1;cursor:pointer;padding:0 2px;flex-shrink:0;}'
            . '@media(max-width:520px){.oesp-push-banner{left:12px;right:12px;max-width:none;}}'
            . '</style>' . "\n";

        if (is_user_logged_in() && class_exists('OES_Push')) {
            echo '<script>window.oesPush=' . wp_json_encode(array(
                'publicKey' => OES_Push::public_key(),
                'ajaxUrl'   => admin_url('admin-ajax.php'),
                'nonce'     => wp_create_nonce('oes_push'),
                'swUrl'     => $sw,
                'scope'     => $scope,
            )) . ';</script>' . "\n";
            echo '<script src="' . esc_url(OES_PLUGIN_URL . 'assets/js/push.js?v=' . OES_VERSION) . '" defer></script>' . "\n";
        } else {
            // Girişsiz kullanıcıda da SW kaydı (uygulama kurulabilir olsun)
            echo '<script>if("serviceWorker" in navigator){navigator.serviceWorker.register(' . wp_json_encode($sw) . ',{scope:' . wp_json_encode($scope) . '}).catch(function(){});}</script>' . "\n";
        }
    }
}

OES_PWA::instance();
