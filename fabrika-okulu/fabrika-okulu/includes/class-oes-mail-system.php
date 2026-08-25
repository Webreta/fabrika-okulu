<?php
/**
 * OES Kapsamlı Mail Yönetim Sistemi
 * Tüm mail gönderim ve ayarlarını yöneten merkezi sistem
 * 
 * @package Online_Egitim_Sistemi
 * @version 2.0
 */

if (!defined('ABSPATH')) exit;

class OES_Mail_System {
    
    private static $instance = null;
    private $current_mail_type = '';
    
    /**
     * Singleton instance
     */
    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Constructor
     */
    public function __construct() {
        // WordPress mail filters
        add_filter('wp_mail_content_type', array($this, 'set_html_content_type'));
        add_filter('wp_mail_from', array($this, 'set_mail_from'), 10, 1);
        add_filter('wp_mail_from_name', array($this, 'set_mail_from_name'));
        
        // Admin menu & settings
        add_action('admin_menu', array($this, 'add_settings_page'), 99);
        add_action('admin_init', array($this, 'register_settings'));
        
        // AJAX handlers
        add_action('wp_ajax_oes_save_mail_settings', array($this, 'ajax_save_settings'));
        add_action('wp_ajax_oes_test_single_mail', array($this, 'ajax_test_single_mail'));
        add_action('wp_ajax_oes_preview_template', array($this, 'ajax_preview_template'));
        
        // Admin scripts & styles
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        
        // Mail notification hooks - Diğer sistemlerle entegrasyon
        add_action('oes_assignment_created', array($this, 'send_new_assignment_notification'));
        add_action('oes_assignment_submitted', array($this, 'send_assignment_submitted_notification'));
        add_action('oes_assignment_graded', array($this, 'send_assignment_graded_notification'));
        add_action('oes_quiz_created', array($this, 'send_new_quiz_notification'));
        add_action('oes_quiz_completed', array($this, 'send_quiz_completed_notification'));
    }
    
    /**
     * Mail türlerini tanımla
     */
    public function get_mail_types() {
        return array(
            'new_assignment' => array(
                'icon' => '📝',
                'title' => 'Yeni Görev Atandığında',
                'desc' => 'Kursa kayıtlı öğrencilere gönderilir',
                'to' => 'Öğrenciler',
                'vars' => '{site}, {title}, {course}, {due_date}',
                'default_subject' => '[{site}] Yeni Görev: {title}'
            ),
            'assignment_submitted' => array(
                'icon' => '✅',
                'title' => 'Görev Teslim Edildiğinde',
                'desc' => 'Admin e-postalarına gönderilir',
                'to' => 'Admin',
                'vars' => '{site}, {student}, {title}, {course}',
                'default_subject' => '[{site}] Görev Teslim Edildi: {student}'
            ),
            'assignment_graded' => array(
                'icon' => '⭐',
                'title' => 'Görev Notlandığında',
                'desc' => 'Öğrenciye gönderilir',
                'to' => 'Öğrenci',
                'vars' => '{site}, {title}, {score}, {percentage}',
                'default_subject' => '[{site}] Göreviniz Notlandı: {percentage}'
            ),
            'new_quiz' => array(
                'icon' => '📋',
                'title' => 'Yeni Sınav Atandığında',
                'desc' => 'Kursa kayıtlı öğrencilere gönderilir',
                'to' => 'Öğrenciler',
                'vars' => '{site}, {title}, {course}, {time_limit}',
                'default_subject' => '[{site}] Yeni Sınav: {title}'
            ),
            'quiz_completed' => array(
                'icon' => '🎯',
                'title' => 'Sınav Tamamlandığında',
                'desc' => 'Admin e-postalarına gönderilir',
                'to' => 'Admin',
                'vars' => '{site}, {student}, {title}, {score}',
                'default_subject' => '[{site}] Sınav Tamamlandı: {student}'
            ),
            'question_asked' => array(
                'icon' => '❓',
                'title' => 'Öğrenci Soru Sorduğunda',
                'desc' => 'Admin e-postalarına gönderilir',
                'to' => 'Admin',
                'vars' => '{site}, {student}, {course}, {question}',
                'default_subject' => '[{site}] Yeni Soru: {student}'
            ),
            'question_answered' => array(
                'icon' => '💬',
                'title' => 'Soru Cevaplandığında',
                'desc' => 'Öğrenciye gönderilir',
                'to' => 'Öğrenci',
                'vars' => '{site}, {course}, {question}',
                'default_subject' => '[{site}] Sorunuz Cevaplandı'
            ),
            'event_reminder' => array(
                'icon' => '🔔',
                'title' => 'Etkinlik Hatırlatması',
                'desc' => 'Her gün 09:00\'da öğrenciye gönderilir',
                'to' => 'Öğrenci',
                'vars' => '{site}, {date}, {count}',
                'default_subject' => '[{site}] Yarınki Etkinlikleriniz ({count} etkinlik)',
                'info' => 'Her gün 09:00\'da otomatik gönderilir'
            )
        );
    }
    
