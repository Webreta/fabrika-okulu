<?php
/**
 * Mail Yönetim Sistemi - Admin Template
 * 
 * @package Online_Egitim_Sistemi
 */

if (!defined('ABSPATH')) exit;
?>

<div class="wrap oes-mail-admin">
    <h1 class="oes-page-title">
        <span class="oes-title-icon">📧</span>
        Mail Yönetim Sistemi
    </h1>
    <p class="oes-page-desc">Tüm e-posta bildirimlerini tek yerden yönetin. Her mail türü için ayrı gönderen adresi ve konu belirleyebilirsiniz.</p>
    
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
                    <textarea 
                        id="admin_emails" 
                        class="oes-textarea" 
                        rows="2" 
                        placeholder="admin@site.com, yonetici@site.com, egitmen@site.com"
                    ><?php echo esc_textarea($settings['admin_emails'] ?? get_option('admin_email')); ?></textarea>
                    <p class="oes-help-text">
                        💡 <strong>İpucu:</strong> Öğrenci sorularını, görev teslimlerini ve sınav sonuçlarını bu adreslere göndereceğiz.
                    </p>
                </div>
            </div>
        </div>
        
        <!-- Mail Bildirimleri -->
        <div class="oes-mail-section">
            <div class="oes-section-header">
                <h2>📬 Mail Bildirimleri</h2>
                <button type="button" class="oes-btn oes-btn-primary" id="saveAllSettings">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    Tümünü Kaydet
                </button>
            </div>
            <div class="oes-section-body">
                
                <?php foreach ($mail_types as $type => $config): 
                    $enabled = $settings['notifications'][$type]['enabled'] ?? true;
                    $subject = $settings['notifications'][$type]['subject'] ?? $config['default_subject'];
                    $from_type = $settings['notifications'][$type]['from_type'] ?? 'no-reply';
                    $from_custom = $settings['notifications'][$type]['from_custom'] ?? '';
                ?>
                
                <div class="oes-mail-card <?php echo $enabled ? 'active' : ''; ?>" data-type="<?php echo $type; ?>">
                    <div class="oes-card-header">
                        <div class="oes-card-title-wrap">
                            <span class="oes-card-icon"><?php echo $config['icon']; ?></span>
                            <div class="oes-card-title-group">
                                <h3 class="oes-card-title"><?php echo $config['title']; ?></h3>
                                <p class="oes-card-desc">
                                    <?php echo $config['desc']; ?>
                                    <?php if (!empty($config['info'])): ?>
                                        <span class="oes-card-badge"><?php echo $config['info']; ?></span>
                                    <?php endif; ?>
                                </p>
                            </div>
                        </div>
                        <label class="oes-toggle">
                            <input type="checkbox" class="mail-toggle" data-type="<?php echo $type; ?>" <?php checked($enabled, true); ?>>
                            <span class="oes-toggle-slider"></span>
                        </label>
                    </div>
                    
                    <div class="oes-card-body">
                        
                        <!-- Gönderen Seçimi -->
                        <div class="oes-form-group">
                            <label class="oes-label">
                                <span class="oes-label-text">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                        <polyline points="22,6 12,13 2,6"/>
                                    </svg>
                                    Gönderen E-posta Adresi
                                </span>
                            </label>
                            <div class="oes-input-group">
                                <select class="oes-select from-type-select" data-type="<?php echo $type; ?>">
                                    <option value="wordpress" <?php selected($from_type, 'wordpress'); ?>>
                                        WordPress Varsayılan (<?php echo get_option('admin_email'); ?>)
                                    </option>
                                    <option value="no-reply" <?php selected($from_type, 'no-reply'); ?>>
                                        no-reply@<?php echo $domain; ?>
                                    </option>
                                    <option value="info" <?php selected($from_type, 'info'); ?>>
                                        info@<?php echo $domain; ?>
                                    </option>
                                    <option value="destek" <?php selected($from_type, 'destek'); ?>>
                                        destek@<?php echo $domain; ?>
                                    </option>
                                    <option value="custom" <?php selected($from_type, 'custom'); ?>>
                                        📝 Özel E-posta Adresi
                                    </option>
                                </select>
                                <input 
                                    type="email" 
                                    class="oes-input from-custom-input" 
                                    data-type="<?php echo $type; ?>" 
                                    value="<?php echo esc_attr($from_custom); ?>" 
                                    placeholder="egitim@siteniz.com" 
                                    style="display:<?php echo $from_type === 'custom' ? 'block' : 'none'; ?>;"
                                >
                            </div>
                        </div>
                        
                        <!-- Mail Konusu -->
                        <div class="oes-form-group">
                            <label class="oes-label">
                                <span class="oes-label-text">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="12" y1="5" x2="12" y2="19"/>
                                        <polyline points="19 12 12 19 5 12"/>
                                    </svg>
                                    Mail Konusu
                                </span>
                                <span class="oes-label-desc">Kullanılabilir değişkenler: <code><?php echo $config['vars']; ?></code></span>
                            </label>
                            <input 
                                type="text" 
                                class="oes-input mail-subject" 
                                data-type="<?php echo $type; ?>" 
                                value="<?php echo esc_attr($subject); ?>" 
                                placeholder="<?php echo esc_attr($config['default_subject']); ?>"
                            >
                        </div>
                        
                        <!-- Alıcı Bilgisi -->
                        <div class="oes-info-box">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="16" x2="12" y2="12"/>
                                <line x1="12" y1="8" x2="12.01" y2="8"/>
                            </svg>
                            <div>
                                <strong>Alıcı:</strong> <?php echo $config['to']; ?>
                                <?php if ($config['to'] === 'Admin'): ?>
                                    <span class="oes-info-badge">Yukarıdaki admin e-posta adreslerine gönderilir</span>
                                <?php endif; ?>
                            </div>
                        </div>
                        
                        <!-- Aksiyon Butonları -->
                        <div class="oes-card-actions">
                            <button type="button" class="oes-btn oes-btn-secondary preview-btn" data-type="<?php echo $type; ?>">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                                    <circle cx="12" cy="12" r="3"/>
                                </svg>
                                Önizle
                            </button>
                            <button type="button" class="oes-btn oes-btn-secondary test-btn" data-type="<?php echo $type; ?>">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                                    <polyline points="22 4 12 14.01 9 11.01"/>
                                </svg>
                                Test Mail Gönder
                            </button>
                        </div>
                        
                    </div>
                </div>
                
                <?php endforeach; ?>
                
            </div>
        </div>
        
        <!-- Yardım Bölümü -->
        <div class="oes-mail-section oes-help-section">
            <div class="oes-section-header">
                <h2>💡 Yardım & İpuçları</h2>
            </div>
            <div class="oes-section-body">
                <div class="oes-help-grid">
                    <div class="oes-help-item">
                        <h4>🎯 Gönderen Adresi Seçimi</h4>
                        <p>Her mail türü için farklı gönderen adresi kullanabilirsiniz. Örneğin görevler için "gorevler@site.com", sorular için "destek@site.com" gibi.</p>
                    </div>
                    <div class="oes-help-item">
                        <h4>📝 Değişken Kullanımı</h4>
                        <p>Mail konularında süslü parantez içinde değişkenler kullanabilirsiniz. Örnek: <code>[{site}] {student} yeni görev teslim etti</code></p>
                    </div>
                    <div class="oes-help-item">
                        <h4>✉️ Admin E-postaları</h4>
                        <p>Virgülle ayırarak birden fazla admin e-postası ekleyebilirsiniz. Tüm sistem bildirimleri bu adreslere gönderilir.</p>
                    </div>
                    <div class="oes-help-item">
                        <h4>🧪 Test Maili</h4>
                        <p>Ayarları kaydetmeden önce "Test Mail Gönder" butonuyla mailin nasıl görüneceğini test edebilirsiniz.</p>
                    </div>
                </div>
            </div>
        </div>
        
    </div>
