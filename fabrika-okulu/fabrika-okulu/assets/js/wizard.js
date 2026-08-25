/* OES Setup Wizard JS */
(function($) {
    'use strict';

    // Adım geçişi
    function goToStep(step) {
        $('.oes-wiz-panel').removeClass('active');
        $('#step-' + step).addClass('active');

        $('.oes-wiz-step').each(function() {
            var s = parseInt($(this).data('step'));
            $(this).removeClass('active done');
            if (s < step)  $(this).addClass('done');
            if (s === step) $(this).addClass('active');
        });

        // Smooth scroll to top
        $('html, body').animate({ scrollTop: 0 }, 300);
    }

    // İleri / geri butonları
    $(document).on('click', '.oes-wiz-next', function() {
        goToStep($(this).data('next'));
    });

    $(document).on('click', '.oes-wiz-prev', function() {
        goToStep($(this).data('prev'));
    });

    // Modül kartı tıklama (toggle)
    $(document).on('click', '.oes-module-card', function() {
        var $card = $(this);
        var id    = $card.data('id');
        var req   = $card.data('requires') ? $card.data('requires').split(',') : [];

        if ($card.hasClass('selected')) {
            // Pasife al — başka modül bunu gerektiriyor mu?
            var blocked = false;
            $('.oes-module-card.selected').each(function() {
                var otherReq = $(this).data('requires') ? $(this).data('requires').split(',') : [];
                if (otherReq.indexOf(id) !== -1 && $(this).data('id') !== id) {
                    blocked = true;
                }
            });

            if (blocked) {
                showToast('Bu modülü kaldırmak için önce bağımlı modülleri devre dışı bırakın.', 'warn');
                return;
            }
            $card.removeClass('selected');
        } else {
            // Aktife al — gereksinimleri karşılanıyor mu?
            var missing = [];
            req.forEach(function(r) {
                if (!$('.oes-module-card[data-id="' + r + '"]').hasClass('selected')) {
                    missing.push($('.oes-module-card[data-id="' + r + '"]').find('h4').text());
                }
            });

            if (missing.length) {
                // Eksik bağımlılıkları otomatik seç
                req.forEach(function(r) {
                    $('.oes-module-card[data-id="' + r + '"]').addClass('selected');
                });
                showToast('Gerekli modüller de otomatik seçildi: ' + missing.join(', '), 'info');
            }
            $card.addClass('selected');
        }
    });

    // Wizard kaydet
    $('#oesWizSave').on('click', function() {
        var $btn  = $(this);
        var selected = [];

        $('.oes-module-card.selected').each(function() {
            selected.push($(this).data('id'));
        });

        $btn.find('.oes-btn-text').hide();
        $btn.find('.oes-btn-loading').show();
        $btn.find('.oes-btn-icon').hide();
        $btn.prop('disabled', true);

        $.post(oesWizard.ajaxUrl, {
            action  : 'oes_save_wizard',
            nonce   : oesWizard.nonce,
            modules : selected
        }, function(res) {
            $btn.find('.oes-btn-text').show();
            $btn.find('.oes-btn-loading').hide();
            $btn.find('.oes-btn-icon').show();
            $btn.prop('disabled', false);

            if (res.success) {
                // Başarı: aktif modül etiketlerini göster
                var $cont = $('#oesSuccessModules').empty();
                if (res.data.modules.length === 0) {
                    $cont.append('<p style="color:#6b7280">Hiç modül seçilmedi. Yalnızca çekirdek sistem aktif.</p>');
                } else {
                    res.data.modules.forEach(function(m) {
                        $cont.append(
                            '<span class="oes-success-tag">' +
                            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1E4D7B" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
                            m + '</span>'
                        );
                    });
                }

                // Bağımlılık uyarıları
                if (res.data.errors && res.data.errors.length) {
                    res.data.errors.forEach(function(e) { showToast(e, 'warn'); });
                }

                goToStep(3);
            } else {
                showToast('Bir hata oluştu, tekrar deneyin.', 'error');
            }
        }).fail(function() {
            $btn.prop('disabled', false);
            showToast('Sunucu bağlantı hatası.', 'error');
        });
    });

    // Modül ayarları sayfası — toggle davranışı
    $(document).on('change', '.oes-mcs-label input[type="checkbox"]', function() {
        var $card = $(this).closest('.oes-module-card-settings');
        if ($(this).is(':checked')) {
            $card.addClass('active');
        } else {
            $card.removeClass('active');
        }
    });

    // Toast mesaj
    function showToast(msg, type) {
        var colors = { info: '#5DB9E8', warn: '#f59e0b', error: '#ef4444', success: '#10b981' };
        var $t = $('<div>')
            .css({
                position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999,
                background: colors[type] || '#1E4D7B', color: '#fff',
                padding: '12px 20px', borderRadius: '10px',
                fontSize: '14px', boxShadow: '0 4px 16px rgba(0,0,0,.2)',
                maxWidth: '340px', lineHeight: '1.5',
            })
            .text(msg)
            .appendTo('body');

        setTimeout(function() { $t.fadeOut(400, function() { $t.remove(); }); }, 4000);
    }

})(jQuery);