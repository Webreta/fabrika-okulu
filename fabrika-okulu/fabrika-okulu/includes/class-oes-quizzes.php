<?php
/**
 * Online Eğitim Sistemi - Quiz/Sınav Modülü
 */

if (!defined('ABSPATH')) exit;

class OES_Quizzes {
    
    private static $instance = null;
    
    public static function instance() {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // AJAX handlers
        add_action('wp_ajax_oes_save_quiz', array($this, 'ajax_save_quiz'));
        add_action('wp_ajax_oes_delete_quiz', array($this, 'ajax_delete_quiz'));
        add_action('wp_ajax_oes_restore_quiz', array($this, 'ajax_restore_quiz'));
        add_action('wp_ajax_oes_permanent_delete_quiz', array($this, 'ajax_permanent_delete_quiz'));
        add_action('wp_ajax_oes_get_question', array($this, 'ajax_get_question'));
        add_action('wp_ajax_oes_save_question', array($this, 'ajax_save_question'));
        add_action('wp_ajax_oes_delete_question', array($this, 'ajax_delete_question'));
        add_action('wp_ajax_oes_reorder_questions', array($this, 'ajax_reorder_questions'));
        add_action('wp_ajax_oes_get_periods_for_quiz', array($this, 'ajax_get_periods'));
        add_action('wp_ajax_oes_grade_open_ended', array($this, 'ajax_grade_open_ended'));
        
        // Öğrenci AJAX
        add_action('wp_ajax_oes_submit_quiz', array($this, 'ajax_submit_quiz'));
        add_action('wp_ajax_oes_save_quiz_progress', array($this, 'ajax_save_progress'));
        add_action('wp_ajax_oes_load_quiz_in_player', array($this, 'ajax_load_quiz_in_player'));
        add_action('wp_ajax_oes_delete_quiz_attempt', array($this, 'ajax_delete_quiz_attempt'));
        add_action('wp_ajax_oes_admin_delete_attempt', array($this, 'ajax_admin_delete_attempt'));
        
        // Hesabım endpoint
        add_action('init', array($this, 'add_endpoints'));
        add_filter('woocommerce_account_menu_items', array($this, 'add_menu_items'), 15);
        add_action('woocommerce_account_sinavlarim_endpoint', array($this, 'render_my_quizzes'));
        
        // Tabloları oluştur / migrate et
        add_action('admin_init', array($this, 'maybe_create_tables'));
        
        // Scripts
        add_action('wp_enqueue_scripts', array($this, 'frontend_scripts'));
    }
    
    public function maybe_create_tables() {
        global $wpdb;
        $db_version = get_option('oes_quiz_db_version', '0');

        // Tabloları oluştur (yoksa)
        $this->create_tables();

        // Eksik kolonları ekle - sürümden bağımsız her seferinde kontrol
        $tq  = $wpdb->prefix . 'oes_quizzes';
        $tqq = $wpdb->prefix . 'oes_quiz_questions';
        $tqa = $wpdb->prefix . 'oes_quiz_attempts';
        $tan = $wpdb->prefix . 'oes_quiz_answers';

        $this->add_column_if_missing($tq,  'period_id',             "ALTER TABLE $tq ADD COLUMN period_id bigint(20) DEFAULT NULL AFTER course_id");
        $this->add_column_if_missing($tq,  'pass_score',            "ALTER TABLE $tq ADD COLUMN pass_score int(11) DEFAULT 60 AFTER time_limit");
        $this->add_column_if_missing($tq,  'max_attempts',          "ALTER TABLE $tq ADD COLUMN max_attempts int(11) DEFAULT 1 AFTER pass_score");
        $this->add_column_if_missing($tq,  'shuffle_questions',     "ALTER TABLE $tq ADD COLUMN shuffle_questions tinyint(1) DEFAULT 0 AFTER max_attempts");
        $this->add_column_if_missing($tq,  'shuffle_answers',       "ALTER TABLE $tq ADD COLUMN shuffle_answers tinyint(1) DEFAULT 0 AFTER shuffle_questions");
        $this->add_column_if_missing($tq,  'show_correct_answers',  "ALTER TABLE $tq ADD COLUMN show_correct_answers tinyint(1) DEFAULT 1 AFTER shuffle_answers");
        $this->add_column_if_missing($tq,  'is_practice',           "ALTER TABLE $tq ADD COLUMN is_practice tinyint(1) DEFAULT 0 AFTER show_correct_answers");
        $this->add_column_if_missing($tq,  'start_date',            "ALTER TABLE $tq ADD COLUMN start_date datetime DEFAULT NULL AFTER is_practice");
        $this->add_column_if_missing($tq,  'end_date',              "ALTER TABLE $tq ADD COLUMN end_date datetime DEFAULT NULL AFTER start_date");

        $this->add_column_if_missing($tqq, 'question_image',        "ALTER TABLE $tqq ADD COLUMN question_image varchar(500) DEFAULT NULL AFTER question_text");
        $this->add_column_if_missing($tqq, 'explanation',           "ALTER TABLE $tqq ADD COLUMN explanation text DEFAULT NULL AFTER points");

        $this->add_column_if_missing($tqa, 'total_points',          "ALTER TABLE $tqa ADD COLUMN total_points int(11) DEFAULT 0 AFTER score");
        $this->add_column_if_missing($tqa, 'earned_points',         "ALTER TABLE $tqa ADD COLUMN earned_points decimal(5,2) DEFAULT 0 AFTER total_points");
        $this->add_column_if_missing($tqa, 'passed',                "ALTER TABLE $tqa ADD COLUMN passed tinyint(1) DEFAULT NULL AFTER earned_points");
        $this->add_column_if_missing($tqa, 'time_spent',            "ALTER TABLE $tqa ADD COLUMN time_spent int(11) DEFAULT 0 AFTER completed_at");
        $this->add_column_if_missing($tqa, 'answers',               "ALTER TABLE $tqa ADD COLUMN answers longtext AFTER time_spent");

        // oes_quiz_answers: user_answer (DB'de answer_text olarak var - her ikisini de ekle)
        $this->add_column_if_missing($tan, 'user_answer',           "ALTER TABLE $tan ADD COLUMN user_answer text DEFAULT NULL AFTER question_id");
        $this->add_column_if_missing($tan, 'graded_by',             "ALTER TABLE $tan ADD COLUMN graded_by bigint(20) DEFAULT NULL AFTER points_earned");
        $this->add_column_if_missing($tan, 'graded_at',             "ALTER TABLE $tan ADD COLUMN graded_at datetime DEFAULT NULL AFTER graded_by");
        $this->add_column_if_missing($tan, 'feedback',              "ALTER TABLE $tan ADD COLUMN feedback text DEFAULT NULL AFTER graded_at");

        // passing_score → pass_score alias - passing_score DB'de var ama kodda pass_score kullanılıyor
        // passing_score'u da koru
        $this->add_column_if_missing($tq, 'passing_score',          "ALTER TABLE $tq ADD COLUMN passing_score int(11) DEFAULT 60 AFTER pass_score");

        update_option('oes_quiz_db_version', '1.2');
    }

    private function add_column_if_missing($table, $column, $sql) {
        global $wpdb;
        $exists = $wpdb->get_var("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '$table' AND COLUMN_NAME = '$column'");
        if (!$exists) {
            $wpdb->query($sql);
        }
    }
    
