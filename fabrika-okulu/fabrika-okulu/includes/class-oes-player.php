<?php
/**
 * Kurs Player
 * Video izleme sayfası
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Player {

    /**
     * Eğitmen/yönetici önizlemesi mi? (kendi kursunu satın almadan izliyor)
     * Önizlemede: ilerleme YAZILMAZ, önkoşul kilidi uygulanmaz, süre damgası atılmaz.
     */
    public static $preview = false;

    public static function is_preview() { return self::$preview; }

    public function __construct() {
        add_action('init', array($this, 'add_rewrite_rules'));
        add_filter('query_vars', array($this, 'add_query_vars'));
        add_action('template_redirect', array($this, 'maybe_load_player'));
        
        // AJAX handlers
        add_action('wp_ajax_oes_mark_lesson_complete', array($this, 'mark_lesson_complete'));
        add_action('wp_ajax_oes_mark_lesson_incomplete', array($this, 'mark_lesson_incomplete'));
        add_action('wp_ajax_oes_get_lesson_video', array($this, 'get_lesson_video'));
        add_action('wp_ajax_oes_player_submit_quiz', array($this, 'player_submit_quiz'));
    }

    public function add_rewrite_rules() {
        add_rewrite_rule(
            'kurs-izle/?$',
            'index.php?oes-player=1',
            'top'
        );
    }

    public function add_query_vars($vars) {
        $vars[] = 'oes-player';
        $vars[] = 'section';
        $vars[] = 'lesson';
        return $vars;
    }

    public function maybe_load_player() {
        $course_id = isset($_GET['oes-player']) ? intval($_GET['oes-player']) : get_query_var('oes-player');
        if (!$course_id) return;

        // Kullanıcı giriş yapmış mı? Frontend ASLA wp-login'e gitmez —
        // kendi panel giriş ekranımıza (kursa geri dönüşle) yönlendir.
        if (!is_user_logged_in()) {
            $dest  = add_query_arg('oes-player', $course_id, home_url('/kurs-izle/'));
            $login = class_exists('OES_Panel')
                ? OES_Panel::instance()->panel_url()
                : home_url('/panel/');
            wp_safe_redirect(add_query_arg('r', rawurlencode($dest), $login));
            exit;
        }

        $user_id = get_current_user_id();

        // NOT: Anket artık yönlendirme yapmıyor; player normal açılır ve
        // player.php sonunda OES_Surveys::render_modal() üstüne modal basar.

        // Kursa erişim kontrolü - cache'li
        $completed_courses = OES_My_Account::get_user_completed_courses($user_id);
        $has_access = in_array($course_id, $completed_courses);

        // ÖNİZLEME: eğitmen (ve yönetici) kendi eğitimini satın almadan, öğrenci
        // gözüyle deneyebilsin — hatayı yayına almadan görsün. Önizlemede hiçbir
        // ilerleme yazılmaz ve önkoşul kilidi uygulanmaz (her içeriğe atlanabilir).
        self::$preview = (!$has_access && OES_Teacher::owns_course($user_id, $course_id));

        if (!$has_access && !self::$preview) {
            wp_redirect(get_permalink($course_id));
            exit;
        }

        // Esnek (dönemsiz) eğitimde göreli son teslimler SATIN ALMADAN değil,
        // öğrencinin kursu İLK AÇTIĞI andan başlar → o anı bir kez damgala.
        // Önizlemede damgalanmaz: eğitmenin bakması öğrencinin süresini başlatmaz.
        if (!self::$preview) self::stamp_course_started($user_id, $course_id);

        // Player template'ini yükle
        $this->render_player($course_id, $user_id);
        exit;
    }

    /**
     * Kursun ilk açılma anını kaydeder (yalnızca ilk kez; sonraki girişler değiştirmez).
     * Bu an, esnek eğitimlerde göreli son teslimlerin BAZIDIR (bkz. fabo_task_base).
     */
    public static function stamp_course_started($user_id, $course_id) {
        global $wpdb;
        $t = $wpdb->prefix . 'oes_enrollments';
        // Kolon eski kurulumlarda olmayabilir (migration 1.6) → sessizce atla
        static $has_col = null;
        if ($has_col === null) {
            $has_col = (bool) $wpdb->get_var($wpdb->prepare(
                "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                  WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s AND COLUMN_NAME = 'started_at'",
                DB_NAME, $t
            ));
        }
        if (!$has_col) return;

        $wpdb->query($wpdb->prepare(
            "UPDATE {$t} SET started_at = %s
              WHERE user_id = %d AND course_id = %d AND status = 'active' AND started_at IS NULL",
            current_time('mysql'), (int) $user_id, (int) $course_id
        ));
    }

    /**
     * Video URL'ini oynatıcı tanımlayıcısına çevir.
     * @return array ['type'=>'youtube|vimeo|file|none','id'=>'','url'=>'']
     */
    public static function parse_video($url) {
        $url = trim((string) $url);
        if ($url === '') return array('type' => 'none', 'id' => '', 'url' => '');
        if (preg_match('/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/', $url, $m) ||
            preg_match('/youtu\.be\/([a-zA-Z0-9_-]+)/', $url, $m) ||
            preg_match('/youtube\.com\/embed\/([a-zA-Z0-9_-]+)/', $url, $m)) {
            return array('type' => 'youtube', 'id' => $m[1], 'url' => $url);
        }
        if (preg_match('/vimeo\.com\/(?:video\/)?(\d+)/', $url, $m)) {
            return array('type' => 'vimeo', 'id' => $m[1], 'url' => $url);
        }
        if (preg_match('/\.(mp4|webm|ogg|m3u8)(\?.*)?$/i', $url)) {
            return array('type' => 'file', 'id' => '', 'url' => $url);
        }
        return array('type' => 'file', 'id' => '', 'url' => $url);
    }

    public function render_player($course_id, $user_id) {
        $product = wc_get_product($course_id);
        if (!$product) {
            wp_redirect(home_url());
            exit;
        }

        $curriculum = get_post_meta($course_id, '_oes_course_curriculum', true) ?: array();

        global $wpdb;
        $progress_data = $wpdb->get_results($wpdb->prepare(
            "SELECT lesson_id, status FROM {$wpdb->prefix}oes_progress WHERE user_id = %d AND course_id = %d",
            $user_id, $course_id
        ), OBJECT_K);

        // Toplam / tamamlanan ders
        // NOT: 'file' (ders dosyası) İLERLEMEYE DAHİL DEĞİLDİR — sayılmaz.
        // (Şablon bu değerleri $items üzerinden yeniden hesaplar; burada da tutarlı olsun.)
        $total_lessons = 0;
        foreach ($curriculum as $section) {
            if (empty($section['lessons'])) continue;
            foreach ($section['lessons'] as $l) {
                if (($l['type'] ?? 'video') === 'file') continue;
                $total_lessons++;
            }
        }
        $completed_lessons = 0;
        foreach ($progress_data as $p) { if ($p->status === 'complete') $completed_lessons++; }
        $progress_percent = $total_lessons > 0 ? round(($completed_lessons / $total_lessons) * 100) : 0;

        // Kurs sınavları (id ile eşlenir)
        $quizzes = array();
        if (OES_Module_Manager::is_active('quizzes')) {
            $qz = $wpdb->get_results($wpdb->prepare("
                SELECT q.*,
                       (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = q.id) as question_count,
                       (SELECT MAX(score) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d AND status='completed') as best_score,
                       (SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = q.id AND user_id = %d AND status IN ('completed','pending_review')) as attempt_count
                FROM {$wpdb->prefix}oes_quizzes q
                WHERE q.course_id = %d AND q.status = 'active'
                ORDER BY q.created_at ASC
            ", $user_id, $user_id, $course_id));
            foreach ($qz as $q) { $quizzes[intval($q->id)] = $q; }
        }

        // Kurs görevleri (assignments) — müfredat akışına eklenir
        $assignments = array();
        if (OES_Module_Manager::is_active('assignments')) {
            $assignments = $wpdb->get_results($wpdb->prepare("
                SELECT a.*, s.status as sub_status, s.score as sub_score
                FROM {$wpdb->prefix}oes_assignments a
                LEFT JOIN {$wpdb->prefix}oes_assignment_submissions s ON s.assignment_id = a.id AND s.user_id = %d
                WHERE a.course_id = %d AND a.status = 'active'
                ORDER BY a.id ASC
            ", $user_id, $course_id));

            // Görev son teslimi öğrenci bazında hesaplanır (TEK KAYNAK: fabo_task_due_ts).
            // Baz: dönemliyse dönem başlangıcı (saatiyle), esnekse kursu ilk açtığı an.
            // Bitiş, bazın SAATİNDE olur; baz saatsizse günün sonu (23:59).
            foreach ($assignments as $a) {
                $due_ts = fabo_task_due_ts($user_id, $course_id, $a->extra_days ?? 0);
                $a->due_date = $due_ts ? date('Y-m-d H:i:s', $due_ts) : null;
            }
        }

        // Aktif öğe tespiti: quiz / görev / video
        $active_type    = 'video';
        $active_quiz    = isset($_GET['quiz'])  ? intval($_GET['quiz'])  : 0;
        $active_assign  = isset($_GET['gorev']) ? intval($_GET['gorev']) : 0;
        $active_section = isset($_GET['section']) ? intval($_GET['section']) : -1;
        $active_lesson  = isset($_GET['lesson'])  ? intval($_GET['lesson'])  : -1;

        if ($active_quiz && isset($quizzes[$active_quiz])) {
            $active_type = 'quiz';
        } elseif ($active_assign) {
            $active_type = 'assign';
        } else {
            // Belirtilmemişse: kaldığı yer = ilk TAMAMLANMAMIŞ öğe.
            // Sınav ve görev tamamlanması oes_progress'te DEĞİL (sınav → attempts,
            // görev → submissions). Sadece progress'e bakınca alınmış sınav hep
            // "tamamlanmamış" görünüp resume ilk sınavda takılıyordu. Frontier ile
            // aynı done-tespitini kullan.
            if ($active_section === -1 || $active_lesson === -1) {
                $asub = array();
                foreach ($assignments as $a) { $asub[intval($a->id)] = $a->sub_status; }

                $found = false;
                foreach ($curriculum as $s_index => $section) {
                    if (empty($section['lessons'])) continue;
                    foreach ($section['lessons'] as $l_index => $lesson) {
                        $lt = $lesson['type'] ?? 'video';
                        // Dosya akışın parçası değil (tamamlanma kavramı yok) → resume onu atlar
                        if ($lt === 'file') continue;
                        if ($lt === 'quiz') {
                            $qid  = intval($lesson['quiz_id'] ?? 0);
                            $qz   = ($qid && isset($quizzes[$qid])) ? $quizzes[$qid] : null;
                            $done = $qz && ($qz->best_score !== null || intval($qz->attempt_count) > 0);
                        } elseif ($lt === 'assign') {
                            $aid  = intval($lesson['assignment_id'] ?? 0);
                            $done = $aid && !empty($asub[$aid]);
                        } else {
                            $key  = $s_index . '_' . $l_index;
                            $done = isset($progress_data[$key]) && $progress_data[$key]->status === 'complete';
                        }
                        if (!$done) {
                            $active_section = $s_index; $active_lesson = $l_index; $found = true;
                            if ($lt === 'quiz') { $active_type = 'quiz'; $active_quiz = intval($lesson['quiz_id'] ?? 0); }
                            elseif ($lt === 'assign') { $active_type = 'assign'; $active_assign = intval($lesson['assignment_id'] ?? 0); }
                            else { $active_type = 'video'; }
                            break 2;
                        }
                    }
                }
                if (!$found) {
                    // Hepsi tamamlanmış → akıştaki SON içeriği aç (dosyalar akış dışı, atlanır).
                    // Tip de son içeriğe göre ayarlanır; aksi halde son öğe sınav/görevken
                    // video sanılıp "video eklenmemiş" görünürdü.
                    $active_section = 0; $active_lesson = 0;
                    foreach ($curriculum as $s_index => $section) {
                        if (empty($section['lessons'])) continue;
                        foreach ($section['lessons'] as $l_index => $lesson) {
                            $lt = $lesson['type'] ?? 'video';
                            if ($lt === 'file') continue;
                            $active_section = $s_index; $active_lesson = $l_index;
                            if ($lt === 'quiz')        { $active_type = 'quiz';   $active_quiz   = intval($lesson['quiz_id'] ?? 0); $active_assign = 0; }
                            elseif ($lt === 'assign')  { $active_type = 'assign'; $active_assign = intval($lesson['assignment_id'] ?? 0); $active_quiz = 0; }
                            else                       { $active_type = 'video';  $active_quiz = 0; $active_assign = 0; }
                        }
                    }
                }
            }

            // Açıkça istenen ders bir DOSYA ise, video değil dosya görüntüleyicisi açılır.
            if (isset($curriculum[$active_section]['lessons'][$active_lesson])
                && ($curriculum[$active_section]['lessons'][$active_lesson]['type'] ?? 'video') === 'file') {
                $active_type = 'file';
            }
        }

        /* Dosya AÇILDI damgası.
           Dosyalar sırada yer alır (üstündeki içerik bitmeden açılamaz) ama
           İLERLEMEYE SAYILMAZ. Açılır açılmaz sonraki içeriğin kilidi düşsün diye
           damga, kilit sınırı (frontier) hesaplanmadan ÖNCE atılır ve elimizdeki
           $progress_data'ya da eklenir — aksi halde öğrencinin bir kez daha
           yenilemesi gerekirdi. */
        if ($active_type === 'file' && $active_section >= 0 && $active_lesson >= 0) {
            $fkey = $active_section . '_' . $active_lesson;
            if (!self::$preview) self::stamp_file_opened($course_id, $user_id, $fkey);
            if (!isset($progress_data[$fkey])) {
                $progress_data[$fkey] = (object) array('lesson_id' => $fkey, 'status' => 'complete');
            }
        }

        $player_nonce = wp_create_nonce('oes_player_nonce');
        include OES_PLUGIN_DIR . 'templates/player.php';
    }

    private function get_next_lesson($curriculum, $current_section, $current_lesson) {
        // Aynı bölümde sonraki ders var mı?
        if (isset($curriculum[$current_section]['lessons'][$current_lesson + 1])) {
            $les = $curriculum[$current_section]['lessons'][$current_lesson + 1];
            return array(
                'section' => $current_section,
                'lesson' => $current_lesson + 1,
                'title' => $les['title'],
                'type' => $les['type'] ?? 'video',
                'quiz_id' => $les['quiz_id'] ?? '',
                'file_url' => $les['file_url'] ?? '',
                'file_name' => $les['file_name'] ?? ''
            );
        }

        // Sonraki bölüme geç
        for ($s = $current_section + 1; $s < count($curriculum); $s++) {
            if (!empty($curriculum[$s]['lessons'])) {
                $les = $curriculum[$s]['lessons'][0];
                return array(
                    'section' => $s,
                    'lesson' => 0,
                    'title' => $les['title'],
                    'type' => $les['type'] ?? 'video',
                    'quiz_id' => $les['quiz_id'] ?? '',
                    'file_url' => $les['file_url'] ?? '',
                    'file_name' => $les['file_name'] ?? ''
                );
            }
        }

        return null; // Son ders
    }

    /**
     * Kullanıcı bu kursa erişebiliyor mu? (satın almış/kayıtlı)
     * Erişim yoksa AJAX isteğini reddeder.
     */
    private function require_course_access($course_id) {
        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error('Giriş yapın');

        $completed_courses = OES_My_Account::get_user_completed_courses($user_id);
        if (!in_array((int) $course_id, array_map('intval', $completed_courses), true)) {
            // Eğitmen/yönetici önizlemesi: sayfayı görebilir ama YAZAMAZ — kendi
            // denemesi öğrenci verisine (ilerleme/sınav/soru) karışmasın.
            if (OES_Teacher::owns_course($user_id, $course_id)) {
                wp_send_json_error('Önizleme modundasın — ilerleme ve gönderimler kaydedilmez.');
            }
            wp_send_json_error('Bu kursa erişiminiz yok');
        }
        return $user_id;
    }

    /**
     * Dosya açıldı damgası — yalnızca SIRA (kilit) için.
     * oes_progress'e yazılır ama compute_course_progress 'file' tipini saydığı
     * için yüzdeyi etkilemez; sadece sonraki içeriğin kilidini açar.
     */
    public static function stamp_file_opened($course_id, $user_id, $lesson_key) {
        global $wpdb;
        $t = $wpdb->prefix . 'oes_progress';
        $exists = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$t} WHERE user_id = %d AND course_id = %d AND lesson_id = %s",
            $user_id, $course_id, $lesson_key));
        if ($exists) return;
        $wpdb->insert($t, array(
            'user_id'          => (int) $user_id,
            'course_id'        => (int) $course_id,
            'lesson_id'        => $lesson_key,
            'status'           => 'complete',
            'progress_percent' => 100,
            'completed_at'     => current_time('mysql'),
        ));
    }

    /**
     * "{bölüm}_{ders}" anahtarı müfredatta bir DOSYA dersine mi denk geliyor?
     * Dosyalar ilerlemeye dahil olmadığı için progress yazımında engellenir.
     */
    public static function is_file_lesson($course_id, $lesson_id) {
        if (strpos((string) $lesson_id, '_') === false) return false;
        list($s, $l) = array_map('intval', explode('_', $lesson_id, 2));
        $curriculum = get_post_meta($course_id, '_oes_course_curriculum', true) ?: array();
        return ($curriculum[$s]['lessons'][$l]['type'] ?? '') === 'file';
    }

    public function mark_lesson_complete() {
        check_ajax_referer('oes_player_nonce', 'nonce');

        $course_id = intval($_POST['course_id']);
        $user_id = $this->require_course_access($course_id);
        $lesson_id = sanitize_text_field($_POST['lesson_id'] ?? '');

        // Ders dosyaları ilerlemeye DAHİL DEĞİLDİR: bir dosyayı açmak/okumak
        // hiçbir koşulda tamamlanma yazmaz.
        if (self::is_file_lesson($course_id, $lesson_id)) {
            wp_send_json_error('Ders dosyaları ilerlemeye dahil değildir.');
        }

        global $wpdb;

        // Mevcut kayıt var mı?
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}oes_progress WHERE user_id = %d AND course_id = %d AND lesson_id = %s",
            $user_id, $course_id, $lesson_id
        ));

        if ($existing) {
            $wpdb->update(
                $wpdb->prefix . 'oes_progress',
                array(
                    'status' => 'complete',
                    'completed_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql')
                ),
                array('id' => $existing),
                array('%s', '%s', '%s'),
                array('%d')
            );
        } else {
            $wpdb->insert(
                $wpdb->prefix . 'oes_progress',
                array(
                    'user_id' => $user_id,
                    'course_id' => $course_id,
                    'lesson_id' => $lesson_id,
                    'status' => 'complete',
                    'progress_percent' => 100,
                    'completed_at' => current_time('mysql'),
                    'updated_at' => current_time('mysql')
                ),
                array('%d', '%d', '%s', '%s', '%d', '%s', '%s')
            );
        }

        // Yeni ilerleme yüzdesi — birleşik (video/dosya + sınav + görev)
        $p = self::compute_course_progress($course_id, $user_id);
        wp_send_json_success(array(
            'progress'  => $p['percent'],
            'completed' => $p['completed'],
            'total'     => $p['total'],
        ));
    }
    
    public function mark_lesson_incomplete() {
        check_ajax_referer('oes_player_nonce', 'nonce');

        $course_id = intval($_POST['course_id']);
        $user_id = $this->require_course_access($course_id);
        $lesson_id = sanitize_text_field($_POST['lesson_id'] ?? '');

        global $wpdb;
        
        // Kaydı sil
        $wpdb->delete(
            $wpdb->prefix . 'oes_progress',
            array(
                'user_id' => $user_id,
                'course_id' => $course_id,
                'lesson_id' => $lesson_id
            ),
            array('%d', '%d', '%s')
        );

        // Yeni ilerleme yüzdesi — birleşik (video/dosya + sınav + görev)
        $p = self::compute_course_progress($course_id, $user_id);
        wp_send_json_success(array(
            'progress'  => $p['percent'],
            'completed' => $p['completed'],
            'total'     => $p['total'],
        ));
    }

    public function get_lesson_video() {
        check_ajax_referer('oes_player_nonce', 'nonce');

        $course_id = intval($_POST['course_id']);
        $this->require_course_access($course_id);
        $section = intval($_POST['section']);
        $lesson = intval($_POST['lesson']);

        $curriculum = get_post_meta($course_id, '_oes_course_curriculum', true) ?: array();
        
        if (!isset($curriculum[$section]['lessons'][$lesson])) {
            wp_send_json_error('Ders bulunamadı');
        }

        $lesson_data = $curriculum[$section]['lessons'][$lesson];
        $video_url = $lesson_data['video_url'] ?? '';

        // Embed URL'e çevir
        $embed_url = '';
        if (preg_match('/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/', $video_url, $matches) || 
            preg_match('/youtu\.be\/([a-zA-Z0-9_-]+)/', $video_url, $matches)) {
            $embed_url = 'https://www.youtube.com/embed/' . $matches[1] . '?enablejsapi=1&rel=0';
        } elseif (preg_match('/vimeo\.com\/(?:video\/)?(\d+)/', $video_url, $matches)) {
            $embed_url = 'https://player.vimeo.com/video/' . $matches[1] . '?title=0&byline=0&portrait=0';
        }

        wp_send_json_success(array(
            'title' => $lesson_data['title'],
            'duration' => $lesson_data['duration'] ?? '',
            'video_url' => $embed_url,
            'section' => $section,
            'lesson' => $lesson
        ));
    }
    
    public function player_submit_quiz() {
        check_ajax_referer('oes_player_nonce', 'nonce');
        
        global $wpdb;
        $user_id = get_current_user_id();
        if (!$user_id) wp_send_json_error('Giriş yapın');
        
        $quiz_id = intval($_POST['quiz_id']);
        $answers = json_decode(stripslashes($_POST['answers']), true) ?: array();
        
        $quiz = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $quiz_id));
        if (!$quiz) wp_send_json_error('Sınav bulunamadı');

        // Bu sınavın kursuna erişim kontrolü
        if (!empty($quiz->course_id)) {
            $this->require_course_access($quiz->course_id);
        }

        // Deneme hakkı (max_attempts) kontrolü: 0 = sınırsız
        $max_attempts = intval($quiz->max_attempts ?? 0);
        if ($max_attempts > 0) {
            $used = (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->prefix}oes_quiz_attempts WHERE quiz_id = %d AND user_id = %d AND status IN ('completed','pending_review')",
                $quiz_id, $user_id
            ));
            if ($used >= $max_attempts) wp_send_json_error('Deneme hakkınız doldu');
        }

        $questions = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d", $quiz_id));

        // Attempt oluştur
        $wpdb->insert($wpdb->prefix . 'oes_quiz_attempts', array(
            'quiz_id' => $quiz_id,
            'user_id' => $user_id,
            'status' => 'in_progress',
            'started_at' => current_time('mysql')
        ));
        $attempt_id = $wpdb->insert_id;
        
        $total_points = 0;
        $earned_points = 0;
        $has_open_ended = false;
        
        foreach ($questions as $q) {
            $total_points += $q->points;
            $user_answer = $answers[$q->id] ?? '';
            
            if ($q->question_type === 'open_ended') {
                $has_open_ended = true;
                continue;
            }
            
            $correct = json_decode($q->correct_answer, true);
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
        
        if ($has_open_ended) {
            $wpdb->update($wpdb->prefix . 'oes_quiz_attempts', array(
                'total_points' => $total_points,
                'earned_points' => $earned_points,
                'status' => 'pending_review',
                'completed_at' => current_time('mysql'),
                'answers' => json_encode($answers)
            ), array('id' => $attempt_id));
            
            wp_send_json_success(array('pending' => true));
        } else {
            $score = $total_points > 0 ? ($earned_points / $total_points) * 100 : 0;
            $passed = $score >= $quiz->pass_score;
            
            $wpdb->update($wpdb->prefix . 'oes_quiz_attempts', array(
                'score' => $score,
                'total_points' => $total_points,
                'earned_points' => $earned_points,
                'passed' => $passed ? 1 : 0,
                'status' => 'completed',
                'completed_at' => current_time('mysql'),
                'answers' => json_encode($answers)
            ), array('id' => $attempt_id));
            
            wp_send_json_success(array('score' => $score, 'earned' => round($earned_points), 'total' => intval($total_points), 'passed' => $passed, 'pending' => false));
        }
    }

    /**
     * Kurs ilerlemesini TÜM içerik tiplerinden birleşik hesaplar.
     *  - video → oes_progress (status = complete)
     *  - sınav → oes_quiz_attempts (completed / pending_review)
     *  - görev → oes_assignment_submissions (teslim var)
     *  - dosya → İLERLEMEYE DAHİL DEĞİL (ne toplamda ne tamamlananda sayılır)
     * @return array ['completed'=>int,'total'=>int,'percent'=>int]
     */
    public static function compute_course_progress($course_id, $user_id) {
        global $wpdb;
        $curriculum = get_post_meta($course_id, '_oes_course_curriculum', true) ?: array();

        $progress = $wpdb->get_results($wpdb->prepare(
            "SELECT lesson_id, status FROM {$wpdb->prefix}oes_progress WHERE user_id = %d AND course_id = %d",
            $user_id, $course_id), OBJECT_K);

        $quiz_done = array();
        if (class_exists('OES_Module_Manager') && OES_Module_Manager::is_active('quizzes')) {
            foreach ($wpdb->get_col($wpdb->prepare(
                "SELECT DISTINCT quiz_id FROM {$wpdb->prefix}oes_quiz_attempts
                 WHERE user_id = %d AND status IN ('completed','pending_review')", $user_id)) as $qid) {
                $quiz_done[(int) $qid] = true;
            }
        }
        $assign_done = array();
        if (class_exists('OES_Module_Manager') && OES_Module_Manager::is_active('assignments')) {
            foreach ($wpdb->get_col($wpdb->prepare(
                "SELECT DISTINCT s.assignment_id FROM {$wpdb->prefix}oes_assignment_submissions s
                 INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id
                 WHERE s.user_id = %d AND a.course_id = %d", $user_id, $course_id)) as $aid) {
                $assign_done[(int) $aid] = true;
            }
        }

        $total = 0; $done = 0;
        foreach ($curriculum as $s => $section) {
            if (empty($section['lessons'])) continue;
            foreach ($section['lessons'] as $l => $lesson) {
                $type = $lesson['type'] ?? 'video';
                // Ders dosyası (PDF/görsel) ilerlemeye dahil DEĞİL: açmak/okumak
                // ilerlemeyi etkilemez, toplam içinde de sayılmaz.
                if ($type === 'file') continue;
                $total++;
                if ($type === 'quiz') {
                    if (!empty($quiz_done[(int) ($lesson['quiz_id'] ?? 0)])) $done++;
                } elseif ($type === 'assign') {
                    if (!empty($assign_done[(int) ($lesson['assignment_id'] ?? 0)])) $done++;
                } else {
                    $key = $s . '_' . $l;
                    if (isset($progress[$key]) && $progress[$key]->status === 'complete') $done++;
                }
            }
        }
        return array(
            'completed' => $done,
            'total'     => $total,
            'percent'   => $total > 0 ? (int) round(($done / $total) * 100) : 0,
        );
    }
}

new OES_Player();