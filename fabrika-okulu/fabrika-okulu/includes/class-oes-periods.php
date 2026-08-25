<?php
/**
 * Dönem Yönetimi - Admin
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Periods {

    public function __construct() {
        // Admin menü
        add_action('admin_menu', array($this, 'add_menu'), 20);
        
        // AJAX
        add_action('wp_ajax_oes_save_period', array($this, 'save_period'));
        add_action('wp_ajax_oes_delete_period', array($this, 'delete_period'));
        add_action('wp_ajax_oes_get_period', array($this, 'get_period'));
        add_action('wp_ajax_oes_get_periods_for_product', array($this, 'get_periods_for_product'));
        add_action('wp_ajax_oes_update_order_item_period', array($this, 'update_order_item_period'));
        
        // Ürün meta box
        add_action('add_meta_boxes', array($this, 'add_product_metabox'));
        add_action('woocommerce_process_product_meta', array($this, 'save_product_meta'));
        
        // Frontend hooks - Sadece validasyon ve sepet
        add_filter('woocommerce_add_to_cart_validation', array($this, 'validate_period_selection'), 10, 3);
        add_filter('woocommerce_add_cart_item_data', array($this, 'add_period_to_cart'), 10, 3);
        add_filter('woocommerce_get_item_data', array($this, 'display_period_in_cart'), 10, 2);
        add_action('woocommerce_checkout_create_order_line_item', array($this, 'save_period_to_order'), 10, 4);
        
        // Admin order
        add_action('woocommerce_admin_order_item_headers', array($this, 'admin_order_item_header'));
        add_action('woocommerce_admin_order_item_values', array($this, 'admin_order_item_value'), 10, 3);
        add_action('admin_footer', array($this, 'admin_order_period_script'));
    }

    public function add_menu() {
        add_submenu_page(
            'online-kurs-sistemi',
            'Dönemler',
            'Dönemler',
            'manage_options',
            'oes-periods',
            array($this, 'render_page')
        );
    }

    public function render_page() {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_periods';
        
        // Tüm yayındaki kurs ürünleri: dönem eklenince kurs otomatik "dönemli" olur,
        // bu yüzden burada dönemli/standart ayrımı yapmadan hepsini listeliyoruz.
        $courses = $wpdb->get_results("
            SELECT ID, post_title
            FROM {$wpdb->posts}
            WHERE post_type = 'product'
            AND post_status = 'publish'
            ORDER BY post_title
        ");
        
        // Tüm dönemleri al
        $periods = $wpdb->get_results("
            SELECT pr.*, p.post_title as course_name 
            FROM $table pr
            LEFT JOIN {$wpdb->posts} p ON pr.course_id = p.ID
            ORDER BY pr.start_date DESC
        ");
        ?>
        <div class="oes-admin-wrap fabo-wrap">
            <div class="fabo-head">
                <div>
                    <h1>Dönem Yönetimi</h1>
                    <p>Takvimli eğitimlerin dönemleri ve kontenjanları. Dönem eklenen eğitim otomatik olarak
                       <strong>takvimli</strong> olur. Eğitmenler dönemi kendi editörlerinden de yönetebilir —
                       orada gün gün ders programı ve başlangıç saati de girilir.</p>
                </div>
                <div class="fabo-head-actions">
                    <button type="button" class="button button-primary" id="addPeriodBtn">Yeni dönem</button>
                </div>
            </div>

            <?php if (empty($courses)): ?>
            <div class="oes-notice oes-notice-warning">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <div>
                    <strong>Yayında ürün bulunamadı!</strong>
                    <p>Önce bir kurs ürünü oluşturup yayınlayın; sonra buradan dönem ekleyebilirsiniz. Dönem eklenen kurs otomatik olarak dönemli olur.</p>
                </div>
            </div>
            <?php endif; ?>
            
            <div class="oes-admin-content">
                <!-- Dönem Listesi -->
                <div class="oes-periods-grid">
                    <?php if (empty($periods)): ?>
                        <div class="oes-empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            <h3>Henüz dönem eklenmemiş</h3>
                            <p>Yeni bir dönem ekleyerek başlayın</p>
                        </div>
                    <?php else: foreach ($periods as $period): 
                        $enrolled = $wpdb->get_var($wpdb->prepare(
                            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d",
                            $period->id
                        ));
                        $remaining = $period->capacity - $enrolled;
                        $status = $this->get_period_status($period);
                        $schedule = json_decode($period->schedule, true) ?: array();
                        $progress = ($enrolled / $period->capacity) * 100;
                    ?>
                        <div class="oes-period-card">
                            <div class="oes-period-header">
                                <span class="oes-status-badge oes-status-<?php echo $status['class']; ?>"><?php echo $status['label']; ?></span>
                                <div class="oes-period-actions">
                                    <button type="button" class="oes-icon-btn edit-period" data-id="<?php echo $period->id; ?>" title="Düzenle">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button type="button" class="oes-icon-btn oes-icon-btn-danger delete-period" data-id="<?php echo $period->id; ?>" title="Sil">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="oes-period-body">
                                <div class="oes-period-course"><?php echo esc_html($period->course_name); ?></div>
                                <h3 class="oes-period-name"><?php echo esc_html($period->name); ?></h3>
                                
                                <div class="oes-period-dates">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                    <?php echo date_i18n('d M Y', strtotime($period->start_date)); ?> - <?php echo date_i18n('d M Y', strtotime($period->end_date)); ?>
                                </div>
                                
                                <div class="oes-period-capacity">
                                    <div class="oes-capacity-header">
                                        <span>Kontenjan</span>
                                        <span class="oes-capacity-numbers"><?php echo $enrolled; ?> / <?php echo $period->capacity; ?></span>
                                    </div>
                                    <div class="oes-capacity-bar">
                                        <div class="oes-capacity-fill <?php echo $remaining <= 0 ? 'full' : ($remaining <= 5 ? 'warning' : ''); ?>" style="width: <?php echo min($progress, 100); ?>%"></div>
                                    </div>
                                    <?php if ($remaining <= 0): ?>
                                        <span class="oes-capacity-status full">Kontenjan doldu</span>
                                    <?php elseif ($remaining <= 5): ?>
                                        <span class="oes-capacity-status warning">Son <?php echo $remaining; ?> kişi!</span>
                                    <?php else: ?>
                                        <span class="oes-capacity-status"><?php echo $remaining; ?> kişilik yer var</span>
                                    <?php endif; ?>
                                </div>
                                
                                <?php if (!empty($schedule)): ?>
                                <div class="oes-period-schedule-count">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                    <?php echo count($schedule); ?> etkinlik planlandı
                                </div>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endforeach; endif; ?>
                </div>
            </div>
            
            <!-- Modal -->
            <div class="oes-modal" id="periodModal">
                <div class="oes-modal-backdrop"></div>
                <div class="oes-modal-content">
                    <div class="oes-modal-header">
                        <h2 id="modalTitle">Yeni Dönem</h2>
                        <button type="button" class="oes-modal-close" id="closeModal">&times;</button>
                    </div>
                    <form id="periodForm">
                        <div class="oes-modal-body">
                            <input type="hidden" name="period_id" id="periodId">
                            
                            <div class="oes-form-group">
                                <label>Kurs *</label>
                                <select name="course_id" id="courseId" required>
                                    <option value="">Kurs Seçin</option>
                                    <?php foreach ($courses as $course): ?>
                                        <option value="<?php echo $course->ID; ?>"><?php echo esc_html($course->post_title); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </div>
                            
                            <div class="oes-form-group">
                                <label>Dönem Adı *</label>
                                <input type="text" name="name" id="periodName" required placeholder="Örn: Ocak 2026 Dönemi">
                            </div>
                            
                            <div class="oes-form-row">
                                <div class="oes-form-group">
                                    <label>Başlangıç *</label>
                                    <input type="date" name="start_date" id="startDate" required>
                                </div>
                                <div class="oes-form-group">
                                    <label>Bitiş *</label>
                                    <input type="date" name="end_date" id="endDate" required>
                                </div>
                            </div>
                            
                            <div class="oes-form-row">
                                <div class="oes-form-group">
                                    <label>Kayıt Son Tarihi</label>
                                    <input type="date" name="enrollment_deadline" id="enrollmentDeadline">
                                    <span class="oes-help">Boş = başlangıca kadar</span>
                                </div>
                                <div class="oes-form-group">
                                    <label>Kontenjan *</label>
                                    <input type="number" name="capacity" id="capacity" required min="1" value="20">
                                </div>
                            </div>
                            
                            <div class="oes-form-group">
                                <label>Açıklama</label>
                                <textarea name="description" id="periodDesc" rows="2" placeholder="Kısa açıklama..."></textarea>
                            </div>
                            
                            <div class="oes-form-divider">
                                <span>Program / Takvim</span>
                            </div>
                            
                            <div id="scheduleList" class="oes-schedule-list"></div>
                            <button type="button" class="oes-btn oes-btn-outline" id="addScheduleItem">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                Etkinlik Ekle
                            </button>
                        </div>
                        <div class="oes-modal-footer">
                            <button type="button" class="oes-btn" id="cancelModal">İptal</button>
                            <button type="submit" class="oes-btn oes-btn-primary">Kaydet</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        
        <template id="scheduleItemTemplate">
            <div class="oes-schedule-item">
                <button type="button" class="oes-schedule-remove">&times;</button>
                <div class="oes-form-row">
                    <div class="oes-form-group">
                        <label>Tarih</label>
                        <input type="date" name="schedule_date[]">
                    </div>
                    <div class="oes-form-group">
                        <label>Saat</label>
                        <input type="time" name="schedule_time[]">
                    </div>
                </div>
                <div class="oes-form-group">
                    <label>Başlık</label>
                    <input type="text" name="schedule_title[]" placeholder="Canlı Ders - Modül 1">
                </div>
                <div class="oes-form-row">
                    <div class="oes-form-group">
                        <label>Zoom Link</label>
                        <input type="url" name="schedule_link[]" placeholder="https://zoom.us/j/...">
                    </div>
                    <div class="oes-form-group">
                        <label>Not</label>
                        <input type="text" name="schedule_notes[]" placeholder="Opsiyonel">
                    </div>
                </div>
            </div>
        </template>
        
        <?php if (class_exists('OES_Admin')) OES_Admin::oes_admin_styles(); ?>
        <style>
            .oes-admin-wrap { padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .oes-admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
            .oes-header-left h1 { margin: 0 0 4px; font-size: 24px; color: #1e293b; }
            .oes-header-left p { margin: 0; color: #64748b; font-size: 14px; }
            
            .oes-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid #e2e8f0; background: #fff; color: #334155; transition: all 0.2s; }
            .oes-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
            .oes-btn-primary { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; }
            .oes-btn-primary:hover { background: linear-gradient(135deg, #059669 0%, #047857 100%); }
            .oes-btn-outline { background: transparent; border: 1px dashed #cbd5e1; }
            .oes-btn-outline:hover { border-color: #10b981; color: #10b981; background: #ecfdf5; }
            
            .oes-icon-btn { width: 32px; height: 32px; border: none; background: transparent; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; transition: all 0.2s; }
            .oes-icon-btn:hover { background: #f1f5f9; color: #334155; }
            .oes-icon-btn-danger:hover { background: #fee2e2; color: #dc2626; }
            
            .oes-notice { display: flex; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 10px; margin-bottom: 20px; }
            .oes-notice-warning { background: #fffbeb; border: 1px solid #fcd34d; color: #92400e; }
            .oes-notice svg { flex-shrink: 0; margin-top: 2px; }
            .oes-notice strong { display: block; margin-bottom: 4px; }
            .oes-notice p { margin: 0; font-size: 13px; opacity: 0.9; }
            
            .oes-periods-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 20px; }
            .oes-period-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; transition: all 0.2s; }
            .oes-period-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-color: #cbd5e1; }
            .oes-period-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
            .oes-period-actions { display: flex; gap: 4px; }
            .oes-period-body { padding: 16px; }
            .oes-period-course { font-size: 12px; color: #64748b; margin-bottom: 4px; }
            .oes-period-name { margin: 0 0 12px; font-size: 16px; color: #1e293b; }
            .oes-period-dates { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #64748b; margin-bottom: 16px; }
            
            .oes-status-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
            .oes-status-active { background: #d1fae5; color: #059669; }
            .oes-status-upcoming { background: #dbeafe; color: #2563eb; }
            .oes-status-ended { background: #f3f4f6; color: #6b7280; }
            .oes-status-closed { background: #fef3c7; color: #d97706; }
            
            .oes-period-capacity { margin-bottom: 12px; }
            .oes-capacity-header { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; margin-bottom: 6px; }
            .oes-capacity-numbers { font-weight: 600; color: #334155; }
            .oes-capacity-bar { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
            .oes-capacity-fill { height: 100%; background: #10b981; border-radius: 3px; transition: width 0.3s; }
            .oes-capacity-fill.warning { background: #f59e0b; }
            .oes-capacity-fill.full { background: #ef4444; }
            .oes-capacity-status { font-size: 11px; color: #64748b; }
            .oes-capacity-status.warning { color: #d97706; }
            .oes-capacity-status.full { color: #dc2626; }
            
            .oes-period-schedule-count { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; padding-top: 12px; border-top: 1px solid #f1f5f9; }
            
            .oes-empty-state { grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #64748b; }
            .oes-empty-state h3 { margin: 16px 0 8px; color: #334155; }
            .oes-empty-state p { margin: 0; }
            
            /* Modal */
            .oes-modal { display: none; position: fixed; inset: 0; z-index: 100000; overflow-y: auto; }
            .oes-modal.open { display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; }
            .oes-modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); }
            .oes-modal-content { position: relative; width: 100%; max-width: 560px; background: #fff; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
            .oes-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e2e8f0; }
            .oes-modal-header h2 { margin: 0; font-size: 18px; color: #1e293b; }
            .oes-modal-close { width: 32px; height: 32px; border: none; background: #f1f5f9; border-radius: 8px; font-size: 20px; cursor: pointer; color: #64748b; }
            .oes-modal-close:hover { background: #e2e8f0; }
            .oes-modal-body { padding: 24px; max-height: 60vh; overflow-y: auto; }
            .oes-modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc; border-radius: 0 0 16px 16px; }
            
            .oes-form-group { margin-bottom: 16px; }
            .oes-form-group label { display: block; font-size: 13px; font-weight: 500; color: #334155; margin-bottom: 6px; }
            .oes-form-group input, .oes-form-group select, .oes-form-group textarea { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
            .oes-form-group input:focus, .oes-form-group select:focus, .oes-form-group textarea:focus { outline: none; border-color: #10b981; box-shadow: 0 0 0 3px rgba(16,185,129,0.1); }
            .oes-form-row { display: flex; gap: 16px; }
            .oes-form-row .oes-form-group { flex: 1; }
            .oes-help { font-size: 11px; color: #94a3b8; margin-top: 4px; display: block; }
            
            .oes-form-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #64748b; font-size: 13px; font-weight: 500; }
            .oes-form-divider::before, .oes-form-divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
            
            .oes-schedule-list { display: flex; flex-direction: column; gap: 12px; margin-bottom: 12px; }
            .oes-schedule-item { position: relative; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
            .oes-schedule-remove { position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border: none; background: #fee2e2; color: #dc2626; border-radius: 6px; cursor: pointer; font-size: 16px; }
            .oes-schedule-remove:hover { background: #fecaca; }
            .oes-schedule-item .oes-form-group { margin-bottom: 12px; }
            .oes-schedule-item .oes-form-group:last-child { margin-bottom: 0; }
            .oes-schedule-item .oes-form-row { margin-bottom: 12px; }
        </style>
        
        <script>
        jQuery(function($) {
            const nonce = '<?php echo wp_create_nonce("oes_periods_nonce"); ?>';
            const modal = $('#periodModal');
            
            // Yeni dönem
            $('#addPeriodBtn').on('click', function(e) {
                e.preventDefault();
                resetForm();
                $('#modalTitle').text('Yeni Dönem');
                modal.addClass('open');
            });
            
            // Modalı kapat
            $('#closeModal, #cancelModal, .oes-modal-backdrop').on('click', function() {
                modal.removeClass('open');
            });
            
            // Düzenle
            $(document).on('click', '.edit-period', function() {
                const id = $(this).data('id');
                $.post(ajaxurl, { action: 'oes_get_period', nonce: nonce, id: id }, function(res) {
                    if (res.success) {
                        const p = res.data;
                        $('#periodId').val(p.id);
                        $('#courseId').val(p.course_id);
                        $('#periodName').val(p.name);
                        $('#startDate').val(p.start_date);
                        $('#endDate').val(p.end_date);
                        $('#enrollmentDeadline').val(p.enrollment_deadline);
                        $('#capacity').val(p.capacity);
                        $('#periodDesc').val(p.description);
                        
                        $('#scheduleList').empty();
                        if (p.schedule && p.schedule.length) {
                            p.schedule.forEach(function(s) { addScheduleItem(s); });
                        }
                        
                        $('#modalTitle').text('Dönem Düzenle');
                        modal.addClass('open');
                    }
                });
            });
            
            // Sil
            $(document).on('click', '.delete-period', function() {
                if (!confirm('Bu dönemi silmek istediğinize emin misiniz?')) return;
                const id = $(this).data('id');
                $.post(ajaxurl, { action: 'oes_delete_period', nonce: nonce, id: id }, function(res) {
                    if (res.success) location.reload();
                    else alert(res.data || 'Hata oluştu');
                });
            });
            
            // Kaydet
            $('#periodForm').on('submit', function(e) {
                e.preventDefault();
                const $btn = $(this).find('button[type="submit"]');
                const btnText = $btn.text();
                $btn.prop('disabled', true).text('Kaydediliyor...');
                
                const data = $(this).serialize() + '&action=oes_save_period&nonce=' + nonce;
                $.post(ajaxurl, data, function(res) {
                    if (res.success) {
                        location.reload();
                    } else {
                        alert(res.data || 'Hata oluştu');
                        $btn.prop('disabled', false).text(btnText);
                    }
                }).fail(function() {
                    alert('Bağlantı hatası');
                    $btn.prop('disabled', false).text(btnText);
                });
            });
            
            // Etkinlik ekle
            $('#addScheduleItem').on('click', function() { addScheduleItem(); });
            
            $(document).on('click', '.oes-schedule-remove', function() {
                $(this).closest('.oes-schedule-item').remove();
            });
            
            function addScheduleItem(data) {
                const template = $('#scheduleItemTemplate').html();
                const $item = $(template);
                if (data) {
                    $item.find('[name="schedule_date[]"]').val(data.date);
                    $item.find('[name="schedule_time[]"]').val(data.time);
                    $item.find('[name="schedule_title[]"]').val(data.title);
                    $item.find('[name="schedule_link[]"]').val(data.link);
                    $item.find('[name="schedule_notes[]"]').val(data.notes);
                }
                $('#scheduleList').append($item);
            }
            
            function resetForm() {
                $('#periodForm')[0].reset();
                $('#periodId').val('');
                $('#scheduleList').empty();
            }
        });
        </script>
        <?php
    }

    private function get_period_status($period) {
        $now = current_time('Y-m-d');
        $deadline = $period->enrollment_deadline ?: $period->start_date;
        
        if ($now > $period->end_date) {
            return array('class' => 'ended', 'label' => 'Sona Erdi');
        } elseif ($now > $deadline) {
            return array('class' => 'closed', 'label' => 'Kayıt Kapalı');
        } elseif ($now >= $period->start_date) {
            return array('class' => 'active', 'label' => 'Aktif');
        } else {
            return array('class' => 'upcoming', 'label' => 'Yaklaşan');
        }
    }

    public function save_period() {
        check_ajax_referer('oes_periods_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        global $wpdb;
        $table = $wpdb->prefix . 'oes_periods';
        
        $id = intval($_POST['period_id'] ?? 0);
        $data = array(
            'course_id' => intval($_POST['course_id']),
            'name' => sanitize_text_field($_POST['name']),
            'start_date' => sanitize_text_field($_POST['start_date']),
            'end_date' => sanitize_text_field($_POST['end_date']),
            'enrollment_deadline' => sanitize_text_field($_POST['enrollment_deadline']) ?: null,
            'capacity' => intval($_POST['capacity']),
            'description' => sanitize_textarea_field($_POST['description'] ?? '')
        );
        
        // Schedule
        $schedule = array();
        if (!empty($_POST['schedule_date'])) {
            foreach ($_POST['schedule_date'] as $i => $date) {
                if (!empty($date) && !empty($_POST['schedule_title'][$i])) {
                    $schedule[] = array(
                        'date' => sanitize_text_field($date),
                        'time' => sanitize_text_field($_POST['schedule_time'][$i] ?? ''),
                        'title' => sanitize_text_field($_POST['schedule_title'][$i]),
                        'link' => esc_url_raw($_POST['schedule_link'][$i] ?? ''),
                        'notes' => sanitize_text_field($_POST['schedule_notes'][$i] ?? '')
                    );
                }
            }
        }
        $data['schedule'] = json_encode($schedule);
        
        if ($id) {
            $wpdb->update($table, $data, array('id' => $id));
        } else {
            $data['created_at'] = current_time('mysql');
            $wpdb->insert($table, $data);
        }

        // Dönem eklendi/güncellendi → kurs otomatik dönemli olsun
        self::refresh_period_flag($data['course_id']);

        wp_send_json_success();
    }

    public function delete_period() {
        check_ajax_referer('oes_periods_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        global $wpdb;
        $id = intval($_POST['id']);
        
        // Kayıtlı öğrenci var mı kontrol et
        $enrolled = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d",
            $id
        ));
        
        if ($enrolled > 0) {
            wp_send_json_error('Bu dönemde kayıtlı öğrenciler var, silinemez.');
        }

        $course_id = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT course_id FROM {$wpdb->prefix}oes_periods WHERE id = %d", $id));
        $wpdb->delete($wpdb->prefix . 'oes_periods', array('id' => $id));
        // Son dönem de silindiyse kurs otomatik "standart"a döner
        if ($course_id) self::refresh_period_flag($course_id);
        wp_send_json_success();
    }

    public function get_period() {
        check_ajax_referer('oes_periods_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetkiniz yok');

        global $wpdb;
        $id = intval($_POST['id']);
        
        $period = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_periods WHERE id = %d",
            $id
        ), ARRAY_A);
        
        if ($period) {
            $period['schedule'] = json_decode($period['schedule'], true) ?: array();
            wp_send_json_success($period);
        } else {
            wp_send_json_error('Dönem bulunamadı');
        }
    }

    // Ürün Meta Box
    public function add_product_metabox() {
        add_meta_box(
            'oes_period_settings',
            'Dönem Ayarları',
            array($this, 'render_product_metabox'),
            'product',
            'side',
            'default'
        );
    }

    public function render_product_metabox($post) {
        global $wpdb;
        $count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_periods WHERE course_id = %d", $post->ID));
        // Bayrağı görüntülerken de senkron tut
        self::refresh_period_flag($post->ID);
        ?>
        <?php if ($count > 0): ?>
        <p style="margin:0;color:#194977;"><span class="dashicons dashicons-yes-alt" style="color:#46b450;vertical-align:middle;"></span> <strong>Dönemli kurs</strong> — <?php echo $count; ?> dönem tanımlı.</p>
        <p class="description">Dönem eklendiği için bu kurs otomatik olarak dönemlidir. Ayrı bir işaret gerekmez.</p>
        <?php else: ?>
        <p style="margin:0;color:#64748b;"><span class="dashicons dashicons-minus" style="vertical-align:middle;"></span> Standart kurs.</p>
        <p class="description">“Dönemler” sayfasından dönem eklediğinde bu kurs otomatik olarak <strong>dönemli</strong> olur.</p>
        <?php endif; ?>
        <?php
        wp_nonce_field('oes_period_meta', 'oes_period_meta_nonce');
    }

    public function save_product_meta($post_id) {
        if (!isset($_POST['oes_period_meta_nonce']) || !wp_verify_nonce($_POST['oes_period_meta_nonce'], 'oes_period_meta')) {
            return;
        }
        // Manuel işaret kaldırıldı: bayrak dönem sayısından otomatik türetilir.
        self::refresh_period_flag($post_id);
    }

    /** Kursun dönem sayısına göre _oes_period_based bayrağını otomatik ayarlar. */
    public static function refresh_period_flag($course_id) {
        $course_id = intval($course_id);
        if (!$course_id) return;
        global $wpdb;
        $count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_periods WHERE course_id = %d", $course_id));
        update_post_meta($course_id, '_oes_period_based', $count > 0 ? 'yes' : 'no');
    }


    // Sepete eklerken dönem validasyonu
    public function validate_period_selection($passed, $product_id, $quantity) {
        $is_period_based = get_post_meta($product_id, '_oes_period_based', true);
        
        if ($is_period_based === 'yes') {
            if (empty($_POST['oes_period'])) {
                wc_add_notice('Lütfen bir dönem seçin.', 'error');
                return false;
            }
            
            // Kontenjan kontrolü
            global $wpdb;
            $period_id = intval($_POST['oes_period']);
            
            $period = $wpdb->get_row($wpdb->prepare(
                "SELECT capacity FROM {$wpdb->prefix}oes_periods WHERE id = %d",
                $period_id
            ));
            
            if (!$period) {
                wc_add_notice('Geçersiz dönem seçimi.', 'error');
                return false;
            }
            
            $enrolled = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d",
                $period_id
            ));
            
            if ($enrolled >= $period->capacity) {
                wc_add_notice('Seçtiğiniz dönemin kontenjanı dolmuştur. Lütfen başka bir dönem seçin.', 'error');
                return false;
            }
        }
        
        return $passed;
    }

    // Sepete dönem ekle
    public function add_period_to_cart($cart_item_data, $product_id, $variation_id) {
        if (isset($_POST['oes_period']) && !empty($_POST['oes_period'])) {
            $cart_item_data['oes_period_id'] = intval($_POST['oes_period']);
        }
        return $cart_item_data;
    }

    // Sepette dönem göster
    public function display_period_in_cart($item_data, $cart_item) {
        if (isset($cart_item['oes_period_id'])) {
            global $wpdb;
            $period = $wpdb->get_row($wpdb->prepare(
                "SELECT name, start_date, end_date FROM {$wpdb->prefix}oes_periods WHERE id = %d",
                $cart_item['oes_period_id']
            ));
            
            if ($period) {
                $item_data[] = array(
                    'key' => 'Dönem',
                    'value' => $period->name . ' (' . date_i18n('d M', strtotime($period->start_date)) . ' - ' . date_i18n('d M Y', strtotime($period->end_date)) . ')'
                );
            }
        }
        return $item_data;
    }

    // Siparişe dönem kaydet
    public function save_period_to_order($item, $cart_item_key, $values, $order) {
        if (isset($values['oes_period_id'])) {
            $item->add_meta_data('_oes_period_id', $values['oes_period_id'], true);
            
            global $wpdb;
            $period = $wpdb->get_row($wpdb->prepare(
                "SELECT name FROM {$wpdb->prefix}oes_periods WHERE id = %d",
                $values['oes_period_id']
            ));
            if ($period) {
                $item->add_meta_data('Dönem', $period->name, true);
            }
        }
    }

    // Admin sipariş dönem göster
    public function admin_order_item_header() {
        echo '<th class="oes-period-col">Dönem</th>';
    }

    public function admin_order_item_value($product, $item, $item_id) {
        $period_id = $item->get_meta('_oes_period_id');
        $product_id = $item->get_product_id();
        $is_period_based = get_post_meta($product_id, '_oes_period_based', true);
        
        echo '<td class="oes-period-col">';
        
        if ($is_period_based === 'yes') {
            global $wpdb;
            
            // Tüm dönemleri al
            $periods = $wpdb->get_results($wpdb->prepare("
                SELECT p.*, 
                       (SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = p.id) as enrolled
                FROM {$wpdb->prefix}oes_periods p
                WHERE p.course_id = %d
                ORDER BY p.start_date DESC
            ", $product_id));
            
            if (!empty($periods)) {
                ?>
                <select class="oes-admin-period-select" 
                        data-item-id="<?php echo esc_attr($item_id); ?>" 
                        data-product-id="<?php echo esc_attr($product_id); ?>"
                        style="width:100%;max-width:200px;">
                    <option value="">-- Dönem Seç --</option>
                    <?php foreach ($periods as $p): 
                        $remaining = $p->capacity - $p->enrolled;
                        $status = '';
                        if ($remaining <= 0) $status = ' (DOLU)';
                        elseif ($remaining <= 5) $status = ' (Son ' . $remaining . ')';
                    ?>
                    <option value="<?php echo $p->id; ?>" <?php selected($period_id, $p->id); ?>>
                        <?php echo esc_html($p->name . $status); ?>
                    </option>
                    <?php endforeach; ?>
                </select>
                <span class="oes-period-save-status" style="display:none;margin-left:5px;color:#10b981;">✓</span>
                <?php
            } else {
                echo '<em style="color:#999;">Dönem yok</em>';
            }
        } else {
            echo '<span style="color:#999;">-</span>';
        }
        
        echo '</td>';
    }

    // AJAX: Ürün için dönemleri getir (admin sipariş için)
    public function get_periods_for_product() {
        check_ajax_referer('oes_periods_nonce', 'nonce');
        if (!current_user_can('edit_posts')) wp_send_json_error('Yetkiniz yok');

        global $wpdb;
        $product_id = intval($_POST['product_id']);
        $now = current_time('Y-m-d');
        
        $periods = $wpdb->get_results($wpdb->prepare("
            SELECT id, name, start_date, end_date
            FROM {$wpdb->prefix}oes_periods
            WHERE course_id = %d
            AND end_date >= %s
            ORDER BY start_date ASC
        ", $product_id, $now));
        
        wp_send_json_success($periods);
    }
    
    // Sipariş tamamlandığında dönem kaydı oluştur
    public static function on_order_completed($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) return;
        
        $user_id = $order->get_user_id();
        if (!$user_id) return;
        
        global $wpdb;
        
        foreach ($order->get_items() as $item) {
            $product_id = $item->get_product_id();
            
            // Sadece dönem bazlı kursları işle
            $is_period_based = get_post_meta($product_id, '_oes_period_based', true);
            if ($is_period_based !== 'yes') continue;
            
            $period_id = intval($item->get_meta('_oes_period_id'));
            
            // Dönem seçilmemişse → bu kursa ait en yakın açık dönemi otomatik bul
            if (!$period_id) {
                $now = current_time('Y-m-d');
                $auto_period = $wpdb->get_row($wpdb->prepare(
                    "SELECT p.id, p.capacity,
                            (SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = p.id) as enrolled
                     FROM {$wpdb->prefix}oes_periods p
                     WHERE p.course_id = %d
                       AND (p.enrollment_deadline IS NULL OR p.enrollment_deadline >= %s)
                       AND p.end_date >= %s
                     ORDER BY p.start_date ASC
                     LIMIT 1",
                    $product_id, $now, $now
                ));
                
                if ($auto_period && $auto_period->enrolled < $auto_period->capacity) {
                    $period_id = $auto_period->id;
                    // Sipariş meta'sına da kaydet (admin panelde görünsün)
                    wc_update_order_item_meta($item->get_id(), '_oes_period_id', $period_id);
                    $period_name = $wpdb->get_var($wpdb->prepare(
                        "SELECT name FROM {$wpdb->prefix}oes_periods WHERE id = %d", $period_id
                    ));
                    if ($period_name) {
                        wc_update_order_item_meta($item->get_id(), '_oes_period_name', $period_name);
                    }
                }
            }
            
            if (!$period_id) continue;
            
            // Zaten kayıtlı mı kontrol et
            $exists = $wpdb->get_var($wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d AND user_id = %d",
                $period_id, $user_id
            ));
            
            if (!$exists) {
                // Kontenjan kontrolü
                $period = $wpdb->get_row($wpdb->prepare(
                    "SELECT capacity FROM {$wpdb->prefix}oes_periods WHERE id = %d",
                    $period_id
                ));
                
                $enrolled = $wpdb->get_var($wpdb->prepare(
                    "SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = %d",
                    $period_id
                ));
                
                if ($period && $enrolled < $period->capacity) {
                    $wpdb->insert(
                        $wpdb->prefix . 'oes_period_enrollments',
                        array(
                            'period_id' => $period_id,
                            'user_id'   => $user_id,
                            'order_id'  => $order_id,
                            'enrolled_at' => current_time('mysql')
                        ),
                        array('%d', '%d', '%d', '%s')
                    );
                }
            }
        }
    }
    
    // AJAX: Sipariş item dönemini güncelle
    public function update_order_item_period() {
        check_ajax_referer('oes_admin_period_nonce', 'nonce');
        
        if (!current_user_can('edit_shop_orders')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $item_id = intval($_POST['item_id']);
        $period_id = intval($_POST['period_id']);
        $order_id = intval($_POST['order_id']);
        
        global $wpdb;
        
        // Eski dönem ID'sini al
        $old_period_id = wc_get_order_item_meta($item_id, '_oes_period_id', true);
        
        // Yeni dönemi kaydet
        wc_update_order_item_meta($item_id, '_oes_period_id', $period_id);
        
        // Dönem adını da kaydet
        if ($period_id) {
            $period = $wpdb->get_row($wpdb->prepare(
                "SELECT name FROM {$wpdb->prefix}oes_periods WHERE id = %d",
                $period_id
            ));
            if ($period) {
                wc_update_order_item_meta($item_id, '_oes_period_name', $period->name);
            }
        } else {
            wc_delete_order_item_meta($item_id, '_oes_period_name');
        }
        
        // Eğer sipariş tamamlandıysa enrollment tablosunu güncelle
        $order = wc_get_order($order_id);
        if ($order && in_array($order->get_status(), array('completed', 'processing'))) {
            $user_id = $order->get_user_id();
            
            if ($user_id) {
                // Eski enrollment'ı sil
                if ($old_period_id) {
                    $wpdb->delete(
                        $wpdb->prefix . 'oes_period_enrollments',
                        array(
                            'period_id' => $old_period_id,
                            'user_id' => $user_id,
                            'order_id' => $order_id
                        ),
                        array('%d', '%d', '%d')
                    );
                }
                
                // Yeni enrollment oluştur
                if ($period_id) {
                    $exists = $wpdb->get_var($wpdb->prepare(
                        "SELECT id FROM {$wpdb->prefix}oes_period_enrollments 
                         WHERE period_id = %d AND user_id = %d",
                        $period_id, $user_id
                    ));
                    
                    if (!$exists) {
                        $wpdb->insert(
                            $wpdb->prefix . 'oes_period_enrollments',
                            array(
                                'period_id' => $period_id,
                                'user_id' => $user_id,
                                'order_id' => $order_id,
                                'enrolled_at' => current_time('mysql')
                            ),
                            array('%d', '%d', '%d', '%s')
                        );
                    }
                }
            }
        }
        
        wp_send_json_success(array('message' => 'Dönem güncellendi'));
    }
    
    // Admin sipariş sayfası script
    public function admin_order_period_script() {
        $screen = get_current_screen();
        if (!$screen || ($screen->id !== 'shop_order' && $screen->id !== 'woocommerce_page_wc-orders')) {
            return;
        }
        
        // Order ID'yi al
        $order_id = 0;
        if (isset($_GET['id'])) {
            $order_id = intval($_GET['id']);
        } elseif (isset($_GET['post'])) {
            $order_id = intval($_GET['post']);
        }
        ?>
        <script>
        jQuery(function($) {
            $('.oes-admin-period-select').on('change', function() {
                var $select = $(this);
                var $status = $select.next('.oes-period-save-status');
                var itemId = $select.data('item-id');
                var periodId = $select.val();
                var orderId = <?php echo $order_id; ?>;
                
                $select.prop('disabled', true);
                
                $.ajax({
                    url: ajaxurl,
                    type: 'POST',
                    data: {
                        action: 'oes_update_order_item_period',
                        nonce: '<?php echo wp_create_nonce('oes_admin_period_nonce'); ?>',
                        item_id: itemId,
                        period_id: periodId,
                        order_id: orderId
                    },
                    success: function(response) {
                        $select.prop('disabled', false);
                        if (response.success) {
                            $status.fadeIn().delay(2000).fadeOut();
                        } else {
                            alert('Hata: ' + (response.data || 'Dönem güncellenemedi'));
                        }
                    },
                    error: function() {
                        $select.prop('disabled', false);
                        alert('Bağlantı hatası');
                    }
                });
            });
        });
        </script>
        <style>
        .oes-period-col { min-width: 150px; }
        .oes-admin-period-select { 
            padding: 5px 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .oes-admin-period-select:focus {
            border-color: #2271b1;
            outline: none;
        }
        </style>
        <?php
    }
}

// Sipariş tamamlandığında hook
add_action('woocommerce_order_status_completed', array('OES_Periods', 'on_order_completed'));
add_action('woocommerce_order_status_processing', array('OES_Periods', 'on_order_completed'));

new OES_Periods();