<?php
/**
 * OES Teacher Questions — Eğitmenin kendi kurslarında soru-cevap (panel)
 *
 * Mevcut oes_questions / oes_question_answers tablolarını kullanır.
 * Sohbet birimi = user_id + course_id. Eğitmen yalnızca kendi kurslarını görür.
 * Cevap is_instructor=1 ile yazılır, soru 'answered' olur, öğrenciye mail gider.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher_Questions {

    private static $instance = null;
    const NONCE = 'oes_teacher_panel';

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_tp_answer_question', array($this, 'ajax_answer_question'));
    }

    private function guard() {
        check_ajax_referer(self::NONCE, 'nonce');
        if (!OES_Teacher::can_access_panel()) wp_send_json_error('Yetkiniz yok.');
        return get_current_user_id();
    }

    /* ---------------------------------------------------------------------
     *  Cevapla
     * ------------------------------------------------------------------- */
    public function ajax_answer_question() {
        $user_id = $this->guard();
        global $wpdb;

        $chat_user = intval($_POST['chat_user_id'] ?? 0);
        $chat_course = intval($_POST['chat_course_id'] ?? 0);
        $answer = trim(sanitize_textarea_field(wp_unslash($_POST['answer'] ?? '')));

        if (!$chat_course || !OES_Teacher::owns_course($user_id, $chat_course)) wp_send_json_error('Yetkiniz yok.');
        if ($answer === '') wp_send_json_error('Boş mesaj gönderilemez.');

        // Sohbetteki en son soruyu bul (cevap ona bağlanır)
        $question_id = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}oes_questions WHERE user_id = %d AND course_id = %d ORDER BY created_at DESC LIMIT 1",
            $chat_user, $chat_course
        ));
        if (!$question_id) wp_send_json_error('Soru bulunamadı.');

        $now = current_time('mysql');
        $wpdb->insert($wpdb->prefix . 'oes_question_answers', array(
            'question_id'   => $question_id,
            'user_id'       => $user_id,
            'answer'        => $answer,
            'is_instructor' => 1,
            'created_at'    => $now,
        ));

        // Bu sohbetteki bekleyen tüm soruları yanıtlanmış say
        $wpdb->query($wpdb->prepare(
            "UPDATE {$wpdb->prefix}oes_questions SET status = 'answered' WHERE user_id = %d AND course_id = %d AND status = 'pending'",
            $chat_user, $chat_course
        ));

        // Öğrenciye mail
        if (class_exists('OES_Mail_System')) {
            OES_Mail_System::instance()->send_question_answered_notification($question_id, $answer);
        }
        // Öğrenciye push
        // 4. arg (course_id): bildirim, sorunun sorulduğu derse gitsin
        do_action('oes_question_answered_push', $chat_user, get_the_title($chat_course), $answer, (int) $chat_course);

        wp_send_json_success(array(
            'message' => 'Cevap gönderildi.',
            'reply'   => array('text' => $answer, 'time' => date_i18n('d M H:i', strtotime($now))),
        ));
    }

    /* ---------------------------------------------------------------------
     *  Görünüm verileri
     * ------------------------------------------------------------------- */

    /** Eğitmenin kurslarındaki sohbetler (user+course) */
    public static function get_teacher_threads($user_id) {
        global $wpdb;
        $course_ids = OES_Teacher::get_teacher_course_ids($user_id);
        if (empty($course_ids)) return array();
        $ph = implode(',', array_fill(0, count($course_ids), '%d'));

        return $wpdb->get_results($wpdb->prepare(
            "SELECT q.user_id, q.course_id,
                    u.display_name, p.post_title AS course_name,
                    COUNT(q.id) AS message_count,
                    MAX(q.created_at) AS last_activity,
                    SUM(CASE WHEN q.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
                    (SELECT question_text FROM {$wpdb->prefix}oes_questions WHERE user_id = q.user_id AND course_id = q.course_id ORDER BY created_at DESC LIMIT 1) AS last_message
             FROM {$wpdb->prefix}oes_questions q
             LEFT JOIN {$wpdb->users} u ON q.user_id = u.ID
             LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
             WHERE q.course_id IN ($ph)
             GROUP BY q.user_id, q.course_id, u.display_name, p.post_title
             ORDER BY last_activity DESC",
            $course_ids
        ));
    }

    /** Tek sohbetin mesajları (soru + cevaplar, kronolojik) */
    public static function get_thread($user_id, $chat_user_id, $chat_course_id) {
        global $wpdb;
        $chat_user_id = (int) $chat_user_id;
        $chat_course_id = (int) $chat_course_id;
        if (!OES_Teacher::owns_course($user_id, $chat_course_id)) return null;

        $questions = $wpdb->get_results($wpdb->prepare(
            "SELECT q.id, q.question_text, q.lesson_title, q.created_at, u.display_name
             FROM {$wpdb->prefix}oes_questions q
             LEFT JOIN {$wpdb->users} u ON q.user_id = u.ID
             WHERE q.user_id = %d AND q.course_id = %d
             ORDER BY q.created_at ASC",
            $chat_user_id, $chat_course_id
        ));
        if (empty($questions)) return null;

        $messages = array();
        foreach ($questions as $q) {
            $messages[] = array(
                'type'    => 'student',
                'name'    => $q->display_name ?: 'Öğrenci',
                'text'    => $q->question_text,
                'lesson'  => $q->lesson_title,
                'time'    => $q->created_at,
            );
            $answers = $wpdb->get_results($wpdb->prepare(
                "SELECT a.answer, a.is_instructor, a.created_at, u.display_name
                 FROM {$wpdb->prefix}oes_question_answers a
                 LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
                 WHERE a.question_id = %d ORDER BY a.created_at ASC",
                $q->id
            ));
            foreach ($answers as $a) {
                $messages[] = array(
                    'type' => $a->is_instructor ? 'instructor' : 'student',
                    'name' => $a->is_instructor ? 'Siz' : ($a->display_name ?: 'Öğrenci'),
                    'text' => $a->answer,
                    'lesson' => null,
                    'time' => $a->created_at,
                );
            }
        }
        usort($messages, function ($x, $y) { return strtotime($x['time']) - strtotime($y['time']); });

        $student = get_userdata($chat_user_id);
        $course  = get_the_title($chat_course_id);
        return array(
            'messages'    => $messages,
            'student'     => $student ? $student->display_name : 'Öğrenci',
            'course_name' => $course,
            'user_id'     => $chat_user_id,
            'course_id'   => $chat_course_id,
        );
    }
}

OES_Teacher_Questions::instance();
