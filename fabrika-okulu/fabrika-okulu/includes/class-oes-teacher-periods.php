<?php
/**
 * OES Teacher Periods — Eğitmenin kendi kurslarına dönem yönetimi (panel)
 *
 * Mevcut oes_periods / oes_period_enrollments tablolarını kullanır.
 * Program (schedule) saatleri eğitmen takvimine otomatik yansır (OES_Teacher_Calendar).
 * Sahiplik: dönemin course_id'si eğitmenin kursu olmalı.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher_Periods {

    private static $instance = null;
    const NONCE = 'oes_teacher_panel';

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_tp_save_period',   array($this, 'ajax_save_period'));
        add_action('wp_ajax_oes_tp_delete_period', array($this, 'ajax_delete_period'));
    }

    private function guard() {
        check_ajax_referer(self::NONCE, 'nonce');
        if (!OES_Teacher::can_access_panel()) wp_send_json_error('Yetkiniz yok.');
        return get_current_user_id();
    }

    private function owns_period($user_id, $period_id) {
        global $wpdb;
        $cid = $wpdb->get_var($wpdb->prepare("SELECT course_id FROM {$wpdb->prefix}oes_periods WHERE id = %d", $period_id));
        return $cid && OES_Teacher::owns_course($user_id, $cid);
    }

    public function ajax_save_period() {
        $user_id = $this->guard();
        global $wpdb;

        $id        = intval($_POST['period_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        $name      = sanitize_text_field($_POST['name'] ?? '');
        $start     = sanitize_text_field($_POST['start_date'] ?? '');
        $end       = sanitize_text_field($_POST['end_date'] ?? '');

        if (!OES_Teacher::owns_course($user_id, $course_id)) wp_send_json_error('Bu kursa yetkiniz yok.');
        if ($name === '' || $start === '' || $end === '') wp_send_json_error('Ad ve tarihler zorunludur.');
        if ($id && !$this->owns_period($user_id, $id)) wp_send_json_error('Bu dönemi düzenleyemezsiniz.');

        // Program (schedule): JSON dizi [{date,time,title,link,notes}]
        $schedule = array();
        $raw = json_decode(wp_unslash($_POST['schedule'] ?? ''), true);
        if (is_array($raw)) {
            foreach ($raw as $item) {
                if (!is_array($item) || empty($item['date'])) continue;
                $schedule[] = array(
                    'date'  => sanitize_text_field($item['date']),
                    'time'  => sanitize_text_field($item['time'] ?? ''),
                    'title' => sanitize_text_field($item['title'] ?? ''),
                    'link'  => esc_url_raw($item['link'] ?? ''),
                    'notes' => sanitize_text_field($item['notes'] ?? ''),
                );
            }
        }

        $data = array(
            'course_id'           => $course_id,
            'name'                => $name,
            'start_date'          => $start,
            'end_date'            => $end,
            'enrollment_deadline' => sanitize_text_field($_POST['enrollment_deadline'] ?? '') ?: null,
            'capacity'            => max(1, intval($_POST['capacity'] ?? 20)),
            'description'         => sanitize_textarea_field(wp_unslash($_POST['description'] ?? '')),
            'schedule'            => wp_json_encode($schedule),
        );

        $notify = !empty($_POST['notify']); // program/link güncellendi → öğrencilere bildir

        if ($id) {
            $wpdb->update($wpdb->prefix . 'oes_periods', $data, array('id' => $id));
        } else {
            $data['created_at'] = current_time('mysql');
            $wpdb->insert($wpdb->prefix . 'oes_periods', $data);
            $id = $wpdb->insert_id;
        }

        // Program/link güncellemesinde bu dönemin öğrencilerine bildirim
        if ($notify) {
            $this->notify_period_students($id, $course_id, $name, $schedule);
        }

        wp_send_json_success(array('id' => $id, 'message' => 'Dönem kaydedildi.'));
    }

    /** Dönemin kayıtlı öğrencilerine program güncelleme bildirimi (push + mail) */
    private function notify_period_students($period_id, $course_id, $period_name, $schedule) {
        global $wpdb;
        $student_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d", $period_id
        ));
        if (empty($student_ids)) return;

        $course = get_the_title($course_id);
        $body = $course . ' · ' . $period_name . ' programı güncellendi.';

        // En yakın linkli oturum (varsa) mesaja eklensin
        $link = '';
        $now = current_time('Y-m-d');
        foreach ((array) $schedule as $s) {
            if (!empty($s['link']) && !empty($s['date']) && $s['date'] >= $now) { $link = $s['link']; break; }
        }

        // Push
        if (class_exists('OES_Push')) {
            OES_Push::send_to_users($student_ids, '📅 Ders programı güncellendi', $body, $link ?: home_url('/panel/takvim/'), 'period-' . $period_id, 'Dönem öğrencileri');
        }

        // Mail (basit)
        if (class_exists('OES_Mail_System') && get_option('oes_emails_muted', 'no') !== 'yes') {
            $mailer = OES_Mail_System::instance();
            foreach ($student_ids as $uid) {
                $u = get_userdata($uid);
                if (!$u || !$u->user_email) continue;
                $content = '<p>Merhaba ' . esc_html($u->display_name) . ',</p>'
                    . '<p><strong>' . esc_html($course) . '</strong> — <strong>' . esc_html($period_name) . '</strong> dönemine ait ders programı güncellendi.</p>'
                    . ($link ? '<p><a href="' . esc_url($link) . '">Derse katılım / program bağlantısı</a></p>' : '')
                    . '<p>Detaylar için panelindeki takvime göz at.</p>';
                if (method_exists($mailer, 'get_email_template')) {
                    $html = $mailer->get_email_template('Ders programı güncellendi', $content, 'Takvime git', home_url('/panel/takvim/'));
                } else {
                    $html = $content;
                }
                wp_mail($u->user_email, 'Ders programı güncellendi — ' . $course, $html, array('Content-Type: text/html; charset=UTF-8'));
            }
        }
    }

    public function ajax_delete_period() {
        $user_id = $this->guard();
        global $wpdb;
        $id = intval($_POST['period_id'] ?? 0);
        if (!$id || !$this->owns_period($user_id, $id)) wp_send_json_error('Bu dönemi silemezsiniz.');

        $enrolled = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d", $id
        ));
        if ($enrolled > 0) wp_send_json_error('Bu dönemde kayıtlı öğrenci var, silinemez.');

        $wpdb->delete($wpdb->prefix . 'oes_periods', array('id' => $id));
        wp_send_json_success(array('message' => 'Dönem silindi.'));
    }

    /** Bir kursun dönemleri (sahiplik doğrulanır) */
    public static function get_course_periods($user_id, $course_id) {
        global $wpdb;
        $course_id = (int) $course_id;
        if (!OES_Teacher::owns_course($user_id, $course_id)) return array();
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT p.*, (SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = p.id) AS enrolled
             FROM {$wpdb->prefix}oes_periods p WHERE p.course_id = %d ORDER BY p.start_date ASC",
            $course_id
        ));
        foreach ($rows as &$r) {
            $sch = json_decode((string) $r->schedule, true);
            $r->schedule_arr = is_array($sch) ? $sch : array();
        }
        unset($r);
        return $rows;
    }
}

OES_Teacher_Periods::instance();