    /**
     * Varsayılan ayarları getir
     */
    public function get_default_settings() {
        $settings = array(
            'admin_emails' => get_option('admin_email'),
            'notifications' => array()
        );
        
        foreach ($this->get_mail_types() as $type => $config) {
            $settings['notifications'][$type] = array(
                'enabled' => true,
                'subject' => $config['default_subject'],
                'from_type' => 'no-reply',
                'from_custom' => ''
            );
        }
        
        return $settings;
    }
    
    /**
     * HTML content type ayarla
     */
    public function set_html_content_type() {
        return 'text/html';
    }
    
    /**
     * Mail gönderen adresini ayarla
     */
    public function set_mail_from($original_email) {
        if (empty($this->current_mail_type)) return $original_email;
        
        $settings = get_option('oes_mail_settings', array());
        $from_type = $settings['notifications'][$this->current_mail_type]['from_type'] ?? 'wordpress';
        
        if ($from_type === 'custom') {
            $custom = $settings['notifications'][$this->current_mail_type]['from_custom'] ?? '';
            return !empty($custom) ? $custom : $original_email;
        } elseif ($from_type === 'no-reply') {
            return 'no-reply@' . parse_url(home_url(), PHP_URL_HOST);
        } elseif ($from_type === 'info') {
            return 'info@' . parse_url(home_url(), PHP_URL_HOST);
        } elseif ($from_type === 'destek') {
            return 'destek@' . parse_url(home_url(), PHP_URL_HOST);
        }
        return $original_email;
    }
    
    /**
     * Mail gönderen ismini ayarla
     */
    public function set_mail_from_name($original_name) {
        return get_bloginfo('name');
    }
    
    /**
     * Admin menu ekle
     */
    public function add_settings_page() {
        add_submenu_page(
            'online-kurs-sistemi',
            'Mail Yönetimi',
            'Mail Yönetimi',
            'manage_options',
            'oes-mail-settings',
            array($this, 'render_settings_page')
        );
    }
    
    /**
     * Ayarları kaydet
     */
    public function register_settings() {
        register_setting('oes_mail_settings', 'oes_mail_settings');
    }
    
    /**
     * Admin scripts ve styles
     */
    public function enqueue_admin_assets($hook) {
        // Debug için hook ismini görelim
        if (strpos($hook, 'oes-mail') !== false || strpos($hook, 'online') !== false) {
            
            wp_enqueue_style(
                'oes-mail-admin',
                OES_PLUGIN_URL . 'assets/css/mail-admin.css',
                array(),
                '2.0'
            );
            
            wp_enqueue_script(
                'oes-mail-admin',
                OES_PLUGIN_URL . 'assets/js/mail-admin.js',
                array('jquery'),
                '2.0',
                true
            );
            
            wp_localize_script('oes-mail-admin', 'oesMailAdmin', array(
                'ajaxurl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('oes_mail_nonce'),
                'hook' => $hook // Debug için
            ));
        }
    }
    
