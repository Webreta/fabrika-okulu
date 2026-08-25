/**
 * Course Page Scripts
 * Kurs tanıtım sayfası JavaScript
 */

(function () {
    'use strict';

    // DOM hazır olduğunda çalıştır
    function init() {
        initAccordion();
    }

    // Accordion işlevselliği
    function initAccordion() {
        var headers = document.querySelectorAll('.oes-accordion-header');

        for (var i = 0; i < headers.length; i++) {
            headers[i].addEventListener('click', function (e) {
                e.preventDefault();
                var item = this.parentElement;
                if (item && item.classList) {
                    item.classList.toggle('oes-open');
                }
            });
        }
    }

    // Sayfa yüklendiğinde başlat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();