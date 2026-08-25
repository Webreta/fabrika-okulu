<?php
/**
 * Kurs için tek ürün içeriği template'i
 * CSS: assets/css/course-page.css
 * JS: assets/js/course-page.js
 */

defined('ABSPATH') || exit;

global $product, $wpdb;

// Not: is_visible() kontrolü kaldırıldı. Kapatılan (stoktan kaldırılan / katalogdan
// gizlenen) kurslar mağazada listelenmez ama KENDİ sayfaları yine açılmalı — sadece
// satın-al butonu yerine "artık yayında değil" metni gösterilir. Bu şablon zaten
// sadece kurs ürünleri için yüklendiğinden görünürlükten bağımsız render ederiz.
if (!$product) return;

$product_id = $product->get_id();
$user_id = get_current_user_id();

// Kursa erişim kontrolü - SADECE completed siparişler
$is_enrolled = false;
if ($user_id) {
    // Kullanıcının bu kurs için TAMAMLANMIŞ siparişi var mı?
    $customer_orders = wc_get_orders(array(
        'customer_id' => $user_id,
        'status' => 'completed',
        'limit' => -1
    ));
    
    foreach ($customer_orders as $order) {
        foreach ($order->get_items() as $item) {
            if ($item->get_product_id() == $product_id) {
                $is_enrolled = true;
                
                // Enrollment kaydı yoksa oluştur
                $existing = $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d AND course_id = %d",
                    $user_id, $product_id
                ));
                
                if (!$existing) {
                    $wpdb->insert($wpdb->prefix.'oes_enrollments', array(
                        'user_id' => $user_id, 
                        'course_id' => $product_id, 
                        'order_id' => $order->get_id(), 
                        'status' => 'active', 
                        'enrolled_at' => current_time('mysql')
                    ));
                }
                break 2;
            }
        }
    }
}

$player_url = add_query_arg('oes-player', $product_id, home_url('/kurs-izle/'));

// Ücretsiz kurs kayıt kontrolü (enrollments tablosundan)
if ($user_id && !$is_enrolled) {
    $free_enrollment = $wpdb->get_var($wpdb->prepare(
        "SELECT id FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d AND course_id = %d",
        $user_id, $product_id
    ));
    if ($free_enrollment) {
        $is_enrolled = true;
    }
}

// Dönem bilgileri
$is_period_based = get_post_meta($product_id, '_oes_period_based', true) === 'yes';

// Eğitmen
$instructor_id = get_post_meta($product_id, '_oes_instructor_id', true);
$instructor = $instructor_id ? $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_instructors WHERE id = %d", $instructor_id)) : null;

// Kurs verileri
$duration = get_post_meta($product_id, '_oes_course_duration', true);
$lessons = get_post_meta($product_id, '_oes_course_lessons', true);
$level = get_post_meta($product_id, '_oes_course_level', true);
$language = get_post_meta($product_id, '_oes_course_language', true);
$certificate = get_post_meta($product_id, '_oes_course_certificate', true);
$lifetime = get_post_meta($product_id, '_oes_course_lifetime', true);
$curriculum = get_post_meta($product_id, '_oes_course_curriculum', true) ?: array();
$requirements = get_post_meta($product_id, '_oes_course_requirements', true);
$target = get_post_meta($product_id, '_oes_course_target', true);
$outcomes = get_post_meta($product_id, '_oes_course_outcomes', true) ?: array();
$preview_video = get_post_meta($product_id, '_oes_course_preview_video', true);
$button_type = get_post_meta($product_id, '_oes_button_type', true) ?: 'cart';
$is_free_course = get_post_meta($product_id, '_oes_is_free_course', true) === 'yes';
// Ücretsiz kurs stok durumu "yok" ise süresi bitmiş kabul edilir
$is_course_expired = $is_free_course && $product->get_stock_status() === 'outofstock';
// Eğitmen "Eğitimi Kapat" dediyse: sayfa açılır ama satın alma butonu yerine bilgi metni
$is_course_closed = get_post_meta($product_id, '_oes_course_closed', true) === 'yes';

$level_labels = array('beginner' => 'Başlangıç', 'intermediate' => 'Orta', 'advanced' => 'İleri', 'all' => 'Tüm Seviyeler');

// Toplam ders ve süre — süreler "dk:sn" girildiği için saniye bazında toplanır
$total_lessons = 0;
$total_secs = 0;
foreach ($curriculum as $section) {
    if (!empty($section['lessons'])) {
        $total_lessons += count($section['lessons']);
        foreach ($section['lessons'] as $lesson) {
            if (!empty($lesson['duration'])) $total_secs += fabo_duration_secs($lesson['duration']);
        }
    }
}
$duration_text = $total_secs > 0 ? fabo_duration_text($total_secs) : $duration;

