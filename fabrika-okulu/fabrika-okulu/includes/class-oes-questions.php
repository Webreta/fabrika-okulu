<?php
/**
 * Öğrenci Soru-Cevap Sistemi
 * Canlı sohbet ve soru yönetimi
 */

if (!defined('ABSPATH')) exit;

class OES_Questions {
    
    private static $instance = null;
    
    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    public function __construct() {
        // AJAX handlers
        add_action('wp_ajax_oes_submit_question', array($this, 'submit_question'));
        add_action('wp_ajax_oes_get_my_questions', array($this, 'get_my_questions'));
        add_action('wp_ajax_oes_get_question_answers', array($this, 'get_question_answers'));
        add_action('wp_ajax_oes_get_lesson_questions', array($this, 'get_lesson_questions'));
        add_action('wp_ajax_oes_student_reply', array($this, 'student_reply'));
        add_action('wp_ajax_oes_admin_answer_question', array($this, 'admin_answer_question'));
        add_action('wp_ajax_oes_admin_get_chat_messages', array($this, 'admin_get_chat_messages'));
        add_action('wp_ajax_oes_admin_mark_read', array($this, 'admin_mark_read'));
        add_action('wp_ajax_oes_admin_delete_chat', array($this, 'admin_delete_chat'));
        add_action('wp_ajax_oes_admin_get_pending_count', array($this, 'admin_get_pending_count'));
        
        // Admin menü
        add_action('admin_menu', array($this, 'add_admin_menu'), 20);
        
        // Admin bar bildirimi
        add_action('admin_bar_menu', array($this, 'add_admin_bar_notification'), 100);
        
        // Admin sayfalarında global bildirim JS
        add_action('admin_footer', array($this, 'admin_notification_script'));
        
        // Tablo oluşturma - her yüklemede kontrol et (hafif)
        add_action('init', array($this, 'create_tables'));
    }
    
