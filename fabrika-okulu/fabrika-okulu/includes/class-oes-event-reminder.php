<?php
/**
 * Eğitim Etkinlik Hatırlatma Sistemi
 * Yarınki etkinlikler için otomatik mail gönderir
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Event_Reminder {

    public function __construct() {
        // Cron job kaydet
        add_action('init', array($this, 'schedule_cron'));
        
        // Cron çalıştığında
        add_action('oes_send_event_reminders', array($this, 'send_reminders'));
        
        // Deaktivasyon
        register_deactivation_hook(OES_PLUGIN_FILE, array($this, 'clear_cron'));
    }

    /** Günlük hatırlatma saati (site saati) */
    const RUN_HOUR = '07:00';

    public function schedule_cron() {
        // Saat değiştiyse (ör. eski 09:00 kaydı) mevcut cron'u sök, yenisini kur.
        if (get_option('oes_event_cron_hour') !== self::RUN_HOUR) {
            wp_clear_scheduled_hook('oes_send_event_reminders');
            update_option('oes_event_cron_hour', self::RUN_HOUR, false);
        }
        if (!wp_next_scheduled('oes_send_event_reminders')) {
            // Her gün 07:00 (SİTE saati) → UTC'ye çevrilerek planlanır.
            // Eskiden sunucu saatiyle planlanıyordu; site saat dilimi farklıysa kayıyordu.
            $now = current_time('timestamp');
            $ts  = strtotime('today ' . self::RUN_HOUR, $now);
            if ($ts < $now) $ts = strtotime('tomorrow ' . self::RUN_HOUR, $now);
            wp_schedule_event($ts - (int) (get_option('gmt_offset') * 3600), 'daily', 'oes_send_event_reminders');
        }
    }

    public function clear_cron() {
        wp_clear_scheduled_hook('oes_send_event_reminders');
    }

    /**
     * Hatırlatma maillerini gönder
     */
    public function send_reminders() {
        global $wpdb;
        
        $tomorrow = date('Y-m-d', strtotime('+1 day'));
        
        // Tüm dönemleri ve kayıtlı kullanıcıları al
        $enrollments = $wpdb->get_results("
            SELECT pe.user_id, pe.period_id, p.name as period_name, p.schedule, p.course_id,
                   post.post_title as course_name, u.user_email, u.display_name
            FROM {$wpdb->prefix}oes_period_enrollments pe
            LEFT JOIN {$wpdb->prefix}oes_periods p ON pe.period_id = p.id
            LEFT JOIN {$wpdb->posts} post ON p.course_id = post.ID
            LEFT JOIN {$wpdb->users} u ON pe.user_id = u.ID
            WHERE pe.user_id > 0 AND p.schedule IS NOT NULL AND p.schedule != ''
        ");
        
        // Kullanıcı bazlı etkinlikleri grupla
        $user_events = array();
        
        foreach ($enrollments as $enrollment) {
            if (empty($enrollment->user_email)) continue;
            
            $schedule = json_decode($enrollment->schedule, true);
            if (empty($schedule)) continue;
            
            foreach ($schedule as $event) {
                if (!empty($event['date']) && $event['date'] === $tomorrow) {
                    if (!isset($user_events[$enrollment->user_id])) {
                        $user_events[$enrollment->user_id] = array(
                            'email' => $enrollment->user_email,
                            'name' => $enrollment->display_name,
                            'events' => array()
                        );
                    }
                    
                    $user_events[$enrollment->user_id]['events'][] = array(
                        'title' => $event['title'] ?? 'Etkinlik',
                        'time' => $event['time'] ?? '',
                        'link' => $event['link'] ?? '',
                        'notes' => $event['notes'] ?? '',
                        'course_name' => $enrollment->course_name,
                        'period_name' => $enrollment->period_name,
                    );
                }
            }
        }
        
        // Her kullanıcıya mail gönder (YENİ MAİL SİSTEMİNİ KULLAN)
        if (class_exists('OES_Mail_System')) {
            $mailer = OES_Mail_System::instance();
            foreach ($user_events as $user_id => $data) {
                if (empty($data['events'])) continue;
                $mailer->send_event_reminder($data['email'], $data['name'], $data['events'], $tomorrow);
            }
        }
        
        // Log
        update_option('oes_last_reminder_sent', current_time('mysql'));
        update_option('oes_last_reminder_count', count($user_events));
    }

    /**
     * Manuel test için
     */
    public static function test_reminder($user_id = null) {
        if ($user_id) {
            // Tek kullanıcı test
            $user = get_user_by('id', $user_id);
            if ($user && class_exists('OES_Mail_System')) {
                $test_events = array(
                    array(
                        'title' => 'Test Etkinliği',
                        'time' => '14:00',
                        'link' => 'https://zoom.us/test',
                        'notes' => 'Bu bir test mailidir.',
                        'course_name' => 'Test Kursu',
                        'period_name' => 'Test Dönemi'
                    )
                );
                $mailer = OES_Mail_System::instance();
                $mailer->send_event_reminder($user->user_email, $user->display_name, $test_events, date('Y-m-d', strtotime('+1 day')));
                return true;
            }
        }
        
        return false;
    }
}

new OES_Event_Reminder();