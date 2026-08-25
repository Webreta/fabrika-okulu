<?php
/**
 * Plugin Name: Fabrika Okulu
 * Plugin URI: https://fabrikaokulu.com.tr
 * Description: Fabrika Okulu — WooCommerce entegreli online eğitim, player, öğrenci ve eğitmen paneli sistemi. (Online Eğitim Sistemi'nin devamı; aynı veriyle uyumlu.)
 * Version: 2.0.1
 * Author: Webreta
 * Author URI: https://webreta.com
 * Text Domain: fabrika-okulu
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 5.0
 * WC tested up to: 8.0
 *
 * NOT: Bu eklenti eski "Online Eğitim Sistemi" eklentisinin YERİNE geçer.
 * Aynı veritabanı tablolarını (wp_oes_*), kurs meta'larını (_oes_*) ve
 * option/nonce isimlerini kullanır; böylece mevcut kurslar, siparişler,
 * kayıtlar ve ilerleme verisi korunur. İKİSİ AYNI ANDA AKTİF OLMAMALIDIR
 * (aynı sınıf isimleri çakışır). Fabrika Okulu'yu aktif edip eskisini pasif edin.
 */

if (!defined('ABSPATH')) {
    exit;
}

// Plugin sabitleri
// NOT: OES_* sabit/sınıf/tablo isimleri veri uyumu için bilinçli korunmuştur.
define('OES_VERSION', '2.0.1');
define('FABO_VERSION', '2.0.1');
define('OES_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('OES_PLUGIN_URL', plugin_dir_url(__FILE__));
define('OES_PLUGIN_BASENAME', plugin_basename(__FILE__));
define('OES_PLUGIN_FILE', __FILE__);

/**
 * Asset sürümü: dosyanın değişiklik zamanına bağlı (filemtime) — her düzenlemede
 * tarayıcı önbelleği otomatik kırılır, "çerez/eski dosya" sorunu yaşanmaz.
 * $rel: eklenti köküne göre yol, ör. 'assets/js/player.js'
 */
function oes_asset_ver($rel) {
    $t = @filemtime(OES_PLUGIN_DIR . ltrim($rel, '/'));
    return $t ?: OES_VERSION;
}

/**
 * Görev son teslim ANI (timestamp).
 *
 * KURAL: son teslim GÜNÜN SONUNDA biter → 23:59:59. Müfredattaki görevlerin son
 * teslimi öğrenci bazında "Y-m-d" olarak hesaplanır; düz strtotime() bunu o günün
 * 00:00'ı sayardı, yani öğrenci son gününü baştan kaybederdi.
 *
 * - "2026-07-20"            → 2026-07-20 23:59:59
 * - "2026-07-20 00:00:00"   → 2026-07-20 23:59:59 (saat girilmemiş sayılır)
 * - "2026-07-20 14:30:00"   → aynen (eğitmen açıkça saat vermiş)
 *
 * @return int|null Timestamp; tarih yoksa null.
 */
function fabo_deadline_ts($due) {
    $due = trim((string) $due);
    if ($due === '' || strpos($due, '0000-00-00') === 0) return null;
    $ts = strtotime($due);
    if (!$ts) return null;
    // Saat yok ya da tam gece yarısı → günün sonu
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $due) || date('H:i:s', $ts) === '00:00:00') {
        $ts = strtotime(date('Y-m-d', $ts) . ' 23:59:59');
    }
    return $ts;
}

/** Son teslimi geçti mi? (site saatine göre) */
function fabo_is_overdue($due) {
    $ts = fabo_deadline_ts($due);
    return $ts !== null && $ts < current_time('timestamp');
}

/**
 * Ders süresi metnini SANİYEye çevirir. TEK KAYNAK (editör hint'i, kurs sayfası toplamı).
 *
 * Eğitmen süreyi "dk:sn" girer → 2:35 = 2 dakika 35 saniye (saniyeler de toplama girsin).
 * - "2:35"     → 155
 * - "1:02:35"  → 3755   (sa:dk:sn)
 * - "12" / "12 dk" → 720  (eski serbest metin kayıtları: ilk sayı DAKİKA sayılır)
 */
