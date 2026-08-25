<?php
/**
 * Frontend - Kurs Tanıtım Sayfası
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Frontend {

    public function __construct() {
        // WooCommerce template override
        add_filter('wc_get_template_part', array($this, 'override_product_template'), 99, 3);
        add_filter('woocommerce_locate_template', array($this, 'locate_template'), 99, 3);
        
        add_shortcode('oes_course', array($this, 'course_shortcode'));
        
        // Mağaza sayfası - ücretsiz badge
        add_action('woocommerce_before_shop_loop_item_title', array($this, 'add_free_badge_to_shop'), 15);
        
        // Mağaza sayfası - fiyat yerine "Ücretsiz" göster
        add_filter('woocommerce_get_price_html', array($this, 'modify_price_html'), 10, 2);
        
        // Ücretsiz kursların gerçek fiyatını 0 yap
        add_filter('woocommerce_product_get_price', array($this, 'set_free_course_price'), 10, 2);
        add_filter('woocommerce_product_get_regular_price', array($this, 'set_free_course_price'), 10, 2);
        
        // Login sonrası redirect
        add_filter('woocommerce_login_redirect', array($this, 'login_redirect'), 10, 2);
        
        // Sipariş silindiğinde/iptal edildiğinde enrollment'ı da sil
        add_action('woocommerce_order_status_cancelled', array($this, 'remove_enrollment_on_cancel'));
        add_action('woocommerce_order_status_refunded', array($this, 'remove_enrollment_on_cancel'));
        add_action('woocommerce_delete_order', array($this, 'delete_enrollment_on_order_delete'));
        add_action('before_delete_post', array($this, 'delete_enrollment_on_order_delete'));
        
        // Ücretsiz kurslar için checkout mesajı
        add_action('woocommerce_before_checkout_form', array($this, 'free_course_checkout_notice'));
        
        // Ücretsiz kurslar için ödeme yöntemlerini gizle
        add_filter('woocommerce_cart_needs_payment', array($this, 'cart_needs_payment'), 10, 2);
    }
    
    /**
     * Sepet ödeme gerektiriyor mu kontrol et
     */
    public function cart_needs_payment($needs_payment, $cart) {
        // Sepet toplamı 0 ise ödeme gerekmez
        if ($cart->get_total('edit') == 0) {
            return false;
        }
        return $needs_payment;
    }
    
    /**
     * Checkout'ta ücretsiz kurs varsa bilgi mesajı göster
     */
    public function free_course_checkout_notice() {
        $has_free_course = false;
        
        foreach (WC()->cart->get_cart() as $cart_item) {
            $product_id = $cart_item['product_id'];
            if (get_post_meta($product_id, '_oes_is_free_course', true) === 'yes') {
                $has_free_course = true;
                break;
            }
        }
        
        if ($has_free_course && WC()->cart->get_total('edit') == 0) {
            echo '<div class="woocommerce-info" style="background: linear-gradient(135deg, #10b981, #059669); color: #fff; border: none; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px;">
                <strong>🎉 Ücretsiz Kurs Kaydı</strong><br>
                <span style="opacity: 0.9;">Bu kurs ücretsizdir. Kayıt işlemini tamamlamak için lütfen aşağıdaki bilgileri doldurunuz.</span>
            </div>';
        }
    }
    
    /**
     * Sipariş iptal/iade edildiğinde enrollment'ı kaldır
     */
    public function remove_enrollment_on_cancel($order_id) {
        global $wpdb;
        
        $order = wc_get_order($order_id);
        if (!$order) return;
        
        $user_id = $order->get_user_id();
        
        // Bu siparişe bağlı enrollment'ları sil
        $wpdb->delete(
            $wpdb->prefix . 'oes_enrollments',
            array('order_id' => $order_id),
            array('%d')
        );
        
        // Cache temizle
        if ($user_id) {
            delete_transient('oes_user_courses_' . $user_id);
        }
    }
    
    /**
     * Sipariş silindiğinde enrollment kaydını da sil
     */
    public function delete_enrollment_on_order_delete($order_id) {
        if (get_post_type($order_id) !== 'shop_order') {
            return;
        }
        
        global $wpdb;
        
        // Bu siparişe bağlı enrollment varsa sil
        $wpdb->delete(
            $wpdb->prefix . 'oes_enrollments',
            array('order_id' => $order_id),
            array('%d')
        );
        
        // İlgili kullanıcının cache'ini temizle
        $order = wc_get_order($order_id);
        if ($order) {
            delete_transient('oes_user_courses_' . $order->get_user_id());
        }
    }
    
    /**
     * Login sonrası yönlendirme
     */
    public function login_redirect($redirect, $user) {
        // Yalnızca site içi (aynı host) yönlendirmelere izin ver — açık yönlendirme (phishing) engeli
        $requested = '';
        if (isset($_GET['redirect']) && !empty($_GET['redirect'])) {
            $requested = wp_unslash($_GET['redirect']);
        } elseif (isset($_POST['redirect']) && !empty($_POST['redirect'])) {
            $requested = wp_unslash($_POST['redirect']);
        }
        if ($requested !== '') {
            return wp_validate_redirect(esc_url_raw($requested), $redirect);
        }
        return $redirect;
    }
    
    /**
     * Mağaza sayfasında ücretsiz badge ekle
     */
    public function add_free_badge_to_shop() {
        global $product;
        if (!$product) return;
        
        $is_free = get_post_meta($product->get_id(), '_oes_is_free_course', true) === 'yes';
        if ($is_free) {
            echo '<span class="oes-shop-free-badge">Ücretsiz</span>';
        }
    }
    
    /**
     * Ücretsiz kurslar için fiyat HTML'ini değiştir
     */
    public function modify_price_html($price, $product) {
        $is_free = get_post_meta($product->get_id(), '_oes_is_free_course', true) === 'yes';
        if ($is_free) {
            return '<span class="oes-free-price">Ücretsiz</span>';
        }
        return $price;
    }
    
    /**
     * Ücretsiz kursların sepet/checkout fiyatını 0 yap
     */
    public function set_free_course_price($price, $product) {
        $is_free = get_post_meta($product->get_id(), '_oes_is_free_course', true) === 'yes';
        if ($is_free) {
            return 0;
        }
        return $price;
    }
    
    public function override_product_template($template, $slug, $name) {
        if ($slug === 'content' && $name === 'single-product') {
            if (is_product()) {
                $product = wc_get_product(get_the_ID());
                if ($product && $product->get_meta('_oes_is_course') === 'yes') {
                    $custom_template = OES_PLUGIN_DIR . 'templates/content-single-course.php';
                    if (file_exists($custom_template)) {
                        return $custom_template;
                    }
                }
            }
        }
        return $template;
    }

    public function locate_template($template, $template_name, $template_path) {
        if ($template_name === 'single-product.php') {
            if (is_product()) {
                $product = wc_get_product(get_the_ID());
                if ($product && $product->get_meta('_oes_is_course') === 'yes') {
                    $custom_template = OES_PLUGIN_DIR . 'templates/single-product-course.php';
                    if (file_exists($custom_template)) {
                        return $custom_template;
                    }
                }
            }
        }
        return $template;
    }

    public function render_course_template() {
        global $product;
        if (!$product) $product = wc_get_product(get_the_ID());
        $course_data = $this->get_course_data($product->get_id());
        ?>
        <div class="oes-course-page">
            <!-- Hero Bölümü -->
            <div class="oes-hero">
                <div class="oes-hero-content">
                    <div class="oes-hero-text">
                        <?php if ($product->get_categories()): ?>
                        <div class="oes-category">
                            <?php echo wc_get_product_category_list($product->get_id(), ', '); ?>
                        </div>
                        <?php endif; ?>
                        
                        <h1 class="oes-title"><?php echo esc_html($product->get_name()); ?></h1>
                        
                        <?php if ($product->get_short_description()): ?>
                        <p class="oes-description"><?php echo wp_kses_post($product->get_short_description()); ?></p>
                        <?php endif; ?>
                        
                        <div class="oes-meta-badges">
                            <?php if ($course_data['level']): ?>
                            <span class="oes-badge">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20"/><path d="M5 20V8.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C6.52 5 7.08 5 8.2 5h7.6c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C19 6.52 19 7.08 19 8.2V20"/><path d="M12 5V3"/></svg>
                                <?php echo esc_html($this->get_level_label($course_data['level'])); ?>
                            </span>
                            <?php endif; ?>
                            
                            <?php if ($course_data['duration']): ?>
                            <span class="oes-badge">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                <?php echo esc_html($course_data['duration']); ?>
                            </span>
                            <?php endif; ?>
                            
                            <?php if ($course_data['lessons']): ?>
                            <span class="oes-badge">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                                <?php echo esc_html($course_data['lessons']); ?> Ders
                            </span>
                            <?php endif; ?>
                            
                            <?php if ($course_data['language']): ?>
                            <span class="oes-badge">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                                <?php echo esc_html($course_data['language']); ?>
                            </span>
                            <?php endif; ?>
                        </div>
                        
                        <?php if ($course_data['instructor']): ?>
                        <div class="oes-instructor-mini">
                            <?php if ($course_data['instructor_image']): ?>
                            <img src="<?php echo esc_url($course_data['instructor_image']); ?>" alt="<?php echo esc_attr($course_data['instructor']); ?>">
                            <?php else: ?>
                            <div class="oes-instructor-avatar">
                                <?php echo esc_html(mb_substr($course_data['instructor'], 0, 1)); ?>
                            </div>
                            <?php endif; ?>
                            <div class="oes-instructor-info">
                                <span class="oes-instructor-label">Eğitmen</span>
                                <span class="oes-instructor-name"><?php echo esc_html($course_data['instructor']); ?></span>
                            </div>
                        </div>
                        <?php endif; ?>
                    </div>
                    
                    <div class="oes-hero-media">
                        <?php if ($course_data['preview_video']): ?>
                        <div class="oes-video-wrapper">
                            <?php echo $this->embed_video($course_data['preview_video']); ?>
                        </div>
                        <?php elseif (has_post_thumbnail()): ?>
                        <div class="oes-image-wrapper">
                            <?php the_post_thumbnail('large'); ?>
                        </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
            
            <!-- Ana İçerik -->
            <div class="oes-content-wrapper">
                <div class="oes-main-content">
                    <!-- Kazanımlar -->
                    <?php if (!empty($course_data['outcomes'])): ?>
                    <section class="oes-section oes-outcomes">
                        <h2 class="oes-section-title">Bu Programda Neler Öğreneceksiniz?</h2>
                        <div class="oes-outcomes-grid">
                            <?php foreach ($course_data['outcomes'] as $outcome): ?>
                            <div class="oes-outcome-item">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
                                <span><?php echo esc_html($outcome); ?></span>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </section>
                    <?php endif; ?>
                    
                    <!-- Kurs Açıklaması -->
                    <?php if ($product->get_description()): ?>
                    <section class="oes-section oes-about">
                        <h2 class="oes-section-title">Kurs Hakkında</h2>
                        <div class="oes-description-content">
                            <?php echo wp_kses_post($product->get_description()); ?>
                        </div>
                    </section>
                    <?php endif; ?>
                    
                    <!-- Müfredat -->
                    <?php if (!empty($course_data['curriculum'])): ?>
                    <section class="oes-section oes-curriculum">
                        <h2 class="oes-section-title">Kurs İçeriği</h2>
                        <div class="oes-curriculum-stats">
                            <span><?php echo count($course_data['curriculum']); ?> Bölüm</span>
                            <span class="oes-dot">•</span>
                            <span><?php echo esc_html($course_data['lessons']); ?> Ders</span>
                            <?php if ($course_data['duration']): ?>
                            <span class="oes-dot">•</span>
                            <span><?php echo esc_html($course_data['duration']); ?> Toplam</span>
                            <?php endif; ?>
                        </div>
                        
                        <div class="oes-accordion">
                            <?php foreach ($course_data['curriculum'] as $index => $section): ?>
                            <div class="oes-accordion-item <?php echo $index === 0 ? 'oes-open' : ''; ?>">
                                <button class="oes-accordion-header" type="button">
                                    <div class="oes-accordion-title">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h18M3 12h18M3 17h18"/></svg>
                                        <span><?php echo esc_html($section['title']); ?></span>
                                    </div>
                                    <div class="oes-accordion-meta">
                                        <span class="oes-lesson-count"><?php echo count($section['lessons']); ?> Ders</span>
                                        <svg class="oes-chevron" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                                    </div>
                                </button>
                                <div class="oes-accordion-content">
                                    <ul class="oes-lesson-list">
                                        <?php foreach ($section['lessons'] as $lesson): ?>
                                        <li class="oes-lesson-item <?php echo !empty($lesson['preview']) ? 'oes-preview' : ''; ?>">
                                            <div class="oes-lesson-info">
                                                <?php if (!empty($lesson['preview'])): ?>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                                                <?php else: ?>
                                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                                                <?php endif; ?>
                                                <span class="oes-lesson-title"><?php echo esc_html($lesson['title']); ?></span>
                                                <?php if (!empty($lesson['preview'])): ?>
                                                <span class="oes-preview-badge">Önizleme</span>
                                                <?php endif; ?>
                                            </div>
                                            <?php if (!empty($lesson['duration'])): ?>
                                            <span class="oes-lesson-duration"><?php echo esc_html($lesson['duration']); ?></span>
                                            <?php endif; ?>
                                        </li>
                                        <?php endforeach; ?>
                                    </ul>
                                </div>
                            </div>
                            <?php endforeach; ?>
                        </div>
                    </section>
                    <?php endif; ?>
                    
                    <!-- Gereksinimler -->
                    <?php if ($course_data['requirements']): ?>
                    <section class="oes-section oes-requirements">
                        <h2 class="oes-section-title">Gereksinimler</h2>
                        <ul class="oes-list">
                            <?php foreach (explode("\n", $course_data['requirements']) as $req): 
                                $req = trim($req);
                                if (empty($req)) continue;
                            ?>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                <?php echo esc_html($req); ?>
                            </li>
                            <?php endforeach; ?>
                        </ul>
                    </section>
                    <?php endif; ?>
                    
                    <!-- Hedef Kitle -->
                    <?php if ($course_data['target']): ?>
                    <section class="oes-section oes-target">
                        <h2 class="oes-section-title">Bu Kurs Kimin İçin?</h2>
                        <ul class="oes-list">
                            <?php foreach (explode("\n", $course_data['target']) as $target): 
                                $target = trim($target);
                                if (empty($target)) continue;
                            ?>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                <?php echo esc_html($target); ?>
                            </li>
                            <?php endforeach; ?>
                        </ul>
                    </section>
                    <?php endif; ?>
                    
                    <!-- Eğitmen -->
                    <?php if ($course_data['instructor']): ?>
                    <section class="oes-section oes-instructor">
                        <h2 class="oes-section-title">Eğitmen</h2>
                        <div class="oes-instructor-card">
                            <div class="oes-instructor-header">
                                <?php if ($course_data['instructor_image']): ?>
                                <img src="<?php echo esc_url($course_data['instructor_image']); ?>" alt="<?php echo esc_attr($course_data['instructor']); ?>" class="oes-instructor-photo">
                                <?php else: ?>
                                <div class="oes-instructor-avatar-large">
                                    <?php echo esc_html(mb_substr($course_data['instructor'], 0, 1)); ?>
                                </div>
                                <?php endif; ?>
                                <div class="oes-instructor-details">
                                    <h3><?php echo esc_html($course_data['instructor']); ?></h3>
                                    <?php if ($course_data['instructor_title']): ?>
                                    <p class="oes-instructor-title"><?php echo esc_html($course_data['instructor_title']); ?></p>
                                    <?php endif; ?>
                                    
                                    <?php if (!empty($course_data['instructor_email']) || !empty($course_data['instructor_phone'])): ?>
                                    <div class="oes-instructor-contact">
                                        <?php if (!empty($course_data['instructor_email'])): ?>
                                        <a href="mailto:<?php echo esc_attr($course_data['instructor_email']); ?>" class="oes-contact-link">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                            <?php echo esc_html($course_data['instructor_email']); ?>
                                        </a>
                                        <?php endif; ?>
                                        <?php if (!empty($course_data['instructor_phone'])): ?>
                                        <a href="tel:<?php echo esc_attr($course_data['instructor_phone']); ?>" class="oes-contact-link">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                                            <?php echo esc_html($course_data['instructor_phone']); ?>
                                        </a>
                                        <?php endif; ?>
                                    </div>
                                    <?php endif; ?>
                                    
                                    <?php if (!empty($course_data['instructor_social'])): 
                                        $social = $course_data['instructor_social'];
                                    ?>
                                    <div class="oes-instructor-social">
                                        <?php if (!empty($social['linkedin'])): ?>
                                        <a href="<?php echo esc_url($social['linkedin']); ?>" target="_blank" title="LinkedIn">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                                        </a>
                                        <?php endif; ?>
                                        <?php if (!empty($social['twitter'])): ?>
                                        <a href="<?php echo esc_url($social['twitter']); ?>" target="_blank" title="Twitter/X">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>
                                        </a>
                                        <?php endif; ?>
                                        <?php if (!empty($social['website'])): ?>
                                        <a href="<?php echo esc_url($social['website']); ?>" target="_blank" title="Website">
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                                        </a>
                                        <?php endif; ?>
                                    </div>
                                    <?php endif; ?>
                                </div>
                            </div>
                            <?php if ($course_data['instructor_bio']): ?>
                            <div class="oes-instructor-bio">
                                <?php echo wp_kses_post(wpautop($course_data['instructor_bio'])); ?>
                            </div>
                            <?php endif; ?>
                        </div>
                    </section>
                    <?php endif; ?>
                </div>
                
                <!-- Sidebar -->
                <aside class="oes-sidebar">
                    <div class="oes-purchase-card">
                        <?php 
                        $is_free_course = get_post_meta($product->get_id(), '_oes_is_free_course', true) === 'yes';
                        ?>
                        
                        <?php if ($course_data['preview_video']): ?>
                        <div class="oes-card-media">
                            <?php if ($is_free_course): ?>
                            <span class="oes-free-badge">Ücretsiz</span>
                            <?php endif; ?>
                            <?php echo $this->embed_video($course_data['preview_video']); ?>
                        </div>
                        <?php elseif (has_post_thumbnail()): ?>
                        <div class="oes-card-image">
                            <?php if ($is_free_course): ?>
                            <span class="oes-free-badge">Ücretsiz</span>
                            <?php endif; ?>
                            <?php the_post_thumbnail('medium'); ?>
                        </div>
                        <?php elseif ($is_free_course): ?>
                        <div class="oes-card-image" style="min-height:60px;">
                            <span class="oes-free-badge">Ücretsiz</span>
                        </div>
                        <?php endif; ?>
                        
                        <?php 
                        $is_enrolled = false;
                        if (is_user_logged_in()) {
                            global $wpdb;
                            $is_enrolled = $wpdb->get_var($wpdb->prepare(
                                "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d AND course_id = %d",
                                get_current_user_id(), $product->get_id()
                            )) > 0;
                        }
                        ?>
                        
                        <div class="oes-card-content">
                            <div class="oes-price-wrapper">
                                <?php if ($is_free_course): ?>
                                <span class="oes-price" style="color:#10b981">Ücretsiz</span>
                                <?php elseif ($product->is_on_sale()): ?>
                                <span class="oes-old-price"><?php echo wc_price($product->get_regular_price()); ?></span>
                                <span class="oes-price"><?php echo $product->get_price_html(); ?></span>
                                <span class="oes-discount-badge">%<?php echo round(100 - ($product->get_sale_price() / $product->get_regular_price() * 100)); ?> İndirim</span>
                                <?php else: ?>
                                <span class="oes-price"><?php echo $product->get_price_html(); ?></span>
                                <?php endif; ?>
                            </div>
                            
                            <div class="oes-card-buttons">
                                <?php if ($is_enrolled): ?>
                                    <!-- Zaten kayıtlı - Player'a git -->
                                    <a href="<?php echo add_query_arg('oes-player', $product->get_id(), home_url('/kurs-izle/')); ?>" class="oes-btn oes-btn-primary">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                        Kursa Git
                                    </a>
                                <?php elseif ($is_free_course): ?>
                                    <?php if (is_user_logged_in()): ?>
                                    <!-- Ücretsiz kursa kayıt ol -->
                                    <form method="post" action="">
                                        <input type="hidden" name="oes_free_enroll" value="<?php echo $product->get_id(); ?>">
                                        <?php wp_nonce_field('oes_free_enroll_' . $product->get_id()); ?>
                                        <button type="submit" class="oes-btn oes-btn-primary">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                                            Ücretsiz Kaydol
                                        </button>
                                    </form>
                                    <?php else: ?>
                                    <!-- Giriş yap (frontend panel giriş ekranı, wp-login DEĞİL) -->
                                    <a href="<?php echo esc_url(add_query_arg('r', rawurlencode(get_permalink()), class_exists('OES_Panel') ? OES_Panel::instance()->panel_url() : home_url('/panel/'))); ?>" class="oes-btn oes-btn-primary">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                                        Giriş Yap & Kaydol
                                    </a>
                                    <?php endif; ?>
                                <?php else: ?>
                                    <?php 
                                    $button_type = $course_data['button_type'];
                                    $whatsapp_number = $course_data['whatsapp_number'] ?: get_option('oes_whatsapp_number');
                                    $whatsapp_message = $course_data['whatsapp_message'] ?: get_option('oes_whatsapp_message', 'Merhaba, {course_name} kursu hakkında bilgi almak istiyorum.');
                                    $whatsapp_message = str_replace(
                                        array('{course_name}', '{course_price}'),
                                        array($product->get_name(), strip_tags($product->get_price_html())),
                                        $whatsapp_message
                                    );
                                    $whatsapp_url = 'https://wa.me/' . $whatsapp_number . '?text=' . urlencode($whatsapp_message);
                                    
                                    if ($button_type === 'cart' || $button_type === 'both'): ?>
                                    <form class="cart" action="<?php echo esc_url(apply_filters('woocommerce_add_to_cart_form_action', $product->get_permalink())); ?>" method="post">
                                        <?php 
                                        // Dönem seçici
                                        $this->render_period_selector($product->get_id());
                                        ?>
                                        <button type="submit" name="add-to-cart" value="<?php echo esc_attr($product->get_id()); ?>" class="oes-btn oes-btn-primary">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                                            Sepete Ekle
                                        </button>
                                    </form>
                                    <?php endif; ?>
                                    
                                    <?php if ($button_type === 'whatsapp' || $button_type === 'both'): ?>
                                    <a href="<?php echo esc_url($whatsapp_url); ?>" target="_blank" class="oes-btn oes-btn-whatsapp">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                        WhatsApp'tan Ulaş
                                    </a>
                                    <?php endif; ?>
                                <?php endif; ?>
                            </div>
                            
                            <div class="oes-card-features">
                                <h4>Bu Kurs Dahilinde</h4>
                                <ul>
                                    <?php if ($course_data['duration']): ?>
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                        <?php echo esc_html($course_data['duration']); ?> video içerik
                                    </li>
                                    <?php endif; ?>
                                    
                                    <?php if ($course_data['lessons']): ?>
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                                        <?php echo esc_html($course_data['lessons']); ?> ders
                                    </li>
                                    <?php endif; ?>
                                    
                                    <?php if ($course_data['lifetime'] === 'yes'): ?>
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                        Ömür boyu erişim
                                    </li>
                                    <?php endif; ?>
                                    
                                    <?php if ($course_data['certificate'] === 'yes'): ?>
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
                                        Tamamlama sertifikası
                                    </li>
                                    <?php endif; ?>
                                    
                                    <li>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>
                                        Mobil ve masaüstü erişim
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
            
            <?php $this->render_related_courses($product->get_id()); ?>
        </div>
        <?php
    }
    
    /**
     * İlgili kurslar bölümü
     */
    private function render_related_courses($current_course_id) {
        global $wpdb;
        
        // Aynı kategorideki diğer kursları çek
        $categories = wp_get_post_terms($current_course_id, 'product_cat', array('fields' => 'ids'));
        
        if (empty($categories)) {
            // Kategori yoksa rastgele kurslar göster
            $related_courses = $wpdb->get_results($wpdb->prepare("
                SELECT p.ID, p.post_title 
                FROM {$wpdb->posts} p
                INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_oes_is_course' AND pm.meta_value = 'yes'
                WHERE p.post_type = 'product' AND p.post_status = 'publish' AND p.ID != %d
                ORDER BY RAND()
                LIMIT 4
            ", $current_course_id));
        } else {
            // Aynı kategorideki kurslar
            $category_ids = implode(',', array_map('intval', $categories));
            $related_courses = $wpdb->get_results($wpdb->prepare("
                SELECT DISTINCT p.ID, p.post_title 
                FROM {$wpdb->posts} p
                INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_oes_is_course' AND pm.meta_value = 'yes'
                INNER JOIN {$wpdb->term_relationships} tr ON p.ID = tr.object_id
                WHERE p.post_type = 'product' AND p.post_status = 'publish' AND p.ID != %d
                AND tr.term_taxonomy_id IN ($category_ids)
                ORDER BY RAND()
                LIMIT 4
            ", $current_course_id));
        }
        
        if (empty($related_courses)) {
            return;
        }
        ?>
        <div class="oes-related-courses">
            <h2>İlgili Kurslar</h2>
            <div class="oes-related-grid">
                <?php foreach ($related_courses as $course): 
                    $product = wc_get_product($course->ID);
                    if (!$product) continue;
                    
                    $is_free = get_post_meta($course->ID, '_oes_is_free_course', true) === 'yes';
                    $duration = get_post_meta($course->ID, '_oes_course_duration', true);
                    $lessons = get_post_meta($course->ID, '_oes_course_lessons', true);
                ?>
                <a href="<?php echo get_permalink($course->ID); ?>" class="oes-related-card">
                    <div class="oes-related-image">
                        <?php echo $product->get_image('medium'); ?>
                        <?php if ($is_free): ?>
                        <span class="oes-free-badge">Ücretsiz</span>
                        <?php endif; ?>
                    </div>
                    <div class="oes-related-info">
                        <h3><?php echo esc_html($course->post_title); ?></h3>
                        <div class="oes-related-meta">
                            <?php if ($lessons): ?>
                            <span><?php echo esc_html($lessons); ?> ders</span>
                            <?php endif; ?>
                            <?php if ($duration): ?>
                            <span><?php echo esc_html($duration); ?></span>
                            <?php endif; ?>
                        </div>
                        <div class="oes-related-price">
                            <?php if ($is_free): ?>
                            <span style="color:#10b981;font-weight:600">Ücretsiz</span>
                            <?php else: ?>
                            <?php echo $product->get_price_html(); ?>
                            <?php endif; ?>
                        </div>
                    </div>
                </a>
                <?php endforeach; ?>
            </div>
        </div>
        <?php
    }

    private function get_course_data($product_id) {
        // Eğitmen bilgilerini al (önce eğitmen tablosundan, yoksa meta'dan)
        $instructor_id = get_post_meta($product_id, '_oes_instructor_id', true);
        $instructor_data = array(
            'name' => '',
            'title' => '',
            'photo' => '',
            'bio' => '',
            'email' => '',
            'phone' => '',
            'social' => array()
        );
        
        if ($instructor_id) {
            global $wpdb;
            $instructor = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}oes_instructors WHERE id = %d",
                $instructor_id
            ));
            if ($instructor) {
                $instructor_data = array(
                    'name' => $instructor->name,
                    'title' => $instructor->title,
                    'photo' => $instructor->photo_url,
                    'bio' => $instructor->bio,
                    'email' => $instructor->email,
                    'phone' => $instructor->phone,
                    'social' => json_decode($instructor->social_links, true) ?: array()
                );
            }
        }
        
        // Eğer eğitmen tablosundan gelmemişse, eski meta verilerini kullan
        if (empty($instructor_data['name'])) {
            $instructor_data['name'] = get_post_meta($product_id, '_oes_course_instructor', true);
            $instructor_data['title'] = get_post_meta($product_id, '_oes_course_instructor_title', true);
            $instructor_data['bio'] = get_post_meta($product_id, '_oes_course_instructor_bio', true);
            $image_id = get_post_meta($product_id, '_oes_course_instructor_image', true);
            $instructor_data['photo'] = $image_id ? wp_get_attachment_image_url($image_id, 'medium') : '';
            
            // Meta'dan isim geldiyse, tabloda aynı isimli eğitmeni bul ve iletişim bilgilerini al
            if (!empty($instructor_data['name'])) {
                global $wpdb;
                $matched_instructor = $wpdb->get_row($wpdb->prepare(
                    "SELECT email, phone, social_links FROM {$wpdb->prefix}oes_instructors WHERE name = %s LIMIT 1",
                    $instructor_data['name']
                ));
                if ($matched_instructor) {
                    $instructor_data['email'] = $matched_instructor->email;
                    $instructor_data['phone'] = $matched_instructor->phone;
                    $instructor_data['social'] = json_decode($matched_instructor->social_links, true) ?: array();
                }
            }
        }
        
        return array(
            'duration' => get_post_meta($product_id, '_oes_course_duration', true),
            'lessons' => get_post_meta($product_id, '_oes_course_lessons', true),
            'level' => get_post_meta($product_id, '_oes_course_level', true),
            'language' => get_post_meta($product_id, '_oes_course_language', true),
            'certificate' => get_post_meta($product_id, '_oes_course_certificate', true),
            'lifetime' => get_post_meta($product_id, '_oes_course_lifetime', true),
            'instructor' => $instructor_data['name'],
            'instructor_title' => $instructor_data['title'],
            'instructor_image' => $instructor_data['photo'],
            'instructor_bio' => $instructor_data['bio'],
            'instructor_email' => $instructor_data['email'],
            'instructor_phone' => $instructor_data['phone'],
            'instructor_social' => $instructor_data['social'],
            'curriculum' => get_post_meta($product_id, '_oes_course_curriculum', true) ?: array(),
            'features' => get_post_meta($product_id, '_oes_course_features', true) ?: array(),
            'requirements' => get_post_meta($product_id, '_oes_course_requirements', true),
            'target' => get_post_meta($product_id, '_oes_course_target', true),
            'outcomes' => get_post_meta($product_id, '_oes_course_outcomes', true) ?: array(),
            'preview_video' => get_post_meta($product_id, '_oes_course_preview_video', true),
            'button_type' => get_post_meta($product_id, '_oes_button_type', true) ?: 'cart',
            'whatsapp_number' => get_post_meta($product_id, '_oes_whatsapp_number', true),
            'whatsapp_message' => get_post_meta($product_id, '_oes_whatsapp_message', true),
        );
    }

    private function get_level_label($level) {
        $labels = array(
            'beginner' => 'Başlangıç',
            'intermediate' => 'Orta',
            'advanced' => 'İleri',
            'all' => 'Tüm Seviyeler',
        );
        return $labels[$level] ?? $level;
    }

    private function embed_video($url) {
        if (preg_match('/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/', $url, $matches) || 
            preg_match('/youtu\.be\/([a-zA-Z0-9_-]+)/', $url, $matches)) {
            return '<iframe src="https://www.youtube.com/embed/' . esc_attr($matches[1]) . '" frameborder="0" allowfullscreen></iframe>';
        }
        
        if (preg_match('/vimeo\.com\/(\d+)/', $url, $matches)) {
            return '<iframe src="https://player.vimeo.com/video/' . esc_attr($matches[1]) . '" frameborder="0" allowfullscreen></iframe>';
        }
        
        return '';
    }
    public function course_shortcode($atts) {
        $atts = shortcode_atts(array('id' => 0), $atts);
        if (!$atts['id']) return '';
        
        $product = wc_get_product($atts['id']);
        if (!$product || $product->get_meta('_oes_is_course') !== 'yes') return '';
        
        ob_start();
        global $post;
        $post = get_post($atts['id']);
        setup_postdata($post);
        $this->render_course_template();
        wp_reset_postdata();
        return ob_get_clean();
    }

    /**
     * Dönem seçici render
     */
    private function render_period_selector($product_id) {
        $is_period_based = get_post_meta($product_id, '_oes_period_based', true);
        
        if ($is_period_based !== 'yes') {
            return;
        }
        
        global $wpdb;
        $today = current_time('Y-m-d');
        
        // Tüm gelecek ve aktif dönemleri al
        $periods = $wpdb->get_results($wpdb->prepare("
            SELECT p.*, 
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = p.id) as enrolled
            FROM {$wpdb->prefix}oes_periods p
            WHERE p.course_id = %d 
            AND p.end_date >= %s
            ORDER BY p.start_date ASC
        ", $product_id, $today));
        
        if (empty($periods)) {
            echo '<p class="oes-no-periods">Şu anda açık dönem bulunmamaktadır.</p>';
            return;
        }
        
        ?>
        <div class="oes-period-selector">
            <?php foreach ($periods as $period): 
                $is_full = $period->enrolled >= $period->capacity;
                $remaining = $period->capacity - $period->enrolled;
                
                // Aktif dönem kontrolü (bugün start_date ve end_date arasında mı?)
                $is_active = ($today >= $period->start_date && $today <= $period->end_date);
                
                // Kayıt son tarihi geçti mi?
                $enrollment_closed = (!empty($period->enrollment_deadline) && $today > $period->enrollment_deadline);
                
                // Kayıt yapılamaz durumlar
                $is_disabled = $is_full || $is_active || $enrollment_closed;
            ?>
            <label class="oes-period-option <?php echo $is_disabled ? 'disabled' : ''; ?>">
                <input type="radio" name="oes_period" value="<?php echo $period->id; ?>" <?php echo $is_disabled ? 'disabled' : ''; ?> required>
                <div class="oes-period-card">
                    <div class="oes-period-icon"><?php echo $is_active ? '🟢' : '📅'; ?></div>
                    <div class="oes-period-info">
                        <span class="oes-period-label">DÖNEM</span>
                        <span class="oes-period-name"><?php echo esc_html($period->name); ?></span>
                        <span class="oes-period-dates"><?php echo date('d.m.Y', strtotime($period->start_date)); ?> - <?php echo date('d.m.Y', strtotime($period->end_date)); ?></span>
                    </div>
                    <?php if ($is_active): ?>
                        <span class="oes-period-active">Şu an aktif</span>
                    <?php elseif ($is_full): ?>
                        <span class="oes-period-full">Dolu</span>
                    <?php elseif ($enrollment_closed): ?>
                        <span class="oes-period-closed">Kayıt kapandı</span>
                    <?php else: ?>
                        <span class="oes-period-remaining"><?php echo $remaining; ?> kişilik yer</span>
                    <?php endif; ?>
                </div>
            </label>
            <?php endforeach; ?>
        </div>
        
        <style>
            .oes-period-selector { margin-bottom: 15px; }
            .oes-period-option { display: block; cursor: pointer; margin-bottom: 8px; }
            .oes-period-option.disabled { opacity: 0.6; cursor: not-allowed; }
            .oes-period-option input { display: none; }
            .oes-period-card {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px 15px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                transition: all 0.2s;
            }
            .oes-period-option input:checked + .oes-period-card {
                border-color: #10b981;
                background: #f0fdf4;
            }
            .oes-period-option:not(.disabled):hover .oes-period-card {
                border-color: #10b981;
            }
            .oes-period-icon { font-size: 20px; }
            .oes-period-info { flex: 1; }
            .oes-period-label { display: block; font-size: 10px; color: #6b7280; font-weight: 500; }
            .oes-period-name { display: block; font-size: 14px; font-weight: 600; color: #111; }
            .oes-period-dates { display: block; font-size: 11px; color: #9ca3af; margin-top: 2px; }
            .oes-period-remaining { font-size: 11px; color: #10b981; font-weight: 500; }
            .oes-period-full { font-size: 11px; color: #ef4444; font-weight: 500; }
            .oes-period-active { font-size: 11px; color: #fff; font-weight: 500; background: #10b981; padding: 3px 8px; border-radius: 4px; }
            .oes-period-closed { font-size: 11px; color: #f59e0b; font-weight: 500; }
            .oes-no-periods { color: #f59e0b; font-size: 13px; padding: 10px; background: #fffbeb; border-radius: 6px; }
        </style>
        <?php
    }
}

new OES_Frontend();