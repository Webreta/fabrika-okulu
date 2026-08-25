/**
 * Online Eğitim Sistemi - Frontend JS
 */

(function($) {
    'use strict';

    // Accordion
    $(document).on('click', '.oes-accordion-header', function(e) {
        e.preventDefault();
        
        var $item = $(this).closest('.oes-accordion-item');
        var $content = $item.find('.oes-accordion-content');
        
        if ($item.hasClass('oes-open')) {
            $item.removeClass('oes-open');
            $content.slideUp(300);
        } else {
            $item.addClass('oes-open');
            $content.slideDown(300);
        }
    });

    // Video Play Overlay
    $(document).on('click', '.oes-play-overlay', function(e) {
        var $wrapper = $(this).closest('.oes-video-wrapper');
        var $iframe = $wrapper.find('iframe');
        
        if ($iframe.length) {
            var src = $iframe.attr('src');
            if (src.indexOf('autoplay=1') === -1) {
                src += (src.indexOf('?') > -1 ? '&' : '?') + 'autoplay=1';
                $iframe.attr('src', src);
            }
        }
        
        $(this).fadeOut(300);
    });

    // Smooth scroll for anchor links
    $(document).on('click', 'a[href^="#"]', function(e) {
        var target = $(this.getAttribute('href'));
        if (target.length) {
            e.preventDefault();
            $('html, body').animate({
                scrollTop: target.offset().top - 100
            }, 500);
        }
    });

    // Sticky sidebar intersection observer
    if ('IntersectionObserver' in window) {
        var sidebar = document.querySelector('.oes-sidebar');
        if (sidebar) {
            var observer = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    if (!entry.isIntersecting) {
                        sidebar.classList.add('oes-sticky-active');
                    } else {
                        sidebar.classList.remove('oes-sticky-active');
                    }
                });
            }, { threshold: 0 });
            
            var hero = document.querySelector('.oes-hero');
            if (hero) {
                observer.observe(hero);
            }
        }
    }

})(jQuery);
