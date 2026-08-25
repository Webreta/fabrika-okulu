<?php
/**
 * Görev/Görev Yönetim Sistemi
 * 
 * Admin: Kurs ve döneme göre görev atama
 * Öğrenci: Görev görüntüleme, dosya/ses/metin gönderimi
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Assignments {

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function __construct() {
        // DB tabloları (sadece admin'de oluşturulur)
        add_action('admin_init', array($this, 'create_tables'));
        
        // Admin init'te kolon kontrolü
        add_action('admin_init', array($this, 'check_voice_transcript_column'));
        
        // Admin menü
        add_action('admin_menu', array($this, 'add_admin_menu'), 20);
        
        // My Account endpoint içeriği (endpoint ve menü class-oes-my-account.php'de)
        add_action('woocommerce_account_gorevlerim_endpoint', array($this, 'render_my_assignments'));
        
        // AJAX handlers
        add_action('wp_ajax_oes_save_assignment', array($this, 'ajax_save_assignment'));
        add_action('wp_ajax_oes_delete_assignment', array($this, 'ajax_delete_assignment'));
        add_action('wp_ajax_oes_delete_submission', array($this, 'ajax_delete_submission'));
        add_action('wp_ajax_oes_get_periods', array($this, 'ajax_get_periods'));
        add_action('wp_ajax_oes_submit_assignment', array($this, 'ajax_submit_assignment'));
        add_action('wp_ajax_oes_grade_submission', array($this, 'ajax_grade_submission'));
        add_action('wp_ajax_oes_upload_assignment_file', array($this, 'ajax_upload_file'));
        add_action('wp_ajax_oes_upload_voice_recording', array($this, 'ajax_upload_voice'));
        add_action('wp_ajax_oes_get_transcript', array($this, 'ajax_get_transcript'));
        add_action('wp_ajax_oes_save_transcript', array($this, 'ajax_save_transcript'));
        add_action('wp_ajax_oes_transcribe_voice', array($this, 'ajax_transcribe_voice'));
        
        // Assets
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    }

    /**
     * DB Tabloları Oluştur
     */
    public function create_tables() {
        global $wpdb;
        
        $db_version = get_option('oes_assignments_db_version', '0');

        // Tabloları her zaman oluşturmaya çalış (IF NOT EXISTS)
        $this->run_create_tables($db_version);

        // Eksik kolonları ekle
        $ta  = $wpdb->prefix . 'oes_assignments';
        $ts  = $wpdb->prefix . 'oes_assignment_submissions';

        $this->add_col($ta, 'extra_days',        "ALTER TABLE $ta ADD COLUMN extra_days int(11) DEFAULT 2 AFTER due_date");
        $this->add_col($ta, 'is_graded',         "ALTER TABLE $ta ADD COLUMN is_graded tinyint(1) DEFAULT 1 AFTER extra_days");
        $this->add_col($ta, 'allow_file',        "ALTER TABLE $ta ADD COLUMN allow_file tinyint(1) DEFAULT 1 AFTER max_score");
        $this->add_col($ta, 'allow_voice',       "ALTER TABLE $ta ADD COLUMN allow_voice tinyint(1) DEFAULT 1 AFTER allow_file");
        $this->add_col($ta, 'allow_text',        "ALTER TABLE $ta ADD COLUMN allow_text tinyint(1) DEFAULT 1 AFTER allow_voice");
        $this->add_col($ta, 'updated_at',        "ALTER TABLE $ta ADD COLUMN updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");

        $this->add_col($ts, 'submission_text',   "ALTER TABLE $ts ADD COLUMN submission_text longtext DEFAULT NULL AFTER user_id");
        $this->add_col($ts, 'file_name',         "ALTER TABLE $ts ADD COLUMN file_name varchar(255) DEFAULT NULL AFTER file_url");
        $this->add_col($ts, 'voice_url',         "ALTER TABLE $ts ADD COLUMN voice_url varchar(500) DEFAULT NULL AFTER file_name");
        $this->add_col($ts, 'voice_duration',    "ALTER TABLE $ts ADD COLUMN voice_duration int(11) DEFAULT NULL AFTER voice_url");
        $this->add_col($ts, 'voice_transcript',  "ALTER TABLE $ts ADD COLUMN voice_transcript longtext DEFAULT NULL AFTER voice_duration");
        $this->add_col($ts, 'updated_at',        "ALTER TABLE $ts ADD COLUMN updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER submitted_at");

        update_option('oes_assignments_db_version', '1.4');
    }

    private function add_col($table, $column, $sql) {
        global $wpdb;
        $exists = $wpdb->get_var("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$table' AND COLUMN_NAME = '$column'");
        if (!$exists) {
            $wpdb->query($sql);
        }
    }

    private function run_create_tables($db_version) {
        global $wpdb;
        if (version_compare($db_version, '1.3', '>=')) {
            return;
        }
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Görevler tablosu
        $table_assignments = $wpdb->prefix . 'oes_assignments';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $table_assignments (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            course_id bigint(20) NOT NULL,
            period_id bigint(20) DEFAULT NULL,
            title varchar(255) NOT NULL,
            description longtext,
            due_date datetime DEFAULT NULL,
            extra_days int(11) DEFAULT 2,
            is_graded tinyint(1) DEFAULT 1,
            max_score int(11) DEFAULT 100,
            allow_file tinyint(1) DEFAULT 1,
            allow_voice tinyint(1) DEFAULT 1,
            allow_text tinyint(1) DEFAULT 1,
            status varchar(20) DEFAULT 'active',
            created_by bigint(20) NOT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY course_id (course_id),
            KEY period_id (period_id),
            KEY due_date (due_date),
            KEY status (status)
        ) $charset_collate;");
        
        // Mevcut tablolar için kolon ekle
        $wpdb->query("ALTER TABLE $table_assignments ADD COLUMN IF NOT EXISTS extra_days int(11) DEFAULT 2 AFTER due_date");
        $wpdb->query("ALTER TABLE $table_assignments ADD COLUMN IF NOT EXISTS is_graded tinyint(1) DEFAULT 1 AFTER extra_days");
        
        // Görev gönderimleri tablosu
        $table_submissions = $wpdb->prefix . 'oes_assignment_submissions';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $table_submissions (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            assignment_id bigint(20) NOT NULL,
            user_id bigint(20) NOT NULL,
            submission_text longtext,
            file_url varchar(500) DEFAULT NULL,
            file_name varchar(255) DEFAULT NULL,
            voice_url varchar(500) DEFAULT NULL,
            voice_duration int(11) DEFAULT NULL,
            voice_transcript longtext DEFAULT NULL,
            score int(11) DEFAULT NULL,
            feedback longtext,
            graded_by bigint(20) DEFAULT NULL,
            graded_at datetime DEFAULT NULL,
            status varchar(20) DEFAULT 'pending',
            submitted_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY assignment_user (assignment_id, user_id),
            KEY user_id (user_id),
            KEY status (status)
        ) $charset_collate;");
        
        // Mevcut tabloya kolon ekle
        $wpdb->query("ALTER TABLE $table_submissions ADD COLUMN IF NOT EXISTS voice_transcript longtext DEFAULT NULL AFTER voice_duration");
        
        update_option('oes_assignments_db_version', '1.3');
    } // run_create_tables sonu
    
    /**
     * voice_transcript kolonunu kontrol et ve yoksa ekle (her admin sayfası yüklendiğinde)
     */
    public function check_voice_transcript_column() {
        // Sadece admin sayfalarında çalışsın
        if (!is_admin()) {
            return;
        }
        
        // Günde bir kez kontrol et (performans için)
        $last_check = get_option('oes_voice_transcript_check', 0);
        if (time() - $last_check < 86400) { // 24 saat
            return;
        }
        
        global $wpdb;
        $table = $wpdb->prefix . 'oes_assignment_submissions';
        
        // Tablo var mı kontrol et
        $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table'");
        if (!$table_exists) {
            return;
        }
        
        // Kolon var mı kontrol et
        $column_exists = $wpdb->get_var(
            "SHOW COLUMNS FROM `$table` LIKE 'voice_transcript'"
        );
        
        if (!$column_exists) {
            // Kolon yok, ekle!
            $wpdb->query("ALTER TABLE `$table` ADD COLUMN `voice_transcript` LONGTEXT DEFAULT NULL AFTER `voice_duration`");
            
            // Log
            error_log('OES: voice_transcript kolonu otomatik eklendi!');
            
            // Admin bildirimi
            add_action('admin_notices', function() {
                echo '<div class="notice notice-success is-dismissible">';
                echo '<p><strong>Online Eğitim Sistemi:</strong> voice_transcript kolonu başarıyla eklendi! ✅</p>';
                echo '</div>';
            });
        }
        
        // Son kontrol zamanını güncelle
        update_option('oes_voice_transcript_check', time());
    }

    /**
     * Admin Menü Ekle
     */
    public function add_admin_menu() {
        add_submenu_page(
            'online-kurs-sistemi',
            'Görevler',
            'Görevler',
            'manage_options',
            'oes-assignments',
            array($this, 'render_admin_page')
        );
    }

    /**
     * Admin Assets
     */
    public function enqueue_admin_assets($hook) {
        if (strpos($hook, 'oes-assignments') === false) {
            return;
        }
        
        wp_enqueue_style('oes-assignments-admin', OES_PLUGIN_URL . 'assets/css/assignments.css', array(), OES_VERSION);
        wp_enqueue_script('oes-assignments-admin', OES_PLUGIN_URL . 'assets/js/assignments.js', array('jquery'), OES_VERSION, true);
        wp_localize_script('oes-assignments-admin', 'oesAssignments', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('oes_assignments_nonce'),
            'isAdmin' => true
        ));
    }

    /**
     * Frontend Assets
     */
    public function enqueue_frontend_assets() {
        if (!is_account_page()) {
            return;
        }
        
        global $wp_query;
        if (!isset($wp_query->query_vars['gorevlerim'])) {
            return;
        }
        
        wp_enqueue_style('oes-assignments', OES_PLUGIN_URL . 'assets/css/assignments.css', array(), OES_VERSION);
        wp_enqueue_script('oes-assignments', OES_PLUGIN_URL . 'assets/js/assignments.js', array('jquery'), OES_VERSION, true);
        wp_localize_script('oes-assignments', 'oesAssignments', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('oes_assignments_nonce'),
            'isAdmin' => false,
            'maxFileSize' => 10 * 1024 * 1024, // 10MB
            'allowedFileTypes' => array('pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar', 'jpg', 'jpeg', 'png', 'gif')
        ));
    }

    /**
     * Admin Sayfası Render
     */
    public function render_admin_page() {
        global $wpdb;
        
        // Alt sayfa kontrolü
        $action = isset($_GET['action']) ? sanitize_text_field($_GET['action']) : 'list';
        $assignment_id = isset($_GET['assignment_id']) ? intval($_GET['assignment_id']) : 0;
        
        // Kursları al
        $courses = $wpdb->get_results("
            SELECT p.ID, p.post_title 
            FROM {$wpdb->posts} p
            INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
            WHERE pm.meta_key = '_oes_is_course' 
            AND pm.meta_value = 'yes'
            AND p.post_status = 'publish'
            ORDER BY p.post_title ASC
        ");
        
        ?>
        <?php if (class_exists('OES_Admin')) OES_Admin::oes_admin_styles(); ?>
        <style>
            /* assignments'a özgü ek stiller */
            .oes-score-display{font-size:22px;font-weight:800;color:var(--oes-p)}
            .oes-graded-row{display:flex;align-items:center;gap:16px;padding-top:14px;border-top:1px solid var(--oes-border2);flex-wrap:wrap}
            .oes-feedback-display{flex:1;padding:10px 14px;background:var(--oes-yellow-bg);border-left:3px solid var(--oes-yellow);border-radius:0 var(--oes-r) var(--oes-r) 0;font-size:13px;color:#78350f}
            .oes-delete-submission{background:none;border:none;cursor:pointer;padding:6px;border-radius:var(--oes-r);color:var(--oes-faint);transition:all .2s;font-size:0;line-height:0}
            .oes-delete-submission svg{width:14px;height:14px}
            .oes-delete-submission:hover{background:var(--oes-red-bg);color:var(--oes-red)}
            .oes-question-num{width:32px;height:32px;background:var(--oes-p);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px}
            /* Submission kart stili */
            .oes-submissions-list{display:flex;flex-direction:column;gap:12px}
            .oes-submission-card{background:#fff;border:1px solid var(--oes-border);border-radius:var(--oes-r2);padding:20px 24px;transition:border-color .2s,box-shadow .2s}
            .oes-submission-card:hover{border-color:var(--oes-a);box-shadow:0 4px 16px rgba(93,185,232,.1)}
            .oes-submission-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
            .oes-submission-user{display:flex;align-items:center;gap:12px}
            .oes-avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--oes-a,#5DB9E8),var(--oes-p,#1E4D7B));color:#fff;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;flex-shrink:0}
            .oes-submission-user strong{display:block;color:var(--oes-text);font-size:14px}
            .oes-submission-user small{color:var(--oes-muted);font-size:12px}
            .oes-submission-content{background:var(--oes-bg);border-radius:var(--oes-r);padding:14px;margin-bottom:12px;font-size:14px;color:#374151;line-height:1.6}
            .oes-submission-attachments{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
            .oes-attachment-link{display:inline-flex;align-items:center;gap:8px;padding:8px 14px;background:var(--oes-bg);border:1px solid var(--oes-border);border-radius:var(--oes-r);font-size:13px;color:var(--oes-p);text-decoration:none;width:fit-content;transition:all .2s}
            .oes-attachment-link:hover{border-color:var(--oes-a);background:#f0f9ff}
            .oes-voice-item-admin{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;background:var(--oes-bg);border-radius:var(--oes-r)}
            .oes-voice-item-admin audio{height:32px;flex:1;min-width:200px}
            .oes-voice-dur-admin{font-size:12px;font-weight:600;color:var(--oes-text-muted);background:#fff;border:1px solid var(--oes-border);border-radius:6px;padding:3px 8px;font-variant-numeric:tabular-nums}
            .oes-transcribe-btn{padding:6px 14px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;font-weight:600;transition:all .2s}
            .oes-transcribe-btn:hover{background:#7c3aed}
            .oes-transcribe-btn:disabled{opacity:.5;cursor:wait}
            .oes-transcript-result{margin-top:8px;padding:12px;background:#fff;border:1px solid var(--oes-border);border-radius:var(--oes-r);font-size:13px;line-height:1.6;width:100%}
            .oes-grade-form{display:flex;gap:12px;align-items:flex-end;padding-top:14px;border-top:1px solid var(--oes-border2);flex-wrap:wrap}
            .oes-grade-input{width:80px}
            .oes-feedback-input{flex:1;min-width:200px}
        </style>
        
        <div class="oes-admin-wrap fabo-wrap">
            <?php if ($action === 'list'): ?>
                <?php $this->render_assignments_list($courses); ?>
            <?php elseif ($action === 'new' || $action === 'edit'): ?>
                <?php $this->render_assignment_form($courses, $assignment_id); ?>
            <?php elseif ($action === 'submissions'): ?>
                <?php $this->render_submissions($assignment_id); ?>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Görev Listesi
     */
    private function render_assignments_list($courses) {
        global $wpdb;
        
        $assignments = $wpdb->get_results("
            SELECT a.*, p.post_title as course_name, per.name as period_name,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_assignment_submissions WHERE assignment_id = a.id) as submission_count
            FROM {$wpdb->prefix}oes_assignments a
            LEFT JOIN {$wpdb->posts} p ON a.course_id = p.ID
            LEFT JOIN {$wpdb->prefix}oes_periods per ON a.period_id = per.id
            ORDER BY a.created_at DESC
        ");
        
        ?>
        <div class="fabo-head">
            <div>
                <h1>Görevler</h1>
                <p>Tüm eğitimlerdeki görevler. Görevler normalde <strong>eğitim editöründe</strong> (müfredatın içinde)
                   tanımlanır ve son teslim “kayıttan/dönem başından sonra N gün” olarak verilir; burası toplu
                   görünüm ve teslimler içindir.</p>
            </div>
            <div class="fabo-head-actions">
                <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=oes-assignments&action=new')); ?>">Yeni görev</a>
            </div>
        </div>
        
        <?php if (empty($assignments)): ?>
        <div class="fabo-panel"><div class="fabo-empty">
            <span class="dashicons dashicons-clipboard"></span>
            <p>Henüz görev yok. Görevler genelde eğitim editöründe müfredatın içinde oluşturulur.</p>
            <p style="margin-top:14px;">
                <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=oes-assignments&action=new')); ?>">Yeni görev</a>
            </p>
        </div></div>
        <?php else: ?>
        <div class="fabo-tablewrap">
            <table class="fabo-table">
                <thead><tr>
                    <th>Görev</th><th>Son teslim</th><th>Gönderim</th><th>Durum</th><th></th>
                </tr></thead>
                <tbody>
                <?php foreach ($assignments as $a):
                    // Mutlak son teslim (müfredat görevlerinde due_date boş olur;
                    // orada süre öğrenci bazında hesaplanır → burada "göreli" yazar)
                    $due     = fabo_deadline_ts($a->due_date);
                    $is_past = fabo_is_overdue($a->due_date);
                    $extra   = intval($a->extra_days ?? 0);
                ?>
                <tr>
                    <td>
                        <strong><?php echo esc_html($a->title); ?></strong>
                        <div class="fabo-hint">
                            <?php echo esc_html($a->course_name ?: '—'); ?><?php if ($a->period_name): ?> · <?php echo esc_html($a->period_name); ?><?php endif; ?>
                        </div>
                    </td>
                    <td style="white-space:nowrap;">
                        <?php if ($due): ?>
                            <span style="<?php echo $is_past ? 'color:#d1493d;font-weight:600;' : ''; ?>">
                                <?php echo esc_html(date_i18n('d M Y · H:i', $due)); ?>
                            </span>
                            <?php if ($is_past): ?><div class="fabo-hint">süresi geçti</div><?php endif; ?>
                        <?php elseif ($extra > 0): ?>
                            <span class="fabo-chip c-sky">+<?php echo $extra; ?> gün</span>
                            <div class="fabo-hint">kayıttan / dönem başından sonra</div>
                        <?php else: ?>
                            <span class="fabo-hint">Süresiz</span>
                        <?php endif; ?>
                    </td>
                    <td>
                        <a href="<?php echo esc_url(admin_url('admin.php?page=oes-assignments&action=submissions&assignment_id=' . $a->id)); ?>">
                            <span class="fabo-chip <?php echo $a->submission_count > 0 ? 'c-navy' : 'c-gray'; ?>">
                                <?php echo intval($a->submission_count); ?> gönderim
                            </span>
                        </a>
                    </td>
                    <td>
                        <?php if ($a->status === 'active'): ?>
                            <span class="fabo-chip c-green">Aktif</span>
                        <?php else: ?>
                            <span class="fabo-chip c-gray">Taslak</span>
                        <?php endif; ?>
                    </td>
                    <td style="white-space:nowrap;">
                        <a class="button button-small" href="<?php echo esc_url(admin_url('admin.php?page=oes-assignments&action=edit&assignment_id=' . $a->id)); ?>">Düzenle</a>
                        <button type="button" class="button button-small oes-delete-assignment" data-id="<?php echo intval($a->id); ?>">Sil</button>
                    </td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
        <?php
    }

    /**
     * Görev Formu (Yeni/Düzenle)
     */
    private function render_assignment_form($courses, $assignment_id = 0) {
        global $wpdb;
        
        $assignment = null;
        if ($assignment_id > 0) {
            $assignment = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}oes_assignments WHERE id = %d",
                $assignment_id
            ));
        }
        
        $is_edit = !is_null($assignment);
        ?>
        <?php // NOT: .oes-admin-header sınıfı admin-common.css'te tanımlı ama o dosya
              // hiçbir yerde yüklenmiyordu → bu başlık stilsiz kalıyordu. Ortak tasarıma alındı. ?>
        <div class="fabo-head">
            <div>
                <h1><?php echo $is_edit ? 'Görevi düzenle' : 'Yeni görev'; ?></h1>
                <p><?php echo $is_edit
                        ? 'Görev bilgilerini güncelle.'
                        : 'Bu ekran tek tek görev ekler. Genelde görevler eğitim editöründe müfredatın içinde tanımlanır.'; ?></p>
            </div>
            <div class="fabo-head-actions">
                <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=oes-assignments')); ?>">← Görevlere dön</a>
            </div>
        </div>
        
        <form id="oesAssignmentForm" class="oes-section">
            <input type="hidden" name="assignment_id" value="<?php echo $assignment_id; ?>">
            
            <div class="oes-form-row">
                <div class="oes-form-group full">
                    <label>Görev Başlığı *</label>
                    <input type="text" name="title" value="<?php echo $is_edit ? esc_attr($assignment->title) : ''; ?>" required placeholder="Örn: Hafta 1 Görev Teslimi">
                </div>
            </div>
            
            <div class="oes-form-row">
                <div class="oes-form-group">
                    <label>Kurs *</label>
                    <select name="course_id" id="assignmentCourse" required>
                        <option value="">Kurs Seçin</option>
                        <?php foreach ($courses as $c): ?>
                            <option value="<?php echo $c->ID; ?>" <?php selected($is_edit && $assignment->course_id == $c->ID); ?>>
                                <?php echo esc_html($c->post_title); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                
                <div class="oes-form-group">
                    <label>Dönem (Opsiyonel)</label>
                    <select name="period_id" id="assignmentPeriod">
                        <option value="">Tüm Dönemler</option>
                        <?php if ($is_edit && $assignment->period_id): ?>
                            <?php 
                            $period = $wpdb->get_row($wpdb->prepare(
                                "SELECT * FROM {$wpdb->prefix}oes_periods WHERE id = %d",
                                $assignment->period_id
                            ));
                            if ($period): ?>
                                <option value="<?php echo $period->id; ?>" selected><?php echo esc_html($period->name); ?></option>
                            <?php endif; ?>
                        <?php endif; ?>
                    </select>
                    <span class="help">Boş bırakırsanız kursa kayıtlı tüm öğrenciler görür</span>
                </div>
            </div>
            
            <div class="oes-form-row">
                <div class="oes-form-group">
                    <label>Son Teslim Tarihi</label>
                    <input type="datetime-local" name="due_date" value="<?php echo $is_edit && $assignment->due_date ? date('Y-m-d\TH:i', strtotime($assignment->due_date)) : ''; ?>">
                </div>
                
                <div class="oes-form-group">
                    <label>Ek Gönderim Süresi (Gün)</label>
                    <input type="number" name="extra_days" value="<?php echo $is_edit && isset($assignment->extra_days) ? $assignment->extra_days : 2; ?>" min="0" max="30">
                    <span class="help">İlk gönderimden sonra ek yapılabilecek süre</span>
                </div>
                
                <div class="oes-form-group">
                    <label class="oes-checkbox" style="margin-bottom:12px">
                        <input type="checkbox" name="is_graded" id="isGraded" value="1" <?php checked(!$is_edit || (isset($assignment->is_graded) && $assignment->is_graded)); ?>>
                        <strong>Puanlı Görev</strong>
                    </label>
                    <div id="gradingOptions" style="<?php echo $is_edit && isset($assignment->is_graded) && !$assignment->is_graded ? 'display:none' : ''; ?>">
                        <label>Maksimum Puan</label>
                        <input type="number" name="max_score" value="<?php echo $is_edit ? $assignment->max_score : 100; ?>" min="1" max="1000">
                    </div>
                </div>
            </div>
            
            <script>
            document.getElementById('isGraded').addEventListener('change', function() {
                document.getElementById('gradingOptions').style.display = this.checked ? '' : 'none';
            });
            </script>
            
            <div class="oes-form-group full">
                <label>Görev Açıklaması</label>
                <textarea name="description" placeholder="Görev hakkında detaylı açıklama yazın..."><?php echo $is_edit ? esc_textarea($assignment->description) : ''; ?></textarea>
            </div>
            
            <div class="oes-form-group">
                <label>İzin Verilen Gönderim Türleri</label>
                <div class="oes-checkbox-group">
                    <label class="oes-checkbox">
                        <input type="checkbox" name="allow_file" value="1" <?php checked($is_edit ? $assignment->allow_file : true); ?>>
                        📎 Dosya Yükleme
                    </label>
                    <label class="oes-checkbox">
                        <input type="checkbox" name="allow_voice" value="1" <?php checked($is_edit ? $assignment->allow_voice : true); ?>>
                        🎤 Ses Kaydı
                    </label>
                    <label class="oes-checkbox">
                        <input type="checkbox" name="allow_text" value="1" <?php checked($is_edit ? $assignment->allow_text : true); ?>>
                        ✍️ Metin Yazma
                    </label>
                </div>
            </div>
            
            <div class="oes-form-group">
                <label>Durum</label>
                <select name="status">
                    <option value="active" <?php selected(!$is_edit || $assignment->status === 'active'); ?>>Aktif</option>
                    <option value="draft" <?php selected($is_edit && $assignment->status === 'draft'); ?>>Taslak</option>
                </select>
            </div>
            
            <div style="display:flex;gap:12px;margin-top:24px">
                <button type="submit" class="oes-btn oes-btn-primary">
                    <?php echo $is_edit ? '💾 Güncelle' : '✓ Oluştur'; ?>
                </button>
                <a href="<?php echo admin_url('admin.php?page=oes-assignments'); ?>" class="oes-btn">İptal</a>
            </div>
        </form>
        <?php
    }

    /**
     * Görev Gönderimleri
     */
    private function render_submissions($assignment_id) {
        global $wpdb;
        
        $assignment = $wpdb->get_row($wpdb->prepare(
            "SELECT a.*, p.post_title as course_name 
             FROM {$wpdb->prefix}oes_assignments a
             LEFT JOIN {$wpdb->posts} p ON a.course_id = p.ID
             WHERE a.id = %d",
            $assignment_id
        ));
        
        if (!$assignment) {
            echo '<div class="oes-section"><p>Görev bulunamadı.</p></div>';
            return;
        }
        
        $submissions = $wpdb->get_results($wpdb->prepare("
            SELECT s.*, u.display_name, u.user_email
            FROM {$wpdb->prefix}oes_assignment_submissions s
            LEFT JOIN {$wpdb->users} u ON s.user_id = u.ID
            WHERE s.assignment_id = %d
            ORDER BY s.submitted_at DESC
        ", $assignment_id));
        
        ?>
        <div class="fabo-head">
            <div>
                <h1><?php echo esc_html($assignment->title); ?></h1>
                <p><?php echo esc_html($assignment->course_name ?: '—'); ?> ·
                   <strong><?php echo count($submissions); ?></strong> gönderim</p>
            </div>
            <div class="fabo-head-actions">
                <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=oes-assignments')); ?>">← Görevlere dön</a>
            </div>
        </div>
        
        <?php if (empty($submissions)): ?>
        <div style="text-align:center;padding:60px 20px;background:#fff;border-radius:var(--oes-radius-lg);border:1px solid var(--oes-border)">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--oes-text-faint)" stroke-width="1.5" style="margin-bottom:12px"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <h3 style="color:var(--oes-text);margin:0 0 8px">Henüz gönderim yok</h3>
            <p style="color:var(--oes-text-muted);margin:0">Öğrenciler görev gönderdiğinde burada listelenecek</p>
        </div>
        <?php else: ?>
        <div class="oes-submissions-list">
            <?php 
            $has_grading = !empty($assignment->is_graded) && $assignment->is_graded;
            foreach ($submissions as $s): 
                $files = array();
                if ($s->file_url) {
                    $files = json_decode($s->file_url, true);
                    if (!is_array($files)) $files = array(array('name' => $s->file_name ?: 'Dosya', 'url' => $s->file_url));
                }
                $voices = array();
                if ($s->voice_url) {
                    $voices = json_decode($s->voice_url, true);
                    if (!is_array($voices)) $voices = array(array('url' => $s->voice_url, 'duration' => 0));
                }
            ?>
            <div class="oes-submission-card" data-submission-id="<?php echo $s->id; ?>">
                
                <!-- Kart başlığı -->
                <div class="oes-submission-header">
                    <div class="oes-submission-user">
                        <div class="oes-avatar"><?php echo strtoupper(substr($s->display_name, 0, 1)); ?></div>
                        <div>
                            <strong><?php echo esc_html($s->display_name); ?></strong>
                            <small><?php echo esc_html($s->user_email); ?> · <?php echo date_i18n('d M Y H:i', strtotime($s->submitted_at)); ?></small>
                        </div>
                    </div>
                    <div style="display:flex;align-items:center;gap:10px">
                        <?php if ($s->status === 'graded'): ?>
                            <span class="oes-badge oes-badge-graded">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                Değerlendirildi
                            </span>
                        <?php else: ?>
                            <span class="oes-badge oes-badge-pending">Bekliyor</span>
                        <?php endif; ?>
                        <button type="button" class="oes-delete-submission" data-id="<?php echo $s->id; ?>" title="Gönderimi Sil">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                    </div>
                </div>
                
                <!-- Metin yanıtı -->
                <?php if ($s->submission_text): ?>
                <div class="oes-submission-content"><?php echo nl2br(esc_html($s->submission_text)); ?></div>
                <?php endif; ?>
                
                <!-- Ekler: dosya + ses -->
                <?php if (!empty($files) || !empty($voices)): ?>
                <div class="oes-submission-attachments">
                    <?php foreach ($files as $file): ?>
                    <a href="<?php echo esc_url($file['url']); ?>" target="_blank" class="oes-attachment-link">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                        <?php echo esc_html($file['name']); ?>
                    </a>
                    <?php endforeach; ?>
                    
                    <?php foreach ($voices as $idx => $voice): 
                        $vdur = isset($voice['duration']) ? intval($voice['duration']) : 0;
                        $vdur_text = sprintf('%02d:%02d', floor($vdur / 60), $vdur % 60);
                    ?>
                    <div class="oes-voice-item-admin">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--oes-purple)" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                        <audio controls src="<?php echo esc_url($voice['url']); ?>"></audio>
                        <?php if ($vdur > 0): ?>
                        <span class="oes-voice-dur-admin"><?php echo esc_html($vdur_text); ?></span>
                        <?php endif; ?>
                        <button type="button" class="oes-transcribe-btn"
                                data-submission-id="<?php echo $s->id; ?>"
                                data-voice-index="<?php echo $idx; ?>"
                                data-audio-url="<?php echo esc_url($voice['url']); ?>"
                                data-idx="<?php echo $s->id . '-' . $idx; ?>">
                            Transkript
                        </button>
                        <div class="oes-transcript-result" id="transcript-<?php echo $s->id . '-' . $idx; ?>" style="display:none"></div>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
                
                <!-- Değerlendirme alanı -->
                <?php if ($s->status === 'graded'): ?>
                <div class="oes-graded-row">
                    <?php if ($has_grading): ?>
                    <div style="display:flex;flex-direction:column;align-items:center;background:var(--oes-accent-light);border:1px solid rgba(93,185,232,.3);border-radius:var(--oes-radius);padding:8px 16px;min-width:80px">
                        <span class="oes-score-display"><?php echo $s->score; ?><span style="font-size:14px;color:var(--oes-text-muted);font-weight:500">/<?php echo $assignment->max_score; ?></span></span>
                        <span style="font-size:10px;color:var(--oes-text-muted);text-transform:uppercase;letter-spacing:.5px">Puan</span>
                    </div>
                    <?php else: ?>
                    <span style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:var(--oes-success-light);border-radius:var(--oes-radius);color:#059669;font-weight:600;font-size:13px">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        Tamamlandı
                    </span>
                    <?php endif; ?>
                    <?php if ($s->feedback): ?>
                    <div class="oes-feedback-display"><strong>Geri Bildirim:</strong> <?php echo esc_html($s->feedback); ?></div>
                    <?php endif; ?>
                </div>
                <?php else: ?>
                <form class="oes-grade-form" data-submission-id="<?php echo $s->id; ?>" data-has-grading="<?php echo $has_grading ? '1' : '0'; ?>">
                    <?php if ($has_grading): ?>
                    <div class="oes-form-group" style="margin:0">
                        <label style="font-size:11px;font-weight:600;color:var(--oes-text-muted)">Puan (max <?php echo $assignment->max_score; ?>)</label>
                        <input type="number" name="score" class="oes-grade-input" min="0" max="<?php echo $assignment->max_score; ?>" required>
                    </div>
                    <?php else: ?>
                    <input type="hidden" name="score" value="0">
                    <?php endif; ?>
                    <div class="oes-form-group oes-feedback-input" style="margin:0">
                        <label style="font-size:11px;font-weight:600;color:var(--oes-text-muted)">Geri Bildirim <span style="font-weight:400">(opsiyonel)</span></label>
                        <input type="text" name="feedback" placeholder="Öğrenciye mesaj...">
                    </div>
                    <button type="submit" class="oes-btn oes-btn-primary oes-btn-sm"><?php echo $has_grading ? 'Değerlendir' : 'Tamamla'; ?></button>
                </form>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <?php
    }

    /**
     * Öğrenci Görevlerim Sayfası
     */
    public function render_my_assignments() {
        $user_id = get_current_user_id();
        if (!$user_id) {
            echo '<p>Lütfen giriş yapın.</p>';
            return;
        }
        
        global $wpdb;
        
        // Önce kullanıcının TAMAMLANMIŞ siparişlerinden kurs ID'lerini al
        $completed_course_ids = array();
        $customer_orders = wc_get_orders(array(
            'customer_id' => $user_id,
            'status' => 'completed',
            'limit' => -1
        ));
        
        foreach ($customer_orders as $order) {
            foreach ($order->get_items() as $item) {
                $product_id = $item->get_product_id();
                if (get_post_meta($product_id, '_oes_is_course', true) === 'yes') {
                    $completed_course_ids[] = $product_id;
                }
            }
        }
        
        // Tamamlanmış kursu yoksa boş göster
        if (empty($completed_course_ids)) {
            ?>
            <div class="oes-assignments-page">
                <h2>📝 Görevlerim</h2>
                <div class="oes-empty-state">
                    <div class="oes-empty-icon">📋</div>
                    <p>Henüz aktif eğitiminiz bulunmuyor.</p>
                    <small>Siparişiniz tamamlandığında görevleriniz burada görünecek.</small>
                </div>
            </div>
            <?php
            return;
        }
        
        // Görüntüleme modu
        $view = isset($_GET['view']) ? sanitize_text_field($_GET['view']) : 'list';
        $assignment_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
        
        if ($view === 'detail' && $assignment_id > 0) {
            $this->render_assignment_detail($user_id, $assignment_id);
            return;
        }
        
        // Kullanıcının kayıtlı olduğu dönemleri al (sadece tamamlanmış kurslar için)
        $course_placeholders = implode(',', array_fill(0, count($completed_course_ids), '%d'));
        
        $enrollments = $wpdb->get_results($wpdb->prepare("
            SELECT DISTINCT pe.period_id
            FROM {$wpdb->prefix}oes_period_enrollments pe
            LEFT JOIN {$wpdb->prefix}oes_periods p ON pe.period_id = p.id
            WHERE pe.user_id = %d AND p.course_id IN ($course_placeholders)
        ", array_merge(array($user_id), $completed_course_ids)));
        
        $period_ids = array_filter(array_unique(array_column($enrollments, 'period_id')));
        
        // Kullanıcıya atanmış görevleri al (sadece tamamlanmış kurslardan)
        $query = "
            SELECT a.*, p.post_title as course_name,
                   (SELECT status FROM {$wpdb->prefix}oes_assignment_submissions WHERE assignment_id = a.id AND user_id = %d) as submission_status,
                   (SELECT score FROM {$wpdb->prefix}oes_assignment_submissions WHERE assignment_id = a.id AND user_id = %d) as my_score
            FROM {$wpdb->prefix}oes_assignments a
            LEFT JOIN {$wpdb->posts} p ON a.course_id = p.ID
            WHERE a.status = 'active'
            AND a.course_id IN ($course_placeholders)
            AND (a.period_id IS NULL" . (!empty($period_ids) ? " OR a.period_id IN (" . implode(',', array_fill(0, count($period_ids), '%d')) . ")" : "") . ")
            ORDER BY a.due_date ASC, a.created_at DESC
        ";
        
        $params = array_merge(array($user_id, $user_id), $completed_course_ids);
        if (!empty($period_ids)) {
            $params = array_merge($params, $period_ids);
        }
        
        $assignments = $wpdb->get_results($wpdb->prepare($query, $params));
        
        // Aktif ve tamamlananları ayır
        $pending = array();
        $completed = array();
        
        foreach ($assignments as $a) {
            if ($a->submission_status === 'graded') {
                $completed[] = $a;
            } else {
                $pending[] = $a;
            }
        }
        
        ?>
        <style>
            .oal-wrap{margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
            .oal-page-header{margin-bottom:28px}
            .oal-page-title{font-size:22px;font-weight:700;color:#1E4D7B;margin:0 0 4px;display:flex;align-items:center;gap:10px}
            .oal-page-title svg{color:#5DB9E8}
            .oal-page-sub{font-size:14px;color:#64748b;margin:0}
            .oal-section{margin-bottom:32px}
            .oal-section-label{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:14px}
            .oal-section-label::after{content:'';flex:1;height:1px;background:#f1f5f9}
            .oal-grid{display:grid;flex-direction:column;gap:10px;grid-template-columns: repeat(2, 1fr);}
            .oal-card{display:flex;align-items:center;gap:16px;background:#fff;border:1px solid #e8eef4;border-radius:12px;padding:16px 20px;text-decoration:none;color:inherit;transition:all .2s;position:relative;overflow:hidden}
            .oal-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:#5DB9E8;opacity:0;transition:opacity .2s}
            .oal-card:hover{border-color:#5DB9E8;box-shadow:0 4px 16px rgba(93,185,232,.12);transform:translateY(-1px)}
            .oal-card:hover::before{opacity:1}
            .oal-card.overdue{border-color:#fecaca}
            .oal-card.overdue::before{background:var(--oad-danger, #ef4444);opacity:1}
            .oal-card.submitted{border-color:#bfdbfe}
            .oal-card.submitted::before{background:#3b82f6;opacity:1}
            .oal-card.completed{border-color:#bbf7d0;background:#f0fdf4}
            .oal-card.completed::before{background:#10b981;opacity:1}
            .oal-card-icon{width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#eff6ff,#dbeafe);display:flex;align-items:center;justify-content:center;flex-shrink:0}
            .oal-card.overdue .oal-card-icon{background:linear-gradient(135deg,#fff1f2,#fee2e2)}
            .oal-card.completed .oal-card-icon{background:linear-gradient(135deg,#f0fdf4,#dcfce7)}
            .oal-card-body{flex:1;min-width:0}
            .oal-card-course{font-size:11px;color:#5DB9E8;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px}
            .oal-card-title{font-size:15px;font-weight:600;color:#1E4D7B;margin:0 0 5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .oal-card-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
            .oal-card-due{font-size:12px;color:#64748b;display:flex;align-items:center;gap:4px}
            .oal-card-due.overdue{color:#ef4444}
            .oal-card-types{display:flex;gap:4px}
            .oal-type-chip{font-size:11px;background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:10px}
            .oal-card-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0}
            .oal-badge{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:600}
            .oal-badge.pending{background:#fef3c7;color:#92400e}
            .oal-badge.submitted{background:#dbeafe;color:#1d4ed8}
            .oal-badge.overdue{background:#fee2e2;color:#dc2626}
            .oal-badge.completed{background:#d1fae5;color:#065f46}
            .oal-arrow{color:#cbd5e1;font-size:18px;transition:transform .2s}
            .oal-card:hover .oal-arrow{transform:translateX(3px);color:#5DB9E8}
            .oal-empty{text-align:center;padding:48px 24px;background:#f8fbff;border-radius:14px;border:1px dashed #bfdbfe}
            .oal-empty svg{color:#bfdbfe;margin-bottom:12px}
            .oal-empty p{color:#64748b;font-size:14px;margin:0}
            @media (max-width:650px) {
                .oal-grid{grid-template-columns: repeat(1, 1fr);}
            }
        </style>
        
        <div class="oal-wrap">
            <div class="oal-page-header">
                <h2 class="oal-page-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Görevlerim
                </h2>
                <p class="oal-page-sub"><?php echo count($assignments); ?> görev bulundu</p>
            </div>
            
            <?php if (empty($assignments)): ?>
                <div class="oal-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <p>Şu an bekleyen göreviniz bulunmuyor.</p>
                </div>
            <?php else: ?>
                
                <?php if (!empty($pending)): ?>
                <div class="oal-section">
                    <div class="oal-section-label">Bekleyen Görevler</div>
                    <div class="oal-grid">
                        <?php foreach ($pending as $a): 
                            $is_overdue = fabo_is_overdue($a->due_date); // 23:59'a kadar süre var
                            $is_submitted = $a->submission_status === 'pending';
                        ?>
                        <a href="<?php echo wc_get_account_endpoint_url('gorevlerim'); ?>?view=detail&id=<?php echo $a->id; ?>" class="oal-card <?php echo $is_overdue ? 'overdue' : ($is_submitted ? 'submitted' : ''); ?>">
                            <div class="oal-card-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            </div>
                            <div class="oal-card-body">
                                <div class="oal-card-course"><?php echo esc_html($a->course_name); ?></div>
                                <div class="oal-card-title"><?php echo esc_html($a->title); ?></div>
                                <div class="oal-card-meta">
                                    <?php if ($a->due_date): ?>
                                    <span class="oal-card-due <?php echo $is_overdue ? 'overdue' : ''; ?>">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                                        <?php echo date_i18n('d M Y · H:i', fabo_deadline_ts($a->due_date)); ?>
                                    </span>
                                    <?php endif; ?>
                                    <div class="oal-card-types">
                                        <?php if ($a->allow_file): ?><span class="oal-type-chip">Dosya</span><?php endif; ?>
                                        <?php if ($a->allow_voice): ?><span class="oal-type-chip">Ses</span><?php endif; ?>
                                        <?php if ($a->allow_text): ?><span class="oal-type-chip">Metin</span><?php endif; ?>
                                    </div>
                                </div>
                            </div>
                            <div class="oal-card-right">
                                <?php if ($is_submitted): ?>
                                    <span class="oal-badge submitted">Gönderildi</span>
                                <?php elseif ($is_overdue): ?>
                                    <span class="oal-badge overdue">Süresi Geçti</span>
                                <?php else: ?>
                                    <span class="oal-badge pending">Bekliyor</span>
                                <?php endif; ?>
                                <span class="oal-arrow">›</span>
                            </div>
                        </a>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>
                
                <?php if (!empty($completed)): ?>
                <div class="oal-section">
                    <div class="oal-section-label">Tamamlanan Görevler</div>
                    <div class="oal-grid">
                        <?php foreach ($completed as $a): ?>
                        <a href="<?php echo wc_get_account_endpoint_url('gorevlerim'); ?>?view=detail&id=<?php echo $a->id; ?>" class="oal-card completed">
                            <div class="oal-card-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                            <div class="oal-card-body">
                                <div class="oal-card-course"><?php echo esc_html($a->course_name); ?></div>
                                <div class="oal-card-title"><?php echo esc_html($a->title); ?></div>
                            </div>
                            <div class="oal-card-right">
                                <?php if (!empty($a->is_graded) && $a->is_graded): ?>
                                    <span class="oal-badge completed"><?php echo $a->my_score; ?>/<?php echo $a->max_score; ?> puan</span>
                                <?php else: ?>
                                    <span class="oal-badge completed">Tamamlandı</span>
                                <?php endif; ?>
                                <span class="oal-arrow">›</span>
                            </div>
                        </a>
                        <?php endforeach; ?>
                    </div>
                </div>
                <?php endif; ?>
                
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * Görev Detay Sayfası
     */
    /**
     * Panel için: tek bir görev detayını render et (public wrapper)
     */
    public function render_detail_for_panel($assignment_id) {
        $user_id = get_current_user_id();
        if (!$user_id) { echo '<p>Lütfen giriş yapın.</p>'; return; }
        $this->render_assignment_detail($user_id, intval($assignment_id));
    }

    private function render_assignment_detail($user_id, $assignment_id) {
        global $wpdb;
        
        $assignment = $wpdb->get_row($wpdb->prepare("
            SELECT a.*, p.post_title as course_name
            FROM {$wpdb->prefix}oes_assignments a
            LEFT JOIN {$wpdb->posts} p ON a.course_id = p.ID
            WHERE a.id = %d AND a.status = 'active'
        ", $assignment_id));
        
        if (!$assignment) {
            echo '<p>Görev bulunamadı.</p>';
            return;
        }
        
        // Kullanıcının bu kursa kayıtlı olup olmadığını kontrol et
        $enrolled = $wpdb->get_var($wpdb->prepare("
            SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments 
            WHERE user_id = %d AND course_id = %d AND status = 'active'
        ", $user_id, $assignment->course_id));
        
        if (!$enrolled) {
            echo '<p>Bu göreve erişim yetkiniz yok.</p>';
            return;
        }
        
        // Mevcut gönderimi al
        $submission = $wpdb->get_row($wpdb->prepare("
            SELECT * FROM {$wpdb->prefix}oes_assignment_submissions
            WHERE assignment_id = %d AND user_id = %d
        ", $assignment_id, $user_id));
        
        $is_submitted = !is_null($submission);
        $is_evaluated = $is_submitted && $submission->status === 'graded';
        $is_overdue = fabo_is_overdue($assignment->due_date); // 23:59'a kadar süre var
        $has_grading = !empty($assignment->is_graded) && $assignment->is_graded;
        
        // Frontend CSS - Görev Detay
        ?>
        <style>
            /* ============================================
               OES - Görev Detay Sayfası CSS Değişkenleri
               :root içindeki değerleri değiştirerek
               tüm renkleri güncelleyebilirsiniz.
            ============================================ */
            :root {
                --oad-primary:        #1E4D7B;
                --oad-primary-light:  #2a6a9e;
                --oad-accent:         #5DB9E8;
                --oad-accent-light:   #f0f9ff;
                --oad-accent-rgb:     93,185,232;
                --oad-primary-rgb:    30,77,123;
                --oad-success:        #10b981;
                --oad-success-light:  #d1fae5;
                --oad-warning:        #f59e0b;
                --oad-warning-light:  #fef3c7;
                --oad-danger:         #ef4444;
                --oad-border:         #e2e8f0;
                --oad-bg:             #f8fafc;
                --oad-text:           #1e293b;
                --oad-text-muted:     #64748b;
                --oad-text-faint:     #94a3b8;
                --oad-radius:         10px;
                --oad-radius-lg:      14px;
            }

            .oad-wrap{margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
            .oad-back{display:inline-flex;align-items:center;gap:6px;color:var(--oad-accent);text-decoration:none;font-size:13px;font-weight:500;margin-bottom:20px;transition:gap .2s}
            .oad-back:hover{gap:10px;color:var(--oad-primary)}
            .oad-back svg{transition:transform .2s}
            .oad-back:hover svg{transform:translateX(-3px)}
            
            .oad-header{background:linear-gradient(135deg,var(--oad-primary) 0%,var(--oad-primary-light) 100%);border-radius:16px;padding:28px 32px;color:#fff;margin-bottom:20px;position:relative;overflow:hidden}
            .oad-header::before{content:'';position:absolute;top:-40px;right:-40px;width:180px;height:180px;background:rgba(255,255,255,.06);border-radius:50%}
            .oad-header::after{content:'';position:absolute;bottom:-60px;right:60px;width:120px;height:120px;background:rgba(var(--oad-accent-rgb),.12);border-radius:50%}
            .oad-course-tag{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.15);backdrop-filter:blur(10px);border-radius:20px;padding:4px 12px;font-size:12px;font-weight:500;margin-bottom:12px}
            .oad-title{font-size:22px;font-weight:700;margin:0 0 14px;line-height:1.3;position:relative;z-index:1;color: #fff;}
            .oad-meta{display:flex;align-items:center;gap:16px;flex-wrap:wrap;position:relative;z-index:1}
            .oad-due{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.12);border-radius:8px;padding:6px 12px;font-size:13px}
            .oad-due.overdue{background:rgba(239,68,68,.25);color:#fecaca}
            .oad-score-badge{background:rgba(255,255,255,.2);border-radius:10px;padding:8px 16px;text-align:center;margin-left:auto}
            .oad-score-badge .val{font-size:26px;font-weight:800;line-height:1}
            .oad-score-badge .lbl{font-size:11px;opacity:.7;margin-top:2px}
            .oad-done-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,.2);border:1px solid rgba(16,185,129,.3);border-radius:10px;padding:8px 16px;font-size:13px;font-weight:600;color:#6ee7b7;margin-left:auto}
            
            .oad-card{background:#fff;border:1px solid var(--oad-border);border-radius:var(--oad-radius-lg);padding:24px;margin-bottom:16px}
            .oad-card-title{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:var(--oad-primary);text-transform:uppercase;letter-spacing:.7px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--oad-bg)}
            .oad-card-title svg{width:16px;height:16px;color:var(--oad-accent);flex-shrink:0}
            .oad-desc-text{font-size:15px;color:#374151;line-height:1.7}
            
            .oad-feedback-card{background:linear-gradient(135deg,#fffbeb,var(--oad-warning-light));border:1px solid #fde68a;border-radius:var(--oad-radius-lg);padding:24px;margin-bottom:16px}
            .oad-feedback-card .oad-card-title{color:#92400e;border-bottom-color:#fde68a}
            .oad-feedback-card .oad-card-title svg{color:var(--oad-warning)}
            .oad-feedback-text{font-size:15px;color:#78350f;line-height:1.7}
            
            .oad-submission-card{background:#f8fbff;border:1px solid #dbeafe;border-radius:var(--oad-radius-lg);padding:24px;margin-bottom:16px}
            .oad-submission-card .oad-card-title{color:#1e40af;border-bottom-color:#dbeafe}
            .oad-submission-card .oad-card-title svg{color:#3b82f6}
            .oad-submission-meta{display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap}
            .oad-sub-date{font-size:13px;color:var(--oad-text-muted)}
            .oad-status-graded{display:inline-flex;align-items:center;gap:5px;background:var(--oad-success-light);color:#065f46;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
            .oad-status-pending{display:inline-flex;align-items:center;gap:5px;background:var(--oad-warning-light);color:#92400e;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600}
            .oad-sub-text{background:#fff;border:1px solid var(--oad-border);border-radius:var(--oad-radius);padding:16px;font-size:14px;color:#334155;line-height:1.7;white-space:pre-wrap}
            
            .oad-attachments{display:flex;flex-direction:column;gap:10px;margin-top:12px}
            .oad-file-item{display:inline-flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--oad-border);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--oad-primary);text-decoration:none;transition:all .2s;width:fit-content}
            .oad-file-item:hover{border-color:var(--oad-accent);background:var(--oad-accent-light);transform:translateY(-1px);box-shadow:0 2px 8px rgba(var(--oad-accent-rgb),.2)}
            .oad-file-icon{width:32px;height:32px;background:#eff6ff;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#3b82f6;font-size:16px;flex-shrink:0}
            .oad-voice-item{background:#fff;border:1px solid var(--oad-border);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:12px}
            .oad-voice-icon{width:32px;height:32px;background:#fdf4ff;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#a855f7;font-size:16px;flex-shrink:0}
            .oad-voice-item audio{height:32px;flex:1}
            .oad-voice-dur{font-size:12px;font-weight:600;color:#64748b;background:#f8fafc;border:1px solid var(--oad-border);border-radius:6px;padding:3px 8px;font-variant-numeric:tabular-nums;flex-shrink:0}
            
            .oad-submit-card{background:#fff;border:2px dashed var(--oad-accent);border-radius:var(--oad-radius-lg);padding:24px;margin-bottom:16px}
            .oad-submit-card.has-submission{border-style:solid;border-color:var(--oad-border)}
            .oad-submit-title{font-size:15px;font-weight:700;color:var(--oad-primary);margin-bottom:4px}
            .oad-extra-deadline{font-size:13px;color:var(--oad-warning);margin-bottom:16px}
            .oad-form-group{margin-bottom:18px}
            .oad-form-group label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
            .oad-form-group label small{font-weight:400;color:var(--oad-text-faint)}
            .oad-form-group textarea{width:100%;padding:12px;border:1px solid var(--oad-border);border-radius:var(--oad-radius);font-size:14px;line-height:1.6;resize:vertical;min-height:100px;box-sizing:border-box;transition:border-color .2s}
            .oad-form-group textarea:focus{outline:none;border-color:var(--oad-accent);box-shadow:0 0 0 3px rgba(var(--oad-accent-rgb),.15)}
            .oad-upload-area{display:flex;align-items:center;justify-content:center;gap:8px;padding:20px;border:2px dashed #d1d5db;border-radius:var(--oad-radius);cursor:pointer;transition:all .2s;color:var(--oad-text-muted);font-size:13px}
            .oad-upload-area:hover{border-color:var(--oad-accent);background:var(--oad-accent-light);color:var(--oad-primary)}
            .oad-recorder-controls{display:flex;align-items:center;gap:12px}
            .oad-record-btn{display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:var(--oad-primary);color:#fff;border:none;border-radius:var(--oad-radius);font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
            .oad-record-btn:hover{background:var(--oad-primary-light)}
            .oad-record-btn.recording{background:var(--oad-danger);animation:pulse-rec .8s ease-in-out infinite}
            @keyframes pulse-rec{0%,100%{opacity:1}50%{opacity:.7}}
            .oad-record-dot{width:8px;height:8px;background:currentColor;border-radius:50%}
            .oad-submit-actions{display:flex;align-items:center;gap:12px;margin-top:20px;padding-top:20px;border-top:1px solid var(--oad-bg)}
            .oad-submit-btn{padding:12px 28px;background:linear-gradient(135deg,var(--oad-accent),var(--oad-primary));color:#fff;border:none;border-radius:var(--oad-radius);font-size:14px;font-weight:600;cursor:pointer;transition:all .2s;box-shadow:0 2px 8px rgba(var(--oad-primary-rgb),.25)}
            .oad-submit-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(var(--oad-primary-rgb),.3)}
            .oad-submit-btn:disabled{opacity:.6;cursor:wait;transform:none}
            .oad-submit-note{font-size:12px;color:var(--oad-text-faint)}
            .oad-speech-btn{background:none;border:1px solid var(--oad-border);border-radius:6px;padding:3px 10px;font-size:11px;color:var(--oad-text-muted);cursor:pointer;margin-left:8px;transition:all .2s}
            .oad-speech-btn:hover{border-color:var(--oad-accent);color:var(--oad-primary)}
        </style>
        
        <div class="oad-wrap">
            <a href="<?php echo wc_get_account_endpoint_url('gorevlerim'); ?>" class="oad-back">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Görevlerime Dön
            </a>
            
            <!-- Header -->
            <div class="oad-header">
                <div class="oad-course-tag">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                    <?php echo esc_html($assignment->course_name); ?>
                </div>
                <h2 class="oad-title"><?php echo esc_html($assignment->title); ?></h2>
                <div class="oad-meta">
                    <?php if ($assignment->due_date): ?>
                    <div class="oad-due <?php echo $is_overdue ? 'overdue' : ''; ?>">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        Son Teslim: <?php echo date_i18n('d M Y H:i', fabo_deadline_ts($assignment->due_date)); ?>
                        <?php if ($is_overdue && !$is_submitted): ?><strong>· Süre Doldu</strong><?php endif; ?>
                    </div>
                    <?php endif; ?>
                    
                    <?php if ($is_evaluated && $has_grading): ?>
                    <div class="oad-score-badge">
                        <div class="val"><?php echo $submission->score; ?><span style="font-size:14px;opacity:.7">/<?php echo $assignment->max_score; ?></span></div>
                        <div class="lbl">PUAN</div>
                    </div>
                    <?php elseif ($is_evaluated && !$has_grading): ?>
                    <div class="oad-done-badge">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        Tamamlandı
                    </div>
                    <?php endif; ?>
                </div>
            </div>
            
            <?php if ($assignment->description): ?>
            <div class="oad-card">
                <div class="oad-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    Görev Açıklaması
                </div>
                <div class="oad-desc-text"><?php echo nl2br(esc_html($assignment->description)); ?></div>
            </div>
            <?php endif; ?>
            
            <?php if ($is_evaluated && $submission->feedback): ?>
            <div class="oad-feedback-card">
                <div class="oad-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    Eğitmen Geri Bildirimi
                </div>
                <div class="oad-feedback-text"><?php echo nl2br(esc_html($submission->feedback)); ?></div>
            </div>
            <?php endif; ?>
            
            <?php if ($is_submitted): ?>
            <div class="oad-submission-card">
                <div class="oad-card-title">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Gönderiminiz
                </div>
                <div class="oad-submission-meta">
                    <span class="oad-sub-date">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <?php echo date_i18n('d M Y · H:i', strtotime($submission->submitted_at)); ?>
                    </span>
                    <?php if ($is_evaluated): ?>
                        <span class="oad-status-graded">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            Değerlendirildi
                        </span>
                    <?php else: ?>
                        <span class="oad-status-pending">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            Değerlendirme Bekleniyor
                        </span>
                    <?php endif; ?>
                </div>
                
                <?php if ($submission->submission_text): ?>
                <div class="oad-sub-text"><?php echo nl2br(esc_html($submission->submission_text)); ?></div>
                <?php endif; ?>
                
                <?php
                // Dosya ve sesleri JSON'dan parse et
                $show_files = array();
                $show_voices = array();
                
                if ($submission->file_url) {
                    $show_files = json_decode($submission->file_url, true);
                    if (!is_array($show_files)) {
                        $show_files = array(array('name' => $submission->file_name ?: 'Dosya', 'url' => $submission->file_url));
                    }
                }
                
                if ($submission->voice_url) {
                    $show_voices = json_decode($submission->voice_url, true);
                    if (!is_array($show_voices)) {
                        $show_voices = array(array('url' => $submission->voice_url, 'duration' => 0));
                    }
                }
                ?>
                
                <?php if (!empty($show_files) || !empty($show_voices)): ?>
                <div class="oad-attachments">
                    <?php foreach ($show_files as $file): ?>
                    <a href="<?php echo esc_url($file['url']); ?>" target="_blank" class="oad-file-item">
                        <div class="oad-file-icon">📎</div>
                        <?php echo esc_html($file['name']); ?>
                    </a>
                    <?php endforeach; ?>
                    
                    <?php foreach ($show_voices as $voice): 
                        $vdur = isset($voice['duration']) ? intval($voice['duration']) : 0;
                        $vdur_text = sprintf('%02d:%02d', floor($vdur / 60), $vdur % 60);
                    ?>
                    <div class="oad-voice-item">
                        <div class="oad-voice-icon">🎤</div>
                        <audio controls src="<?php echo esc_url($voice['url']); ?>"></audio>
                        <?php if ($vdur > 0): ?>
                        <span class="oad-voice-dur"><?php echo esc_html($vdur_text); ?></span>
                        <?php endif; ?>
                    </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
            <?php endif; ?>
            
            <?php 
            // Ek gönderim süresi kontrolü
            $extra_days = isset($assignment->extra_days) ? intval($assignment->extra_days) : 2;
            $can_add_extra = true;
            $extra_deadline = null;
            
            if ($is_submitted && $extra_days > 0) {
                $extra_deadline = strtotime($submission->submitted_at . ' + ' . $extra_days . ' days');
                if (time() > $extra_deadline) {
                    $can_add_extra = false;
                }
            }
            ?>
            
            <?php if (!$is_evaluated && $can_add_extra): ?>
            <div class="oad-submit-card <?php echo $is_submitted ? 'has-submission' : ''; ?>">
                <div class="oad-submit-title"><?php echo $is_submitted ? 'Ek Gönder / Güncelle' : 'Görev Gönder'; ?></div>
                
                <?php if ($is_submitted && $extra_deadline): ?>
                <p class="oad-extra-deadline">
                    ⏰ Ek gönderim için son tarih: <strong><?php echo date_i18n('d M Y H:i', $extra_deadline); ?></strong>
                </p>
                <?php endif; ?>
                
                <?php
                // Mevcut dosya ve sesleri al
                $existing_files = array();
                $existing_voices = array();
                if ($is_submitted) {
                    if ($submission->file_url) {
                        $existing_files = json_decode($submission->file_url, true);
                        if (!is_array($existing_files)) {
                            // Eski format - tek dosya
                            $existing_files = array(array('name' => $submission->file_name, 'url' => $submission->file_url));
                        }
                    }
                    if ($submission->voice_url) {
                        $existing_voices = json_decode($submission->voice_url, true);
                        if (!is_array($existing_voices)) {
                            // Eski format - tek ses
                            $existing_voices = array(array('url' => $submission->voice_url, 'duration' => 0));
                        }
                    }
                }
                ?>
                
                <form id="oesSubmissionForm" class="oes-submission-form" data-assignment-id="<?php echo $assignment_id; ?>">
                    
                    <?php if ($assignment->allow_text): ?>
                    <div class="oad-form-group">
                        <label>
                            Metin Yanıtı
                            <button type="button" class="oad-speech-btn" id="oesSpeechBtn">Sesle Yaz</button>
                        </label>
                        <textarea name="submission_text" id="submissionText" placeholder="Yanıtınızı yazın..."><?php echo $is_submitted ? esc_textarea($submission->submission_text) : ''; ?></textarea>
                    </div>
                    <?php endif; ?>
                    
                    <?php if ($assignment->allow_file): ?>
                    <div class="oad-form-group">
                        <label>Dosyalar <small>(birden fazla ekleyebilirsiniz)</small></label>
                        <div class="oes-file-upload">
                            <input type="file" id="assignmentFile" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.jpg,.jpeg,.png,.gif" style="display:none">
                            <div class="oad-upload-area" id="uploadArea">
                                <span class="oes-upload-icon">+</span>
                                <span>Dosya ekle</span>
                            </div>
                        </div>
                        <div class="oes-files-list" id="filesList"></div>
                        <input type="hidden" id="filesData" value='<?php echo esc_attr(json_encode($existing_files)); ?>'>
                        <input type="hidden" id="existingFiles" value='<?php echo esc_attr(json_encode($existing_files)); ?>'>
                    </div>
                    <?php endif; ?>
                    
                    <?php if ($assignment->allow_voice): ?>
                    <div class="oad-form-group">
                        <label>Ses Kayıtları <small>(birden fazla ekleyebilirsiniz)</small></label>
                        <div class="oes-voice-recorder">
                            <div class="oes-recorder-controls">
                                <button type="button" class="oad-record-btn" id="recordBtn">
                                    <span class="oad-record-dot"></span>
                                    <span class="oes-rec-text">Kayda Başla</span>
                                </button>
                                <span class="oes-record-time" id="recordTime" style="display:none">00:00</span>
                            </div>
                            <canvas id="waveCanvas" width="300" height="30"></canvas>
                        </div>
                        <div class="oes-voices-list" id="voicesList"></div>
                        <input type="hidden" id="voicesData" value='<?php echo esc_attr(json_encode($existing_voices)); ?>'>
                        <input type="hidden" id="existingVoices" value='<?php echo esc_attr(json_encode($existing_voices)); ?>'>
                    </div>
                    <?php endif; ?>
                    
                    <div class="oad-submit-actions">
                        <button type="submit" class="oad-submit-btn" id="submitBtn">Gönder</button>
                        <span class="oad-submit-note">Değerlendirme yapılana kadar güncelleyebilirsiniz.</span>
                    </div>
                </form>
            </div>
            <?php endif; ?>
        </div>
        <?php
    }

    /**
     * AJAX: Görev Kaydet
     */
    public function ajax_save_assignment() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }
        
        global $wpdb;
        
        $assignment_id = intval($_POST['assignment_id']);
        $is_graded = isset($_POST['is_graded']) ? 1 : 0;
        
        $data = array(
            'course_id' => intval($_POST['course_id']),
            'period_id' => !empty($_POST['period_id']) ? intval($_POST['period_id']) : null,
            'title' => sanitize_text_field($_POST['title']),
            'description' => sanitize_textarea_field($_POST['description']),
            'due_date' => !empty($_POST['due_date']) ? sanitize_text_field($_POST['due_date']) : null,
            'extra_days' => intval($_POST['extra_days'] ?? 2),
            'is_graded' => $is_graded,
            'max_score' => $is_graded ? intval($_POST['max_score']) : 0,
            'allow_file' => isset($_POST['allow_file']) ? 1 : 0,
            'allow_voice' => isset($_POST['allow_voice']) ? 1 : 0,
            'allow_text' => isset($_POST['allow_text']) ? 1 : 0,
            'status' => sanitize_text_field($_POST['status'])
        );
        
        if ($assignment_id > 0) {
            $wpdb->update(
                $wpdb->prefix . 'oes_assignments',
                $data,
                array('id' => $assignment_id)
            );
        } else {
            $data['created_by'] = get_current_user_id();
            $wpdb->insert($wpdb->prefix . 'oes_assignments', $data);
            $assignment_id = $wpdb->insert_id;
            
            // Yeni görev oluşturuldu - mail bildirimi gönder
            do_action('oes_assignment_created', $assignment_id);
        }
        
        wp_send_json_success(array(
            'message' => 'Görev kaydedildi.',
            'redirect' => admin_url('admin.php?page=oes-assignments')
        ));
    }

    /**
     * AJAX: Görev Sil
     */
    public function ajax_delete_assignment() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }
        
        global $wpdb;
        
        $assignment_id = intval($_POST['assignment_id']);
        
        // Önce gönderimleri sil
        $wpdb->delete($wpdb->prefix . 'oes_assignment_submissions', array('assignment_id' => $assignment_id));
        
        // Sonra görevi sil
        $wpdb->delete($wpdb->prefix . 'oes_assignments', array('id' => $assignment_id));
        
        wp_send_json_success('Görev silindi.');
    }

    /**
     * AJAX: Dönemleri Getir
     */
    public function ajax_get_periods() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        global $wpdb;
        
        $course_id = intval($_POST['course_id']);
        
        $periods = $wpdb->get_results($wpdb->prepare("
            SELECT id, name, start_date, end_date
            FROM {$wpdb->prefix}oes_periods
            WHERE course_id = %d
            ORDER BY start_date DESC
        ", $course_id));
        
        wp_send_json_success($periods);
    }

    /**
     * AJAX: Görev Gönder
     */
    public function ajax_submit_assignment() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error('Giriş yapmalısınız.');
        }
        
        global $wpdb;
        
        $assignment_id = intval($_POST['assignment_id']);
        
        // Görev var mı kontrol et
        $assignment = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_assignments WHERE id = %d",
            $assignment_id
        ));
        
        if (!$assignment) {
            wp_send_json_error('Görev bulunamadı.');
        }
        
        // Kullanıcı kayıtlı mı kontrol et
        $enrolled = $wpdb->get_var($wpdb->prepare("
            SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments 
            WHERE user_id = %d AND course_id = %d AND status = 'active'
        ", $user_id, $assignment->course_id));
        
        if (!$enrolled) {
            wp_send_json_error('Bu kursa kayıtlı değilsiniz.');
        }
        
        // Mevcut gönderi var mı kontrol et
        $existing = $wpdb->get_row($wpdb->prepare("
            SELECT * FROM {$wpdb->prefix}oes_assignment_submissions
            WHERE assignment_id = %d AND user_id = %d
        ", $assignment_id, $user_id));
        
        // Değerlendirilmişse güncelleme yapılamaz
        if ($existing && $existing->status === 'graded') {
            wp_send_json_error('Bu görev değerlendirilmiş, güncelleme yapamazsınız.');
        }
        
        // JSON verileri al ve doğrula:
        // Yalnızca bu sitenin yükleme dizinindeki URL'ler kabul edilir
        // (istemci keyfi/harici URL iddia edemesin).
        $upload_base = wp_upload_dir()['baseurl'];

        $sanitize_uploads = function ($json, $keep_duration = false) use ($upload_base) {
            $arr = json_decode(wp_unslash($json), true);
            if (!is_array($arr)) return array();
            $out = array();
            foreach ($arr as $item) {
                if (!is_array($item)) continue;
                $url = esc_url_raw($item['url'] ?? '');
                if (!$url || strpos($url, $upload_base) !== 0) continue; // sadece kendi uploads'umuz
                $clean = array('url' => $url);
                if (isset($item['name'])) $clean['name'] = sanitize_text_field($item['name']);
                if ($keep_duration && isset($item['duration'])) $clean['duration'] = floatval($item['duration']);
                $out[] = $clean;
            }
            return $out;
        };

        $files_json  = wp_json_encode($sanitize_uploads($_POST['files_json'] ?? '[]'));
        $voices_json = wp_json_encode($sanitize_uploads($_POST['voices_json'] ?? '[]', true));

        $data = array(
            'assignment_id' => $assignment_id,
            'user_id' => $user_id,
            'submission_text' => sanitize_textarea_field($_POST['submission_text'] ?? ''),
            'file_url' => $files_json,
            'file_name' => '',
            'voice_url' => $voices_json,
            'status' => 'pending'
        );
        
        if ($existing) {
            $wpdb->update(
                $wpdb->prefix . 'oes_assignment_submissions',
                $data,
                array('id' => $existing->id)
            );
            $submission_id = $existing->id;
        } else {
            $wpdb->insert($wpdb->prefix . 'oes_assignment_submissions', $data);
            $submission_id = $wpdb->insert_id;
        }

        // Teslim VE yeniden teslimde bildirim (push aynı görev için tag ile birleşir, spam olmaz)
        do_action('oes_assignment_submitted', $submission_id);

        wp_send_json_success('Gönderiminiz kaydedildi.');
    }

    /**
     * AJAX: Değerlendirme
     */
    public function ajax_grade_submission() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }
        
        global $wpdb;
        
        $submission_id = intval($_POST['submission_id']);
        $score = intval($_POST['score']);
        $feedback = sanitize_textarea_field($_POST['feedback'] ?? '');
        
        $wpdb->update(
            $wpdb->prefix . 'oes_assignment_submissions',
            array(
                'score' => $score,
                'feedback' => $feedback,
                'status' => 'graded',
                'graded_by' => get_current_user_id(),
                'graded_at' => current_time('mysql')
            ),
            array('id' => $submission_id)
        );
        
        // Görev notlandı - mail bildirimi gönder
        do_action('oes_assignment_graded', $submission_id);
        
        wp_send_json_success('Değerlendirme kaydedildi.');
    }

    /**
     * AJAX: Gönderim Sil
     */
    public function ajax_delete_submission() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }
        
        global $wpdb;
        
        $submission_id = intval($_POST['submission_id']);
        
        // Gönderimi sil
        $wpdb->delete($wpdb->prefix . 'oes_assignment_submissions', array('id' => $submission_id));
        
        wp_send_json_success('Gönderim silindi.');
    }

    /**
     * AJAX: Dosya Yükle
     */
    public function ajax_upload_file() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!is_user_logged_in()) {
            wp_send_json_error('Giriş yapmalısınız.');
        }
        
        if (empty($_FILES['file'])) {
            wp_send_json_error('Dosya bulunamadı.');
        }
        
        $file = $_FILES['file'];
        
        // Dosya boyutu kontrolü (10MB)
        if ($file['size'] > 10 * 1024 * 1024) {
            wp_send_json_error('Dosya boyutu 10MB\'dan büyük olamaz.');
        }
        
        // Uzantı kontrolü
        $allowed = array('pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'zip', 'rar', 'jpg', 'jpeg', 'png', 'gif');
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        
        if (!in_array($ext, $allowed)) {
            wp_send_json_error('Bu dosya türü desteklenmiyor.');
        }
        
        require_once(ABSPATH . 'wp-admin/includes/file.php');
        
        $upload = wp_handle_upload($file, array('test_form' => false));
        
        if (isset($upload['error'])) {
            wp_send_json_error($upload['error']);
        }
        
        wp_send_json_success(array(
            'url' => $upload['url'],
            'name' => $file['name']
        ));
    }

    /**
     * AJAX: Ses Kaydı Yükle
     */
    public function ajax_upload_voice() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!is_user_logged_in()) {
            wp_send_json_error('Giriş yapmalısınız.');
        }
        
        if (empty($_FILES['voice'])) {
            wp_send_json_error('Ses dosyası bulunamadı.');
        }
        
        $file = $_FILES['voice'];

        // Dosya boyutu kontrolü (20MB)
        if ($file['size'] > 20 * 1024 * 1024) {
            wp_send_json_error('Ses dosyası 20MB\'dan büyük olamaz.');
        }

        // Gerçek yükleme mi? (spoof edilmiş yollara karşı)
        if (!is_uploaded_file($file['tmp_name'])) {
            wp_send_json_error('Geçersiz yükleme.');
        }

        // İçerik türü doğrulaması: yalnızca ses/video kaydı kabul edilir.
        // (Dosya .mp4 olarak kaydedildiği için PHP çalışmaz; yine de içeriği doğruluyoruz.)
        $real_mime = '';
        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $real_mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
        }
        if (!$real_mime) {
            $real_mime = sanitize_text_field($file['type'] ?? '');
        }
        $mime_ok = $real_mime && (
            strpos($real_mime, 'audio/') === 0 ||
            strpos($real_mime, 'video/') === 0 ||
            $real_mime === 'application/ogg'
        );
        if (!$mime_ok) {
            wp_send_json_error('Yalnızca ses kaydı yükleyebilirsiniz.');
        }

        // Upload dizini
        $upload_dir = wp_upload_dir();
        $target_dir = $upload_dir['path'];

        // Benzersiz dosya adı - .mp4 uzantısı kullan (sunucu uyumluluğu için)
        // webm içeriği mp4 konteynerinde çalışır
        $filename = 'voice_' . get_current_user_id() . '_' . time() . '.mp4';
        $target_path = $target_dir . '/' . $filename;

        // Dosyayı taşı
        if (move_uploaded_file($file['tmp_name'], $target_path)) {
            $file_url = $upload_dir['url'] . '/' . $filename;
            wp_send_json_success(array('url' => $file_url));
        } else {
            wp_send_json_error('Dosya yüklenemedi.');
        }
    }
    
    /**
     * Transkripti getir (audio_hash ile unique kontrol)
     */
    public function ajax_get_transcript() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $submission_id = isset($_POST['submission_id']) ? intval($_POST['submission_id']) : 0;
        $voice_index = isset($_POST['voice_index']) ? intval($_POST['voice_index']) : 0;
        $audio_hash = isset($_POST['audio_hash']) ? sanitize_text_field($_POST['audio_hash']) : '';
        
        if (!$submission_id) {
            wp_send_json_error('Geçersiz ID');
        }
        
        global $wpdb;
        $table = $wpdb->prefix . 'oes_assignment_submissions';
        
        // JSON al
        $json = $wpdb->get_var($wpdb->prepare(
            "SELECT voice_transcript FROM $table WHERE id = %d",
            $submission_id
        ));
        
        if (empty($json)) {
            wp_send_json_success(array('transcript' => null));
        }
        
        // Decode et
        $transcripts = json_decode($json, true);
        
        // Array mi kontrol et
        if (!is_array($transcripts)) {
            // Eski format, string olarak döndür
            wp_send_json_success(array('transcript' => $json));
        }
        
        // Key: voiceIndex_audioHash şeklinde
        $key = $voice_index . '_' . $audio_hash;
        
        if (isset($transcripts[$key])) {
            wp_send_json_success(array('transcript' => $transcripts[$key]));
        }
        
        // Yok
        wp_send_json_success(array('transcript' => null));
    }
    
    /**
     * Transkripti kaydet    /**
     * Transkripti kaydet (audio_hash ile unique kayıt)
     */
    public function ajax_save_transcript() {
        check_ajax_referer('oes_assignments_nonce', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $submission_id = isset($_POST['submission_id']) ? intval($_POST['submission_id']) : 0;
        $voice_index = isset($_POST['voice_index']) ? intval($_POST['voice_index']) : 0;
        $audio_hash = isset($_POST['audio_hash']) ? sanitize_text_field($_POST['audio_hash']) : '';
        $transcript = isset($_POST['transcript']) ? wp_kses_post($_POST['transcript']) : '';
        
        if (!$submission_id || empty($transcript) || empty($audio_hash)) {
            wp_send_json_error('Geçersiz veri');
        }
        
        global $wpdb;
        $table = $wpdb->prefix . 'oes_assignment_submissions';
        
        // Mevcut JSON'u al
        $json = $wpdb->get_var($wpdb->prepare(
            "SELECT voice_transcript FROM $table WHERE id = %d",
            $submission_id
        ));
        
        // Decode et
        $transcripts = array();
        if (!empty($json)) {
            $decoded = json_decode($json, true);
            if (is_array($decoded)) {
                $transcripts = $decoded;
            }
        }
        
        // Key: voiceIndex_audioHash şeklinde (ses değişirse hash değişir!)
        $key = $voice_index . '_' . $audio_hash;
        $transcripts[$key] = $transcript;
        
        // Encode et
        $new_json = wp_json_encode($transcripts, JSON_UNESCAPED_UNICODE);
        
        // Kaydet
        $updated = $wpdb->update(
            $table,
            array('voice_transcript' => $new_json),
            array('id' => $submission_id),
            array('%s'),
            array('%d')
        );
        
        if ($updated !== false) {
            wp_send_json_success(array('message' => 'Kaydedildi'));
        } else {
            wp_send_json_error('Veritabanı hatası');
        }
    }
}

// WordPress'e ses dosyası türlerini izin ver
add_filter('upload_mimes', function($mimes) {
    $mimes['webm'] = 'audio/webm';
    $mimes['ogg'] = 'audio/ogg';
    $mimes['opus'] = 'audio/opus';
    return $mimes;
});

// Dosya türü kontrolünü geç
add_filter('wp_check_filetype_and_ext', function($data, $file, $filename, $mimes) {
    $ext = pathinfo($filename, PATHINFO_EXTENSION);
    if (in_array($ext, array('webm', 'ogg', 'opus'))) {
        $data['ext'] = $ext;
        $data['type'] = 'audio/' . $ext;
    }
    return $data;
}, 10, 4);

// Başlat
OES_Assignments::instance();
