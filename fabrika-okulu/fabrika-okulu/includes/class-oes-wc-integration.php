<?php
/**
 * WooCommerce Entegrasyonu - Modern Tasarım
 * Ürün sayfasına kurs bilgileri ekleme
 */

if (!defined('ABSPATH')) exit;

class OES_WC_Integration {

    public function __construct() {
        add_filter('woocommerce_product_data_tabs', array($this, 'add_course_tab'));
        add_action('woocommerce_product_data_panels', array($this, 'add_course_panel'));
        add_action('add_meta_boxes', array($this, 'add_course_metaboxes'));
        add_action('woocommerce_process_product_meta', array($this, 'save_course_data'));
        // Sipariş tamamlandığında veya işleme alındığında kursa kayıt yap (on_order_completed ile senkron)
        add_action('woocommerce_order_status_completed', array($this, 'enroll_student_on_purchase'));
        add_action('woocommerce_order_status_processing', array($this, 'enroll_student_on_purchase'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
        
        // Ücretsiz kurslar için WooCommerce ayarları
        add_filter('woocommerce_is_purchasable', array($this, 'make_free_course_purchasable'), 10, 2);
        add_filter('woocommerce_product_is_in_stock', array($this, 'free_course_in_stock'), 10, 2);
        add_action('wp', array($this, 'hide_free_course_notices'));
        
        // Ücretsiz kurs siparişlerini otomatik tamamla
        // Kayıt "hazırlanıyor" durumunda da oluştuğu için önbellek orada da tazelenmeli
        add_action('woocommerce_order_status_processing', array($this, 'clear_course_cache_for_order'));

        // Adetli alım KAPALI: her üründen sepete yalnızca 1 adet.
        // (Eğitim satıyoruz; aynı eğitimi 2 kez almak anlamsız ve erişim zaten
        //  kullanıcı bazında tanımlanıyor.) Ürün bazında ayar aramaz — geneldir.
        add_filter('woocommerce_is_sold_individually', array($this, 'force_single_quantity'), 99, 2);
        add_filter('woocommerce_quantity_input_args', array($this, 'force_quantity_args'), 99, 2);
        add_filter('woocommerce_loop_add_to_cart_args', array($this, 'force_loop_quantity'), 99, 2);
    }

    /**
     * Tüm ürünlerde "tek başına satılır" → adet kutusu görünmez, sepette 1'de kalır.
     * Filtreyle geri açılabilir: add_filter('fabo_sold_individually','__return_false');
     */
    public function force_single_quantity($sold_individually, $product) {
        return (bool) apply_filters('fabo_sold_individually', true, $product);
    }

    /** Adet girişi bir yerde yine de basılırsa 1'e sabitle. */
    public function force_quantity_args($args, $product) {
        if (!apply_filters('fabo_sold_individually', true, $product)) return $args;
        $args['min_value']   = 1;
        $args['max_value']   = 1;
        $args['input_value'] = 1;
        return $args;
    }

    /** Katalogdaki "Sepete ekle" butonu da 1 adet göndersin. */
    public function force_loop_quantity($args, $product) {
        if (!apply_filters('fabo_sold_individually', true, $product)) return $args;
        $args['quantity'] = 1;
        return $args;
    }

    /**
     * NOT: Bu eklenti sipariş DURUMUNU DEĞİŞTİRMEZ.
     * Eskiden kurs siparişleri otomatik "Tamamlandı" yapılıyordu; bu kaldırıldı —
     * sipariş durumu tamamen WooCommerce'in / yöneticinin kontrolündedir
     * (ör. "Ödemesi alınanları tamamlandı işaretle" ayarı).
     *
     * Kursa erişim durumdan bağımsızdır: kayıt hem 'processing' hem 'completed'
     * geçişinde oes_enrollments'a yazılır (enroll_student_on_purchase) ve erişim
     * OES_My_Account::get_user_completed_courses tarafından o tablodan da okunur.
     */
    public function clear_course_cache_for_order($order_id) {
        $order = wc_get_order($order_id);
        if ($order && $order->get_user_id()) {
            delete_transient('oes_user_courses_' . $order->get_user_id());
        }
    }
    
    /**
     * Ücretsiz kursları satın alınabilir yap
     */
    public function make_free_course_purchasable($purchasable, $product) {
        if (get_post_meta($product->get_id(), '_oes_is_free_course', true) === 'yes') {
            // Stok "yok" olarak işaretlendiyse satın alınamaz (süresi bitti)
            if ($product->get_stock_status() === 'outofstock') {
                return false;
            }
            return true;
        }
        return $purchasable;
    }
    
    /**
     * Ücretsiz kursları stokta göster (ancak manuel "stokta yok" işaretine saygı duy)
     */
    public function free_course_in_stock($in_stock, $product) {
        if (get_post_meta($product->get_id(), '_oes_is_free_course', true) === 'yes') {
            // Admin stok durumunu "yok" yaptıysa kaydı kapat, aksi halde stokta göster
            return $product->get_stock_status() !== 'outofstock';
        }
        return $in_stock;
    }
    
    /**
     * Ücretsiz kurs sayfasında WooCommerce uyarılarını gizle
     */
    public function hide_free_course_notices() {
        if (is_product()) {
            $product = wc_get_product(get_the_ID());
            if ($product && get_post_meta($product->get_id(), '_oes_is_free_course', true) === 'yes') {
                // WooCommerce notices'ı kaldır
                remove_action('woocommerce_single_product_summary', 'woocommerce_template_single_add_to_cart', 30);
            }
        }
    }

    public function enqueue_admin_scripts($hook) {
        if ($hook === 'post.php' || $hook === 'post-new.php') {
            global $post;
            if ($post && $post->post_type === 'product') {
                wp_enqueue_media();
            }
        }
    }

    public function add_course_tab($tabs) {
        $tabs['oes_course'] = array(
            'label' => 'Kurs Ayarları',
            'target' => 'oes_course_data',
            'class' => array('show_if_simple', 'show_if_variable'),
            'priority' => 25,
        );
        return $tabs;
    }

    public function add_course_panel() {
        global $post;
        $is_course = get_post_meta($post->ID, '_oes_is_course', true);
        $is_free = get_post_meta($post->ID, '_oes_is_free_course', true);
        $button_type = get_post_meta($post->ID, '_oes_button_type', true) ?: 'cart';
        ?>
        <div id="oes_course_data" class="panel woocommerce_options_panel">
            <div class="options_group">
                <?php
                woocommerce_wp_checkbox(array(
                    'id' => '_oes_is_course',
                    'label' => 'Bu bir kurstur',
                    'description' => 'İşaretlediğinizde sayfanın altında kurs ayar panelleri görünecektir.',
                    'value' => $is_course,
                ));
                ?>
            </div>
            <div class="options_group oes-course-fields" style="<?php echo $is_course !== 'yes' ? 'display:none;' : ''; ?>">
                <?php
                woocommerce_wp_checkbox(array(
                    'id' => '_oes_is_free_course',
                    'label' => 'Bu kurs ücretsizdir',
                    'description' => 'Ücretsiz kurslar için kullanıcı giriş yapmalı ancak ödeme yapması gerekmez.',
                    'value' => $is_free,
                ));
                woocommerce_wp_select(array(
                    'id' => '_oes_button_type',
                    'label' => 'Buton Tipi',
                    'options' => array('cart' => 'Sepete Ekle', 'whatsapp' => 'WhatsApp\'tan Ulaş', 'both' => 'Her İkisi'),
                    'value' => $button_type,
                ));
                ?>
            </div>
        </div>
        <?php
    }

    public function add_course_metaboxes() {
        global $post;
        if (!$post) return;
        
        $is_course = get_post_meta($post->ID, '_oes_is_course', true);
        if ($is_course !== 'yes') return;

        add_meta_box('oes_course_instructor', '👨‍🏫 Eğitmen', array($this, 'render_instructor_metabox'), 'product', 'normal', 'high');
        add_meta_box('oes_course_features', '📋 Kurs Özellikleri', array($this, 'render_features_metabox'), 'product', 'normal', 'high');
        add_meta_box('oes_course_outcomes', '🎯 Kazanımlar', array($this, 'render_outcomes_metabox'), 'product', 'normal', 'high');
        add_meta_box('oes_course_requirements', '📌 Gereksinimler & Hedef Kitle', array($this, 'render_requirements_metabox'), 'product', 'normal', 'high');
        add_meta_box('oes_course_curriculum', '📚 Müfredat', array($this, 'render_curriculum_metabox'), 'product', 'normal', 'high');
    }

    private function metabox_styles() {
        static $printed = false;
        if ($printed) return;
        $printed = true;
        ?>
        <style>
            .oes-metabox{padding:20px;background:#fff;border-radius:8px}
            .oes-metabox-header{display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}
            .oes-metabox-header h3{margin:0;font-size:16px;color:#1e293b}
            .oes-metabox-header p{margin:0;font-size:13px;color:#64748b}
            
            .oes-form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
            .oes-form-grid.cols-3{grid-template-columns:repeat(3,1fr)}
            .oes-form-grid.cols-1{grid-template-columns:1fr}
            .oes-form-group{margin-bottom:0}
            .oes-form-group label{display:block;font-size:13px;font-weight:500;color:#334155;margin-bottom:6px}
            .oes-form-group input[type="text"],.oes-form-group input[type="url"],.oes-form-group input[type="number"],.oes-form-group select,.oes-form-group textarea{width:100%;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:14px;transition:all .2s}
            .oes-form-group input:focus,.oes-form-group select:focus,.oes-form-group textarea:focus{outline:none;border-color:#10b981;box-shadow:0 0 0 3px rgba(16,185,129,.1)}
            .oes-form-group .oes-help{font-size:11px;color:#94a3b8;margin-top:4px;display:block}
            
            .oes-checkbox-group{display:flex;flex-wrap:wrap;gap:16px}
            .oes-checkbox{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:#334155}
            .oes-checkbox input{width:18px;height:18px;accent-color:#10b981}
            
            .oes-instructor-select{display:flex;gap:16px;align-items:flex-start}
            .oes-instructor-dropdown{flex:1}
            .oes-instructor-dropdown select{width:100%;padding:12px;font-size:14px}
            .oes-instructor-preview{width:200px;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;text-align:center}
            .oes-instructor-preview.empty{color:#94a3b8;font-size:13px}
            .oes-instructor-avatar{width:80px;height:80px;border-radius:50%;margin:0 auto 12px;background:linear-gradient(135deg,#10b981,#059669);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:600;overflow:hidden}
            .oes-instructor-avatar img{width:100%;height:100%;object-fit:cover}
            .oes-instructor-name{font-size:15px;font-weight:600;color:#1e293b;margin-bottom:4px}
            .oes-instructor-title{font-size:12px;color:#64748b}
            .oes-instructor-link{display:inline-block;margin-top:12px;font-size:12px;color:#3b82f6;text-decoration:none}
            .oes-instructor-link:hover{text-decoration:underline}
            
            .oes-outcomes-list{display:flex;flex-direction:column;gap:8px}
            .oes-outcome-item{display:flex;align-items:center;gap:10px}
            .oes-outcome-item input{flex:1}
            .oes-outcome-item .oes-remove-btn{width:32px;height:32px;border:none;background:#fee2e2;color:#dc2626;border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center}
            .oes-outcome-item .oes-remove-btn:hover{background:#fecaca}
            .oes-add-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:13px;cursor:pointer;margin-top:8px}
            .oes-add-btn:hover{background:#e2e8f0;border-color:#94a3b8;color:#334155}
            
            .oes-curriculum-section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:12px;overflow:hidden}
            .oes-section-header{display:flex;align-items:center;gap:10px;padding:12px 16px;background:#fff;border-bottom:1px solid #e2e8f0}
            .oes-section-header .oes-sort-handle{cursor:move;color:#94a3b8}
            .oes-section-header input{flex:1;font-weight:500}
            .oes-section-header button{padding:6px 10px}
            .oes-section-lessons{padding:12px 16px}
            .oes-lesson-item{display:flex;align-items:center;gap:8px;padding:10px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:8px}
            .oes-lesson-item .oes-sort-handle{cursor:move;color:#cbd5e1}
            .oes-lesson-item input[type="text"]{flex:2}
            .oes-lesson-item input[type="url"]{flex:3}
            .oes-lesson-item .oes-lesson-duration-input{width:80px;flex:none}
            .oes-lesson-item .oes-preview-label{font-size:12px;color:#64748b;display:flex;align-items:center;gap:4px;white-space:nowrap}
            .oes-lesson-item .oes-preview-label input{width:14px;height:14px}
            
            @media(max-width:782px){
                .oes-form-grid,.oes-form-grid.cols-3{grid-template-columns:1fr}
                .oes-instructor-select{flex-direction:column}
                .oes-instructor-preview{width:100%}
            }
        </style>
        <?php
    }

    public function render_instructor_metabox($post) {
        $this->metabox_styles();
        global $wpdb;
        
        $instructor_id = get_post_meta($post->ID, '_oes_instructor_id', true);
        $instructors = $wpdb->get_results("SELECT * FROM {$wpdb->prefix}oes_instructors WHERE status = 'active' ORDER BY name");
        $selected = $instructor_id ? $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_instructors WHERE id = %d", $instructor_id)) : null;
        ?>
        <div class="oes-metabox">
            <div class="oes-instructor-select">
                <div class="oes-instructor-dropdown">
                    <div class="oes-form-group">
                        <label>Eğitmen Seçin</label>
                        <select name="_oes_instructor_id" id="oes-instructor-select">
                            <option value="">-- Eğitmen Seçin --</option>
                            <?php foreach ($instructors as $i): ?>
                            <option value="<?php echo $i->id; ?>" 
                                    data-name="<?php echo esc_attr($i->name); ?>"
                                    data-title="<?php echo esc_attr($i->title); ?>"
                                    data-photo="<?php echo esc_attr($i->photo_url); ?>"
                                    <?php selected($instructor_id, $i->id); ?>>
                                <?php echo esc_html($i->name); ?><?php if ($i->title): ?> - <?php echo esc_html($i->title); ?><?php endif; ?>
                            </option>
                            <?php endforeach; ?>
                        </select>
                        <span class="oes-help">Eğitmenler sayfasından yeni eğitmen ekleyebilirsiniz.</span>
                    </div>
                    <a href="<?php echo admin_url('admin.php?page=oes-instructors'); ?>" target="_blank" class="oes-instructor-link">+ Yeni Eğitmen Ekle</a>
                </div>
                <div class="oes-instructor-preview <?php echo !$selected ? 'empty' : ''; ?>" id="oes-instructor-preview">
                    <?php if ($selected): ?>
                        <div class="oes-instructor-avatar">
                            <?php if ($selected->photo_url): ?>
                                <img src="<?php echo esc_url($selected->photo_url); ?>">
                            <?php else: ?>
                                <?php echo strtoupper(substr($selected->name, 0, 1)); ?>
                            <?php endif; ?>
                        </div>
                        <div class="oes-instructor-name"><?php echo esc_html($selected->name); ?></div>
                        <div class="oes-instructor-title"><?php echo esc_html($selected->title); ?></div>
                    <?php else: ?>
                        <p>Eğitmen seçilmedi</p>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <script>
        jQuery(function($){
            $('#oes-instructor-select').on('change', function(){
                var opt = $(this).find(':selected');
                var preview = $('#oes-instructor-preview');
                if (opt.val()) {
                    var name = opt.data('name');
                    var title = opt.data('title') || '';
                    var photo = opt.data('photo');
                    var avatar = photo ? '<img src="'+photo+'">' : name.charAt(0).toUpperCase();
                    preview.removeClass('empty').html(
                        '<div class="oes-instructor-avatar">'+avatar+'</div>'+
                        '<div class="oes-instructor-name">'+name+'</div>'+
                        '<div class="oes-instructor-title">'+title+'</div>'
                    );
                } else {
                    preview.addClass('empty').html('<p>Eğitmen seçilmedi</p>');
                }
            });
        });
        </script>
        <?php
    }

    public function render_features_metabox($post) {
        $this->metabox_styles();
        $duration = get_post_meta($post->ID, '_oes_course_duration', true);
        $lessons = get_post_meta($post->ID, '_oes_course_lessons', true);
        $level = get_post_meta($post->ID, '_oes_course_level', true);
        $language = get_post_meta($post->ID, '_oes_course_language', true);
        $certificate = get_post_meta($post->ID, '_oes_course_certificate', true);
        $lifetime = get_post_meta($post->ID, '_oes_course_lifetime', true);
        $preview_video = get_post_meta($post->ID, '_oes_course_preview_video', true);
        ?>
        <div class="oes-metabox">
            <div class="oes-form-grid cols-3">
                <div class="oes-form-group">
                    <label>Toplam Süre</label>
                    <input type="text" name="_oes_course_duration" value="<?php echo esc_attr($duration); ?>" placeholder="Örn: 12 saat">
                </div>
                <div class="oes-form-group">
                    <label>Ders Sayısı</label>
                    <input type="text" name="_oes_course_lessons" value="<?php echo esc_attr($lessons); ?>" placeholder="Örn: 48 ders">
                </div>
                <div class="oes-form-group">
                    <label>Seviye</label>
                    <select name="_oes_course_level">
                        <option value="">Seçin</option>
                        <option value="beginner" <?php selected($level, 'beginner'); ?>>Başlangıç</option>
                        <option value="intermediate" <?php selected($level, 'intermediate'); ?>>Orta</option>
                        <option value="advanced" <?php selected($level, 'advanced'); ?>>İleri</option>
                        <option value="all" <?php selected($level, 'all'); ?>>Tüm Seviyeler</option>
                    </select>
                </div>
            </div>
            <div class="oes-form-grid" style="margin-top:16px">
                <div class="oes-form-group">
                    <label>Dil</label>
                    <input type="text" name="_oes_course_language" value="<?php echo esc_attr($language); ?>" placeholder="Örn: Türkçe">
                </div>
                <div class="oes-form-group">
                    <label>Önizleme Video URL</label>
                    <input type="url" name="_oes_course_preview_video" value="<?php echo esc_attr($preview_video); ?>" placeholder="YouTube/Vimeo URL">
                </div>
            </div>
            <div class="oes-checkbox-group" style="margin-top:16px">
                <label class="oes-checkbox">
                    <input type="checkbox" name="_oes_course_certificate" value="yes" <?php checked($certificate, 'yes'); ?>>
                    Sertifika Verilecek
                </label>
                <label class="oes-checkbox">
                    <input type="checkbox" name="_oes_course_lifetime" value="yes" <?php checked($lifetime, 'yes'); ?>>
                    Ömür Boyu Erişim
                </label>
            </div>
        </div>
        <?php
    }

    public function render_outcomes_metabox($post) {
        $this->metabox_styles();
        $outcomes = get_post_meta($post->ID, '_oes_course_outcomes', true) ?: array();
        ?>
        <div class="oes-metabox">
            <p style="margin:0 0 12px;color:#64748b;font-size:13px">Bu kursu tamamlayan öğrencilerin elde edeceği kazanımları listeleyin.</p>
            <div class="oes-outcomes-list" id="oes-outcomes-list">
                <?php foreach ($outcomes as $i => $outcome): ?>
                <div class="oes-outcome-item">
                    <input type="text" name="_oes_course_outcomes[]" value="<?php echo esc_attr($outcome); ?>" placeholder="Örn: Python ile web uygulaması geliştirmeyi öğreneceksiniz">
                    <button type="button" class="oes-remove-btn" onclick="this.parentElement.remove()">✕</button>
                </div>
                <?php endforeach; ?>
            </div>
            <button type="button" class="oes-add-btn" onclick="oesAddOutcome()">+ Kazanım Ekle</button>
        </div>
        <script>
        function oesAddOutcome(){
            var html = '<div class="oes-outcome-item"><input type="text" name="_oes_course_outcomes[]" placeholder="Örn: Python ile web uygulaması geliştirmeyi öğreneceksiniz"><button type="button" class="oes-remove-btn" onclick="this.parentElement.remove()">✕</button></div>';
            document.getElementById('oes-outcomes-list').insertAdjacentHTML('beforeend', html);
        }
        </script>
        <?php
    }

    public function render_requirements_metabox($post) {
        $this->metabox_styles();
        $requirements = get_post_meta($post->ID, '_oes_course_requirements', true);
        $target = get_post_meta($post->ID, '_oes_course_target', true);
        ?>
        <div class="oes-metabox">
            <div class="oes-form-grid">
                <div class="oes-form-group">
                    <label>Ön Gereksinimler</label>
                    <textarea name="_oes_course_requirements" rows="4" placeholder="Her satıra bir gereksinim yazın"><?php echo esc_textarea($requirements); ?></textarea>
                    <span class="oes-help">Bu kursa başlamak için gerekli olan bilgi ve beceriler</span>
                </div>
                <div class="oes-form-group">
                    <label>Hedef Kitle</label>
                    <textarea name="_oes_course_target" rows="4" placeholder="Her satıra bir hedef kitle yazın"><?php echo esc_textarea($target); ?></textarea>
                    <span class="oes-help">Bu kurs kimler için uygun?</span>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Müfredat metabox'ı — eğitmen panelindeki TAM editörü gömülü (iframe) gösterir.
     *
     * Böylece wp-admin'de de müfredat, sınav soruları, görevler ve dönem programı
     * eğitmen panelindekiyle BİREBİR aynı ekrandan yönetilir; iki ayrı builder'ın
     * birbirinden sapması ortadan kalkar.
     *
     * Kaydetme iframe içinden AJAX ile yapılır (oes_tp_save_course). Ürün ekranındaki
     * "Güncelle" düğmesi müfredatı EZMEZ: save_course_data müfredatı yalnızca
     * $_POST['_oes_course_curriculum'] gönderildiğinde yazar; bu iframe onu göndermez.
     */
    public function render_curriculum_metabox($post) {
        $is_course = get_post_meta($post->ID, '_oes_is_course', true) === 'yes';
        if (!$is_course) {
            echo '<p style="color:#64748b;">Bu editör için önce ürünü <strong>kaydet</strong> ve “Kurs Ayarları” sekmesinde <strong>Kurs</strong> olarak işaretle.</p>';
            return;
        }

        $url = add_query_arg(
            array('edit' => $post->ID, 'embed' => 1),
            home_url('/egitmen/editor/')
        );
        $frame_id = 'oes-curr-frame-' . $post->ID;
        ?>
        <div class="oes-curr-embed">
            <p class="oes-curr-note">
                Müfredat, sınav soruları, görevler ve dönem programı buradan yönetilir —
                eğitmen panelindeki editörün aynısı. <strong>Bu bölümdeki değişiklikler kendi
                “Kaydet” düğmesiyle kaydedilir</strong>; ürünün “Güncelle” düğmesi bu bölümü etkilemez.
            </p>
            <iframe id="<?php echo esc_attr($frame_id); ?>"
                    src="<?php echo esc_url($url); ?>"
                    style="width:100%;height:900px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;"
                    title="Müfredat editörü"
                    scrolling="no"></iframe>
            <script>
            /* Editör aynı kaynakta (same-origin) olduğu için iframe içeriği kadar
               uzatılır — çift kaydırma çubuğu olmaz, editör tam görünür. */
            (function(){
                var f = document.getElementById('<?php echo esc_js($frame_id); ?>');
                if (!f) return;
                function fit(){
                    try {
                        var d = f.contentDocument;
                        if (!d || !d.body) return;
                        var h = Math.max(d.body.scrollHeight, d.documentElement.scrollHeight);
                        if (h > 200) f.style.height = (h + 40) + 'px';
                    } catch (e) { /* farklı kaynak → sabit yükseklikte kalır */ }
                }
                f.addEventListener('load', function(){
                    fit();
                    try {
                        if (window.ResizeObserver && f.contentDocument && f.contentDocument.body) {
                            new ResizeObserver(fit).observe(f.contentDocument.body);
                        }
                    } catch (e) {}
                    setInterval(fit, 1200); // içerik JS ile büyüyünce (modül/soru ekleme) yakala
                });
            })();
            </script>
            <p class="oes-curr-note" style="margin-top:8px;">
                Editör açılmadıysa <a href="<?php echo esc_url($url); ?>" target="_blank" rel="noopener">yeni sekmede aç</a>.
                (Kalıcı bağlantılar kapalıysa <code>/egitmen/</code> adresi çalışmaz;
                Ayarlar → Kalıcı Bağlantılar’ı bir kez kaydedin.)
            </p>
        </div>
        <style>
            .oes-curr-note{margin:0 0 12px;color:#64748b;font-size:13px}
        </style>
        <?php
    }

    public function save_course_data($product_id) {
        $is_course = isset($_POST['_oes_is_course']) ? 'yes' : 'no';
        update_post_meta($product_id, '_oes_is_course', $is_course);
        
        if ($is_course !== 'yes') return;
        
        // Ücretsiz kurs
        $is_free = isset($_POST['_oes_is_free_course']) ? 'yes' : 'no';
        update_post_meta($product_id, '_oes_is_free_course', $is_free);
        
        // Ücretsiz kurslarda - WooCommerce için düzgün ayarlar
        if ($is_free === 'yes') {
            // Fiyatı 0 olarak ayarla (boş değil!)
            update_post_meta($product_id, '_price', '0');
            update_post_meta($product_id, '_regular_price', '0');
            // Virtual ürün yap (kargo vs gerektirmez)
            update_post_meta($product_id, '_virtual', 'yes');
            // Stok yönetimini kapat
            update_post_meta($product_id, '_manage_stock', 'no');
            // Stok durumu: eğitim KAPALIYSA her zaman "yok" (kapatmayı ezme); değilse
            // admin seçimine saygı duy ("yok" işaretliyse koru, aksi halde stokta tut).
            $is_closed = get_post_meta($product_id, '_oes_course_closed', true) === 'yes';
            $stock_status = isset($_POST['_stock_status']) ? sanitize_text_field($_POST['_stock_status']) : '';
            if ($is_closed || $stock_status === 'outofstock') {
                update_post_meta($product_id, '_stock_status', 'outofstock');
            } else {
                update_post_meta($product_id, '_stock_status', 'instock');
            }
        }
        
        // Eğitmen ID
        if (isset($_POST['_oes_instructor_id'])) {
            update_post_meta($product_id, '_oes_instructor_id', intval($_POST['_oes_instructor_id']));
        }
        
        // Temel ayarlar
        $fields = array('_oes_button_type', '_oes_course_duration', '_oes_course_lessons', '_oes_course_level', '_oes_course_language', '_oes_course_preview_video');
        foreach ($fields as $f) {
            if (isset($_POST[$f])) update_post_meta($product_id, $f, sanitize_text_field($_POST[$f]));
        }
        
        // Checkbox
        update_post_meta($product_id, '_oes_course_certificate', isset($_POST['_oes_course_certificate']) ? 'yes' : 'no');
        update_post_meta($product_id, '_oes_course_lifetime', isset($_POST['_oes_course_lifetime']) ? 'yes' : 'no');
        
        // Textarea
        if (isset($_POST['_oes_course_requirements'])) update_post_meta($product_id, '_oes_course_requirements', sanitize_textarea_field($_POST['_oes_course_requirements']));
        if (isset($_POST['_oes_course_target'])) update_post_meta($product_id, '_oes_course_target', sanitize_textarea_field($_POST['_oes_course_target']));
        
        // Kazanımlar
        if (isset($_POST['_oes_course_outcomes'])) {
            update_post_meta($product_id, '_oes_course_outcomes', array_filter(array_map('sanitize_text_field', $_POST['_oes_course_outcomes'])));
        } else {
            delete_post_meta($product_id, '_oes_course_outcomes');
        }
        
        // Müfredat
        if (isset($_POST['_oes_course_curriculum'])) {
            $curriculum = array();
            foreach ($_POST['_oes_course_curriculum'] as $section) {
                $s = array('title' => sanitize_text_field($section['title'] ?? ''), 'lessons' => array());
                if (!empty($section['lessons'])) {
                    foreach ($section['lessons'] as $l) {
                        $type = sanitize_text_field($l['type'] ?? 'video');
                        
                        if ($type === 'quiz') {
                            // Sınav
                            $s['lessons'][] = array(
                                'type' => 'quiz',
                                'quiz_id' => intval($l['quiz_id'] ?? 0),
                                'title' => sanitize_text_field($l['title'] ?? ''),
                            );
                        } elseif ($type === 'file') {
                            // Dosya — file_key/file_mime korumalı depoyu işaret eder ve
                            // KORUNMALIDIR; düşerse dosya bir daha çözümlenemez.
                            // (Şema OES_Teacher_Courses::sanitize_curriculum ile aynı kalmalı.)
                            $s['lessons'][] = array(
                                'type' => 'file',
                                'title' => sanitize_text_field($l['title'] ?? ''),
                                'file_key' => sanitize_file_name($l['file_key'] ?? ''),
                                'file_url' => esc_url_raw($l['file_url'] ?? ''),
                                'file_name' => sanitize_text_field($l['file_name'] ?? ''),
                                'file_mime' => sanitize_text_field($l['file_mime'] ?? ''),
                            );
                        } else {
                            // Video ders
                            $s['lessons'][] = array(
                                'type' => 'video',
                                'title' => sanitize_text_field($l['title'] ?? ''),
                                'duration' => sanitize_text_field($l['duration'] ?? ''),
                                'video_url' => esc_url_raw($l['video_url'] ?? ''),
                                'preview' => !empty($l['preview']),
                            );
                        }
                    }
                }
                if (!empty($s['title'])) $curriculum[] = $s;
            }
            update_post_meta($product_id, '_oes_course_curriculum', $curriculum);
        }
    }

    public function enroll_student_on_purchase($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) return;
        
        $user_id = $order->get_user_id();
        if (!$user_id) return;
        
        global $wpdb;
        foreach ($order->get_items() as $item) {
            $product_id = $item->get_product_id();
            if (get_post_meta($product_id, '_oes_is_course', true) === 'yes') {
                $existing = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$wpdb->prefix}oes_enrollments WHERE user_id=%d AND course_id=%d", $user_id, $product_id));
                if (!$existing) {
                    $wpdb->insert($wpdb->prefix.'oes_enrollments', array('user_id'=>$user_id, 'course_id'=>$product_id, 'order_id'=>$order_id, 'status'=>'active', 'enrolled_at'=>current_time('mysql')), array('%d','%d','%d','%s','%s'));

                    // Hoşgeldin / kayıt maili
                    if (class_exists('OES_Mail_System') && get_option('oes_emails_muted', 'no') !== 'yes') {
                        $u = get_userdata($user_id);
                        if ($u && $u->user_email) {
                            $ct = get_the_title($product_id);
                            $panel = home_url('/panel/');
                            $content = '<p>Merhaba ' . esc_html($u->display_name) . ',</p>'
                                . '<p><strong>' . esc_html($ct) . '</strong> eğitimine kaydın başarıyla alındı. 🎉</p>'
                                . '<p>Panelinden derslere hemen başlayabilir; görev, sınav ve dönem takvimini takip edebilirsin.</p>';
                            $html = OES_Mail_System::instance()->get_email_template('Eğitime hoş geldin!', $content, 'Panele git', $panel);
                            wp_mail($u->user_email, 'Kaydın alındı — ' . $ct, $html, array('Content-Type: text/html; charset=UTF-8'));
                        }
                    }

                    do_action('oes_student_enrolled', $user_id, $product_id);
                }
            }
        }
    }
}

new OES_WC_Integration();
