<?php
/**
 * OES Teacher Assignments — Eğitmenin kendi kurslarına görev yönetimi (panel)
 *
 * Mevcut oes_assignments / oes_assignment_submissions tablolarını kullanır.
 * Tüm işlemler: nonce + eğitmen yetkisi + kurs SAHİPLİĞİ.
 * Mevcut admin uçlarını (manage_options) ezmez; yeni oes_tp_* action'ları ekler.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher_Assignments {

    private static $instance = null;
    const NONCE = 'oes_teacher_panel';

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_oes_tp_save_assignment',    array($this, 'ajax_save_assignment'));
        add_action('wp_ajax_oes_tp_delete_assignment',  array($this, 'ajax_delete_assignment'));
        add_action('wp_ajax_oes_tp_grade_submission',   array($this, 'ajax_grade_submission'));
        add_action('wp_ajax_oes_tp_save_transcript',    array($this, 'ajax_save_transcript'));
    }

    private function owns_submission($user_id, $submission_id) {
        global $wpdb;
        $cid = $wpdb->get_var($wpdb->prepare(
            "SELECT a.course_id FROM {$wpdb->prefix}oes_assignment_submissions s
             INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id
             WHERE s.id = %d", $submission_id
        ));
        return $cid && OES_Teacher::owns_course($user_id, $cid);
    }

    /** Ses transkripti kaydet (eğitmen kapsamlı) */
    public function ajax_save_transcript() {
        $user_id = $this->guard();
        global $wpdb;

        $submission_id = intval($_POST['submission_id'] ?? 0);
        $voice_index   = intval($_POST['voice_index'] ?? 0);
        $transcript    = wp_kses_post(wp_unslash($_POST['transcript'] ?? ''));

        if (!$submission_id || $transcript === '') wp_send_json_error('Geçersiz veri.');
        if (!$this->owns_submission($user_id, $submission_id)) wp_send_json_error('Yetkiniz yok.');

        $json = $wpdb->get_var($wpdb->prepare("SELECT voice_transcript FROM {$wpdb->prefix}oes_assignment_submissions WHERE id = %d", $submission_id));
        $map = json_decode($json, true);
        if (!is_array($map)) $map = array();
        $map[(string) $voice_index] = $transcript;

        $wpdb->update($wpdb->prefix . 'oes_assignment_submissions',
            array('voice_transcript' => wp_json_encode($map, JSON_UNESCAPED_UNICODE)),
            array('id' => $submission_id));

        wp_send_json_success(array('message' => 'Transkript kaydedildi.'));
    }

    private function guard() {
        check_ajax_referer(self::NONCE, 'nonce');
        if (!OES_Teacher::can_access_panel()) wp_send_json_error('Yetkiniz yok.');
        return get_current_user_id();
    }

    private function owns_assignment($user_id, $assignment_id) {
        global $wpdb;
        $cid = $wpdb->get_var($wpdb->prepare(
            "SELECT course_id FROM {$wpdb->prefix}oes_assignments WHERE id = %d", $assignment_id
        ));
        return $cid && OES_Teacher::owns_course($user_id, $cid);
    }

    /* ---------------------------------------------------------------------
     *  Kaydet (oluştur / güncelle)
     * ------------------------------------------------------------------- */
    public function ajax_save_assignment() {
        $user_id = $this->guard();
        global $wpdb;

        $id        = intval($_POST['assignment_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        $title     = sanitize_text_field($_POST['title'] ?? '');

        if (!OES_Teacher::owns_course($user_id, $course_id)) wp_send_json_error('Bu kursa yetkiniz yok.');
        if ($title === '') wp_send_json_error('Görev başlığı zorunludur.');
        if ($id && !$this->owns_assignment($user_id, $id)) wp_send_json_error('Bu görevi düzenleyemezsiniz.');

        $is_graded = !empty($_POST['is_graded']) ? 1 : 0;
        $period_id = !empty($_POST['period_id']) ? intval($_POST['period_id']) : null;
        $due_raw   = sanitize_text_field($_POST['due_date'] ?? '');

        $data = array(
            'course_id'   => $course_id,
            'period_id'   => $period_id,
            'title'       => $title,
            'description' => sanitize_textarea_field(wp_unslash($_POST['description'] ?? '')),
            'due_date'    => $due_raw !== '' ? $due_raw : null,
            'extra_days'  => intval($_POST['extra_days'] ?? 2),
            'is_graded'   => $is_graded,
            'max_score'   => $is_graded ? intval($_POST['max_score'] ?? 100) : 0,
            'allow_file'  => !empty($_POST['allow_file']) ? 1 : 0,
            'allow_voice' => !empty($_POST['allow_voice']) ? 1 : 0,
            'allow_text'  => !empty($_POST['allow_text']) ? 1 : 0,
            'status'      => ($_POST['status'] ?? 'active') === 'draft' ? 'draft' : 'active',
        );

        if ($id) {
            $wpdb->update($wpdb->prefix . 'oes_assignments', $data, array('id' => $id));
        } else {
            $data['created_by'] = $user_id;
            $wpdb->insert($wpdb->prefix . 'oes_assignments', $data);
            $id = $wpdb->insert_id;
            do_action('oes_assignment_created', $id);
        }

        wp_send_json_success(array(
            'id'       => $id,
            'message'  => $id ? 'Görev kaydedildi.' : 'Görev oluşturuldu.',
            'redirect' => home_url('/egitmen/gonderim/'),
        ));
    }

    /* ---------------------------------------------------------------------
     *  Sil
     * ------------------------------------------------------------------- */
    public function ajax_delete_assignment() {
        $user_id = $this->guard();
        $id = intval($_POST['assignment_id'] ?? 0);
        if (!$id || !$this->owns_assignment($user_id, $id)) wp_send_json_error('Bu görevi silemezsiniz.');

        global $wpdb;
        $wpdb->delete($wpdb->prefix . 'oes_assignment_submissions', array('assignment_id' => $id));
        $wpdb->delete($wpdb->prefix . 'oes_assignments', array('id' => $id));
        wp_send_json_success(array('message' => 'Görev silindi.'));
    }

    /* ---------------------------------------------------------------------
     *  Değerlendir
     * ------------------------------------------------------------------- */
    public function ajax_grade_submission() {
        $user_id = $this->guard();
        global $wpdb;

        $submission_id = intval($_POST['submission_id'] ?? 0);
        $sub = $wpdb->get_row($wpdb->prepare(
            "SELECT s.id, a.course_id, a.max_score, a.is_graded FROM {$wpdb->prefix}oes_assignment_submissions s
             INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id
             WHERE s.id = %d", $submission_id
        ));
        if (!$sub || !OES_Teacher::owns_course($user_id, $sub->course_id)) wp_send_json_error('Yetkiniz yok.');

        // Puanı [0, max_score] aralığına sınırla (puansızsa 0)
        $score = $sub->is_graded ? max(0, min(intval($_POST['score'] ?? 0), (int) $sub->max_score)) : 0;

        $wpdb->update($wpdb->prefix . 'oes_assignment_submissions', array(
            'score'     => $score,
            'feedback'  => sanitize_textarea_field(wp_unslash($_POST['feedback'] ?? '')),
            'status'    => 'graded',
            'graded_by' => $user_id,
            'graded_at' => current_time('mysql'),
        ), array('id' => $submission_id));

        do_action('oes_assignment_graded', $submission_id);
        wp_send_json_success(array('message' => 'Değerlendirme kaydedildi.'));
    }

    /* ---------------------------------------------------------------------
     *  Görünüm verileri (statik)
     * ------------------------------------------------------------------- */

    /** Eğitmenin tüm kurslarındaki görevler */
    public static function get_teacher_assignments($user_id) {
        global $wpdb;
        $course_ids = OES_Teacher::get_teacher_course_ids($user_id);
        if (empty($course_ids)) return array();
        $ph = implode(',', array_fill(0, count($course_ids), '%d'));

        return $wpdb->get_results($wpdb->prepare(
            "SELECT a.*, p.post_title AS course_name,
                (SELECT COUNT(*) FROM {$wpdb->prefix}oes_assignment_submissions WHERE assignment_id = a.id) AS submission_count,
                (SELECT COUNT(*) FROM {$wpdb->prefix}oes_assignment_submissions WHERE assignment_id = a.id AND status = 'pending') AS pending_count
             FROM {$wpdb->prefix}oes_assignments a
             LEFT JOIN {$wpdb->posts} p ON a.course_id = p.ID
             WHERE a.course_id IN ($ph)
             ORDER BY a.created_at DESC",
            $course_ids
        ));
    }

    /** Düzenleme için tek görev (sahiplik doğrulanır) */
    public static function get_assignment_for_edit($user_id, $id) {
        global $wpdb;
        $id = (int) $id;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_assignments WHERE id = %d", $id));
        if (!$row || !OES_Teacher::owns_course($user_id, $row->course_id)) return null;
        return $row;
    }

    /** Bir görevin gönderimleri (sahiplik doğrulanır) */
    public static function get_submissions($user_id, $assignment_id) {
        global $wpdb;
        $assignment_id = (int) $assignment_id;
        $assignment = self::get_assignment_for_edit($user_id, $assignment_id);
        if (!$assignment) return null;

        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT s.*, u.display_name, u.user_email
             FROM {$wpdb->prefix}oes_assignment_submissions s
             LEFT JOIN {$wpdb->users} u ON s.user_id = u.ID
             WHERE s.assignment_id = %d
             ORDER BY s.submitted_at DESC", $assignment_id
        ));

        foreach ($rows as &$r) {
            $files = json_decode((string) $r->file_url, true);
            $r->files = is_array($files) ? $files : ($r->file_url ? array(array('name' => $r->file_name ?: 'Dosya', 'url' => $r->file_url)) : array());
            $voices = json_decode((string) $r->voice_url, true);
            $r->voices = is_array($voices) ? $voices : ($r->voice_url ? array(array('url' => $r->voice_url, 'duration' => 0)) : array());
            $tr = json_decode((string) $r->voice_transcript, true);
            $r->transcripts = is_array($tr) ? $tr : array();
        }
        unset($r);

        return array('assignment' => $assignment, 'submissions' => $rows);
    }
}

OES_Teacher_Assignments::instance();
