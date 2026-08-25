<?php
/**
 * OES Push — Kendi sunucumuzdan Web Push (VAPID + aes128gcm), üçüncü parti YOK.
 *
 * - VAPID anahtarları bir kez üretilir (openssl EC prime256v1).
 * - Abonelikler oes_push_subscriptions tablosunda (kullanıcı bazlı).
 * - send_to_user() ilgili olaylarda push gönderir.
 * - Olaylar: yeni görev/sınav, not, soru yanıtı (öğrenciye); yeni gönderim/soru/randevu (eğitmene).
 * - Eğitmen manuel duyuru (oes_tp_announce).
 *
 * NOT: openssl EC + hash_hkdf + openssl_pkey_derive (PHP 7.3+) gerekir; yoksa sessizce devre dışı.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Push {

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('init', array($this, 'maybe_create_table'), 6);
        add_action('admin_init', array($this, 'maybe_create_table'));

        // Abonelik uçları
        add_action('wp_ajax_oes_push_subscribe',   array($this, 'ajax_subscribe'));
        add_action('wp_ajax_oes_push_unsubscribe', array($this, 'ajax_unsubscribe'));
        add_action('wp_ajax_oes_push_test',        array($this, 'ajax_test_push'));
        add_action('wp_ajax_oes_tp_announce',      array($this, 'ajax_announce'));

        // Admin: Bildirimler sayfası (eski Mail menüsünü de içine alır)
        add_action('admin_menu', array($this, 'admin_menu'), 100);
        add_action('admin_menu', array($this, 'relocate_mail_menu'), 101);

        // --- Otomatik olaylar ---
        // Öğrenciye: yeni görev / sınav
        add_action('oes_assignment_created', array($this, 'on_assignment_created'));
        add_action('oes_quiz_created',       array($this, 'on_quiz_created'));
        // Öğrenciye: not / değerlendirme
        add_action('oes_assignment_graded',  array($this, 'on_assignment_graded'));
        add_action('oes_quiz_graded',        array($this, 'on_quiz_graded'), 10, 2);
        // Öğrenciye: soru yanıtlandı (teacher-questions içinden do_action tetiklenir)
        // 5 arg: (student_id, course_name, answer, course_id, question_id) —
        // bildirim, sorunun sorulduğu DERSE gitsin diye
        add_action('oes_question_answered_push', array($this, 'on_question_answered'), 10, 5);
        // Eğitmene: yeni gönderim / soru / randevu
        add_action('oes_assignment_submitted', array($this, 'on_assignment_submitted'));
        add_action('oes_question_asked',       array($this, 'on_question_asked'));
        add_action('oes_appointment_booked',   array($this, 'on_appointment_booked'), 10, 2);
    }

    public static function available() {
        return function_exists('hash_hkdf')
            && function_exists('openssl_pkey_derive')
            && in_array('prime256v1', openssl_get_curve_names() ?: array(), true);
    }

    /* ==========================================================================
     *  Kurulum: tablo + VAPID anahtarları
     * ========================================================================== */
    public function maybe_create_table() {
        global $wpdb;
        static $done = false;
        if ($done) return;
        $done = true;
        // En yeni tabloya (log) göre kontrol: yoksa ikisini de kur (dbDelta idempotent).
        // Eski kurulumlarda subscriptions vardı ama log tablosu sonradan eklendi.
        $log = $wpdb->prefix . 'oes_notifications_log';
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $log)) === $log) return;
        $t = $wpdb->prefix . 'oes_push_subscriptions';
        $cs = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta("CREATE TABLE {$t} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            endpoint varchar(500) NOT NULL,
            p256dh varchar(255) NOT NULL,
            auth varchar(255) NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            UNIQUE KEY endpoint (endpoint(191))
        ) $cs;");

        dbDelta("CREATE TABLE {$wpdb->prefix}oes_notifications_log (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            channel varchar(20) DEFAULT 'push',
            title varchar(255) NOT NULL,
            body text,
            target varchar(120) DEFAULT '',
            sent_count int(11) DEFAULT 0,
            created_by bigint(20) DEFAULT 0,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY created_at (created_at)
        ) $cs;");
    }

    public static function log($channel, $title, $target, $count, $by = 0) {
        global $wpdb;
        $wpdb->insert($wpdb->prefix . 'oes_notifications_log', array(
            'channel'    => $channel,
            'title'      => $title,
            'target'     => $target,
            'sent_count' => (int) $count,
            'created_by' => $by ?: get_current_user_id(),
            'created_at' => current_time('mysql'),
        ));
    }

    /** VAPID anahtar çifti (yoksa üret). Döner: ['public'=>b64url, 'pem'=>privatePEM] */
    public static function vapid_keys() {
        $public = get_option('oes_vapid_public');
        $pem    = get_option('oes_vapid_pem');
        if ($public && $pem) return array('public' => $public, 'pem' => $pem);

        if (!self::available()) return null;
        $res = openssl_pkey_new(array('curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC));
        if (!$res) return null;
        openssl_pkey_export($res, $pem);
        $d = openssl_pkey_get_details($res);
        $raw_public = "\x04" . str_pad($d['ec']['x'], 32, "\x00", STR_PAD_LEFT) . str_pad($d['ec']['y'], 32, "\x00", STR_PAD_LEFT);
        $public = self::b64url($raw_public);
        update_option('oes_vapid_public', $public, false);
        update_option('oes_vapid_pem', $pem, false);
        return array('public' => $public, 'pem' => $pem);
    }

    public static function public_key() {
        $k = self::vapid_keys();
        return $k ? $k['public'] : '';
    }

    /* ==========================================================================
     *  Abonelik AJAX
     * ========================================================================== */
    public function ajax_subscribe() {
        check_ajax_referer('oes_push', 'nonce');
        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error('Giriş gerekli.');

        $sub = json_decode(wp_unslash($_POST['subscription'] ?? ''), true);
        if (!is_array($sub) || empty($sub['endpoint']) || empty($sub['keys']['p256dh']) || empty($sub['keys']['auth'])) {
            wp_send_json_error('Geçersiz abonelik.');
        }
        global $wpdb;
        $t = $wpdb->prefix . 'oes_push_subscriptions';
        $wpdb->query($wpdb->prepare("DELETE FROM $t WHERE endpoint = %s", $sub['endpoint']));
        $wpdb->insert($t, array(
            'user_id'  => $user_id,
            'endpoint' => esc_url_raw($sub['endpoint']),
            'p256dh'   => sanitize_text_field($sub['keys']['p256dh']),
            'auth'     => sanitize_text_field($sub['keys']['auth']),
        ));
        wp_send_json_success(array('message' => 'Bildirimler açıldı.'));
    }

    public function ajax_unsubscribe() {
        check_ajax_referer('oes_push', 'nonce');
        $user_id = get_current_user_id();
        global $wpdb;
        $endpoint = esc_url_raw($_POST['endpoint'] ?? '');
        if ($endpoint) {
            $wpdb->delete($wpdb->prefix . 'oes_push_subscriptions', array('endpoint' => $endpoint, 'user_id' => $user_id));
        }
        wp_send_json_success();
    }

    /* ==========================================================================
     *  Gönderim
     * ========================================================================== */
    public static function send_to_user($user_id, $title, $body, $url = '', $tag = '', $log = '') {
        /* Bildirim kutusuna HER ZAMAN düşsün: push aboneliği olmasa da, sunucuda
           push kapalı olsa da kullanıcı panelindeki "Bildirimlerim"de görsün.
           Bu yüzden availability kontrolünden ÖNCE kaydedilir. */
        if (class_exists('OES_Notifications')) {
            OES_Notifications::add($user_id, $title, $body, $url, $tag);
        }
        if (!self::available()) return 0;
        global $wpdb;
        $subs = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_push_subscriptions WHERE user_id = %d", $user_id
        ));
        $reached = 0;
        if (!empty($subs)) {
            $icon  = get_option('oes_panel_icon') ?: (get_site_icon_url(192) ?: OES_PLUGIN_URL . 'assets/img/panel-icon.png');
            $badge = get_option('oes_panel_icon') ?: (get_site_icon_url(96) ?: OES_PLUGIN_URL . 'assets/img/panel-icon.png');
            $payload = wp_json_encode(array(
                'title' => $title, 'body' => $body,
                'url'   => $url ?: home_url('/'),
                'icon'  => $icon, 'badge' => $badge, 'tag' => $tag,
                'site'  => get_bloginfo('name'),
            ));
            foreach ($subs as $s) {
                // Çıktı tamponla: kriptonun/HTTP'nin olası uyarıları AJAX JSON yanıtını bozmasın
                ob_start();
                self::send_web_push($s, $payload);
                ob_end_clean();
            }
            $reached = 1;
        }
        if ($log !== '') self::log('push', $title, $log, $reached);
        return $reached;
    }

    public static function send_to_users($user_ids, $title, $body, $url = '', $tag = '', $log = '') {
        $ids = array_unique(array_map('intval', (array) $user_ids));
        $reached = 0;
        foreach ($ids as $uid) {
            if ($uid) $reached += self::send_to_user($uid, $title, $body, $url, $tag);
        }
        if ($log !== '') self::log('push', $title, $log, $reached);
        return $reached;
    }

    /**
     * Teşhis: giriş yapmış kullanıcı kendine test push atar.
     * Abonelik + teslimatı, kurs-eğitmen bağından bağımsız test eder.
     */
    public function ajax_test_push() {
        check_ajax_referer('oes_push', 'nonce');
        if (!is_user_logged_in()) wp_send_json_error('Giriş gerekli.');
        if (!self::available()) wp_send_json_error('Push altyapısı bu sunucuda kullanılamıyor.');

        global $wpdb;
        $subs = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_push_subscriptions WHERE user_id = %d", get_current_user_id()));
        if (empty($subs)) wp_send_json_error('Bu hesabın aktif push aboneliği YOK. Bu cihazda "Bildirimleri aç" deyip izni kabul et, sonra tekrar dene.');

        $icon = get_option('oes_panel_icon') ?: (get_site_icon_url(192) ?: OES_PLUGIN_URL . 'assets/img/panel-icon.png');
        $payload = wp_json_encode(array(
            'title' => '🔔 Test bildirimi', 'body' => 'Bunu görüyorsan bildirimler çalışıyor!',
            'url' => home_url('/'), 'icon' => $icon, 'badge' => $icon, 'tag' => 'oes-test-' . time(),
        ));

        $accepted = 0; $notes = array();
        foreach ($subs as $s) {
            ob_start();
            $code = self::send_web_push($s, $payload, true); // bloklayan: gerçek yanıt kodu
            ob_end_clean();
            if (is_int($code) && $code >= 200 && $code < 300) { $accepted++; $notes[] = 'kabul edildi (' . $code . ')'; }
            elseif ($code === 404 || $code === 410) { $notes[] = 'abonelik ölü (' . $code . ') → yeniden abone ol'; }
            elseif ($code === 401 || $code === 403) { $notes[] = 'VAPID yetki hatası (' . $code . ')'; }
            elseif (is_int($code)) { $notes[] = 'push servisi hata (' . $code . ')'; }
            elseif (is_null($code)) { $notes[] = 'kripto/kurulum hatası'; }
            else { $notes[] = 'gönderilemedi (' . $code . ')'; }
        }

        $summary = count($subs) . ' abonelik → ' . implode(' | ', $notes);
        if ($accepted > 0) {
            wp_send_json_success('✓ ' . $summary . '. Push servisi KABUL etti; buna rağmen gelmiyorsa sorun CİHAZDA: iOS ise PWA ana ekrana kurulu mu? Rahatsız Etme kapalı mı? Bildirim izni açık mı?');
        }
        wp_send_json_error('✗ ' . $summary);
    }

    private static function send_web_push($sub, $payload, $blocking = false) {
        try {
            $keys = self::vapid_keys();
            if (!$keys) return;

            $ua_public = self::b64url_decode($sub->p256dh);   // 65 bytes
            $auth      = self::b64url_decode($sub->auth);      // 16 bytes
            if (strlen($ua_public) !== 65) return;

            // Efemer anahtar
            $eph = openssl_pkey_new(array('curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC));
            $ed  = openssl_pkey_get_details($eph);
            $as_public = "\x04" . str_pad($ed['ec']['x'], 32, "\x00", STR_PAD_LEFT) . str_pad($ed['ec']['y'], 32, "\x00", STR_PAD_LEFT);

            // ECDH ortak sır
            $peer_pem = self::ec_pem_from_raw($ua_public);
            $shared   = openssl_pkey_derive($peer_pem, $eph, 32);
            if (!$shared) return;

            // Anahtar türetme (RFC 8291)
            $salt  = random_bytes(16);
            $ikm   = hash_hkdf('sha256', $shared, 32, "WebPush: info\x00" . $ua_public . $as_public, $auth);
            $cek   = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\x00", $salt);
            $nonce = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\x00", $salt);

            // Şifreleme (tek kayıt, 0x02 sonlandırıcı)
            $tag = '';
            $cipher = openssl_encrypt($payload . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag, '', 16);
            if ($cipher === false) return;

            // aes128gcm başlığı: salt(16) | rs(4) | idlen(1)=65 | keyid(65) | body
            $header = $salt . pack('N', 4096) . chr(65) . $as_public;
            $bin    = $header . $cipher . $tag;

            // VAPID JWT
            $ep = wp_parse_url($sub->endpoint);
            $aud = $ep['scheme'] . '://' . $ep['host'] . (isset($ep['port']) ? ':' . $ep['port'] : '');
            $jwt = self::vapid_jwt($aud, $keys['pem']);
            if (!$jwt) return;

            $resp = wp_remote_post($sub->endpoint, array(
                'headers' => array(
                    'Authorization'    => 'vapid t=' . $jwt . ', k=' . $keys['public'],
                    'Content-Type'     => 'application/octet-stream',
                    'Content-Encoding' => 'aes128gcm',
                    'TTL'              => '2419200',
                ),
                'body'     => $bin,
                'timeout'  => $blocking ? 8 : 5,
                'blocking' => $blocking, // normalde fire-and-forget; teşhiste sunucu yanıtını bekler
            ));
            if ($blocking) {
                if (is_wp_error($resp)) return 'ERR:' . $resp->get_error_message();
                return (int) wp_remote_retrieve_response_code($resp);
            }
        } catch (\Throwable $e) {
            if ($blocking) return 'EXC:' . $e->getMessage();
        }
    }

    private static function vapid_jwt($aud, $private_pem) {
        $header = self::b64url(wp_json_encode(array('typ' => 'JWT', 'alg' => 'ES256')));
        $claims = self::b64url(wp_json_encode(array(
            'aud' => $aud,
            'exp' => time() + 43200,
            'sub' => 'mailto:' . get_option('admin_email'),
        )));
        $input = $header . '.' . $claims;
        $der = '';
        if (!openssl_sign($input, $der, $private_pem, OPENSSL_ALGO_SHA256)) return false;
        $jose = self::der_to_jose($der);
        if ($jose === false) return false;
        return $input . '.' . self::b64url($jose);
    }

    /* ==========================================================================
     *  Yardımcılar
     * ========================================================================== */
    private static function b64url($d) { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }
    private static function b64url_decode($d) {
        $pad = (4 - strlen($d) % 4) % 4;
        return base64_decode(strtr($d, '-_', '+/') . str_repeat('=', $pad));
    }

    /** Ham 65-byte EC noktasından SubjectPublicKeyInfo PEM üretir (P-256). */
    private static function ec_pem_from_raw($raw) {
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . $raw;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /** DER ECDSA imzasını JOSE (r||s, 64 byte) formatına çevirir. */
    private static function der_to_jose($der) {
        $off = 0;
        if (ord($der[$off++]) !== 0x30) return false;
        $len = ord($der[$off++]);
        if ($len & 0x80) { $off += ($len & 0x7f); }
        if (ord($der[$off++]) !== 0x02) return false;
        $rlen = ord($der[$off++]); $r = substr($der, $off, $rlen); $off += $rlen;
        if (ord($der[$off++]) !== 0x02) return false;
        $slen = ord($der[$off++]); $s = substr($der, $off, $slen);
        $r = ltrim($r, "\x00"); $s = ltrim($s, "\x00");
        if (strlen($r) > 32 || strlen($s) > 32) return false;
        return str_pad($r, 32, "\x00", STR_PAD_LEFT) . str_pad($s, 32, "\x00", STR_PAD_LEFT);
    }

    /* ==========================================================================
     *  Olay işleyicileri
     * ========================================================================== */
    private static function course_students($course_id) {
        global $wpdb;
        return $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_enrollments WHERE course_id = %d AND status = 'active'",
            $course_id
        ));
    }

    private static function course_teacher($course_id) {
        if (!class_exists('OES_Teacher')) return 0;
        global $wpdb;
        // 1) Kursa atanmış eğitmen (_oes_instructor_id → user_id) — öncelikli
        $inst = (int) get_post_meta($course_id, '_oes_instructor_id', true);
        if ($inst) {
            $uid = (int) $wpdb->get_var($wpdb->prepare("SELECT user_id FROM {$wpdb->prefix}oes_instructors WHERE id = %d", $inst));
            if ($uid) return $uid;
        }
        // 2) Kurs yazarı panele erişebiliyorsa (eğitmen VEYA yönetici — admin kursu bu duruma girer)
        $author = (int) get_post_field('post_author', $course_id);
        if ($author && OES_Teacher::can_access_panel($author)) return $author;
        return 0;
    }

    /* NOT: Aşağıdaki adresler eskiden `/panel/?view=gorevler` gibiydi —
       o görünüm isimleri artık YOK (doğrusu 'gorev'/'sinav'), yani bildirime
       tıklayan öğrenci panel anasayfasına düşüyordu. Artık doğrudan İÇERİĞE
       (player'daki göreve/sınava) gidiyor. */

    public function on_assignment_created($assignment_id) {
        global $wpdb;
        $a = $wpdb->get_row($wpdb->prepare("SELECT title, course_id FROM {$wpdb->prefix}oes_assignments WHERE id = %d", $assignment_id));
        if (!$a) return;
        $url = self::player_url($a->course_id, array('gorev' => (int) $assignment_id));
        self::send_to_users(self::course_students($a->course_id), '📚 Yeni görev', $a->title, $url, 'asg-' . $assignment_id, 'Öğrenciler');
    }

    public function on_quiz_created($quiz_id) {
        global $wpdb;
        $q = $wpdb->get_row($wpdb->prepare("SELECT title, course_id FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $quiz_id));
        if (!$q) return;
        $url = self::player_url($q->course_id, array('quiz' => (int) $quiz_id));
        self::send_to_users(self::course_students($q->course_id), '📝 Yeni sınav', $q->title, $url, 'qz-' . $quiz_id, 'Öğrenciler');
    }

    public function on_assignment_graded($submission_id) {
        global $wpdb;
        $s = $wpdb->get_row($wpdb->prepare(
            "SELECT s.user_id, a.id AS aid, a.title, a.course_id FROM {$wpdb->prefix}oes_assignment_submissions s
             INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id WHERE s.id = %d", $submission_id
        ));
        if (!$s) return;
        $url = self::player_url($s->course_id, array('gorev' => (int) $s->aid));
        self::send_to_user($s->user_id, '✅ Görevin değerlendirildi', $s->title, $url, 'asgg-' . $submission_id, 'Öğrenci');
    }

    public function on_quiz_graded($attempt_id, $student_id) {
        global $wpdb;
        $a = $wpdb->get_row($wpdb->prepare(
            "SELECT q.id AS qid, q.title, q.course_id FROM {$wpdb->prefix}oes_quiz_attempts qa
             INNER JOIN {$wpdb->prefix}oes_quizzes q ON q.id = qa.quiz_id WHERE qa.id = %d", $attempt_id));
        $url = $a ? self::player_url($a->course_id, array('quiz' => (int) $a->qid)) : self::panel_url('sinav');
        self::send_to_user($student_id, '✅ Sınavın değerlendirildi',
            $a ? $a->title . ' — sonucun hazır.' : 'Sınav sonucun hazır.', $url, 'qzg-' . $attempt_id, 'Öğrenci');
    }

    /**
     * Soru yanıtlandı → öğrenciye.
     * Bildirim, sorunun SORULDUĞU derse götürür (panel anasayfasına değil):
     * OES_Questions::ask_screen_url() soru kaydındaki lesson_key'den player
     * adresini kurar. Öğrencinin o içeriğe sırası gelmediyse player onu kaldığı
     * yere düşürür.
     */
    /**
     * Player adresi — bildirimler doğrudan İÇERİĞE gitsin diye.
     * Öğrencinin o içeriğe sırası gelmediyse player önkoşul kilidiyle onu
     * kaldığı yere düşürür (bkz. templates/player.php).
     */
    public static function player_url($course_id, $args = array()) {
        return add_query_arg(array_merge(array('oes-player' => (int) $course_id), $args), home_url('/kurs-izle/'));
    }

    /** Öğrenci panelinde bir bölüm (temiz URL) */
    public static function panel_url($view = '') {
        return class_exists('OES_Panel') ? OES_Panel::instance()->panel_url($view) : home_url('/panel/');
    }

    public function on_question_answered($student_id, $course_name, $answer, $course_id = 0, $question_id = 0) {
        $url = ($course_id && class_exists('OES_Questions'))
            ? OES_Questions::ask_screen_url($student_id, $course_id, $question_id)
            : home_url('/panel/');
        $title = $course_name ? '💬 Sorun yanıtlandı — ' . $course_name : '💬 Sorun yanıtlandı';
        self::send_to_user($student_id, $title, wp_trim_words($answer, 12), $url, 'qa-' . (int) $course_id, 'Öğrenci');
    }

    public function on_assignment_submitted($submission_id) {
        global $wpdb;
        $s = $wpdb->get_row($wpdb->prepare(
            "SELECT s.user_id, a.title, a.course_id FROM {$wpdb->prefix}oes_assignment_submissions s
             INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id WHERE s.id = %d", $submission_id
        ));
        if (!$s) return;
        $teacher = self::course_teacher($s->course_id);
        if ($teacher) {
            $u = get_userdata($s->user_id);
            self::send_to_user($teacher, '📤 Yeni görev gönderimi', ($u ? $u->display_name . ' · ' : '') . $s->title, home_url('/egitmen/gonderim/#gorev'), 'sub-' . $submission_id, 'Eğitmen');
        } else {
            // Teşhis: kurs bir eğitmene bağlı değilse log'a düş (Bildirimler → Geçmiş'te görünür)
            self::log('push', '📤 Görev teslimi', 'Kurs #' . (int) $s->course_id . ' bir eğitmene bağlı değil — bildirim gönderilemedi', 0);
        }
    }

    public function on_question_asked($question_id) {
        global $wpdb;
        $q = $wpdb->get_row($wpdb->prepare("SELECT user_id, course_id, question_text FROM {$wpdb->prefix}oes_questions WHERE id = %d", $question_id));
        if (!$q) return;
        $teacher = self::course_teacher($q->course_id);
        if ($teacher) {
            $stu = get_userdata($q->user_id);
            $who = $stu ? $stu->display_name . ': ' : '';
            $url = home_url('/egitmen/sorular/?chat=' . intval($q->user_id) . '_' . intval($q->course_id));
            self::send_to_user($teacher, '❓ Yeni soru', $who . wp_trim_words($q->question_text, 10), $url, 'q-' . $question_id, 'Eğitmen');
        }
    }

    public function on_appointment_booked($teacher_id, $info) {
        self::send_to_user($teacher_id, '📅 Yeni randevu', $info, home_url('/egitmen/takvim/'), 'appt', 'Eğitmen');
    }

    /* ==========================================================================
     *  Eğitmen manuel duyuru
     * ========================================================================== */
    public function ajax_announce() {
        check_ajax_referer('oes_teacher_panel', 'nonce');
        if (!class_exists('OES_Teacher') || !OES_Teacher::is_super_teacher()) wp_send_json_error('Bu işlem yalnızca süper eğitmene açıktır.');

        $title  = sanitize_text_field($_POST['title'] ?? '');
        $body   = sanitize_textarea_field(wp_unslash($_POST['body'] ?? ''));
        $target = sanitize_text_field($_POST['target'] ?? 'students');
        $url    = esc_url_raw($_POST['url'] ?? '') ?: home_url('/panel/');
        if ($title === '' || $body === '') wp_send_json_error('Başlık ve mesaj zorunlu.');
        // Push kapalıysa bile devam: duyuru kullanıcıların bildirim kutusuna düşer.

        // Admin ile aynı hedefleme: all / students / teachers / kurs id
        $ids = self::get_target_users($target);
        if (empty($ids)) wp_send_json_error('Bu hedefte kullanıcı yok.');

        self::send_to_users($ids, $title, $body, $url, 'announce', 'Süper eğitmen duyurusu (' . $target . ')');
        wp_send_json_success(array('message' => self::available()
            ? count($ids) . ' kullanıcıya gönderildi.'
            : count($ids) . ' kullanıcının bildirim kutusuna düştü (push bu sunucuda kapalı).'));
    }

    /* ==========================================================================
     *  Admin: Bildirimler sayfası
     * ========================================================================== */
    public function admin_menu() {
        add_submenu_page('online-kurs-sistemi', 'Bildirimler', 'Bildirimler', 'manage_options', 'oes-notifications', array($this, 'render_admin'));
    }
    public function relocate_mail_menu() {
        remove_submenu_page('online-kurs-sistemi', 'oes-mail-settings');
    }

    /**
     * Duyuru hedefi = GERÇEK kullanıcılar (push abonesi olmasa bile).
     * Eskiden yalnızca oes_push_subscriptions'tan okunuyordu; push izni vermemiş
     * öğrenci duyuruyu "Bildirimlerim"de de göremiyordu. Push yine sadece abonesi
     * olanlara ulaşır, bildirim kutusuna ise herkese düşer.
     */
    public static function get_target_users($target) {
        global $wpdb;

        $teachers = array();
        if (class_exists('OES_Teacher')) {
            $teachers = array_map('intval', get_users(array(
                'role' => OES_Teacher::ROLE, 'fields' => 'ID', 'number' => 500,
            )));
        }
        if ($target === 'teachers') return $teachers;

        $students = array_map('intval', (array) $wpdb->get_col(
            "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_enrollments WHERE status = 'active'"));
        if ($target === 'students') {
            return array_values(array_diff($students, $teachers));
        }
        if (is_numeric($target)) {
            return array_map('intval', (array) $wpdb->get_col($wpdb->prepare(
                "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_enrollments
                  WHERE course_id = %d AND status = 'active'", $target)));
        }
        return array_values(array_unique(array_merge($students, $teachers)));
    }

    public function render_admin() {
        if (!current_user_can('manage_options')) return;
        global $wpdb;
        $tab = isset($_GET['tab']) ? sanitize_key($_GET['tab']) : 'gonder';
        $notice = '';

        if (isset($_POST['oes_push_send']) && check_admin_referer('oes_push_send')) {
            $title  = sanitize_text_field($_POST['title'] ?? '');
            $body   = sanitize_textarea_field($_POST['body'] ?? '');
            $url    = esc_url_raw($_POST['url'] ?? '') ?: home_url('/panel/');
            $target = sanitize_text_field($_POST['target'] ?? 'all');
            if ($title && $body) {
                // Push kapalı olsa BİLE gönder: send_to_users bildirimi kullanıcının
                // "Bildirimlerim" kutusuna yazar, push'u yalnızca mümkünse dener.
                {
                    $ids = self::get_target_users($target);
                    self::send_to_users($ids, $title, $body, $url, 'admin', 'Admin duyurusu');
                    $notice = self::available()
                        ? (count($ids) . ' kullanıcıya bildirim gönderildi (push izni olanlara ayrıca bildirim düştü).')
                        : (count($ids) . ' kullanıcının bildirim kutusuna düştü. Push bu sunucuda kapalı olduğu için telefona anlık bildirim gitmedi.');
                }
            } else {
                $notice = 'Başlık ve mesaj zorunlu.';
            }
        }

        $base = admin_url('admin.php?page=oes-notifications');
        $tabs = array('gonder' => 'Gönder', 'gecmis' => 'Geçmiş', 'aboneler' => 'Aboneler', 'mail' => 'Mail Ayarları');

        echo '<div class="wrap"><div class="fabo-wrap">';
        echo '<div class="fabo-head"><div><h1>Bildirimler</h1>'
           . '<p>Öğrencilere anlık bildirim (push) gönder. Otomatik bildirimler (görev/sınav/soru/hatırlatma) '
           . 'kendiliğinden çalışır; buradan <strong>elle duyuru</strong> geçebilirsin.</p></div></div>';

        if ($notice) echo '<div class="notice notice-info is-dismissible"><p>' . esc_html($notice) . '</p></div>';
        if (!self::available()) echo '<div class="notice notice-warning"><p>Sunucuda web push için gerekli PHP eklentileri (openssl EC + hash_hkdf) bulunamadı. Push gönderimi devre dışı; mail çalışır.</p></div>';

        echo '<div class="fabo-tabs">';
        foreach ($tabs as $k => $label) {
            echo '<a href="' . esc_url($base . '&tab=' . $k) . '" class="fabo-tab' . ($tab === $k ? ' active' : '') . '">' . esc_html($label) . '</a>';
        }
        echo '</div><div>';

        if ($tab === 'gonder') {
            $courses = $wpdb->get_results("SELECT p.ID, p.post_title FROM {$wpdb->posts} p INNER JOIN {$wpdb->postmeta} m ON m.post_id=p.ID AND m.meta_key='_oes_is_course' AND m.meta_value='yes' WHERE p.post_type='product' AND p.post_status='publish' ORDER BY p.post_title ASC");
            ?>
            <form method="post" style="max-width:640px;background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:20px;">
                <?php wp_nonce_field('oes_push_send'); ?>
                <p><label><strong>Başlık</strong><br><input type="text" name="title" class="regular-text" style="width:100%;" required></label></p>
                <p><label><strong>Mesaj</strong><br><textarea name="body" rows="3" style="width:100%;" required></textarea></label></p>
                <p><label><strong>Bağlantı (tıklayınca gidilecek)</strong><br><input type="url" name="url" class="regular-text" style="width:100%;" placeholder="<?php echo esc_attr(home_url('/panel/')); ?>"></label></p>
                <p><label><strong>Hedef</strong><br>
                    <select name="target" style="min-width:280px;">
                        <option value="all">Tüm aboneler</option>
                        <option value="students">Öğrenciler</option>
                        <option value="teachers">Eğitmenler</option>
                        <optgroup label="Kursa göre">
                            <?php foreach ($courses as $c): ?><option value="<?php echo intval($c->ID); ?>"><?php echo esc_html($c->post_title); ?></option><?php endforeach; ?>
                        </optgroup>
                    </select>
                </label></p>
                <p><button type="submit" name="oes_push_send" value="1" class="button button-primary button-large">🔔 Push Gönder</button></p>
                <p class="description">Bildirim, seçilen hedefteki <strong>bildirime izin vermiş</strong> kullanıcılara anında gider.</p>
            </form>
            <?php
        } elseif ($tab === 'gecmis') {
            $logs = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}oes_notifications_log ORDER BY created_at DESC LIMIT 100");
            echo '<table class="widefat striped"><thead><tr><th>Tarih</th><th>Kanal</th><th>Başlık</th><th>Hedef</th><th>Adet</th></tr></thead><tbody>';
            if (empty($logs)) echo '<tr><td colspan="5">Henüz kayıt yok.</td></tr>';
            foreach ($logs as $l) {
                echo '<tr><td>' . esc_html(date_i18n('d.m.Y H:i', strtotime($l->created_at))) . '</td><td>' . esc_html($l->channel) . '</td><td>' . esc_html($l->title) . '</td><td>' . esc_html($l->target) . '</td><td>' . intval($l->sent_count) . '</td></tr>';
            }
            echo '</tbody></table>';
        } elseif ($tab === 'aboneler') {
            $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}oes_push_subscriptions");
            $users = (int) $wpdb->get_var("SELECT COUNT(DISTINCT user_id) FROM {$wpdb->prefix}oes_push_subscriptions");
            $teachers = count(self::get_target_users('teachers'));
            $students = count(self::get_target_users('students'));
            echo '<div style="display:flex;gap:16px;flex-wrap:wrap;">';
            foreach (array('Toplam abonelik' => $total, 'Benzersiz kullanıcı' => $users, 'Öğrenci' => $students, 'Eğitmen' => $teachers) as $lbl => $val) {
                echo '<div style="background:#fff;border:1px solid #dcdcde;border-radius:10px;padding:18px 24px;min-width:150px;"><div style="font-size:28px;font-weight:700;color:#1e293b;">' . intval($val) . '</div><div style="color:#64748b;">' . esc_html($lbl) . '</div></div>';
            }
            echo '</div>';
        } elseif ($tab === 'mail') {
            if (class_exists('OES_Mail_System') && method_exists('OES_Mail_System', 'instance')) {
                OES_Mail_System::instance()->render_settings_page();
            } else {
                echo '<p>Mail modülü aktif değil.</p>';
            }
        }

        echo '</div></div></div>'; // içerik + .fabo-wrap + .wrap
    }
}

OES_Push::instance();
