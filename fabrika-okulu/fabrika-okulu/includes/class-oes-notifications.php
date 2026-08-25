<?php
/**
 * Fabrika Okulu — Bildirimlerim (kullanıcı bazlı bildirim kutusu)
 *
 * NEDEN AYRI BİR TABLO:
 * `oes_notifications_log` yönetici günlüğüdür (hangi duyuru kaç kişiye gitti).
 * Kullanıcının kendi bildirim listesi, okundu/okunmadı bilgisi yoktu.
 *
 * Bildirim, push'tan BAĞIMSIZ kaydedilir: öğrenci push izni vermemiş olsa da
 * (ya da sunucuda push kapalı olsa da) bildirimini panelinde görür.
 * Kayıt noktası: OES_Push::send_to_user/send_to_users — yani push gönderilen
 * her olay otomatik olarak buraya da düşer, ayrıca kod yazmaya gerek yok.
 */

if (!defined('ABSPATH')) exit;

class OES_Notifications {

    const NONCE    = 'oes_notifications';
    const PER_PAGE = 12; // ilk açılışta ve "devamını yükle"de gelen adet

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_notif_list',      array($this, 'ajax_list'));
        add_action('wp_ajax_oes_notif_read',      array($this, 'ajax_read'));
        add_action('wp_ajax_oes_notif_read_all',  array($this, 'ajax_read_all'));
    }

    public static function table() {
        global $wpdb;
        return $wpdb->prefix . 'oes_notifications';
    }

    /* ---------------------------------------------------------------------
     *  "Mesajlarım" ikonu (zarf) — TEK KAYNAK
     *
     *  Kullanıcının verdiği SVG bir trace çıktısıydı; ~120 adet 1-2 piksellik
     *  gürültü path'i temizlendi, geriye anlamlı 3 şekil kaldı:
     *    ICON_BODY  → zarf çerçevesi (kapak/yan/alt bölgeler oyulmuş)
     *    ICON_FLAP  → üst kapak dolgusu
     *    ICON_FRONT → ön yüz dolgusu
     *
     *  İKİ SÜRÜM:
     *  - mono()  : tek path + currentColor. Menü ve header için ŞART —
     *              `.hicon` mavi zeminde beyaz, `.ni.active` navy zeminde beyaz
     *              ikon bekliyor; sabit lacivert bir SVG oralarda kaybolurdu.
     *  - color() : orijinal üç renk. Büyük gösterimde (bölüm başlığı, boş durum).
     * ------------------------------------------------------------------- */

    const ICON_BODY = 'M94.5 120.7c-6.6 2-12.4 6.8-16 13.4l-3 5.4v221l2.3 4.5c3.2 6.1 6.7 9.7 12.7 12.8l5 2.7 152 .3c116.6.2 153 0 156.5-.9 8.4-2.3 13.8-6.9 18.6-15.9 1.8-3.4 1.9-8 1.9-114V139.5l-3-5.3c-3.2-5.9-6.6-9.1-12.9-12.5l-4.1-2.2-152.5-.2c-134.6-.2-153.1 0-157.5 1.4M400.8 141c-.1.5-19.6 18.8-43.3 40.6-23.6 21.9-55.4 51.3-70.5 65.4s-28.9 26.6-30.7 27.9c-4.2 3.2-10.3 3.1-14.6-.2-1.8-1.3-23.7-21.5-48.7-44.7-25-23.3-56.6-52.7-70.2-65.3s-24.5-23.3-24.2-23.8c.8-1.3 302.7-1.2 302.2.1m3.2 107.7v79.7l-3.7-3.5c-2.1-1.9-12.1-11.4-22.3-21-10.2-9.7-27.5-26-38.5-36.4-11-10.3-20.1-19.1-20.3-19.6-.4-.9 5.6-6.7 49.7-47.8 18.4-17.1 33.8-31.1 34.3-31.1.4 0 .8 35.9.8 79.7m-271.2-45.4c19.6 18.3 38.4 35.8 41.7 38.9l6 5.6-14.5 13.9c-45 43.3-69.6 66.1-70.3 65.4s.2-157.1 1-157.1c.2 0 16.4 15 36.1 33.3M352.7 309c27 25.6 49.2 47.2 49.2 48.1.1.9-.6 2-1.5 2.3s-68.7.6-150.8.6c-126.7 0-149.5-.2-151.1-1.4-1.9-1.3-1.2-2.2 11.5-14.3 7.4-7 29.5-28.2 49.2-47.1 19.6-18.8 36.2-34.2 36.8-34.2s8.3 6.7 17.1 15c19.7 18.5 22.9 20.4 35.4 20.4 13.3.1 17.7-2.4 37.9-21.4 8.8-8.3 16.2-14.9 16.6-14.8.4.2 22.7 21.2 49.7 46.8';

    const ICON_FLAP = 'M99.5 141.1c-.4.5 3.1 4.5 7.6 8.7 10.8 10 56.4 52.3 99.2 92.2 18.6 17.3 35.3 32.3 37 33.2 4.1 2.3 8.5 2.3 12.2-.1 1.7-1.1 11.6-9.9 22-19.7 10.5-9.8 42-39 70-64.9 28.1-25.9 51.6-47.9 52.4-48.8 1.3-1.6-8.7-1.7-149.2-1.7-105.3 0-150.8.3-151.2 1.1';

    const ICON_FRONT = 'M286.4 278c-19.9 18.8-24.6 21.5-37.4 21.5-12.5 0-16.5-2.3-36.1-20.6-8.7-8.2-16.5-14.9-17.3-14.9-.7 0-2 .7-2.7 1.7-1.2 1.4-24.2 23.5-83.3 80.1-9.1 8.7-11.6 11.6-10.5 12.3 2.2 1.4 300.6 1.2 301.5-.2.4-.7-3.3-5.1-9.2-10.8-14.3-13.9-88.3-84.1-88.7-84.1-.2 0-7.5 6.8-16.3 15';

    /** Menü/header ikonu — bulunduğu yerin rengini alır. */
    public static function icon_mono($class = 'fabo-msg-ic') {
        return '<svg class="' . esc_attr($class) . '" viewBox="0 0 500 500" fill="currentColor" '
             . 'aria-hidden="true" focusable="false"><path d="' . self::ICON_BODY . '"/></svg>';
    }

    /** Büyük/renkli sürüm — bölüm başlığı ve boş durum için. */
    public static function icon_color($class = 'fabo-msg-ic lg') {
        return '<svg class="' . esc_attr($class) . '" viewBox="0 0 500 500" '
             . 'aria-hidden="true" focusable="false">'
             . '<path fill="#002a80" d="' . self::ICON_BODY  . '"/>'
             . '<path fill="#0055d4" d="' . self::ICON_FLAP  . '"/>'
             . '<path fill="#80d4ff" d="' . self::ICON_FRONT . '"/>'
             . '</svg>';
    }

    /**
     * Bildirim ekler. Push gönderilmese bile çağrılır (bkz. OES_Push).
     * @param string $tag Olay etiketi — yalnızca kayıt/izleme amaçlı saklanır.
     *                    Tekrarı ENGELLEMEZ; tekrar koruması gerekiyorsa çağıran
     *                    tarafta yapılır (ör. OES_Push_Scheduler::already/mark).
     */
    public static function add($user_id, $title, $body = '', $url = '', $tag = '') {
        global $wpdb;
        $user_id = (int) $user_id;
        if (!$user_id || $title === '') return 0;

        // Kolon yoksa (migration çalışmadıysa) sessizce çık — bildirim kritik değil
        static $ok = null;
        if ($ok === null) {
            $t  = self::table();
            $ok = ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) === $t);
        }
        if (!$ok) return 0;

        $wpdb->insert(self::table(), array(
            'user_id'    => $user_id,
            'title'      => wp_strip_all_tags((string) $title),
            'body'       => wp_strip_all_tags((string) $body),
            'url'        => esc_url_raw((string) $url),
            'tag'        => sanitize_text_field((string) $tag),
            'is_read'    => 0,
            'created_at' => current_time('mysql'),
        ));
        return (int) $wpdb->insert_id;
    }

    /** Kullanıcının bildirimleri (en yeni üstte) */
    public static function get_for_user($user_id, $limit = self::PER_PAGE, $offset = 0) {
        global $wpdb;
        $t = self::table();
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return array();
        return $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$t} WHERE user_id = %d ORDER BY id DESC LIMIT %d OFFSET %d",
            (int) $user_id, (int) $limit, (int) $offset));
    }

    public static function count_for_user($user_id) {
        global $wpdb;
        $t = self::table();
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return 0;
        return (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$t} WHERE user_id = %d", (int) $user_id));
    }

    public static function unread_count($user_id) {
        global $wpdb;
        $t = self::table();
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $t)) !== $t) return 0;
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$t} WHERE user_id = %d AND is_read = 0", (int) $user_id));
    }

    /** "3 dk önce" gibi okunabilir zaman */
    public static function human_time($mysql_date) {
        $ts = strtotime($mysql_date);
        if (!$ts) return '';
        $diff = current_time('timestamp') - $ts;
        if ($diff < 60)    return 'az önce';
        if ($diff < 3600)  return floor($diff / 60) . ' dk önce';
        if ($diff < 86400) return floor($diff / 3600) . ' saat önce';
        if ($diff < 172800) return 'dün';
        if ($diff < 604800) return floor($diff / 86400) . ' gün önce';
        return date_i18n('d M Y', $ts);
    }

    /* =====================================================================
     *  AJAX
     * ================================================================== */

    private function guard() {
        check_ajax_referer(self::NONCE, 'nonce');
        $uid = get_current_user_id();
        if (!$uid) wp_send_json_error('Giriş yapmalısınız.');
        return $uid;
    }

    /** "Devamını yükle" */
    public function ajax_list() {
        $uid    = $this->guard();
        $offset = max(0, intval($_POST['offset'] ?? 0));
        $rows   = self::get_for_user($uid, self::PER_PAGE, $offset);

        $out = array();
        foreach ($rows as $r) {
            $out[] = array(
                'id'    => (int) $r->id,
                'title' => $r->title,
                'body'  => $r->body,
                'url'   => $r->url,
                'read'  => (int) $r->is_read,
                'when'  => self::human_time($r->created_at),
            );
        }
        wp_send_json_success(array(
            'items' => $out,
            'more'  => (self::count_for_user($uid) > $offset + count($rows)),
        ));
    }

    /** Tek bildirimi okundu işaretle (tıklanınca) */
    public function ajax_read() {
        global $wpdb;
        $uid = $this->guard();
        $id  = intval($_POST['id'] ?? 0);
        if ($id) {
            // user_id şartı: başkasının bildirimini işaretleyemesin
            $wpdb->update(self::table(), array('is_read' => 1),
                array('id' => $id, 'user_id' => $uid), array('%d'), array('%d', '%d'));
        }
        wp_send_json_success(array('unread' => self::unread_count($uid)));
    }

    public function ajax_read_all() {
        global $wpdb;
        $uid = $this->guard();
        $wpdb->update(self::table(), array('is_read' => 1), array('user_id' => $uid), array('%d'), array('%d'));
        wp_send_json_success(array('unread' => 0));
    }

    /* =====================================================================
     *  Ortak liste görünümü (öğrenci + eğitmen panelleri aynı işaretlemeyi kullanır)
     * ================================================================== */

    /**
     * Bildirim listesini basar.
     * NOT: Bildirim linki DOĞRUDAN hedefe gider; öğrenci o içeriğe henüz
     * erişemiyorsa player'ın önkoşul kilidi onu kaldığı yere düşürür
     * (bkz. templates/player.php — frontier redirect).
     */
    public static function render_list($user_id) {
        $rows  = self::get_for_user($user_id, self::PER_PAGE, 0);
        $total = self::count_for_user($user_id);
        ?>
        <div class="nl" id="nlList" data-total="<?php echo intval($total); ?>">
            <?php if (empty($rows)): ?>
                <div class="empty"><?php echo self::icon_color('fabo-msg-ic empty-ic'); ?><p>Henüz mesajın yok.</p></div>
            <?php else: ?>
                <?php foreach ($rows as $r) echo self::row_html($r); ?>
            <?php endif; ?>
        </div>
        <?php if ($total > count($rows)): ?>
            <div class="nl-more"><button type="button" class="btn ghost" id="nlMore">Devamını yükle</button></div>
        <?php endif; ?>
        <?php
    }

    public static function row_html($r) {
        $unread = empty($r->is_read);
        $href   = $r->url ? esc_url($r->url) : '#';
        ob_start(); ?>
        <a class="nl-item<?php echo $unread ? ' unread' : ''; ?>" href="<?php echo $href; ?>"
           data-id="<?php echo intval($r->id); ?>">
            <span class="nl-dot" aria-hidden="true"></span>
            <span class="nl-main">
                <span class="nl-t"><?php echo esc_html($r->title); ?></span>
                <?php if ($r->body !== ''): ?><span class="nl-b"><?php echo esc_html($r->body); ?></span><?php endif; ?>
            </span>
            <span class="nl-when"><?php echo esc_html(self::human_time($r->created_at)); ?></span>
        </a>
        <?php
        return ob_get_clean();
    }

    /** Liste + "devamını yükle" + okundu işaretleme JS'i (iki panelde de aynı) */
    public static function inline_js() {
        $nonce = wp_create_nonce(self::NONCE);
        ?>
        <script>
        (function(){
          var AJAX=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>,
              NONCE=<?php echo wp_json_encode($nonce); ?>,
              PER=<?php echo intval(self::PER_PAGE); ?>;
          var list=document.getElementById('nlList'); if(!list) return;
          var moreBtn=document.getElementById('nlMore');
          var offset=list.querySelectorAll('.nl-item').length;

          function body(d){var b='';for(var k in d)b+=(b?'&':'')+k+'='+encodeURIComponent(d[k]);return b;}
          function post(d){
            return fetch(AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body(d),credentials:'same-origin'}).then(function(r){return r.json();});}
          /* Tıklanınca sayfa hemen gidiyor ve normal fetch İPTAL oluyordu →
             okundu bilgisi veritabanına yazılmıyor, rozet geri geliyordu.
             sendBeacon/keepalive isteği sayfa değişse de tamamlar. */
          function postDuringNav(d){
            var b=body(d);
            if(navigator.sendBeacon){
              try{ navigator.sendBeacon(AJAX, new Blob([b],{type:'application/x-www-form-urlencoded'})); return; }catch(e){}
            }
            fetch(AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b,credentials:'same-origin',keepalive:true});
          }
          function esc(s){var d=document.createElement('div');d.textContent=(s==null?'':s);return d.innerHTML;}

          function setBadge(n){
            document.querySelectorAll('.nbadge').forEach(function(b){
              if(n>0){ b.textContent = n>9 ? '9+' : n; } else { b.remove(); }
            });
          }

          function rowHTML(it){
            return '<a class="nl-item'+(it.read?'':' unread')+'" href="'+(it.url||'#')+'" data-id="'+it.id+'">'
                 + '<span class="nl-dot"></span><span class="nl-main"><span class="nl-t">'+esc(it.title)+'</span>'
                 + (it.body?'<span class="nl-b">'+esc(it.body)+'</span>':'')
                 + '</span><span class="nl-when">'+esc(it.when)+'</span></a>';
          }

          // Tıklayınca okundu işaretle — sonra linke devam (engellemeden).
          // Sayfa değişse bile isteğin tamamlanması için postDuringNav kullanılır.
          list.addEventListener('click', function(e){
            var a=e.target.closest('.nl-item'); if(!a)return;
            if(a.classList.contains('unread')){
              a.classList.remove('unread');
              postDuringNav({action:'oes_notif_read',nonce:NONCE,id:a.getAttribute('data-id')});
              // Rozeti anında düşür (sunucu yanıtını bekleyemeyiz — sayfa gidiyor)
              var left=list.querySelectorAll('.nl-item.unread').length;
              setBadge(left);
            }
          });

          if(moreBtn) moreBtn.addEventListener('click', function(){
            moreBtn.disabled=true; moreBtn.textContent='Yükleniyor…';
            post({action:'oes_notif_list',nonce:NONCE,offset:offset}).then(function(r){
              moreBtn.disabled=false; moreBtn.textContent='Devamını yükle';
              if(!r||!r.success){return;}
              (r.data.items||[]).forEach(function(it){ list.insertAdjacentHTML('beforeend', rowHTML(it)); });
              offset += (r.data.items||[]).length;
              if(!r.data.more){ var w=moreBtn.parentNode; w.parentNode.removeChild(w); } // boş sarmalayıcı kalmasın
            }).catch(function(){ moreBtn.disabled=false; moreBtn.textContent='Devamını yükle'; });
          });

          var allBtn=document.getElementById('nlReadAll');
          if(allBtn) allBtn.addEventListener('click', function(){
            post({action:'oes_notif_read_all',nonce:NONCE}).then(function(){
              list.querySelectorAll('.nl-item.unread').forEach(function(el){el.classList.remove('unread');});
              setBadge(0);
              allBtn.remove();
            });
          });
        })();
        </script>
        <?php
    }
}

OES_Notifications::instance();
