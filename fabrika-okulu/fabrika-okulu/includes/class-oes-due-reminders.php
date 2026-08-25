<?php
/**
 * OES Due Reminders — Görev son tarihine 1 gün kala teslim etmeyene hatırlatma (mail + push).
 * Günlük WP-Cron ile çalışır; yarın teslimi olan aktif görevlerde gönderim yapmamış öğrencilere bildirir.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Due_Reminders {

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('init', array($this, 'schedule'));
        add_action('oes_due_reminders_cron', array($this, 'run'));
    }

    /** Günlük hatırlatma saati (site saati) */
    const RUN_HOUR = '07:00';

    public function schedule() {
        // Saat değiştiyse (ör. eski 09:00 kaydı) mevcut cron'u sök, yenisini kur.
        if (get_option('oes_due_cron_hour') !== self::RUN_HOUR) {
            wp_clear_scheduled_hook('oes_due_reminders_cron');
            update_option('oes_due_cron_hour', self::RUN_HOUR, false);
        }
        if (!wp_next_scheduled('oes_due_reminders_cron')) {
            // Her gün 07:00 (site saati) → UTC'ye çevrilerek planlanır
            $now = current_time('timestamp');
            $ts  = strtotime('today ' . self::RUN_HOUR, $now);
            if ($ts < $now) $ts = strtotime('tomorrow ' . self::RUN_HOUR, $now);
            wp_schedule_event($ts - (int) (get_option('gmt_offset') * 3600), 'daily', 'oes_due_reminders_cron');
        }
    }

    public function run() {
        // Günde bir kez garantisi
        $today = current_time('Y-m-d');
        if (get_option('oes_due_reminder_last') === $today) return;
        update_option('oes_due_reminder_last', $today, false);

        global $wpdb;
        $ta = $wpdb->prefix . 'oes_assignments';
        // Tablo yoksa çık
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $ta)) !== $ta) return;

        $tomorrow = date('Y-m-d', strtotime('+1 day', current_time('timestamp')));

        // Göreli teslim süresi (extra_days) olan aktif görevler. Net son teslim öğrenci
        // bazında hesaplanır (TEK KAYNAK: fabo_task_due_ts) — baz, dönemliyse dönem
        // başlangıcı (saatiyle), esnekse öğrencinin kursu ilk açtığı andır.
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

            $course = get_the_title($a->course_id);
            $url = home_url('/panel/gorev/');
            $count = 0;

            foreach ($students as $uid) {
                $uid = (int) $uid;
                if (in_array($uid, $submitted, true)) continue;

                // Süre hiç başlamadıysa (esnek eğitimde kursu hiç açmamış) → null
                $due_ts = fabo_task_due_ts($uid, $a->course_id, $extra);
                if (!$due_ts) continue;
                if (date('Y-m-d', $due_ts) !== $tomorrow) continue; // yalnızca teslimi YARIN olanlara

                $u = get_userdata($uid);
                if (!$u) continue;
                $count++;

                // Saat de belirtilir: son teslim bazın saatinde biter (ör. 14:00)
                $due_time = date_i18n('H:i', $due_ts);
                $due_full = date_i18n('d M Y', $due_ts) . ' ' . $due_time;

                if (class_exists('OES_Push')) {
                    OES_Push::send_to_user($uid, '⏰ Teslim yaklaşıyor',
                        $a->title . ' — yarın ' . $due_time . ' son teslim!', $url, 'due-' . $a->id);
                }
                if ($u->user_email && class_exists('OES_Mail_System') && get_option('oes_emails_muted', 'no') !== 'yes') {
                    $mailer = OES_Mail_System::instance();
                    $content = '<p>Merhaba ' . esc_html($u->display_name) . ',</p>'
                        . '<p><strong>' . esc_html($course) . '</strong> kursundaki <strong>' . esc_html($a->title) . '</strong> görevinin son teslimi <strong>yarın</strong>.</p>'
                        . '<p style="margin:15px 0;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;">'
                        . '<strong>📅 Son teslim:</strong> ' . esc_html($due_full) . '</p>'
                        . '<p>Henüz bir gönderimin görünmüyor. Son saate kalmadan tamamlamak için panelindeki görevlere göz at.</p>';
                    $html = $mailer->get_email_template('Bekleyen bir görevin var', $content, 'Göreve git', $url);
                    wp_mail($u->user_email, 'Teslim yaklaşıyor (' . $due_time . ') — ' . $a->title, $html, array('Content-Type: text/html; charset=UTF-8'));
                }
            }

            if ($count > 0 && class_exists('OES_Push')) {
                OES_Push::log('reminder', 'Görev hatırlatma: ' . $a->title, $count . ' öğrenci (yarın teslim)', $count, 0);
            }
        }
    }
}

OES_Due_Reminders::instance();