// WhatsApp
$whatsapp_number = get_post_meta($product_id, '_oes_whatsapp_number', true) ?: get_option('oes_whatsapp_number');
$whatsapp_message = get_post_meta($product_id, '_oes_whatsapp_message', true) ?: get_option('oes_whatsapp_message', 'Merhaba, {course_name} kursu hakkında bilgi almak istiyorum.');
$whatsapp_message = str_replace(array('{course_name}', '{course_price}'), array($product->get_name(), strip_tags($product->get_price_html())), $whatsapp_message);
$whatsapp_url = 'https://wa.me/' . $whatsapp_number . '?text=' . urlencode($whatsapp_message);

// Video embed
function oes_video_embed($url) {
    if (preg_match('/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/', $url, $m) || preg_match('/youtu\.be\/([a-zA-Z0-9_-]+)/', $url, $m)) {
        return '<iframe src="https://www.youtube.com/embed/' . $m[1] . '" frameborder="0" allowfullscreen></iframe>';
    }
    if (preg_match('/vimeo\.com\/(\d+)/', $url, $m)) {
        return '<iframe src="https://player.vimeo.com/video/' . $m[1] . '" frameborder="0" allowfullscreen></iframe>';
    }
    return '';
}
?>

<div class="oes-course-page">
    
    <?php if ($is_enrolled): ?>
    <div class="oes-enrolled-notice">
        <div class="oes-enrolled-notice-content">
            <span>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                Bu kursa kayıtlısınız
            </span>
            <a href="<?php echo esc_url($player_url); ?>" class="oes-btn-light">Kursu İzle</a>
        </div>
    </div>
    <?php endif; ?>

    <div class="oes-hero">
        <div class="oes-hero-content">
            <div class="oes-hero-media-mobile">
                <?php if ($preview_video): ?>
                <div class="oes-video-wrapper"><?php echo oes_video_embed($preview_video); ?></div>
                <?php elseif (has_post_thumbnail()): ?>
                <?php the_post_thumbnail('large'); ?>
                <?php endif; ?>
            </div>
            
            <div class="oes-hero-text">
                <?php
                // Kategori etiketi WooCommerce arşivine değil, sitenin kendi grup sayfasına gider
                // (ör. /takvimli-programlar/). Slug'lar sayfa slug'larıyla eşleşir; home_url ile domain-bağımsız.
                $cat_terms = get_the_terms($product_id, 'product_cat');
                if ($cat_terms && !is_wp_error($cat_terms)):
                    $cat_links = array();
                    foreach ($cat_terms as $ct) {
                        $cat_links[] = '<a href="' . esc_url(home_url('/' . $ct->slug . '/')) . '">' . esc_html($ct->name) . '</a>';
                    }
                ?>
                <div class="oes-category"><?php echo implode(', ', $cat_links); ?></div>
                <?php endif; ?>

                <h1 class="oes-title"><?php echo esc_html($product->get_name()); ?></h1>
                
                <?php if ($product->get_short_description()): ?>
                <p class="oes-description"><?php echo wp_kses_post($product->get_short_description()); ?></p>
                <?php endif; ?>
                
                <div class="oes-meta-badges">
                    <?php if ($level): ?>
                    <span class="oes-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20h20M5 20V8.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C6.52 5 7.08 5 8.2 5h7.6c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C19 6.52 19 7.08 19 8.2V20M12 5V3"/></svg>
                        <?php echo esc_html($level_labels[$level] ?? $level); ?>
                    </span>
                    <?php endif; ?>
                    
                    <?php if ($duration_text): ?>
                    <span class="oes-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        <?php echo esc_html($duration_text); ?>
                    </span>
                    <?php endif; ?>
                    
                    <?php if ($total_lessons > 0 || $lessons): ?>
                    <span class="oes-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                        <?php echo $total_lessons ?: $lessons; ?> Ders
                    </span>
                    <?php endif; ?>
                    
                    <?php if ($language): ?>
                    <span class="oes-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        <?php echo esc_html($language); ?>
                    </span>
                    <?php endif; ?>
                </div>
                
                <?php if ($instructor): ?>
                <div class="oes-instructor-mini">
                    <?php if ($instructor->photo_url): ?>
                    <img src="<?php echo esc_url($instructor->photo_url); ?>" alt="">
                    <?php else: ?>
                    <div class="oes-instructor-avatar"><?php echo mb_substr($instructor->name, 0, 1); ?></div>
                    <?php endif; ?>
                    <div>
                        <span class="oes-instructor-label">Eğitmen</span>
                        <span class="oes-instructor-name"><?php echo esc_html($instructor->name); ?></span>
                    </div>
                </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    
    <div class="oes-content-wrapper">
        <div class="oes-main-content">
            
            <?php if (!empty($outcomes)): ?>
            <section class="oes-section">
                <h2 class="oes-section-title">Bu Programda Neler Öğreneceksiniz?</h2>
                <div class="oes-outcomes-grid">
                    <?php foreach ($outcomes as $outcome): ?>
                    <div class="oes-outcome-item">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg>
                        <span><?php echo esc_html($outcome); ?></span>
                    </div>
                    <?php endforeach; ?>
                </div>
            </section>
            <?php endif; ?>
            
            <?php if ($product->get_description()): ?>
            <section class="oes-section">
                <h2 class="oes-section-title">Bu programla gelişim yolculuğun:</h2>
                <div class="oes-description-content"><?php echo wp_kses_post($product->get_description()); ?></div>
            </section>
            <?php endif; ?>
            
            <?php if (!empty($curriculum)): ?>
            <section class="oes-section">
                <h2 class="oes-section-title">Program Modülleri</h2>
                <?php
                // Sayılar otomatik müfredattan çekilir (elle girilmez)
                $fabo_bolum = 0; $fabo_quiz = 0; $fabo_gorev = 0;
                foreach ($curriculum as $sec) {
                    foreach (($sec['lessons'] ?? array()) as $l) {
                        $lt = $l['type'] ?? 'video';
                        if ($lt === 'quiz') $fabo_quiz++; elseif ($lt === 'assign') $fabo_gorev++; else $fabo_bolum++;
                    }
                }
                ?>
                <div class="oes-curriculum-stats">
                    <span><?php echo count($curriculum); ?> Modül</span>
                    <span class="oes-dot">•</span>
                    <span><?php echo $fabo_bolum; ?> Bölüm</span>
                    <?php if ($fabo_quiz): ?><span class="oes-dot">•</span><span><?php echo $fabo_quiz; ?> Sınav</span><?php endif; ?>
                    <?php if ($fabo_gorev): ?><span class="oes-dot">•</span><span><?php echo $fabo_gorev; ?> Görev</span><?php endif; ?>
                </div>
                
                <div class="oes-accordion">
                    <?php foreach ($curriculum as $i => $section): ?>
                    <div class="oes-accordion-item<?php echo $i === 0 ? ' oes-open' : ''; ?>">
                        <div class="oes-accordion-header">
                            <div class="oes-accordion-title">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                                <span><?php echo esc_html($section['title']); ?></span>
                            </div>
                            <div class="oes-accordion-meta">
                                <span class="oes-lesson-count"><?php echo count($section['lessons']); ?> Bölüm</span>
                                <svg class="oes-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
                            </div>
                        </div>
                        <div class="oes-accordion-content">
                            <ul class="oes-lesson-list">
                                <?php foreach ($section['lessons'] as $lesson): ?>
                                <li class="oes-lesson-item">
                                    <div class="oes-lesson-info">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polygon points="10 8 16 12 10 16 10 8"/></svg>
                                        <span class="oes-lesson-title"><?php echo esc_html($lesson['title']); ?></span>
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
            
            <?php if ($requirements): ?>
            <section class="oes-section">
                <h2 class="oes-section-title">Gereksinimler</h2>
                <ul class="oes-simple-list">
                    <?php foreach (explode("\n", $requirements) as $req): if (trim($req)): ?>
                    <li><?php echo esc_html(trim($req)); ?></li>
                    <?php endif; endforeach; ?>
                </ul>
            </section>
            <?php endif; ?>
            
            <?php if ($target): ?>
            <section class="oes-section">
                <h2 class="oes-section-title">Bu Kurs Kimin İçin?</h2>
                <ul class="oes-simple-list">
                    <?php foreach (explode("\n", $target) as $t): if (trim($t)): ?>
                    <li><?php echo esc_html(trim($t)); ?></li>
                    <?php endif; endforeach; ?>
                </ul>
            </section>
            <?php endif; ?>
            
            <?php if ($instructor): ?>
            <section class="oes-section">
                <h2 class="oes-section-title">Eğitmen</h2>
                <div class="oes-instructor-card">
                    <div class="oes-instructor-header">
                        <?php if ($instructor->photo_url): ?>
                        <img src="<?php echo esc_url($instructor->photo_url); ?>" alt="" class="oes-instructor-photo">
                        <?php else: ?>
                        <div class="oes-instructor-avatar-large"><?php echo mb_substr($instructor->name, 0, 1); ?></div>
                        <?php endif; ?>
                        <div class="oes-instructor-details">
                            <h3><?php echo esc_html($instructor->name); ?></h3>
                            <?php if ($instructor->title): ?>
                            <p class="oes-instructor-title"><?php echo esc_html($instructor->title); ?></p>
                            <?php endif; ?>
                            
                            <?php if (!empty($instructor->email) || !empty($instructor->phone)): ?>
                            <div class="oes-instructor-contact">
                                <?php if (!empty($instructor->email)): ?>
                                <a href="mailto:<?php echo esc_attr($instructor->email); ?>" class="oes-contact-link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    <?php echo esc_html($instructor->email); ?>
                                </a>
                                <?php endif; ?>
                                <?php if (!empty($instructor->phone)): ?>
                                <a href="tel:<?php echo esc_attr($instructor->phone); ?>" class="oes-contact-link">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                                    <?php echo esc_html($instructor->phone); ?>
                                </a>
                                <?php endif; ?>
                            </div>
                            <?php endif; ?>
                            
                            <?php 
                            $social = !empty($instructor->social_links) ? json_decode($instructor->social_links, true) : array();
                            if (!empty($social) && ((!empty($social['linkedin'])) || (!empty($social['twitter'])) || (!empty($social['instagram'])) || (!empty($social['website'])))):
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
                                <?php if (!empty($social['instagram'])): ?>
                                <a href="<?php echo esc_url($social['instagram']); ?>" target="_blank" title="Instagram">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
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
                    <?php if ($instructor->bio): ?>
                    <div class="oes-instructor-bio"><p><?php echo esc_html($instructor->bio); ?></p></div>
                    <?php endif; ?>
                </div>
            </section>
            <?php endif; ?>
            
        </div>
        
        <aside class="oes-sidebar">
            <div class="oes-purchase-card">
                <div class="oes-card-content">
                    <div class="oes-card-media">
                        <?php if ($is_free_course): ?>
                        <span class="oes-free-badge">Ücretsiz</span>
                        <?php endif; ?>
                        <?php if ($preview_video): ?>
                        <div class="oes-video-wrapper"><?php echo oes_video_embed($preview_video); ?></div>
                        <?php elseif (has_post_thumbnail()): ?>
                        <?php the_post_thumbnail('medium_large'); ?>
                        <?php endif; ?>
                    </div>
                    
                    <div class="oes-price-wrapper">
                        <?php if ($is_free_course): ?>
                        <span class="oes-price" style="color:#10b981">Ücretsiz</span>
                        <?php else: ?>
                        <?php // get_price_html() indirimde zaten üstü çizili + indirimli fiyatı verir; ayrı oes-old-price fazlalıktı ?>
                        <span class="oes-price"><?php echo $product->get_price_html(); ?></span>
                        <?php endif; ?>
                    </div>
                    
                    <?php 
                    // Kayıtlı ise hangi döneme kayıtlı göster
                    if ($is_enrolled) {
                        $enrollment = $wpdb->get_row($wpdb->prepare(
                            "SELECT pe.period_id, p.name as period_name, p.start_date, p.end_date
                             FROM {$wpdb->prefix}oes_period_enrollments pe
                             INNER JOIN {$wpdb->prefix}oes_periods p ON pe.period_id = p.id
                             WHERE pe.user_id = %d AND p.course_id = %d
                             ORDER BY pe.enrolled_at DESC LIMIT 1",
                            $user_id, $product_id
                        ));
                        if ($enrollment && $enrollment->period_name): ?>
                        <div class="oes-enrolled-period">
                            <span class="oes-enrolled-period-label">Kayıtlı Dönem</span>
                            <span class="oes-enrolled-period-name"><?php echo esc_html($enrollment->period_name); ?></span>
                            <?php if ($enrollment->start_date && $enrollment->end_date): ?>
                            <span class="oes-enrolled-period-dates">
                                <?php echo date_i18n('d M Y', strtotime($enrollment->start_date)); ?> - <?php echo date_i18n('d M Y', strtotime($enrollment->end_date)); ?>
                            </span>
                            <?php endif; ?>
                        </div>
                        <?php endif;
                    }
                    ?>
                    
                    <div class="oes-card-buttons">
                        <?php if ($is_enrolled): ?>
                        <a href="<?php echo esc_url($player_url); ?>" class="oes-btn oes-btn-primary">Kursu İzle</a>
                        <?php elseif ($is_course_closed): ?>
                            <div class="oes-course-expired">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
                                <span>Bu eğitim artık yayında değil</span>
                            </div>
                        <?php elseif ($is_course_expired): ?>
                            <div class="oes-course-expired">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                <span>Bu eğitimin süresi bitti</span>
                            </div>
                        <?php elseif ($is_free_course): ?>
                            <form class="cart" method="post" action="<?php echo esc_url(wc_get_checkout_url()); ?>">
                                <input type="hidden" name="add-to-cart" value="<?php echo $product_id; ?>">
                                <button type="submit" class="oes-btn oes-btn-primary">Ücretsiz Kayıt Ol</button>
                            </form>
                        <?php else: ?>
                            <?php if ($button_type === 'cart' || $button_type === 'both'): ?>
                            <form class="cart" method="post" action="<?php echo esc_url($product->get_permalink()); ?>">
                                <?php 
                                // Dönem seçici FORM İÇİNDE olmalı
                                echo oes_render_period_selector($product_id);
                                ?>
                                <button type="submit" name="add-to-cart" value="<?php echo $product_id; ?>" class="oes-btn oes-btn-primary">Hemen Kayıt Ol</button>
                            </form>
                            <?php endif; ?>
                            <?php if ($button_type === 'whatsapp' || $button_type === 'both'): ?>
                            <a href="<?php echo esc_url($whatsapp_url); ?>" target="_blank" class="oes-btn oes-btn-whatsapp">
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;vertical-align:middle;flex-shrink:0"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    WhatsApp ile İletişime Geç
</a>
                            <?php endif; ?>
                        <?php endif; ?>
                    </div>
                    
                    <div class="oes-card-features">
                        <h4>Bu Kurs Dahilinde</h4>
                        <ul>
                            <?php if ($total_lessons > 0 || $lessons): ?>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                                <?php echo $total_lessons ?: $lessons; ?> video ders
                            </li>
                            <?php endif; ?>
                            <?php if ($duration_text): ?>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                                <?php echo esc_html($duration_text); ?> içerik
                            </li>
                            <?php endif; ?>
                            <?php if ($lifetime === 'yes'): ?>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4"/></svg>
                                Ömür boyu erişim
                            </li>
                            <?php endif; ?>
                            <?php if ($certificate === 'yes'): ?>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/></svg>
                                Sertifika
                            </li>
                            <?php endif; ?>
                            <li>
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                                Tüm cihazlarda izle
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </aside>
    </div>
    
    <div class="oes-mobile-bottom-bar">
        <?php if ($is_enrolled): ?>
        <div class="oes-mobile-enrolled">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Kayıtlısınız
        </div>
        <a href="<?php echo esc_url($player_url); ?>" class="oes-btn oes-btn-primary">Kursu İzle</a>
        <?php elseif ($is_course_closed): ?>
        <div class="oes-course-expired oes-course-expired-mobile">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
            <span>Bu eğitim artık yayında değil</span>
        </div>
        <?php elseif ($is_course_expired): ?>
        <div class="oes-course-expired oes-course-expired-mobile">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Bu eğitimin süresi bitti</span>
        </div>
        <?php else: ?>
        <div class="oes-mobile-price">
            <span class="oes-price"><?php echo $product->get_price_html(); ?></span>
        </div>
        <div class="oes-mobile-buttons">
            <?php if ($button_type === 'cart' || $button_type === 'both'): ?>
            <form class="cart oes-mobile-cart-form" method="post" action="<?php echo esc_url($product->get_permalink()); ?>">
                <?php 
                // Dönem seçici mobil buton
                if ($is_period_based):
                    // Hidden input - lightbox'tan gelecek
                    echo '<input type="hidden" name="oes_period" class="oes-period-sync" value="">';
                    // Mobil dönem butonu
                    echo '<button type="button" class="oes-mobile-period-btn" id="oesMobilePeriodBtn">';
                    echo '<span class="oes-mpb-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>';
                    echo '<span class="oes-mpb-text" id="oesMobilePeriodText">Dönem Seçiniz</span>';
                    echo '</button>';
                endif;
                ?>
                <button type="submit" name="add-to-cart" value="<?php echo $product_id; ?>" class="oes-btn oes-btn-primary">Kayıt Ol</button>
            </form>
            <?php endif; ?>
           <?php if ($button_type === 'whatsapp' || $button_type === 'both'): ?>
<a href="<?php echo esc_url($whatsapp_url); ?>" target="_blank" 
   class="oes-btn-whatsapp-mini<?php echo $button_type === 'whatsapp' ? ' oes-whatsapp-only' : ''; ?>">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
    <?php if ($button_type === 'whatsapp'): ?>
    <span>WhatsApp ile İletişime Geç</span>
    <?php endif; ?>
</a>
<?php endif; ?>
        </div>
        <?php endif; ?>
    </div>
</div>