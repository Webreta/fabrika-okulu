<?php
/**
 * Fabrika Okulu — Raporlar
 *
 * TEK VERİ KAYNAĞI: hem wp-admin "Genel Bakış" ekranı hem de günlük e-posta
 * raporu aynı `build()` çıktısını kullanır → ekranda gördüğünle mailde geleni
 * ayrışmaz.
 *
 * Kapsam:
 *  - Yönetici  → TÜM eğitmenlerin ve öğrencilerin durumu (site geneli)
 *  - Eğitmen   → yalnızca kendi eğitimleri
 *
 * İki soruya cevap verir:
 *  1) BUGÜN NE OLDU?  (yeni soru, teslim, sınav, kayıt, bitirme)
 *  2) NE KAÇIRILDI?   (yanıtsız soru, geçmiş teslim, hiç başlamamış öğrenci)
 */

if (!defined('ABSPATH')) exit;

class OES_Reports {

    const HOOK     = 'oes_daily_report_cron';
    const RUN_HOUR = '07:00'; // hatırlatma cron'larıyla aynı saat

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    /**
     * NOT: Ayrı bir "Genel Bakış" menüsü YOK — rapor doğrudan Gösterge Paneli'nde
     * gösterilir (OES_Admin::render_dashboard → self::render_panels()).
     * (Eskiden ayrı submenu vardı ama admin_menu önceliği 9 ile, üst menü daha
     * oluşmadan ekleniyordu → sayfa 404 veriyordu.)
     */
    private function __construct() {
        add_action('init', array($this, 'schedule'));
        add_action(self::HOOK, array($this, 'send_daily'));
    }

    /* =====================================================================
     *  Zamanlama
     * ================================================================== */

    public function schedule() {
        if (get_option('oes_report_cron_hour') !== self::RUN_HOUR) {
            wp_clear_scheduled_hook(self::HOOK);
            update_option('oes_report_cron_hour', self::RUN_HOUR, false);
        }
        if (!wp_next_scheduled(self::HOOK)) {
            $now = current_time('timestamp');
            $ts  = strtotime('today ' . self::RUN_HOUR, $now);
            if ($ts < $now) $ts = strtotime('tomorrow ' . self::RUN_HOUR, $now);
            wp_schedule_event($ts - (int) (get_option('gmt_offset') * 3600), 'daily', self::HOOK);
        }
    }

    /* =====================================================================
     *  Veri
     * ================================================================== */

    /** Rapora girecek kurslar: yönetici → hepsi, eğitmen → kendi kursları */
    public static function course_ids_for($user_id, $is_admin) {
        if ($is_admin) {
            return array_map('intval', get_posts(array(
                'post_type' => 'product', 'posts_per_page' => -1, 'fields' => 'ids',
                'meta_key' => '_oes_is_course', 'meta_value' => 'yes', 'no_found_rows' => true,
            )));
        }
        return class_exists('OES_Teacher') ? array_map('intval', OES_Teacher::get_teacher_course_ids($user_id)) : array();
    }

