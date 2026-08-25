<?php
/**
 * Admin Panel Yönetimi - Modern Tasarım
 */

if (!defined('ABSPATH')) exit;

class OES_Admin {

    public function __construct() {
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_css'));
    }

    /**
     * Ortak panel tasarımı — eklentinin TÜM admin ekranlarına yüklenir.
     * (Tek yerden yüklenir ki her ekran kendi stilini uydurmasın.)
     */
    public function enqueue_admin_css($hook) {
        $page = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
        $ours = ($page === 'online-kurs-sistemi' || strpos($page, 'oes-') === 0);
        if (!$ours) return;
        wp_enqueue_style('fabo-admin', OES_PLUGIN_URL . 'assets/css/fabo-admin.css',
            array(), oes_asset_ver('assets/css/fabo-admin.css'));
    }

    public function add_admin_menu() {
        add_menu_page('Online Kurs Sistemi', 'Online Kurs Sistemi', 'manage_options', 'online-kurs-sistemi', array($this, 'render_dashboard'), 'dashicons-welcome-learn-more', 30);
        add_submenu_page('online-kurs-sistemi', 'Gösterge Paneli', 'Gösterge Paneli', 'manage_options', 'online-kurs-sistemi', array($this, 'render_dashboard'));
        add_submenu_page('online-kurs-sistemi', 'Tüm Kurslar', 'Tüm Kurslar', 'manage_options', 'oes-courses', array($this, 'render_courses'));
        add_submenu_page('online-kurs-sistemi', 'Kayıtlı Öğrenciler', 'Kayıtlı Öğrenciler', 'manage_options', 'oes-students', array($this, 'render_students'));

        // Sınavlar - quiz class'ı yüklenmediğinde menü de eklenmez,
        // bu yüzden sadece quizzes modülü aktifse buradan ekliyoruz
        if (OES_Module_Manager::is_active('quizzes')) {
            add_submenu_page('online-kurs-sistemi', 'Sınavlar', 'Sınavlar', 'manage_options', 'oes-quizzes', array($this, 'render_quizzes'));
            add_submenu_page('online-kurs-sistemi', 'Sınav Sonuçları', 'Sınav Sonuçları', 'manage_options', 'oes-quiz-results', array($this, 'render_quiz_results'));
        }
        // Diğer modüllerin menüleri (instructors, assignments, mail vb.)
        // kendi class dosyaları tarafından ekleniyor — modül yüklenmediyse menü de eklenmiyor

        // Modül Ayarları ve Kurulum Sihirbazı kaldırıldı (özel eklenti — tüm modüller aktif).
        add_submenu_page('online-kurs-sistemi', 'Ayarlar', 'Ayarlar', 'manage_options', 'oes-settings', array($this, 'render_settings'));
    }
    
    public function render_quizzes() {
        if (class_exists('OES_Quizzes')) {
            OES_Quizzes::instance()->render_admin_page();
        }
    }
    
    public function render_quiz_results() {
        if (class_exists('OES_Quizzes')) {
            OES_Quizzes::instance()->render_submissions_page();
        }
    }

    public function register_settings() {
        register_setting('oes_settings', 'oes_whatsapp_number');
        register_setting('oes_settings', 'oes_whatsapp_message');
        register_setting('oes_settings', 'oes_primary_color');
    }

