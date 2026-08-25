<?php
/**
 * Kurs Yardımcı Sınıfı
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Course {

    /**
     * Kullanıcının kursa kayıtlı olup olmadığını kontrol et
     */
    public static function is_user_enrolled($user_id, $course_id) {
        global $wpdb;
        
        $enrolled = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}oes_enrollments 
             WHERE user_id = %d AND course_id = %d AND status = 'active'",
            $user_id, $course_id
        ));
        
        return !empty($enrolled);
    }

    /**
     * Kullanıcıyı kursa kaydet
     */
    public static function enroll_user($user_id, $course_id, $order_id = null) {
        global $wpdb;
        
        if (self::is_user_enrolled($user_id, $course_id)) {
            return false;
        }
        
        return $wpdb->insert(
            $wpdb->prefix . 'oes_enrollments',
            array(
                'user_id' => $user_id,
                'course_id' => $course_id,
                'order_id' => $order_id,
                'status' => 'active',
                'enrolled_at' => current_time('mysql'),
            ),
            array('%d', '%d', '%d', '%s', '%s')
        );
    }

    /**
     * Kullanıcının kurs kaydını iptal et
     */
    public static function unenroll_user($user_id, $course_id) {
        global $wpdb;
        
        return $wpdb->update(
            $wpdb->prefix . 'oes_enrollments',
            array('status' => 'cancelled'),
            array('user_id' => $user_id, 'course_id' => $course_id),
            array('%s'),
            array('%d', '%d')
        );
    }

    /**
     * Kullanıcının kayıtlı olduğu kursları getir
     */
    public static function get_user_courses($user_id) {
        global $wpdb;
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT e.*, p.post_title as course_name 
             FROM {$wpdb->prefix}oes_enrollments e
             LEFT JOIN {$wpdb->posts} p ON e.course_id = p.ID
             WHERE e.user_id = %d AND e.status = 'active'
             ORDER BY e.enrolled_at DESC",
            $user_id
        ));
    }

    /**
     * Kursa kayıtlı öğrencileri getir
     */
    public static function get_course_students($course_id) {
        global $wpdb;
        
        return $wpdb->get_results($wpdb->prepare(
            "SELECT e.*, u.display_name, u.user_email 
             FROM {$wpdb->prefix}oes_enrollments e
             LEFT JOIN {$wpdb->users} u ON e.user_id = u.ID
             WHERE e.course_id = %d AND e.status = 'active'
             ORDER BY e.enrolled_at DESC",
            $course_id
        ));
    }

    /**
     * Ders ilerleme durumunu kaydet
     */
    public static function update_progress($user_id, $course_id, $lesson_id, $status = 'complete', $progress = 100) {
        global $wpdb;
        
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}oes_progress 
             WHERE user_id = %d AND lesson_id = %d",
            $user_id, $lesson_id
        ));
        
        if ($existing) {
            return $wpdb->update(
                $wpdb->prefix . 'oes_progress',
                array(
                    'status' => $status,
                    'progress_percent' => $progress,
                    'completed_at' => $status === 'complete' ? current_time('mysql') : null,
                ),
                array('id' => $existing),
                array('%s', '%d', '%s'),
                array('%d')
            );
        }
        
        return $wpdb->insert(
            $wpdb->prefix . 'oes_progress',
            array(
                'user_id' => $user_id,
                'course_id' => $course_id,
                'lesson_id' => $lesson_id,
                'status' => $status,
                'progress_percent' => $progress,
                'completed_at' => $status === 'complete' ? current_time('mysql') : null,
            ),
            array('%d', '%d', '%d', '%s', '%d', '%s')
        );
    }

    /**
     * Kullanıcının kurs ilerleme yüzdesini hesapla
     */
    public static function get_course_progress($user_id, $course_id) {
        // Birleşik ilerleme: video/dosya + sınav + görev (yalnızca oes_progress değil).
        if (class_exists('OES_Player')) {
            $p = OES_Player::compute_course_progress($course_id, $user_id);
            return $p['percent'];
        }

        global $wpdb;
        $curriculum = get_post_meta($course_id, '_oes_course_curriculum', true);
        if (empty($curriculum)) return 0;
        $total_lessons = 0;
        foreach ($curriculum as $section) {
            $total_lessons += count($section['lessons'] ?? array());
        }
        if ($total_lessons === 0) return 0;
        $completed = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_progress
             WHERE user_id = %d AND course_id = %d AND status = 'complete'",
            $user_id, $course_id
        ));
        return round(($completed / $total_lessons) * 100);
    }

    /**
     * Ürünün kurs olup olmadığını kontrol et
     */
    public static function is_course($product_id) {
        return get_post_meta($product_id, '_oes_is_course', true) === 'yes';
    }

    /**
     * Tüm kursları getir
     */
    public static function get_all_courses($args = array()) {
        $defaults = array(
            'post_type' => 'product',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'meta_query' => array(
                array(
                    'key' => '_oes_is_course',
                    'value' => 'yes',
                ),
            ),
        );
        
        $args = wp_parse_args($args, $defaults);
        return get_posts($args);
    }
}
