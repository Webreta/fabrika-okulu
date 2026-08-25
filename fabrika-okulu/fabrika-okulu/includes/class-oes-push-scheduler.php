<?php
/**
 * OES Push Scheduler — Zaman bazlı otomatik PUSH bildirimleri.
 *
 *  • Canlı oturum (zoom vb.) hatırlatma: başlamadan ~1 saat önce ("Birazdan canlı oturum").
 *  • Görev hatırlatma: son teslime ~1 saat kala, henüz teslim etmeyene ("Tamamlanmamış bir görevin var").
 *
 * Not: Görevin "1 gün önce" hatırlatması OES_Due_Reminders (günlük) tarafından zaten push+mail
 * olarak yapılır; burada tekrarlanmaz. Bu sınıf yalnızca gün-içi (saatlik) pencereleri doldurur.
 *
 * Her 15 dakikada bir WP-Cron ile çalışır. Timezone: wp_timezone() ile doğru hesaplanır.
 * Tekrarı önlemek için gönderilen anahtarlar 3 gün saklanır.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Push_Scheduler {

    private static $instance = null;
    const HOOK     = 'oes_push_scheduler_cron';
    const OPT_SENT = 'oes_push_sent_keys';

    private $sent = array();

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_filter('cron_schedules', array($this, 'add_interval'));
        add_action('init', array($this, 'schedule'));
        add_action(self::HOOK, array($this, 'run'));
        if (defined('OES_PLUGIN_FILE')) {
            register_deactivation_hook(OES_PLUGIN_FILE, array($this, 'clear'));
        }
    }

    public function add_interval($schedules) {
        if (empty($schedules['oes_15min'])) {
            $schedules['oes_15min'] = array('interval' => 900, 'display' => 'OES — her 15 dakika');
        }
        return $schedules;
    }

    public function schedule() {
        if (!wp_next_scheduled(self::HOOK)) {
            wp_schedule_event(time() + 120, 'oes_15min', self::HOOK);
        }
    }

    public function clear() {
        wp_clear_scheduled_hook(self::HOOK);
    }

    public function run() {
        // NOT: eskiden `!OES_Push::available()` ise komple çıkılıyordu → push kapalı
        // sunucuda hatırlatmalar kullanıcının "Bildirimlerim" kutusuna da düşmüyordu.
        // send_to_user zaten bildirimi kaydedip push'u yalnızca mümkünse dener.
        if (!class_exists('OES_Push')) return;

        $this->sent = $this->load_sent();
        $this->run_sessions();
        $this->run_assignments_1h();
        $this->save_sent();
    }

    /* ----------------------------------------------------------------------
     *  Canlı oturum: başlamadan ~1 saat önce
     * -------------------------------------------------------------------- */
    private function run_sessions() {
        global $wpdb;
        $tp = $wpdb->prefix . 'oes_periods';
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $tp)) !== $tp) return;

        $tz    = wp_timezone();
        $now   = new DateTime('now', $tz);
        $today = $now->format('Y-m-d');

        $rows = $wpdb->get_results("
            SELECT pe.user_id, p.id AS period_id, p.schedule, p.course_id, post.post_title AS course_name
            FROM {$wpdb->prefix}oes_period_enrollments pe
            INNER JOIN {$wpdb->prefix}oes_periods p ON pe.period_id = p.id
            LEFT JOIN {$wpdb->posts} post ON p.course_id = post.ID
            WHERE pe.user_id > 0 AND p.schedule IS NOT NULL AND p.schedule != ''
        ");
        if (empty($rows)) return;

        foreach ($rows as $r) {
            $schedule = json_decode($r->schedule, true);
            if (empty($schedule) || !is_array($schedule)) continue;

            foreach ($schedule as $idx => $ev) {
                if (empty($ev['date']) || $ev['date'] !== $today) continue;
                $time = !empty($ev['time']) ? trim($ev['time']) : '';
                if ($time === '') continue; // saat yoksa 1 saatlik hesap yapılamaz

                $start = date_create($ev['date'] . ' ' . $time, $tz);
                if (!$start) continue;

                $diff = $start->getTimestamp() - $now->getTimestamp();
                // ~1 saat penceresi (15 dk cron için 45–90 dk arası tek sefer yakalar)
                if ($diff < 45 * 60 || $diff > 90 * 60) continue;

                $key = 'sess:' . (int) $r->period_id . ':' . $idx . ':' . $ev['date'] . ':' . (int) $r->user_id;
                if ($this->already($key)) continue;

                $body  = ($r->course_name ? $r->course_name . ' · ' : '')
                       . (!empty($ev['title']) ? $ev['title'] : 'Canlı oturum')
                       . ' — bugün ' . $time . ' (1 saat sonra)';
                $url   = !empty($ev['link']) ? $ev['link'] : home_url('/panel/takvim/');

                OES_Push::send_to_user((int) $r->user_id, '⏰ Birazdan canlı oturumun var', $body, $url, 'sess-' . (int) $r->period_id . '-' . $idx);
                $this->mark($key);
            }
        }
    }

    /* ----------------------------------------------------------------------
     *  Görev: son teslime ~1 saat kala, teslim etmeyene
     * -------------------------------------------------------------------- */
    private function run_assignments_1h() {
        global $wpdb;
        $ta = $wpdb->prefix . 'oes_assignments';
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $ta)) !== $ta) return;

        $tz    = wp_timezone();
        $now   = new DateTime('now', $tz);
        $today = $now->format('Y-m-d');

        $assignments = $wpdb->get_results("SELECT id, title, course_id, extra_days FROM {$ta} WHERE status = 'active' AND extra_days > 0");
        if (empty($assignments)) return;

        foreach ($assignments as $a) {
            $extra = (int) $a->extra_days;
            if ($extra <= 0) continue;

            $students = $wpdb->get_col($wpdb->prepare(
                "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_enrollments WHERE course_id = %d AND status = 'active'",
                $a->course_id
            ));
            if (empty($students)) continue;

            $submitted = array_map('intval', $wpdb->get_col($wpdb->prepare(
                "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_assignment_submissions WHERE assignment_id = %d",
                $a->id
            )));

            foreach ($students as $uid) {
                $uid = (int) $uid;
                if (in_array($uid, $submitted, true)) continue;

                // TEK KAYNAK: son teslim ANI (baz saatiyle; süre başlamadıysa null)
                $due_ts = fabo_task_due_ts($uid, $a->course_id, $extra);
                if (!$due_ts) continue;

                $due = date('Y-m-d', $due_ts);
                if ($due !== $today) continue; // teslim BUGÜN

                // Son teslim artık gün sonu DEĞİL, bazın saati olabilir (ör. 14:00).
                // NOT: fabo_task_due_ts site saatiyle üretilir → karşılaştırma da
                // current_time('timestamp') ile yapılmalı; $now->getTimestamp() gerçek
                // epoch verir ve fark gmt_offset kadar kayardı (bildirim geç giderdi).
                $diff = $due_ts - current_time('timestamp');
                // Son ~1 saat
                if ($diff > 60 * 60 || $diff < -15 * 60) continue;

                $key = 'due1h:' . (int) $a->id . ':' . $uid . ':' . $due;
                if ($this->already($key)) continue;

                OES_Push::send_to_user($uid, '⏰ Görevde son 1 saat',
                    $a->title . ' — son teslim bugün ' . date_i18n('H:i', $due_ts),
                    home_url('/panel/gorev/'), 'due1h-' . (int) $a->id);
                $this->mark($key);
            }
        }
    }

    /* ----------------------------------------------------------------------
     *  Tekrarı önleme deposu (gönderilen anahtarlar, 3 gün saklanır)
     * -------------------------------------------------------------------- */
    private function load_sent() {
        $v = get_option(self::OPT_SENT);
        return is_array($v) ? $v : array();
    }
    private function already($key) { return isset($this->sent[$key]); }
    private function mark($key)     { $this->sent[$key] = time(); }
    private function save_sent() {
        $cut = time() - 3 * DAY_IN_SECONDS;
        foreach ($this->sent as $k => $ts) {
            if ($ts < $cut) unset($this->sent[$k]);
        }
        update_option(self::OPT_SENT, $this->sent, false);
    }
}

OES_Push_Scheduler::instance();
