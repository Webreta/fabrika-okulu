<?php
/**
 * OES Teacher — Eğitmen kimliği altyapısı
 *
 * - `oes_teacher` ikincil rolü + capability
 * - `oes_instructors` tablosunu WP kullanıcısına bağlar (user_id kolonu)
 * - WP admin'den kullanıcıyı eğitmen atama (profil + kullanıcı listesi)
 * - Sonraki fazlar için sahiplik/erişim yardımcıları
 *
 * NOT: Eğitmen wp-admin'e girmez; tüm kurs/sınav/görev CRUD'ı eğitmen
 * panelinde (Faz 3+) kendi AJAX uçlarıyla ve buradaki sahiplik kontrolleriyle yapılır.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher {

    const ROLE = 'oes_teacher';
    const CAP  = 'oes_teacher';

    private static $instance = null;

    public static function instance() {
        if (is_null(self::$instance)) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function __construct() {
        // Rolün var olduğundan emin ol (idempotent)
        $this->ensure_role();

        // instructors tablosuna user_id kolonu göçü (admin tarafında, bir kez)
        add_action('admin_init', array($this, 'maybe_upgrade_schema'));

        // Admin: kullanıcı profilinde "Eğitmen" ataması
        add_action('show_user_profile', array($this, 'render_user_profile_field'));
        add_action('edit_user_profile', array($this, 'render_user_profile_field'));
        add_action('personal_options_update', array($this, 'save_user_profile_field'));
        add_action('edit_user_profile_update', array($this, 'save_user_profile_field'));

        // Admin: kullanıcılar listesinde "Eğitmen" sütunu
        add_filter('manage_users_columns', array($this, 'add_users_column'));
        add_filter('manage_users_custom_column', array($this, 'render_users_column'), 10, 3);

        // Admin: ürünler listesinde "Eğitmen" sütunu (hangi eğitmen hangi kursu oluşturmuş)
        add_filter('manage_edit-product_columns', array($this, 'add_product_teacher_column'));
        add_action('manage_product_posts_custom_column', array($this, 'render_product_teacher_column'), 10, 2);

        // Eğitmen/sahip (ve yönetici) kendi TASLAK kursunu önizleyebilsin (ön yüzde)
        add_action('pre_get_posts', array($this, 'allow_owner_draft_preview'));
    }

    /* ============================================================
     * Ön yüz: sahip/yönetici taslak kurs önizlemesi
     * ============================================================ */

    /**
     * Yayınlanmamış (taslak/beklemede/özel) bir kurs ürününün tekil sayfasını,
     * kursun SAHİBİ eğitmen veya YÖNETİCİ görebilsin (diğerlerine 404).
     */
    public function allow_owner_draft_preview($q) {
        if (is_admin() || !$q->is_main_query() || !is_user_logged_in()) return;

        // Tekil ürün sorgusunu tespit et
        $post = null;
        $pid  = (int) $q->get('p');
        if ($pid) {
            $post = get_post($pid);
        } else {
            $name = $q->get('product');
            if (!$name && $q->get('post_type') === 'product') $name = $q->get('name');
            if ($name) $post = get_page_by_path($name, OBJECT, 'product');
        }
        if (!$post || $post->post_type !== 'product') return;
        if (in_array($post->post_status, array('publish', 'trash'), true)) return;

        $uid = get_current_user_id();
        if (current_user_can('manage_options') || self::owns_course($uid, $post->ID)) {
            $q->set('post_status', array('publish', 'draft', 'pending', 'private', 'future'));
        }
    }

    /* ============================================================
     * Admin: ürünler listesi "Eğitmen" sütunu
     * ============================================================ */

    public function add_product_teacher_column($cols) {
        $new = array();
        foreach ($cols as $k => $v) {
            $new[$k] = $v;
            if ($k === 'name') $new['oes_teacher'] = 'Eğitmen';
        }
        if (!isset($new['oes_teacher'])) $new['oes_teacher'] = 'Eğitmen';
        return $new;
    }

    public function render_product_teacher_column($col, $post_id) {
        if ($col !== 'oes_teacher') return;
        if (get_post_meta($post_id, '_oes_is_course', true) !== 'yes') { echo '—'; return; }
        $author_id = (int) get_post_field('post_author', $post_id);
        $u = $author_id ? get_userdata($author_id) : null;
        if ($u) {
            echo esc_html($u->display_name)
               . '<br><span style="color:#888;font-size:11px;">' . esc_html($u->user_email) . '</span>';
        } else {
            echo '—';
        }
    }

    /* ============================================================
     * Rol & Capability
     * ============================================================ */

    /**
     * `oes_teacher` rolünü kaydeder (yoksa). Eğitmen ikincil rol olarak
     * kullanıcıya eklenir; mevcut rolü (customer vb.) korunur.
     */
    public function ensure_role() {
        if (get_role(self::ROLE)) return;

        add_role(self::ROLE, 'Eğitmen', array(
            'read'         => true,
            'upload_files' => true,   // panelden görsel/dosya yükleyebilsin
            self::CAP      => true,    // panel erişim işareti
        ));

        // Yöneticiler de eğitmen yeteneğine sahip olsun (panel önizleme/yönetim)
        $admin = get_role('administrator');
        if ($admin && !$admin->has_cap(self::CAP)) {
            $admin->add_cap(self::CAP);
        }
    }

    /* ============================================================
     * Şema göçü: oes_instructors.user_id
     * ============================================================ */

    public function maybe_upgrade_schema() {
        if (get_option('oes_teacher_schema_version') === '1.0') return;

        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';

        $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table;

        // Tablo yoksa: instructors modülü aktifse oluştur (user_id dahil).
        // Modül kapalıysa sessizce geç; açılınca bu göç tekrar denenir.
        if (!$exists) {
            if (!class_exists('OES_Module_Manager') || !OES_Module_Manager::is_active('instructors')) {
                return; // version'ı işaretleme → sonra tekrar denenecek
            }
            $charset_collate = $wpdb->get_charset_collate();
            require_once ABSPATH . 'wp-admin/includes/upgrade.php';
            dbDelta("CREATE TABLE {$table} (
                id bigint(20) NOT NULL AUTO_INCREMENT,
                user_id bigint(20) DEFAULT NULL,
                name varchar(255) NOT NULL,
                title varchar(255) DEFAULT '',
                email varchar(255) DEFAULT '',
                phone varchar(50) DEFAULT '',
                bio text,
                photo_url varchar(500) DEFAULT '',
                social_links text,
                status varchar(20) DEFAULT 'active',
                created_at datetime DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY user_id (user_id)
            ) $charset_collate;");
        } else {
            // Tablo var: user_id kolonu eksikse ekle.
            $columns = $wpdb->get_col("DESCRIBE {$table}", 0);
            if (!in_array('user_id', $columns, true)) {
                $wpdb->query("ALTER TABLE {$table} ADD COLUMN user_id bigint(20) DEFAULT NULL AFTER id");
                $wpdb->query("ALTER TABLE {$table} ADD KEY user_id (user_id)");
            }
        }

        update_option('oes_teacher_schema_version', '1.0');
    }

    /* ============================================================
     * Kimlik yardımcıları
     * ============================================================ */

    /**
     * Kullanıcı eğitmen mi?
     */
    public static function is_teacher($user_id = null) {
        if ($user_id === null) $user_id = get_current_user_id();
        if (!$user_id) return false;
        $user = get_userdata($user_id);
        return $user && in_array(self::ROLE, (array) $user->roles, true);
    }

    /**
     * Süper eğitmen mi? (toplu duyuru gönderebilir)
     * = yönetici VEYA (_oes_super_teacher meta'sı olan eğitmen)
     */
    public static function is_super_teacher($user_id = null) {
        if ($user_id === null) $user_id = get_current_user_id();
        if (!$user_id) return false;
        if (user_can($user_id, 'manage_options')) return true;
        return self::is_teacher($user_id) && get_user_meta($user_id, '_oes_super_teacher', true) === 'yes';
    }

    /**
     * Eğitmen panelini görebilir mi? (eğitmen veya yönetici)
     */
    public static function can_access_panel($user_id = null) {
        if ($user_id === null) $user_id = get_current_user_id();
        if (!$user_id) return false;
        return self::is_teacher($user_id) || user_can($user_id, 'manage_options');
    }

    /**
     * Kullanıcıya bağlı eğitmen profil ID'si (yoksa 0).
     */
    public static function get_instructor_id($user_id) {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        if (!self::instructors_has_user_id($table)) return 0;
        $id = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$table} WHERE user_id = %d LIMIT 1",
            $user_id
        ));
        return (int) $id;
    }

    private static function instructors_has_user_id($table) {
        global $wpdb;
        static $cache = array();
        if (isset($cache[$table])) return $cache[$table];
        $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
        if ($exists !== $table) return $cache[$table] = false;
        $columns = $wpdb->get_col("DESCRIBE {$table}", 0);
        return $cache[$table] = in_array('user_id', $columns, true);
    }

    /* ============================================================
     * Sahiplik / kurs yardımcıları (sonraki fazlar için)
     * ============================================================ */

    /**
     * Bu eğitmenin kurslarının (WooCommerce ürün) ID'leri.
     * Sahiplik = ürünün yazarı (post_author) VEYA _oes_instructor_id eşleşmesi.
     */
    public static function get_teacher_course_ids($user_id) {
        global $wpdb;

        $instructor_id = self::get_instructor_id($user_id);

        // 1) Yazarı bu kullanıcı olan kurs ürünleri
        $by_author = $wpdb->get_col($wpdb->prepare(
            "SELECT p.ID FROM {$wpdb->posts} p
             INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_oes_is_course' AND m.meta_value = 'yes'
             WHERE p.post_type = 'product' AND p.post_author = %d
             AND p.post_status IN ('publish','draft','pending','private')",
            $user_id
        ));

        // 2) _oes_instructor_id ile bu eğitmene atanmış kurslar
        $by_instructor = array();
        if ($instructor_id > 0) {
            $by_instructor = $wpdb->get_col($wpdb->prepare(
                "SELECT p.ID FROM {$wpdb->posts} p
                 INNER JOIN {$wpdb->postmeta} c ON c.post_id = p.ID AND c.meta_key = '_oes_is_course' AND c.meta_value = 'yes'
                 INNER JOIN {$wpdb->postmeta} i ON i.post_id = p.ID AND i.meta_key = '_oes_instructor_id' AND i.meta_value = %d
                 WHERE p.post_type = 'product'
                 AND p.post_status IN ('publish','draft','pending','private')",
                $instructor_id
            ));
        }

        $ids = array_map('intval', array_unique(array_merge((array) $by_author, (array) $by_instructor)));
        return array_values(array_filter($ids));
    }

    /**
     * Eğitmenin tüm kurslarına kayıtlı (aktif) öğrenciler — benzersiz.
     */
    public static function get_teacher_students($user_id) {
        global $wpdb;
        $course_ids = self::get_teacher_course_ids($user_id);
        if (empty($course_ids)) return array();
        $ph = implode(',', array_fill(0, count($course_ids), '%d'));

        return $wpdb->get_results($wpdb->prepare(
            "SELECT e.user_id, u.display_name, u.user_email,
                    COUNT(DISTINCT e.course_id) AS course_count,
                    MIN(e.enrolled_at) AS first_enrolled,
                    GROUP_CONCAT(DISTINCT p.post_title SEPARATOR '||') AS course_titles
             FROM {$wpdb->prefix}oes_enrollments e
             INNER JOIN {$wpdb->users} u ON u.ID = e.user_id
             LEFT JOIN {$wpdb->posts} p ON p.ID = e.course_id
             WHERE e.status = 'active' AND e.course_id IN ($ph)
             GROUP BY e.user_id, u.display_name, u.user_email
             ORDER BY u.display_name ASC",
            $course_ids
        ));
    }

    /**
     * Eğitmen bu kursun sahibi mi?
     */
    public static function owns_course($user_id, $course_id) {
        $course_id = (int) $course_id;
        if (!$course_id) return false;
        // Yönetici her kursu yönetebilir (wp-admin'den yeni editörle her şeye müdahale)
        if (user_can($user_id, 'manage_options')) return true;
        return in_array($course_id, self::get_teacher_course_ids($user_id), true);
    }

    /* ============================================================
     * Eğitmen atama (rol + eğitmen profili bağlama/oluşturma)
     * ============================================================ */

    /**
     * Bir kullanıcıyı eğitmen yap: ikincil rol ekle + eğitmen profili bağla/oluştur.
     */
    public static function make_teacher($user_id) {
        $user = get_userdata($user_id);
        if (!$user) return false;

        if (!in_array(self::ROLE, (array) $user->roles, true)) {
            $user->add_role(self::ROLE);
        }

        self::ensure_instructor_profile($user_id);
        return true;
    }

    /**
     * Eğitmenliği kaldır: rolü çıkar. Eğitmen profili (foto/bio) SİLİNMEZ,
     * yalnızca bağlantı korunur; kurs sayfalarındaki gösterim bozulmasın.
     */
    public static function remove_teacher($user_id) {
        $user = get_userdata($user_id);
        if (!$user) return false;
        if (in_array(self::ROLE, (array) $user->roles, true)) {
            $user->remove_role(self::ROLE);
        }
        return true;
    }

    /**
     * Kullanıcıya bağlı bir eğitmen profili yoksa oluşturur.
     * instructors tablosu yoksa (modül hiç açılmamışsa) sessizce geçer.
     */
    public static function ensure_instructor_profile($user_id) {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';

        if (!self::instructors_has_user_id($table)) return 0;

        // Zaten bağlı profil var mı?
        $existing = self::get_instructor_id($user_id);
        if ($existing) return $existing;

        $user = get_userdata($user_id);
        if (!$user) return 0;

        $name = trim($user->first_name . ' ' . $user->last_name);
        if ($name === '') $name = $user->display_name ?: $user->user_login;

        $wpdb->insert($table, array(
            'user_id'    => $user_id,
            'name'       => $name,
            'email'      => $user->user_email,
            'status'     => 'active',
            'created_at' => current_time('mysql'),
        ));

        return (int) $wpdb->insert_id;
    }

    /**
     * Yalnızca rol atar (eğitmen profili OLUŞTURMAZ).
     * Eğitmenler sayfasından mevcut bir profili bir kullanıcıya bağlarken kullanılır.
     */
    public static function assign_role($user_id) {
        $user = get_userdata($user_id);
        if (!$user) return false;
        if (!in_array(self::ROLE, (array) $user->roles, true)) {
            $user->add_role(self::ROLE);
        }
        return true;
    }

    /**
     * Kullanıcı artık hiçbir eğitmen profiline bağlı değilse eğitmen rolünü kaldırır.
     */
    public static function revoke_role_if_orphan($user_id) {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        if (self::instructors_has_user_id($table)) {
            $count = (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE user_id = %d",
                $user_id
            ));
            if ($count > 0) return false; // hâlâ bir profile bağlı
        }
        self::remove_teacher($user_id);
        return true;
    }

    /**
     * instructors tablosunda user_id kolonunu garantiler (yoksa ekler).
     */
    public static function ensure_user_id_column() {
        global $wpdb;
        $table = $wpdb->prefix . 'oes_instructors';
        $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table;
        if (!$exists) return false;
        $columns = $wpdb->get_col("DESCRIBE {$table}", 0);
        if (!in_array('user_id', $columns, true)) {
            $wpdb->query("ALTER TABLE {$table} ADD COLUMN user_id bigint(20) DEFAULT NULL AFTER id");
            $wpdb->query("ALTER TABLE {$table} ADD KEY user_id (user_id)");
        }
        return true;
    }

    /* ============================================================
     * Admin UI — kullanıcı profili
     * ============================================================ */

    public function render_user_profile_field($user) {
        if (!current_user_can('manage_options')) return;
        $is_teacher = in_array(self::ROLE, (array) $user->roles, true);
        $is_super   = get_user_meta($user->ID, '_oes_super_teacher', true) === 'yes';
        wp_nonce_field('oes_teacher_assign_' . $user->ID, 'oes_teacher_nonce');
        ?>
        <h2>Online Eğitim Sistemi — Eğitmen</h2>
        <table class="form-table" role="presentation">
            <tr>
                <th><label for="oes_is_teacher">Eğitmen yetkisi</label></th>
                <td>
                    <label>
                        <input type="checkbox" name="oes_is_teacher" id="oes_is_teacher" value="1" <?php checked($is_teacher); ?> />
                        Bu kullanıcı bir eğitmendir (eğitmen paneline erişebilir, kendi kurslarını yönetebilir)
                    </label>
                    <p class="description">
                        İşaretlendiğinde kullanıcıya <code>oes_teacher</code> rolü eklenir ve bir eğitmen profili
                        (foto/biyografi için) bağlanır. Mevcut rolü korunur. Eğitmen girişi:
                        <code><?php echo esc_html(home_url('/egitmen/')); ?></code>
                    </p>
                </td>
            </tr>
            <tr>
                <th><label for="oes_is_super_teacher">Süper eğitmen</label></th>
                <td>
                    <label>
                        <input type="checkbox" name="oes_is_super_teacher" id="oes_is_super_teacher" value="1" <?php checked($is_super); ?> />
                        Bu eğitmen panelinden <strong>tüm öğrencilerine toplu duyuru/bildirim</strong> gönderebilir
                    </label>
                    <p class="description">Yalnızca eğitmen yetkisi olan kullanıcılar için geçerlidir. Normal eğitmenler toplu duyuru gönderemez.</p>
                </td>
            </tr>
        </table>
        <?php
    }

    public function save_user_profile_field($user_id) {
        if (!current_user_can('manage_options')) return;
        if (!isset($_POST['oes_teacher_nonce']) ||
            !wp_verify_nonce($_POST['oes_teacher_nonce'], 'oes_teacher_assign_' . $user_id)) {
            return;
        }

        $want_teacher = !empty($_POST['oes_is_teacher']);
        $is_teacher   = self::is_teacher($user_id);

        if ($want_teacher && !$is_teacher) {
            self::make_teacher($user_id);
        } elseif (!$want_teacher && $is_teacher) {
            self::remove_teacher($user_id);
        }

        // Süper eğitmen (yalnızca eğitmenken anlamlı) — make_teacher üstte çalıştığı için
        // gerçek rol durumuna bakıyoruz, POST'a değil (daha güvenilir).
        if (!empty($_POST['oes_is_super_teacher']) && self::is_teacher($user_id)) {
            update_user_meta($user_id, '_oes_super_teacher', 'yes');
        } else {
            delete_user_meta($user_id, '_oes_super_teacher');
        }
    }

    /* ============================================================
     * Admin UI — kullanıcılar listesi sütunu
     * ============================================================ */

    public function add_users_column($columns) {
        $columns['oes_teacher'] = 'Eğitmen';
        return $columns;
    }

    public function render_users_column($output, $column_name, $user_id) {
        if ($column_name !== 'oes_teacher') return $output;
        if (self::is_teacher($user_id)) {
            $html = '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#e0f2fe;color:#0369a1;font-size:11px;font-weight:600;">✓ Eğitmen</span>';
            if (get_user_meta($user_id, '_oes_super_teacher', true) === 'yes') {
                $html .= ' <span style="display:inline-block;padding:2px 8px;border-radius:10px;background:#ede9fe;color:#7c3aed;font-size:11px;font-weight:600;">★ Süper</span>';
            }
            return $html;
        }
        return '<span style="color:#cbd5e1;">—</span>';
    }
}

OES_Teacher::instance();
