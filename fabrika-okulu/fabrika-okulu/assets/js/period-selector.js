/**
 * Dönem Seçici JavaScript
 */
(function() {
    'use strict';
    
    // Lightbox'ı body'ye taşı (mobil uyumluluk için)
    var lb = document.getElementById('oesPeriodLB');
    if (lb && lb.parentNode !== document.body) {
        document.body.appendChild(lb);
    }
    
    if (!lb) return;
    
    // Elements
    var trigger = document.getElementById('oesPeriodTrigger');
    var mobileTrigger = document.getElementById('oesMobilePeriodBtn');
    var input = document.getElementById('oes_period_input');
    var label = document.getElementById('oesPeriodLabel');
    var mobileLabel = document.getElementById('oesMobilePeriodText');
    var okBtn = document.getElementById('oesLBOk');
    var calList = document.getElementById('oesCalList');
    var calEmpty = document.getElementById('oesCalEmpty');
    
    var selected = null;
    var months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    
    // Lightbox Aç
    function openLB() {
        lb.classList.add('open');
        document.body.style.overflow = 'hidden';
    }
    
    // Lightbox Kapat
    function closeLB() {
        lb.classList.remove('open');
        document.body.style.overflow = '';
    }
    
    // Takvimi Göster
    function showSchedule(idx) {
        if (typeof oesPeriodsData === 'undefined') return;
        
        var data = oesPeriodsData[idx];
        
        if (!data || !data.schedule || !data.schedule.length) {
            if (calEmpty) {
                calEmpty.style.display = 'flex';
                var p = calEmpty.querySelector('p');
                if (p) p.textContent = 'Bu dönemde etkinlik yok';
            }
            if (calList) calList.classList.remove('show');
            return;
        }
        
        if (calEmpty) calEmpty.style.display = 'none';
        
        var html = '';
        data.schedule.forEach(function(s) {
            var d = new Date(s.date);
            html += '<div class="oes-cal-item">';
            html += '<div class="oes-cal-date"><b>' + d.getDate() + '</b><small>' + months[d.getMonth()] + '</small></div>';
            html += '<div class="oes-cal-info"><strong>' + escapeHtml(s.title) + '</strong>';
            if (s.time) html += '<span>🕐 ' + escapeHtml(s.time) + '</span>';
            html += '</div></div>';
        });
        
        if (calList) {
            calList.innerHTML = html;
            calList.classList.add('show');
        }
    }
    
    // HTML Escape
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Seçimi Onayla
    function confirmSelection() {
        if (!selected) return;
        
        // Ana input
        if (input) input.value = selected.id;
        
        // Desktop label & trigger
        if (label) label.textContent = selected.name;
        if (trigger) trigger.classList.add('selected');
        
        // Mobile trigger
        if (mobileTrigger) mobileTrigger.classList.add('selected');
        
        // Mobile label - dönem adını göster
        if (mobileLabel) mobileLabel.textContent = selected.name;
        
        // Tüm sync inputları güncelle
        document.querySelectorAll('.oes-period-sync').forEach(function(i) {
            i.value = selected.id;
        });
        
        closeLB();
    }
    
    // Desktop Trigger
    if (trigger) {
        trigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openLB();
        });
    }
    
    // Mobile Trigger
    if (mobileTrigger) {
        mobileTrigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openLB();
        });
    }
    
    // Close buttons
    var closeBtn = document.getElementById('oesLBClose');
    var cancelBtn = document.getElementById('oesLBCancel');
    
    if (closeBtn) closeBtn.addEventListener('click', closeLB);
    if (cancelBtn) cancelBtn.addEventListener('click', closeLB);
    
    // Backdrop click
    lb.addEventListener('click', function(e) {
        if (e.target === lb) closeLB();
    });
    
    // Dönem Seçimi
    document.querySelectorAll('.oes-lb-period:not(.disabled)').forEach(function(el) {
        el.addEventListener('click', function() {
            document.querySelectorAll('.oes-lb-period').forEach(function(p) {
                p.classList.remove('active');
            });
            el.classList.add('active');
            
            selected = {
                id: el.dataset.id,
                name: el.dataset.name,
                idx: parseInt(el.dataset.idx)
            };
            
            if (okBtn) okBtn.disabled = false;
            showSchedule(selected.idx);
        });
    });
    
    if (okBtn) {
        okBtn.addEventListener('click', confirmSelection);
    }
    
    // Dönem seçili mi kontrol et
    function isPeriodSelected() {
        // Ana input kontrol
        if (input && input.value) return true;
        // Sync inputları kontrol
        var syncs = document.querySelectorAll('.oes-period-sync');
        for (var i = 0; i < syncs.length; i++) {
            if (syncs[i].value) return true;
        }
        return false;
    }
    
    // Form Submit Kontrolü - Desktop
    if (trigger) {
        var form = trigger.closest('form');
        if (form) {
            form.addEventListener('submit', function(e) {
                if (!isPeriodSelected()) {
                    e.preventDefault();
                    e.stopPropagation();
                    openLB();
                    return false;
                }
            });
        }
    }
    
    // Form Submit Kontrolü - Mobile
    document.querySelectorAll('.oes-mobile-cart-form').forEach(function(f) {
        f.addEventListener('submit', function(e) {
            if (!isPeriodSelected()) {
                e.preventDefault();
                e.stopPropagation();
                openLB();
                return false;
            }
        });
    });
    
    // Keyboard ESC ile kapat
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && lb.classList.contains('open')) {
            closeLB();
        }
    });
    
})();