    /**
     * Admin ayarlar sayfası
     */
    public function render_settings_page() {
        if (!current_user_can('manage_options')) return;
        
        $settings = get_option('oes_mail_settings', $this->get_default_settings());
        $mail_types = $this->get_mail_types();
        $domain = parse_url(home_url(), PHP_URL_HOST);
        
        OES_Admin::oes_admin_styles();
        ?>
        <div class="wrap oes-mail-admin oes-admin-wrap fabo-wrap">
            <div class="fabo-head">
                <div>
                    <h1>Mail Yönetimi</h1>
                    <p>Hangi olayda kime mail gideceğini ve şablonlarını buradan yönetirsin.
                       Günlük rapor maili ayrı: <a href="<?php echo esc_url(admin_url('admin.php?page=online-kurs-sistemi')); ?>">Gösterge Paneli</a>.</p>
                </div>
            </div>

        <div class="oes-mail-container">
            
            <!-- Genel Ayarlar -->
            <div class="oes-mail-section">
                <div class="oes-section-header">
                    <h2>⚙️ Genel Ayarlar</h2>
                </div>
                <div class="oes-section-body">
                    <div class="oes-form-group">
                        <label class="oes-label">
                            <span class="oes-label-text">Admin E-posta Adresleri</span>
                            <span class="oes-label-desc">Sistem bildirimlerinin gönderileceği e-posta adresleri (virgülle ayırarak birden fazla adres ekleyebilirsiniz)</span>
                        </label>
                        <textarea id="admin_emails" class="oes-textarea" rows="2" placeholder="admin@site.com, yonetici@site.com"><?php echo esc_textarea($settings['admin_emails'] ?? get_option('admin_email')); ?></textarea>
                        <p class="oes-help-text">💡 <strong>İpucu:</strong> Öğrenci sorularını, görev teslimlerini ve sınav sonuçlarını bu adreslere göndereceğiz.</p>
                    </div>
                </div>
            </div>
            
            <!-- Mail Bildirimleri -->
            <div class="oes-mail-section">
                <div class="oes-section-header">
                    <h2>📬 Mail Bildirimleri</h2>
                    <button type="button" class="oes-btn oes-btn-primary" id="saveAllSettings">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        Tümünü Kaydet
                    </button>
                </div>
                <div class="oes-section-body">
                    <?php foreach ($mail_types as $type => $config):
                        $enabled    = $settings['notifications'][$type]['enabled']    ?? true;
                        $subject    = $settings['notifications'][$type]['subject']    ?? $config['default_subject'];
                        $from_type  = $settings['notifications'][$type]['from_type']  ?? 'no-reply';
                        $from_custom= $settings['notifications'][$type]['from_custom']?? '';
                    ?>
                    <div class="oes-mail-card <?php echo $enabled ? 'active' : ''; ?>" data-type="<?php echo $type; ?>">
                        <div class="oes-card-header">
                            <div class="oes-card-title-wrap">
                                <span class="oes-card-icon"><?php echo $config['icon']; ?></span>
                                <div class="oes-card-title-group">
                                    <h3 class="oes-card-title"><?php echo $config['title']; ?></h3>
                                    <p class="oes-card-desc"><?php echo $config['desc']; ?>
                                        <?php if (!empty($config['info'])): ?><span class="oes-card-badge"><?php echo $config['info']; ?></span><?php endif; ?>
                                    </p>
                                </div>
                            </div>
                            <label class="oes-toggle">
                                <input type="checkbox" class="mail-toggle" data-type="<?php echo $type; ?>" <?php checked($enabled, true); ?>>
                                <span class="oes-toggle-slider"></span>
                            </label>
                        </div>
                        <div class="oes-card-body">
                            <div class="oes-form-group">
                                <label class="oes-label">
                                    <span class="oes-label-text">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                        Gönderen E-posta Adresi
                                    </span>
                                </label>
                                <div class="oes-input-group">
                                    <select class="oes-select from-type-select" data-type="<?php echo $type; ?>">
                                        <option value="wordpress" <?php selected($from_type,'wordpress'); ?>>WordPress Varsayılan (<?php echo get_option('admin_email'); ?>)</option>
                                        <option value="no-reply" <?php selected($from_type,'no-reply'); ?>>no-reply@<?php echo $domain; ?></option>
                                        <option value="info"     <?php selected($from_type,'info');     ?>>info@<?php echo $domain; ?></option>
                                        <option value="destek"   <?php selected($from_type,'destek');   ?>>destek@<?php echo $domain; ?></option>
                                        <option value="custom"   <?php selected($from_type,'custom');   ?>>📝 Özel E-posta Adresi</option>
                                    </select>
                                    <input type="email" class="oes-input from-custom-input" data-type="<?php echo $type; ?>" value="<?php echo esc_attr($from_custom); ?>" placeholder="egitim@siteniz.com" style="display:<?php echo $from_type==='custom'?'block':'none'; ?>;">
                                </div>
                            </div>
                            <div class="oes-form-group">
                                <label class="oes-label">
                                    <span class="oes-label-text">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                                        Mail Konusu
                                    </span>
                                    <span class="oes-label-desc">Kullanılabilir değişkenler: <code><?php echo $config['vars']; ?></code></span>
                                </label>
                                <input type="text" class="oes-input mail-subject" data-type="<?php echo $type; ?>" value="<?php echo esc_attr($subject); ?>" placeholder="<?php echo esc_attr($config['default_subject']); ?>">
                            </div>
                            <div class="oes-info-box">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                                <div><strong>Alıcı:</strong> <?php echo $config['to']; ?>
                                    <?php if ($config['to']==='Admin'): ?><span class="oes-info-badge">Yukarıdaki admin e-posta adreslerine gönderilir</span><?php endif; ?>
                                </div>
                            </div>
                            <div class="oes-card-actions">
                                <button type="button" class="oes-btn oes-btn-secondary preview-btn" data-type="<?php echo $type; ?>">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                                    Önizle
                                </button>
                                <button type="button" class="oes-btn oes-btn-secondary test-btn" data-type="<?php echo $type; ?>">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                    Test Mail Gönder
                                </button>
                            </div>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            </div>
            
            <!-- Yardım -->
            <div class="oes-mail-section oes-help-section">
                <div class="oes-section-header"><h2>💡 Yardım & İpuçları</h2></div>
                <div class="oes-section-body">
                    <div class="oes-help-grid">
                        <div class="oes-help-item"><h4>🎯 Gönderen Adresi</h4><p>Her mail türü için farklı gönderen adresi kullanabilirsiniz.</p></div>
                        <div class="oes-help-item"><h4>📝 Değişken Kullanımı</h4><p>Konu satırında <code>[{site}] {student}</code> gibi değişkenler kullanabilirsiniz.</p></div>
                        <div class="oes-help-item"><h4>✉️ Admin E-postaları</h4><p>Virgülle ayırarak birden fazla admin e-postası ekleyebilirsiniz.</p></div>
                        <div class="oes-help-item"><h4>🧪 Test Maili</h4><p>Kaydetmeden önce test butonu ile mailin nasıl görüneceğini kontrol edin.</p></div>
                    </div>
                </div>
            </div>
            
        </div>
        </div>
        
        <!-- Test Mail Modal -->
        <div id="testMailModal" class="oes-modal" style="display:none;">
            <div class="oes-modal-overlay"></div>
            <div class="oes-modal-content">
                <div class="oes-modal-header"><h3>Test Mail Gönder</h3><button type="button" class="oes-modal-close">&times;</button></div>
                <div class="oes-modal-body">
                    <p>Test mailinin gönderileceği e-posta adresini girin:</p>
                    <input type="email" id="testEmail" class="oes-input" placeholder="test@example.com" value="<?php echo esc_attr(get_option('admin_email')); ?>">
                </div>
                <div class="oes-modal-footer">
                    <button type="button" class="oes-btn oes-btn-secondary" id="cancelTestMail">İptal</button>
                    <button type="button" class="oes-btn oes-btn-primary" id="sendTestMail">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Gönder
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Preview Modal -->
        <div id="previewModal" class="oes-modal oes-modal-large" style="display:none;">
            <div class="oes-modal-overlay"></div>
            <div class="oes-modal-content">
                <div class="oes-modal-header"><h3>Mail Önizleme</h3><button type="button" class="oes-modal-close">&times;</button></div>
                <div class="oes-modal-body" id="previewContent"><div class="oes-loading">Yükleniyor...</div></div>
            </div>
        </div>
        <?php
    }
    