function fabo_duration_secs($text) {
    $t = trim((string) $text);
    if ($t === '') return 0;
    if (preg_match('/^(?:(\d+):)?(\d+):(\d{1,2})$/', $t, $m)) {
        return intval($m[1]) * 3600 + intval($m[2]) * 60 + intval($m[3]);
    }
    if (preg_match('/(\d+)/', $t, $m)) return intval($m[1]) * 60; // eski kayıt: dakika
    return 0;
}

/** Saniyeyi okunur süreye çevirir ("1 sa 12 dk" / "12 dk" / "45 sn"). */
function fabo_duration_text($secs) {
    $secs = max(0, intval($secs));
    if ($secs <= 0) return '';
    $h = floor($secs / 3600);
    $m = floor(($secs % 3600) / 60);
    if ($h > 0) return $m > 0 ? $h . ' sa ' . $m . ' dk' : $h . ' sa';
    if ($m > 0) return $m . ' dk';
    return $secs . ' sn';
}

/**
 * Göreli son teslimin BAZ ANI — "kayıttan/dönem başından sonra N gün" buradan sayılır.
 * TEK KAYNAK: panel, player ve hatırlatma cron'u aynı sonucu üretsin diye.
 *
 *  - TAKVİMLİ (dönemli) eğitim → öğrencinin kayıtlı olduğu dönemin başlangıcı
 *    (start_date + start_time; saat girilmemişse günün başı).
 *  - ESNEK (dönemsiz) eğitim → öğrencinin kursu İLK AÇTIĞI an (oes_enrollments.started_at).
 *    Satın alma anı DEĞİL: hiç açmadıysa süre başlamaz (null döner).
 *
 * DÖNÜŞ BİÇİMİ ANLAMLIDIR:
 *  - 'Y-m-d H:i:s' → baz SAATLİ (dönem saati girilmiş ya da ilk açma anı)
 *  - 'Y-m-d'       → baz SAATSİZ (eski dönem, saat girilmemiş) → son teslim gün sonu olur
 * Bu ayrım olmadan "saat girilmemiş" ile "gerçekten 00:00" birbirinden ayırt edilemezdi.
 *
 * @return string|null 'Y-m-d H:i:s' | 'Y-m-d' | null (süre henüz başlamadı)
 */
function fabo_task_base($user_id, $course_id) {
    global $wpdb;
    $user_id = (int) $user_id; $course_id = (int) $course_id;
    if (!$user_id || !$course_id) return null;

    // 1) Dönemli: en erken dönem başlangıcı (tarih + saat)
    if (!class_exists('OES_Module_Manager') || OES_Module_Manager::is_active('periods')) {
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT p.start_date, p.start_time
               FROM {$wpdb->prefix}oes_period_enrollments pe
               INNER JOIN {$wpdb->prefix}oes_periods p ON pe.period_id = p.id
              WHERE pe.user_id = %d AND p.course_id = %d
              ORDER BY p.start_date ASC, p.start_time ASC
              LIMIT 1",
            $user_id, $course_id
        ));
        if ($row && !empty($row->start_date)) {
            // Saat girilmemişse SAATSİZ döneriz (00:00 uydurmayız) → gün sonu kuralı işler
            if (empty($row->start_time)) {
                return date('Y-m-d', strtotime($row->start_date));
            }
            return date('Y-m-d H:i:s', strtotime($row->start_date . ' ' . $row->start_time));
        }
    }

    // 2) Esnek: kursa ilk giriş anı (yoksa süre başlamamıştır)
    $started = $wpdb->get_var($wpdb->prepare(
        "SELECT MIN(started_at) FROM {$wpdb->prefix}oes_enrollments
          WHERE user_id = %d AND course_id = %d AND status = 'active' AND started_at IS NOT NULL",
        $user_id, $course_id
    ));
    return $started ?: null;
}

/**
 * Göreli son teslim ANI: baz + N gün, AYNI SAATTE biter.
 * (Dönem 14:00'te başladıysa +7 gün → 7 gün sonra 14:00. Baz saatsizse günün sonu 23:59.)
 *
 * @return int|null Timestamp; süre başlamadıysa ya da gün verilmediyse null.
 */