    /**
     * ESKİ admin CSS'i (--oes-* değişkenleri + .oes-card/.oes-table/.oes-btn …).
     *
     * YENİ ekranlar bunu KULLANMAZ — ortak tasarım assets/css/fabo-admin.css'tedir
     * ve enqueue_admin_css() ile tüm eklenti ekranlarına yüklenir.
     * Bu fonksiyon yalnızca henüz tamamen çevrilmemiş iç bölümler (sınav/görev
     * formları, dönem-eğitmen kartları) için duruyor; oralar da çevrilince silinecek.
     * Çağıranlar: instructors, assignments, periods, quizzes, mail-system.
     */
    public static function oes_admin_styles() { ?>
        <style>
            /* ================================================
               OES GLOBAL ADMIN STYLES
               Renk değiştirmek için sadece :root'u düzenleyin
            ================================================ */
            :root {
                --oes-p:        #194977;   /* Ana navy (site markası) */
                --oes-p2:       #142b56;   /* Koyu navy       */
                --oes-a:        #5baecf;   /* Açık mavi vurgu */
                --oes-a-rgb:    91,174,207;
                --oes-p-rgb:    25,73,119;
                --oes-green:    #10b981;
                --oes-green-bg: #d1fae5;
                --oes-yellow:   #f59e0b;
                --oes-yellow-bg:#fef3c7;
                --oes-red:      #ef4444;
                --oes-red-bg:   #fee2e2;
                --oes-border:   #e2e8f0;
                --oes-border2:  #f1f5f9;
                --oes-bg:       #f8fafc;
                --oes-text:     #1e293b;
                --oes-muted:    #64748b;
                --oes-faint:    #94a3b8;
                --oes-r:        8px;
                --oes-r2:       12px;
            }

            /* Wrap */
            .oes-admin-wrap{padding:0 20px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}

            /* ---- GLOBAL PAGE HEADER BANNER ---- */
            .oes-page-banner{
                margin: 16px 0 24px;
                padding: 20px 28px;
                background: linear-gradient(135deg, var(--oes-p2) 0%, var(--oes-p) 55%, rgba(91,174,207,.65) 100%);
                box-shadow: 0 10px 30px rgba(25,73,119,.22);
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                position: relative;
                overflow: hidden;
                border-radius: 14px;
            }
            .oes-page-banner::before{
                content:'';position:absolute;right:-60px;top:-60px;
                width:220px;height:220px;
                background:rgba(255,255,255,.05);border-radius:50%;
            }
            .oes-page-banner::after{
                content:'';position:absolute;right:120px;bottom:-80px;
                width:160px;height:160px;
                background:rgba(var(--oes-a-rgb),.12);border-radius:50%;
            }
            .oes-banner-left{display:flex;align-items:center;gap:14px;position:relative;z-index:1}
            .oes-banner-icon{
                width:46px;height:46px;border-radius:var(--oes-r2);
                background:rgba(255,255,255,.15);
                display:flex;align-items:center;justify-content:center;flex-shrink:0;
                backdrop-filter:blur(8px);
            }
            .oes-banner-icon svg{color:#fff}
            .oes-banner-title{font-size:20px;font-weight:700;color:#fff;margin:0 0 3px;line-height:1.2}
            .oes-banner-sub{font-size:13px;color:rgba(255,255,255,.75);margin:0}
            .oes-banner-actions{display:flex;gap:10px;position:relative;z-index:1;flex-shrink:0}

            /* ---- BUTONLAR ---- */
            .oes-btn{display:inline-flex;align-items:center;gap:7px;padding:9px 18px;border-radius:var(--oes-r);font-size:13px;font-weight:600;cursor:pointer;border:1px solid var(--oes-border);background:#fff;color:var(--oes-text);transition:all .2s;text-decoration:none;line-height:1}
            .oes-btn:hover{background:var(--oes-bg);border-color:#cbd5e1;color:var(--oes-text)}
            .oes-btn-sm{padding:6px 13px;font-size:12px}
            .oes-btn-primary{background:#1a4976;color:#fff;border:1px solid rgba(255,255,255,.3);backdrop-filter:blur(8px)}
            .oes-btn-primary:hover{background:#84bedc;color:#fff;border-color:rgba(255,255,255,.5)}
            .oes-btn-primary-solid{background:linear-gradient(135deg,var(--oes-a),var(--oes-p));color:#fff;border:none;box-shadow:0 2px 8px rgba(var(--oes-p-rgb),.3)}
            .oes-btn-primary-solid:hover{opacity:.9;color:#fff;transform:translateY(-1px)}
            .oes-btn-danger{background:var(--oes-red);color:#fff;border:none}
            .oes-btn-danger:hover{background:#dc2626;color:#fff}
            .oes-btn-ghost{background:none;border:1px solid var(--oes-border);color:var(--oes-muted)}
            .oes-btn-ghost:hover{background:var(--oes-bg);color:var(--oes-text)}
            .oes-back-link{display:inline-flex;align-items:center;gap:6px;color:var(--oes-a);text-decoration:none;font-size:13px;font-weight:500;margin-bottom:16px;transition:gap .2s}
            .oes-back-link:hover{gap:10px;color:var(--oes-p)}

            /* ---- KARTLAR & SECTION ---- */
            .oes-card{background:#fff!important;border-radius:var(--oes-r2)!important;border:1px solid var(--oes-border)!important;overflow:visible!important;margin-bottom:20px!important;height:auto!important;min-height:10px!important;display:block!important}
            .oes-card-body{padding:24px!important;display:block!important;height:auto!important}
            .oes-section{background:#fff;border:1px solid var(--oes-border);border-radius:var(--oes-r2);padding:24px;margin-bottom:20px}
            .oes-section h2{margin:0 0 18px;font-size:16px;font-weight:600;color:var(--oes-text)}

            /* ---- TABLO ---- */
            .oes-table-wrap{border:1px solid var(--oes-border);border-radius:var(--oes-r);overflow:hidden}
            .oes-table{width:100%;border-collapse:collapse}
            .oes-table th{padding:11px 16px;background:var(--oes-bg);border-bottom:1px solid var(--oes-border);font-size:11px;font-weight:700;color:var(--oes-muted);text-align:left;text-transform:uppercase;letter-spacing:.6px}
            .oes-table td{padding:13px 16px;border-bottom:1px solid var(--oes-border2);font-size:13px;color:#374151}
            .oes-table tr:last-child td{border-bottom:none}
            .oes-table tr:hover td{background:var(--oes-bg)}

            /* ---- BADGE ---- */
            .oes-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600}
            .oes-badge-active,.oes-badge-graded,.oes-badge-success{background:var(--oes-green-bg);color:#059669}
            .oes-badge-draft,.oes-badge-warning,.oes-badge-pending{background:var(--oes-yellow-bg);color:#d97706}
            .oes-badge-danger{background:var(--oes-red-bg);color:#dc2626}
            .oes-badge-info{background:#dbeafe;color:#1d4ed8}
            .oes-badge-success-solid{background:var(--oes-green);color:#fff}
            .oes-badge-danger-solid{background:var(--oes-red);color:#fff}

            /* ---- FORM ---- */
            .oes-form-group{margin-bottom:18px}
            .oes-form-group label{display:block;font-size:13px;font-weight:600;color:#374151;margin-bottom:6px}
            .oes-form-group input,.oes-form-group select,.oes-form-group textarea{width:100%;padding:9px 12px;border:1px solid var(--oes-border);border-radius:var(--oes-r);font-size:14px;box-sizing:border-box;transition:border-color .2s;font-family:inherit}
            .oes-form-group input:focus,.oes-form-group select:focus,.oes-form-group textarea:focus{outline:none;border-color:var(--oes-a);box-shadow:0 0 0 3px rgba(var(--oes-a-rgb),.15)}
            .oes-form-group textarea{min-height:100px;resize:vertical}
            .oes-form-help,.oes-form-group .help{font-size:11px;color:var(--oes-faint);margin-top:4px}
            .oes-form-row{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-bottom:4px}
            .oes-form-group.full{grid-column:1/-1}
            .oes-checkbox-group{display:flex;gap:24px;flex-wrap:wrap}
            .oes-checkbox{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:#374151}
            .oes-checkbox input{width:18px;height:18px;accent-color:var(--oes-p)}

            /* ---- AVATAR ---- */
            .oes-avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--oes-a),var(--oes-p));color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0}
            .oes-avatar-lg{width:52px;height:52px;font-size:20px}

            /* ---- İSTATİSTİK KUTULAR ---- */
            .oes-stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
            .oes-stat-box{background:#fff;border:1px solid var(--oes-border);border-radius:var(--oes-r2);padding:20px 22px;display:flex;align-items:center;gap:16px;transition:box-shadow .2s}
            .oes-stat-box:hover{box-shadow:0 4px 16px rgba(var(--oes-p-rgb),.08)}
            .oes-stat-icon{width:50px;height:50px;border-radius:var(--oes-r);display:flex;align-items:center;justify-content:center;flex-shrink:0}
            .oes-stat-value{font-size:28px;font-weight:800;color:var(--oes-text);line-height:1}
            .oes-stat-label{font-size:12px;color:var(--oes-muted);margin-top:4px;font-weight:500}

            /* ---- DİĞER ---- */
            .oes-actions{display:flex;gap:8px;align-items:center}
            .oes-user-cell{display:flex;align-items:center;gap:10px}
            .oes-user-cell small{display:block;font-size:12px;color:var(--oes-muted)}
            .oes-empty{text-align:center;padding:56px 20px;color:var(--oes-muted)}
            .oes-empty-state{text-align:center;padding:56px 20px;color:var(--oes-muted)}
            .oes-empty h3,.oes-empty-state h3{margin:14px 0 8px;color:var(--oes-text);font-size:17px}
            .oes-modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;align-items:center;justify-content:center}
            .oes-modal.open{display:flex}
            .oes-modal-content{background:#fff;border-radius:var(--oes-r2);width:100%;max-width:600px;max-height:90vh;overflow-y:auto;margin:20px}
            .oes-modal-header{padding:20px 24px;border-bottom:1px solid var(--oes-border);display:flex;justify-content:space-between;align-items:center}
            .oes-modal-header h3{margin:0;font-size:17px;font-weight:700;color:var(--oes-text)}
            .oes-modal-close{background:none;border:none;font-size:22px;cursor:pointer;color:var(--oes-muted);line-height:1}
            .oes-modal-body{padding:24px}
            .oes-modal-footer{padding:16px 24px;border-top:1px solid var(--oes-border);display:flex;justify-content:flex-end;gap:10px}
            .oes-quick-links{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}
            .oes-quick-link{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--oes-bg);border:1px solid var(--oes-border);border-radius:var(--oes-r);color:#334155;text-decoration:none;font-size:13px;font-weight:500;transition:all .2s}
            .oes-quick-link:hover{border-color:var(--oes-a);color:var(--oes-p);background:#fff}
            @keyframes spin{to{transform:rotate(360deg)}}
            @media(max-width:1024px){.oes-stats-row{grid-template-columns:repeat(2,1fr)}}
            @media(max-width:600px){.oes-stats-row{grid-template-columns:1fr}.oes-form-row{grid-template-columns:1fr}}

            /* ---- Premium dokunuşlar (v2) — tüm eklenti sayfaları ---- */
            #wpbody-content{ background:var(--oes-bg); }
            .oes-admin-wrap{ max-width:1320px; }
            .oes-stat-box{ box-shadow:0 2px 10px rgba(25,73,119,.06); border-radius:16px; transition:box-shadow .2s, transform .2s; }
            .oes-stat-box:hover{ box-shadow:0 10px 26px rgba(25,73,119,.13); transform:translateY(-2px); }
            .oes-stat-value{ font-size:30px; }
            .oes-section,.oes-card{ box-shadow:0 2px 10px rgba(25,73,119,.05); }
            .oes-table-wrap{ box-shadow:0 2px 10px rgba(25,73,119,.05); }
            .oes-section h2{ display:flex; align-items:center; gap:9px; }
            .oes-section h2::before{ content:''; width:4px; height:17px; border-radius:4px; background:linear-gradient(var(--oes-a),var(--oes-p)); }
            .oes-quick-link{ border-radius:12px; transition:all .18s; }
            .oes-quick-link:hover{ box-shadow:0 6px 16px rgba(25,73,119,.10); transform:translateY(-2px); }
            .oes-btn-primary-solid{ background:linear-gradient(135deg,var(--oes-p),var(--oes-p2)); }
        </style>
    <?php }

    public function render_dashboard() {
        global $wpdb;
        $total_courses      = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key='_oes_is_course' AND meta_value='yes'");
        $total_students     = (int) $wpdb->get_var("SELECT COUNT(DISTINCT user_id) FROM {$wpdb->prefix}oes_enrollments");
        $active_enrollments = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments WHERE status='active'");
        $pending_q  = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}oes_questions WHERE status='pending'");
        $total_subs = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}oes_assignment_submissions");
        $total_docs = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}oes_documents");

        $recent = $wpdb->get_results(
            "SELECT e.*, u.display_name, u.user_email, p.post_title AS course_name
               FROM {$wpdb->prefix}oes_enrollments e
               LEFT JOIN {$wpdb->users} u ON e.user_id = u.ID
               LEFT JOIN {$wpdb->posts} p ON e.course_id = p.ID
              ORDER BY e.enrolled_at DESC LIMIT 8");

        $top = $wpdb->get_results(
            "SELECT e.course_id, COUNT(*) c, p.post_title
               FROM {$wpdb->prefix}oes_enrollments e
               LEFT JOIN {$wpdb->posts} p ON e.course_id = p.ID
              WHERE e.status = 'active'
              GROUP BY e.course_id ORDER BY c DESC LIMIT 5");
        $top_max = 0; foreach ((array) $top as $t) { if ($t->c > $top_max) $top_max = $t->c; }
        ?>
        <div class="wrap"><div class="fabo-wrap">

            <div class="fabo-head">
                <div>
                    <h1>Gösterge Paneli</h1>
                    <p>Eğitim sisteminin genel durumu: kim ne yaptı, kim neyi kaçırdı.
                       Aşağıdaki özet her sabah e-posta olarak da gider.</p>
                </div>
                <div class="fabo-head-actions">
                    <a class="button button-primary" href="<?php echo esc_url(admin_url('post-new.php?post_type=product')); ?>">Yeni eğitim ekle</a>
                </div>
            </div>

            <div class="fabo-kpis">
                <div class="fabo-kpi"><span class="ic ic-navy"><span class="dashicons dashicons-welcome-learn-more"></span></span>
                    <div><div class="v"><?php echo $total_courses; ?></div><div class="l">Toplam eğitim</div></div></div>
                <div class="fabo-kpi"><span class="ic ic-sky"><span class="dashicons dashicons-groups"></span></span>
                    <div><div class="v"><?php echo $total_students; ?></div><div class="l">Toplam öğrenci</div></div></div>
                <div class="fabo-kpi"><span class="ic ic-green"><span class="dashicons dashicons-yes-alt"></span></span>
                    <div><div class="v"><?php echo $active_enrollments; ?></div><div class="l">Aktif kayıt</div></div></div>
                <div class="fabo-kpi<?php echo $pending_q ? ' alert' : ''; ?>">
                    <span class="ic ic-amber"><span class="dashicons dashicons-format-chat"></span></span>
                    <div><div class="v"><?php echo $pending_q; ?></div><div class="l">Bekleyen soru</div></div></div>
            </div>

            <?php
            // Rapor: kim ne yaptı / kim neyi kaçırdı + günlük mail ayarı.
            // Ayrı "Genel Bakış" sayfası yok — doğrudan burada gösterilir.
            if (class_exists('OES_Reports')) OES_Reports::render_panels();
            ?>

            <div class="fabo-cols">
                <div>
                    <div class="fabo-panel">
                        <h2><span class="dashicons dashicons-groups"></span> Son kayıtlar</h2>
                        <p class="desc">En son eğitime kaydolan öğrenciler.</p>
                        <?php if ($recent): ?>
                        <div class="fabo-tablewrap">
                            <table class="fabo-table">
                                <thead><tr><th>Öğrenci</th><th>Eğitim</th><th>Tarih</th></tr></thead>
                                <tbody>
                                <?php foreach ($recent as $e): ?>
                                <tr>
                                    <td>
                                        <div class="fabo-person">
                                            <span class="fabo-av"><?php echo esc_html(mb_substr($e->display_name ?: '?', 0, 1)); ?></span>
                                            <div style="min-width:0;">
                                                <div class="n"><?php echo esc_html($e->display_name ?: '—'); ?></div>
                                                <div class="e"><?php echo esc_html($e->user_email); ?></div>
                                            </div>
                                        </div>
                                    </td>
                                    <td><?php echo esc_html($e->course_name ?: '—'); ?></td>
                                    <td style="white-space:nowrap;"><?php echo esc_html(date_i18n('d M Y', strtotime($e->enrolled_at))); ?></td>
                                </tr>
                                <?php endforeach; ?>
                                </tbody>
                            </table>
                        </div>
                        <?php else: ?>
                            <div class="fabo-empty"><span class="dashicons dashicons-groups"></span><p>Henüz kayıt yok.</p></div>
                        <?php endif; ?>
                    </div>

                    <div class="fabo-panel">
                        <h2><span class="dashicons dashicons-chart-bar"></span> Popüler eğitimler</h2>
                        <p class="desc">Aktif kayıt sayısına göre.</p>
                        <?php if ($top): ?>
                        <ul class="fabo-list">
                            <?php foreach ($top as $i => $t): $pc = $top_max ? round($t->c / $top_max * 100) : 0; ?>
                            <li>
                                <span class="fabo-chip c-navy"><?php echo $i + 1; ?></span>
                                <span style="flex:1;min-width:0;">
                                    <span style="display:block;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                        <?php echo esc_html($t->post_title ?: '—'); ?>
                                    </span>
                                    <span class="fabo-bar" style="margin-top:5px;"><span style="width:<?php echo intval($pc); ?>%"></span></span>
                                </span>
                                <span class="meta"><?php echo intval($t->c); ?> öğrenci</span>
                            </li>
                            <?php endforeach; ?>
                        </ul>
                        <?php else: ?>
                            <div class="fabo-empty"><span class="dashicons dashicons-chart-bar"></span><p>Henüz kayıt yok.</p></div>
                        <?php endif; ?>
                    </div>
                </div>

                <div>
                    <div class="fabo-panel">
                        <h2><span class="dashicons dashicons-bell"></span> Bekleyen işler</h2>
                        <ul class="fabo-list">
                            <li><span class="dot <?php echo $pending_q ? 'dot-red' : 'dot-green'; ?>"></span>
                                <span><strong><?php echo $pending_q; ?></strong> cevap bekleyen soru</span>
                                <span class="meta"><a href="<?php echo esc_url(admin_url('admin.php?page=oes-questions')); ?>">Yanıtla</a></span></li>
                            <li><span class="dot dot-navy"></span>
                                <span><strong><?php echo $total_subs; ?></strong> görev gönderimi</span>
                                <span class="meta"><a href="<?php echo esc_url(admin_url('admin.php?page=oes-assignments')); ?>">Gör</a></span></li>
                            <li><span class="dot dot-navy"></span>
                                <span><strong><?php echo $total_docs; ?></strong> yüklenen belge</span>
                                <span class="meta"><a href="<?php echo esc_url(admin_url('admin.php?page=oes-belgeler')); ?>">Gör</a></span></li>
                        </ul>
                    </div>

                    <div class="fabo-panel">
                        <h2><span class="dashicons dashicons-admin-links"></span> Hızlı erişim</h2>
                        <ul class="fabo-list">
                            <li><span class="dot dot-navy"></span><a href="<?php echo esc_url(admin_url('post-new.php?post_type=product')); ?>">Yeni eğitim ekle</a></li>
                            <li><span class="dot dot-navy"></span><a href="<?php echo esc_url(admin_url('admin.php?page=oes-courses')); ?>">Eğitimleri yönet</a></li>
                            <li><span class="dot dot-navy"></span><a href="<?php echo esc_url(admin_url('admin.php?page=oes-periods')); ?>">Dönem yönetimi</a></li>
                            <li><span class="dot dot-navy"></span><a href="<?php echo esc_url(admin_url('admin.php?page=oes-sertifikalar')); ?>">Sertifikalar</a></li>
                            <li><span class="dot dot-navy"></span><a href="<?php echo esc_url(admin_url('admin.php?page=oes-belgeler')); ?>">Belgeler &amp; kuponlar</a></li>
                            <li><span class="dot dot-navy"></span><a href="<?php echo esc_url(admin_url('admin.php?page=oes-settings')); ?>">Ayarlar</a></li>
                        </ul>
                    </div>
                </div>
            </div>

        </div></div>
        <?php
    }

    public function render_courses() {
        global $wpdb;
        $courses = $wpdb->get_results(
            "SELECT p.ID, p.post_title, p.post_status, p.post_author
               FROM {$wpdb->posts} p
               INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
              WHERE pm.meta_key = '_oes_is_course' AND pm.meta_value = 'yes'
                    AND p.post_type = 'product' AND p.post_status IN ('publish','draft')
              ORDER BY p.post_date DESC");
        ?>
        <div class="wrap"><div class="fabo-wrap">

            <div class="fabo-head">
                <div>
                    <h1>Tüm Eğitimler</h1>
                    <p><?php echo count($courses); ?> eğitim. Müfredat, sınav, görev ve dönemleri düzenlemek için eğitimi aç.</p>
                </div>
                <div class="fabo-head-actions">
                    <a class="button button-primary" href="<?php echo esc_url(admin_url('post-new.php?post_type=product')); ?>">Yeni eğitim ekle</a>
                </div>
            </div>

            <?php if (!$courses): ?>
                <div class="fabo-panel"><div class="fabo-empty">
                    <span class="dashicons dashicons-welcome-learn-more"></span>
                    <p>Henüz eğitim eklenmemiş.</p>
                    <p style="margin-top:14px;"><a class="button button-primary" href="<?php echo esc_url(admin_url('post-new.php?post_type=product')); ?>">İlk eğitimi ekle</a></p>
                </div></div>
            <?php else: ?>
            <div class="fabo-tablewrap">
                <table class="fabo-table">
                    <thead><tr>
                        <th>Eğitim</th><th>Eğitmen</th><th>İçerik</th><th>Öğrenci</th><th>Fiyat</th><th>Durum</th><th></th>
                    </tr></thead>
                    <tbody>
                    <?php foreach ($courses as $c):
                        $product  = function_exists('wc_get_product') ? wc_get_product($c->ID) : null;
                        $students = (int) $wpdb->get_var($wpdb->prepare(
                            "SELECT COUNT(*) FROM {$wpdb->prefix}oes_enrollments WHERE course_id = %d AND status = 'active'", $c->ID));
                        $curriculum = get_post_meta($c->ID, '_oes_course_curriculum', true) ?: array();
                        $vid = $qz = $gv = $dosya = 0;
                        foreach ((array) $curriculum as $s) {
                            foreach (($s['lessons'] ?? array()) as $l) {
                                $t = $l['type'] ?? 'video';
                                if ($t === 'quiz') $qz++; elseif ($t === 'assign') $gv++;
                                elseif ($t === 'file') $dosya++; else $vid++;
                            }
                        }
                        $thumb  = get_the_post_thumbnail_url($c->ID, 'thumbnail');
                        // WooCommerce yoksa fiyat BİLİNMEZ — "ücretsiz" demek yanlış olur
                        $price  = $product ? $product->get_price() : null;
                        $free   = ($product && ($price === '' || $price == 0));
                        $closed = get_post_meta($c->ID, '_oes_course_closed', true) === 'yes';
                        $period = get_post_meta($c->ID, '_oes_period_based', true) === 'yes';
                        $author = get_userdata($c->post_author);
                    ?>
                    <tr>
                        <td>
                            <div class="fabo-person">
                                <?php if ($thumb): ?>
                                    <img src="<?php echo esc_url($thumb); ?>" alt="" style="width:44px;height:44px;border-radius:9px;object-fit:cover;flex:none;">
                                <?php else: ?>
                                    <span class="fabo-av" style="border-radius:9px;width:44px;height:44px;"><span class="dashicons dashicons-welcome-learn-more"></span></span>
                                <?php endif; ?>
                                <div style="min-width:0;">
                                    <div class="n"><?php echo esc_html($c->post_title); ?></div>
                                    <div class="e"><?php echo $period ? 'Takvimli program' : 'Esnek program'; ?></div>
                                </div>
                            </div>
                        </td>
                        <td><?php echo esc_html($author ? $author->display_name : '—'); ?></td>
                        <td style="white-space:nowrap;font-size:12.5px;color:#5a6577;">
                            <?php echo intval($vid); ?> video · <?php echo intval($qz); ?> sınav · <?php echo intval($gv); ?> görev
                            <?php if ($dosya): ?> · <?php echo intval($dosya); ?> dosya<?php endif; ?>
                        </td>
                        <td><span class="fabo-chip c-navy"><?php echo $students; ?></span></td>
                        <td style="white-space:nowrap;">
                            <?php if ($free): ?><span class="fabo-chip c-green">Ücretsiz</span>
                            <?php else: echo wp_kses_post($product ? $product->get_price_html() : '—'); endif; ?>
                        </td>
                        <td>
                            <?php if ($closed): ?><span class="fabo-chip c-gray">Kapalı</span>
                            <?php elseif ($c->post_status === 'publish'): ?><span class="fabo-chip c-green">Yayında</span>
                            <?php else: ?><span class="fabo-chip c-amber">Taslak</span><?php endif; ?>
                        </td>
                        <td style="white-space:nowrap;">
                            <a class="button button-small" href="<?php echo esc_url(get_edit_post_link($c->ID)); ?>">Düzenle</a>
                            <a class="button button-small" target="_blank" rel="noopener" href="<?php echo esc_url(get_permalink($c->ID)); ?>">Gör</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <?php endif; ?>

        </div></div>
        <?php
    }

    public function render_students() {
        global $wpdb;
        
        // AJAX işlemleri
        if (isset($_POST['oes_student_action']) && wp_verify_nonce($_POST['_wpnonce'], 'oes_student_management')) {
            $action = sanitize_text_field($_POST['oes_student_action']);
            $user_id = intval($_POST['user_id']);
            $course_id = intval($_POST['course_id'] ?? 0);
            
            if ($action === 'remove_course' && $user_id && $course_id) {
                // Önce enrollment kaydını ve order_id'yi al
                $enrollment = $wpdb->get_row($wpdb->prepare(
                    "SELECT * FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d AND course_id = %d",
                    $user_id, $course_id
                ));
                
                if ($enrollment) {
                    // Siparişi iptal et (eğer varsa)
                    if ($enrollment->order_id > 0) {
                        $order = wc_get_order($enrollment->order_id);
                        if ($order && $order->get_status() !== 'cancelled') {
                            $order->update_status('cancelled', 'Admin tarafından kurs kaydı iptal edildi.');
                        }
                    }
                    
                    // Enrollment kaydını sil
                    $wpdb->delete($wpdb->prefix . 'oes_enrollments', 
                        array('user_id' => $user_id, 'course_id' => $course_id),
                        array('%d', '%d')
                    );
                    delete_transient('oes_user_courses_' . $user_id);
                    echo '<div class="notice notice-success is-dismissible"><p>Öğrenci kurstan çıkarıldı ve sipariş iptal edildi.</p></div>';
                }
            }
            
            if ($action === 'add_course' && $user_id && $course_id) {
                // Zaten kayıtlı mı kontrol et
                $exists = $wpdb->get_var($wpdb->prepare(
                    "SELECT id FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d AND course_id = %d",
                    $user_id, $course_id
                ));
                
                if (!$exists) {
                    $wpdb->insert($wpdb->prefix . 'oes_enrollments', array(
                        'user_id' => $user_id,
                        'course_id' => $course_id,
                        'order_id' => 0,
                        'status' => 'active',
                        'enrolled_at' => current_time('mysql')
                    ));
                    delete_transient('oes_user_courses_' . $user_id);
                    echo '<div class="notice notice-success is-dismissible"><p>Öğrenci kursa eklendi.</p></div>';
                } else {
                    echo '<div class="notice notice-warning is-dismissible"><p>Öğrenci zaten bu kursa kayıtlı.</p></div>';
                }
            }
            
            if ($action === 'remove_all' && $user_id) {
                // Önce tüm enrollment'ları al
                $enrollments = $wpdb->get_results($wpdb->prepare(
                    "SELECT * FROM {$wpdb->prefix}oes_enrollments WHERE user_id = %d",
                    $user_id
                ));
                
                // Her birinin siparişini iptal et
                foreach ($enrollments as $enr) {
                    if ($enr->order_id > 0) {
                        $order = wc_get_order($enr->order_id);
                        if ($order && $order->get_status() !== 'cancelled') {
                            $order->update_status('cancelled', 'Admin tarafından tüm kurs kayıtları iptal edildi.');
                        }
                    }
                }
                
                // Tüm enrollment kayıtlarını sil
                $wpdb->delete($wpdb->prefix . 'oes_enrollments', 
                    array('user_id' => $user_id),
                    array('%d')
                );
                delete_transient('oes_user_courses_' . $user_id);
                echo '<div class="notice notice-success is-dismissible"><p>Öğrenci tüm kurslardan çıkarıldı ve siparişler iptal edildi.</p></div>';
            }
        }
        
        // Detay görüntüleme
        $detail_user_id = isset($_GET['detail']) ? intval($_GET['detail']) : 0;
        
        $students = $wpdb->get_results("
            SELECT u.ID, u.display_name, u.user_email, u.user_registered,
                   COUNT(e.id) as total_courses, MAX(e.enrolled_at) as last_enrollment 
            FROM {$wpdb->prefix}oes_enrollments e 
            INNER JOIN {$wpdb->users} u ON e.user_id = u.ID 
            WHERE e.status = 'active' 
            GROUP BY u.ID 
            ORDER BY last_enrollment DESC
        ");
        
        // Tüm öğrencilerin kurslarını tek sorguda al
        $all_courses = array();
        if (!empty($students)) {
            $user_ids = array_column($students, 'ID');
            $ids_placeholder = implode(',', array_map('intval', $user_ids));
            $courses_data = $wpdb->get_results("
                SELECT e.id as enrollment_id, e.user_id, e.course_id, e.order_id, e.enrolled_at, p.post_title 
                FROM {$wpdb->prefix}oes_enrollments e 
                LEFT JOIN {$wpdb->posts} p ON e.course_id = p.ID 
                WHERE e.user_id IN ({$ids_placeholder}) AND e.status = 'active'
            ");
            foreach ($courses_data as $cd) {
                if (!isset($all_courses[$cd->user_id])) $all_courses[$cd->user_id] = array();
                $all_courses[$cd->user_id][] = $cd;
            }
        }
        
        // Tüm kurslar (ekleme için)
        $available_courses = $wpdb->get_results("
            SELECT ID, post_title FROM {$wpdb->posts} 
            WHERE post_type = 'product' AND post_status = 'publish'
            AND ID IN (SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_oes_is_course' AND meta_value = 'yes')
            ORDER BY post_title
        ");
        
        ?>
        <div class="wrap"><div class="fabo-wrap">

        <?php
        /* ---------------- DETAY ---------------- */
        if ($detail_user_id):
            $detail_user  = get_userdata($detail_user_id);
            $user_courses = isset($all_courses[$detail_user_id]) ? $all_courses[$detail_user_id] : array();
            if ($detail_user):
        ?>
            <div class="fabo-head">
                <div>
                    <h1><?php echo esc_html($detail_user->display_name); ?></h1>
                    <p><?php echo esc_html($detail_user->user_email); ?> ·
                       Üyelik: <?php echo esc_html(date_i18n('d M Y', strtotime($detail_user->user_registered))); ?> ·
                       ID: <?php echo intval($detail_user_id); ?></p>
                </div>
                <div class="fabo-head-actions">
                    <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=oes-students')); ?>">← Listeye dön</a>
                    <a class="button" href="<?php echo esc_url(admin_url('user-edit.php?user_id=' . $detail_user_id)); ?>">WordPress profili</a>
                </div>
            </div>

            <div class="fabo-panel">
                <h2><span class="dashicons dashicons-welcome-learn-more"></span> Kayıtlı eğitimler
                    <span class="fabo-chip c-gray"><?php echo count($user_courses); ?></span></h2>
                <p class="desc">Eğitimden çıkarmak, varsa siparişi de iptal eder.</p>

                <?php if ($user_courses): ?>
                <div class="fabo-tablewrap">
                    <table class="fabo-table">
                        <thead><tr><th>Eğitim</th><th>Kayıt</th><th>Kaynak</th><th></th></tr></thead>
                        <tbody>
                        <?php foreach ($user_courses as $uc):
                            $is_free = ($uc->order_id == 0 || empty($uc->order_id)); ?>
                        <tr>
                            <td><strong><?php echo esc_html($uc->post_title ?: '—'); ?></strong></td>
                            <td style="white-space:nowrap;"><?php echo esc_html(date_i18n('d M Y H:i', strtotime($uc->enrolled_at))); ?></td>
                            <td>
                                <?php if ($is_free): ?>
                                    <span class="fabo-chip c-gray">Ücretsiz / elle</span>
                                <?php else: ?>
                                    <span class="fabo-chip c-navy">Sipariş #<?php echo intval($uc->order_id); ?></span>
                                <?php endif; ?>
                            </td>
                            <td style="text-align:right;">
                                <form method="post" style="margin:0;" onsubmit="return confirm('Bu öğrenciyi eğitimden çıkarmak istediğine emin misin?');">
                                    <?php wp_nonce_field('oes_student_management'); ?>
                                    <input type="hidden" name="oes_student_action" value="remove_course">
                                    <input type="hidden" name="user_id" value="<?php echo intval($detail_user_id); ?>">
                                    <input type="hidden" name="course_id" value="<?php echo intval($uc->course_id); ?>">
                                    <button type="submit" class="button button-small">Eğitimden çıkar</button>
                                </form>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
                <?php else: ?>
                    <div class="fabo-empty"><span class="dashicons dashicons-welcome-learn-more"></span><p>Bu öğrenci henüz hiçbir eğitime kayıtlı değil.</p></div>
                <?php endif; ?>

                <form method="post" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                    <?php wp_nonce_field('oes_student_management'); ?>
                    <input type="hidden" name="oes_student_action" value="add_course">
                    <input type="hidden" name="user_id" value="<?php echo intval($detail_user_id); ?>">
                    <select name="course_id" required style="min-width:260px;">
                        <option value="">— Eğitim seç —</option>
                        <?php foreach ($available_courses as $ac): ?>
                        <option value="<?php echo intval($ac->ID); ?>"><?php echo esc_html($ac->post_title); ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button type="submit" class="button button-primary">Eğitime ekle</button>
                    <span class="fabo-hint">Elle ekleme sipariş oluşturmaz.</span>
                </form>
            </div>

            <?php if (count($user_courses) > 0): ?>
            <div class="fabo-panel" style="border-color:#f0c2bc;">
                <h2><span class="dashicons dashicons-warning" style="color:#d1493d;"></span> Tehlikeli bölge</h2>
                <p class="desc">Öğrenciyi tüm eğitimlerden çıkarır ve ilgili siparişleri iptal eder. Geri alınamaz.</p>
                <form method="post" onsubmit="return confirm('Bu öğrenciyi TÜM eğitimlerden çıkarmak istediğine emin misin? Bu işlem geri alınamaz!');">
                    <?php wp_nonce_field('oes_student_management'); ?>
                    <input type="hidden" name="oes_student_action" value="remove_all">
                    <input type="hidden" name="user_id" value="<?php echo intval($detail_user_id); ?>">
                    <button type="submit" class="button">Tüm eğitimlerden çıkar</button>
                </form>
            </div>
            <?php endif; ?>

        <?php else: /* kullanıcı silinmiş/yok — boş sayfa bırakma */ ?>
            <div class="fabo-head"><div><h1>Öğrenci bulunamadı</h1>
                <p>Bu kullanıcı silinmiş olabilir.</p></div>
                <div class="fabo-head-actions">
                    <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=oes-students')); ?>">← Listeye dön</a>
                </div>
            </div>
        <?php
            endif;
        else:
        /* ---------------- LİSTE ---------------- */
        ?>
            <div class="fabo-head">
                <div>
                    <h1>Kayıtlı Öğrenciler</h1>
                    <p><?php echo count($students); ?> öğrenci. Bir öğrencinin eğitimlerini görmek ve yönetmek için Detay’a gir.</p>
                </div>
            </div>

            <?php if ($students): ?>
            <div class="fabo-tablewrap">
                <table class="fabo-table">
                    <thead><tr><th>Öğrenci</th><th>Eğitimler</th><th>Eğitim sayısı</th><th>Son kayıt</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($students as $s):
                        $courses = isset($all_courses[$s->ID]) ? $all_courses[$s->ID] : array(); ?>
                    <tr>
                        <td>
                            <div class="fabo-person">
                                <span class="fabo-av"><?php echo esc_html(mb_substr($s->display_name ?: '?', 0, 1)); ?></span>
                                <div style="min-width:0;">
                                    <div class="n"><?php echo esc_html($s->display_name); ?></div>
                                    <div class="e"><?php echo esc_html($s->user_email); ?></div>
                                </div>
                            </div>
                        </td>
                        <td>
                            <?php if (empty($courses)): ?>
                                <span class="fabo-hint">—</span>
                            <?php else:
                                foreach (array_slice($courses, 0, 2) as $c): ?>
                                    <span class="fabo-chip c-sky" style="margin:1px 2px;"><?php echo esc_html(mb_strimwidth($c->post_title ?: '—', 0, 26, '…')); ?></span>
                                <?php endforeach;
                                if (count($courses) > 2): ?>
                                    <span class="fabo-chip c-gray">+<?php echo count($courses) - 2; ?></span>
                                <?php endif;
                            endif; ?>
                        </td>
                        <td><span class="fabo-chip c-navy"><?php echo intval($s->total_courses); ?></span></td>
                        <td style="white-space:nowrap;"><?php echo esc_html(date_i18n('d M Y', strtotime($s->last_enrollment))); ?></td>
                        <td style="text-align:right;white-space:nowrap;">
                            <a class="button button-small" href="<?php echo esc_url(admin_url('admin.php?page=oes-students&detail=' . $s->ID)); ?>">Detay</a>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <?php else: ?>
                <div class="fabo-panel"><div class="fabo-empty">
                    <span class="dashicons dashicons-groups"></span><p>Henüz kayıtlı öğrenci yok.</p>
                </div></div>
            <?php endif; ?>
        <?php endif; ?>

        </div></div>
        <?php
    }

    public function render_settings() {
        wp_enqueue_media();
        if (isset($_POST['oes_save_settings']) && wp_verify_nonce($_POST['oes_settings_nonce'],'oes_save_settings')) {
            update_option('oes_whatsapp_number',sanitize_text_field($_POST['oes_whatsapp_number']));
            update_option('oes_whatsapp_message',sanitize_textarea_field($_POST['oes_whatsapp_message']));
            update_option('oes_primary_color',sanitize_hex_color($_POST['oes_primary_color']));
            update_option('oes_reminder_enabled',isset($_POST['oes_reminder_enabled'])?'yes':'no');
            update_option('oes_panel_app_name',sanitize_text_field($_POST['oes_panel_app_name'] ?? ''));
            update_option('oes_panel_icon',esc_url_raw($_POST['oes_panel_icon'] ?? ''));
            update_option('oes_panel_login_bg',esc_url_raw($_POST['oes_panel_login_bg'] ?? ''));
            update_option('oes_panel_login_logo',esc_url_raw($_POST['oes_panel_login_logo'] ?? ''));
            echo '<div class="notice notice-success"><p>Ayarlar kaydedildi!</p></div>';
        }
        ?>
        <style>
            /* Form alanları — ortak panel tasarımıyla uyumlu, .fabo-wrap'a kapsanmış */
            .fabo-wrap .oes-form-group{margin-bottom:16px}
            .fabo-wrap .oes-form-group label{display:block;font-size:13px;font-weight:600;color:#12233a;margin-bottom:6px}
            .fabo-wrap .oes-form-group input[type=text],
            .fabo-wrap .oes-form-group textarea,
            .fabo-wrap .oes-form-group select{width:100%;max-width:420px;padding:10px 12px;border:1px solid #e3e8ef;border-radius:9px;font-size:14px}
            .fabo-wrap .oes-form-group input[type=text]:focus,
            .fabo-wrap .oes-form-group textarea:focus{outline:none;border-color:#194977;box-shadow:0 0 0 1px #194977}
            .fabo-wrap .oes-help{font-size:11.5px;color:#98a1b3;margin-top:5px;display:block;line-height:1.5}
            .fabo-wrap .oes-checkbox{display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600}
            .fabo-wrap .oes-checkbox input{width:18px;height:18px;accent-color:#194977}
        </style>
        <div class="wrap"><div class="fabo-wrap">
            <div class="fabo-head">
                <div>
                    <h1>Ayarlar</h1>
                    <p>Sistem ayarları. E-posta şablonları için <a href="<?php echo esc_url(admin_url('admin.php?page=oes-mail')); ?>">Mail Yönetimi</a>,
                       günlük rapor ayarı için <a href="<?php echo esc_url(admin_url('admin.php?page=online-kurs-sistemi')); ?>">Gösterge Paneli</a>.</p>
                </div>
            </div>
            <form method="post">
                <?php wp_nonce_field('oes_save_settings','oes_settings_nonce'); ?>
                <div class="fabo-panel">
                    <h2><span class="dashicons dashicons-whatsapp"></span> WhatsApp</h2>
                    <div class="oes-form-group">
                        <label>WhatsApp Numarası</label>
                        <input type="text" name="oes_whatsapp_number" value="<?php echo esc_attr(get_option('oes_whatsapp_number','')); ?>" placeholder="905321234567">
                        <span class="oes-help">Ülke kodu ile, + olmadan yazın</span>
                    </div>
                    <div class="oes-form-group">
                        <label>Varsayılan Mesaj</label>
                        <textarea name="oes_whatsapp_message" rows="3"><?php echo esc_textarea(get_option('oes_whatsapp_message','Merhaba, {course_name} kursu hakkında bilgi almak istiyorum.')); ?></textarea>
                        <span class="oes-help">Değişkenler: {course_name}, {course_price}</span>
                    </div>
                </div>
                <div class="fabo-panel">
                    <h2><span class="dashicons dashicons-art"></span> Görünüm</h2>
                    <div class="oes-form-group">
                        <label>Ana renk</label>
                        <input type="color" name="oes_primary_color" value="<?php echo esc_attr(get_option('oes_primary_color','#194977')); ?>" style="width:60px;height:40px;padding:0;border:none;cursor:pointer">
                    </div>
                </div>
                <div class="fabo-panel">
                    <h2><span class="dashicons dashicons-email"></span> E-posta hatırlatma</h2>
                    <div class="oes-form-group">
                        <label class="oes-checkbox">
                            <input type="checkbox" name="oes_reminder_enabled" value="yes" <?php checked(get_option('oes_reminder_enabled','yes'),'yes'); ?>>
                            <span>Etkinlik hatırlatma e-postaları aktif</span>
                        </label>
                        <span class="oes-help">Her sabah <b>07:00</b>'de, yarınki etkinlikleri olan kullanıcılara otomatik mail gönderilir.</span>
                    </div>
                </div>
                <div class="fabo-panel">
                    <h2><span class="dashicons dashicons-smartphone"></span> Uygulama (PWA)</h2>
                    <p class="oes-help" style="margin-bottom:14px">Öğrenci paneli (<code><?php echo esc_html(home_url('/panel')); ?></code>) mobilde uygulama gibi ana ekrana eklenebilir. Buradan uygulamanın adını ve ikonunu belirleyin.</p>
                    <div class="oes-form-group">
                        <label>Uygulama Adı</label>
                        <input type="text" name="oes_panel_app_name" value="<?php echo esc_attr(get_option('oes_panel_app_name', get_bloginfo('name'))); ?>" placeholder="<?php echo esc_attr(get_bloginfo('name')); ?>">
                        <span class="oes-help">Ana ekrana eklendiğinde ikonun altında görünecek isim</span>
                    </div>
                    <div class="oes-form-group">
                        <label>Uygulama İkonu (Logo)</label>
                        <?php $oes_icon = get_option('oes_panel_icon', ''); ?>
                        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                            <div id="oesIconPreview" style="width:72px;height:72px;border-radius:16px;border:1px solid #e2e8f0;background:#f8fafc url('<?php echo esc_url($oes_icon); ?>') center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#cbd5e1;flex-shrink:0">
                                <?php if (!$oes_icon): ?><span style="font-size:11px">Önizleme</span><?php endif; ?>
                            </div>
                            <div>
                                <input type="hidden" name="oes_panel_icon" id="oesIconInput" value="<?php echo esc_attr($oes_icon); ?>">
                                <button type="button" class="button" id="oesIconUpload">İkon Seç / Yükle</button>
                                <button type="button" class="button" id="oesIconRemove" style="<?php echo $oes_icon ? '' : 'display:none'; ?>">Kaldır</button>
                                <p class="oes-help" style="margin-top:6px">Kare (512×512 px) PNG önerilir. Boş bırakılırsa site ikonu kullanılır.</p>
                            </div>
                        </div>
                    </div>
                    <div class="oes-form-group">
                        <label>Giriş Ekranı Arka Plan Görseli</label>
                        <?php $oes_bg = get_option('oes_panel_login_bg', ''); ?>
                        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                            <div id="oesBgPreview" style="width:120px;height:72px;border-radius:10px;border:1px solid #e2e8f0;background:#f8fafc url('<?php echo esc_url($oes_bg); ?>') center/cover no-repeat;display:flex;align-items:center;justify-content:center;color:#cbd5e1;flex-shrink:0">
                                <?php if (!$oes_bg): ?><span style="font-size:11px">Önizleme</span><?php endif; ?>
                            </div>
                            <div>
                                <input type="hidden" name="oes_panel_login_bg" id="oesBgInput" value="<?php echo esc_attr($oes_bg); ?>">
                                <button type="button" class="button" id="oesBgUpload">Görsel Seç / Yükle</button>
                                <button type="button" class="button" id="oesBgRemove" style="<?php echo $oes_bg ? '' : 'display:none'; ?>">Kaldır</button>
                                <p class="oes-help" style="margin-top:6px">Giriş ekranında tam ekran arka plan olarak kullanılır. Üzerine buzlu cam (glassmorphism) giriş kartı gelir.</p>
                            </div>
                        </div>
                    </div>
                    <div class="oes-form-group">
                        <label>Giriş Ekranı Logosu</label>
                        <?php $oes_login_logo = get_option('oes_panel_login_logo', ''); ?>
                        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
                            <div id="oesLoginLogoPreview" style="width:120px;height:72px;border-radius:10px;border:1px solid #e2e8f0;background:#1e293b url('<?php echo esc_url($oes_login_logo); ?>') center/contain no-repeat;display:flex;align-items:center;justify-content:center;color:#cbd5e1;flex-shrink:0">
                                <?php if (!$oes_login_logo): ?><span style="font-size:11px">Önizleme</span><?php endif; ?>
                            </div>
                            <div>
                                <input type="hidden" name="oes_panel_login_logo" id="oesLoginLogoInput" value="<?php echo esc_attr($oes_login_logo); ?>">
                                <button type="button" class="button" id="oesLoginLogoUpload">Logo Seç / Yükle</button>
                                <button type="button" class="button" id="oesLoginLogoRemove" style="<?php echo $oes_login_logo ? '' : 'display:none'; ?>">Kaldır</button>
                                <p class="oes-help" style="margin-top:6px">Giriş ekranında gösterilir (koyu zemin üzerinde beyaza filtrelenir). Boş bırakılırsa uygulama ikonu kullanılır.</p>
                            </div>
                        </div>
                    </div>
                </div>
                <button type="submit" name="oes_save_settings" class="button button-primary button-hero">Ayarları kaydet</button>
            </form>
        </div></div>
        <script>
        jQuery(function($){
            var frame;
            $('#oesIconUpload').on('click', function(e){
                e.preventDefault();
                if (frame) { frame.open(); return; }
                frame = wp.media({ title:'Uygulama ikonu seç', button:{text:'Kullan'}, multiple:false, library:{type:'image'} });
                frame.on('select', function(){
                    var att = frame.state().get('selection').first().toJSON();
                    $('#oesIconInput').val(att.url);
                    $('#oesIconPreview').css('background-image','url('+att.url+')').html('');
                    $('#oesIconRemove').show();
                });
                frame.open();
            });
            $('#oesIconRemove').on('click', function(e){
                e.preventDefault();
                $('#oesIconInput').val('');
                $('#oesIconPreview').css('background-image','none').html('<span style="font-size:11px">Önizleme</span>');
                $(this).hide();
            });
            var bgFrame;
            $('#oesBgUpload').on('click', function(e){
                e.preventDefault();
                if (bgFrame) { bgFrame.open(); return; }
                bgFrame = wp.media({ title:'Arka plan görseli seç', button:{text:'Kullan'}, multiple:false, library:{type:'image'} });
                bgFrame.on('select', function(){
                    var att = bgFrame.state().get('selection').first().toJSON();
                    $('#oesBgInput').val(att.url);
                    $('#oesBgPreview').css('background-image','url('+att.url+')').html('');
                    $('#oesBgRemove').show();
                });
                bgFrame.open();
            });
            $('#oesBgRemove').on('click', function(e){
                e.preventDefault();
                $('#oesBgInput').val('');
                $('#oesBgPreview').css('background-image','none').html('<span style="font-size:11px">Önizleme</span>');
                $(this).hide();
            });
            var loginLogoFrame;
            $('#oesLoginLogoUpload').on('click', function(e){
                e.preventDefault();
                if (loginLogoFrame) { loginLogoFrame.open(); return; }
                loginLogoFrame = wp.media({ title:'Giriş ekranı logosu seç', button:{text:'Kullan'}, multiple:false, library:{type:'image'} });
                loginLogoFrame.on('select', function(){
                    var att = loginLogoFrame.state().get('selection').first().toJSON();
                    $('#oesLoginLogoInput').val(att.url);
                    $('#oesLoginLogoPreview').css('background-image','url('+att.url+')').html('');
                    $('#oesLoginLogoRemove').show();
                });
                loginLogoFrame.open();
            });
            $('#oesLoginLogoRemove').on('click', function(e){
                e.preventDefault();
                $('#oesLoginLogoInput').val('');
                $('#oesLoginLogoPreview').css('background-image','none').html('<span style="font-size:11px">Önizleme</span>');
                $(this).hide();
            });
        });
        </script>
        <?php
    }

}

new OES_Admin();
