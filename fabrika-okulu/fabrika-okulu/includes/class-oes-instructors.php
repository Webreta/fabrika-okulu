<?php
/**
 * Eğitmen Yönetimi
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Instructors {

    public function __construct() {
        // Admin menü
        add_action('admin_menu', array($this, 'add_menu'), 15);
        
        // AJAX
        add_action('wp_ajax_oes_save_instructor', array($this, 'save_instructor'));
        add_action('wp_ajax_oes_save_instructor_meta', array($this, 'ajax_save_instructor_meta'));
        add_action('wp_ajax_oes_delete_instructor', array($this, 'delete_instructor'));
        add_action('wp_ajax_oes_get_instructor', array($this, 'get_instructor'));
        
        // Ürün meta box
        // Metabox ve save: class-oes-wc-integration.php'de yönetiliyor
        // Fallback: save_post ile de dene
        
        // Veritabanı tablosu - sadece eğitmenler sayfasında ve bir kez
        if (is_admin() && isset($_GET['page']) && $_GET['page'] === 'oes-instructors') {
            $this->maybe_create_table();
        }
        
        // Media uploader için script
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_scripts'));
    }
    
    public function enqueue_admin_scripts($hook) {
        // Sadece eğitmenler sayfasında yükle
        if (strpos($hook, 'oes-instructors') === false) {
            return;
        }
        wp_enqueue_media();
    }

    public function maybe_create_table() {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        $charset_collate = $wpdb->get_charset_collate();
        
        // Tablo yoksa oluştur
        $sql = "CREATE TABLE IF NOT EXISTS $table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            name varchar(255) NOT NULL,
            title varchar(255) DEFAULT '',
            email varchar(255) DEFAULT '',
            phone varchar(50) DEFAULT '',
            bio text,
            photo_url varchar(500) DEFAULT '',
            social_links text,
            status varchar(20) DEFAULT 'active',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        dbDelta($sql);
        
        // Mevcut tabloya eksik kolonları ekle
        $columns = $wpdb->get_col("DESCRIBE $table", 0);
        if (!in_array('email', $columns)) {
            $wpdb->query("ALTER TABLE $table ADD COLUMN email varchar(255) DEFAULT '' AFTER title");
        }
        if (!in_array('phone', $columns)) {
            $wpdb->query("ALTER TABLE $table ADD COLUMN phone varchar(50) DEFAULT '' AFTER email");
        }
        if (!in_array('social_links', $columns)) {
            $wpdb->query("ALTER TABLE $table ADD COLUMN social_links text AFTER photo_url");
        }
    }

    public function add_menu() {
        add_submenu_page(
            'online-kurs-sistemi',
            'Eğitmenler',
            'Eğitmenler',
            'manage_options',
            'oes-instructors',
            array($this, 'render_page')
        );
    }

    public function render_page() {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        
        $instructors = $wpdb->get_results("SELECT * FROM $table ORDER BY name ASC");
        
        // Her eğitmenin kurs sayısını al
        foreach ($instructors as &$instructor) {
            $instructor->course_count = $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = '_oes_instructor_id' AND meta_value = %d",
                $instructor->id
            ));
        }
        unset($instructor);

        // Eğitmen bağlama için WP kullanıcı listesi (ilk 500)
        $all_users = get_users(array('orderby' => 'display_name', 'number' => 500));

        // Bağlı kullanıcı adı haritası (kartlarda göstermek için)
        $teacher_slug = home_url('/egitmen/');
        ?>
        <div class="oes-admin-wrap fabo-wrap">
            <?php if (class_exists('OES_Admin')) OES_Admin::oes_admin_styles(); ?>
            <div class="fabo-head">
                <div>
                    <h1>Eğitmenler</h1>
                    <p>Eğitmen profilleri. Bir kullanıcıya <strong>eğitmen paneli</strong> yetkisi vermek için
                       Kullanıcılar → profil → “Eğitmen yetkisi”ni işaretleyin; panel adresi
                       <code><?php echo esc_html($teacher_slug); ?></code>.</p>
                </div>
                <div class="fabo-head-actions">
                    <button type="button" class="button button-primary" id="addInstructorBtn">Yeni eğitmen</button>
                </div>
            </div>

            <div class="oes-admin-content">
                <div class="oes-cards-grid">
                    <?php if (empty($instructors)): ?>
                        <div class="oes-empty-state">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                                <circle cx="12" cy="7" r="4"/>
                            </svg>
                            <h3>Henüz eğitmen eklenmemiş</h3>
                            <p>Yeni bir eğitmen ekleyerek başlayın</p>
                        </div>
                    <?php else: foreach ($instructors as $instructor): 
                        $initials = $this->get_initials($instructor->name);
                        $social = json_decode($instructor->social_links, true) ?: array();
                    ?>
                        <div class="oes-card oes-instructor-card">
                            <div class="oes-card-header">
                                <span class="oes-status-badge oes-status-<?php echo $instructor->status === 'active' ? 'active' : 'inactive'; ?>">
                                    <?php echo $instructor->status === 'active' ? 'Aktif' : 'Pasif'; ?>
                                </span>
                                <div class="oes-card-actions">
                                    <button type="button" class="oes-icon-btn edit-instructor" data-id="<?php echo $instructor->id; ?>" title="Düzenle">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                    </button>
                                    <button type="button" class="oes-icon-btn oes-icon-btn-danger delete-instructor" data-id="<?php echo $instructor->id; ?>" title="Sil">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="oes-card-body">
                                <div class="oes-instructor-profile">
                                    <div class="oes-avatar oes-avatar-lg">
                                        <?php if (!empty($instructor->photo_url)): ?>
                                            <img src="<?php echo esc_url($instructor->photo_url); ?>" alt="<?php echo esc_attr($instructor->name); ?>">
                                        <?php else: ?>
                                            <?php echo $initials; ?>
                                        <?php endif; ?>
                                    </div>
                                    <div class="oes-instructor-info">
                                        <h3><?php echo esc_html($instructor->name); ?></h3>
                                        <?php if (!empty($instructor->title)): ?>
                                        <p class="oes-instructor-title"><?php echo esc_html($instructor->title); ?></p>
                                        <?php endif; ?>
                                    </div>
                                </div>
                                
                                <?php if (!empty($instructor->bio)): ?>
                                <p class="oes-instructor-bio"><?php echo wp_trim_words(esc_html($instructor->bio), 20); ?></p>
                                <?php endif; ?>
                                
                                <div class="oes-instructor-meta">
                                    <?php if (!empty($instructor->email)): ?>
                                    <span title="<?php echo esc_attr($instructor->email); ?>">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    </span>
                                    <?php endif; ?>
                                    <?php if (!empty($instructor->phone)): ?>
                                    <span title="<?php echo esc_attr($instructor->phone); ?>">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/></svg>
                                    </span>
                                    <?php endif; ?>
                                    <?php if (!empty($social['linkedin'])): ?>
                                    <a href="<?php echo esc_url($social['linkedin']); ?>" target="_blank" title="LinkedIn">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
                                    </a>
                                    <?php endif; ?>
                                    <?php if (!empty($social['instagram'])): ?>
                                    <a href="<?php echo esc_url($social['instagram']); ?>" target="_blank" title="Instagram">
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1112.63 8 4 4 0 0116 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
                                    </a>
                                    <?php endif; ?>
                                </div>
                            </div>
                            
                            <div class="oes-card-footer">
                                <div class="oes-instructor-stats">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                                    <span><?php echo $instructor->course_count; ?> kurs</span>
                                </div>
                                <?php if (!empty($instructor->user_id)):
                                    $tu = get_userdata($instructor->user_id);
                                ?>
                                <span class="oes-teacher-chip" title="Eğitmen hesabı bağlı">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                                    Eğitmen<?php echo $tu ? ' · ' . esc_html($tu->display_name) : ''; ?>
                                </span>
                                <?php endif; ?>
                            </div>
                        </div>
                    <?php endforeach; endif; ?>
                </div>
            </div>
        </div>
        
        <!-- Modal -->
        <div class="oes-modal" id="instructorModal">
            <div class="oes-modal-backdrop"></div>
            <div class="oes-modal-content">
                <div class="oes-modal-header">
                    <h2 id="modalTitle">Yeni Eğitmen</h2>
                    <button type="button" class="oes-modal-close" id="closeModal">&times;</button>
                </div>
                <div class="oes-modal-body">
                    <form id="instructorForm">
                        <input type="hidden" id="instructorId" name="id" value="">
                        
                        <div class="oes-form-row">
                            <div class="oes-form-group" style="flex:0 0 120px;">
                                <label>Fotoğraf</label>
                                <div class="oes-image-upload" id="photoUpload">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                    <span>Yükle</span>
                                </div>
                                <input type="hidden" id="photoUrl" name="photo_url" value="">
                            </div>
                            <div style="flex:1;">
                                <div class="oes-form-group">
                                    <label for="instructorName">Ad Soyad *</label>
                                    <input type="text" id="instructorName" name="name" required>
                                </div>
                                <div class="oes-form-group">
                                    <label for="instructorTitle">Ünvan</label>
                                    <input type="text" id="instructorTitle" name="title" placeholder="Örn: Yazılım Mühendisi, PhD">
                                </div>
                            </div>
                        </div>
                        
                        <div class="oes-form-row">
                            <div class="oes-form-group">
                                <label for="instructorEmail">E-posta</label>
                                <input type="email" id="instructorEmail" name="email">
                            </div>
                            <div class="oes-form-group">
                                <label for="instructorPhone">Telefon</label>
                                <input type="text" id="instructorPhone" name="phone">
                            </div>
                        </div>
                        
                        <div class="oes-form-group">
                            <label for="instructorBio">Biyografi</label>
                            <textarea id="instructorBio" name="bio" rows="4" placeholder="Eğitmenin kısa biyografisi..."></textarea>
                        </div>
                        
                        <div class="oes-form-divider">Sosyal Medya</div>
                        
                        <div class="oes-form-row">
                            <div class="oes-form-group">
                                <label for="socialLinkedin">LinkedIn</label>
                                <input type="url" id="socialLinkedin" name="social_linkedin" placeholder="https://linkedin.com/in/...">
                            </div>
                            <div class="oes-form-group">
                                <label for="socialTwitter">Twitter/X</label>
                                <input type="url" id="socialTwitter" name="social_twitter" placeholder="https://twitter.com/...">
                            </div>
                        </div>
                        
                        <div class="oes-form-row">
                            <div class="oes-form-group">
                                <label for="socialInstagram">Instagram</label>
                                <input type="url" id="socialInstagram" name="social_instagram" placeholder="https://instagram.com/...">
                            </div>
                            <div class="oes-form-group">
                                <label for="socialWebsite">Website</label>
                                <input type="url" id="socialWebsite" name="social_website" placeholder="https://...">
                            </div>
                        </div>

                        <div class="oes-form-row">
                            <div class="oes-form-group">
                                <label for="instructorStatus">Durum</label>
                                <select id="instructorStatus" name="status">
                                    <option value="active">Aktif</option>
                                    <option value="inactive">Pasif</option>
                                </select>
                            </div>
                            <div class="oes-form-group"></div>
                        </div>

                        <div class="oes-form-divider">Eğitmen Hesabı</div>

                        <div class="oes-form-group">
                            <label for="instructorUser">WP Kullanıcısına Bağla</label>
                            <select id="instructorUser" name="user_id">
                                <option value="">— Bağlı değil —</option>
                                <?php foreach ($all_users as $usr): ?>
                                <option value="<?php echo intval($usr->ID); ?>"><?php echo esc_html($usr->display_name . ' — ' . $usr->user_email); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <p style="margin:8px 0 0;font-size:12px;color:#64748b;line-height:1.5;">
                                Bir kullanıcı bağladığında ona <strong>eğitmen yetkisi</strong> verilir; <code><?php echo esc_html($teacher_slug); ?></code>
                                adresinden giriş yapıp kendi kurslarını yönetebilir. Bağlantıyı <em>"— Bağlı değil —"</em> yaparsan yetki geri alınır.
                            </p>
                        </div>
                    </form>
                </div>
                <div class="oes-modal-footer">
                    <button type="button" class="oes-btn" id="cancelModal">İptal</button>
                    <button type="button" class="oes-btn oes-btn-primary" id="saveInstructor">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                        Kaydet
                    </button>
                </div>
            </div>
        </div>
        
        <style>
            .oes-admin-wrap { padding: 0 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
            .oes-admin-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #e2e8f0; }
            .oes-header-left h1 { margin: 0 0 4px; font-size: 24px; color: #1e293b; }
            .oes-header-left p { margin: 0; color: #64748b; font-size: 14px; }
            
            .oes-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer; border: 1px solid #e2e8f0; background: #fff; color: #334155; transition: all 0.2s; }
            .oes-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
            .oes-btn-primary { background: linear-gradient(135deg, var(--oes-a, #5DB9E8), var(--oes-p, #1E4D7B)); color: #fff; border: none; }
            .oes-btn-primary:hover { background: linear-gradient(135deg, #059669 0%, #047857 100%); }
            
            .oes-icon-btn { width: 32px; height: 32px; border: none; background: transparent; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; transition: all 0.2s; }
            .oes-icon-btn:hover { background: #f1f5f9; color: #334155; }
            .oes-icon-btn-danger:hover { background: #fee2e2; color: #dc2626; }
            
            .oes-cards-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .oes-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; transition: all 0.2s; }
            .oes-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); border-color: #cbd5e1; }
            .oes-card-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
            .oes-card-actions { display: flex; gap: 4px; }
            .oes-card-body { padding: 16px; }
            .oes-card-footer { padding: 12px 16px; border-top: 1px solid #f1f5f9; background: #fafafa; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
            .oes-teacher-chip { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; background: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 600; }
            
            .oes-status-badge { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; }
            .oes-status-active { background: #d1fae5; color: #059669; }
            .oes-status-inactive { background: #f3f4f6; color: #6b7280; }
            
            .oes-empty-state { grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #64748b; }
            .oes-empty-state h3 { margin: 16px 0 8px; color: #334155; }
            .oes-empty-state p { margin: 0; }
            
            .oes-instructor-profile { display: flex; align-items: center; gap: 16px; margin-bottom: 12px; }
            .oes-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg, #10b981, #059669); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; flex-shrink: 0; }
            .oes-avatar img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
            .oes-avatar-lg { width: 64px; height: 64px; font-size: 24px; }
            .oes-instructor-info h3 { margin: 0 0 4px; font-size: 16px; color: #1e293b; }
            .oes-instructor-title { margin: 0; font-size: 13px; color: #64748b; }
            .oes-instructor-bio { font-size: 13px; color: #64748b; line-height: 1.5; margin: 0 0 12px; }
            .oes-instructor-meta { display: flex; align-items: center; gap: 12px; }
            .oes-instructor-meta span, .oes-instructor-meta a { color: #94a3b8; display: flex; align-items: center; }
            .oes-instructor-meta a:hover { color: #10b981; }
            .oes-instructor-stats { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #64748b; }
            
            /* Modal */
            .oes-modal { display: none; position: fixed; inset: 0; z-index: 100000; overflow-y: auto; }
            .oes-modal.open { display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; }
            .oes-modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); }
            .oes-modal-content { position: relative; width: 100%; max-width: 560px; background: #fff; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); }
            .oes-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid #e2e8f0; }
            .oes-modal-header h2 { margin: 0; font-size: 18px; color: #1e293b; }
            .oes-modal-close { width: 32px; height: 32px; border: none; background: #f1f5f9; border-radius: 8px; font-size: 20px; cursor: pointer; color: #64748b; display: flex; align-items: center; justify-content: center; }
            .oes-modal-close:hover { background: #e2e8f0; }
            .oes-modal-body { padding: 24px; max-height: 60vh; overflow-y: auto; }
            .oes-modal-footer { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc; border-radius: 0 0 16px 16px; }
            
            .oes-form-group { margin-bottom: 16px; }
            .oes-form-group label { display: block; font-size: 13px; font-weight: 500; color: #334155; margin-bottom: 6px; }
            .oes-form-group input, .oes-form-group select, .oes-form-group textarea { width: 100%; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px; transition: border-color 0.2s; }
            .oes-form-group input:focus, .oes-form-group select:focus, .oes-form-group textarea:focus { outline: none; border-color: var(--oes-a, #5DB9E8); box-shadow: 0 0 0 3px rgba(93,185,232,.15); }
            .oes-form-row { display: flex; gap: 16px; }
            .oes-form-row .oes-form-group { flex: 1; }
            .oes-form-divider { display: flex; align-items: center; gap: 12px; margin: 20px 0; color: #64748b; font-size: 13px; font-weight: 500; }
            .oes-form-divider::before, .oes-form-divider::after { content: ''; flex: 1; height: 1px; background: #e2e8f0; }
            
            .oes-image-upload { width: 100%; height: 100px; border: 2px dashed #e2e8f0; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; background: #f8fafc; color: #94a3b8; }
            .oes-image-upload:hover { border-color: var(--oes-a, #5DB9E8); background: #f0f9ff; color: var(--oes-p, #1E4D7B); }
            .oes-image-upload.has-image { border-style: solid; padding: 4px; }
            .oes-image-upload img { width: 100%; height: 100%; object-fit: cover; border-radius: 6px; }
            .oes-image-upload svg { margin-bottom: 4px; }
            .oes-image-upload span { font-size: 11px; }
        </style>
        
        <script>
        jQuery(function($) {
            const nonce = '<?php echo wp_create_nonce("oes_instructor_nonce"); ?>';
            const modal = $('#instructorModal');
            
            // Media uploader
            let mediaUploader;
            $('#photoUpload').on('click', function() {
                if (mediaUploader) {
                    mediaUploader.open();
                    return;
                }
                mediaUploader = wp.media({
                    title: 'Eğitmen Fotoğrafı Seç',
                    button: { text: 'Seç' },
                    multiple: false
                });
                mediaUploader.on('select', function() {
                    const attachment = mediaUploader.state().get('selection').first().toJSON();
                    $('#photoUrl').val(attachment.url);
                    $('#photoUpload').addClass('has-image').html('<img src="'+attachment.url+'">');
                });
                mediaUploader.open();
            });
            
            // Yeni eğitmen
            $('#addInstructorBtn').on('click', function(e) {
                e.preventDefault();
                resetForm();
                $('#modalTitle').text('Yeni Eğitmen');
                modal.addClass('open');
            });
            
            // Modalı kapat
            $('#closeModal, #cancelModal, .oes-modal-backdrop').on('click', function() {
                modal.removeClass('open');
            });
            
            // Düzenle
            $(document).on('click', '.edit-instructor', function() {
                const id = $(this).data('id');
                $.post(ajaxurl, { action: 'oes_get_instructor', nonce: nonce, id: id }, function(res) {
                    if (res.success) {
                        const p = res.data;
                        $('#instructorId').val(p.id);
                        $('#instructorName').val(p.name);
                        $('#instructorTitle').val(p.title);
                        $('#instructorEmail').val(p.email);
                        $('#instructorPhone').val(p.phone);
                        $('#instructorBio').val(p.bio);
                        $('#instructorStatus').val(p.status);
                        $('#instructorUser').val(p.user_id || '');
                        $('#photoUrl').val(p.photo_url);
                        
                        if (p.photo_url) {
                            $('#photoUpload').addClass('has-image').html('<img src="'+p.photo_url+'">');
                        }
                        
                        const social = p.social_links || {};
                        $('#socialLinkedin').val(social.linkedin || '');
                        $('#socialTwitter').val(social.twitter || '');
                        $('#socialInstagram').val(social.instagram || '');
                        $('#socialWebsite').val(social.website || '');
                        
                        $('#modalTitle').text('Eğitmen Düzenle');
                        modal.addClass('open');
                    }
                });
            });
            
            // Kaydet
            $('#saveInstructor').on('click', function() {
                const btn = $(this);
                const form = $('#instructorForm');
                
                if (!$('#instructorName').val()) {
                    alert('Ad soyad zorunludur');
                    return;
                }
                
                btn.prop('disabled', true).text('Kaydediliyor...');
                
                const data = {
                    action: 'oes_save_instructor',
                    nonce: nonce,
                    id: $('#instructorId').val(),
                    name: $('#instructorName').val(),
                    title: $('#instructorTitle').val(),
                    email: $('#instructorEmail').val(),
                    phone: $('#instructorPhone').val(),
                    bio: $('#instructorBio').val(),
                    photo_url: $('#photoUrl').val(),
                    status: $('#instructorStatus').val(),
                    user_id: $('#instructorUser').val(),
                    social_linkedin: $('#socialLinkedin').val(),
                    social_twitter: $('#socialTwitter').val(),
                    social_instagram: $('#socialInstagram').val(),
                    social_website: $('#socialWebsite').val()
                };
                
                $.post(ajaxurl, data, function(res) {
                    if (res.success) {
                        location.reload();
                    } else {
                        alert('Hata: ' + (res.data || 'Kaydetme başarısız'));
                        btn.prop('disabled', false).html('<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Kaydet');
                    }
                });
            });
            
            // Sil
            $(document).on('click', '.delete-instructor', function() {
                if (!confirm('Bu eğitmeni silmek istediğinize emin misiniz?')) return;
                
                const id = $(this).data('id');
                const card = $(this).closest('.oes-card');
                
                $.post(ajaxurl, { action: 'oes_delete_instructor', nonce: nonce, id: id }, function(res) {
                    if (res.success) {
                        card.fadeOut(300, function() { $(this).remove(); });
                    } else {
                        alert('Hata: ' + (res.data || 'Silme başarısız'));
                    }
                });
            });
            
            function resetForm() {
                $('#instructorForm')[0].reset();
                $('#instructorId').val('');
                $('#photoUrl').val('');
                $('#photoUpload').removeClass('has-image').html('<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg><span>Yükle</span>');
            }
        });
        </script>
        <?php
    }

    private function get_initials($name) {
        $words = explode(' ', $name);
        $initials = '';
        foreach ($words as $word) {
            if (!empty($word)) {
                $initials .= mb_substr($word, 0, 1);
            }
            if (strlen($initials) >= 2) break;
        }
        return strtoupper($initials);
    }

    // AJAX: Eğitmen kaydet
    public function save_instructor() {
        check_ajax_referer('oes_instructor_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';

        // user_id kolonu garanti (eğitmen bağlama için)
        if (class_exists('OES_Teacher')) {
            OES_Teacher::ensure_user_id_column();
        }

        $id = intval($_POST['id'] ?? 0);
        $new_user_id = intval($_POST['user_id'] ?? 0);
        $social_links = json_encode(array(
            'linkedin' => sanitize_url($_POST['social_linkedin'] ?? ''),
            'twitter' => sanitize_url($_POST['social_twitter'] ?? ''),
            'instagram' => sanitize_url($_POST['social_instagram'] ?? ''),
            'website' => sanitize_url($_POST['social_website'] ?? '')
        ));

        $data = array(
            'name' => sanitize_text_field($_POST['name']),
            'title' => sanitize_text_field($_POST['title'] ?? ''),
            'email' => sanitize_email($_POST['email'] ?? ''),
            'phone' => sanitize_text_field($_POST['phone'] ?? ''),
            'bio' => sanitize_textarea_field($_POST['bio'] ?? ''),
            'photo_url' => sanitize_url($_POST['photo_url'] ?? ''),
            'social_links' => $social_links,
            'status' => sanitize_text_field($_POST['status'] ?? 'active'),
            'user_id' => $new_user_id ?: null,
        );

        // Önceki bağlı kullanıcı (rol yönetimi için)
        $prev_user_id = $id ? (int) $wpdb->get_var($wpdb->prepare("SELECT user_id FROM $table WHERE id = %d", $id)) : 0;

        if ($id) {
            $wpdb->update($table, $data, array('id' => $id));
        } else {
            $wpdb->insert($table, $data);
            $id = $wpdb->insert_id;
        }

        // Eğitmen rolü yönetimi
        if (class_exists('OES_Teacher')) {
            if ($new_user_id) {
                // Bir kullanıcı en fazla bir profile bağlı olsun
                $wpdb->query($wpdb->prepare("UPDATE $table SET user_id = NULL WHERE user_id = %d AND id != %d", $new_user_id, $id));
                OES_Teacher::assign_role($new_user_id);
            }
            // Bağlantı değişti/kaldırıldıysa eski kullanıcıyı gözden geçir
            if ($prev_user_id && $prev_user_id !== $new_user_id) {
                OES_Teacher::revoke_role_if_orphan($prev_user_id);
            }
        }

        wp_send_json_success(array('id' => $id));
    }

    // AJAX: Eğitmen getir
    public function get_instructor() {
        check_ajax_referer('oes_instructor_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetkiniz yok');

        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        $id = intval($_POST['id']);
        
        $instructor = $wpdb->get_row($wpdb->prepare("SELECT * FROM $table WHERE id = %d", $id), ARRAY_A);
        
        if ($instructor) {
            $instructor['social_links'] = json_decode($instructor['social_links'], true) ?: array();
            wp_send_json_success($instructor);
        } else {
            wp_send_json_error('Eğitmen bulunamadı');
        }
    }

    // AJAX: Eğitmen sil
    public function delete_instructor() {
        check_ajax_referer('oes_instructor_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        $id = intval($_POST['id']);
        
        // Kurslarda kullanılıyor mu kontrol et
        $used = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key = '_oes_instructor_id' AND meta_value = %d",
            $id
        ));
        
        if ($used > 0) {
            wp_send_json_error('Bu eğitmen ' . $used . ' kursta kullanılıyor. Önce kurslardan kaldırın.');
        }
        
        $wpdb->delete($table, array('id' => $id));
        wp_send_json_success();
    }

    // Eğitmen meta AJAX kaydet
    public function ajax_save_instructor_meta() {
        check_ajax_referer('oes_save_instructor_meta', 'nonce');
        
        if (!current_user_can('edit_posts')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $post_id = intval($_POST['post_id'] ?? 0);
        $instructor_id = intval($_POST['instructor_id'] ?? 0);
        
        if (!$post_id) {
            wp_send_json_error('Geçersiz ürün');
        }
        
        if ($instructor_id > 0) {
            update_post_meta($post_id, '_oes_instructor_id', $instructor_id);
        } else {
            delete_post_meta($post_id, '_oes_instructor_id');
        }
        
        wp_send_json_success('Kaydedildi');
    }

    // Ürün meta box - Eğitmen seçimi
    public function add_product_metabox() {
        add_meta_box(
            'oes_instructor_metabox',
            '👨‍🏫 Eğitmen',
            array($this, 'render_product_metabox'),
            'product',
            'side',
            'default'
        );
    }

    public function render_product_metabox($post) {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        
        $instructors = $wpdb->get_results("SELECT id, name, title FROM $table WHERE status = 'active' ORDER BY name");
        $selected = intval(get_post_meta($post->ID, '_oes_instructor_id', true));
        $nonce = wp_create_nonce('oes_save_instructor_meta');
        ?>
        <select name="_oes_instructor_id" id="oes_instructor_select" style="width:100%;">
            <option value="">-- Eğitmen Seç --</option>
            <?php foreach ($instructors as $instructor): ?>
            <option value="<?php echo $instructor->id; ?>" <?php selected($selected, $instructor->id); ?>>
                <?php echo esc_html($instructor->name); ?>
                <?php if ($instructor->title): ?>(<?php echo esc_html($instructor->title); ?>)<?php endif; ?>
            </option>
            <?php endforeach; ?>
        </select>
        <p id="oes_instructor_status" style="margin-top:6px;font-size:12px;color:#666;"></p>
        <p class="description" style="margin-top:4px;">
            <a href="<?php echo admin_url('admin.php?page=oes-instructors'); ?>" target="_blank">+ Yeni eğitmen ekle</a>
        </p>
        <script>
        document.getElementById('oes_instructor_select').addEventListener('change', function() {
            var select = this;
            var status = document.getElementById('oes_instructor_status');
            status.style.color = '#666';
            status.textContent = 'Kaydediliyor...';
            
            var fd = new FormData();
            fd.append('action', 'oes_save_instructor_meta');
            fd.append('nonce', '<?php echo $nonce; ?>');
            fd.append('post_id', '<?php echo $post->ID; ?>');
            fd.append('instructor_id', select.value);
            
            fetch(ajaxurl, { method: 'POST', body: fd })
            .then(function(r) { return r.json(); })
            .then(function(d) {
                if (d.success) {
                    status.style.color = '#059669';
                    status.textContent = '✓ Kaydedildi';
                } else {
                    status.style.color = '#e11d48';
                    status.textContent = '✗ Hata: ' + (d.data || 'Bilinmeyen');
                }
            })
            .catch(function() {
                status.style.color = '#e11d48';
                status.textContent = '✗ Bağlantı hatası';
            });
        });
        </script>
        <?php
    }

    public function save_product_meta($post_id) {
        // DOING_AUTOSAVE kontrolü
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }
        
        // Yetki kontrolü
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }
        
        // woocommerce_process_product_meta hook'u zaten nonce'u doğrulamış olur
        // Ekstra nonce kontrolü kaldırıldı - WooCommerce'in kendi güvenliği yeterli
        if (isset($_POST['_oes_instructor_id'])) {
            $instructor_id = intval($_POST['_oes_instructor_id']);
            if ($instructor_id > 0) {
                update_post_meta($post_id, '_oes_instructor_id', $instructor_id);
            } else {
                delete_post_meta($post_id, '_oes_instructor_id');
            }
        }
    }

    // Eğitmen bilgisini getir
    public static function get_instructor_by_id($id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_instructors WHERE id = %d",
            $id
        ));
    }
}

new OES_Instructors();