function fabo_task_due_ts($user_id, $course_id, $extra_days) {
    $extra = (int) $extra_days;
    if ($extra <= 0) return null;
    $base = fabo_task_base($user_id, $course_id);
    if (!$base) return null;

    $ts = strtotime($base . ' +' . $extra . ' days');
    if (!$ts) return null;

    // Baz SAATSİZ ise (yalnızca tarih) → günün sonu. Saatliyse aynı saatte biter
    // (gerçekten 00:00'da başlayan dönem de 00:00'da biter — burada tahmin yürütmeyiz).
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($base))) {
        return strtotime(date('Y-m-d', $ts) . ' 23:59:59');
    }
    return $ts;
}

/**
 * Ana Plugin Sınıfı
 */
final class Online_Egitim_Sistemi {

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->check_requirements();
        $this->includes();
        $this->init_hooks();
    }

    private function check_requirements() {
        add_action('admin_init', function() {
            if (!class_exists('WooCommerce')) {
                add_action('admin_notices', function() {
                    echo '<div class="error"><p><strong>Online Eğitim Sistemi</strong> eklentisi için WooCommerce gereklidir.</p></div>';
                });
                deactivate_plugins(OES_PLUGIN_BASENAME);
            }
        });
    }

    private function includes() {
        // --- Çekirdek modüller (her zaman yüklenir) ---
        require_once OES_PLUGIN_DIR . 'includes/class-oes-module-manager.php';
        // Kurulum sihirbazı kaldırıldı (bu artık özel bir eklenti — sihirbaza gerek yok)
        require_once OES_PLUGIN_DIR . 'includes/class-oes-admin.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-wc-integration.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-frontend.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-player.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-course.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-my-account.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-panel.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-panel-themes.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher-panel.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher-courses.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher-assignments.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher-quizzes.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher-questions.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher-calendar.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-teacher-periods.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-push.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-due-reminders.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-push-scheduler.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-documents.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-course-files.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-certificates.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-reports.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-notifications.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-surveys.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-surveys-admin.php';
        require_once OES_PLUGIN_DIR . 'includes/class-oes-pwa.php';

        // --- Opsiyonel modüller (ayara göre yüklenir) ---
        if (OES_Module_Manager::is_active('periods')) {
            require_once OES_PLUGIN_DIR . 'includes/class-oes-periods.php';
        }

        if (OES_Module_Manager::is_active('instructors')) {
            require_once OES_PLUGIN_DIR . 'includes/class-oes-instructors.php';
        }

        if (OES_Module_Manager::is_active('mail')) {
            require_once OES_PLUGIN_DIR . 'includes/class-oes-mail-system.php';
        }

        if (OES_Module_Manager::is_active('reminders')) {
            require_once OES_PLUGIN_DIR . 'includes/class-oes-event-reminder.php';
        }

        if (OES_Module_Manager::is_active('assignments')) {
            require_once OES_PLUGIN_DIR . 'includes/class-oes-assignments.php';
        }

        if (OES_Module_Manager::is_active('quizzes')) {
            require_once OES_PLUGIN_DIR . 'includes/class-oes-quizzes.php';
        }

        if (OES_Module_Manager::is_active('questions')) {
            require_once OES_PLUGIN_DIR . 'includes/class-oes-questions.php';
        }
    }

    private function init_hooks() {
        add_action('init', array($this, 'load_textdomain'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        
        // WooCommerce HPOS uyumluluğu
        add_action('before_woocommerce_init', function() {
            if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
                \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
            }
        });
    }

    public function load_textdomain() {
        load_plugin_textdomain('online-egitim-sistemi', false, dirname(OES_PLUGIN_BASENAME) . '/languages');
    }

    public function enqueue_frontend_assets() {
        // Mağaza sayfası için frontend.css
        if (is_shop() || is_product_category() || is_product_tag()) {
            wp_enqueue_style('oes-frontend', OES_PLUGIN_URL . 'assets/css/frontend.css', array(), OES_VERSION);
        }
        
        if (is_product()) {
            $product = wc_get_product(get_the_ID());
            if ($product && $product->get_meta('_oes_is_course') === 'yes') {
                // Course page CSS ve JS
                wp_enqueue_style('oes-course-page', OES_PLUGIN_URL . 'assets/css/course-page.css', array(), OES_VERSION);
                wp_enqueue_script('oes-course-page', OES_PLUGIN_URL . 'assets/js/course-page.js', array(), OES_VERSION, true);
            }
        }
    }

    public function enqueue_admin_assets($hook) {
        global $post;
        
        // Eklentinin tüm admin sayfalarında ortak modern stil (alt sayfalar da 'online-kurs-sistemi' hook öneki taşır)
        if (strpos($hook, 'online-kurs-sistemi') !== false) {
            wp_enqueue_style('oes-admin', OES_PLUGIN_URL . 'assets/css/admin.css', array(), OES_VERSION);
            wp_enqueue_script('oes-admin', OES_PLUGIN_URL . 'assets/js/admin.js', array('jquery'), OES_VERSION, true);
        }
        
        // Ürün düzenleme sayfası
        if (($hook === 'post.php' || $hook === 'post-new.php') && isset($post) && $post->post_type === 'product') {
            wp_enqueue_style('oes-admin', OES_PLUGIN_URL . 'assets/css/admin.css', array(), OES_VERSION);
            wp_enqueue_script('oes-admin', OES_PLUGIN_URL . 'assets/js/admin.js', array('jquery', 'jquery-ui-sortable'), OES_VERSION, true);
            wp_localize_script('oes-admin', 'oesAdmin', array(
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('oes_admin_nonce')
            ));
        }
    }
}