    /**
     * AJAX: Ayarları kaydet
     */
    public function ajax_save_settings() {
        check_ajax_referer('oes_mail_nonce', 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }
        
        $settings = json_decode(wp_unslash($_POST['settings'] ?? ''), true);
        if (!is_array($settings)) {
            wp_send_json_error('Geçersiz veri.');
        }

        // Tüm skaler değerleri temizle (yapıyı koruyarak)
        $sanitize_recursive = function ($value) use (&$sanitize_recursive) {
            if (is_array($value)) return array_map($sanitize_recursive, $value);
            if (is_bool($value)) return $value ? 1 : 0;
            return sanitize_text_field((string) $value);
        };
        $settings = $sanitize_recursive($settings);

        update_option('oes_mail_settings', $settings);
        wp_send_json_success('Ayarlar başarıyla kaydedildi!');
    }
    
    /**
     * AJAX: Test mail gönder
     */
    public function ajax_test_single_mail() {
        check_ajax_referer('oes_mail_nonce', 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }
        
        $type = sanitize_text_field($_POST['type']);
        $email = sanitize_email($_POST['email']);
        
        if (!$email) {
            wp_send_json_error('E-posta adresi girin.');
        }
        
        $this->current_mail_type = $type;
        
        $mail_types = $this->get_mail_types();
        $title = 'Test Maili - ' . ($mail_types[$type]['title'] ?? $type);
        $content = '<p>Bu bir test mailidir.</p><div style="padding:20px;background:#f1f5f9;border-radius:8px;margin:20px 0;"><p><strong>Mail Tipi:</strong> ' . esc_html($type) . '</p><p><strong>Gönderim Zamanı:</strong> ' . date('d.m.Y H:i:s') . '</p><p><strong>Gönderen:</strong> ' . $this->set_mail_from('') . '</p></div>';
        
        $message = $this->get_email_template($title, $content);
        $subject = $this->get_mail_subject($type, array('site' => get_bloginfo('name')));
        
        $sent = wp_mail($email, $subject, $message);
        $this->current_mail_type = '';
        
        if ($sent) {
            wp_send_json_success('Test maili başarıyla gönderildi!');
        } else {
            wp_send_json_error('Mail gönderilemedi. Sunucu ayarlarını kontrol edin.');
        }
    }
    
    /**
     * AJAX: Template önizleme
     */
    public function ajax_preview_template() {
        check_ajax_referer('oes_mail_nonce', 'nonce');
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }

        $type = sanitize_text_field($_POST['type']);
        $mail_types = $this->get_mail_types();
        
        $title = 'Önizleme - ' . ($mail_types[$type]['title'] ?? $type);
        $content = '<p>Bu bir önizleme içeriğidir.</p><div style="padding:20px;background:#f1f5f9;border-radius:8px;margin:20px 0;"><p>Mail içeriği buraya gelecek...</p></div>';
        
        $template = $this->get_email_template($title, $content, 'Butonu Görüntüle', '#');
        