    /**
     * Rapor verisi.
     * @param int    $user_id  Eğitmen id (yönetici raporunda 0)
     * @param bool   $is_admin Site geneli mi?
     * @param string $day      'Y-m-d' — hangi günün hareketleri
     */
    public static function build($user_id, $is_admin, $day = '') {
        global $wpdb;
        if ($day === '') $day = current_time('Y-m-d');

        $cids = self::course_ids_for($user_id, $is_admin);
        $out = array(
            'day' => $day, 'is_admin' => $is_admin, 'course_count' => count($cids),
            'today' => array('questions' => array(), 'submissions' => array(), 'quizzes' => array(),
                             'enrollments' => array(), 'completions' => array()),
            'missed' => array('unanswered' => array(), 'overdue' => array(), 'idle' => array()),
            'totals' => array('students' => 0, 'teachers' => 0),
        );
        if (empty($cids)) return $out;

        $ph    = implode(',', array_fill(0, count($cids), '%d'));
        $start = $day . ' 00:00:00';
        $end   = $day . ' 23:59:59';

        /* ---------- Toplamlar ---------- */
        $out['totals']['students'] = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(DISTINCT user_id) FROM {$wpdb->prefix}oes_enrollments
              WHERE course_id IN ($ph) AND status = 'active'", $cids));
        if ($is_admin) {
            $out['totals']['teachers'] = (int) $wpdb->get_var(
                "SELECT COUNT(DISTINCT post_author) FROM {$wpdb->posts} p
                  INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_oes_is_course' AND m.meta_value = 'yes'
                  WHERE p.post_type = 'product' AND p.post_status IN ('publish','draft')");
        }

        /* ---------- BUGÜN: yeni sorular ---------- */
        if (OES_Module_Manager::is_active('questions')) {
            $out['today']['questions'] = $wpdb->get_results($wpdb->prepare(
                "SELECT q.id, q.question_text, q.status, q.created_at, q.course_id,
                        u.display_name, p.post_title AS course
                   FROM {$wpdb->prefix}oes_questions q
                   INNER JOIN {$wpdb->users} u ON u.ID = q.user_id
                   LEFT JOIN {$wpdb->posts} p ON p.ID = q.course_id
                  WHERE q.course_id IN ($ph) AND q.created_at BETWEEN %s AND %s
                  ORDER BY q.created_at DESC LIMIT 50",
                array_merge($cids, array($start, $end))));

            /* KAÇIRILAN: yanıtsız sorular (bugüne özel değil) */
            $out['missed']['unanswered'] = $wpdb->get_results($wpdb->prepare(
                "SELECT q.id, q.question_text, q.created_at, u.display_name, p.post_title AS course,
                        DATEDIFF(%s, q.created_at) AS days
                   FROM {$wpdb->prefix}oes_questions q
                   INNER JOIN {$wpdb->users} u ON u.ID = q.user_id
                   LEFT JOIN {$wpdb->posts} p ON p.ID = q.course_id
                  WHERE q.course_id IN ($ph) AND q.status = 'pending'
                  ORDER BY q.created_at ASC LIMIT 50",
                array_merge(array($end), $cids)));
        }

        /* ---------- BUGÜN: görev teslimleri ---------- */
        if (OES_Module_Manager::is_active('assignments')) {
            $out['today']['submissions'] = $wpdb->get_results($wpdb->prepare(
                "SELECT s.id, s.submitted_at, u.display_name, a.title AS assignment, p.post_title AS course
                   FROM {$wpdb->prefix}oes_assignment_submissions s
                   INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id
                   INNER JOIN {$wpdb->users} u ON u.ID = s.user_id
                   LEFT JOIN {$wpdb->posts} p ON p.ID = a.course_id
                  WHERE a.course_id IN ($ph) AND s.submitted_at BETWEEN %s AND %s
                  ORDER BY s.submitted_at DESC LIMIT 50",
                array_merge($cids, array($start, $end))));

            /* KAÇIRILAN: son teslimi geçmiş ve teslim etmemiş öğrenciler.
               Son teslim öğrenci bazında hesaplanır (fabo_task_due_ts). */
            $assigns = $wpdb->get_results($wpdb->prepare(
                "SELECT a.id, a.title, a.course_id, a.extra_days, p.post_title AS course
                   FROM {$wpdb->prefix}oes_assignments a
                   LEFT JOIN {$wpdb->posts} p ON p.ID = a.course_id
                  WHERE a.course_id IN ($ph) AND a.status = 'active' AND a.extra_days > 0", $cids));

            /* Son teslim öğrenci bazında hesaplandığı için (fabo_task_due_ts → sorgu)
               bu döngü SINIRLI tutulur: aksi halde 30 görev × 300 öğrenci = on binlerce
               sorgu, hem de ekran render'ında. İncelenen çift sayısı tavanlanır. */
            $now_ts   = current_time('timestamp');
            $checked  = 0;
            $MAX_CHECK = 1500; // incelenecek (görev × öğrenci) çifti tavanı
            $MAX_ROWS  = 60;
            $out['overdue_partial'] = false; // NOT: 'missed' içine konmaz — is_empty() onu dolu sanardı

            foreach ($assigns as $a) {
                $students = $wpdb->get_col($wpdb->prepare(
                    "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_enrollments
                      WHERE course_id = %d AND status = 'active'", $a->course_id));
                if (empty($students)) continue;
                $done = array_map('intval', $wpdb->get_col($wpdb->prepare(
                    "SELECT DISTINCT user_id FROM {$wpdb->prefix}oes_assignment_submissions WHERE assignment_id = %d", $a->id)));

                foreach ($students as $sid) {
                    $sid = (int) $sid;
                    if (in_array($sid, $done, true)) continue;
                    if (++$checked > $MAX_CHECK) { $out['overdue_partial'] = true; break 2; }

                    $due = fabo_task_due_ts($sid, $a->course_id, $a->extra_days);
                    if (!$due || $due >= $now_ts) continue; // süresi dolmamış ya da hiç başlamamış
                    $u = get_userdata($sid);
                    if (!$u) continue;
                    $out['missed']['overdue'][] = (object) array(
                        'name' => $u->display_name, 'assignment' => $a->title, 'course' => $a->course,
                        'due' => $due, 'days' => (int) floor(($now_ts - $due) / DAY_IN_SECONDS),
                    );
                    if (count($out['missed']['overdue']) >= $MAX_ROWS) { $out['overdue_partial'] = true; break 2; }
                }
            }
            usort($out['missed']['overdue'], function ($x, $y) { return $y->days <=> $x->days; });
        }

        /* ---------- BUGÜN: sınav sonuçları ---------- */
        if (OES_Module_Manager::is_active('quizzes')) {
            $out['today']['quizzes'] = $wpdb->get_results($wpdb->prepare(
                "SELECT qa.id, qa.score, qa.completed_at, u.display_name, q.title AS quiz, p.post_title AS course
                   FROM {$wpdb->prefix}oes_quiz_attempts qa
                   INNER JOIN {$wpdb->prefix}oes_quizzes q ON q.id = qa.quiz_id
                   INNER JOIN {$wpdb->users} u ON u.ID = qa.user_id
                   LEFT JOIN {$wpdb->posts} p ON p.ID = q.course_id
                  WHERE q.course_id IN ($ph) AND qa.status IN ('completed','pending_review')
                        AND qa.completed_at BETWEEN %s AND %s
                  ORDER BY qa.completed_at DESC LIMIT 50",
                array_merge($cids, array($start, $end))));
        }

        /* ---------- BUGÜN: yeni kayıtlar ---------- */
        $out['today']['enrollments'] = $wpdb->get_results($wpdb->prepare(
            "SELECT e.user_id, e.enrolled_at, u.display_name, p.post_title AS course
               FROM {$wpdb->prefix}oes_enrollments e
               INNER JOIN {$wpdb->users} u ON u.ID = e.user_id
               LEFT JOIN {$wpdb->posts} p ON p.ID = e.course_id
              WHERE e.course_id IN ($ph) AND e.status = 'active' AND e.enrolled_at BETWEEN %s AND %s
              ORDER BY e.enrolled_at DESC LIMIT 50",
            array_merge($cids, array($start, $end))));

        /* ---------- KAÇIRILAN: satın aldı ama hiç başlamadı (7+ gün) ---------- */
        $out['missed']['idle'] = $wpdb->get_results($wpdb->prepare(
            "SELECT e.user_id, e.course_id, e.enrolled_at, u.display_name, p.post_title AS course,
                    DATEDIFF(%s, e.enrolled_at) AS days
               FROM {$wpdb->prefix}oes_enrollments e
               INNER JOIN {$wpdb->users} u ON u.ID = e.user_id
               LEFT JOIN {$wpdb->posts} p ON p.ID = e.course_id
              WHERE e.course_id IN ($ph) AND e.status = 'active'
                    AND e.started_at IS NULL AND DATEDIFF(%s, e.enrolled_at) >= 7
              ORDER BY e.enrolled_at ASC LIMIT 50",
            // DİKKAT: prepare konuma göre bağlar → argümanlar SQL'deki yer değiştirici
            // sırasıyla aynı olmalı: %s (select) … $ph (IN) … %s (where)
            array_merge(array($end), $cids, array($end))));

        /* ---------- BUGÜN: kursu bitirenler (sertifika adayı) ---------- */
        $finished = $wpdb->get_results($wpdb->prepare(
            "SELECT DISTINCT pr.user_id, pr.course_id, u.display_name, p.post_title AS course
               FROM {$wpdb->prefix}oes_progress pr
               INNER JOIN {$wpdb->users} u ON u.ID = pr.user_id
               LEFT JOIN {$wpdb->posts} p ON p.ID = pr.course_id
              WHERE pr.course_id IN ($ph) AND pr.status = 'complete'
                    AND pr.completed_at BETWEEN %s AND %s
              LIMIT 60",
            array_merge($cids, array($start, $end))));
        foreach ($finished as $f) {
            $pr = OES_Player::compute_course_progress($f->course_id, $f->user_id);
            if (!empty($pr['total']) && $pr['completed'] >= $pr['total']) {
                $out['today']['completions'][] = $f;
            }
        }

        return $out;
    }

    /* =====================================================================
     *  Günlük e-posta
     * ================================================================== */

    public function send_daily() {
        // Günde bir kez garantisi
        $today = current_time('Y-m-d');
        if (get_option('oes_daily_report_last') === $today) return;
        update_option('oes_daily_report_last', $today, false);

        if (get_option('oes_daily_report_enabled', 'yes') !== 'yes') return;

        $day = date('Y-m-d', strtotime('-1 day', current_time('timestamp'))); // DÜNÜN raporu

        // 1) Eğitmenler — kendi raporu
        foreach (self::teacher_ids() as $tid) {
            $u = get_userdata($tid);
            if (!$u || !$u->user_email) continue;
            $data = self::build($tid, false, $day);
            if (self::is_empty($data)) continue; // boş rapor gönderme
            wp_mail($u->user_email, 'Günlük rapor — ' . date_i18n('d F Y', strtotime($day)),
                self::email_html($data, $u->display_name), array('Content-Type: text/html; charset=UTF-8'));
        }

        // 2) Yönetici — site geneli
        $admin_mail = get_option('oes_report_email', '') ?: get_option('admin_email');
        if ($admin_mail) {
            $data = self::build(0, true, $day);
            wp_mail($admin_mail, 'Günlük rapor (site geneli) — ' . date_i18n('d F Y', strtotime($day)),
                self::email_html($data, 'Yönetici'), array('Content-Type: text/html; charset=UTF-8'));
        }
    }

    /**
     * Eğitmen yetkisi olan kullanıcı id'leri.
     * Rolle filtrelenir — eskiden SİTEDEKİ TÜM kullanıcılar çekilip her biri için
     * ayrı sorgu atılıyordu (binlerce kullanıcıda ekranı kilitlerdi).
     */
    public static function teacher_ids() {
        if (!class_exists('OES_Teacher')) return array();
        static $cache = null;
        if ($cache !== null) return $cache; // aynı istekte birden çok kez çağrılıyor
        $cache = array_map('intval', get_users(array(
            'role'   => OES_Teacher::ROLE,
            'fields' => 'ID',
            'number' => 500,
        )));
        return $cache;
    }

    private static function is_empty($d) {
        foreach ($d['today'] as $rows)  { if (!empty($rows)) return false; }
        foreach ($d['missed'] as $rows) { if (!empty($rows)) return false; }
        return true;
    }

    private static function email_html($d, $to_name) {
        $t = $d['today']; $m = $d['missed'];
        $panel = home_url('/egitmen/');

        $row = function ($label, $n, $color) {
            return '<tr><td style="padding:9px 0;border-bottom:1px solid #eef1f6;font-size:14px;color:#12233a;">' . esc_html($label) . '</td>'
                 . '<td style="padding:9px 0;border-bottom:1px solid #eef1f6;text-align:right;font-size:16px;font-weight:700;color:' . $color . ';">' . intval($n) . '</td></tr>';
        };

        $c = '<p style="margin:0 0 6px;">Merhaba ' . esc_html($to_name) . ',</p>'
           . '<p style="margin:0 0 16px;color:#5a6577;font-size:14px;">'
           . esc_html(date_i18n('d F Y', strtotime($d['day']))) . ' günü '
           . ($d['is_admin'] ? 'sitede' : 'eğitimlerinde') . ' olanların özeti:</p>';

        $c .= '<h3 style="font-size:15px;color:#194977;margin:0 0 6px;">Bugün ne oldu?</h3>'
            . '<table style="width:100%;border-collapse:collapse;margin-bottom:18px;">'
            . $row('Yeni soru', count($t['questions']), '#194977')
            . $row('Görev teslimi', count($t['submissions']), '#1f9d5b')
            . $row('Sınav sonucu', count($t['quizzes']), '#2a7aa3')
            . $row('Yeni kayıt', count($t['enrollments']), '#194977')
            . $row('Eğitimi bitiren', count($t['completions']), '#1f9d5b')
            . '</table>';

        $c .= '<h3 style="font-size:15px;color:#d1493d;margin:0 0 6px;">Dikkat gerektirenler</h3>'
            . '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">'
            . $row('Yanıtlanmamış soru', count($m['unanswered']), '#d1493d')
            . $row('Süresi geçmiş teslim', count($m['overdue']), '#d9871a')
            . $row('Satın aldı, hiç başlamadı (7+ gün)', count($m['idle']), '#d9871a')
            . '</table>';

        if (!empty($t['completions'])) {
            $c .= '<div style="margin:16px 0;padding:12px 14px;background:#e7f6ee;border-left:4px solid #1f9d5b;border-radius:6px;">'
                . '<strong>Sertifika verilebilir:</strong> ';
            $names = array();
            foreach (array_slice($t['completions'], 0, 8) as $f) $names[] = esc_html($f->display_name) . ' (' . esc_html($f->course) . ')';
            $c .= implode(', ', $names) . '</div>';
        }
        if (!empty($m['unanswered'])) {
            $oldest = $m['unanswered'][0];
            $c .= '<p style="margin:12px 0;font-size:13.5px;color:#5a6577;">En eski yanıtsız soru <strong>'
                . intval($oldest->days) . ' gündür</strong> bekliyor (' . esc_html($oldest->display_name) . ').</p>';
        }

        $title = $d['is_admin'] ? 'Günlük rapor — site geneli' : 'Günlük raporun';
        if (class_exists('OES_Mail_System')) {
            return OES_Mail_System::instance()->get_email_template($title, $c, 'Panele git', $panel);
        }
        return $c . '<p><a href="' . esc_url($panel) . '">Panele git</a></p>';
    }

    /* =====================================================================
     *  Gösterge Paneli'ne gömülen rapor bölümü
     *  (ayrı sayfa YOK — OES_Admin::render_dashboard bunu çağırır)
     * ================================================================== */

    /** Rapor panellerini basar. Gösterge Paneli içinden çağrılır. */
    public static function render_panels() {
        if (!current_user_can('manage_options')) return;

        // Ayar kaydı
        if (isset($_POST['oes_report_save']) && check_admin_referer('oes_report_settings')) {
            update_option('oes_report_email', sanitize_email($_POST['oes_report_email'] ?? ''));
            update_option('oes_daily_report_enabled', isset($_POST['oes_daily_report_enabled']) ? 'yes' : 'no');
            echo '<div class="notice notice-success is-dismissible"><p>Rapor ayarları kaydedildi.</p></div>';
        }

        $day = isset($_GET['gun']) ? sanitize_text_field($_GET['gun']) : current_time('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) $day = current_time('Y-m-d');
        $teacher = isset($_GET['egitmen']) ? intval($_GET['egitmen']) : 0;

        $d = self::build($teacher, $teacher === 0, $day);
        $t = $d['today']; $m = $d['missed'];
        ?>

        <div class="fabo-panel" style="display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;">
            <div>
                <h2 style="margin:0 0 3px;"><span class="dashicons dashicons-visibility"></span> Kim ne yaptı, ne kaçırdı</h2>
                <p class="desc" style="margin:0;">
                    <?php echo $teacher ? 'Seçili eğitmenin' : 'Tüm eğitmenlerin ve öğrencilerin'; ?> durumu.
                    Aynı özet her sabah <?php echo esc_html(self::RUN_HOUR); ?>'de e-posta olarak da gider.
                </p>
            </div>
            <form method="get" style="display:flex;gap:8px;flex-wrap:wrap;">
                <input type="hidden" name="page" value="online-kurs-sistemi">
                <select name="egitmen">
                    <option value="0">Tüm eğitmenler (site geneli)</option>
                    <?php foreach (self::teacher_ids() as $tid):
                        $tu = get_userdata($tid); if (!$tu) continue; ?>
                        <option value="<?php echo intval($tid); ?>" <?php selected($teacher, $tid); ?>>
                            <?php echo esc_html($tu->display_name); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <input type="date" name="gun" value="<?php echo esc_attr($day); ?>">
                <button class="button">Göster</button>
            </form>
        </div>

        <div class="fabo-cols">
            <div>
                <?php
                self::list_panel('Yanıtlanmamış sorular', 'format-chat', $m['unanswered'],
                    'Hepsi yanıtlanmış.', function ($r) {
                        return array(
                            'dot'  => intval($r->days) > 2 ? 'dot-red' : 'dot-amber',
                            'text' => '<strong>' . esc_html($r->display_name) . '</strong> · ' . esc_html($r->course)
                                    . '<br><span style="color:#5a6577;font-size:12.5px;">' . esc_html(mb_strimwidth((string) $r->question_text, 0, 90, '…')) . '</span>',
                            'meta' => intval($r->days) . ' gündür bekliyor',
                        );
                    });

                self::list_panel('Süresi geçmiş teslimler', 'clock', $m['overdue'],
                    'Geciken teslim yok.', function ($r) {
                        return array(
                            'dot'  => 'dot-amber',
                            'text' => '<strong>' . esc_html($r->name) . '</strong> · ' . esc_html($r->assignment)
                                    . '<br><span style="color:#5a6577;font-size:12.5px;">' . esc_html($r->course) . '</span>',
                            'meta' => intval($r->days) . ' gün gecikti',
                        );
                    });

                self::list_panel('Satın aldı ama hiç başlamadı', 'hourglass', $m['idle'],
                    'Herkes eğitimine başlamış.', function ($r) {
                        return array(
                            'dot'  => 'dot-amber',
                            'text' => '<strong>' . esc_html($r->display_name) . '</strong><br><span style="color:#5a6577;font-size:12.5px;">' . esc_html($r->course) . '</span>',
                            'meta' => intval($r->days) . ' gündür açmadı',
                        );
                    });
                ?>
            </div>

            <div>
                <div class="fabo-panel">
                    <h2><span class="dashicons dashicons-calendar-alt"></span> <?php echo esc_html(date_i18n('d F Y', strtotime($day))); ?></h2>
                    <p class="desc">O gün olanlar.</p>
                    <ul class="fabo-list">
                        <li><span class="dot dot-navy"></span> Yeni soru <span class="meta"><?php echo count($t['questions']); ?></span></li>
                        <li><span class="dot dot-green"></span> Görev teslimi <span class="meta"><?php echo count($t['submissions']); ?></span></li>
                        <li><span class="dot dot-navy"></span> Sınav sonucu <span class="meta"><?php echo count($t['quizzes']); ?></span></li>
                        <li><span class="dot dot-navy"></span> Yeni kayıt <span class="meta"><?php echo count($t['enrollments']); ?></span></li>
                        <li><span class="dot dot-green"></span> Eğitimi bitiren <span class="meta"><?php echo count($t['completions']); ?></span></li>
                    </ul>
                </div>

                <?php if (!empty($t['completions'])): ?>
                <div class="fabo-panel">
                    <h2><span class="dashicons dashicons-awards"></span> Sertifika verilebilir</h2>
                    <p class="desc">O gün eğitimini bitirenler. Sertifikayı eğitmen kendi panelinden tanımlar.</p>
                    <ul class="fabo-list">
                        <?php foreach ($t['completions'] as $f): ?>
                        <li><span class="dot dot-green"></span>
                            <span><strong><?php echo esc_html($f->display_name); ?></strong><br>
                            <span style="color:#5a6577;font-size:12.5px;"><?php echo esc_html($f->course); ?></span></span>
                        </li>
                        <?php endforeach; ?>
                    </ul>
                </div>
                <?php endif; ?>

                <div class="fabo-panel">
                    <h2><span class="dashicons dashicons-email"></span> Günlük rapor e-postası</h2>
                    <p class="desc">Her sabah <?php echo esc_html(self::RUN_HOUR); ?>'de: eğitmenlere kendi raporu, yöneticiye site geneli.</p>
                    <form method="post">
                        <?php wp_nonce_field('oes_report_settings'); ?>
                        <p><label><input type="checkbox" name="oes_daily_report_enabled" value="1"
                            <?php checked(get_option('oes_daily_report_enabled', 'yes'), 'yes'); ?>> Günlük raporu gönder</label></p>
                        <p><label style="display:block;font-weight:600;margin-bottom:4px;">Yönetici rapor e-postası</label>
                           <input type="email" name="oes_report_email" class="widefat"
                                  value="<?php echo esc_attr(get_option('oes_report_email', '')); ?>"
                                  placeholder="<?php echo esc_attr(get_option('admin_email')); ?>"></p>
                        <button class="button button-primary" name="oes_report_save" value="1">Kaydet</button>
                    </form>
                </div>
            </div>
        </div>
        <?php
    }

    /** Rapor listesi kartı — aynı düzen tekrar tekrar yazılmasın (render_panels statik) */
    private static function list_panel($title, $icon, $rows, $empty_text, $fmt) {
        ?>
        <div class="fabo-panel">
            <h2><span class="dashicons dashicons-<?php echo esc_attr($icon); ?>"></span> <?php echo esc_html($title); ?>
                <?php if (!empty($rows)): ?><span class="fabo-chip c-gray"><?php echo count($rows); ?></span><?php endif; ?>
            </h2>
            <?php if (empty($rows)): ?>
                <div class="fabo-empty"><span class="dashicons dashicons-yes-alt"></span><p><?php echo esc_html($empty_text); ?></p></div>
            <?php else: ?>
            <ul class="fabo-list">
                <?php foreach (array_slice($rows, 0, 15) as $r): $f = $fmt($r); ?>
                <li>
                    <span class="dot <?php echo esc_attr($f['dot']); ?>"></span>
                    <span><?php echo $f['text']; // güvenli: formatlayıcı esc_html kullanır ?></span>
                    <span class="meta"><?php echo esc_html($f['meta']); ?></span>
                </li>
                <?php endforeach; ?>
            </ul>
            <?php if (count($rows) > 15): ?>
                <p class="desc" style="margin:10px 0 0;">+ <?php echo count($rows) - 15; ?> tane daha…</p>
            <?php endif; ?>
            <?php endif; ?>
        </div>
        <?php
    }
}

OES_Reports::instance();