    /**
     * Admin bar'a bildirim ekle
     */
    public function add_admin_bar_notification($wp_admin_bar) {
        if (!current_user_can('manage_options')) return;
        
        global $wpdb;
        $pending_count = $wpdb->get_var("
            SELECT COUNT(DISTINCT CONCAT(user_id, '_', course_id)) 
            FROM {$wpdb->prefix}oes_questions 
            WHERE status = 'pending'
        ");
        
        if ($pending_count > 0) {
            $wp_admin_bar->add_node(array(
                'id'    => 'oes-questions-notification',
                'title' => '<span class="ab-icon dashicons dashicons-format-chat" style="font-family:dashicons;font-size:18px;margin-top:4px"></span><span class="oes-admin-bar-count" style="background:#f59e0b;color:#fff;padding:0 6px;border-radius:10px;font-size:11px;margin-left:4px">' . $pending_count . '</span>',
                'href'  => admin_url('admin.php?page=oes-questions&status=pending'),
                'meta'  => array(
                    'title' => $pending_count . ' bekleyen öğrenci sorusu'
                )
            ));
        }
    }
    
    /**
     * Admin panelinde global bildirim script'i
     */
    public function admin_notification_script() {
        if (!current_user_can('manage_options')) return;
        
        // Sadece OES sayfalarında değilse çalışsın (OES sayfalarında zaten var)
        $screen = get_current_screen();
        if ($screen && strpos($screen->id, 'oes-questions') !== false) return;
        
        ?>
        <script>
        (function(){
            var lastCount = <?php 
                global $wpdb;
                echo intval($wpdb->get_var("SELECT COUNT(DISTINCT CONCAT(user_id, '_', course_id)) FROM {$wpdb->prefix}oes_questions WHERE status = 'pending'"));
            ?>;
            
            function checkQuestions(){
                var fd = new FormData();
                fd.append('action', 'oes_admin_get_pending_count');
                fd.append('nonce', '<?php echo wp_create_nonce("oes_admin_answer"); ?>');
                
                fetch('<?php echo admin_url("admin-ajax.php"); ?>', {method:'POST', body:fd})
                .then(function(r){ return r.json(); })
                .then(function(d){
                    if(d.success && d.data){
                        var newCount = d.data.pending || 0;
                        
                        // Admin bar'daki badge'i güncelle
                        var badge = document.querySelector('.oes-admin-bar-count');
                        if(newCount > 0){
                            if(badge){
                                badge.textContent = newCount;
                            }else{
                                // Badge yoksa admin bar'ı yeniden yüklemek yerine basit bildirim
                                if(newCount > lastCount){
                                    showNotification(newCount - lastCount);
                                }
                            }
                        }else if(badge){
                            badge.parentElement.style.display = 'none';
                        }
                        
                        // Menüdeki badge'i güncelle
                        var menuBadge = document.querySelector('#adminmenu a[href*="oes-questions"] .awaiting-mod');
                        if(menuBadge){
                            menuBadge.textContent = newCount;
                            menuBadge.style.display = newCount > 0 ? '' : 'none';
                        }
                        
                        if(newCount > lastCount){
                            showNotification(newCount - lastCount);
                        }
                        lastCount = newCount;
                    }
                });
            }
            
            function showNotification(count){
                // Masaüstü bildirimi dene
                if('Notification' in window && Notification.permission === 'granted'){
                    new Notification('Yeni Öğrenci Sorusu', {
                        body: count + ' yeni soru geldi',
                        icon: '<?php echo OES_PLUGIN_URL; ?>assets/images/icon.png'
                    });
                }
                
                // Sayfa içi bildirim
                var old = document.getElementById('oesNewQuestionNotif');
                if(old) old.remove();
                
                var notif = document.createElement('div');
                notif.id = 'oesNewQuestionNotif';
                notif.style.cssText = 'position:fixed;bottom:20px;right:20px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:14px 20px;border-radius:10px;font-size:14px;z-index:999999;cursor:pointer;box-shadow:0 4px 20px rgba(16,185,129,.4);animation:oesSlideUp .4s ease;font-family:-apple-system,sans-serif';
                notif.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:24px">💬</span><div><strong>' + count + ' Yeni Soru</strong><br><span style="font-size:12px;opacity:.9">Cevaplamak için tıklayın</span></div></div>';
                notif.onclick = function(){ window.location.href = '<?php echo admin_url("admin.php?page=oes-questions&status=pending"); ?>'; };
                document.body.appendChild(notif);
                
                // Ses çal (opsiyonel)
                try{
                    var audio = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNJU/AAAAAAAAAAAAAAAAAAP/7kGQAAANUAB1gAAANIAB1gAAANJBEZFAAAA0gAB1AAAB0AAAAAAAAGiACnAAFEACUAAFjAMQQZJcTOqAqAu1KFD5RAEZJM0a/+9RL/8R0ABJJdJUCJSbPMvLx4u////////nHOsdmNB11RiV1kH/UDOa9bv///////tz/77///+8b/75xzmvUblT4VfD7/t//t////////tjEu7rPU0gkRRAFFCCOAAGAAmPrkXLJgLAJKmNKq2bQE/xkX7bKqKXLFb78kKKX/AEMIIYZgYsZg4seMVcKsMBEgFhcPDw+Ph/h4eHh5/8/D/h/h5/h5/8PD//8PCwsEBB4PDw8Pw');
                    audio.volume = 0.3;
                    audio.play();
                }catch(e){}
                
                setTimeout(function(){ if(notif.parentNode) notif.remove(); }, 8000);
            }
            
            // İzin iste (bir kez)
            if('Notification' in window && Notification.permission === 'default'){
                Notification.requestPermission();
            }
            
            // Her 30 saniyede kontrol
            setInterval(checkQuestions, 30000);
        })();
        </script>
        <style>
        @keyframes oesSlideUp{from{transform:translateY(100px);opacity:0}to{transform:translateY(0);opacity:1}}
        </style>
        <?php
    }
    
    /**
     * Tabloları oluştur
     */
    public function create_tables() {
        global $wpdb;
        $charset_collate = $wpdb->get_charset_collate();
        $table = $wpdb->prefix . 'oes_questions';
        $table_answers = $wpdb->prefix . 'oes_question_answers';

        // Tabloyu oluştur (yoksa)
        $wpdb->query("CREATE TABLE IF NOT EXISTS $table (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            user_id bigint(20) NOT NULL,
            course_id bigint(20) NOT NULL,
            lesson_key varchar(100) DEFAULT NULL,
            lesson_title varchar(255) DEFAULT NULL,
            question_text text NOT NULL,
            status varchar(20) DEFAULT 'pending',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY course_id (course_id),
            KEY status (status)
        ) $charset_collate;");

        $wpdb->query("CREATE TABLE IF NOT EXISTS $table_answers (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            question_id bigint(20) NOT NULL,
            user_id bigint(20) NOT NULL,
            answer text NOT NULL,
            is_instructor tinyint(1) DEFAULT 0,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY question_id (question_id)
        ) $charset_collate;");

        // Eksik kolonları teker teker kontrol et ve ekle
        $required_columns = array(
            'lesson_key'   => "ALTER TABLE $table ADD COLUMN lesson_key varchar(100) DEFAULT NULL AFTER course_id",
            'lesson_title' => "ALTER TABLE $table ADD COLUMN lesson_title varchar(255) DEFAULT NULL AFTER lesson_key",
            'question_text' => "ALTER TABLE $table ADD COLUMN question_text text NOT NULL AFTER lesson_title",
            'status'       => "ALTER TABLE $table ADD COLUMN status varchar(20) DEFAULT 'pending' AFTER question_text",
            'created_at'   => "ALTER TABLE $table ADD COLUMN created_at datetime DEFAULT CURRENT_TIMESTAMP AFTER status",
        );

        $existing = $wpdb->get_col("SHOW COLUMNS FROM $table");
        foreach ($required_columns as $col => $sql) {
            if (!in_array($col, $existing)) {
                $wpdb->query($sql);
            }
        }

        // oes_question_answers tablosuna is_instructor kolonu ekle (yoksa)
        $existing_ans = $wpdb->get_col("SHOW COLUMNS FROM $table_answers");
        if (!in_array('is_instructor', $existing_ans)) {
            $wpdb->query("ALTER TABLE $table_answers ADD COLUMN is_instructor tinyint(1) DEFAULT 0 AFTER answer");
        }

        update_option('oes_questions_db_version', '1.2');
    }
    
    /**
     * Admin menüye ekle
     */
    public function add_admin_menu() {
        global $wpdb;
        
        // Bekleyen soru sayısını al
        $pending_count = $wpdb->get_var("
            SELECT COUNT(DISTINCT CONCAT(user_id, '_', course_id)) 
            FROM {$wpdb->prefix}oes_questions 
            WHERE status = 'pending'
        ");
        
        $menu_title = 'Öğrenci Soruları';
        if ($pending_count > 0) {
            $menu_title .= ' <span class="awaiting-mod" style="background:#f59e0b">' . $pending_count . '</span>';
        }
        
        add_submenu_page(
            'online-kurs-sistemi',
            'Öğrenci Soruları',
            $menu_title,
            'manage_options',
            'oes-questions',
            array($this, 'render_admin_page')
        );
    }
    
    /**
     * Soru gönderme (AJAX)
     */
    public function submit_question() {
        check_ajax_referer('oes_player_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error('Giriş yapmalısınız');
        }
        
        $course_id = intval($_POST['course_id'] ?? 0);
        $lesson_key = sanitize_text_field($_POST['lesson_key'] ?? '');
        $lesson_title = sanitize_text_field($_POST['lesson_title'] ?? '');
        $question = sanitize_textarea_field($_POST['question'] ?? '');
        
        if (!$course_id || !$question) {
            wp_send_json_error('Eksik bilgi');
        }
        
        global $wpdb;
        
        // Kullanıcı bu kursa kayıtlı mı?
        $enrolled = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d AND course_id = %d",
            $user_id, $course_id
        ));
        
        if (!$enrolled) {
            wp_send_json_error('Bu kursa kayıtlı değilsiniz');
        }
        
        // Soruyu kaydet
        $wpdb->insert(
            $wpdb->prefix . 'oes_questions',
            array(
                'user_id' => $user_id,
                'course_id' => $course_id,
                'lesson_key' => $lesson_key,
                'lesson_title' => $lesson_title,
                'question_text' => $question,
                'status' => 'pending',
                'created_at' => current_time('mysql')
            ),
            array('%d', '%d', '%s', '%s', '%s', '%s', '%s')
        );
        
        if ($wpdb->insert_id) {
            // Admin'e bildirim gönder
            $this->notify_admin_new_question($wpdb->insert_id, $course_id, $user_id, $question);

            // Push: kursun eğitmenine
            do_action('oes_question_asked', $wpdb->insert_id);

            wp_send_json_success(array('id' => $wpdb->insert_id));
        } else {
            $err = $wpdb->last_error ?: 'Kayıt hatası';
            wp_send_json_error($err);
        }
    }
    
