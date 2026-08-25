<?php
/**
 * OES Teacher Quizzes — Eğitmenin kendi kurslarına sınav yönetimi (panel)
 *
 * Mevcut oes_quizzes / oes_quiz_questions / oes_quiz_attempts / oes_quiz_answers
 * tablolarını kullanır. Tüm işlemler: nonce + eğitmen yetkisi + kurs SAHİPLİĞİ.
 * Mevcut admin uçlarını ezmez; yeni oes_tp_* action'ları ekler.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher_Quizzes {

    private static $instance = null;
    const NONCE = 'oes_teacher_panel';

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_tp_save_quiz',        array($this, 'ajax_save_quiz'));
        add_action('wp_ajax_oes_tp_delete_quiz',      array($this, 'ajax_delete_quiz'));
        add_action('wp_ajax_oes_tp_save_question',    array($this, 'ajax_save_question'));
        add_action('wp_ajax_oes_tp_delete_question',  array($this, 'ajax_delete_question'));
        add_action('wp_ajax_oes_tp_grade_open_ended', array($this, 'ajax_grade_open_ended'));
    }

    private function guard() {
        check_ajax_referer(self::NONCE, 'nonce');
        if (!OES_Teacher::can_access_panel()) wp_send_json_error('Yetkiniz yok.');
        return get_current_user_id();
    }

    private function owns_quiz($user_id, $quiz_id) {
        global $wpdb;
        $cid = $wpdb->get_var($wpdb->prepare("SELECT course_id FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $quiz_id));
        return $cid && OES_Teacher::owns_course($user_id, $cid);
    }

    private function quiz_id_of_question($question_id) {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare("SELECT quiz_id FROM {$wpdb->prefix}oes_quiz_questions WHERE id = %d", $question_id));
    }

    /* ---------------------------------------------------------------------
     *  Sınav kaydet (ayarlar)
     * ------------------------------------------------------------------- */
    public function ajax_save_quiz() {
        $user_id = $this->guard();
        global $wpdb;

        $id        = intval($_POST['id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        $title     = sanitize_text_field($_POST['title'] ?? '');

        if (!OES_Teacher::owns_course($user_id, $course_id)) wp_send_json_error('Bu kursa yetkiniz yok.');
        if ($title === '') wp_send_json_error('Sınav başlığı zorunludur.');
        if ($id && !$this->owns_quiz($user_id, $id)) wp_send_json_error('Bu sınavı düzenleyemezsiniz.');

        $data = array(
            'title'                => $title,
            'description'          => sanitize_textarea_field(wp_unslash($_POST['description'] ?? '')),
            'course_id'            => $course_id,
            'period_id'            => !empty($_POST['period_id']) ? intval($_POST['period_id']) : null,
            'time_limit'           => intval($_POST['time_limit'] ?? 0),
            'pass_score'           => intval($_POST['pass_score'] ?? 60),
            'max_attempts'         => intval($_POST['max_attempts'] ?? 1),
            'shuffle_questions'    => !empty($_POST['shuffle_questions']) ? 1 : 0,
            'shuffle_answers'      => !empty($_POST['shuffle_answers']) ? 1 : 0,
            'show_correct_answers' => !empty($_POST['show_correct_answers']) ? 1 : 0,
            'status'               => ($_POST['status'] ?? 'active') === 'draft' ? 'draft' : 'active',
        );

        if ($id) {
            $wpdb->update($wpdb->prefix . 'oes_quizzes', $data, array('id' => $id));
        } else {
            $wpdb->insert($wpdb->prefix . 'oes_quizzes', $data);
            $id = $wpdb->insert_id;
            do_action('oes_quiz_created', $id);
        }

        wp_send_json_success(array(
            'id'       => $id,
            'message'  => 'Sınav kaydedildi.',
            // 'sinavlar' görünümü yok (Gönderimler'e düşerdi); sınavlar eğitim
            // editöründe müfredatın içinde yönetiliyor.
            'redirect' => home_url('/egitmen/kurslarim/'),
        ));
    }

    /* ---------------------------------------------------------------------
     *  Sınav sil (soft delete)
     * ------------------------------------------------------------------- */
    public function ajax_delete_quiz() {
        $user_id = $this->guard();
        $id = intval($_POST['id'] ?? 0);
        if (!$id || !$this->owns_quiz($user_id, $id)) wp_send_json_error('Bu sınavı silemezsiniz.');
        global $wpdb;
        $wpdb->update($wpdb->prefix . 'oes_quizzes', array('status' => 'deleted'), array('id' => $id));
        wp_send_json_success(array('message' => 'Sınav silindi.'));
    }

    /* ---------------------------------------------------------------------
     *  Soru kaydet
     * ------------------------------------------------------------------- */
    public function ajax_save_question() {
        $user_id = $this->guard();
        global $wpdb;

        $quiz_id = intval($_POST['quiz_id'] ?? 0);
        if (!$this->owns_quiz($user_id, $quiz_id)) wp_send_json_error('Yetkiniz yok.');

        $type = sanitize_text_field($_POST['question_type'] ?? 'multiple_choice');
        $data = array(
            'quiz_id'        => $quiz_id,
            'question_type'  => $type,
            'question_text'  => sanitize_textarea_field(wp_unslash($_POST['question_text'] ?? '')),
            'question_image' => esc_url_raw($_POST['question_image'] ?? ''),
            'points'         => max(1, intval($_POST['points'] ?? 1)),
            'explanation'    => sanitize_textarea_field(wp_unslash($_POST['explanation'] ?? '')),
        );

        if ($type === 'multiple_choice') {
            $options = array_values(array_filter(array_map('sanitize_text_field', (array) ($_POST['options'] ?? array())), function ($v) { return $v !== ''; }));
            $data['options']        = wp_json_encode($options);
            $data['correct_answer'] = wp_json_encode(array_map('intval', (array) ($_POST['correct'] ?? array())));
        } elseif ($type === 'true_false') {
            $data['options']        = wp_json_encode(array('Doğru', 'Yanlış'));
            $data['correct_answer'] = sanitize_text_field($_POST['correct'] ?? 'true');
        } else {
            $data['options']        = null;
            $data['correct_answer'] = null;
        }

        $qid = intval($_POST['question_id'] ?? 0);
        if ($qid > 0) {
            if ($this->quiz_id_of_question($qid) !== $quiz_id) wp_send_json_error('Yetkiniz yok.');
            $wpdb->update($wpdb->prefix . 'oes_quiz_questions', $data, array('id' => $qid));
        } else {
            $max = (int) $wpdb->get_var($wpdb->prepare("SELECT MAX(sort_order) FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d", $quiz_id));
            $data['sort_order'] = $max + 1;
            $wpdb->insert($wpdb->prefix . 'oes_quiz_questions', $data);
            $qid = $wpdb->insert_id;
        }

        wp_send_json_success(array('id' => $qid, 'message' => 'Soru kaydedildi.'));
    }

    /* ---------------------------------------------------------------------
     *  Soru sil
     * ------------------------------------------------------------------- */
    public function ajax_delete_question() {
        $user_id = $this->guard();
        $qid = intval($_POST['question_id'] ?? 0);
        $quiz_id = $this->quiz_id_of_question($qid);
        if (!$qid || !$quiz_id || !$this->owns_quiz($user_id, $quiz_id)) wp_send_json_error('Yetkiniz yok.');
        global $wpdb;
        $wpdb->delete($wpdb->prefix . 'oes_quiz_questions', array('id' => $qid));
        wp_send_json_success(array('message' => 'Soru silindi.'));
    }

    /* ---------------------------------------------------------------------
     *  Açık uçlu değerlendirme (skoru şemaya uygun yeniden hesaplar)
     * ------------------------------------------------------------------- */
    public function ajax_grade_open_ended() {
        $user_id = $this->guard();
        global $wpdb;

        $attempt_id = intval($_POST['attempt_id'] ?? 0);
        $attempt = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_attempts WHERE id = %d", $attempt_id));
        if (!$attempt || !$this->owns_quiz($user_id, $attempt->quiz_id)) wp_send_json_error('Yetkiniz yok.');

        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $attempt->quiz_id));
        $questions = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d", $attempt->quiz_id));
        $answers = json_decode((string) $attempt->answers, true) ?: array();
        $grades  = json_decode(wp_unslash($_POST['grades'] ?? ''), true) ?: array();

        $total = 0; $earned = 0;

        foreach ($questions as $q) {
            $total += (int) $q->points;

            if ($q->question_type === 'open_ended') {
                $g = isset($grades[$q->id]) ? $grades[$q->id] : null;
                $pts = $g ? min(max(0, intval($g['points'] ?? 0)), (int) $q->points) : 0;
                $earned += $pts;

                $exists = $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}oes_quiz_answers WHERE attempt_id = %d AND question_id = %d",
                    $attempt_id, $q->id
                ));
                $ans_data = array(
                    'points_earned' => $pts,
                    'feedback'      => sanitize_text_field($g['feedback'] ?? ''),
                    'graded_by'     => $user_id,
                    'graded_at'     => current_time('mysql'),
                );
                if ($exists) {
                    $wpdb->update($wpdb->prefix . 'oes_quiz_answers', $ans_data, array('id' => $exists));
                } else {
                    $ans_data['attempt_id']  = $attempt_id;
                    $ans_data['question_id'] = $q->id;
                    $ans_data['user_answer'] = isset($answers[$q->id]) ? (string) $answers[$q->id] : '';
                    $wpdb->insert($wpdb->prefix . 'oes_quiz_answers', $ans_data);
                }
            } else {
                // Otomatik puanlama (player mantığıyla birebir)
                $ua = isset($answers[$q->id]) ? $answers[$q->id] : '';
                $correct = json_decode($q->correct_answer, true);
                if (!is_array($correct)) $correct = array($q->correct_answer);
                $ok = false;
                if ($q->question_type === 'multiple_choice') {
                    $idx = ord(strtoupper((string) $ua)) - 65;
                    $ok = in_array($idx, array_map('intval', $correct), true);
                } else {
                    $ok = ((string) $ua === (string) $q->correct_answer);
                }
                if ($ok) $earned += (int) $q->points;
            }
        }

        $score  = $total > 0 ? round(($earned / $total) * 100, 2) : 0;
        $passed = ((int) $quiz->pass_score === 0) ? 1 : ($score >= (int) $quiz->pass_score ? 1 : 0);

        $wpdb->update($wpdb->prefix . 'oes_quiz_attempts', array(
            'score'         => $score,
            'earned_points' => $earned,
            'total_points'  => $total,
            'passed'        => $passed,
            'status'        => 'completed',
        ), array('id' => $attempt_id));

        do_action('oes_quiz_graded', $attempt_id, $attempt->user_id);

        wp_send_json_success(array('message' => 'Değerlendirme kaydedildi.', 'score' => $score, 'passed' => $passed));
    }

    /* ---------------------------------------------------------------------
     *  Görünüm verileri (statik)
     * ------------------------------------------------------------------- */
    public static function get_teacher_quizzes($user_id) {
        global $wpdb;
        $course_ids = OES_Teacher::get_teacher_course_ids($user_id);
        if (empty($course_ids)) return array();
        $ph = implode(',', array_fill(0, count($course_ids), '%d'));
        return $wpdb->get_results($wpdb->prepare(
            "SELECT q.*, p.post_title AS course_name,
                (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = q.id) AS question_count,
                (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND status = 'completed') AS completed_count,
                (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND status = 'pending_review') AS pending_count
             FROM {$wpdb->prefix}oes_quizzes q
             LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
             WHERE q.status != 'deleted' AND q.course_id IN ($ph)
             ORDER BY q.created_at DESC",
            $course_ids
        ));
    }

    public static function get_quiz_for_edit($user_id, $id) {
        global $wpdb;
        $id = (int) $id;
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $id));
        if (!$quiz || !OES_Teacher::owns_course($user_id, $quiz->course_id)) return null;
        $quiz->questions = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY sort_order ASC, id ASC", $id
        ));
        return $quiz;
    }

    public static function get_attempts($user_id, $quiz_id) {
        global $wpdb;
        $quiz_id = (int) $quiz_id;
        $quiz = self::get_quiz_for_edit($user_id, $quiz_id);
        if (!$quiz) return null;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT a.*, u.display_name, u.user_email
             FROM {$wpdb->prefix}oes_quiz_attempts a
             LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
             WHERE a.quiz_id = %d AND a.status != 'in_progress'
             ORDER BY a.completed_at DESC, a.started_at DESC", $quiz_id
        ));
        return array('quiz' => $quiz, 'attempts' => $rows);
    }

    /** Açık uçlu değerlendirme ekranı için tek deneme + sorular + cevaplar */
    public static function get_attempt_for_grading($user_id, $attempt_id) {
        global $wpdb;
        $attempt_id = (int) $attempt_id;
        $attempt = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_attempts WHERE id = %d", $attempt_id));
        if (!$attempt) return null;
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $attempt->quiz_id));
        if (!$quiz || !OES_Teacher::owns_course($user_id, $quiz->course_id)) return null;

        $questions = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY sort_order ASC, id ASC", $attempt->quiz_id
        ));
        $answers = json_decode((string) $attempt->answers, true) ?: array();
        // Mevcut açık uçlu notlar
        $graded = array();
        $ans_rows = $wpdb->get_results($wpdb->prepare(
            "SELECT question_id, points_earned, feedback FROM {$wpdb->prefix}oes_quiz_answers WHERE attempt_id = %d", $attempt_id
        ));
        foreach ($ans_rows as $ar) $graded[$ar->question_id] = $ar;

        $user = get_userdata($attempt->user_id);
        return array(
            'attempt'   => $attempt,
            'quiz'      => $quiz,
            'questions' => $questions,
            'answers'   => $answers,
            'graded'    => $graded,
            'student'   => $user ? $user->display_name : 'Öğrenci',
        );
    }
}

OES_Teacher_Quizzes::instance();
