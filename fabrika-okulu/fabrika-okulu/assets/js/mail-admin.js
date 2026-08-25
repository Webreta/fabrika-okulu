/**
 * OES Mail Yönetim Sistemi - Admin JavaScript
 */

(function($) {
    'use strict';
    
    let currentTestType = '';
    
    $(document).ready(function() {
        
        // Toggle switches
        $('.mail-toggle').on('change', function() {
            const type = $(this).data('type');
            const card = $(this).closest('.oes-mail-card');
            
            if ($(this).is(':checked')) {
                card.addClass('active');
            } else {
                card.removeClass('active');
            }
        });
        
        // From type select değişimi
        $('.from-type-select').on('change', function() {
            const type = $(this).data('type');
            const customInput = $('.from-custom-input[data-type="' + type + '"]');
            
            if ($(this).val() === 'custom') {
                customInput.slideDown(200);
            } else {
                customInput.slideUp(200);
            }
        });
        
        // Tümünü kaydet butonu
        $('#saveAllSettings').on('click', function() {
            const button = $(this);
            const originalHtml = button.html();
            
            button.prop('disabled', true).html('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Kaydediliyor...');
            
            const settings = collectSettings();
            
            $.ajax({
                url: oesMailAdmin.ajaxurl,
                type: 'POST',
                data: {
                    action: 'oes_save_mail_settings',
                    nonce: oesMailAdmin.nonce,
                    settings: JSON.stringify(settings)
                },
                success: function(response) {
                    if (response.success) {
                        showMessage('success', response.data);
                    } else {
                        showMessage('error', response.data || 'Bir hata oluştu');
                    }
                },
                error: function() {
                    showMessage('error', 'Sunucu hatası oluştu');
                },
                complete: function() {
                    button.prop('disabled', false).html(originalHtml);
                }
            });
        });
        
        // Test mail butonu
        $('.test-btn').on('click', function() {
            currentTestType = $(this).data('type');
            $('#testMailModal').fadeIn(200);
            $('#testEmail').focus();
        });
        
        // Test mail modalını kapat
        $('#cancelTestMail, #testMailModal .oes-modal-close').on('click', function() {
            $('#testMailModal').fadeOut(200);
        });
        
        // Modal overlay tıklama
        $('#testMailModal .oes-modal-overlay, #previewModal .oes-modal-overlay').on('click', function() {
            $(this).closest('.oes-modal').fadeOut(200);
        });
        
        // Test mail gönder
        $('#sendTestMail').on('click', function() {
            const email = $('#testEmail').val().trim();
            
            if (!email) {
                showMessage('error', 'E-posta adresi girin');
                return;
            }
            
            if (!isValidEmail(email)) {
                showMessage('error', 'Geçerli bir e-posta adresi girin');
                return;
            }
            
            const button = $(this);
            const originalHtml = button.html();
            
            button.prop('disabled', true).html('<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Gönderiliyor...');
            
            $.ajax({
                url: oesMailAdmin.ajaxurl,
                type: 'POST',
                data: {
                    action: 'oes_test_single_mail',
                    nonce: oesMailAdmin.nonce,
                    type: currentTestType,
                    email: email
                },
                success: function(response) {
                    if (response.success) {
                        showMessage('success', response.data);
                        $('#testMailModal').fadeOut(200);
                    } else {
                        showMessage('error', response.data || 'Mail gönderilemedi');
                    }
                },
                error: function() {
                    showMessage('error', 'Sunucu hatası oluştu');
                },
                complete: function() {
                    button.prop('disabled', false).html(originalHtml);
                }
            });
        });
        
        // Enter tuşu ile test mail gönder
        $('#testEmail').on('keypress', function(e) {
            if (e.which === 13) {
                $('#sendTestMail').click();
            }
        });
        
        // Önizleme butonu
        $('.preview-btn').on('click', function() {
            const type = $(this).data('type');
            
            $('#previewModal').fadeIn(200);
            $('#previewContent').html('<div class="oes-loading">Yükleniyor...</div>');
            
            $.ajax({
                url: oesMailAdmin.ajaxurl,
                type: 'POST',
                data: {
                    action: 'oes_preview_template',
                    nonce: oesMailAdmin.nonce,
                    type: type
                },
                success: function(response) {
                    if (response.success) {
                        $('#previewContent').html(response.data.html);
                    } else {
                        $('#previewContent').html('<p style="color:#ef4444;">Önizleme yüklenemedi</p>');
                    }
                },
                error: function() {
                    $('#previewContent').html('<p style="color:#ef4444;">Sunucu hatası oluştu</p>');
                }
            });
        });
        
        // Preview modalını kapat
        $('#previewModal .oes-modal-close').on('click', function() {
            $('#previewModal').fadeOut(200);
        });
        
    });
    
    /**
     * Tüm ayarları topla
     */
    function collectSettings() {
        const settings = {
            admin_emails: $('#admin_emails').val().trim(),
            notifications: {}
        };
        
        $('.oes-mail-card').each(function() {
            const type = $(this).data('type');
            const enabled = $(this).find('.mail-toggle').is(':checked');
            const subject = $(this).find('.mail-subject').val().trim();
            const fromType = $(this).find('.from-type-select').val();
            const fromCustom = $(this).find('.from-custom-input').val().trim();
            
            settings.notifications[type] = {
                enabled: enabled,
                subject: subject,
                from_type: fromType,
                from_custom: fromCustom
            };
        });
        
        return settings;
    }
    
    /**
     * Email validasyonu
     */
    function isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    }
    
    /**
     * Mesaj göster
     */
    function showMessage(type, text) {
        const message = $('<div>')
            .addClass('oes-message')
            .addClass(type)
            .html(getMessageIcon(type) + ' ' + text);
        
        $('body').append(message);
        
        setTimeout(function() {
            message.fadeOut(300, function() {
                $(this).remove();
            });
        }, 3000);
    }
    
    /**
     * Mesaj ikonu
     */
    function getMessageIcon(type) {
        const icons = {
            success: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            info: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };
        return icons[type] || icons.info;
    }
    
})(jQuery);