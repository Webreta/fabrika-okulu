<?php
/**
 * OES Module Manager
 * Modüllerin aktif/pasif durumunu yönetir
 */

if (!defined('ABSPATH')) exit;

class OES_Module_Manager {

    /**
     * Tüm opsiyonel modüllerin tanımları
     */
    public static function get_modules() {
        return array(
            'periods' => array(
                'id'          => 'periods',
                'title'       => 'Dönem Yönetimi',
                'description' => 'Kursları döneme göre grupla, başlangıç/bitiş tarihleri ve kontenjan belirle.',
                'icon'        => '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
                'file'        => 'class-oes-periods.php',
                'default'     => true,
            ),
            'quizzes' => array(
                'id'          => 'quizzes',
                'title'       => 'Sınav / Quiz Sistemi',
                'description' => 'Çoktan seçmeli, doğru/yanlış ve açık uçlu sorularla sınav oluştur, otomatik değerlendir.',
                'icon'        => '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
                'file'        => 'class-oes-quizzes.php',
                'default'     => true,
            ),
            'assignments' => array(
                'id'          => 'assignments',
                'title'       => 'Görev Sistemi',
                'description' => 'Dosya yükleme ve sesli kayıt destekli görev gönder, eğitmen tarafından değerlendir.',
                'icon'        => '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>',
                'file'        => 'class-oes-assignments.php',
                'default'     => true,
            ),
            'questions' => array(
                'id'          => 'questions',
                'title'       => 'Soru - Cevap Sistemi',
                'description' => 'Öğrenciler kurs içinde soru sorsun, eğitmenler yanıtlasın.',
                'icon'        => '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>',
                'file'        => 'class-oes-questions.php',
                'default'     => true,
            ),
            'instructors' => array(
                'id'          => 'instructors',
                'title'       => 'Eğitmen Yönetimi',
                'description' => 'Eğitmen profilleri oluştur, kurslarla ilişkilendir ve kurs sayfasında göster.',
                'icon'        => '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
                'file'        => 'class-oes-instructors.php',
                'default'     => true,
            ),
            'mail' => array(
                'id'          => 'mail',
                'title'       => 'Mail Bildirimleri',
                'description' => 'Kayıt, sınav sonucu ve görev bildirimleri için otomatik e-posta gönder.',
                'icon'        => '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
                'file'        => 'class-oes-mail-system.php',
                'default'     => true,
            ),
            'reminders' => array(
                'id'          => 'reminders',
                'title'       => 'Etkinlik Hatırlatmaları',
                'description' => 'Yaklaşan dönem etkinlikleri için öğrencilere otomatik hatırlatma maili gönder.',
                'icon'        => '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
                'file'        => 'class-oes-event-reminder.php',
                'default'     => false,
                'requires'    => array('periods', 'mail'),
            ),
        );
    }

    /**
     * Aktif modülleri döndür (option'dan oku)
     */
    public static function get_active_modules() {
        $saved = get_option('oes_active_modules', null);

        // İlk kurulum: setup wizard çalışmamışsa tüm modüller aktif
        if ($saved === null) {
            return array_keys(self::get_modules());
        }

        return is_array($saved) ? $saved : array();
    }

    /**
     * Modül aktif mi?
     */
    public static function is_active($module_id) {
        return in_array($module_id, self::get_active_modules());
    }

    /**
     * Modülleri kaydet
     */
    public static function save_modules($module_ids) {
        $valid = array_keys(self::get_modules());
        $clean = array_values(array_intersect((array) $module_ids, $valid));
        update_option('oes_active_modules', $clean);
    }

    /**
     * Bağımlılık kontrolü: bir modülün gerektirdiği modüller aktif mi?
     */
    public static function check_dependencies($module_id, $selected_ids) {
        $modules = self::get_modules();
        if (!isset($modules[$module_id]['requires'])) return true;

        foreach ($modules[$module_id]['requires'] as $req) {
            if (!in_array($req, $selected_ids)) return false;
        }
        return true;
    }
}