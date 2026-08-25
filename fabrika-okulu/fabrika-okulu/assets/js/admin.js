/**
 * Online Eğitim Sistemi - Admin JS
 */

(function ($) {
    'use strict';

    var OESAdmin = {
        init: function () {
            this.bindEvents();
            this.initSortable();
            this.initMediaUploader();
        },

        bindEvents: function () {
            // Kurs checkbox toggle
            $(document).on('change', '#_oes_is_course', this.toggleCourseFields);

            // Button type toggle
            $(document).on('change', '#_oes_button_type', this.toggleWhatsappFields);

            // Kazanım ekle
            $(document).on('click', '.oes-add-outcome', this.addOutcome);

            // Özellik ekle
            $(document).on('click', '.oes-add-feature', this.addFeature);

            // Bölüm ekle
            $(document).on('click', '.oes-add-section', this.addSection);

            // Ders ekle
            $(document).on('click', '.oes-add-lesson', this.addLesson);

            // Item/section kaldır
            $(document).on('click', '.oes-remove-item, .oes-remove-section, .oes-remove-lesson', this.removeItem);

            // Section toggle
            $(document).on('click', '.oes-toggle-section', this.toggleSection);
        },

        toggleCourseFields: function () {
            var isChecked = $(this).is(':checked');
            $('.oes-course-fields').toggle(isChecked);
        },

        toggleWhatsappFields: function () {
            var value = $(this).val();
            $('.oes-whatsapp-fields').toggle(value !== 'cart');
        },

        addOutcome: function (e) {
            e.preventDefault();
            var html = '<div class="oes-repeater-item">' +
                '<span class="dashicons dashicons-menu oes-sort-handle"></span>' +
                '<input type="text" name="_oes_course_outcomes[]" placeholder="Kazanım yazın..." class="regular-text">' +
                '<button type="button" class="button oes-remove-item"><span class="dashicons dashicons-trash"></span></button>' +
                '</div>';
            $('#oes-outcomes-wrapper').append(html);
        },

        addFeature: function (e) {
            e.preventDefault();
            var html = '<div class="oes-repeater-item">' +
                '<input type="text" name="_oes_course_features[icon][]" placeholder="İkon (dashicons-...)" style="width: 30%;">' +
                '<input type="text" name="_oes_course_features[text][]" placeholder="Özellik metni" style="width: 60%;">' +
                '<button type="button" class="button oes-remove-item">&times;</button>' +
                '</div>';
            $('#oes-features-wrapper').append(html);
        },

        addSection: function (e) {
            e.preventDefault();
            var index = Date.now();
            var html = '<div class="oes-curriculum-section" data-section="' + index + '">' +
                '<div class="oes-section-header">' +
                '<span class="dashicons dashicons-menu oes-sort-handle"></span>' +
                '<input type="text" name="_oes_course_curriculum[' + index + '][title]" placeholder="Bölüm Başlığı" class="oes-section-title-input">' +
                '<button type="button" class="button oes-toggle-section"><span class="dashicons dashicons-arrow-down-alt2"></span></button>' +
                '<button type="button" class="button oes-remove-section"><span class="dashicons dashicons-trash"></span></button>' +
                '</div>' +
                '<div class="oes-section-lessons">' +
                '<button type="button" class="button oes-add-lesson"><span class="dashicons dashicons-plus-alt2"></span> Ders Ekle</button>' +
                '</div>' +
                '</div>';
            $('#oes-curriculum-wrapper').append(html);
            OESAdmin.initSortable();
        },

        addLesson: function (e) {
            e.preventDefault();
            var $section = $(this).closest('.oes-curriculum-section');
            var sectionIndex = $section.data('section');
            var lessonIndex = Date.now();

            var html = '<div class="oes-lesson-item">' +
                '<span class="dashicons dashicons-menu oes-sort-handle"></span>' +
                '<input type="text" name="_oes_course_curriculum[' + sectionIndex + '][lessons][' + lessonIndex + '][title]" placeholder="Ders Adı" class="oes-lesson-title-input">' +
                '<input type="text" name="_oes_course_curriculum[' + sectionIndex + '][lessons][' + lessonIndex + '][duration]" placeholder="Süre" class="oes-lesson-duration-input">' +
                '<input type="url" name="_oes_course_curriculum[' + sectionIndex + '][lessons][' + lessonIndex + '][video_url]" placeholder="Video URL (YouTube/Vimeo)" class="oes-lesson-video-input">' +
                '<label class="oes-preview-label"><input type="checkbox" name="_oes_course_curriculum[' + sectionIndex + '][lessons][' + lessonIndex + '][preview]" value="1"> Önizleme</label>' +
                '<button type="button" class="button oes-remove-lesson"><span class="dashicons dashicons-trash"></span></button>' +
                '</div>';

            $(this).before(html);
            OESAdmin.initSortable();
        },

        removeItem: function (e) {
            e.preventDefault();
            $(this).closest('.oes-repeater-item, .oes-curriculum-section, .oes-lesson-item').remove();
        },

        toggleSection: function (e) {
            e.preventDefault();
            var $section = $(this).closest('.oes-curriculum-section');
            $section.find('.oes-section-lessons').slideToggle(200);
            $(this).find('.dashicons').toggleClass('dashicons-arrow-down-alt2 dashicons-arrow-up-alt2');
        },

        initSortable: function () {
            if ($.fn.sortable) {
                $('#oes-curriculum-wrapper').sortable({
                    items: '.oes-curriculum-section',
                    handle: '.oes-section-header .oes-sort-handle',
                    placeholder: 'oes-sortable-placeholder',
                    update: function () {
                        OESAdmin.updateCurriculumIndexes();
                    }
                });

                $('.oes-section-lessons').sortable({
                    items: '.oes-lesson-item',
                    handle: '.oes-sort-handle',
                    placeholder: 'oes-sortable-placeholder',
                    connectWith: '.oes-section-lessons'
                });
            }
        },

        updateCurriculumIndexes: function () {
            // Index'leri güncelle (gerekirse)
        },

        initMediaUploader: function () {
            var frame;

            $(document).on('click', '.oes-upload-image', function (e) {
                e.preventDefault();

                var $button = $(this);
                var $wrapper = $button.closest('.oes-image-upload-wrapper');
                var $input = $wrapper.find('input[type="hidden"]');

                if (frame) {
                    frame.open();
                    return;
                }

                frame = wp.media({
                    title: 'Fotoğraf Seç',
                    button: { text: 'Seç' },
                    multiple: false
                });

                frame.on('select', function () {
                    var attachment = frame.state().get('selection').first().toJSON();
                    $input.val(attachment.id);
                    $wrapper.find('.oes-preview-image').remove();
                    $wrapper.append('<img src="' + attachment.sizes.thumbnail.url + '" class="oes-preview-image" style="max-width: 100px; display: block; margin-top: 10px;">');
                    $wrapper.find('.oes-remove-image').show();
                });

                frame.open();
            });

            $(document).on('click', '.oes-remove-image', function (e) {
                e.preventDefault();
                var $wrapper = $(this).closest('.oes-image-upload-wrapper');
                $wrapper.find('input[type="hidden"]').val('');
                $wrapper.find('.oes-preview-image').remove();
                $(this).hide();
            });
        }
    };

    $(document).ready(function () {
        OESAdmin.init();

        // Sayfa yüklendiğinde mevcut durumları kontrol et
        if ($('#_oes_is_course').is(':checked')) {
            $('.oes-course-fields').show();
        }

        if ($('#_oes_button_type').val() !== 'cart') {
            $('.oes-whatsapp-fields').show();
        }

        // Global: Tüm admin butonlarına loading state ekle
        $(document).ajaxSend(function (event, xhr, settings) {
            // Buton bulup loading yap
            var $btn = $('button:focus, .oes-btn:focus, input[type="submit"]:focus');
            if ($btn.length && !$btn.hasClass('oes-loading')) {
                $btn.addClass('oes-loading').data('original-text', $btn.html());
                $btn.html('<span class="oes-spinner"></span> İşleniyor...');
                $btn.prop('disabled', true);
            }
        });

        $(document).ajaxComplete(function (event, xhr, settings) {
            // Loading kaldır
            $('.oes-loading').each(function () {
                var $btn = $(this);
                $btn.html($btn.data('original-text'));
                $btn.removeClass('oes-loading').prop('disabled', false);
            });
        });
    });

})(jQuery);

// Loading CSS (inline)
(function () {
    var style = document.createElement('style');
    style.textContent = '.oes-spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:oes-spin .8s linear infinite;margin-right:6px;vertical-align:middle}@keyframes oes-spin{to{transform:rotate(360deg)}}.oes-loading{opacity:.8;cursor:wait!important}';
    document.head.appendChild(style);
})();