    public function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        
        $table_quizzes = $wpdb->prefix . 'oes_quizzes';
        $sql = "CREATE TABLE IF NOT EXISTS $table_quizzes (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            title varchar(255) NOT NULL,
            description text,
            course_id bigint(20) NOT NULL,
            period_id bigint(20) DEFAULT NULL,
            time_limit int(11) DEFAULT 0,
            pass_score int(11) DEFAULT 60,
            max_attempts int(11) DEFAULT 1,
            shuffle_questions tinyint(1) DEFAULT 0,
            shuffle_answers tinyint(1) DEFAULT 0,
            show_correct_answers tinyint(1) DEFAULT 1,
            is_practice tinyint(1) DEFAULT 0,
            status varchar(20) DEFAULT 'active',
            start_date datetime DEFAULT NULL,
            end_date datetime DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY course_id (course_id)
        ) $charset_collate;";
        dbDelta($sql);
        
        $table_questions = $wpdb->prefix . 'oes_quiz_questions';
        $sql = "CREATE TABLE IF NOT EXISTS $table_questions (
            id bigint(20) NOT NULL AUTO_INCREMENT,
                quiz_id bigint(20) NOT NULL,
                question_type varchar(20) NOT NULL,
                question_text text NOT NULL,
                question_image varchar(500) DEFAULT NULL,
                options longtext,
                correct_answer text,
                points int(11) DEFAULT 1,
                explanation text,
                sort_order int(11) DEFAULT 0,
                PRIMARY KEY (id),
                KEY quiz_id (quiz_id)
            ) $charset_collate;";
        dbDelta($sql);
        
        $table_attempts = $wpdb->prefix . 'oes_quiz_attempts';
        $sql = "CREATE TABLE IF NOT EXISTS $table_attempts (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            quiz_id bigint(20) NOT NULL,
            user_id bigint(20) NOT NULL,
            score decimal(5,2) DEFAULT NULL,
            total_points int(11) DEFAULT 0,
            earned_points decimal(5,2) DEFAULT 0,
            passed tinyint(1) DEFAULT NULL,
            status varchar(20) DEFAULT 'in_progress',
            started_at datetime DEFAULT CURRENT_TIMESTAMP,
            completed_at datetime DEFAULT NULL,
            time_spent int(11) DEFAULT 0,
            answers longtext,
            PRIMARY KEY (id),
            KEY quiz_id (quiz_id),
            KEY user_id (user_id),
            KEY status (status)
        ) $charset_collate;";
        dbDelta($sql);
        
        $table_answers = $wpdb->prefix . 'oes_quiz_answers';
        $sql = "CREATE TABLE IF NOT EXISTS $table_answers (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            attempt_id bigint(20) NOT NULL,
            question_id bigint(20) NOT NULL,
            user_answer text,
            is_correct tinyint(1) DEFAULT NULL,
            points_earned decimal(5,2) DEFAULT 0,
            graded_by bigint(20) DEFAULT NULL,
            graded_at datetime DEFAULT NULL,
            feedback text,
            PRIMARY KEY (id),
            KEY attempt_id (attempt_id)
        ) $charset_collate;";
        dbDelta($sql);
    }
    
    public function render_submissions_page() {
        global $wpdb;
        
        $pending = $wpdb->get_results("
            SELECT a.*, q.title as quiz_title, q.pass_score, u.display_name, u.user_email, p.post_title as course_name
            FROM {$wpdb->prefix}oes_quiz_attempts a
            LEFT JOIN {$wpdb->prefix}oes_quizzes q ON a.quiz_id = q.id
            LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
            LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
            WHERE a.status = 'pending_review'
            ORDER BY a.completed_at DESC
        ");
        
        $recent = $wpdb->get_results("
            SELECT a.*, q.title as quiz_title, q.pass_score, u.display_name, u.user_email, p.post_title as course_name
            FROM {$wpdb->prefix}oes_quiz_attempts a
            LEFT JOIN {$wpdb->prefix}oes_quizzes q ON a.quiz_id = q.id
            LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
            LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
            WHERE a.status = 'completed'
            ORDER BY a.completed_at DESC
            LIMIT 50
        ");
        
        echo '<div class="wrap oes-admin-wrap">';
        $this->render_admin_styles();
        ?>
        <h1 style="margin-bottom:20px">Sınav Sonuçları</h1>
        
        <?php if (!empty($pending)): ?>
        <div class="oes-card" style="margin-bottom:20px;border-left:3px solid #f59e0b">
            <h3 style="margin:20px;font-size:14px;color:#92400e">Değerlendirme Bekleyen (<?php echo count($pending); ?>)</h3>
            <table class="oes-table">
                <thead><tr><th>Öğrenci</th><th>Sınav</th><th>Kurs</th><th>Tarih</th><th></th></tr></thead>
                <tbody>
                    <?php foreach ($pending as $a): ?>
                    <tr>
                        <td><?php echo esc_html($a->display_name); ?><br><small style="color:#64748b"><?php echo esc_html($a->user_email); ?></small></td>
                        <td><?php echo esc_html($a->quiz_title); ?></td>
                        <td style="color:#64748b;font-size:13px"><?php echo esc_html($a->course_name); ?></td>
                        <td style="font-size:13px"><?php echo date_i18n('d M Y H:i', strtotime($a->completed_at)); ?></td>
                        <td><a href="<?php echo admin_url('admin.php?page=oes-quizzes&view=results&quiz_id=' . $a->quiz_id . '&attempt_id=' . $a->id); ?>" class="button button-primary">Değerlendir</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>
        
        <div class="oes-card">
            <h3 style="margin:20px;font-size:14px">Son Tamamlanan Sınavlar</h3>
            <?php if (empty($recent)): ?>
            <p style="color:#64748b;margin:20px">Henüz tamamlanan sınav yok.</p>
            <?php else: ?>
            <table class="oes-table">
                <thead><tr><th>Öğrenci</th><th>Sınav</th><th>Puan</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
                <tbody>
                    <?php foreach ($recent as $a): ?>
                    <tr>
                        <td><?php echo esc_html($a->display_name); ?></td>
                        <td><?php echo esc_html($a->quiz_title); ?></td>
                        <td><strong><?php echo (int) $a->earned_points; ?>/<?php echo (int) $a->total_points; ?></strong> <span style="color:#94a3b8;font-size:12px;">doğru</span></td>
                        <td><span style="color:#64748b;">Tamamlandı</span></td>
                        <td style="font-size:13px;color:#64748b"><?php echo date_i18n('d M H:i', strtotime($a->completed_at)); ?></td>
                        <td><a href="<?php echo admin_url('admin.php?page=oes-quizzes&view=results&quiz_id=' . $a->quiz_id . '&attempt_id=' . $a->id); ?>" class="button">Detay</a></td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php endif; ?>
        </div>
        <?php
        echo '</div>';
    }
    
    public function add_endpoints() {
        add_rewrite_endpoint('sinavlarim', EP_ROOT | EP_PAGES);

        // Endpoint sürümü değiştiyse rewrite kurallarını bir kez yenile
        if (get_option('oes_quiz_endpoints_version') !== OES_VERSION) {
            flush_rewrite_rules(false);
            update_option('oes_quiz_endpoints_version', OES_VERSION);
        }
    }
    
    /**
     * WooCommerce "Hesabım" menüsüne ARTIK sekme eklenmiyor.
     *
     * Öğrencinin tek yüzeyi panel ("Çalışma Odam"); sınavlar orada
     * "Aksiyonlarım" bölümünde görevlerle birlikte listeleniyor. WC hesabım
     * sayfası zaten panele yönlendiriliyor (OES_Panel), buraya sekme eklemek
     * hiç açılmayacak bir menü üretirdi. Endpoint kaydı eski bağlantılar için duruyor.
     */
    public function add_menu_items($items) {
        return $items;
    }
    
    public function frontend_scripts() {
        if (!is_account_page()) return;
        
        wp_enqueue_script('oes-quizzes', OES_PLUGIN_URL . 'assets/js/quizzes.js', array('jquery'), OES_VERSION, true);
        wp_localize_script('oes-quizzes', 'oesQuizzes', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('oes_quizzes_nonce')
        ));
    }
    
    public function render_admin_page() {
        global $wpdb;
        
        $view = isset($_GET['view']) ? sanitize_text_field($_GET['view']) : 'list';
        $quiz_id = isset($_GET['quiz_id']) ? intval($_GET['quiz_id']) : 0;
        
        echo '<div class="wrap oes-admin-wrap">';
        $this->render_admin_styles();
        
        if ($view === 'edit' || $view === 'new') {
            $this->render_quiz_form($quiz_id);
        } elseif ($view === 'questions' && $quiz_id > 0) {
            $this->render_questions_page($quiz_id);
        } elseif ($view === 'results' && $quiz_id > 0) {
            $this->render_results_page($quiz_id);
        } else {
            $this->render_quizzes_list();
        }
        
        echo '</div>';
    }
    
    private function render_admin_styles() {
        if (class_exists('OES_Admin')) {
            OES_Admin::oes_admin_styles();
        }
    }
    
    private function render_quizzes_list() {
        global $wpdb;
        
        $quizzes = $wpdb->get_results("
            SELECT q.*, p.post_title as course_name,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = q.id) as question_count,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND status = 'completed') as attempt_count
            FROM {$wpdb->prefix}oes_quizzes q
            LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
            WHERE q.status != 'deleted'
            ORDER BY q.created_at DESC
        ");
        
        // Silinen sınavları ayrı çek
        $deleted_quizzes = $wpdb->get_results("
            SELECT q.*, p.post_title as course_name,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = q.id) as question_count,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND status = 'completed') as attempt_count
            FROM {$wpdb->prefix}oes_quizzes q
            LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
            WHERE q.status = 'deleted'
            ORDER BY q.created_at DESC
        ");
        
        ?>
        <div class="fabo-wrap">
        <div class="fabo-head">
            <div>
                <h1>Sınavlar</h1>
                <p>Tüm eğitimlerdeki sınavlar. Sınav soruları normalde <strong>eğitim editöründe</strong>
                   (müfredatın içinde) girilir; burası toplu görünüm ve sonuçlar içindir.</p>
            </div>
            <div class="fabo-head-actions">
                <a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=oes-quizzes&view=new')); ?>">Yeni sınav</a>
            </div>
        </div>

        
        <?php if (empty($quizzes)): ?>
            <div class="fabo-panel"><div class="fabo-empty">
                <span class="dashicons dashicons-clipboard"></span>
                <p>Henüz sınav yok. Sınavlar genelde eğitim editöründe müfredatın içinde oluşturulur.</p>
            </div></div>
        <?php else: ?>
            <div class="fabo-tablewrap">
                <table class="fabo-table">
                    <thead><tr>
                        <th>Sınav</th><th>Eğitim</th><th>Soru</th><th>Süre</th><th>Deneme</th><th>Durum</th><th></th>
                    </tr></thead>
                    <tbody>
                    <?php foreach ($quizzes as $quiz): ?>
                        <tr>
                            <td><strong><?php echo esc_html($quiz->title); ?></strong></td>
                            <td><?php echo esc_html($quiz->course_name ?: '—'); ?></td>
                            <td>
                                <a href="<?php echo esc_url(admin_url('admin.php?page=oes-quizzes&view=questions&quiz_id=' . $quiz->id)); ?>">
                                    <?php echo intval($quiz->question_count); ?> soru
                                </a>
                            </td>
                            <td style="white-space:nowrap;"><?php echo $quiz->time_limit > 0 ? intval($quiz->time_limit) . ' dk' : 'Sınırsız'; ?></td>
                            <td>
                                <a href="<?php echo esc_url(admin_url('admin.php?page=oes-quizzes&view=results&quiz_id=' . $quiz->id)); ?>">
                                    <span class="fabo-chip c-navy"><?php echo intval($quiz->attempt_count); ?></span>
                                </a>
                            </td>
                            <td>
                                <?php if ($quiz->status === 'active'): ?>
                                    <span class="fabo-chip c-green">Aktif</span>
                                <?php else: ?>
                                    <span class="fabo-chip c-amber">Taslak</span>
                                <?php endif; ?>
                            </td>
                            <td style="white-space:nowrap;">
                                <a class="button button-small" href="<?php echo esc_url(admin_url('admin.php?page=oes-quizzes&view=questions&quiz_id=' . $quiz->id)); ?>">Sorular</a>
                                <a class="button button-small" href="<?php echo esc_url(admin_url('admin.php?page=oes-quizzes&view=edit&quiz_id=' . $quiz->id)); ?>">Düzenle</a>
                                <button class="button button-small delete-quiz" data-id="<?php echo intval($quiz->id); ?>">Sil</button>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>

        <?php if (!empty($deleted_quizzes)): ?>
        <div class="fabo-panel" style="margin-top:18px;">
            <h2><span class="dashicons dashicons-trash"></span> Silinen sınavlar
                <span class="fabo-chip c-gray"><?php echo count($deleted_quizzes); ?></span></h2>
            <p class="desc">Sonuçları korunur. Geri alabilir ya da kalıcı silebilirsin.</p>
            <div class="fabo-tablewrap">
                <table class="fabo-table">
                    <thead><tr><th>Sınav</th><th>Eğitim</th><th>Sonuç</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($deleted_quizzes as $quiz): ?>
                    <tr>
                        <td><?php echo esc_html($quiz->title); ?></td>
                        <td><?php echo esc_html($quiz->course_name ?: '—'); ?></td>
                        <td><?php echo intval($quiz->attempt_count); ?> deneme</td>
                        <td style="white-space:nowrap;">
                            <button class="button button-small restore-quiz" data-id="<?php echo intval($quiz->id); ?>">Geri al</button>
                            <button class="button button-small permanent-delete-quiz" data-id="<?php echo intval($quiz->id); ?>">Kalıcı sil</button>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
        <?php endif; ?>
        </div><?php // /.fabo-wrap ?>

        <script>
        jQuery(function($) {
            $('.delete-quiz').on('click', function() {
                if (!confirm('Bu sınavı silmek istediğinize emin misiniz?\n\nNot: Sınav sonuçları korunacaktır.')) return;
                var $btn = $(this);
                $.post(ajaxurl, {
                    action: 'oes_delete_quiz',
                    nonce: '<?php echo wp_create_nonce("oes_quizzes_nonce"); ?>',
                    id: $btn.data('id')
                }, function(res) {
                    if (res.success) location.reload();
                    else alert(res.data || 'Hata');
                });
            });
            
            $('.restore-quiz').on('click', function() {
                var $btn = $(this);
                $.post(ajaxurl, {
                    action: 'oes_restore_quiz',
                    nonce: '<?php echo wp_create_nonce("oes_quizzes_nonce"); ?>',
                    id: $btn.data('id')
                }, function(res) {
                    if (res.success) location.reload();
                    else alert(res.data || 'Hata');
                });
            });
            
            $('.permanent-delete-quiz').on('click', function() {
                if (!confirm('Bu sınavı kalıcı olarak silmek istediğinize emin misiniz?\n\n⚠️ Tüm sorular ve sonuçlar da silinecektir!')) return;
                if (!confirm('Bu işlem geri alınamaz! Devam etmek istiyor musunuz?')) return;
                var $btn = $(this);
                $.post(ajaxurl, {
                    action: 'oes_permanent_delete_quiz',
                    nonce: '<?php echo wp_create_nonce("oes_quizzes_nonce"); ?>',
                    id: $btn.data('id')
                }, function(res) {
                    if (res.success) location.reload();
                    else alert(res.data || 'Hata');
                });
            });
        });
        </script>
        <?php
    }
    
    private function render_quiz_form($quiz_id = 0) {
        global $wpdb;
        
        $quiz = null;
        if ($quiz_id > 0) {
            $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $quiz_id));
        }
        
        // Hem _oes_is_course hem de tüm kursları göster (emin olmak için)
        $courses = $wpdb->get_results("
            SELECT DISTINCT p.ID, p.post_title FROM {$wpdb->posts} p
            LEFT JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id AND pm.meta_key = '_oes_is_course'
            WHERE p.post_type = 'product' AND p.post_status = 'publish'
            AND (pm.meta_value = 'yes' OR pm.meta_value IS NULL)
            ORDER BY p.post_title
        ");
        if (empty($courses)) {
            $courses = array();
        }
        
        ?>
        <div class="oes-header">
            <h1><?php echo $quiz ? '✏️ Sınavı Düzenle' : '📝 Yeni Sınav'; ?></h1>
            <a href="<?php echo admin_url('admin.php?page=oes-quizzes'); ?>" class="oes-btn oes-btn-secondary">← Geri</a>
        </div>
        
        <div class="oes-card" style="min-height:100px;height:auto;overflow:visible;">
            <div class="oes-card-body" style="padding:20px;display:block;">
                <form id="quizForm">
                    <input type="hidden" name="id" value="<?php echo $quiz ? $quiz->id : ''; ?>">
                    
                    <div class="oes-form-group">
                        <label>Sınav Başlığı *</label>
                        <input type="text" name="title" value="<?php echo $quiz ? esc_attr($quiz->title) : ''; ?>" required>
                    </div>
                    
                    <div class="oes-form-group">
                        <label>Açıklama</label>
                        <textarea name="description" rows="3"><?php echo $quiz ? esc_textarea($quiz->description) : ''; ?></textarea>
                    </div>
                    
                    <?php if ($quiz && $quiz->course_id): ?>
                    <div style="background:#eef5fb;border:1px solid #c3d0e0;border-radius:10px;padding:12px 15px;margin-bottom:16px;font-size:13px;color:#194977;">
                        <span class="dashicons dashicons-welcome-learn-more" style="vertical-align:middle;"></span>
                        Bu sınav <strong><?php echo esc_html(get_the_title($quiz->course_id)); ?></strong> eğitimine tanımlıdır ve o eğitimin <strong>tüm dönemlerinde</strong> geçerlidir. (Kurs/dönem müfredat editöründen belirlenir.)
                    </div>
                    <?php endif; ?>

                    <div class="oes-form-group">
                        <label>Süre (dakika)</label>
                        <input type="number" name="time_limit" value="<?php echo $quiz ? intval($quiz->time_limit) : '0'; ?>" min="0" style="max-width:170px;">
                        <span class="oes-form-help">0 = Sınırsız. Puanlama yok — öğrenci çözer, kaç soruda kaç doğru yaptığı gösterilir.</span>
                    </div>

                    <input type="hidden" name="course_id" value="<?php echo $quiz ? intval($quiz->course_id) : 0; ?>">
                    <input type="hidden" name="pass_score" value="0">

                    <div class="oes-form-group">
                        <label>Durum</label>
                        <select name="status">
                            <option value="active" <?php selected(!$quiz || $quiz->status === 'active'); ?>>Aktif</option>
                            <option value="draft" <?php selected($quiz && $quiz->status === 'draft'); ?>>Taslak</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="oes-btn oes-btn-primary"><?php echo $quiz ? '💾 Güncelle' : '✓ Oluştur'; ?></button>
                </form>
            </div>
        </div>
        
        <script>
        jQuery(function($) {
            $('#quizForm').on('submit', function(e) {
                e.preventDefault();
                var formData = $(this).serializeArray();
                var data = { action: 'oes_save_quiz', nonce: '<?php echo wp_create_nonce("oes_quizzes_nonce"); ?>' };
                
                // Checkbox'ları sıfırla (serializeArray göndermez)
                data.shuffle_questions = 0;
                data.shuffle_answers = 0;
                data.show_correct_answers = 0;
                
                $.each(formData, function(i, field) {
                    data[field.name] = field.value;
                });
                
                // Checkbox değerlerini kontrol et
                data.shuffle_questions   = $('[name="shuffle_questions"]').is(':checked') ? 1 : 0;
                data.shuffle_answers     = $('[name="shuffle_answers"]').is(':checked') ? 1 : 0;
                data.show_correct_answers = $('[name="show_correct_answers"]').is(':checked') ? 1 : 0;
                
                $.post(ajaxurl, data, function(res) {
                    if (res.success) {
                        window.location.href = '<?php echo admin_url("admin.php?page=oes-quizzes&view=questions&quiz_id="); ?>' + res.data.id;
                    } else {
                        alert(res.data || 'Hata oluştu');
                    }
                }).fail(function() {
                    alert('Sunucu bağlantı hatası');
                });
            });
        });
        </script>
        <?php
    }
    
    private function render_questions_page($quiz_id) {
        global $wpdb;
        
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT q.*, p.post_title as course_name FROM {$wpdb->prefix}oes_quizzes q LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID WHERE q.id = %d", $quiz_id));
        if (!$quiz) { echo '<p>Sınav bulunamadı.</p>'; return; }
        
        $questions = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY sort_order ASC", $quiz_id));
        $total_points = array_sum(array_column($questions, 'points'));
        
        ?>
        <div class="oes-header">
            <div>
                <h1>📋 <?php echo esc_html($quiz->title); ?></h1>
                <p style="margin:4px 0 0;color:#64748b"><?php echo esc_html($quiz->course_name); ?></p>
            </div>
            <div style="display:flex;gap:12px">
                <a href="<?php echo admin_url('admin.php?page=oes-quizzes'); ?>" class="oes-btn oes-btn-secondary">← Geri</a>
                <button class="oes-btn oes-btn-primary" id="addQuestion">+ Soru Ekle</button>
            </div>
        </div>
        
        <style>
            .oes-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
            .oes-stats .oes-stat{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 22px;text-align:center}
            .oes-stats .oes-stat-value{font-size:30px;font-weight:800;color:#0f172a;line-height:1}
            .oes-stats .oes-stat-label{font-size:12px;color:#64748b;margin-top:6px;font-weight:500}
            @media(max-width:1024px){.oes-stats{grid-template-columns:repeat(2,1fr)}}

            /* Soru kartları — modern */
            #questionsList{display:flex;flex-direction:column;gap:12px}
            .oes-question-item{background:#fff;border:1px solid #e8edf3;border-radius:14px;overflow:hidden;transition:box-shadow .2s,border-color .2s}
            .oes-question-item:hover{box-shadow:0 6px 20px rgba(15,23,42,.06);border-color:#d4dde8}
            .oes-question-header{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer}
            .oes-question-num{width:30px;height:30px;flex-shrink:0;background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:9px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px}
            .oes-question-title{flex:1;font-size:14.5px;font-weight:600;color:#1e293b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .oes-question-type{font-size:11px;font-weight:600;color:#475569;background:#eef2f7;padding:4px 10px;border-radius:20px;white-space:nowrap}
            .oes-question-points{font-size:12px;font-weight:700;color:#2563eb;background:#eff6ff;padding:4px 10px;border-radius:20px;white-space:nowrap}
            .oes-question-actions{display:flex;gap:6px;flex-shrink:0}
            .oes-question-actions button{width:32px;height:32px;border:1px solid #e2e8f0;background:#fff;border-radius:8px;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;transition:all .15s;padding:0;color:#475569}
            .oes-question-actions button:hover{background:#f1f5f9;border-color:#cbd5e1}
            .oes-question-actions .delete-question:hover{background:#fef2f2;border-color:#fca5a5}
            .oes-question-actions .toggle-question{transition:transform .2s}
            .oes-question-item.open .oes-question-actions .toggle-question{transform:rotate(180deg)}
            .oes-question-body{display:none;padding:0 16px 16px;border-top:1px solid #f1f5f9}
            .oes-question-item.open .oes-question-body{display:block}
            .oes-question-body>p{margin:14px 0 0;font-size:14px;color:#334155;line-height:1.6}
            .oes-option-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid #e8edf3;border-radius:10px;margin-bottom:7px;font-size:13.5px;color:#334155;background:#fbfcfe}
            .oes-option-item.correct{border-color:#86efac;background:#f0fdf4}
            .oes-option-letter{width:24px;height:24px;flex-shrink:0;background:#fff;border:1px solid #d4dde8;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#475569}
            .oes-option-item.correct .oes-option-letter{background:#22c55e;border-color:#22c55e;color:#fff}
        </style>
        <div class="oes-stats">
            <div class="oes-stat"><div class="oes-stat-value"><?php echo count($questions); ?></div><div class="oes-stat-label">Soru</div></div>
            <div class="oes-stat"><div class="oes-stat-value"><?php echo $quiz->time_limit ?: '∞'; ?></div><div class="oes-stat-label">Dakika</div></div>
        </div>
        
        <div class="oes-card">
            <div class="oes-card-body">
                <?php if (empty($questions)): ?>
                    <div class="oes-empty">
                        <div class="oes-empty-icon">❓</div>
                        <p>Henüz soru eklenmemiş.</p>
                    </div>
                <?php else: ?>
                    <div id="questionsList">
                        <?php foreach ($questions as $idx => $q): 
                            $options = !empty($q->options) ? (json_decode($q->options, true) ?: array()) : array();
                            $correct = !empty($q->correct_answer) ? json_decode($q->correct_answer, true) : null;
                            if (!is_array($correct)) $correct = !empty($q->correct_answer) ? array($q->correct_answer) : array();
                        ?>
                            <div class="oes-question-item" data-id="<?php echo $q->id; ?>">
                                <div class="oes-question-header">
                                    <span class="oes-question-num"><?php echo $idx + 1; ?></span>
                                    <span class="oes-question-title"><?php echo esc_html(wp_trim_words($q->question_text, 12)); ?></span>
                                    <span class="oes-question-type"><?php echo $q->question_type === 'multiple_choice' ? 'Çoktan Seçmeli' : ($q->question_type === 'true_false' ? 'D/Y' : 'Açık Uçlu'); ?></span>
                                    <span class="oes-question-points"><?php echo $q->points; ?>p</span>
                                    <div class="oes-question-actions">
                                        <button class="toggle-question">▼</button>
                                        <button class="edit-question">✏️</button>
                                        <button class="delete-question">🗑️</button>
                                    </div>
                                </div>
                                <div class="oes-question-body">
                                    <p><?php echo nl2br(esc_html($q->question_text)); ?></p>
                                    <?php if ($q->question_image): ?><img src="<?php echo esc_url($q->question_image); ?>" style="max-width:300px;margin:10px 0;border-radius:8px"><?php endif; ?>
                                    <?php if ($q->question_type !== 'open_ended' && !empty($options)): ?>
                                        <div style="margin-top:12px">
                                            <?php foreach ($options as $oi => $opt): 
                                                $letter = chr(65 + $oi);
                                                $is_correct = in_array($letter, $correct) || in_array($oi, $correct);
                                            ?>
                                                <div class="oes-option-item <?php echo $is_correct ? 'correct' : ''; ?>">
                                                    <span class="oes-option-letter"><?php echo $letter; ?></span>
                                                    <span><?php echo esc_html($opt); ?></span>
                                                    <?php if ($is_correct): ?><span style="margin-left:auto;color:#10b981">✓</span><?php endif; ?>
                                                </div>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endif; ?>
                                    <?php if ($q->explanation): ?>
                                        <div style="margin-top:12px;padding:10px;background:#fef3c7;border-radius:6px;font-size:13px">💡 <?php echo esc_html($q->explanation); ?></div>
                                    <?php endif; ?>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- Modal -->
        <div class="oes-modal" id="questionModal">
            <div class="oes-modal-content">
                <div class="oes-modal-header">
                    <h3 id="modalTitle">Soru Ekle</h3>
                    <button class="oes-modal-close">&times;</button>
                </div>
                <div class="oes-modal-body">
                    <form id="questionForm">
                        <input type="hidden" name="quiz_id" value="<?php echo $quiz_id; ?>">
                        <input type="hidden" name="question_id" value="">
                        
                        <div class="oes-form-group">
                            <label>Soru Tipi</label>
                            <select name="question_type" id="questionType">
                                <option value="multiple_choice">Çoktan Seçmeli</option>
                                <option value="true_false">Doğru/Yanlış</option>
                                <option value="open_ended">Açık Uçlu</option>
                            </select>
                        </div>
                        
                        <div class="oes-form-group">
                            <label>Soru *</label>
                            <textarea name="question_text" rows="3" required></textarea>
                        </div>
                        
                        <div class="oes-form-group">
                            <label>Görsel URL</label>
                            <input type="text" name="question_image">
                        </div>
                        
                        <div id="optionsGroup">
                            <div class="oes-form-group">
                                <label>Şıklar</label>
                                <div id="optionsList"></div>
                                <button type="button" class="oes-btn oes-btn-secondary" id="addOption" style="margin-top:8px">+ Şık Ekle</button>
                            </div>
                        </div>
                        
                        <div id="trueFalseGroup" style="display:none">
                            <div class="oes-form-group">
                                <label>Doğru Cevap</label>
                                <select name="true_false_answer">
                                    <option value="true">Doğru</option>
                                    <option value="false">Yanlış</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="oes-form-row">
                            <div class="oes-form-group">
                                <label>Puan</label>
                                <input type="number" name="points" value="1" min="1">
                            </div>
                        </div>
                        
                        <div class="oes-form-group">
                            <label>Açıklama</label>
                            <textarea name="explanation" rows="2"></textarea>
                        </div>
                    </form>
                </div>
                <div class="oes-modal-footer">
                    <button class="oes-btn oes-btn-secondary" id="cancelQuestion">İptal</button>
                    <button class="oes-btn oes-btn-primary" id="saveQuestion">Kaydet</button>
                </div>
            </div>
        </div>
        
        <script>
        jQuery(function($) {
            var nonce = '<?php echo wp_create_nonce("oes_quizzes_nonce"); ?>';
            var quizId = <?php echo $quiz_id; ?>;
            
            // Sortable (jQuery UI varsa)
            try {
                if ($.fn.sortable) {
                    $('#questionsList').sortable({
                        handle: '.oes-question-header',
                        update: function() {
                            var order = [];
                            $('.oes-question-item').each(function(i) {
                                order.push($(this).data('id'));
                                $(this).find('.oes-question-num').text(i + 1);
                            });
                            $.post(ajaxurl, { action: 'oes_reorder_questions', nonce: nonce, order: order });
                        }
                    });
                }
            } catch(e) { console.log('Sortable not available'); }
            
            // Toggle
            $(document).on('click', '.toggle-question', function() {
                $(this).closest('.oes-question-item').toggleClass('open');
            });
            
            // Modal
            function openModal() { $('#questionModal').addClass('open'); }
            function closeModal() { 
                $('#questionModal').removeClass('open');
                $('#questionForm')[0].reset();
                $('input[name="question_id"]').val('');
                resetOptions();
            }
            
            $('#addQuestion').on('click', function() { openModal(); $('#questionType').trigger('change'); });
            $('.oes-modal-close, #cancelQuestion').on('click', closeModal);
            
            // Question type change
            $('#questionType').on('change', function() {
                var t = $(this).val();
                if (t === 'multiple_choice') { $('#optionsGroup').show(); $('#trueFalseGroup').hide(); }
                else if (t === 'true_false') { $('#optionsGroup').hide(); $('#trueFalseGroup').show(); }
                else { $('#optionsGroup').hide(); $('#trueFalseGroup').hide(); }
            });
            
            // Options
            function resetOptions() {
                $('#optionsList').html('');
                for (var i = 0; i < 4; i++) addOptionRow(i);
            }
            resetOptions();
            
            function addOptionRow(i, val, isCorrect) {
                var letter = String.fromCharCode(65 + i);
                var html = '<div class="option-row" style="display:flex;gap:8px;margin-bottom:8px">' +
                    '<span style="width:30px;line-height:38px;text-align:center;font-weight:600">' + letter + '</span>' +
                    '<input type="text" name="options[]" style="flex:1" value="' + (val || '') + '">' +
                    '<label style="display:flex;align-items:center;gap:4px"><input type="checkbox" name="correct[]" value="' + i + '"' + (isCorrect ? ' checked' : '') + '> Doğru</label>' +
                    (i >= 4 ? '<button type="button" class="remove-option" style="background:none;border:none;color:#dc2626;cursor:pointer">×</button>' : '') +
                    '</div>';
                $('#optionsList').append(html);
            }
            
            $('#addOption').on('click', function() {
                addOptionRow($('.option-row').length);
            });
            
            $(document).on('click', '.remove-option', function() {
                $(this).closest('.option-row').remove();
            });
            
            // Save
            $('#saveQuestion').on('click', function() {
                var type = $('#questionType').val();
                var data = {
                    action: 'oes_save_question',
                    nonce: nonce,
                    quiz_id: quizId,
                    question_id: $('input[name="question_id"]').val(),
                    question_type: type,
                    question_text: $('textarea[name="question_text"]').val(),
                    question_image: $('input[name="question_image"]').val(),
                    points: $('input[name="points"]').val(),
                    explanation: $('textarea[name="explanation"]').val()
                };
                
                if (type === 'multiple_choice') {
                    data.options = [];
                    data.correct = [];
                    $('.option-row').each(function(i) {
                        var v = $(this).find('input[type="text"]').val();
                        if (v) {
                            data.options.push(v);
                            if ($(this).find('input[type="checkbox"]').is(':checked')) data.correct.push(i);
                        }
                    });
                } else if (type === 'true_false') {
                    data.correct = $('select[name="true_false_answer"]').val();
                }
                
                var $btn = $('#saveQuestion');
                var btnText = $btn.text();
                $btn.prop('disabled', true).html('<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-radius:50%;border-top-color:#fff;animation:spin .8s linear infinite;margin-right:6px;vertical-align:middle"></span>Kaydediliyor...');
                
                $.post(ajaxurl, data, function(res) {
                    if (res.success) location.reload();
                    else {
                        alert(res.data || 'Hata');
                        $btn.prop('disabled', false).text(btnText);
                    }
                }).fail(function() {
                    alert('Bağlantı hatası');
                    $btn.prop('disabled', false).text(btnText);
                });
            });
            
            // Edit
            $(document).on('click', '.edit-question', function() {
                var qid = $(this).closest('.oes-question-item').data('id');
                $.post(ajaxurl, { action: 'oes_get_question', nonce: nonce, id: qid }, function(res) {
                    if (res.success) {
                        var q = res.data;
                        $('input[name="question_id"]').val(q.id);
                        $('#questionType').val(q.question_type).trigger('change');
                        $('textarea[name="question_text"]').val(q.question_text);
                        $('input[name="question_image"]').val(q.question_image || '');
                        $('input[name="points"]').val(q.points);
                        $('textarea[name="explanation"]').val(q.explanation || '');
                        
                        if (q.question_type === 'multiple_choice' && q.options) {
                            var opts = JSON.parse(q.options);
                            var correct = JSON.parse(q.correct_answer) || [];
                            $('#optionsList').empty();
                            opts.forEach(function(o, i) {
                                addOptionRow(i, o, correct.includes(i));
                            });
                        } else if (q.question_type === 'true_false') {
                            $('select[name="true_false_answer"]').val(q.correct_answer);
                        }
                        
                        $('#modalTitle').text('Soru Düzenle');
                        openModal();
                    }
                });
            });
            
            // Delete
            $(document).on('click', '.delete-question', function() {
                if (!confirm('Silmek istediğinize emin misiniz?')) return;
                var $item = $(this).closest('.oes-question-item');
                $.post(ajaxurl, { action: 'oes_delete_question', nonce: nonce, id: $item.data('id') }, function(res) {
                    if (res.success) $item.fadeOut();
                });
            });
        });
        </script>
        <?php
    }
    
    private function render_results_page($quiz_id) {
        global $wpdb;
        
        // Detay görüntüleme
        if (isset($_GET['attempt_id'])) {
            $this->render_attempt_detail(intval($_GET['attempt_id']), $quiz_id);
            return;
        }
        
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $quiz_id));
        
        $attempts = $wpdb->get_results($wpdb->prepare("
            SELECT a.*, u.display_name, u.user_email
            FROM {$wpdb->prefix}oes_quiz_attempts a
            LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
            WHERE a.quiz_id = %d ORDER BY a.started_at DESC
        ", $quiz_id));
        
        // İstatistikler
        $total_attempts = count($attempts);
        $completed = array_filter($attempts, function($a) { return $a->status === 'completed'; });
        $pending = array_filter($attempts, function($a) { return $a->status === 'pending_review'; });
        $passed = array_filter($completed, function($a) { return $a->passed; });
        $avg_score = $completed ? array_sum(array_column($completed, 'score')) / count($completed) : 0;
        
        ?>
        <div class="oes-header">
            <h1>📊 <?php echo esc_html($quiz->title); ?> - Sonuçlar</h1>
            <a href="<?php echo admin_url('admin.php?page=oes-quizzes'); ?>" class="oes-btn oes-btn-secondary">← Geri</a>
        </div>
        
        <style>
            .oes-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
            .oes-stats .oes-stat{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px 22px;text-align:center}
            .oes-stats .oes-stat-value{font-size:30px;font-weight:800;color:#0f172a;line-height:1}
            .oes-stats .oes-stat-label{font-size:12px;color:#64748b;margin-top:6px;font-weight:500}
            @media(max-width:1024px){.oes-stats{grid-template-columns:repeat(2,1fr)}}
        </style>
        <div class="oes-stats">
            <div class="oes-stat"><div class="oes-stat-value"><?php echo $total_attempts; ?></div><div class="oes-stat-label">Toplam Deneme</div></div>
            <div class="oes-stat"><div class="oes-stat-value"><?php echo count($pending); ?></div><div class="oes-stat-label">Değerlendirme Bekliyor</div></div>
            <div class="oes-stat"><div class="oes-stat-value"><?php echo count($completed); ?></div><div class="oes-stat-label">Tamamlanan</div></div>
        </div>
        
        <div class="oes-card">
            <?php if (empty($attempts)): ?>
                <div class="oes-empty"><div class="oes-empty-icon">📊</div><p>Henüz deneme yok.</p></div>
            <?php else: ?>
                <table class="oes-table">
                    <thead><tr><th>Öğrenci</th><th>Puan</th><th>Durum</th><th>Süre</th><th>Tarih</th><th>İşlem</th></tr></thead>
                    <tbody>
                        <?php foreach ($attempts as $a): ?>
                            <tr>
                                <td><strong><?php echo esc_html($a->display_name); ?></strong><br><small><?php echo esc_html($a->user_email); ?></small></td>
                                <td>
                                    <?php if ($a->status === 'pending_review'): ?>
                                        <span style="color:#64748b">-</span>
                                    <?php else: ?>
                                        <strong style="font-size:18px"><?php echo (int) $a->earned_points; ?>/<?php echo (int) $a->total_points; ?></strong> <span style="color:#94a3b8;font-size:12px;">doğru</span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <?php if ($a->status === 'completed'): ?>
                                        <span class="oes-badge oes-badge-success">✓ Tamamlandı</span>
                                    <?php elseif ($a->status === 'pending_review'): ?>
                                        <span class="oes-badge oes-badge-warning">⏳ Değerlendirme Bekliyor</span>
                                    <?php else: ?>
                                        <span class="oes-badge oes-badge-info">Devam Ediyor</span>
                                    <?php endif; ?>
                                </td>
                                <td><?php echo floor($a->time_spent / 60); ?>dk</td>
                                <td><?php echo date_i18n('d M Y H:i', strtotime($a->started_at)); ?></td>
                                <td>
                                    <a href="<?php echo admin_url('admin.php?page=oes-quizzes&view=results&quiz_id=' . $quiz_id . '&attempt_id=' . $a->id); ?>" class="oes-btn oes-btn-secondary" style="padding:6px 12px;font-size:12px">
                                        <?php echo $a->status === 'pending_review' ? '✏️ Değerlendir' : '👁 Detay'; ?>
                                    </a>
                                    <button class="oes-btn oes-btn-danger delete-attempt" data-id="<?php echo $a->id; ?>" style="padding:6px 12px;font-size:12px">🗑️</button>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>
        
        <script>
        jQuery(function($) {
            $('.delete-attempt').on('click', function() {
                if (!confirm('Bu denemeyi silmek istediğinize emin misiniz?')) return;
                if (!confirm('Bu işlem geri alınamaz! Devam?')) return;
                var $btn = $(this);
                $.post(ajaxurl, {
                    action: 'oes_admin_delete_attempt',
                    nonce: '<?php echo wp_create_nonce("oes_quizzes_nonce"); ?>',
                    attempt_id: $btn.data('id')
                }, function(res) {
                    if (res.success) $btn.closest('tr').fadeOut();
                    else alert(res.data || 'Hata');
                });
            });
        });
        </script>
        <?php
    }
    
    private function render_attempt_detail($attempt_id, $quiz_id) {
        global $wpdb;
        
        $attempt = $wpdb->get_row($wpdb->prepare("
            SELECT a.*, u.display_name, u.user_email
            FROM {$wpdb->prefix}oes_quiz_attempts a
            LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
            WHERE a.id = %d
        ", $attempt_id));
        
        if (!$attempt) {
            echo '<p>Deneme bulunamadı.</p>';
            return;
        }
        
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $attempt->quiz_id));
        if (!$quiz) {
            echo '<p>Sınav bulunamadı.</p>';
            return;
        }
        
        $questions = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY sort_order ASC", $attempt->quiz_id));
        $answers = !empty($attempt->answers) ? (json_decode($attempt->answers, true) ?: array()) : array();
        
        // Kaydedilmiş puanlar - question_id ile indeksle
        $graded_answers = array();
        $table_answers = $wpdb->prefix . 'oes_quiz_answers';
        if ($wpdb->get_var("SHOW TABLES LIKE '$table_answers'") === $table_answers) {
            $graded_answers_raw = $wpdb->get_results($wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}oes_quiz_answers WHERE attempt_id = %d",
                $attempt_id
            ));
            foreach ($graded_answers_raw as $ga) {
                $graded_answers[$ga->question_id] = $ga;
            }
        }
        
        ?>
        <div class="fabo-wrap" style="margin:0;">
        <div class="fabo-head">
            <div>
                <h1>Sınav detayı</h1>
                <p><strong><?php echo esc_html($attempt->display_name); ?></strong> — <?php echo esc_html($quiz->title); ?>
                   · <?php echo $attempt->status === 'pending_review' ? 'Değerlendirme bekliyor' : 'Tamamlandı'; ?></p>
            </div>
            <div class="fabo-head-actions">
                <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=oes-quizzes&view=results&quiz_id=' . $quiz_id)); ?>">← Sonuçlara dön</a>
            </div>
        </div>
        </div>
        
        <?php if ($attempt->status === 'pending_review'): ?>
        <div style="background:var(--oes-yellow-bg,#fef3c7);border:1px solid #fde68a;padding:12px 18px;border-radius:var(--oes-r2,12px);margin-bottom:20px;display:flex;align-items:center;gap:10px;color:#92400e;font-size:13px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Bu sınav açık uçlu soru içeriyor ve değerlendirme bekliyor.
        </div>
        <?php endif; ?>
        
        <div class="oes-stats-row" style="margin-bottom:24px">
            <div class="oes-stat-box">
                <div class="oes-stat-icon" style="background:linear-gradient(135deg,#dbeafe,#bfdbfe)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div><div class="oes-stat-value"><?php echo $attempt->status === 'pending_review' ? '—' : number_format($attempt->score, 1) . '%'; ?></div><div class="oes-stat-label">Puan</div></div>
            </div>
            <div class="oes-stat-box">
                <div class="oes-stat-icon" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div><div class="oes-stat-value"><?php echo $attempt->earned_points; ?><span style="font-size:16px;font-weight:500;color:var(--oes-muted,#64748b)">/<?php echo $attempt->total_points; ?></span></div><div class="oes-stat-label">Alınan / Toplam</div></div>
            </div>
            <div class="oes-stat-box">
                <div class="oes-stat-icon" style="background:linear-gradient(135deg,#fff7ed,#fed7aa)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ea580c" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div><div class="oes-stat-value"><?php echo floor($attempt->time_spent / 60); ?><span style="font-size:16px;font-weight:500">dk</span></div><div class="oes-stat-label">Süre</div></div>
            </div>
            <div class="oes-stat-box">
                <div class="oes-stat-icon" style="background:<?php echo $attempt->status === 'pending_review' ? 'linear-gradient(135deg,#fef3c7,#fde68a)' : ($attempt->passed ? 'linear-gradient(135deg,#d1fae5,#a7f3d0)' : 'linear-gradient(135deg,#fee2e2,#fecaca)'); ?>">
                    <?php if ($attempt->status === 'pending_review'): ?>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <?php elseif ($attempt->passed): ?>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <?php else: ?>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    <?php endif; ?>
                </div>
                <div><div class="oes-stat-value" style="font-size:18px"><?php echo $attempt->status === 'pending_review' ? 'Bekliyor' : (intval($attempt->earned_points) . '/' . intval($attempt->total_points)); ?></div><div class="oes-stat-label">Doğru</div></div>
            </div>
        </div>
        
        <form id="gradeForm">
            <input type="hidden" name="attempt_id" value="<?php echo $attempt_id; ?>">
            <input type="hidden" name="quiz_id" value="<?php echo $quiz_id; ?>">
            
            <?php foreach ($questions as $idx => $q):
                $user_answer = $answers[$q->id] ?? '';
                $options = !empty($q->options) ? (json_decode($q->options, true) ?: array()) : array();
                $correct = !empty($q->correct_answer) ? json_decode($q->correct_answer, true) : null;
                if (!is_array($correct)) $correct = array($q->correct_answer);
                
                // Otomatik değerlendirme
                $is_correct = null;
                if ($q->question_type !== 'open_ended') {
                    if ($q->question_type === 'multiple_choice') {
                        $letter_idx = ord(strtoupper($user_answer)) - 65;
                        $is_correct = in_array($letter_idx, $correct);
                    } else {
                        $is_correct = $user_answer === $q->correct_answer;
                    }
                }
                
                // Kaydedilmiş puan
                $graded = isset($graded_answers[$q->id]) ? $graded_answers[$q->id] : null;
            ?>
            <div class="oes-card" style="margin-bottom:16px">
                <div style="padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center">
                    <span><strong>Soru <?php echo $idx + 1; ?></strong> - <?php echo $q->question_type === 'multiple_choice' ? 'Çoktan Seçmeli' : ($q->question_type === 'true_false' ? 'Doğru/Yanlış' : 'Açık Uçlu'); ?></span>
                    <span style="color:#10b981;font-weight:600"><?php echo $q->points; ?> puan</span>
                </div>
                <div style="padding:16px">
                    <p style="margin:0 0 12px;font-weight:500"><?php echo nl2br(esc_html($q->question_text)); ?></p>
                    
                    <?php if ($q->question_type === 'open_ended'): ?>
                        <div style="background:#f1f5f9;padding:12px;border-radius:6px;margin-bottom:12px">
                            <small style="color:#64748b">Öğrenci Cevabı:</small>
                            <p style="margin:6px 0 0"><?php echo nl2br(esc_html($user_answer ?: '(Boş bırakıldı)')); ?></p>
                        </div>
                        
                        <div style="display:flex;gap:12px;align-items:center">
                            <label style="font-weight:500">Puan:</label>
                            <input type="number" name="grade_<?php echo $q->id; ?>" min="0" max="<?php echo $q->points; ?>" value="<?php echo $graded ? $graded->points_earned : ''; ?>" style="width:80px;padding:8px;border:1px solid #d1d5db;border-radius:6px" placeholder="0-<?php echo $q->points; ?>">
                            <span style="color:#64748b">/ <?php echo $q->points; ?></span>
                            <input type="text" name="feedback_<?php echo $q->id; ?>" placeholder="Geri bildirim (opsiyonel)" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px" value="<?php echo $graded ? esc_attr($graded->feedback) : ''; ?>">
                        </div>
                    <?php else: ?>
                        <div style="display:flex;gap:16px;flex-wrap:wrap">
                            <?php if ($q->question_type === 'multiple_choice'): ?>
                                <?php foreach ($options as $oi => $opt):
                                    $l = chr(65 + $oi);
                                    $is_user = $user_answer === $l;
                                    $is_answer = in_array($oi, $correct);
                                ?>
                                <div style="padding:8px 12px;border-radius:6px;border:1px solid <?php echo $is_answer ? '#10b981' : ($is_user && !$is_answer ? '#ef4444' : '#e5e7eb'); ?>;background:<?php echo $is_answer ? '#f0fdf4' : ($is_user && !$is_answer ? '#fef2f2' : '#fff'); ?>">
                                    <strong><?php echo $l; ?>)</strong> <?php echo esc_html($opt); ?>
                                    <?php if ($is_user): ?><span style="margin-left:8px"><?php echo $is_answer ? '✓' : '✗'; ?></span><?php endif; ?>
                                </div>
                                <?php endforeach; ?>
                            <?php else: ?>
                                <div style="padding:8px 12px;border-radius:6px;border:1px solid <?php echo $is_correct ? '#10b981' : '#ef4444'; ?>;background:<?php echo $is_correct ? '#f0fdf4' : '#fef2f2'; ?>">
                                    Cevap: <strong><?php echo $user_answer === 'true' ? 'Doğru' : 'Yanlış'; ?></strong>
                                    <?php echo $is_correct ? '✓' : '✗'; ?>
                                </div>
                                <div style="color:#64748b">Doğru cevap: <?php echo $q->correct_answer === 'true' ? 'Doğru' : 'Yanlış'; ?></div>
                            <?php endif; ?>
                        </div>
                        
                        <div style="margin-top:12px;color:<?php echo $is_correct ? '#10b981' : '#ef4444'; ?>;font-weight:600">
                            <?php echo $is_correct ? '✓ Doğru (+' . $q->points . ' puan)' : '✗ Yanlış (0 puan)'; ?>
                        </div>
                    <?php endif; ?>
                    
                    <?php if ($q->explanation): ?>
                        <div style="margin-top:12px;padding:10px;background:#fef3c7;border-radius:6px;font-size:13px">
                            💡 <strong>Açıklama:</strong> <?php echo esc_html($q->explanation); ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
            <?php endforeach; ?>
            
            <?php if ($attempt->status === 'pending_review'): ?>
            <div style="text-align:right;margin-top:20px">
                <button type="submit" class="oes-btn oes-btn-primary">✓ Değerlendirmeyi Kaydet ve Sonuçlandır</button>
            </div>
            <?php endif; ?>
        </form>
        
        <script>
        jQuery(function($) {
            $('#gradeForm').on('submit', function(e) {
                e.preventDefault();
                
                var grades = {};
                $('input[name^="grade_"]').each(function() {
                    var qid = $(this).attr('name').replace('grade_', '');
                    grades[qid] = {
                        points: $(this).val(),
                        feedback: $('input[name="feedback_' + qid + '"]').val()
                    };
                });
                
                $.post(ajaxurl, {
                    action: 'oes_grade_open_ended',
                    nonce: '<?php echo wp_create_nonce("oes_quizzes_nonce"); ?>',
                    attempt_id: $('input[name="attempt_id"]').val(),
                    quiz_id: $('input[name="quiz_id"]').val(),
                    grades: JSON.stringify(grades)
                }, function(res) {
                    if (res.success) {
                        alert('Değerlendirme kaydedildi! Yeni puan: ' + res.data.score.toFixed(1) + '%');
                        location.reload();
                    } else {
                        alert(res.data || 'Hata');
                    }
                });
            });
        });
        </script>
        <?php
    }
    
    // AJAX Handlers
    public function ajax_get_periods() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('edit_posts')) wp_send_json_error('Yetki yok');

        global $wpdb;
        $course_id = intval($_POST['course_id']);

        $periods = $wpdb->get_results($wpdb->prepare(
            "SELECT id, name FROM {$wpdb->prefix}oes_periods WHERE course_id = %d ORDER BY start_date DESC",
            $course_id
        ));
        
        wp_send_json_success($periods);
    }
    
    public function ajax_grade_open_ended() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        
        $attempt_id = intval($_POST['attempt_id']);
        $quiz_id = intval($_POST['quiz_id']);
        $grades = json_decode(stripslashes($_POST['grades']), true) ?: array();
        
        $attempt = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_attempts WHERE id = %d", $attempt_id));
        if (!$attempt) wp_send_json_error('Deneme bulunamadı');
        
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $quiz_id));
        $questions = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d", $quiz_id));
        $answers = !empty($attempt->answers) ? (json_decode($attempt->answers, true) ?: array()) : array();
        
        $total_points = 0;
        $earned_points = 0;
        
        foreach ($questions as $q) {
            $total_points += $q->points;
            $user_answer = $answers[$q->id] ?? '';
            
            if ($q->question_type === 'open_ended') {
                // Açık uçlu - admin puanı
                $grade = $grades[$q->id] ?? array();
                $points = min(floatval($grade['points'] ?? 0), $q->points);
                $feedback = sanitize_text_field($grade['feedback'] ?? '');
                
                $earned_points += $points;
                
                // Kaydet
                $existing = $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}oes_quiz_answers WHERE attempt_id = %d AND question_id = %d",
                    $attempt_id, $q->id
                ));
                
                if ($existing) {
                    $wpdb->update($wpdb->prefix . 'oes_quiz_answers', array(
                        'points_earned' => $points,
                        'feedback' => $feedback,
                        'graded_by' => get_current_user_id(),
                        'graded_at' => current_time('mysql')
                    ), array('id' => $existing));
                } else {
                    $wpdb->insert($wpdb->prefix . 'oes_quiz_answers', array(
                        'attempt_id' => $attempt_id,
                        'question_id' => $q->id,
                        'user_answer' => $user_answer,
                        'points_earned' => $points,
                        'feedback' => $feedback,
                        'graded_by' => get_current_user_id(),
                        'graded_at' => current_time('mysql')
                    ));
                }
            } else {
                // Otomatik puanlama
                $correct = !empty($q->correct_answer) ? json_decode($q->correct_answer, true) : null;
                if (!is_array($correct)) $correct = array($q->correct_answer);
                
                $is_correct = false;
                if ($q->question_type === 'multiple_choice') {
                    $letter_idx = ord(strtoupper($user_answer)) - 65;
                    $is_correct = in_array($letter_idx, $correct);
                } else {
                    $is_correct = $user_answer === $q->correct_answer;
                }
                
                if ($is_correct) $earned_points += $q->points;
            }
        }
        
        $score = $total_points > 0 ? ($earned_points / $total_points) * 100 : 0;
        $passed = $score >= $quiz->pass_score;
        
        $wpdb->update($wpdb->prefix . 'oes_quiz_attempts', array(
            'score' => $score,
            'earned_points' => $earned_points,
            'passed' => $passed ? 1 : 0,
            'status' => 'completed'
        ), array('id' => $attempt_id));
        
        wp_send_json_success(array('score' => $score, 'passed' => $passed));
    }
    
    public function ajax_save_quiz() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        
        $data = array(
            'title' => sanitize_text_field($_POST['title']),
            'description' => sanitize_textarea_field($_POST['description'] ?? ''),
            'course_id' => intval($_POST['course_id']),
            'period_id' => !empty($_POST['period_id']) ? intval($_POST['period_id']) : null,
            'time_limit' => intval($_POST['time_limit'] ?? 0),
            'pass_score' => intval($_POST['pass_score'] ?? 60),
            'max_attempts' => intval($_POST['max_attempts'] ?? 1),
            'shuffle_questions' => !empty($_POST['shuffle_questions']) ? 1 : 0,
            'shuffle_answers' => !empty($_POST['shuffle_answers']) ? 1 : 0,
            'show_correct_answers' => !empty($_POST['show_correct_answers']) ? 1 : 0,
            'is_practice' => !empty($_POST['is_practice']) ? 1 : 0,
            'status' => sanitize_text_field($_POST['status'] ?? 'active')
        );
        
        $id = intval($_POST['id'] ?? 0);
        if ($id > 0) {
            $wpdb->update($wpdb->prefix . 'oes_quizzes', $data, array('id' => $id));
        } else {
            $wpdb->insert($wpdb->prefix . 'oes_quizzes', $data);
            $id = $wpdb->insert_id;
            do_action('oes_quiz_created', $id); // mail + push (öğrencilere)
        }

        wp_send_json_success(array('id' => $id));
    }
    
    public function ajax_delete_quiz() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        $id = intval($_POST['id']);
        
        // Soft delete - sadece status'u 'deleted' yap, veriler kalsın
        $wpdb->update(
            $wpdb->prefix . 'oes_quizzes',
            array('status' => 'deleted'),
            array('id' => $id)
        );
        
        wp_send_json_success();
    }
    
    public function ajax_restore_quiz() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        $id = intval($_POST['id']);
        
        // Geri al - status'u 'draft' yap
        $wpdb->update(
            $wpdb->prefix . 'oes_quizzes',
            array('status' => 'draft'),
            array('id' => $id)
        );
        
        wp_send_json_success();
    }
    
    public function ajax_permanent_delete_quiz() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        $id = intval($_POST['id']);
        
        // Kalıcı silme - tüm verileri sil
        // Önce cevapları sil
        $attempts = $wpdb->get_col($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = %d",
            $id
        ));
        foreach ($attempts as $attempt_id) {
            $wpdb->delete($wpdb->prefix . 'oes_quiz_answers', array('attempt_id' => $attempt_id));
        }
        
        // Denemeleri sil
        $wpdb->delete($wpdb->prefix . 'oes_quiz_attempts', array('quiz_id' => $id));
        
        // Soruları sil
        $wpdb->delete($wpdb->prefix . 'oes_quiz_questions', array('quiz_id' => $id));
        
        // Sınavı sil
        $wpdb->delete($wpdb->prefix . 'oes_quizzes', array('id' => $id));
        
        wp_send_json_success();
    }
    
    public function ajax_get_question() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        global $wpdb;
        $q = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE id = %d", intval($_POST['id'])));
        wp_send_json_success($q);
    }
    
    public function ajax_save_question() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        $type = sanitize_text_field($_POST['question_type']);
        
        $data = array(
            'quiz_id' => intval($_POST['quiz_id']),
            'question_type' => $type,
            'question_text' => sanitize_textarea_field($_POST['question_text']),
            'question_image' => esc_url_raw($_POST['question_image'] ?? ''),
            'points' => intval($_POST['points'] ?? 1),
            'explanation' => sanitize_textarea_field($_POST['explanation'] ?? '')
        );
        
        if ($type === 'multiple_choice') {
            $options = array_map('sanitize_text_field', $_POST['options'] ?? array());
            $data['options'] = json_encode(array_values(array_filter($options)));
            $data['correct_answer'] = json_encode(array_map('intval', $_POST['correct'] ?? array()));
        } elseif ($type === 'true_false') {
            $data['options'] = json_encode(array('Doğru', 'Yanlış'));
            $data['correct_answer'] = sanitize_text_field($_POST['correct']);
        }
        
        $qid = intval($_POST['question_id'] ?? 0);
        if ($qid > 0) {
            $wpdb->update($wpdb->prefix . 'oes_quiz_questions', $data, array('id' => $qid));
        } else {
            $max = $wpdb->get_var($wpdb->prepare("SELECT MAX(sort_order) FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d", $data['quiz_id']));
            $data['sort_order'] = ($max ?? 0) + 1;
            $wpdb->insert($wpdb->prefix . 'oes_quiz_questions', $data);
        }
        
        wp_send_json_success();
    }
    
    public function ajax_delete_question() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        $wpdb->delete($wpdb->prefix . 'oes_quiz_questions', array('id' => intval($_POST['id'])));
        wp_send_json_success();
    }
    
    public function ajax_reorder_questions() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        global $wpdb;
        foreach ($_POST['order'] ?? array() as $i => $id) {
            $wpdb->update($wpdb->prefix . 'oes_quiz_questions', array('sort_order' => $i), array('id' => intval($id)));
        }
        wp_send_json_success();
    }
    
    public function ajax_save_progress() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');

        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error('Giriş yapın');

        global $wpdb;
        $attempt_id = intval($_POST['attempt_id']);

        // Sahiplik kontrolü: deneme bu kullanıcıya mı ait?
        $owner_id = $wpdb->get_var($wpdb->prepare(
            "SELECT user_id FROM {$wpdb->prefix}oes_quiz_attempts WHERE id = %d",
            $attempt_id
        ));
        if ((int) $owner_id !== (int) $user_id) wp_send_json_error('Yetki yok');

        // Cevapları JSON olarak yeniden serialize et (sanitize_text_field JSON'u bozar).
        $answers = json_decode(wp_unslash($_POST['answers'] ?? ''), true);
        if (!is_array($answers)) $answers = array();

        $wpdb->update(
            $wpdb->prefix . 'oes_quiz_attempts',
            array('answers' => wp_json_encode($answers)),
            array('id' => $attempt_id)
        );
        wp_send_json_success();
    }
    
    public function ajax_submit_quiz() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        
        global $wpdb;
        $user_id = get_current_user_id();
        $attempt_id = intval($_POST['attempt_id']);
        $answers = json_decode(stripslashes($_POST['answers']), true) ?: array();
        
        $attempt = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_attempts WHERE id = %d AND user_id = %d", $attempt_id, $user_id));
        if (!$attempt) wp_send_json_error('Deneme bulunamadı');
        
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $attempt->quiz_id));
        $questions = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d", $attempt->quiz_id));
        
        $total_points = 0;
        $earned_points = 0;
        $has_open_ended = false;
        $open_ended_points = 0;
        
        foreach ($questions as $q) {
            $total_points += $q->points;
            $user_answer = $answers[$q->id] ?? '';
            
            // Açık uçlu sorular için beklemede bırak
            if ($q->question_type === 'open_ended') {
                $has_open_ended = true;
                $open_ended_points += $q->points;
                continue;
            }
            
            $correct = !empty($q->correct_answer) ? json_decode($q->correct_answer, true) : null;
            if (!is_array($correct)) $correct = array($q->correct_answer);
            
            $is_correct = false;
            if ($q->question_type === 'multiple_choice') {
                $letter_idx = ord(strtoupper($user_answer)) - 65;
                $is_correct = in_array($letter_idx, $correct);
            } else {
                $is_correct = $user_answer === $q->correct_answer;
            }
            
            if ($is_correct) $earned_points += $q->points;
        }
        
        $time_spent = time() - strtotime($attempt->started_at);
        
        // Açık uçlu soru varsa "pending_review" durumuna al
        if ($has_open_ended) {
            $wpdb->update($wpdb->prefix . 'oes_quiz_attempts', array(
                'total_points' => $total_points,
                'earned_points' => $earned_points,
                'status' => 'pending_review',
                'completed_at' => current_time('mysql'),
                'time_spent' => $time_spent,
                'answers' => json_encode($answers)
            ), array('id' => $attempt_id));
            
            wp_send_json_success(array('pending' => true));
        } else {
            // Sadece otomatik puanlanan sorular
            $score = $total_points > 0 ? ($earned_points / $total_points) * 100 : 0;
            $is_ungraded = (intval($quiz->pass_score) === 0); // Geçme notu 0 = puanlamasız
            $passed = $is_ungraded ? true : ($score >= $quiz->pass_score); // Puanlamasız ise her zaman "geçti" say
            
            $wpdb->update($wpdb->prefix . 'oes_quiz_attempts', array(
                'score' => $score,
                'total_points' => $total_points,
                'earned_points' => $earned_points,
                'passed' => $passed ? 1 : 0,
                'status' => 'completed',
                'completed_at' => current_time('mysql'),
                'time_spent' => $time_spent,
                'answers' => json_encode($answers)
            ), array('id' => $attempt_id));
            
            wp_send_json_success(array(
                'score' => $score, 
                'passed' => $passed, 
                'pending' => false,
                'ungraded' => $is_ungraded
            ));
        }
    }
    
    // Öğrenci Sayfası
    public function render_my_quizzes() {
        $user_id = get_current_user_id();
        if (!$user_id) { echo '<p>Giriş yapın.</p>'; return; }
        
        global $wpdb;
        
        // Cache'li kurs ID'leri al
        $completed_course_ids = OES_My_Account::get_user_completed_courses($user_id);
        
        if (empty($completed_course_ids)) {
            echo '<div class="oes-quizzes-page"><h2>Sınavlarım</h2><div class="oes-empty"><p>Aktif eğitiminiz bulunmuyor.</p></div></div>';
            return;
        }
        
        $view = isset($_GET['view']) ? sanitize_text_field($_GET['view']) : 'list';
        $quiz_id = isset($_GET['quiz_id']) ? intval($_GET['quiz_id']) : 0;
        
        if ($view === 'take' && $quiz_id) { $this->render_take_quiz($user_id, $quiz_id); return; }
        if ($view === 'result' && $quiz_id) { $this->render_quiz_result($user_id, $quiz_id); return; }
        
        $placeholders = implode(',', array_fill(0, count($completed_course_ids), '%d'));
        $quizzes = $wpdb->get_results($wpdb->prepare("
            SELECT q.*, p.post_title as course_name,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = q.id) as question_count,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d AND status = 'completed') as my_attempts,
                   (SELECT MAX(score) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d AND status = 'completed') as best_score,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d AND status = 'pending_review') as pending_count
            FROM {$wpdb->prefix}oes_quizzes q
            LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
            WHERE q.status = 'active' AND q.course_id IN ($placeholders)
            ORDER BY q.created_at DESC
        ", array_merge(array($user_id, $user_id, $user_id), $completed_course_ids)));
        
        ?>
        <style>
            .oes-quizzes-page{max-width:600px}
            .oes-quizzes-page h2{margin:0 0 20px;font-size:18px;font-weight:600}
            .oes-quiz-list{display:grid;flex-direction:column;gap:12px;grid-template-columns: repeat(2, 1fr);}
            .oes-quiz-item{background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px}
            .oes-quiz-item h3{margin:0 0 4px;font-size:15px;font-weight:600}
            .oes-quiz-item .course{font-size:12px;color:#64748b;margin-bottom:10px;display:block}
            .oes-quiz-meta{display:flex;gap:16px;font-size:12px;color:#64748b;margin-bottom:12px}
            .oes-quiz-status{padding:10px;border-radius:6px;text-align:center;margin-bottom:12px;font-size:13px}
            .oes-quiz-status.pending{background:#fef3c7;color:#92400e}
            .oes-quiz-status.passed{background:#d1fae5;color:#065f46}
            .oes-quiz-status.failed{background:#fee2e2;color:#991b1b}
            .oes-quiz-btn{display:block;width:100%;padding:10px;background:#10b981;color:#fff;border:none;border-radius:6px;font-weight:500;font-size:14px;cursor:pointer;text-align:center;text-decoration:none}
            .oes-quiz-btn:hover{background:#059669;color:#fff}
            .oes-quiz-btn.disabled{background:#e5e7eb;color:#9ca3af;cursor:not-allowed}
            .oes-empty{text-align:center;padding:40px;color:#64748b}
        </style>
        
        <div class="oes-quizzes-page">
            <h2>Sınavlarım</h2>
            <?php if (empty($quizzes)): ?>
                <div class="oes-empty"><p>Aktif sınav bulunmuyor.</p></div>
            <?php else: ?>
                <div class="oes-quiz-list">
                    <?php foreach ($quizzes as $q): 
                        $can_take = $q->max_attempts == 0 || $q->my_attempts < $q->max_attempts;
                        $is_pending = $q->pending_count > 0;
                        $is_ungraded = (intval($q->pass_score) === 0); // Geçme notu 0 = puanlamasız
                    ?>
                        <div class="oes-quiz-item">
                            <h3><?php echo esc_html($q->title); ?></h3>
                            <span class="course"><?php echo esc_html($q->course_name); ?></span>
                            <div class="oes-quiz-meta">
                                <span><?php echo $q->question_count; ?> soru</span>
                                <span><?php echo $q->time_limit ?: 'Sınırsız'; ?> dk</span>
                                <?php if (!$is_ungraded): ?>
                                <span>%<?php echo $q->pass_score; ?> geçme</span>
                                <?php endif; ?>
                            </div>
                            <?php if ($is_pending): ?>
                                <div class="oes-quiz-status pending">Değerlendirme bekleniyor</div>
                            <?php elseif ($q->my_attempts > 0): ?>
                                <?php if ($is_ungraded): ?>
                                <div class="oes-quiz-status passed">
                                    Gönderildi · <?php echo $q->my_attempts; ?> deneme
                                </div>
                                <?php else: ?>
                                <div class="oes-quiz-status <?php echo $q->best_score >= $q->pass_score ? 'passed' : 'failed'; ?>">
                                    En iyi: %<?php echo number_format($q->best_score, 0); ?> · <?php echo $q->my_attempts; ?> deneme
                                </div>
                                <?php endif; ?>
                            <?php endif; ?>
                            <?php if ($can_take && !$is_pending): ?>
                                <a href="<?php echo wc_get_account_endpoint_url('sinavlarim'); ?>?view=take&quiz_id=<?php echo $q->id; ?>" class="oes-quiz-btn">
                                    <?php echo $q->my_attempts > 0 ? 'Tekrar Çöz' : 'Başla'; ?>
                                </a>
                            <?php elseif (!$is_pending): ?>
                                <span class="oes-quiz-btn disabled">Hak doldu</span>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }
    
    private function render_take_quiz($user_id, $quiz_id) {
        global $wpdb;
        
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d AND status = 'active'", $quiz_id));
        if (!$quiz) { 
            echo '<div class="oes-quizzes-page"><p>Sınav bulunamadı.</p><a href="' . wc_get_account_endpoint_url('sinavlarim') . '">← Geri Dön</a></div>'; 
            return; 
        }
        
        $questions = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY sort_order ASC", $quiz_id));
        
        // Soru yoksa uyarı göster
        if (empty($questions)) {
            echo '<div class="oes-quizzes-page"><div style="background:#fef3c7;padding:20px;border-radius:8px;text-align:center"><p>⚠️ Bu sınavda henüz soru bulunmuyor.</p><a href="' . wc_get_account_endpoint_url('sinavlarim') . '">← Geri Dön</a></div></div>';
            return;
        }
        
        // Devam eden deneme
        $attempt = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = %d AND user_id = %d AND status = 'in_progress'", $quiz_id, $user_id));
        
        if (!$attempt) {
            $wpdb->insert($wpdb->prefix . 'oes_quiz_attempts', array(
                'quiz_id' => $quiz_id, 'user_id' => $user_id, 'status' => 'in_progress', 'started_at' => current_time('mysql')
            ));
            $attempt_id = $wpdb->insert_id;
        } else {
            $attempt_id = $attempt->id;
        }
        
        if ($quiz->shuffle_questions) {
            shuffle($questions);
        }
        $saved = $attempt && $attempt->answers ? json_decode($attempt->answers, true) : array();
        
        // Açık uçlu soru var mı?
        $has_open_ended = false;
        foreach ($questions as $q) {
            if ($q->question_type === 'open_ended') { $has_open_ended = true; break; }
        }
        
        ?>
        <style>
            .qtake{margin:0 auto;font-size:14px}
            .qtake-head{background:#10b981;color:#fff;padding:14px 18px;border-radius:10px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center}
            .qtake-head h2{margin:0;font-size:16px;font-weight:600}
            .qtake-meta{font-size:12px;opacity:.9}
            .qtake-timer{position:sticky;top:20px;background:#1e293b;color:#fff;padding:8px 14px;border-radius:6px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;font-size:13px;z-index:100}
            .qtake-timer-val{font-size:16px;font-weight:700;font-family:monospace}
            .qtake-timer-val.warn{color:#fbbf24}
            .qtake-timer-val.danger{color:#ef4444}
            .qcard{background:#fff;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px}
            .qcard-head{padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:12px;color:#64748b}
            .qcard-body{padding:14px}
            .qcard-text{margin-bottom:12px;line-height:1.5}
            .qcard-img{max-width:100%;border-radius:6px;margin-bottom:12px}
            .qopts{display:flex;flex-direction:column;gap:6px}
            .qopt{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px;cursor:pointer;transition:all .15s;font-size:13px}
            .qopt:hover{border-color:#10b981;background:#f0fdf4}
            .qopt.sel{border-color:#10b981;background:#f0fdf4}
            .qopt input{display:none}
            .qopt-l{width:22px;height:22px;background:#e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:11px;flex-shrink:0}
            .qopt.sel .qopt-l{background:#10b981;color:#fff}
            .qtf{display:flex;gap:8px}
            .qtf .qopt{flex:1;justify-content:center}
            .qopen textarea{width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:6px;font-size:13px;resize:vertical;box-sizing:border-box}
            .qnav{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:16px;border-top:1px solid #e5e7eb}
            .qnav a{color:#64748b;text-decoration:none;font-size:13px}
            .qnav a:hover{color:#10b981}
            .qsubmit{padding:10px 20px;background:#10b981;color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}
            .qsubmit:hover{background:#059669}
            .qnote{background:#fef3c7;padding:10px 12px;border-radius:6px;font-size:12px;color:#92400e;margin-bottom:14px}
        </style>
        
        <div class="qtake">
            <div class="qtake-head">
                <h2><?php echo esc_html($quiz->title); ?></h2>
                <span class="qtake-meta"><?php echo count($questions); ?> soru · %<?php echo $quiz->pass_score; ?> geçme</span>
            </div>
            
            <?php if ($has_open_ended): ?>
            <div class="qnote">⚠️ Bu sınavda açık uçlu sorular var. Sonuçlar değerlendirme sonrası açıklanacaktır.</div>
            <?php endif; ?>
            
            <?php if ($quiz->time_limit > 0): 
                $elapsed = $attempt ? (time() - strtotime($attempt->started_at)) : 0;
                $remaining = max(0, ($quiz->time_limit * 60) - $elapsed);
            ?>
            <div class="qtake-timer">
                <span>⏱ Kalan</span>
                <span class="qtake-timer-val" id="qTimer" data-rem="<?php echo $remaining; ?>"><?php echo sprintf('%02d:%02d', floor($remaining/60), $remaining%60); ?></span>
            </div>
            <?php endif; ?>
            
            <form id="qForm">
                <input type="hidden" name="attempt_id" value="<?php echo $attempt_id; ?>">
                
                <?php foreach ($questions as $idx => $q): 
                    $opts = !empty($q->options) ? (json_decode($q->options, true) ?: array()) : array();
                    if ($quiz->shuffle_answers && $q->question_type === 'multiple_choice') shuffle($opts);
                    $sv = $saved[$q->id] ?? '';
                ?>
                <div class="qcard" data-id="<?php echo $q->id; ?>">
                    <div class="qcard-head">
                        <span>Soru <?php echo $idx + 1; ?></span>
                        <span><?php echo $q->points; ?>p</span>
                    </div>
                    <div class="qcard-body">
                        <div class="qcard-text"><?php echo nl2br(esc_html($q->question_text)); ?></div>
                        <?php if ($q->question_image): ?><img src="<?php echo esc_url($q->question_image); ?>" class="qcard-img"><?php endif; ?>
                        
                        <?php if ($q->question_type === 'multiple_choice'): ?>
                        <div class="qopts">
                            <?php foreach ($opts as $oi => $opt): $l = chr(65+$oi); ?>
                            <label class="qopt <?php echo $sv===$l?'sel':''; ?>">
                                <input type="radio" name="q_<?php echo $q->id; ?>" value="<?php echo $l; ?>" <?php checked($sv,$l); ?>>
                                <span class="qopt-l"><?php echo $l; ?></span>
                                <span><?php echo esc_html($opt); ?></span>
                            </label>
                            <?php endforeach; ?>
                        </div>
                        <?php elseif ($q->question_type === 'true_false'): ?>
                        <div class="qtf">
                            <label class="qopt <?php echo $sv==='true'?'sel':''; ?>"><input type="radio" name="q_<?php echo $q->id; ?>" value="true" <?php checked($sv,'true'); ?>>✓ Doğru</label>
                            <label class="qopt <?php echo $sv==='false'?'sel':''; ?>"><input type="radio" name="q_<?php echo $q->id; ?>" value="false" <?php checked($sv,'false'); ?>>✗ Yanlış</label>
                        </div>
                        <?php else: ?>
                        <div class="qopen"><textarea name="q_<?php echo $q->id; ?>" rows="3" placeholder="Cevabınızı yazın..."><?php echo esc_textarea($sv); ?></textarea></div>
                        <?php endif; ?>
                    </div>
                </div>
                <?php endforeach; ?>
                
                <div class="qnav">
                    <a href="<?php echo wc_get_account_endpoint_url('sinavlarim'); ?>" onclick="return confirm('Çıkmak istediğinize emin misiniz?')">← Çık</a>
                    <button type="submit" class="qsubmit">Sınavı Bitir</button>
                </div>
            </form>
        </div>
        
        <script>
        jQuery(function($) {
            $('.qopt').on('click', function() {
                $(this).closest('.qopts, .qtf').find('.qopt').removeClass('sel');
                $(this).addClass('sel');
                saveProg();
            });
            
            function saveProg() {
                var ans = {};
                $('input[name^="q_"]:checked, textarea[name^="q_"]').each(function() {
                    ans[$(this).attr('name').replace('q_','')] = $(this).val();
                });
                $.post(oesQuizzes.ajaxUrl, { action:'oes_save_quiz_progress', nonce:oesQuizzes.nonce, attempt_id:$('input[name="attempt_id"]').val(), answers:JSON.stringify(ans) });
            }
            
            var $t = $('#qTimer');
            if ($t.length) {
                var rem = parseInt($t.data('rem'));
                setInterval(function() {
                    rem--;
                    if (rem <= 0) { alert('Süre doldu!'); $('#qForm').submit(); return; }
                    $t.text((rem<600?'0':'')+Math.floor(rem/60)+':'+(rem%60<10?'0':'')+(rem%60));
                    if (rem <= 60) $t.addClass('danger');
                    else if (rem <= 300) $t.addClass('warn');
                }, 1000);
            }
            
            $('#qForm').on('submit', function(e) {
                e.preventDefault();
                if (!confirm('Sınavı bitirmek istediğinize emin misiniz?')) return;
                
                var ans = {};
                $('input[name^="q_"]:checked, textarea[name^="q_"]').each(function() {
                    ans[$(this).attr('name').replace('q_','')] = $(this).val();
                });
                
                $.post(oesQuizzes.ajaxUrl, {
                    action: 'oes_submit_quiz',
                    nonce: oesQuizzes.nonce,
                    attempt_id: $('input[name="attempt_id"]').val(),
                    answers: JSON.stringify(ans)
                }, function(res) {
                    if (res.success) {
                        if (res.data.pending) {
                            alert('Sınav gönderildi! Açık uçlu sorularınız değerlendirildikten sonra sonuçlarınız açıklanacaktır.');
                        } else {
                            alert('Sınav tamamlandı! Puanınız: ' + res.data.score.toFixed(1) + '%');
                        }
                        window.location.href = '<?php echo wc_get_account_endpoint_url("sinavlarim"); ?>';
                    } else {
                        alert(res.data || 'Hata');
                    }
                });
            });
        });
        </script>
        <?php
    }
    
    private function render_quiz_result($user_id, $quiz_id) {
        // Sonuç sayfası - isteğe bağlı genişletilebilir
        echo '<p>Sonuç sayfası</p>';
    }
    
    /**
     * Player içinde quiz yükleme AJAX handler
     */
    public function ajax_load_quiz_in_player() {
        check_ajax_referer('oes_player_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error('Giriş yapmalısınız');
        }
        
        $quiz_id = intval($_POST['quiz_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        $force_retake = isset($_POST['force_retake']) && $_POST['force_retake'] === '1';
        
        if (!$quiz_id) {
            wp_send_json_error('Sınav ID gerekli');
        }
        
        global $wpdb;
        
        // Quiz bilgilerini al
        $quiz = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d",
            $quiz_id
        ));
        
        if (!$quiz) {
            wp_send_json_error('Sınav bulunamadı');
        }

        // GÜVENLİK: sınavın ait olduğu kursa erişim zorunlu (IDOR kapatma — BULGU 1)
        if (empty($quiz->course_id) || !in_array(
                (int) $quiz->course_id,
                array_map('intval', OES_My_Account::get_user_completed_courses($user_id)),
                true)) {
            wp_send_json_error('Bu sınava erişiminiz yok');
        }

        // Önceki tamamlanmış denemeyi kontrol et (force_retake değilse)
        if (!$force_retake) {
            $last_attempt = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$wpdb->prefix}oes_quiz_attempts 
                 WHERE quiz_id = %d AND user_id = %d AND status IN ('completed', 'pending_review')
                 ORDER BY completed_at DESC LIMIT 1",
                $quiz_id, $user_id
            ));
            
            if ($last_attempt) {
                // Daha önce çözülmüş, sonucu göster
                ob_start();
                $this->render_quiz_result_in_player($quiz, $last_attempt);
                $html = ob_get_clean();
                
                wp_send_json_success(array(
                    'html' => $html,
                    'title' => $quiz->title,
                    'already_completed' => true
                ));
                return;
            }
        }
        
        // Soruları al
        $questions = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY sort_order ASC",
            $quiz_id
        ));
        
        // HTML oluştur
        ob_start();
        
        $is_practice = ($quiz->quiz_type === 'practice');
        $is_ungraded = (intval($quiz->pass_score) === 0); // Geçme notu 0 = puanlamasız
        ?>
        <div class="quiz-container" id="quizBox">
            <div class="quiz-inner">
                <div class="quiz-header">
                    <h2><?php echo esc_html($quiz->title); ?></h2>
                    <div class="quiz-meta">
                        <span><?php echo count($questions); ?> soru</span>
                        <?php if ($quiz->time_limit > 0): ?>
                        <span><?php echo $quiz->time_limit; ?> dk</span>
                        <?php endif; ?>
                        <?php if (!$is_ungraded && !$is_practice && $quiz->pass_score > 0): ?>
                        <span>Geçme: %<?php echo intval($quiz->pass_score); ?></span>
                        <?php endif; ?>
                    </div>
                </div>
                
                <?php if (count($questions) > 0): ?>
                <form id="playerQuizForm" data-quiz="<?php echo $quiz_id; ?>" data-practice="<?php echo $is_practice ? '1' : '0'; ?>" data-ungraded="<?php echo $is_ungraded ? '1' : '0'; ?>">
                    <?php foreach ($questions as $idx => $q): 
                        $opts = json_decode($q->options, true) ?: [];
                    ?>
                    <div class="quiz-q" data-qid="<?php echo $q->id; ?>" data-type="<?php echo esc_attr($q->question_type); ?>" data-correct="<?php echo esc_attr($q->correct_answer); ?>">
                        <div class="quiz-q-head">
                            <span>Soru <?php echo $idx + 1; ?></span>
                            <?php if (!$is_practice && !$is_ungraded): ?><span><?php echo $q->points; ?>p</span><?php endif; ?>
                        </div>
                        <div class="quiz-q-body">
                            <p class="quiz-q-text"><?php echo nl2br(esc_html($q->question_text)); ?></p>
                            <?php if ($q->question_image): ?><img src="<?php echo esc_url($q->question_image); ?>" class="quiz-q-img"><?php endif; ?>
                            
                            <?php if ($q->question_type === 'multiple_choice'): ?>
                            <div class="quiz-opts">
                                <?php foreach ($opts as $oi => $opt): $l = chr(65+$oi); ?>
                                <label class="quiz-opt" data-val="<?php echo $oi; ?>">
                                    <input type="radio" name="q_<?php echo $q->id; ?>" value="<?php echo $l; ?>">
                                    <span class="quiz-opt-l"><?php echo $l; ?></span>
                                    <span><?php echo esc_html($opt); ?></span>
                                </label>
                                <?php endforeach; ?>
                            </div>
                            <?php elseif ($q->question_type === 'true_false'): ?>
                            <div class="quiz-tf">
                                <label class="quiz-opt" data-val="true"><input type="radio" name="q_<?php echo $q->id; ?>" value="true">✓ Doğru</label>
                                <label class="quiz-opt" data-val="false"><input type="radio" name="q_<?php echo $q->id; ?>" value="false">✗ Yanlış</label>
                            </div>
                            <?php else: ?>
                            <div class="quiz-open"><textarea name="q_<?php echo $q->id; ?>" rows="3" placeholder="Cevabınızı yazın..."></textarea></div>
                            <?php endif; ?>
                            
                            <?php if ($q->explanation && $is_practice): ?>
                            <div class="quiz-explanation" style="display:none">💡 <?php echo esc_html($q->explanation); ?></div>
                            <?php endif; ?>
                        </div>
                    </div>
                    <?php endforeach; ?>
                    <div class="quiz-actions">
                        <button type="submit" class="quiz-submit"><?php echo $is_practice ? 'Cevapları Kontrol Et' : 'Gönder'; ?></button>
                    </div>
                </form>
                <?php else: ?>
                <div class="quiz-empty"><p>Bu sınavda henüz soru bulunmuyor.</p></div>
                <?php endif; ?>
            </div>
        </div>
        <?php
        
        $html = ob_get_clean();
        
        wp_send_json_success(array(
            'html' => $html,
            'title' => $quiz->title,
            'already_completed' => false
        ));
    }
    
    /**
     * Player içinde quiz sonucunu göster
     */
    private function render_quiz_result_in_player($quiz, $attempt) {
        $is_pending = ($attempt->status === 'pending_review');
        $passed = $attempt->passed;
        $score = floatval($attempt->score);
        $completed_date = date_i18n('d M Y, H:i', strtotime($attempt->completed_at));
        $is_ungraded = (intval($quiz->pass_score) === 0); // Geçme notu 0 = puanlamasız
        
        // Deneme sayısını al
        global $wpdb;
        $attempt_count = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts 
             WHERE quiz_id = %d AND user_id = %d AND status IN ('completed', 'pending_review')",
            $quiz->id, get_current_user_id()
        ));
        ?>
        <div class="quiz-container" id="quizBox">
            <div class="quiz-inner">
                <div class="quiz-result" style="padding:60px 20px;text-align:center;">
                    <?php if ($is_ungraded): ?>
                        <!-- Puanlamasız test - minimal -->
                        <div style="width:56px;height:56px;background:var(--primary);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                        </div>
                        <div style="font-size:20px;font-weight:600;margin-bottom:8px;">Gönderildi</div>
                        <div style="color:var(--muted);font-size:14px;">Çalışma Odam → Aksiyonlarım bölümünden kontrol edebilirsiniz.</div>
                    <?php elseif ($is_pending): ?>
                        <!-- Değerlendirme bekliyor -->
                        <div style="width:56px;height:56px;background:var(--muted);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
                        </div>
                        <div style="font-size:20px;font-weight:600;margin-bottom:8px;">Gönderildi</div>
                        <div style="color:var(--muted);font-size:14px;">Değerlendirme sonrası sonuçlarınız açıklanacaktır.</div>
                    <?php else: ?>
                        <!-- Puanlı test sonucu -->
                        <div style="width:56px;height:56px;background:<?php echo $passed ? 'var(--primary)' : '#ef4444'; ?>;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
                            <?php if ($passed): ?>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>
                            <?php else: ?>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            <?php endif; ?>
                        </div>
                        <div class="quiz-result-score <?php echo $passed ? 'pass' : 'fail'; ?>" style="font-size:42px;font-weight:700;">
                            %<?php echo number_format($score, 0); ?>
                        </div>
                        <div style="color:var(--muted);font-size:14px;margin-top:8px;">
                            <?php echo $passed ? 'Başarılı' : 'Başarısız'; ?>
                        </div>
                    <?php endif; ?>
                    
                    <div style="display:flex;justify-content:center;gap:20px;margin:28px 0;padding:16px;background:var(--hover);border-radius:8px;font-size:13px;">
                        <div style="text-align:center;">
                            <div style="font-size:18px;font-weight:600;"><?php echo $attempt_count; ?></div>
                            <div style="color:var(--muted);">Deneme</div>
                        </div>
                        <?php if (!$is_ungraded && !$is_pending): ?>
                        <div style="text-align:center;">
                            <div style="font-size:18px;font-weight:600;">%<?php echo intval($quiz->pass_score); ?></div>
                            <div style="color:var(--muted);">Geçme</div>
                        </div>
                        <?php endif; ?>
                        <div style="text-align:center;">
                            <div style="font-size:18px;font-weight:600;"><?php echo date_i18n('d.m', strtotime($attempt->completed_at)); ?></div>
                            <div style="color:var(--muted);">Tarih</div>
                        </div>
                    </div>
                    
                    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">
                        <button type="button" class="quiz-submit quiz-retake-btn" data-quiz="<?php echo $quiz->id; ?>">
                            Tekrar Çöz
                        </button>
                        <button type="button" class="quiz-submit quiz-delete-btn" data-quiz="<?php echo $quiz->id; ?>" style="background:transparent;border:1px solid var(--border);color:var(--muted);">
                            Sil
                        </button>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
    
    /**
     * Sınav denemesini silme AJAX handler
     */
    public function ajax_delete_quiz_attempt() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        
        global $wpdb;
        $user_id = get_current_user_id();
        $attempt_id = intval($_POST['attempt_id'] ?? 0);
        $quiz_id = intval($_POST['quiz_id'] ?? 0);
        
        if (!$attempt_id && !$quiz_id) {
            wp_send_json_error('Geçersiz istek');
        }
        
        // Admin ise tüm denemeleri silebilir
        if (current_user_can('manage_options')) {
            if ($attempt_id) {
                // Tek deneme sil
                $wpdb->delete($wpdb->prefix . 'oes_quiz_answers', array('attempt_id' => $attempt_id));
                $wpdb->delete($wpdb->prefix . 'oes_quiz_attempts', array('id' => $attempt_id));
                wp_send_json_success(array('deleted' => 1));
            } else if ($quiz_id) {
                // Belirli kullanıcının tüm denemelerini sil
                $target_user = intval($_POST['user_id'] ?? 0);
                if ($target_user) {
                    $attempts = $wpdb->get_col($wpdb->prepare(
                        "SELECT id FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = %d AND user_id = %d",
                        $quiz_id, $target_user
                    ));
                    foreach ($attempts as $aid) {
                        $wpdb->delete($wpdb->prefix . 'oes_quiz_answers', array('attempt_id' => $aid));
                    }
                    $deleted = $wpdb->query($wpdb->prepare(
                        "DELETE FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = %d AND user_id = %d",
                        $quiz_id, $target_user
                    ));
                    wp_send_json_success(array('deleted' => $deleted));
                }
            }
        }
        
        // Normal kullanıcı sadece kendi denemelerini silebilir
        if ($quiz_id) {
            // Kullanıcının bu sınavdaki tüm denemelerini sil
            $attempts = $wpdb->get_col($wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = %d AND user_id = %d",
                $quiz_id, $user_id
            ));
            foreach ($attempts as $aid) {
                $wpdb->delete($wpdb->prefix . 'oes_quiz_answers', array('attempt_id' => $aid));
            }
            $deleted = $wpdb->query($wpdb->prepare(
                "DELETE FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = %d AND user_id = %d",
                $quiz_id, $user_id
            ));
            wp_send_json_success(array('deleted' => $deleted));
        }
        
        wp_send_json_error('Silme işlemi başarısız');
    }
    
    /**
     * Admin - Tek deneme silme
     */
    public function ajax_admin_delete_attempt() {
        check_ajax_referer('oes_quizzes_nonce', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('Yetki yok');
        
        global $wpdb;
        $attempt_id = intval($_POST['attempt_id'] ?? 0);
        
        if (!$attempt_id) {
            wp_send_json_error('Geçersiz istek');
        }
        
        // Cevapları sil
        $wpdb->delete($wpdb->prefix . 'oes_quiz_answers', array('attempt_id' => $attempt_id));
        
        // Denemeyi sil
        $wpdb->delete($wpdb->prefix . 'oes_quiz_attempts', array('id' => $attempt_id));
        
        wp_send_json_success();
    }
}

// Başlat
OES_Quizzes::instance();