        wp_send_json_success(array('html' => $template));
    }
    
    /**
     * Mail konusunu değişkenlerle oluştur
     */
    private function get_mail_subject($type, $vars = array()) {
        $settings = get_option('oes_mail_settings', array());
        $subject = $settings['notifications'][$type]['subject'] ?? '';
        
        if (empty($subject)) {
            $mail_types = $this->get_mail_types();
            $subject = $mail_types[$type]['default_subject'] ?? '[{site}] Bildirim';
        }
        
        foreach ($vars as $key => $value) {
            $subject = str_replace('{' . $key . '}', $value, $subject);
        }
        
        return $subject;
    }
    
    /**
     * Kurumsal HTML mail şablonu (public — diğer modüller de kullanabilir)
     */
    public function get_email_template($title, $content, $button_text = '', $button_url = '') {
        $site_name = get_bloginfo('name');
        $site_url  = home_url();
        $logo      = get_option('oes_panel_icon') ?: get_site_icon_url(120);
        $navy      = '#012963';
        $green     = '#10b981';

        $logo_html = $logo
            ? '<img src="' . esc_url($logo) . '" alt="" width="52" height="52" style="display:inline-block;border-radius:12px;background:#ffffff;object-fit:cover;margin-bottom:12px;">'
            : '';

        $button_html = '';
        if ($button_text && $button_url) {
            $button_html = '<table cellpadding="0" cellspacing="0" style="margin:28px auto 4px;"><tr><td style="border-radius:10px;background:' . $green . ';">'
                . '<a href="' . esc_url($button_url) . '" style="display:inline-block;padding:14px 34px;color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">' . esc_html($button_text) . '</a>'
                . '</td></tr></table>';
        }

        $year = date('Y');

        $template = '<!DOCTYPE html>
<html lang="tr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<span style="display:none;font-size:0;line-height:0;max-height:0;opacity:0;overflow:hidden;">' . esc_html($title) . '</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f7;padding:36px 16px;">
    <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(1,41,99,.10);">
            <tr>
                <td style="background:' . $navy . ';padding:32px 40px;text-align:center;">
                    ' . $logo_html . '
                    <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.2px;">' . esc_html($site_name) . '</div>
                    <div style="height:3px;width:48px;background:' . $green . ';border-radius:3px;margin:14px auto 0;"></div>
                </td>
            </tr>
            <tr>
                <td style="padding:38px 40px 30px;">
                    <h2 style="margin:0 0 18px;color:#0f172a;font-size:20px;font-weight:700;">' . esc_html($title) . '</h2>
                    <div style="color:#475569;font-size:15px;line-height:1.65;">' . $content . '</div>
                    ' . $button_html . '
                </td>
            </tr>
            <tr>
                <td style="background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #eef2f7;">
                    <p style="margin:0 0 6px;color:#64748b;font-size:13px;">Bu e-posta <strong style="color:#334155;">' . esc_html($site_name) . '</strong> tarafından otomatik gönderildi.</p>
                    <p style="margin:0;color:#94a3b8;font-size:12px;"><a href="' . esc_url($site_url) . '" style="color:' . $navy . ';text-decoration:none;font-weight:600;">' . esc_html(wp_parse_url($site_url, PHP_URL_HOST)) . '</a> &middot; &copy; ' . $year . '</p>
                </td>
            </tr>
        </table>
        <p style="margin:16px 0 0;color:#b6c0cf;font-size:11px;">Bu otomatik bir bildirimdir, lütfen yanıtlamayınız.</p>
    </td></tr>
</table>
</body>
</html>';

        return $template;
    }
    
    /**
     * Bildirim aktif mi kontrol et
     */
    private function is_notification_enabled($type) {
        // Global susturma (Mail Yönetimi'nden). Varsayılan AÇIK.
        if (get_option('oes_emails_muted', 'no') === 'yes') return false;
        $settings = get_option('oes_mail_settings', array());
        return $settings['notifications'][$type]['enabled'] ?? true;
    }
    
    /**
     * Admin e-postalarını getir
     */
    private function get_admin_emails() {
        $settings = get_option('oes_mail_settings', array());
        $emails = $settings['admin_emails'] ?? get_option('admin_email');
        
        $emails = explode(',', $emails);
        $emails = array_map('trim', $emails);
        $emails = array_filter($emails, 'is_email');
        
        return empty($emails) ? array(get_option('admin_email')) : $emails;
    }
    
    /**
     * Kursa kayıtlı öğrencileri getir
     */
    private function get_course_students($course_id) {
        global $wpdb;
        
        $student_ids = $wpdb->get_col($wpdb->prepare(
            "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_enrollments WHERE course_id = %d",
            $course_id
        ));
        
        return $student_ids;
    }
    
    // =============================================
    // MAIL GÖNDERME FONKSİYONLARI
    // =============================================
    
    /**
     * Yeni görev atandığında mail gönder
     */
    public function send_new_assignment_notification($assignment_id) {
        if (!$this->is_notification_enabled('new_assignment')) return;
        
        global $wpdb;
        $assignment = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_assignments WHERE id=%d",
            $assignment_id
        ));
        
        if (!$assignment) return;
        
        $course = get_post($assignment->course_id);
        if (!$course) return;
        
        $students = $this->get_course_students($assignment->course_id);
        if (empty($students)) return;
        
        $this->current_mail_type = 'new_assignment';
        
        $title = 'Yeni Görev Atandı';
        $due_date_html = '';
        if (!empty($assignment->due_date) && $assignment->due_date !== '0000-00-00 00:00:00') {
            $due_date_html = '<p style="margin:15px 0;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;"><strong>📅 Son Teslim:</strong> ' . date('d.m.Y H:i', fabo_deadline_ts($assignment->due_date)) . '</p>';
        }
        
        $content = '<p>Merhaba,</p><p><strong>' . esc_html($course->post_title) . '</strong> kursu için yeni görev:</p><div style="margin:20px 0;padding:20px;background:#f1f5f9;border-radius:8px;"><h3 style="margin:0 0 10px;font-size:17px;">📝 ' . esc_html($assignment->title) . '</h3><p style="margin:0;color:#475569;">' . nl2br(esc_html($assignment->description)) . '</p></div>' . $due_date_html;
        
        $message = $this->get_email_template(
            $title,
            $content,
            'Görevimi Görüntüle',
            home_url('/panel/gorev/')
        );
        
        $subject = $this->get_mail_subject('new_assignment', array(
            'site' => get_bloginfo('name'),
            'title' => $assignment->title,
            'course' => $course->post_title,
            'due_date' => !empty($assignment->due_date) ? date('d.m.Y', strtotime($assignment->due_date)) : ''
        ));
        
        foreach ($students as $sid) {
            $user = get_userdata($sid);
            if ($user && !empty($user->user_email)) {
                wp_mail($user->user_email, $subject, $message);
            }
        }
        
        $this->current_mail_type = '';
    }
    
    /**
     * Görev teslim edildiğinde mail gönder
     */
    public function send_assignment_submitted_notification($submission_id) {
        if (!$this->is_notification_enabled('assignment_submitted')) return;
        
        global $wpdb;
        $submission = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_assignment_submissions WHERE id=%d",
            $submission_id
        ));
        
        if (!$submission) return;
        
        $assignment = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_assignments WHERE id=%d",
            $submission->assignment_id
        ));
        
        if (!$assignment) return;
        
        $course = get_post($assignment->course_id);
        $student = get_userdata($submission->user_id);
        
        if (!$course || !$student) return;
        
        $this->current_mail_type = 'assignment_submitted';
        
        $title = 'Yeni Görev Teslimi';
        $content = '<p>Merhaba,</p><p>Bir öğrenci görev teslim etti:</p><div style="margin:20px 0;padding:20px;background:#f1f5f9;border-radius:8px;"><p><strong>👤 Öğrenci:</strong> ' . esc_html($student->display_name) . '</p><p><strong>📚 Kurs:</strong> ' . esc_html($course->post_title) . '</p><p><strong>📝 Görev:</strong> ' . esc_html($assignment->title) . '</p><p><strong>📅 Teslim:</strong> ' . date('d.m.Y H:i', strtotime($submission->submitted_at)) . '</p></div>';
        
        $message = $this->get_email_template(
            $title,
            $content,
            'Gönderiyi İncele',
            admin_url('admin.php?page=oes-assignments&tab=submissions')
        );
        
        $subject = $this->get_mail_subject('assignment_submitted', array(
            'site' => get_bloginfo('name'),
            'student' => $student->display_name,
            'title' => $assignment->title,
            'course' => $course->post_title
        ));
        
        foreach ($this->get_admin_emails() as $email) {
            wp_mail($email, $subject, $message);
        }
        
        $this->current_mail_type = '';
    }
    
    /**
     * Görev notlandığında mail gönder
     */
    public function send_assignment_graded_notification($submission_id) {
        if (!$this->is_notification_enabled('assignment_graded')) return;
        
        global $wpdb;
        $submission = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_assignment_submissions WHERE id=%d",
            $submission_id
        ));
        
        if (!$submission || empty($submission->score)) return;
        
        $assignment = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_assignments WHERE id=%d",
            $submission->assignment_id
        ));
        
        if (!$assignment) return;
        
        $course = get_post($assignment->course_id);
        $student = get_userdata($submission->user_id);
        
        if (!$course || !$student || empty($student->user_email)) return;
        
        $this->current_mail_type = 'assignment_graded';
        
        $percentage = ($submission->score / $assignment->max_score) * 100;
        $grade_color = $percentage >= 50 ? '#10b981' : '#ef4444';
        
        $title = 'Göreviniz Notlandı';
        $feedback_html = '';
        if (!empty($submission->feedback)) {
            $feedback_html = '<div style="margin:20px 0;padding:20px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;"><strong>💬 Geri Bildirim:</strong><br>' . nl2br(esc_html($submission->feedback)) . '</div>';
        }
        
        $content = '<p>Merhaba ' . esc_html($student->display_name) . ',</p><p>Göreviniz değerlendirildi:</p><div style="margin:20px 0;padding:20px;background:#f1f5f9;border-radius:8px;"><p><strong>📚 Kurs:</strong> ' . esc_html($course->post_title) . '</p><p><strong>📝 Görev:</strong> ' . esc_html($assignment->title) . '</p></div><div style="margin:20px 0;padding:30px;background:#f8fafc;border-radius:8px;text-align:center;"><div style="font-size:48px;font-weight:700;color:' . $grade_color . ';margin-bottom:10px;">' . number_format($percentage, 0) . '%</div><div style="font-size:20px;color:#475569;">' . $submission->score . ' / ' . $assignment->max_score . ' puan</div></div>' . $feedback_html;
        
        $message = $this->get_email_template(
            $title,
            $content,
            'Görevimi Görüntüle',
            home_url('/panel/gorev/')
        );
        
        $subject = $this->get_mail_subject('assignment_graded', array(
            'site' => get_bloginfo('name'),
            'title' => $assignment->title,
            'score' => $submission->score,
            'percentage' => number_format($percentage, 0) . '%'
        ));
        
        wp_mail($student->user_email, $subject, $message);
        
        $this->current_mail_type = '';
    }
    
    /**
     * Yeni sınav atandığında mail gönder
     */
    public function send_new_quiz_notification($quiz_id) {
        if (!$this->is_notification_enabled('new_quiz')) return;
        
        global $wpdb;
        $quiz = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id=%d",
            $quiz_id
        ));
        
        if (!$quiz) return;
        
        $course = get_post($quiz->course_id);
        if (!$course) return;
        
        $students = $this->get_course_students($quiz->course_id);
        if (empty($students)) return;
        
        $this->current_mail_type = 'new_quiz';
        
        $title = 'Yeni Sınav Atandı';
        $time_limit = '';
        if ($quiz->time_limit > 0) {
            $time_limit = '<p style="margin:15px 0;padding:12px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;"><strong>⏱️ Süre:</strong> ' . $quiz->time_limit . ' dakika</p>';
        }
        
        $content = '<p>Merhaba,</p><p><strong>' . esc_html($course->post_title) . '</strong> kursu için yeni sınav:</p><div style="margin:20px 0;padding:20px;background:#f1f5f9;border-radius:8px;"><h3 style="margin:0 0 10px;font-size:17px;">📋 ' . esc_html($quiz->title) . '</h3><p style="margin:0;color:#475569;">' . nl2br(esc_html($quiz->description)) . '</p></div>' . $time_limit;
        
        $message = $this->get_email_template(
            $title,
            $content,
            'Sınavımı Görüntüle',
            home_url('/panel/sinav/')
        );
        
        $subject = $this->get_mail_subject('new_quiz', array(
            'site' => get_bloginfo('name'),
            'title' => $quiz->title,
            'course' => $course->post_title,
            'time_limit' => $quiz->time_limit > 0 ? $quiz->time_limit . ' dakika' : ''
        ));
        
        foreach ($students as $sid) {
            $user = get_userdata($sid);
            if ($user && !empty($user->user_email)) {
                wp_mail($user->user_email, $subject, $message);
            }
        }
        
        $this->current_mail_type = '';
    }
    
    /**
     * Sınav tamamlandığında mail gönder
     */
    public function send_quiz_completed_notification($attempt_id) {
        if (!$this->is_notification_enabled('quiz_completed')) return;
        
        global $wpdb;
        $attempt = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quiz_attempts WHERE id=%d",
            $attempt_id
        ));
        
        if (!$attempt) return;
        
        $quiz = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id=%d",
            $attempt->quiz_id
        ));
        
        if (!$quiz) return;
        
        $course = get_post($quiz->course_id);
        $student = get_userdata($attempt->user_id);
        
        if (!$course || !$student) return;
        
        $this->current_mail_type = 'quiz_completed';
        
        $title = 'Sınav Tamamlandı';
        $percentage = $attempt->score > 0 ? number_format($attempt->score, 0) : '0';
        
        $content = '<p>Merhaba,</p><p>Bir öğrenci sınavı tamamladı:</p><div style="margin:20px 0;padding:20px;background:#f1f5f9;border-radius:8px;"><p><strong>👤 Öğrenci:</strong> ' . esc_html($student->display_name) . '</p><p><strong>📚 Kurs:</strong> ' . esc_html($course->post_title) . '</p><p><strong>📋 Sınav:</strong> ' . esc_html($quiz->title) . '</p><p><strong>📊 Puan:</strong> %' . $percentage . '</p><p><strong>📅 Tarih:</strong> ' . date('d.m.Y H:i', strtotime($attempt->completed_at)) . '</p></div>';
        
        $message = $this->get_email_template(
            $title,
            $content,
            'Sınavı İncele',
            admin_url('admin.php?page=oes-quizzes')
        );
        
        $subject = $this->get_mail_subject('quiz_completed', array(
            'site' => get_bloginfo('name'),
            'student' => $student->display_name,
            'title' => $quiz->title,
            'score' => '%' . $percentage
        ));
        
        foreach ($this->get_admin_emails() as $email) {
            wp_mail($email, $subject, $message);
        }
        
        $this->current_mail_type = '';
    }
    
    /**
     * Soru sorulduğunda mail gönder
     */
    public function send_question_asked_notification($question_id) {
        if (!$this->is_notification_enabled('question_asked')) return;
        
        global $wpdb;
        $question = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_questions WHERE id=%d",
            $question_id
        ));
        
        if (!$question) return;
        
        $course = get_post($question->course_id);
        $student = get_userdata($question->user_id);
        
        if (!$course || !$student) return;
        
        $this->current_mail_type = 'question_asked';
        
        $title = 'Yeni Soru Soruldu';
        $content = '<p>Merhaba,</p><p>Bir öğrenci soru sordu:</p><div style="margin:20px 0;padding:20px;background:#f1f5f9;border-radius:8px;"><p><strong>👤 Öğrenci:</strong> ' . esc_html($student->display_name) . ' (' . esc_html($student->user_email) . ')</p><p><strong>📚 Kurs:</strong> ' . esc_html($course->post_title) . '</p></div><div style="margin:20px 0;padding:20px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;"><strong>❓ Soru:</strong><br>' . nl2br(esc_html($question->question_text)) . '</div>';
        
        $message = $this->get_email_template(
            $title,
            $content,
            'Soruyu Cevapla',
            admin_url('admin.php?page=oes-questions&id=' . $question_id)
        );
        
        $subject = $this->get_mail_subject('question_asked', array(
            'site' => get_bloginfo('name'),
            'student' => $student->display_name,
            'course' => $course->post_title,
            'question' => wp_trim_words($question->question_text, 10)
        ));
        
        foreach ($this->get_admin_emails() as $email) {
            wp_mail($email, $subject, $message);
        }
        
        $this->current_mail_type = '';
    }
    
    /**
     * Soru cevaplandığında mail gönder
     */
    public function send_question_answered_notification($question_id, $answer) {
        if (!$this->is_notification_enabled('question_answered')) return;
        
        global $wpdb;
        $question = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_questions WHERE id=%d",
            $question_id
        ));
        
        if (!$question) return;
        
        $course = get_post($question->course_id);
        $student = get_userdata($question->user_id);
        
        if (!$course || !$student || empty($student->user_email)) return;
        
        $this->current_mail_type = 'question_answered';
        
        $title = 'Sorunuz Cevaplandı';
        $content = '<p>Merhaba ' . esc_html($student->display_name) . ',</p><p>Sorduğunuz soru cevaplandı:</p><div style="margin:20px 0;padding:20px;background:#f1f5f9;border-radius:8px;"><p><strong>📚 Kurs:</strong> ' . esc_html($course->post_title) . '</p></div><div style="margin:20px 0;padding:20px;background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;"><strong>❓ Sorunuz:</strong><br>' . nl2br(esc_html($question->question_text)) . '</div><div style="margin:20px 0;padding:20px;background:#d1fae5;border-left:4px solid #10b981;border-radius:6px;"><strong>💬 Cevap:</strong><br>' . nl2br(esc_html($answer)) . '</div>';
        
        // Öğrenciyi sorusunu SORDUĞU derse götür. (Eskiden get_permalink ile ürünün
        // SATIŞ sayfasına gidiyordu — öğrenci kursu zaten almış, orada işi yok.)
        // $question->id veriliyor: tam O sorunun dersine gitsin (en son soruya değil).
        $go_url = class_exists('OES_Questions')
            ? OES_Questions::ask_screen_url($question->user_id, $question->course_id, $question->id)
            : home_url('/panel/');

        $message = $this->get_email_template(
            $title,
            $content,
            'Soruyu sorduğun derse git',
            $go_url
        );

        $subject = $this->get_mail_subject('question_answered', array(
            'site' => get_bloginfo('name'),
            'course' => $course->post_title,
            'question' => wp_trim_words($question->question_text, 10)
        ));
        
        wp_mail($student->user_email, $subject, $message);
        
        $this->current_mail_type = '';
    }
    
    /**
     * Etkinlik hatırlatması gönder
     */
    public function send_event_reminder($email, $name, $events, $date) {
        if (!$this->is_notification_enabled('event_reminder')) return;
        
        $this->current_mail_type = 'event_reminder';
        
        $site_name = get_bloginfo('name');
        $calendar_url = home_url('/panel/takvim/');
        $date_formatted = date_i18n('d F Y, l', strtotime($date));
        
        $title = 'Yarınki Etkinlikleriniz';
        $events_html = '';
        
        foreach ($events as $event) {
            $time_badge = !empty($event['time']) ? '<span style="display:inline-block;padding:4px 10px;background:#fef3c7;color:#92400e;border-radius:6px;font-size:12px;font-weight:600;margin-left:10px;">🕐 ' . esc_html($event['time']) . '</span>' : '';
            
            $notes_html = !empty($event['notes']) ? '<p style="margin:10px 0;padding:12px;background:#fff;border-left:3px solid #10b981;border-radius:6px;color:#475569;font-size:13px;">' . nl2br(esc_html($event['notes'])) . '</p>' : '';
            
            $link_html = !empty($event['link']) ? '<a href="' . esc_url($event['link']) . '" style="display:inline-block;margin-top:10px;padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">🔗 Katılım Linki</a>' : '';
            
            $events_html .= '<div style="margin:20px 0;padding:20px;background:#f9fafb;border-left:4px solid #10b981;border-radius:8px;"><h3 style="margin:0 0 10px;font-size:17px;">' . esc_html($event['title']) . $time_badge . '</h3><p style="margin:5px 0;color:#64748b;font-size:13px;">📚 ' . esc_html($event['course_name']) . '</p>' . $notes_html . $link_html . '</div>';
        }
        
        $content = '<p>Merhaba ' . esc_html($name) . ',</p><p><strong>' . esc_html($date_formatted) . '</strong> tarihinde <strong>' . count($events) . ' eğitim etkinliğiniz</strong> bulunuyor:</p>' . $events_html;
        
        $message = $this->get_email_template(
            $title,
            $content,
            'Eğitim Takvimime Git',
            $calendar_url
        );
        
        $subject = $this->get_mail_subject('event_reminder', array(
            'site' => $site_name,
            'date' => $date_formatted,
            'count' => count($events)
        ));
        
        if (get_option('oes_emails_muted', 'no') !== 'yes') {
            wp_mail($email, $subject, $message);
        }

        $this->current_mail_type = '';
    }
}

// Singleton instance başlat
OES_Mail_System::instance();