<?php
/**
 * WooCommerce Hesabım - Eğitimlerim & Eğitim Takvimim Sekmeleri
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_My_Account {

    public function __construct() {
        // Menüye yeni sekmeler ekle
        add_filter('woocommerce_account_menu_items', array($this, 'add_menu_item'), 10);
        
        // Endpoint kaydet
        add_action('init', array($this, 'add_endpoint'));
        
        // Endpoint içerikleri
        add_action('woocommerce_account_egitimlerim_endpoint', array($this, 'endpoint_content'));
        add_action('woocommerce_account_egitim-takvimim_endpoint', array($this, 'calendar_endpoint_content'));
        
        // CSS
        add_action('wp_head', array($this, 'add_styles'));
        
        // Sipariş tamamlandığında cache temizle
        add_action('woocommerce_order_status_completed', array($this, 'clear_user_course_cache'));
    }
    
    /**
     * Kullanıcının tamamlanmış kurs ID'lerini cache ile al
     */
    public static function get_user_completed_courses($user_id) {
        $cache_key = 'oes_user_courses_' . $user_id;
        $course_ids = get_transient($cache_key);
        
        if ($course_ids === false) {
            global $wpdb;
            $course_ids = array();
            
            // 1. WooCommerce completed siparişlerinden
            $orders = wc_get_orders(array(
                'customer_id' => $user_id,
                'status' => 'completed',
                'limit' => -1
            ));
            
            foreach ($orders as $order) {
                foreach ($order->get_items() as $item) {
                    $product_id = $item->get_product_id();
                    if (get_post_meta($product_id, '_oes_is_course', true) === 'yes') {
                        $course_ids[] = $product_id;
                    }
                }
            }
            
            // 2. oes_enrollments tablosundan (ücretsiz kurslar dahil)
            $enrollments = $wpdb->get_col($wpdb->prepare(
                "SELECT DISTINCT course_id FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d",
                $user_id
            ));
            
            if ($enrollments) {
                $course_ids = array_merge($course_ids, $enrollments);
            }
            
            $course_ids = array_unique(array_map('intval', $course_ids));
            set_transient($cache_key, $course_ids, HOUR_IN_SECONDS);
        }
        
        return $course_ids;
    }
    
    public function clear_user_course_cache($order_id) {
        $order = wc_get_order($order_id);
        if ($order) {
            delete_transient('oes_user_courses_' . $order->get_user_id());
        }
    }

    public function add_endpoint() {
        // Endpoint'ler her zaman kaydedilir ki rewrite kuralları oluşsun.
        // Menüde görünüp görünmemesi add_menu_item içinde modüle göre belirlenir.
        add_rewrite_endpoint('egitimlerim', EP_ROOT | EP_PAGES);
        add_rewrite_endpoint('egitim-takvimim', EP_ROOT | EP_PAGES);
        add_rewrite_endpoint('gorevlerim', EP_ROOT | EP_PAGES);

        // Endpoint seti değiştiyse rewrite kurallarını bir kez yenile
        if (get_option('oes_endpoints_version') !== OES_VERSION) {
            flush_rewrite_rules(false);
            update_option('oes_endpoints_version', OES_VERSION);
        }
    }

    /**
     * WooCommerce "Hesabım" menüsü ARTIK KULLANILMIYOR.
     *
     * Öğrencinin tek yüzeyi kendi panelimiz ("Çalışma Odam" — /panel/). WC'nin
     * hesabım sayfası OES_Panel::redirect_account_to_panel ile oraya yönleniyor,
     * dolayısıyla buraya sekme eklemek ölü menü üretirdi. Endpoint kayıtları
     * (add_endpoint) eski bağlantılar 404 vermesin diye duruyor; içerikleri de
     * yönlendirme yakaladığı için hiç basılmaz.
     */
    public function add_menu_item($items) {
        return $items;
    }

    // Eğitim Takvimim içeriği
    public function calendar_endpoint_content() {
        $user_id = get_current_user_id();
        
        global $wpdb;
        
        // Cache'li kurs ID'leri al
        $completed_course_ids = self::get_user_completed_courses($user_id);
        
        // Tamamlanmış kursu yoksa boş göster
        if (empty($completed_course_ids)) {
            ?>
            <div class="oes-calendar-page">
                <h2>📅 Eğitim Takvimim</h2>
                <div class="oes-no-events">
                    <div class="oes-no-events-icon">📭</div>
                    <p>Henüz aktif eğitiminiz bulunmuyor.</p>
                    <small>Siparişiniz tamamlandığında eğitim takviminiz burada görünecek.</small>
                </div>
            </div>
            <?php
            return;
        }
        
        // Kullanıcının kayıtlı olduğu dönemleri ve etkinlikleri al (sadece tamamlanmış kurslar)
        $placeholders = implode(',', array_fill(0, count($completed_course_ids), '%d'));
        $query_params = array_merge(array($user_id), $completed_course_ids);
        
        $enrollments = $wpdb->get_results($wpdb->prepare("
            SELECT pe.*, p.name as period_name, p.start_date, p.end_date, p.schedule, p.course_id,
                   post.post_title as course_name
            FROM {$wpdb->prefix}oes_period_enrollments pe
            LEFT JOIN {$wpdb->prefix}oes_periods p ON pe.period_id = p.id
            LEFT JOIN {$wpdb->posts} post ON p.course_id = post.ID
            WHERE pe.user_id = %d AND p.course_id IN ($placeholders)
            ORDER BY p.start_date ASC
        ", $query_params));
        
        // Tüm etkinlikleri topla ve tarihe göre sırala
        $all_events = array();
        $today = date('Y-m-d');
        
        foreach ($enrollments as $enrollment) {
            $schedule = json_decode($enrollment->schedule, true) ?: array();
            foreach ($schedule as $event) {
                if (!empty($event['date'])) {
                    $all_events[] = array(
                        'date' => $event['date'],
                        'time' => $event['time'] ?? '',
                        'title' => $event['title'] ?? 'Etkinlik',
                        'link' => $event['link'] ?? '',
                        'notes' => $event['notes'] ?? '',
                        'course_name' => $enrollment->course_name,
                        'course_id' => $enrollment->course_id,
                        'period_name' => $enrollment->period_name,
                        'is_past' => $event['date'] < $today
                    );
                }
            }
        }
        
        // Tarihe göre sırala
        usort($all_events, function($a, $b) {
            $date_cmp = strcmp($a['date'], $b['date']);
            if ($date_cmp === 0 && !empty($a['time']) && !empty($b['time'])) {
                return strcmp($a['time'], $b['time']);
            }
            return $date_cmp;
        });
        
        // Gelecek ve geçmiş etkinlikleri ayır
        $upcoming_events = array_filter($all_events, function($e) { return !$e['is_past']; });
        $past_events = array_filter($all_events, function($e) { return $e['is_past']; });
        
        ?>
        <div class="oes-calendar-page">
            <h2>📅 Eğitim Takvimim</h2>
            
            <?php if (empty($all_events)): ?>
                <div class="oes-no-events">
                    <div class="oes-no-events-icon">📭</div>
                    <p>Henüz planlanmış etkinliğiniz bulunmuyor.</p>
                    <small>Bir döneme kayıt olduğunuzda etkinlikleriniz burada görünecek.</small>
                </div>
            <?php else: ?>
                
                <?php if (!empty($upcoming_events)): ?>
                <div class="oes-events-section">
                    <h3>Yaklaşan Etkinlikler</h3>
                    <div class="oes-events-list">
                        <?php foreach ($upcoming_events as $event): 
                            $event_date = strtotime($event['date']);
                            $is_today = $event['date'] === $today;
                            $is_tomorrow = $event['date'] === date('Y-m-d', strtotime('+1 day'));
                            $days_until = floor(($event_date - strtotime($today)) / 86400);
                        ?>
                        <div class="oes-event-card <?php echo $is_today ? 'is-today' : ($is_tomorrow ? 'is-tomorrow' : ''); ?>">
                            <div class="oes-event-top">
                                <div class="oes-event-date">
                                    <span class="oes-event-day"><?php echo date_i18n('d', $event_date); ?></span>
                                    <span class="oes-event-month"><?php echo date_i18n('M', $event_date); ?></span>
                                </div>
                                <div class="oes-event-content">
                                    <div class="oes-event-header">
                                        <h4><?php echo esc_html($event['title']); ?></h4>
                                        <?php if ($is_today): ?>
                                            <span class="oes-badge-today">Bugün</span>
                                        <?php elseif ($is_tomorrow): ?>
                                            <span class="oes-badge-tomorrow">Yarın</span>
                                        <?php elseif ($days_until <= 7): ?>
                                            <span class="oes-badge-soon"><?php echo $days_until; ?>g</span>
                                        <?php endif; ?>
                                    </div>
                                    <div class="oes-event-meta">
                                        <span>📚 <?php echo esc_html($event['course_name']); ?></span>
                                        <?php if (!empty($event['time'])): ?>
                                        <span>🕐 <?php echo esc_html($event['time']); ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </div>
                            <?php if (!empty($event['notes'])): ?>
                            <div class="oes-event-notes"><?php echo esc_html($event['notes']); ?></div>
                            <?php endif; ?>
                            <?php if (!empty($event['link'])): ?>
                            <div class="oes-event-actions">
                                <a href="<?php echo esc_url($event['link']); ?>" target="_blank" class="oes-event-link">Katıl →</a>
                            </div>
                            <?php endif; ?>
                        </div>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>
                
                <?php if (!empty($past_events)): ?>
                <div class="oes-events-section oes-past-events">
                    <h3>Geçmiş Etkinlikler</h3>
                    <div class="oes-events-list oes-events-collapsed">
                        <?php foreach (array_reverse($past_events) as $event): 
                            $event_date = strtotime($event['date']);
                        ?>
                        <div class="oes-event-card is-past">
                            <div class="oes-event-top">
                                <div class="oes-event-date">
                                    <span class="oes-event-day"><?php echo date_i18n('d', $event_date); ?></span>
                                    <span class="oes-event-month"><?php echo date_i18n('M', $event_date); ?></span>
                                </div>
                                <div class="oes-event-content">
                                    <div class="oes-event-header">
                                        <h4><?php echo esc_html($event['title']); ?></h4>
                                    </div>
                                    <div class="oes-event-meta">
                                        <span>📚 <?php echo esc_html($event['course_name']); ?></span>
                                        <?php if (!empty($event['time'])): ?>
                                        <span>🕐 <?php echo esc_html($event['time']); ?></span>
                                        <?php endif; ?>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>
                    <?php if (count($past_events) > 4): ?>
                    <button type="button" class="oes-show-more-btn" onclick="this.previousElementSibling.classList.toggle('oes-events-collapsed'); this.textContent = this.textContent === 'Tümünü Göster' ? 'Daha Az Göster' : 'Tümünü Göster';">
                        Tümünü Göster
                    </button>
                    <?php endif; ?>
                </div>
                <?php endif; ?>
                
            <?php endif; ?>
        </div>
        <?php
    }

    public function endpoint_content() {
        $user_id = get_current_user_id();
        
        global $wpdb;
        
        // Cache'li kurs ID'leri al
        $course_ids = self::get_user_completed_courses($user_id);
        
        if (!empty($course_ids)) {
            // Toplu olarak mevcut enrollment'ları kontrol et
            $ids_placeholder = implode(',', array_fill(0, count($course_ids), '%d'));
            $existing_enrollments = $wpdb->get_col(
                $wpdb->prepare(
                    "SELECT course_id FROM {$wpdb->prefix}oes_enrollments 
                     WHERE user_id = %d AND course_id IN ({$ids_placeholder})",
                    array_merge(array($user_id), $course_ids)
                )
            );
            
            // Eksik enrollment'ları toplu ekle
            $missing = array_diff($course_ids, $existing_enrollments);
            if (!empty($missing)) {
                $values = array();
                foreach ($missing as $course_id) {
                    $values[] = $wpdb->prepare("(%d, %d, 'active', %s)", $user_id, $course_id, current_time('mysql'));
                }
                if (!empty($values)) {
                    $wpdb->query("INSERT INTO {$wpdb->prefix}oes_enrollments (user_id, course_id, status, enrolled_at) VALUES " . implode(',', $values));
                }
            }
            
            // Tüm kursların progress'lerini tek sorguda al
            $progress_data = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT course_id, COUNT(*) as completed 
                     FROM {$wpdb->prefix}oes_progress 
                     WHERE user_id = %d AND course_id IN ({$ids_placeholder}) AND status = 'complete'
                     GROUP BY course_id",
                    array_merge(array($user_id), $course_ids)
                ),
                OBJECT_K
            );
        }
        
        $enrollments = $course_ids;

        ?>
        <div class="oes-my-courses">
            <h2>Eğitimlerim</h2>
            
            <?php if (empty($enrollments)): ?>
                <div class="oes-no-courses">
                    <p>Henüz kayıtlı olduğunuz bir eğitim bulunmuyor.</p>
                    <a href="<?php echo esc_url(get_permalink(wc_get_page_id('shop'))); ?>" class="button">Eğitimlere Göz At</a>
                </div>
            <?php else: ?>
                <div class="oes-courses-grid">
                    <?php foreach ($enrollments as $course_id): 
                        $product = wc_get_product($course_id);
                        if (!$product) continue;
                        
                        // İlerleme — birleşik: video/dosya + sınav + görev
                        if (class_exists('OES_Player')) {
                            $pp = OES_Player::compute_course_progress($course_id, get_current_user_id());
                            $total_lessons = $pp['total'];
                            $completed     = $pp['completed'];
                            $progress      = $pp['percent'];
                        } else {
                            $curriculum = get_post_meta($course_id, '_oes_course_curriculum', true) ?: array();
                            $total_lessons = 0;
                            foreach ($curriculum as $section) {
                                if (!empty($section['lessons'])) $total_lessons += count($section['lessons']);
                            }
                            $completed = isset($progress_data[$course_id]) ? intval($progress_data[$course_id]->completed) : 0;
                            $progress = $total_lessons > 0 ? round(($completed / $total_lessons) * 100) : 0;
                        }
                        
                        // Thumbnail
                        $image = $product->get_image('woocommerce_thumbnail');
                        
                        // URLs
                        $course_url = get_permalink($course_id); // Kurs sayfası
                        $player_url = add_query_arg('oes-player', $course_id, home_url('/kurs-izle/')); // Player
                    ?>
                    <div class="oes-course-card">
                        <div class="oes-course-image">
                            <a href="<?php echo esc_url($course_url); ?>">
                                <?php echo $image; ?>
                                <?php if ($progress == 100): ?>
                                    <span class="oes-badge oes-badge-complete">Tamamlandı</span>
                                <?php elseif ($progress > 0): ?>
                                    <span class="oes-badge oes-badge-progress">Devam Ediyor</span>
                                <?php endif; ?>
                            </a>
                        </div>
                        <div class="oes-course-info">
                            <h3><a href="<?php echo esc_url($course_url); ?>"><?php echo esc_html($product->get_name()); ?></a></h3>
                            
                            <div class="oes-course-meta">
                                <span><?php echo $completed; ?>/<?php echo $total_lessons; ?> ders</span>
                            </div>
                            
                            <div class="oes-progress-wrap">
                                <div class="oes-progress-bar">
                                    <div class="oes-progress-fill" style="width: <?php echo $progress; ?>%"></div>
                                </div>
                                <span class="oes-progress-text"><?php echo $progress; ?>%</span>
                            </div>
                            
                            <a href="<?php echo esc_url($player_url); ?>" class="oes-continue-btn">
                                <?php if ($progress == 0): ?>
                                    Eğitime Başla
                                <?php elseif ($progress == 100): ?>
                                    Tekrar İzle
                                <?php else: ?>
                                    Devam Et
                                <?php endif; ?>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                            </a>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }

    public function add_styles() {
        if (!is_account_page()) return;
        ?>
        <style>
            /* Eğitimlerim */
            .oes-my-courses h2 { margin-bottom: 24px; font-size: 24px; }
            .oes-no-courses { text-align: center; padding: 40px 20px; background: #f8fafc; border-radius: 12px; }
            .oes-no-courses p { margin-bottom: 16px; color: #64748b; }
            .oes-courses-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
            .oes-course-card { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: box-shadow 0.2s; }
            .oes-course-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
            .oes-course-image { position: relative; aspect-ratio: 16/9; overflow: hidden; }
            .oes-course-image img { width: 100%; height: 100%; object-fit: cover; }
            .oes-badge { position: absolute; top: 12px; right: 12px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
            .oes-badge-complete { background: #10b981; color: #fff; }
            .oes-badge-progress { background: #3b82f6; color: #fff; }
            .oes-course-info { padding: 16px; }
            .oes-course-info h3 { font-size: 16px; margin: 0 0 12px; line-height: 1.4; }
            .oes-course-info h3 a { color: inherit; text-decoration: none; }
            .oes-course-info h3 a:hover { color: #10b981; }
            .oes-course-meta { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 12px; }
            .oes-progress-wrap { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
            .oes-progress-bar { flex: 1; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
            .oes-progress-fill { height: 100%; background: #10b981; border-radius: 3px; transition: width 0.3s; }
            .oes-progress-text { font-size: 12px; font-weight: 600; color: #10b981; min-width: 36px; }
            .oes-continue-btn { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; background: #10b981; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; transition: background 0.2s; }
            .oes-continue-btn:hover { background: #059669; color: #fff; }
            
            /* Eğitim Takvimim - 2 Column Grid */
            .oes-calendar-page h2 { margin-bottom: 24px; font-size: 22px; font-weight: 600; color: #1e293b; }
            .oes-no-events { text-align: center; padding: 50px 20px; background: linear-gradient(135deg, #f8fafc, #f1f5f9); border-radius: 16px; border: 1px dashed #cbd5e1; }
            .oes-no-events-icon { font-size: 40px; margin-bottom: 12px; opacity: 0.6; }
            .oes-no-events p { margin: 0 0 4px; color: #475569; font-size: 15px; }
            .oes-no-events small { color: #94a3b8; font-size: 13px; }
            
            .oes-events-section { margin-bottom: 28px; }
            .oes-events-section h3 { font-size: 12px; margin-bottom: 14px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; }
            .oes-events-section h3::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
            
            .oes-events-list { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
            
            .oes-event-card { display: flex; flex-direction: column; padding: 16px; background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; transition: all 0.15s; }
            .oes-event-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .oes-event-card.is-today { border-color: #10b981; background: linear-gradient(135deg, #f0fdf4, #fff); }
            .oes-event-card.is-tomorrow { border-color: #3b82f6; background: linear-gradient(135deg, #eff6ff, #fff); }
            .oes-event-card.is-past { opacity: 0.5; }
            
            .oes-event-top { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 10px; }
            .oes-event-date { width: 48px; text-align: center; flex-shrink: 0; padding: 8px 0; background: #f1f5f9; border-radius: 8px; }
            .oes-event-card.is-today .oes-event-date { background: #10b981; }
            .oes-event-card.is-tomorrow .oes-event-date { background: #3b82f6; }
            .oes-event-day { font-size: 20px; font-weight: 700; line-height: 1; color: #1e293b; }
            .oes-event-card.is-today .oes-event-day,
            .oes-event-card.is-tomorrow .oes-event-day { color: #fff; }
            .oes-event-month { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; }
            .oes-event-card.is-today .oes-event-month,
            .oes-event-card.is-tomorrow .oes-event-month { color: rgba(255,255,255,0.9); }
            .oes-event-year { display: none; }
            
            .oes-event-content { flex: 1; min-width: 0; }
            .oes-event-main { flex: 1; }
            .oes-event-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; flex-wrap: wrap; }
            .oes-event-content h4 { margin: 0; font-size: 14px; color: #1e293b; font-weight: 600; }
            .oes-badge-today, .oes-badge-tomorrow, .oes-badge-soon { padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; }
            .oes-badge-today { background: #dcfce7; color: #166534; }
            .oes-badge-tomorrow { background: #dbeafe; color: #1e40af; }
            .oes-badge-soon { background: #fef3c7; color: #92400e; }
            
            .oes-event-meta { display: flex; align-items: center; gap: 10px; font-size: 11px; color: #64748b; }
            .oes-event-notes { font-size: 12px; color: #64748b; padding: 8px 10px; background: #f8fafc; border-radius: 6px; border-left: 3px solid #10b981; margin-bottom: 12px; }
            
            .oes-event-actions { margin-top: auto; }
            .oes-event-link { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; background: #3b82f6; color: #fff; border-radius: 8px; font-size: 12px; font-weight: 600; text-decoration: none; transition: all 0.15s; }
            .oes-event-link:hover { background: #2563eb; color: #fff; }
            
            .oes-past-events h3 { color: #94a3b8; }
            .oes-events-collapsed .oes-event-card:nth-child(n+5) { display: none; }
            .oes-show-more-btn { grid-column: 1 / -1; padding: 12px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; color: #64748b; font-size: 13px; font-weight: 500; cursor: pointer; }
            .oes-show-more-btn:hover { background: #f8fafc; }
            
            @media (max-width: 768px) {
                .oes-events-list { grid-template-columns: 1fr; }
            }
            
            @media (max-width: 600px) { 
                .oes-courses-grid { grid-template-columns: repeat(2, 1fr) }
            }
        </style>
        <?php
    }
}

new OES_My_Account();