</div>

<!-- Test Mail Modal -->
<div id="testMailModal" class="oes-modal" style="display:none;">
    <div class="oes-modal-overlay"></div>
    <div class="oes-modal-content">
        <div class="oes-modal-header">
            <h3>Test Mail Gönder</h3>
            <button type="button" class="oes-modal-close">&times;</button>
        </div>
        <div class="oes-modal-body">
            <p>Test mailinin gönderileceği e-posta adresini girin:</p>
            <input type="email" id="testEmail" class="oes-input" placeholder="test@example.com" value="<?php echo esc_attr(get_option('admin_email')); ?>">
        </div>
        <div class="oes-modal-footer">
            <button type="button" class="oes-btn oes-btn-secondary" id="cancelTestMail">İptal</button>
            <button type="button" class="oes-btn oes-btn-primary" id="sendTestMail">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="22" y1="2" x2="11" y2="13"/>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Gönder
            </button>
        </div>
    </div>
</div>

<!-- Preview Modal -->
<div id="previewModal" class="oes-modal oes-modal-large" style="display:none;">
    <div class="oes-modal-overlay"></div>
    <div class="oes-modal-content">
        <div class="oes-modal-header">
            <h3>Mail Önizleme</h3>
            <button type="button" class="oes-modal-close">&times;</button>
        </div>
        <div class="oes-modal-body" id="previewContent">
            <div class="oes-loading">Yükleniyor...</div>
        </div>
    </div>
</div>