    /**
     * Kullanıcının sorularını getir (AJAX)
     */
    public function get_my_questions() {
        check_ajax_referer('oes_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error('Giriş yapmalısınız');
        }
        
        $course_id = intval($_POST['course_id'] ?? 0);
        
        global $wpdb;
        
        $where = $course_id ? $wpdb->prepare(" AND q.course_id = %d", $course_id) : '';
        
        $questions = $wpdb->get_results($wpdb->prepare("
            SELECT q.*, p.post_title as course_name,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_question_answers WHERE question_id = q.id) as answer_count,
                   (SELECT COUNT(*) FROM {$wpdb->prefix}oes_question_answers WHERE question_id = q.id AND is_instructor = 1) as instructor_answers
            FROM {$wpdb->prefix}oes_questions q
            LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
            WHERE q.user_id = %d $where
            ORDER BY q.created_at DESC
        ", $user_id));
        
        wp_send_json_success($questions);
    }
    
    /**
     * Soru cevaplarını getir (AJAX)
     */
    public function get_question_answers() {
        check_ajax_referer('oes_nonce', 'nonce');
        
        $question_id = intval($_POST['question_id'] ?? 0);
        if (!$question_id) {
            wp_send_json_error('Geçersiz soru');
        }
        
        global $wpdb;
        
        $answers = $wpdb->get_results($wpdb->prepare("
            SELECT a.*, u.display_name
            FROM {$wpdb->prefix}oes_question_answers a
            LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
            WHERE a.question_id = %d
            ORDER BY a.created_at ASC
        ", $question_id));
        
        wp_send_json_success($answers);
    }
    
    /**
     * Kurs bazlı soruları getir (Player için AJAX)
     */
    public function get_lesson_questions() {
        check_ajax_referer('oes_player_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error('Giriş yapmalısınız');
        }
        
        $course_id = intval($_POST['course_id'] ?? 0);
        
        if (!$course_id) {
            wp_send_json_error('Geçersiz kurs');
        }
        
        global $wpdb;
        
        // Kullanıcının bu kurstaki tüm sorularını getir
        $questions = $wpdb->get_results($wpdb->prepare("
            SELECT q.*
            FROM {$wpdb->prefix}oes_questions q
            WHERE q.user_id = %d AND q.course_id = %d
            ORDER BY q.created_at ASC
        ", $user_id, $course_id));
        
        // Her soru için cevapları da getir
        foreach ($questions as &$q) {
            $q->answers = $wpdb->get_results($wpdb->prepare("
                SELECT a.*, u.display_name
                FROM {$wpdb->prefix}oes_question_answers a
                LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
                WHERE a.question_id = %d
                ORDER BY a.created_at ASC
            ", $q->id));
        }
        
        wp_send_json_success($questions);
    }
    
    /**
     * Öğrenci yanıtı (AJAX)
     */
    public function student_reply() {
        check_ajax_referer('oes_nonce', 'nonce');
        
        $user_id = get_current_user_id();
        if (!$user_id) {
            wp_send_json_error('Giriş yapmalısınız');
        }
        
        $question_id = intval($_POST['question_id'] ?? 0);
        $answer = sanitize_textarea_field($_POST['answer'] ?? '');
        
        if (!$question_id || !$answer) {
            wp_send_json_error('Eksik bilgi');
        }
        
        global $wpdb;
        
        // Bu soru bu kullanıcıya mı ait?
        $question = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_questions WHERE id = %d AND user_id = %d",
            $question_id, $user_id
        ));
        
        if (!$question) {
            wp_send_json_error('Bu soru size ait değil');
        }
        
        $wpdb->insert(
            $wpdb->prefix . 'oes_question_answers',
            array(
                'question_id' => $question_id,
                'user_id'     => $user_id,
                'answer'      => $answer,
                'created_at'  => current_time('mysql')
            ),
            array('%d', '%d', '%s', '%s')
        );
        
        wp_send_json_success(array('id' => $wpdb->insert_id));
    }
    
    /**
     * Admin AJAX cevap gönderme
     */
    public function admin_answer_question() {
        check_ajax_referer('oes_admin_answer', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $question_id = intval($_POST['question_id'] ?? 0);
        $answer = sanitize_textarea_field($_POST['answer'] ?? '');
        
        if (!$question_id || !$answer) {
            wp_send_json_error('Eksik bilgi');
        }
        
        global $wpdb;
        
        // Cevabı kaydet
        $wpdb->insert(
            $wpdb->prefix . 'oes_question_answers',
            array(
                'question_id'  => $question_id,
                'user_id'      => get_current_user_id(),
                'answer'       => $answer,
                'is_instructor' => 1,
                'created_at'   => current_time('mysql')
            ),
            array('%d', '%d', '%s', '%d', '%s')
        );
        
        if (!$wpdb->insert_id) {
            wp_send_json_error('Kayıt hatası');
        }
        
        // Soru durumunu güncelle
        $wpdb->update(
            $wpdb->prefix . 'oes_questions',
            array('status' => 'answered'),
            array('id' => $question_id)
        );
        
        // Öğrenciye bildirim gönder - Yeni mail sistemini kullan
        if (class_exists('OES_Mail_System')) {
            $mailer = OES_Mail_System::instance();
            $mailer->send_question_answered_notification($question_id, $answer);
        }
        // PUSH: eskiden yalnızca EĞİTMEN PANELİNDEN cevaplayınca gidiyordu;
        // wp-admin'den cevaplandığında öğrenciye push HİÇ gitmiyordu.
        self::fire_answered_push($question_id, $answer);

        wp_send_json_success(array('id' => $wpdb->insert_id));
    }

    /** Soru yanıtlandı → öğrenciye push (tek kaynak; hem admin hem panel kullanır) */
    private static function fire_answered_push($question_id, $answer) {
        global $wpdb;
        $q = $wpdb->get_row($wpdb->prepare(
            "SELECT user_id, course_id FROM {$wpdb->prefix}oes_questions WHERE id = %d", $question_id));
        if (!$q) return;
        // 5. arg: tam O sorunun id'si → bildirim doğru derse gitsin
        do_action('oes_question_answered_push', (int) $q->user_id, get_the_title($q->course_id), $answer, (int) $q->course_id, (int) $question_id);
    }

    /**
     * Öğrencinin sorusunu SORDUĞU ekranın adresi.
     * Soru kaydında lesson_key ("bölüm_ders") tutulur → doğrudan o derse gider.
     * Sırası gelmediyse player'ın önkoşul kilidi öğrenciyi kaldığı yere düşürür,
     * yani burada ayrıca kontrol etmeye gerek yok.
     */
    public static function ask_screen_url($user_id, $course_id, $question_id = 0) {
        global $wpdb;
        $course_id = (int) $course_id;
        if (!$course_id) return home_url('/panel/');

        // Belirli bir soru verildiyse O sorunun dersine git. (Aksi halde "en son
        // soru"ya bakılır ve eski bir soru yanıtlandığında yanlış derse götürürdü.)
        $key = '';
        if ($question_id) {
            $key = (string) $wpdb->get_var($wpdb->prepare(
                "SELECT lesson_key FROM {$wpdb->prefix}oes_questions WHERE id = %d", (int) $question_id));
        }
        if ($key === '') {
            // Sohbet tipi akışta (eğitmen paneli) tek soru bilinmez → en son soru
            $key = (string) $wpdb->get_var($wpdb->prepare(
                "SELECT lesson_key FROM {$wpdb->prefix}oes_questions
                  WHERE user_id = %d AND course_id = %d AND lesson_key IS NOT NULL AND lesson_key <> ''
                  ORDER BY created_at DESC LIMIT 1", (int) $user_id, $course_id));
        }

        $args = array('oes-player' => $course_id);
        if ($key && strpos($key, '_') !== false) {
            list($s, $l) = array_map('intval', explode('_', $key, 2));
            $args['section'] = $s;
            $args['lesson']  = $l;
        }
        return add_query_arg($args, home_url('/kurs-izle/'));
    }
    
    /**
     * Admin için chat mesajlarını getir (polling)
     */
    public function admin_get_chat_messages() {
        check_ajax_referer('oes_admin_answer', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $user_id = intval($_POST['user_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        
        if (!$user_id || !$course_id) {
            wp_send_json_error('Eksik bilgi');
        }
        
        global $wpdb;
        
        // Tüm mesajları al
        $questions = $wpdb->get_results($wpdb->prepare("
            SELECT q.id, q.question_text as content, q.created_at, 'student' as type, u.display_name
            FROM {$wpdb->prefix}oes_questions q
            LEFT JOIN {$wpdb->users} u ON q.user_id = u.ID
            WHERE q.user_id = %d AND q.course_id = %d
            ORDER BY q.created_at ASC
        ", $user_id, $course_id));
        
        $all_messages = array();
        foreach ($questions as $q) {
            $all_messages[] = array(
                'content' => $q->content,
                'created_at' => $q->created_at,
                'type' => 'student',
                'display_name' => $q->display_name
            );
            
            // Bu sorunun cevapları
            $answers = $wpdb->get_results($wpdb->prepare("
                SELECT a.answer as content, a.created_at, a.is_instructor, u.display_name
                FROM {$wpdb->prefix}oes_question_answers a
                LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
                WHERE a.question_id = %d
                ORDER BY a.created_at ASC
            ", $q->id));
            
            foreach ($answers as $a) {
                $all_messages[] = array(
                    'content' => $a->content,
                    'created_at' => $a->created_at,
                    'type' => $a->is_instructor ? 'instructor' : 'student',
                    'display_name' => $a->display_name
                );
            }
        }
        
        // Tarihe göre sırala
        usort($all_messages, function($a, $b) {
            return strtotime($a['created_at']) - strtotime($b['created_at']);
        });
        
        wp_send_json_success($all_messages);
    }
    
    /**
     * Sohbeti okundu olarak işaretle
     */
    public function admin_mark_read() {
        check_ajax_referer('oes_admin_answer', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $user_id = intval($_POST['user_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        
        if (!$user_id || !$course_id) {
            wp_send_json_error('Eksik bilgi');
        }
        
        global $wpdb;
        
        // Bu sohbetteki tüm soruları "answered" yap
        $wpdb->query($wpdb->prepare("
            UPDATE {$wpdb->prefix}oes_questions 
            SET status = 'answered' 
            WHERE user_id = %d AND course_id = %d
        ", $user_id, $course_id));
        
        wp_send_json_success();
    }
    
    /**
     * Sohbeti sil
     */
    public function admin_delete_chat() {
        check_ajax_referer('oes_admin_answer', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        $user_id = intval($_POST['user_id'] ?? 0);
        $course_id = intval($_POST['course_id'] ?? 0);
        
        if (!$user_id || !$course_id) {
            wp_send_json_error('Eksik bilgi');
        }
        
        global $wpdb;
        
        // Önce soruların ID'lerini al
        $question_ids = $wpdb->get_col($wpdb->prepare("
            SELECT id FROM {$wpdb->prefix}oes_questions 
            WHERE user_id = %d AND course_id = %d
        ", $user_id, $course_id));
        
        if (!empty($question_ids)) {
            $ids_placeholder = implode(',', array_fill(0, count($question_ids), '%d'));
            
            // Cevapları sil
            $wpdb->query($wpdb->prepare(
                "DELETE FROM {$wpdb->prefix}oes_question_answers WHERE question_id IN ($ids_placeholder)",
                $question_ids
            ));
            
            // Soruları sil
            $wpdb->query($wpdb->prepare(
                "DELETE FROM {$wpdb->prefix}oes_questions WHERE id IN ($ids_placeholder)",
                $question_ids
            ));
        }
        
        wp_send_json_success();
    }
    
    /**
     * Bekleyen soru sayısını getir (polling için)
     */
    public function admin_get_pending_count() {
        check_ajax_referer('oes_admin_answer', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok');
        }
        
        global $wpdb;
        
        $counts = $wpdb->get_row("
            SELECT 
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                COUNT(*) as total
            FROM {$wpdb->prefix}oes_questions
        ");
        
        wp_send_json_success(array(
            'pending' => intval($counts->pending ?? 0),
            'total' => intval($counts->total ?? 0)
        ));
    }
    
    /**
     * Yeni soru için admin bildirimi
     */
    private function notify_admin_new_question($question_id, $course_id, $user_id, $question) {
        // Yeni mail sistemini kullan
        if (class_exists('OES_Mail_System')) {
            $mailer = OES_Mail_System::instance();
            $mailer->send_question_asked_notification($question_id);
        }
    }
    
    /**
     * Admin sayfası
     */
    public function render_admin_page() {
        global $wpdb;
        
        // Cevap gönderme
        if (isset($_POST['oes_answer_question']) && wp_verify_nonce($_POST['_wpnonce'], 'oes_answer_question')) {
            $question_id = intval($_POST['question_id']);
            $answer = sanitize_textarea_field($_POST['answer']);
            
            if ($question_id && $answer) {
                $wpdb->insert(
                    $wpdb->prefix . 'oes_question_answers',
                    array(
                        'question_id' => $question_id,
                        'user_id' => get_current_user_id(),
                        'answer' => $answer,
                        'created_at' => current_time('mysql')
                    )
                );
                
                // Soru durumunu güncelle
                $wpdb->update(
                    $wpdb->prefix . 'oes_questions',
                    array('status' => 'answered'),
                    array('id' => $question_id)
                );
                
                // Öğrenciye bildirim gönder - Yeni mail sistemini kullan
                if (class_exists('OES_Mail_System')) {
                    $mailer = OES_Mail_System::instance();
                    $mailer->send_question_answered_notification($question_id, $answer);
                }
                // PUSH (bu yol da atlanıyordu — bkz. fire_answered_push)
                self::fire_answered_push($question_id, $answer);

                // Aynı chat'e geri dön
                $question = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_questions WHERE id = %d", $question_id));
                if ($question) {
                    $chat_id = $question->user_id . '_' . $question->course_id;
                    wp_redirect(admin_url('admin.php?page=oes-questions&chat=' . urlencode($chat_id)));
                    exit;
                }
            }
        }
        
        // Aktif sohbet (user_id + course_id kombinasyonu)
        $active_chat = isset($_GET['chat']) ? sanitize_text_field($_GET['chat']) : '';
        
        // Filtre
        $status = isset($_GET['status']) ? sanitize_text_field($_GET['status']) : 'all';
        
        // Sohbetleri grupla (user_id + course_id = bir sohbet)
        if ($status !== 'all') {
            $chats = $wpdb->get_results($wpdb->prepare("
                SELECT 
                    CONCAT(q.user_id, '_', q.course_id) as chat_id,
                    q.user_id,
                    q.course_id,
                    u.display_name,
                    u.user_email,
                    p.post_title as course_name,
                    (SELECT au.display_name FROM {$wpdb->users} au WHERE au.ID = p.post_author) as teacher_name,
                    COUNT(q.id) as message_count,
                    MAX(q.created_at) as last_activity,
                    SUM(CASE WHEN q.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                    (SELECT question_text FROM {$wpdb->prefix}oes_questions WHERE user_id = q.user_id AND course_id = q.course_id ORDER BY created_at DESC LIMIT 1) as last_message
                FROM {$wpdb->prefix}oes_questions q
                LEFT JOIN {$wpdb->users} u ON q.user_id = u.ID
                LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
                WHERE q.status = %s
                GROUP BY q.user_id, q.course_id
                ORDER BY last_activity DESC
            ", $status));
        } else {
            $chats = $wpdb->get_results("
                SELECT 
                    CONCAT(q.user_id, '_', q.course_id) as chat_id,
                    q.user_id,
                    q.course_id,
                    u.display_name,
                    u.user_email,
                    p.post_title as course_name,
                    (SELECT au.display_name FROM {$wpdb->users} au WHERE au.ID = p.post_author) as teacher_name,
                    COUNT(q.id) as message_count,
                    MAX(q.created_at) as last_activity,
                    SUM(CASE WHEN q.status = 'pending' THEN 1 ELSE 0 END) as pending_count,
                    (SELECT question_text FROM {$wpdb->prefix}oes_questions sq WHERE sq.user_id = q.user_id AND sq.course_id = q.course_id ORDER BY sq.created_at DESC LIMIT 1) as last_message
                FROM {$wpdb->prefix}oes_questions q
                LEFT JOIN {$wpdb->users} u ON q.user_id = u.ID
                LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
                GROUP BY q.user_id, q.course_id
                ORDER BY last_activity DESC
            ");
        }
        
        $counts = $wpdb->get_row("
            SELECT 
                (SELECT COUNT(DISTINCT CONCAT(user_id, '_', course_id)) FROM {$wpdb->prefix}oes_questions WHERE status = 'pending') as pending,
                (SELECT COUNT(DISTINCT CONCAT(user_id, '_', course_id)) FROM {$wpdb->prefix}oes_questions WHERE status = 'answered') as answered,
                COUNT(DISTINCT CONCAT(user_id, '_', course_id)) as total
            FROM {$wpdb->prefix}oes_questions
        ");
        
        // Aktif sohbet detayı
        $active_chat_info = null;
        $last_question    = 0; // sohbet seçili değilken de tanımlı olmalı (JS'e basılıyor)
        $chat_messages = array();
        if ($active_chat) {
            $parts = explode('_', $active_chat, 2);
            if (count($parts) >= 2) {
                $chat_user_id = intval($parts[0]);
                $chat_course_id = intval($parts[1]);
                
                // Sohbet bilgisi
                $active_chat_info = $wpdb->get_row($wpdb->prepare("
                    SELECT q.user_id, q.course_id,
                           u.display_name, u.user_email, p.post_title as course_name,
                           (SELECT au.display_name FROM {$wpdb->users} au WHERE au.ID = p.post_author) as teacher_name
                    FROM {$wpdb->prefix}oes_questions q
                    LEFT JOIN {$wpdb->users} u ON q.user_id = u.ID
                    LEFT JOIN {$wpdb->posts} p ON q.course_id = p.ID
                    WHERE q.user_id = %d AND q.course_id = %d
                    LIMIT 1
                ", $chat_user_id, $chat_course_id));
                
                // Tüm mesajları al (sorular + cevaplar birlikte, kronolojik sırada)
                $questions = $wpdb->get_results($wpdb->prepare("
                    SELECT q.id, q.question_text as content, q.created_at, 'student' as type, q.user_id, q.lesson_title, u.display_name
                    FROM {$wpdb->prefix}oes_questions q
                    LEFT JOIN {$wpdb->users} u ON q.user_id = u.ID
                    WHERE q.user_id = %d AND q.course_id = %d
                    ORDER BY q.created_at ASC
                ", $chat_user_id, $chat_course_id));
                
                // Her sorunun cevaplarını da al
                $all_messages = array();
                foreach ($questions as $q) {
                    $all_messages[] = (object) array(
                        'content' => $q->content,
                        'created_at' => $q->created_at,
                        'type' => 'student',
                        'display_name' => $q->display_name,
                        'question_id' => $q->id,
                        'lesson_title' => $q->lesson_title
                    );
                    
                    // Bu sorunun cevapları
                    $answers = $wpdb->get_results($wpdb->prepare("
                        SELECT a.answer as content, a.created_at, a.is_instructor, u.display_name
                        FROM {$wpdb->prefix}oes_question_answers a
                        LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
                        WHERE a.question_id = %d
                        ORDER BY a.created_at ASC
                    ", $q->id));
                    
                    foreach ($answers as $a) {
                        $all_messages[] = (object) array(
                            'content' => $a->content,
                            'created_at' => $a->created_at,
                            'type' => $a->is_instructor ? 'instructor' : 'student',
                            'display_name' => $a->display_name,
                            'lesson_title' => null
                        );
                    }
                }
                
                // Tarihe göre sırala
                usort($all_messages, function($a, $b) {
                    return strtotime($a->created_at) - strtotime($b->created_at);
                });
                
                $chat_messages = $all_messages;
                
                // Son soruyu bul (cevap göndermek için)
                $last_question = $wpdb->get_var($wpdb->prepare("
                    SELECT id FROM {$wpdb->prefix}oes_questions 
                    WHERE user_id = %d AND course_id = %d
                    ORDER BY created_at DESC LIMIT 1
                ", $chat_user_id, $chat_course_id));
            }
        }
        
        ?>
        <div class="wrap"><div class="fabo-wrap">
        <div class="fabo-head">
            <div>
                <h1>Soru &amp; Cevap</h1>
                <p>
                    <?php echo $counts->pending > 0
                        ? '<strong>' . intval($counts->pending) . ' soru</strong> yanıt bekliyor.'
                        : 'Tüm sorular yanıtlanmış.'; ?>
                    Sohbetler kişi ve eğitim bazında gruplanır. Eğitmenler bu soruları kendi panellerinde de görür.
                </p>
            </div>
        </div>
        <style>
            .oes-chat-app{display:flex;height:calc(100vh - 120px);max-height:600px;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);margin:20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:13px}
            
            /* Sol Panel */
            .oes-chat-sidebar{width:280px;border-right:1px solid #e5e7eb;display:flex;flex-direction:column}
            .oes-chat-sidebar-header{padding:12px 14px;border-bottom:1px solid #e5e7eb}
            .oes-chat-sidebar-header h2{margin:0;font-size:15px;color:#1f2937;font-weight:600}
            .oes-chat-sidebar-header p{display:none}
            .oes-chat-filters{display:flex;gap:4px;padding:8px 10px;border-bottom:1px solid #e5e7eb;background:#f9fafb}
            .oes-chat-filter{padding:4px 10px;border-radius:4px;font-size:11px;text-decoration:none;color:#6b7280;background:#fff;border:1px solid #e5e7eb}
            .oes-chat-filter:hover{background:#f3f4f6;color:#374151}
            .oes-chat-filter.active{background:var(--oes-p, #1E4D7B);color:#fff;border-color:var(--oes-p, #1E4D7B)}
            .oes-chat-filter .count{opacity:.8}
            .oes-chat-list{flex:1;overflow-y:auto}
            .oes-chat-item{display:flex;gap:10px;padding:10px 12px;border-bottom:1px solid #f3f4f6;cursor:pointer;text-decoration:none}
            .oes-chat-item:hover{background:#f9fafb}
            .oes-chat-item.active{background:#eff8fe;border-left:3px solid var(--oes-a, #5DB9E8)}
            .oes-chat-item.unread{background:#fffbeb}
            .oes-chat-avatar{width:36px;height:36px;border-radius:50%;background:var(--oes-p, #1E4D7B);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:14px;flex-shrink:0}
            .oes-chat-item-info{flex:1;min-width:0}
            .oes-chat-item-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:2px}
            .oes-chat-item-name{font-weight:600;font-size:13px;color:#1f2937}
            .oes-chat-item-time{font-size:10px;color:#9ca3af}
            .oes-chat-item-preview{font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
            .oes-chat-item-course{font-size:10px;color:#10b981;margin-top:2px}
            .oes-chat-item-badge{width:6px;height:6px;background:#f59e0b;border-radius:50%;flex-shrink:0;margin-top:4px}
            .oes-chat-empty-list{padding:30px 15px;text-align:center;color:#9ca3af;font-size:12px}
            
            /* Sağ Panel */
            .oes-chat-main{flex:1;display:flex;flex-direction:column;background:#f9fafb}
            .oes-chat-main-header{padding:10px 14px;background:#fff;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:10px}
            .oes-chat-main-avatar{width:32px;height:32px;border-radius:50%;background:#10b981;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:13px}
            .oes-chat-main-info{flex:1}
            .oes-chat-main-name{font-weight:600;font-size:13px;color:#1f2937}
            .oes-chat-main-name span{font-weight:400;color:#9ca3af;font-size:11px}
            .oes-chat-main-course{font-size:11px;color:#6b7280}
            
            .oes-chat-messages{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:8px}
            .oes-chat-msg{max-width:65%;display:flex;flex-direction:column}
            .oes-chat-msg.student{align-self:flex-start}
            .oes-chat-msg.instructor{align-self:flex-end}
            .oes-chat-bubble{padding:8px 12px;border-radius:12px;font-size:13px;line-height:1.4}
            .oes-chat-msg.student .oes-chat-bubble{background:#fff;border:1px solid #e5e7eb;border-radius:12px 12px 12px 2px}
            .oes-chat-msg.instructor .oes-chat-bubble{background:#10b981;color:#fff;border-radius:12px 12px 2px 12px}
            .oes-chat-msg-sender{font-size:10px;font-weight:500;margin-bottom:2px;color:#9ca3af}
            .oes-chat-msg.instructor .oes-chat-msg-sender{text-align:right;color:#10b981}
            .oes-chat-msg-lesson{display:inline-block;background:#f0fdf4;color:#16a34a;padding:2px 6px;border-radius:4px;font-size:9px;margin-left:6px}
            .oes-chat-msg-time{font-size:9px;color:#9ca3af;margin-top:2px}
            .oes-chat-msg.instructor .oes-chat-msg-time{text-align:right}
            
            .oes-chat-input-wrap{padding:10px 14px;background:#fff;border-top:1px solid #e5e7eb}
            .oes-chat-input-form{display:flex;gap:8px;align-items:center}
            .oes-chat-input-form textarea{flex:1;padding:8px 14px;border:1px solid #e5e7eb;border-radius:20px;font-size:13px;resize:none;font-family:inherit;line-height:1.4;height:36px;max-height:80px}
            .oes-chat-input-form textarea:focus{outline:none;border-color:#10b981}
            .oes-chat-send-btn{width:36px;height:36px;background:#10b981;border:none;border-radius:50%;cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center}
            .oes-chat-send-btn:hover{background:#059669}
            .oes-chat-send-btn svg{width:16px;height:16px}
            
            .oes-chat-actions{display:flex;gap:6px}
            .oes-chat-action{padding:6px 12px;border:1px solid #e5e7eb;border-radius:6px;font-size:11px;cursor:pointer;background:#fff;color:#6b7280;display:flex;align-items:center;gap:4px}
            .oes-chat-action:hover{background:#f3f4f6}
            .oes-chat-action.read{color:#10b981;border-color:#10b981}
            .oes-chat-action.read:hover{background:#ecfdf5}
            .oes-chat-action.delete{color:#ef4444;border-color:#ef4444}
            .oes-chat-action.delete:hover{background:#fef2f2}
            
            .oes-chat-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#9ca3af}
            .oes-chat-empty svg{width:40px;height:40px;margin-bottom:10px;opacity:.4}
            .oes-chat-empty p{margin:0;font-size:13px}
            .oes-chat-empty span{font-size:11px;opacity:.7}
            
            @media(max-width:768px){.oes-chat-sidebar{width:240px}}

            /* --- Ortak panel tasarımına uyum (Fabrika Okulu paleti) --- */
            .fabo-wrap .oes-chat-app{margin:0;border:1px solid #e3e8ef;border-radius:14px;
                box-shadow:0 1px 2px rgba(20,43,86,.04);max-height:640px;height:calc(100vh - 210px);}
            .fabo-wrap .oes-chat-avatar{background:#194977}
            .fabo-wrap .oes-chat-item.active{background:#eef4fa;border-left-color:#194977}
            .fabo-wrap .oes-chat-item-course{color:#2a7aa3}
            .fabo-wrap .oes-chat-filter.active{background:#194977;border-color:#194977}
            .fabo-wrap .oes-chat-item-badge{background:#d1493d}
        </style>

        <div class="oes-chat-app">
            <!-- Sol Panel - Sohbet Listesi -->
            <div class="oes-chat-sidebar">
                <div class="oes-chat-sidebar-header">
                    <h2>💬 Öğrenci Soruları</h2>
                    <p>Kurs içi sohbetler</p>
                </div>
                <div class="oes-chat-filters">
                    <a href="?page=oes-questions&status=all" class="oes-chat-filter <?php echo $status==='all'?'active':''; ?>">Tümü<span class="count">(<?php echo intval($counts->total ?? 0); ?>)</span></a>
                    <a href="?page=oes-questions&status=pending" class="oes-chat-filter <?php echo $status==='pending'?'active':''; ?>">Bekleyen<span class="count">(<?php echo intval($counts->pending ?? 0); ?>)</span></a>
                    <a href="?page=oes-questions&status=answered" class="oes-chat-filter <?php echo $status==='answered'?'active':''; ?>">Cevaplı<span class="count">(<?php echo intval($counts->answered ?? 0); ?>)</span></a>
                </div>
                <div class="oes-chat-list">
                    <?php if (empty($chats)): ?>
                    <div class="oes-chat-empty-list">
                        <p>Henüz soru yok</p>
                    </div>
                    <?php else: ?>
                    <?php foreach ($chats as $chat): ?>
                    <a href="?page=oes-questions&status=<?php echo $status; ?>&chat=<?php echo esc_attr($chat->chat_id); ?>" class="oes-chat-item <?php echo $active_chat == $chat->chat_id ? 'active' : ''; ?> <?php echo $chat->pending_count > 0 ? 'unread' : ''; ?>" style="text-decoration:none">
                        <div class="oes-chat-avatar"><?php echo strtoupper(mb_substr($chat->display_name ?: 'U', 0, 1)); ?></div>
                        <div class="oes-chat-item-info">
                            <div class="oes-chat-item-top">
                                <span class="oes-chat-item-name"><?php echo esc_html($chat->display_name ?: 'Kullanıcı'); ?></span>
                                <span class="oes-chat-item-time"><?php echo human_time_diff(strtotime($chat->last_activity), current_time('timestamp')); ?></span>
                            </div>
                            <div class="oes-chat-item-preview"><?php echo esc_html(mb_substr($chat->last_message ?: '', 0, 50)); ?><?php echo mb_strlen($chat->last_message ?: '') > 50 ? '...' : ''; ?></div>
                            <div class="oes-chat-item-course"><?php echo esc_html($chat->course_name); ?><?php if (!empty($chat->teacher_name)): ?> · <span style="color:#7c3aed;">👨‍🏫 <?php echo esc_html($chat->teacher_name); ?></span><?php endif; ?></div>
                        </div>
                        <?php if ($chat->pending_count > 0): ?>
                        <div class="oes-chat-item-badge" title="<?php echo $chat->pending_count; ?> bekleyen mesaj"></div>
                        <?php endif; ?>
                    </a>
                    <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
            
            <!-- Sağ Panel - Sohbet Detay -->
            <div class="oes-chat-main">
                <?php if ($active_chat_info): ?>
                <div class="oes-chat-main-header">
                    <div class="oes-chat-main-avatar"><?php echo strtoupper(mb_substr($active_chat_info->display_name ?: 'U', 0, 1)); ?></div>
                    <div class="oes-chat-main-info">
                        <div class="oes-chat-main-name"><?php echo esc_html($active_chat_info->display_name); ?> <span>• <?php echo esc_html($active_chat_info->user_email); ?></span></div>
                        <div class="oes-chat-main-course"><?php echo esc_html($active_chat_info->course_name); ?><?php if (!empty($active_chat_info->teacher_name)): ?> · Eğitmen: <b><?php echo esc_html($active_chat_info->teacher_name); ?></b><?php endif; ?></div>
                    </div>
                    <div class="oes-chat-actions">
                        <button type="button" class="oes-chat-action read" id="markReadBtn" title="Okundu olarak işaretle">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
                            Okundu
                        </button>
                        <button type="button" class="oes-chat-action delete" id="deleteChatBtn" title="Sohbeti sil">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                            Sil
                        </button>
                    </div>
                </div>
                
                <div class="oes-chat-messages" id="chatMessages">
                    <?php foreach ($chat_messages as $msg): ?>
                    <div class="oes-chat-msg <?php echo $msg->type; ?>">
                        <div class="oes-chat-msg-sender">
                            <?php echo $msg->type === 'instructor' ? 'Siz' : esc_html($msg->display_name); ?>
                            <?php if (!empty($msg->lesson_title)): ?>
                            <span class="oes-chat-msg-lesson">📚 <?php echo esc_html($msg->lesson_title); ?></span>
                            <?php endif; ?>
                        </div>
                        <div class="oes-chat-bubble"><?php echo nl2br(esc_html($msg->content)); ?></div>
                        <div class="oes-chat-msg-time"><?php echo date_i18n('d M Y H:i', strtotime($msg->created_at)); ?></div>
                    </div>
                    <?php endforeach; ?>
                </div>
                
                <div class="oes-chat-input-wrap">
                    <div class="oes-chat-input-form">
                        <textarea id="chatInput" placeholder="Cevabınızı yazın..." required></textarea>
                        <button type="button" id="chatSendBtn" class="oes-chat-send-btn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                        </button>
                    </div>
                </div>
                
                <?php else: ?>
                <div class="oes-chat-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <p>Bir sohbet seçin</p>
                    <span>Sol taraftan bir sohbet seçerek başlayın</span>
                </div>
                <?php endif; ?>
            </div>
        </div>
        </div></div><?php // /.fabo-wrap /.wrap ?>

        <script>
        document.addEventListener('DOMContentLoaded', function(){
            var msgs = document.getElementById('chatMessages');
            var input = document.getElementById('chatInput');
            var sendBtn = document.getElementById('chatSendBtn');
            var markReadBtn = document.getElementById('markReadBtn');
            var deleteChatBtn = document.getElementById('deleteChatBtn');
            var questionId = <?php echo $last_question ?: 0; ?>;
            var chatUserId = <?php echo $active_chat_info ? $active_chat_info->user_id : 0; ?>;
            var chatCourseId = <?php echo $active_chat_info ? $active_chat_info->course_id : 0; ?>;
            var lastMsgCount = <?php echo count($chat_messages); ?>;
            var ajaxUrl = '<?php echo admin_url("admin-ajax.php"); ?>';
            var nonce = '<?php echo wp_create_nonce("oes_admin_answer"); ?>';
            var currentStatus = '<?php echo $status; ?>';
            
            if(msgs) msgs.scrollTop = msgs.scrollHeight;
            
            // Okundu olarak işaretle
            if(markReadBtn){
                markReadBtn.addEventListener('click', function(){
                    if(!chatUserId) return;
                    
                    var fd = new FormData();
                    fd.append('action', 'oes_admin_mark_read');
                    fd.append('user_id', chatUserId);
                    fd.append('course_id', chatCourseId);
                    fd.append('nonce', nonce);
                    
                    fetch(ajaxUrl, {method:'POST', body:fd})
                    .then(function(r){ return r.json(); })
                    .then(function(d){
                        if(d.success){
                            // Sol paneli güncelle
                            var activeItem = document.querySelector('.oes-chat-item.active');
                            if(activeItem){
                                activeItem.classList.remove('unread');
                                var badge = activeItem.querySelector('.oes-chat-item-badge');
                                if(badge) badge.remove();
                            }
                            updatePendingCount(-1);
                            markReadBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> Okundu ✓';
                            markReadBtn.disabled = true;
                        }
                    });
                });
            }
            
            // Sohbeti sil
            if(deleteChatBtn){
                deleteChatBtn.addEventListener('click', function(){
                    if(!chatUserId) return;
                    if(!confirm('Bu sohbeti silmek istediğinize emin misiniz? Tüm mesajlar silinecek.')) return;
                    
                    var fd = new FormData();
                    fd.append('action', 'oes_admin_delete_chat');
                    fd.append('user_id', chatUserId);
                    fd.append('course_id', chatCourseId);
                    fd.append('nonce', nonce);
                    
                    fetch(ajaxUrl, {method:'POST', body:fd})
                    .then(function(r){ return r.json(); })
                    .then(function(d){
                        if(d.success){
                            window.location.href = '?page=oes-questions&status=' + currentStatus;
                        }else{
                            alert(d.data || 'Hata oluştu');
                        }
                    });
                });
            }
            
            if(input){
                // Auto resize
                input.addEventListener('input', function(){
                    this.style.height = '36px';
                    this.style.height = Math.min(this.scrollHeight, 80) + 'px';
                });
                
                // Enter ile gönder
                input.addEventListener('keydown', function(e){
                    if(e.key === 'Enter' && !e.shiftKey){
                        e.preventDefault();
                        sendMessage();
                    }
                });
            }
            
            if(sendBtn){
                sendBtn.addEventListener('click', sendMessage);
            }
            
            function sendMessage(){
                var text = input.value.trim();
                if(!text || !questionId) return;
                
                // Butonu devre dışı bırak
                sendBtn.disabled = true;
                
                // Mesajı hemen ekrana ekle
                var now = new Date();
                var timeStr = now.toLocaleDateString('tr-TR', {day:'numeric',month:'short'}) + ' ' + now.toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'});
                
                var msgDiv = document.createElement('div');
                msgDiv.className = 'oes-chat-msg instructor';
                msgDiv.innerHTML = '<div class="oes-chat-msg-sender">Siz</div><div class="oes-chat-bubble">' + text.replace(/\n/g,'<br>') + '</div><div class="oes-chat-msg-time">' + timeStr + '</div>';
                msgs.appendChild(msgDiv);
                msgs.scrollTop = msgs.scrollHeight;
                lastMsgCount++;
                
                // Input'u temizle
                input.value = '';
                input.style.height = '36px';
                
                // AJAX ile gönder
                var fd = new FormData();
                fd.append('action', 'oes_admin_answer_question');
                fd.append('question_id', questionId);
                fd.append('answer', text);
                fd.append('nonce', nonce);
                
                fetch(ajaxUrl, {
                    method: 'POST',
                    body: fd
                })
                .then(function(r){ return r.json(); })
                .then(function(d){
                    sendBtn.disabled = false;
                    if(d.success){
                        // Sol paneldeki aktif chat'in badge'ini kaldır
                        var activeItem = document.querySelector('.oes-chat-item.active');
                        if(activeItem){
                            activeItem.classList.remove('unread');
                            var badge = activeItem.querySelector('.oes-chat-item-badge');
                            if(badge) badge.remove();
                        }
                        // Bekleyen sayısını güncelle
                        updatePendingCount(-1);
                    }else{
                        alert(d.data || 'Hata oluştu');
                        msgDiv.remove();
                        lastMsgCount--;
                    }
                })
                .catch(function(){
                    sendBtn.disabled = false;
                    alert('Bağlantı hatası');
                    msgDiv.remove();
                    lastMsgCount--;
                });
            }
            
            // Bekleyen sayısını güncelle
            function updatePendingCount(change){
                var pendingFilter = document.querySelector('.oes-chat-filter[href*="status=pending"] .count');
                var allFilter = document.querySelector('.oes-chat-filter[href*="status=all"] .count');
                var answeredFilter = document.querySelector('.oes-chat-filter[href*="status=answered"] .count');
                
                if(pendingFilter){
                    var current = parseInt(pendingFilter.textContent.replace(/[()]/g,'')) || 0;
                    var newVal = Math.max(0, current + change);
                    pendingFilter.textContent = '(' + newVal + ')';
                }
                if(answeredFilter && change < 0){
                    var current = parseInt(answeredFilter.textContent.replace(/[()]/g,'')) || 0;
                    answeredFilter.textContent = '(' + (current + 1) + ')';
                }
            }
            
            // Yeni mesaj kontrolü (polling) - sadece aktif chat varsa
            if(chatUserId && chatCourseId){
                setInterval(checkNewMessages, 10000);
            }
            
            function checkNewMessages(){
                var fd = new FormData();
                fd.append('action', 'oes_admin_get_chat_messages');
                fd.append('user_id', chatUserId);
                fd.append('course_id', chatCourseId);
                // NOT: 'lesson_key' gönderiliyordu ama böyle bir değişken hiç tanımlı
                // değildi (ReferenceError) → yeni mesaj yoklaması her seferinde
                // patlıyordu. Sunucu (admin_get_chat_messages) zaten yalnızca
                // user_id + course_id okuyor.
                fd.append('nonce', nonce);
                
                fetch(ajaxUrl, {
                    method: 'POST',
                    body: fd
                })
                .then(function(r){ return r.json(); })
                .then(function(d){
                    if(d.success && d.data){
                        var newCount = d.data.length;
                        if(newCount > lastMsgCount){
                            // Yeni mesajları ekle
                            var newMsgs = d.data.slice(lastMsgCount);
                            newMsgs.forEach(function(m){
                                if(m.type === 'student'){
                                    addMessage(m.content, 'student', m.display_name, m.created_at);
                                }
                            });
                            lastMsgCount = newCount;
                        }
                    }
                });
            }
            
            function addMessage(text, type, sender, time){
                var now = new Date(time);
                var timeStr = now.toLocaleDateString('tr-TR', {day:'numeric',month:'short'}) + ' ' + now.toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'});
                
                var msgDiv = document.createElement('div');
                msgDiv.className = 'oes-chat-msg ' + type;
                msgDiv.innerHTML = '<div class="oes-chat-msg-sender">' + sender + '</div><div class="oes-chat-bubble">' + text.replace(/\n/g,'<br>') + '</div><div class="oes-chat-msg-time">' + timeStr + '</div>';
                msgs.appendChild(msgDiv);
                msgs.scrollTop = msgs.scrollHeight;
            }
            
            // Yeni sohbet kontrolü (tüm sayfa için) - her 15 saniyede
            var initialPendingCount = <?php echo intval($counts->pending ?? 0); ?>;
            setInterval(checkNewChats, 15000);
            
            function checkNewChats(){
                var fd = new FormData();
                fd.append('action', 'oes_admin_get_pending_count');
                fd.append('nonce', nonce);
                
                fetch(ajaxUrl, {method:'POST', body:fd})
                .then(function(r){ return r.json(); })
                .then(function(d){
                    if(d.success && d.data.pending > initialPendingCount){
                        // Yeni soru var - sayfayı yenile veya bildirim göster
                        var diff = d.data.pending - initialPendingCount;
                        initialPendingCount = d.data.pending;
                        
                        // Header'da bildirim göster
                        showNewChatNotification(diff);
                        
                        // Sayaçları güncelle
                        var pendingFilter = document.querySelector('.oes-chat-filter[href*="status=pending"] .count');
                        var allFilter = document.querySelector('.oes-chat-filter[href*="status=all"] .count');
                        if(pendingFilter) pendingFilter.textContent = '(' + d.data.pending + ')';
                        if(allFilter) allFilter.textContent = '(' + d.data.total + ')';
                    }
                });
            }
            
            function showNewChatNotification(count){
                // Varsa eski bildirimi kaldır
                var old = document.getElementById('newChatNotif');
                if(old) old.remove();
                
                var notif = document.createElement('div');
                notif.id = 'newChatNotif';
                notif.style.cssText = 'position:fixed;top:50px;right:20px;background:#10b981;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;z-index:9999;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.15);animation:slideIn .3s ease';
                notif.innerHTML = '🔔 ' + count + ' yeni soru geldi! <span style="opacity:.7;margin-left:8px">Tıkla</span>';
                notif.onclick = function(){ location.reload(); };
                document.body.appendChild(notif);
                
                // 10 saniye sonra kaldır
                setTimeout(function(){ if(notif.parentNode) notif.remove(); }, 10000);
            }
        });
        </script>
        <style>
        @keyframes slideIn{from{transform:translateX(100px);opacity:0}to{transform:translateX(0);opacity:1}}
        </style>
        <?php
    }
}

// Başlat
OES_Questions::instance();