<?php
/**
 * OES Setup Wizard
 * Adım adım kurulum sihirbazı
 */

if (!defined('ABSPATH')) exit;

class OES_Setup_Wizard {

    public function __construct() {
        add_action('admin_menu', array($this, 'add_wizard_page'), 20); // 20 = admin.php'den sonra
        add_action('admin_init', array($this, 'redirect_on_activation'));
        add_action('wp_ajax_oes_save_wizard', array($this, 'save_wizard'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_assets'));
    }

    /**
     * Aktivasyon sonrası wizard'a yönlendir (sadece ilk kurulum)
     */
    public function redirect_on_activation() {
        if (get_transient('oes_activation_redirect') && !isset($_GET['activate-multi'])) {
            delete_transient('oes_activation_redirect');
            // Wizard daha önce tamamlanmamışsa yönlendir
            if (!get_option('oes_wizard_completed')) {
                wp_safe_redirect(admin_url('admin.php?page=oes-setup-wizard'));
                exit;
            }
        }
    }

    /**
     * Gizli wizard sayfası (menüde görünmez)
     */
    public function add_wizard_page() {
        // Wizard: gizli sayfa (menüde görünmez, sadece URL ile erişilir)
        add_submenu_page(
            'online-kurs-sistemi',
            'Online Eğitim Sistemi - Kurulum',
            'Kurulum Sihirbazı',
            'manage_options',
            'oes-setup-wizard',
            array($this, 'render_wizard')
        );
    }

    /**
     * Wizard menü öğesini gizle (sayfayı silmeden)
     */
    public function hide_wizard_menu_item() {
        echo '<style>#adminmenu a[href="admin.php?page=oes-setup-wizard"] { display: none !important; }</style>';
    }

    /**
     * Wizard assets
     */
    public function enqueue_assets($hook) {
        if (strpos($hook, 'oes-setup-wizard') === false && strpos($hook, 'oes-modules') === false) return;

        wp_enqueue_style('oes-wizard', OES_PLUGIN_URL . 'assets/css/wizard.css', array(), OES_VERSION);
        wp_enqueue_script('oes-wizard', OES_PLUGIN_URL . 'assets/js/wizard.js', array('jquery'), OES_VERSION, true);
        wp_localize_script('oes-wizard', 'oesWizard', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce'   => wp_create_nonce('oes_wizard_nonce'),
            'dashUrl' => admin_url('admin.php?page=online-kurs-sistemi'),
        ));
    }

    /**
     * Wizard render
     */
    public function render_wizard() {
        $active = OES_Module_Manager::get_active_modules();
        $modules = OES_Module_Manager::get_modules();
        $is_first = !get_option('oes_wizard_completed');
        ?>
        <div class="wrap">
        <div class="oes-wizard-page">
        <div class="oes-wizard-wrap">

            <!-- Header -->
            <div class="oes-wiz-header">
                <div class="oes-wiz-logo">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5DB9E8" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                    <span>Online Eğitim Sistemi</span>
                </div>
                <?php if (!$is_first): ?>
                <a href="<?php echo admin_url('admin.php?page=online-kurs-sistemi'); ?>" class="oes-wiz-skip">← Panele Dön</a>
                <?php endif; ?>
            </div>

            <!-- Adım göstergesi -->
            <div class="oes-wiz-steps">
                <div class="oes-wiz-step active" data-step="1">
                    <div class="oes-step-num">1</div>
                    <span>Hoş Geldiniz</span>
                </div>
                <div class="oes-wiz-step-line"></div>
                <div class="oes-wiz-step" data-step="2">
                    <div class="oes-step-num">2</div>
                    <span>Modüller</span>
                </div>
                <div class="oes-wiz-step-line"></div>
                <div class="oes-wiz-step" data-step="3">
                    <div class="oes-step-num">3</div>
                    <span>Tamamlandı</span>
                </div>
            </div>

            <!-- ADIM 1: Hoş geldiniz -->
            <div class="oes-wiz-panel active" id="step-1">
                <div class="oes-wiz-welcome">
                    <div class="oes-welcome-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#5DB9E8" stroke-width="1.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                    </div>
                    <h1>Online Eğitim Sistemi'ne Hoş Geldiniz</h1>
                    <p>Bu sihirbaz, sistemi ihtiyacınıza göre yapılandırmanıza yardımcı olacak. Hangi modülleri kullanmak istediğinizi seçin — istemediğiniz modüller yüklenmez, sitenizi yavaşlatmaz.</p>

                    <div class="oes-wiz-core-info">
                        <h3>Her zaman aktif olan çekirdek modüller:</h3>
                        <ul>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> WooCommerce Entegrasyonu</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Kurs Sayfası & Frontend</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Video Oynatıcı (Player)</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Hesabım / Eğitimlerim</li>
                            <li><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Admin Paneli</li>
                        </ul>
                    </div>

                    <button class="oes-btn-primary oes-wiz-next" data-next="2">
                        Başlayalım
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
            </div>

            <!-- ADIM 2: Modül seçimi -->
            <div class="oes-wiz-panel" id="step-2">
                <div class="oes-wiz-modules-wrap">
                    <h2>Hangi modülleri kullanmak istiyorsunuz?</h2>
                    <p class="oes-wiz-sub">İstediğiniz modülleri seçin. Sonradan Modül Ayarları sayfasından değiştirebilirsiniz.</p>

                    <div class="oes-module-grid">
                        <?php foreach ($modules as $id => $mod): 
                            $checked = in_array($id, $active);
                            $has_req = !empty($mod['requires']);
                        ?>
                        <div class="oes-module-card <?php echo $checked ? 'selected' : ''; ?>" 
                             data-id="<?php echo esc_attr($id); ?>"
                             <?php if ($has_req): ?>
                             data-requires="<?php echo esc_attr(implode(',', $mod['requires'])); ?>"
                             <?php endif; ?>>
                            <div class="oes-mc-check">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                            <div class="oes-mc-icon"><?php echo $mod['icon']; ?></div>
                            <div class="oes-mc-content">
                                <h4><?php echo esc_html($mod['title']); ?></h4>
                                <p><?php echo esc_html($mod['description']); ?></p>
                                <?php if ($has_req): ?>
                                <span class="oes-mc-req">
                                    Gerektirir: <?php 
                                    $req_names = array_map(function($r) use ($modules) {
                                        return isset($modules[$r]) ? $modules[$r]['title'] : $r;
                                    }, $mod['requires']);
                                    echo esc_html(implode(', ', $req_names));
                                    ?>
                                </span>
                                <?php endif; ?>
                            </div>
                        </div>
                        <?php endforeach; ?>
                    </div>

                    <div class="oes-wiz-actions">
                        <button class="oes-btn-secondary oes-wiz-prev" data-prev="1">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                            Geri
                        </button>
                        <button class="oes-btn-primary" id="oesWizSave">
                            <span class="oes-btn-text">Ayarları Kaydet & Devam Et</span>
                            <span class="oes-btn-loading" style="display:none;">Kaydediliyor...</span>
                            <svg class="oes-btn-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- ADIM 3: Tamamlandı -->
            <div class="oes-wiz-panel" id="step-3">
                <div class="oes-wiz-success">
                    <div class="oes-success-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="1.5"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    </div>
                    <h1>Kurulum Tamamlandı!</h1>
                    <p>Seçtiğiniz modüller aktif edildi. Artık Online Eğitim Sistemi kullanıma hazır.</p>

                    <div class="oes-success-modules" id="oesSuccessModules"></div>

                    <a href="<?php echo admin_url('admin.php?page=online-kurs-sistemi'); ?>" class="oes-btn-primary">
                        Admin Paneline Git
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                    </a>
                </div>
            </div>

        </div>
        </div>
        </div>
        <?php
    }

    /**
     * AJAX: Wizard'dan modül kaydet
     */
    public function save_wizard() {
        check_ajax_referer('oes_wizard_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Yetkiniz yok.');
        }

        $modules  = OES_Module_Manager::get_modules();
        $selected = isset($_POST['modules']) ? (array) $_POST['modules'] : array();
        $selected = array_map('sanitize_text_field', $selected);

        // Bağımlılık kontrolü
        $errors = array();
        foreach ($selected as $id) {
            if (isset($modules[$id]['requires'])) {
                foreach ($modules[$id]['requires'] as $req) {
                    if (!in_array($req, $selected)) {
                        $errors[] = sprintf(
                            '"%s" için "%s" de gereklidir.',
                            $modules[$id]['title'],
                            $modules[$req]['title'] ?? $req
                        );
                        $selected = array_values(array_diff($selected, array($id)));
                    }
                }
            }
        }

        OES_Module_Manager::save_modules($selected);
        update_option('oes_wizard_completed', true);

        // Aktif modül isimlerini döndür
        $active_names = array();
        foreach ($selected as $id) {
            if (isset($modules[$id])) {
                $active_names[] = $modules[$id]['title'];
            }
        }

        wp_send_json_success(array(
            'modules' => $active_names,
            'errors'  => $errors,
        ));
    }
}

new OES_Setup_Wizard();