// Plugin başlat
function OES() {
    return Online_Egitim_Sistemi::instance();
}

// WooCommerce yüklendikten sonra başlat
add_action('plugins_loaded', 'OES', 20);

// DB kurulumu - sadece admin'de ve versiyon değiştiğinde
add_action('admin_init', function() {
    global $wpdb;
    $db_version = get_option('oes_db_version', '0');
    
    // Versiyon 1.3'ten küçükse güncelle
    if (version_compare($db_version, '1.3', '<')) {
        $charset_collate = $wpdb->get_charset_collate();
        
        // Progress tablosu
        $table_progress = $wpdb->prefix . 'oes_progress';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $table_progress (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            course_id bigint(20) NOT NULL,
            lesson_id varchar(20) NOT NULL,
            status varchar(20) DEFAULT 'incomplete',
            progress_percent int(3) DEFAULT 0,
            completed_at datetime DEFAULT NULL,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY user_course_lesson (user_id, course_id, lesson_id),
            KEY course_progress (user_id, course_id)
        ) $charset_collate;");
        
        // Dönemler tablosu
        $table_periods = $wpdb->prefix . 'oes_periods';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $table_periods (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                course_id bigint(20) NOT NULL,
                name varchar(255) NOT NULL,
                start_date date NOT NULL,
                end_date date NOT NULL,
                enrollment_deadline date DEFAULT NULL,
                capacity int(11) NOT NULL DEFAULT 20,
                description text,
                schedule longtext,
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY course_id (course_id),
                KEY start_date (start_date)
            ) $charset_collate;");
        
        // Dönem kayıtları tablosu
        $table_period_enrollments = $wpdb->prefix . 'oes_period_enrollments';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $table_period_enrollments (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            period_id bigint(20) NOT NULL,
            user_id bigint(20) NOT NULL,
            order_id bigint(20) DEFAULT NULL,
            enrolled_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY period_user (period_id, user_id),
            KEY user_id (user_id)
        ) $charset_collate;");
        
        update_option('oes_db_version', '1.3');
    }

    // v1.4 — dönemlere canlı ders (Zoom) bağlantısı kolonu
    if (version_compare($db_version, '1.4', '<')) {
        $table_periods = $wpdb->prefix . 'oes_periods';
        $has_col = $wpdb->get_var($wpdb->prepare(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = 'meeting_link'",
            DB_NAME, $table_periods
        ));
        if (!$has_col) {
            $wpdb->query("ALTER TABLE $table_periods ADD COLUMN meeting_link varchar(500) DEFAULT NULL AFTER schedule");
        }
        update_option('oes_db_version', '1.4');
    }

    // v1.5 — kullanıcı belgeleri (ücretsiz/indirimli eğitim başvurusu)
    if (version_compare($db_version, '1.5', '<')) {
        $charset_collate = $wpdb->get_charset_collate();
        $table_docs = $wpdb->prefix . 'oes_documents';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $table_docs (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            file_url varchar(500) NOT NULL,
            file_name varchar(255) DEFAULT '',
            note text,
            status varchar(20) DEFAULT 'pending',
            coupon_code varchar(100) DEFAULT NULL,
            course_id bigint(20) DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY status (status)
        ) $charset_collate;");
        update_option('oes_db_version', '1.5');
    }

    // v1.6 — göreli son teslim için BAZ ANI (tarih + SAAT)
    //  - oes_periods.start_time : dönemin başlangıç saati. Göreli deadline
    //    "dönem başı + N gün" artık aynı SAATTE biter (ör. 14:00 başladıysa 14:00'te).
    //  - oes_enrollments.started_at : ESNEK (dönemsiz) eğitimde öğrencinin kursu
    //    İLK AÇTIĞI an. Baz artık satın alma değil, ilk erişimdir; hiç açmadıysa
    //    deadline başlamaz (NULL).
    if (version_compare($db_version, '1.6', '<')) {
        $tp = $wpdb->prefix . 'oes_periods';
        $te = $wpdb->prefix . 'oes_enrollments';
        $db = defined('DB_NAME') ? DB_NAME : '';

        $has_start_time = $wpdb->get_var($wpdb->prepare(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = 'start_time'",
            $db, $tp
        ));
        if (!$has_start_time) {
            $wpdb->query("ALTER TABLE $tp ADD COLUMN start_time time DEFAULT NULL AFTER start_date");
        }

        $has_started_at = $wpdb->get_var($wpdb->prepare(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = 'started_at'",
            $db, $te
        ));
        if (!$has_started_at) {
            $wpdb->query("ALTER TABLE $te ADD COLUMN started_at datetime DEFAULT NULL AFTER enrolled_at");
        }

        update_option('oes_db_version', '1.6');
    }

    // v1.7 — verilen sertifikalar. Adres tahmin edilemez olsun diye her kayıt
    // kendi token'ıyla saklanır (/sertifika/{token}/).
    if (version_compare($db_version, '1.7', '<')) {
        $charset_collate = $wpdb->get_charset_collate();
        $tc = $wpdb->prefix . 'oes_certificates';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $tc (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            cert_id bigint(20) NOT NULL,
            user_id bigint(20) NOT NULL,
            course_id bigint(20) NOT NULL,
            token varchar(64) NOT NULL,
            issued_by bigint(20) DEFAULT NULL,
            issued_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY token (token),
            UNIQUE KEY cert_user_course (cert_id, user_id, course_id),
            KEY user_id (user_id),
            KEY course_id (course_id)
        ) $charset_collate;");
        update_option('oes_db_version', '1.7');
    }

    // v1.8 — sertifikada yazan ad/eğitim adı VERİLDİĞİ AN dondurulur.
    // Aksi halde kullanıcı hesabından adını değiştirince mevcut sertifikası da
    // o yeni adı gösterirdi → başkasının adına belge üretilebilirdi.
    if (version_compare($db_version, '1.8', '<')) {
        $tc = $wpdb->prefix . 'oes_certificates';
        $db = defined('DB_NAME') ? DB_NAME : '';
        foreach (array(
            'holder_name' => "ALTER TABLE $tc ADD COLUMN holder_name varchar(191) DEFAULT NULL AFTER user_id",
            'course_name' => "ALTER TABLE $tc ADD COLUMN course_name varchar(191) DEFAULT NULL AFTER course_id",
        ) as $col => $sql) {
            $has = $wpdb->get_var($wpdb->prepare(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = %s", $db, $tc, $col));
            if (!$has) $wpdb->query($sql);
        }
        // Mevcut kayıtlar: o anki adla doldur (elde başka bir kaynak yok)
        $wpdb->query("UPDATE $tc c
                      INNER JOIN {$wpdb->users} u ON u.ID = c.user_id
                      SET c.holder_name = u.display_name
                      WHERE c.holder_name IS NULL OR c.holder_name = ''");
        $wpdb->query("UPDATE $tc c
                      INNER JOIN {$wpdb->posts} p ON p.ID = c.course_id
                      SET c.course_name = p.post_title
                      WHERE c.course_name IS NULL OR c.course_name = ''");
        update_option('oes_db_version', '1.8');
    }

    // v1.9 — sınavlara GÖRELİ son tarih (görevlerdeki gibi):
    // "kayıttan / dönem başından sonra N gün". Mutlak end_date kolonu duruyor
    // (wp-admin'den tek sınav için girilebiliyor); extra_days doluysa O geçerlidir.
    if (version_compare($db_version, '1.9', '<')) {
        $tq = $wpdb->prefix . 'oes_quizzes';
        $db = defined('DB_NAME') ? DB_NAME : '';
        $has = $wpdb->get_var($wpdb->prepare(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
              WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = 'extra_days'", $db, $tq));
        if (!$has) {
            $wpdb->query("ALTER TABLE $tq ADD COLUMN extra_days int(11) DEFAULT NULL AFTER end_date");
        }
        update_option('oes_db_version', '1.9');
    }

    // v2.0 — kullanıcı bazlı bildirim kutusu ("Bildirimlerim").
    // oes_notifications_log YÖNETİCİ günlüğüdür; bu tablo kullanıcının kendi
    // bildirimlerini okundu/okunmadı bilgisiyle tutar (push'tan bağımsız).
    if (version_compare($db_version, '2.0', '<')) {
        $charset_collate = $wpdb->get_charset_collate();
        $tn = $wpdb->prefix . 'oes_notifications';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $tn (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            title varchar(191) NOT NULL,
            body text,
            url varchar(500) DEFAULT '',
            tag varchar(100) DEFAULT '',
            is_read tinyint(1) NOT NULL DEFAULT 0,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY user_read (user_id, is_read),
            KEY user_created (user_id, id)
        ) $charset_collate;");
        update_option('oes_db_version', '2.0');
    }

    // v2.1 — Anket cevapları.
    // SORU BAŞINA SATIR (tek JSON sütunu değil): "1 ay içinde iş değiştirmek
    // isteyenler" gibi listeler ancak böyle SQL'de çıkarılabiliyor. Çoklu seçim
    // cevapları value içine JSON dizi olarak yazılır.
    if (version_compare($db_version, '2.1', '<')) {
        $charset_collate = $wpdb->get_charset_collate();
        $tn = $wpdb->prefix . 'oes_survey_answers';
        $wpdb->query("CREATE TABLE IF NOT EXISTS $tn (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            survey_key varchar(64) NOT NULL,
            question_key varchar(64) NOT NULL,
            value longtext,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY u_answer (user_id, survey_key, question_key),
            KEY q_lookup (survey_key, question_key),
            KEY user_idx (user_id)
        ) $charset_collate;");
        update_option('oes_db_version', '2.1');
    }
});

// Aktivasyon
register_activation_hook(__FILE__, function() {
    set_transient('oes_activation_redirect', true, 30);
    global $wpdb;
    $charset_collate = $wpdb->get_charset_collate();
    
    // Kurs kayıtları tablosu
    $table_enrollments = $wpdb->prefix . 'oes_enrollments';
    $sql_enrollments = "CREATE TABLE IF NOT EXISTS $table_enrollments (
        id bigint(20) NOT NULL AUTO_INCREMENT,
        user_id bigint(20) NOT NULL,
        course_id bigint(20) NOT NULL,
        order_id bigint(20) DEFAULT NULL,
        status varchar(20) DEFAULT 'active',
        enrolled_at datetime DEFAULT CURRENT_TIMESTAMP,
        expires_at datetime DEFAULT NULL,
        PRIMARY KEY (id),
        KEY user_id (user_id),
        KEY course_id (course_id),
        KEY order_id (order_id)
    ) $charset_collate;";
    
    // İlerleme tablosu - sadece yoksa oluştur
    $table_progress = $wpdb->prefix . 'oes_progress';
    $table_exists = $wpdb->get_var("SHOW TABLES LIKE '$table_progress'") === $table_progress;
    
    if (!$table_exists) {
        $sql_progress = "CREATE TABLE $table_progress (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            course_id bigint(20) NOT NULL,
            lesson_id varchar(20) NOT NULL,
            status varchar(20) DEFAULT 'incomplete',
            progress_percent int(3) DEFAULT 0,
            completed_at datetime DEFAULT NULL,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY user_course_lesson (user_id, course_id, lesson_id),
            KEY course_progress (user_id, course_id)
        ) $charset_collate;";
        
        $wpdb->query($sql_progress);
    }
    
    require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
    dbDelta($sql_enrollments);
    
    flush_rewrite_rules();
});

// Deaktivasyon
register_deactivation_hook(__FILE__, function() {
    flush_rewrite_rules();
});

// Dönem seçici CSS/JS yükle
add_action('wp_enqueue_scripts', function() {
    if (is_product()) {
        $product_id = get_the_ID();
        $is_period_based = get_post_meta($product_id, '_oes_period_based', true);
        
        if ($is_period_based === 'yes') {
            wp_enqueue_style('oes-period-selector', OES_PLUGIN_URL . 'assets/css/period-selector.css', array(), '1.0.0');
            wp_enqueue_script('oes-period-selector', OES_PLUGIN_URL . 'assets/js/period-selector.js', array(), '1.0.0', true);
        }
    }
});

/**
 * Dönem seçici render fonksiyonu
 */
function oes_render_period_selector($product_id) {
    global $wpdb;
    
    $is_period_based = get_post_meta($product_id, '_oes_period_based', true);
    if ($is_period_based !== 'yes') return '';
    
    $now = current_time('Y-m-d');
    
    $periods = $wpdb->get_results($wpdb->prepare("
        SELECT p.*, 
               (SELECT COUNT(*) FROM {$wpdb->prefix}oes_period_enrollments WHERE period_id = p.id) as enrolled
        FROM {$wpdb->prefix}oes_periods p
        WHERE p.course_id = %d
        AND (p.enrollment_deadline >= %s OR (p.enrollment_deadline IS NULL AND p.start_date >= %s))
        ORDER BY p.start_date ASC
    ", $product_id, $now, $now));
    
    ob_start();
    ?>
    <input type="hidden" name="oes_period" id="oes_period_input" value="">
    
    <?php if (empty($periods)): ?>
    <div class="oes-no-period">
        <span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
        </span>
        <p><strong>Kayıt açık dönem yok</strong><br><small>Yeni dönemler için takipte kalın</small></p>
    </div>
    <?php return ob_get_clean(); endif; ?>
    
    <!-- Dönem Butonu -->
    <div class="oes-period-trigger" id="oesPeriodTrigger">
        <div class="oes-pt-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
        </div>
        <div class="oes-pt-text">
            <span>Dönem</span>
            <strong id="oesPeriodLabel">Seçiniz</strong>
        </div>
        <div class="oes-pt-arrow">›</div>
    </div>
    
    <!-- Lightbox -->
    <div class="oes-period-lb" id="oesPeriodLB">
        <div class="oes-lb-box">
            <div class="oes-lb-left">
                <div class="oes-lb-title">Dönem Seçin</div>
                <div class="oes-lb-periods-wrap">
                <?php foreach ($periods as $i => $p): 
                    $rem = $p->capacity - $p->enrolled;
                    $full = $rem <= 0;
                ?>
                <div class="oes-lb-period <?php echo $full ? 'disabled' : ''; ?>" data-idx="<?php echo $i; ?>" data-id="<?php echo $p->id; ?>" data-name="<?php echo esc_attr($p->name); ?>">
                    <div class="oes-lb-radio"></div>
                    <div class="oes-lb-pinfo">
                        <strong><?php echo esc_html($p->name); ?></strong>
                        <span><?php echo date_i18n('d M', strtotime($p->start_date)); ?> - <?php echo date_i18n('d M Y', strtotime($p->end_date)); ?></span>
                    </div>
                    <div class="oes-lb-cap <?php echo $full ? 'full' : ($rem <= 5 ? 'low' : ''); ?>">
                        <?php echo $full ? 'Dolu' : $rem . ' kişi'; ?>
                    </div>
                </div>
                <?php endforeach; ?>
                </div>
            </div>
            <div class="oes-lb-right">
                <div class="oes-lb-calendar">
                    <div class="oes-cal-header">
                        <span>📋</span> Program
                    </div>
                    <div class="oes-cal-empty" id="oesCalEmpty">
                        <p>Dönem seçin</p>
                    </div>
                    <div class="oes-cal-list" id="oesCalList"></div>
                </div>
            </div>
            <button type="button" class="oes-lb-close" id="oesLBClose">&times;</button>
            <div class="oes-lb-footer">
                <button type="button" class="oes-lb-cancel" id="oesLBCancel">İptal</button>
                <button type="button" class="oes-lb-ok" id="oesLBOk" disabled>Seç</button>
            </div>
        </div>
    </div>
    
    <script>
    var oesPeriodsData = <?php echo json_encode(array_map(function($p) {
        return [
            'id' => $p->id,
            'name' => $p->name,
            'schedule' => json_decode($p->schedule, true) ?: []
        ];
    }, $periods)); ?>;
    </script>
    <?php
    return ob_get_clean();
}