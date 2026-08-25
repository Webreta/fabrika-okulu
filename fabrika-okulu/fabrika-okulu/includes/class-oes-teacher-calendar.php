<?php
/**
 * OES Teacher Calendar — Hibrit takvim: dönem oturumları + kişisel etkinlikler + randevular
 *
 * - oes_teacher_events: eğitmenin kişisel takvim etkinlikleri
 * - oes_appointment_slots: eğitmenin sunduğu randevu saatleri (somut tarih+saat)
 * - oes_appointments: öğrenci rezervasyonları
 * Takvim, eğitmenin kurslarına ait dönem programlarını (oes_periods.schedule) da
 * canlı olarak birleştirir. Çakışma uyarısı tüm kaynakları kapsar.
 */

if (!defined('ABSPATH')) {
    exit;
}

class OES_Teacher_Calendar {

    private static $instance = null;
    const NONCE = 'oes_teacher_panel';

    public static function instance() {
        if (is_null(self::$instance)) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_init', array($this, 'maybe_create_tables'));
        add_action('init', array($this, 'maybe_create_tables'), 5);

        add_action('wp_ajax_oes_tp_save_event',    array($this, 'ajax_save_event'));
        add_action('wp_ajax_oes_tp_delete_event',  array($this, 'ajax_delete_event'));
        add_action('wp_ajax_oes_tp_save_slot',     array($this, 'ajax_save_slot'));
        add_action('wp_ajax_oes_tp_delete_slot',   array($this, 'ajax_delete_slot'));

        // WooCommerce randevu rezervasyonu (additive)
        add_action('woocommerce_before_add_to_cart_button', array($this, 'render_appointment_picker'));
        add_filter('woocommerce_add_to_cart_validation',    array($this, 'validate_slot_capacity'), 10, 3);
        add_filter('woocommerce_add_cart_item_data',        array($this, 'add_slot_to_cart'), 10, 2);
        add_filter('woocommerce_get_item_data',             array($this, 'display_slot_in_cart'), 10, 2);
        add_action('woocommerce_checkout_create_order_line_item', array($this, 'save_slot_to_order_item'), 10, 4);
        add_action('woocommerce_order_status_completed',    array($this, 'create_bookings_for_order'));
        add_action('woocommerce_order_status_processing',   array($this, 'create_bookings_for_order'));
        add_action('woocommerce_order_status_cancelled',    array($this, 'release_bookings_for_order'));
        add_action('woocommerce_order_status_refunded',     array($this, 'release_bookings_for_order'));
        add_action('woocommerce_order_status_failed',       array($this, 'release_bookings_for_order'));
    }

    /** İptal/iade edilen siparişin randevularını serbest bırak (kontenjanı iade et) */
    public function release_bookings_for_order($order_id) {
        global $wpdb;
        $wpdb->update(
            $wpdb->prefix . 'oes_appointments',
            array('status' => 'cancelled'),
            array('order_id' => (int) $order_id, 'status' => 'booked')
        );
    }

    /* ---------------------------------------------------------------------
     *  Randevu rezervasyonu (öğrenci tarafı, WooCommerce)
     * ------------------------------------------------------------------- */

    /** Bu kursun gelecekteki müsait (booked < capacity) slotları */
    public static function available_slots($course_id) {
        global $wpdb;
        $now = current_time('Y-m-d');
        return $wpdb->get_results($wpdb->prepare(
            "SELECT s.*, (SELECT COUNT(*) FROM {$wpdb->prefix}oes_appointments WHERE slot_id = s.id AND status='booked') AS booked
             FROM {$wpdb->prefix}oes_appointment_slots s
             WHERE s.course_id = %d AND s.slot_date >= %s
             HAVING booked < s.capacity
             ORDER BY s.slot_date ASC, s.start_time ASC",
            $course_id, $now
        ));
    }

    public function render_appointment_picker() {
        global $product;
        if (!$product || get_post_meta($product->get_id(), '_oes_is_course', true) !== 'yes') return;
        $slots = self::available_slots($product->get_id());
        if (empty($slots)) return;
        ?>
        <div class="oes-appt-picker">
            <div class="oes-appt-title">Randevu saati seçin</div>
            <input type="hidden" name="oes_appt_slot" id="oesApptSlot" value="">
            <div class="oes-appt-slots">
                <?php foreach ($slots as $s):
                    $rem = intval($s->capacity) - intval($s->booked);
                ?>
                <label class="oes-appt-slot">
                    <input type="radio" name="oes_appt_slot_r" value="<?php echo intval($s->id); ?>" onclick="document.getElementById('oesApptSlot').value=this.value;">
                    <span><strong><?php echo esc_html(date_i18n('d M Y', strtotime($s->slot_date))); ?></strong>
                    <?php echo esc_html(substr($s->start_time,0,5) . '–' . substr($s->end_time,0,5)); ?>
                    <em><?php echo intval($rem); ?> yer</em></span>
                </label>
                <?php endforeach; ?>
            </div>
        </div>
        <style>
        .oes-appt-picker{margin:14px 0;padding:14px;border:1px solid #e5ebf3;border-radius:12px;background:#f8fafc}
        .oes-appt-title{font-weight:600;color:#0f172a;margin-bottom:10px}
        .oes-appt-slots{display:grid;gap:8px}
        .oes-appt-slot{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid #d7dee8;border-radius:9px;background:#fff;cursor:pointer}
        .oes-appt-slot span{display:flex;flex-direction:column;font-size:13px;color:#334155}
        .oes-appt-slot em{color:#0f6e56;font-style:normal;font-size:12px}
        </style>
        <?php
    }

    /** Sepete eklerken slot kapasitesini kontrol et (aşırı satışı önler) */
    public function validate_slot_capacity($passed, $product_id, $qty) {
        if (empty($_POST['oes_appt_slot'])) return $passed;
        global $wpdb;
        $slot_id = intval($_POST['oes_appt_slot']);
        $slot = $wpdb->get_row($wpdb->prepare("SELECT capacity FROM {$wpdb->prefix}oes_appointment_slots WHERE id = %d", $slot_id));
        if (!$slot) return $passed;
        $booked = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}oes_appointments WHERE slot_id = %d AND status = 'booked'", $slot_id));
        if ($booked >= (int) $slot->capacity) {
            if (function_exists('wc_add_notice')) wc_add_notice('Seçtiğiniz randevu saati doldu. Lütfen başka bir saat seçin.', 'error');
            return false;
        }
        return $passed;
    }

    public function add_slot_to_cart($cart_item_data, $product_id) {
        if (!empty($_POST['oes_appt_slot'])) {
            $slot_id = intval($_POST['oes_appt_slot']);
            $slots = self::available_slots($product_id);
            foreach ($slots as $s) {
                if ((int) $s->id === $slot_id) { $cart_item_data['oes_appt_slot'] = $slot_id; break; }
            }
        }
        return $cart_item_data;
    }

    public function display_slot_in_cart($item_data, $cart_item) {
        if (!empty($cart_item['oes_appt_slot'])) {
            global $wpdb;
            $s = $wpdb->get_row($wpdb->prepare("SELECT slot_date, start_time, end_time FROM {$wpdb->prefix}oes_appointment_slots WHERE id = %d", intval($cart_item['oes_appt_slot'])));
            if ($s) {
                $item_data[] = array('key' => 'Randevu', 'value' => date_i18n('d M Y', strtotime($s->slot_date)) . ' ' . substr($s->start_time,0,5));
            }
        }
        return $item_data;
    }

    public function save_slot_to_order_item($item, $cart_item_key, $values, $order) {
        if (!empty($values['oes_appt_slot'])) {
            $item->add_meta_data('_oes_appt_slot', intval($values['oes_appt_slot']), true);
        }
    }

    public function create_bookings_for_order($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) return;
        $user_id = $order->get_user_id();
        if (!$user_id) return;

        global $wpdb;
        foreach ($order->get_items() as $item) {
            $slot_id = (int) $item->get_meta('_oes_appt_slot');
            if (!$slot_id) continue;

            $slot = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_appointment_slots WHERE id = %d", $slot_id));
            if (!$slot) continue;

            // Zaten bu sipariş için oluşturulmuş mu?
            $exists = $wpdb->get_var($wpdb->prepare(
                "SELECT id FROM {$wpdb->prefix}oes_appointments WHERE slot_id = %d AND user_id = %d AND order_id = %d",
                $slot_id, $user_id, $order_id
            ));
            if ($exists) continue;

            // Kapasite kontrolü — dolu ise sessizce geçme, sipariş notu bırak
            $booked = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}oes_appointments WHERE slot_id = %d AND status='booked'", $slot_id));
            if ($booked >= (int) $slot->capacity) {
                $order->add_order_note('⚠ Randevu kontenjanı dolu olduğu için otomatik rezervasyon yapılamadı (slot #' . $slot_id . '). Öğrenciyle iletişime geçilmeli.');
                continue;
            }

            $wpdb->insert($wpdb->prefix . 'oes_appointments', array(
                'slot_id'    => $slot_id,
                'teacher_id' => $slot->teacher_id,
                'course_id'  => $slot->course_id,
                'user_id'    => $user_id,
                'order_id'   => $order_id,
                'status'     => 'booked',
            ));

            // Eğitmene push
            $stu = get_userdata($user_id);
            $info = ($stu ? $stu->display_name . ' · ' : '') . date_i18n('d M', strtotime($slot->slot_date)) . ' ' . substr($slot->start_time, 0, 5);
            do_action('oes_appointment_booked', (int) $slot->teacher_id, $info);
        }
    }

    public function maybe_create_tables() {
        global $wpdb;
        static $checked = false;
        if ($checked) return;
        $checked = true;

        // En son oluşturulan tabloya (appointments) göre kontrol: biri eksikse üçünü de kur (dbDelta idempotent).
        $last = $wpdb->prefix . 'oes_appointments';
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $last)) === $last) return;

        $cs = $wpdb->get_charset_collate();
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        dbDelta("CREATE TABLE {$wpdb->prefix}oes_teacher_events (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            teacher_id bigint(20) NOT NULL,
            title varchar(255) NOT NULL,
            event_date date NOT NULL,
            start_time time DEFAULT NULL,
            end_time time DEFAULT NULL,
            color varchar(20) DEFAULT '#0b2a5e',
            note text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY teacher_date (teacher_id, event_date)
        ) $cs;");

        dbDelta("CREATE TABLE {$wpdb->prefix}oes_appointment_slots (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            teacher_id bigint(20) NOT NULL,
            course_id bigint(20) DEFAULT NULL,
            slot_date date NOT NULL,
            start_time time NOT NULL,
            end_time time NOT NULL,
            capacity int(11) NOT NULL DEFAULT 1,
            note varchar(255) DEFAULT '',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY teacher_date (teacher_id, slot_date),
            KEY course_id (course_id)
        ) $cs;");

        dbDelta("CREATE TABLE {$wpdb->prefix}oes_appointments (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            slot_id bigint(20) NOT NULL,
            teacher_id bigint(20) NOT NULL,
            course_id bigint(20) DEFAULT NULL,
            user_id bigint(20) NOT NULL,
            order_id bigint(20) DEFAULT NULL,
            status varchar(20) DEFAULT 'booked',
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY slot_id (slot_id),
            KEY user_id (user_id)
        ) $cs;");

        update_option('oes_teacher_cal_db', '1.0');
    }

    private function guard() {
        check_ajax_referer(self::NONCE, 'nonce');
        if (!OES_Teacher::can_access_panel()) wp_send_json_error('Yetkiniz yok.');
        return get_current_user_id();
    }

    /* ---------------------------------------------------------------------
     *  Kişisel etkinlik CRUD
     * ------------------------------------------------------------------- */
    public function ajax_save_event() {
        $user_id = $this->guard();
        global $wpdb;

        $id    = intval($_POST['event_id'] ?? 0);
        $title = sanitize_text_field($_POST['title'] ?? '');
        $date  = sanitize_text_field($_POST['event_date'] ?? '');
        $start = sanitize_text_field($_POST['start_time'] ?? '');
        $end   = sanitize_text_field($_POST['end_time'] ?? '');
        $force = !empty($_POST['force']);

        if ($title === '' || $date === '') wp_send_json_error('Başlık ve tarih zorunludur.');

        // Çakışma kontrolü (kullanıcı onaylamadıysa) — başlangıç saati varsa yeter
        if (!$force && $start) {
            $conflicts = self::find_conflicts($user_id, $date, $start, $end, $id);
            if (!empty($conflicts)) {
                wp_send_json_success(array('conflict' => true, 'conflicts' => $conflicts));
            }
        }

        $data = array(
            'teacher_id' => $user_id,
            'title'      => $title,
            'event_date' => $date,
            'start_time' => $start ?: null,
            'end_time'   => $end ?: null,
            'color'      => sanitize_hex_color($_POST['color'] ?? '') ?: '#0b2a5e',
            'note'       => sanitize_textarea_field(wp_unslash($_POST['note'] ?? '')),
        );

        if ($id) {
            // Sahiplik: kendi etkinliği mi
            $owner = (int) $wpdb->get_var($wpdb->prepare("SELECT teacher_id FROM {$wpdb->prefix}oes_teacher_events WHERE id = %d", $id));
            if ($owner !== (int) $user_id) wp_send_json_error('Yetkiniz yok.');
            $wpdb->update($wpdb->prefix . 'oes_teacher_events', $data, array('id' => $id));
        } else {
            $wpdb->insert($wpdb->prefix . 'oes_teacher_events', $data);
            $id = $wpdb->insert_id;
        }

        wp_send_json_success(array('saved' => true, 'id' => $id, 'message' => 'Etkinlik kaydedildi.'));
    }

    public function ajax_delete_event() {
        $user_id = $this->guard();
        global $wpdb;
        $id = intval($_POST['event_id'] ?? 0);
        $owner = (int) $wpdb->get_var($wpdb->prepare("SELECT teacher_id FROM {$wpdb->prefix}oes_teacher_events WHERE id = %d", $id));
        if (!$id || $owner !== (int) $user_id) wp_send_json_error('Yetkiniz yok.');
        $wpdb->delete($wpdb->prefix . 'oes_teacher_events', array('id' => $id));
        wp_send_json_success(array('message' => 'Silindi.'));
    }

    /* ---------------------------------------------------------------------
     *  Randevu slotu CRUD
     * ------------------------------------------------------------------- */
    public function ajax_save_slot() {
        $user_id = $this->guard();
        global $wpdb;

        $id    = intval($_POST['slot_id'] ?? 0);
        $date  = sanitize_text_field($_POST['slot_date'] ?? '');
        $start = sanitize_text_field($_POST['start_time'] ?? '');
        $end   = sanitize_text_field($_POST['end_time'] ?? '');
        $cap   = max(1, intval($_POST['capacity'] ?? 1));
        $course_id = !empty($_POST['course_id']) ? intval($_POST['course_id']) : null;
        $force = !empty($_POST['force']);

        if ($date === '' || $start === '' || $end === '') wp_send_json_error('Tarih ve saat zorunludur.');
        if ($course_id && !OES_Teacher::owns_course($user_id, $course_id)) wp_send_json_error('Bu kursa yetkiniz yok.');

        if (!$force) {
            $conflicts = self::find_conflicts($user_id, $date, $start, $end, 0, $id);
            if (!empty($conflicts)) {
                wp_send_json_success(array('conflict' => true, 'conflicts' => $conflicts));
            }
        }

        $data = array(
            'teacher_id' => $user_id,
            'course_id'  => $course_id,
            'slot_date'  => $date,
            'start_time' => $start,
            'end_time'   => $end,
            'capacity'   => $cap,
            'note'       => sanitize_text_field($_POST['note'] ?? ''),
        );

        if ($id) {
            $owner = (int) $wpdb->get_var($wpdb->prepare("SELECT teacher_id FROM {$wpdb->prefix}oes_appointment_slots WHERE id = %d", $id));
            if ($owner !== (int) $user_id) wp_send_json_error('Yetkiniz yok.');
            $wpdb->update($wpdb->prefix . 'oes_appointment_slots', $data, array('id' => $id));
        } else {
            $wpdb->insert($wpdb->prefix . 'oes_appointment_slots', $data);
            $id = $wpdb->insert_id;
        }
        wp_send_json_success(array('saved' => true, 'id' => $id, 'message' => 'Randevu saati kaydedildi.'));
    }

    public function ajax_delete_slot() {
        $user_id = $this->guard();
        global $wpdb;
        $id = intval($_POST['slot_id'] ?? 0);
        $owner = (int) $wpdb->get_var($wpdb->prepare("SELECT teacher_id FROM {$wpdb->prefix}oes_appointment_slots WHERE id = %d", $id));
        if (!$id || $owner !== (int) $user_id) wp_send_json_error('Yetkiniz yok.');
        // Rezervasyon varsa silme
        $booked = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}oes_appointments WHERE slot_id = %d AND status = 'booked'", $id));
        if ($booked > 0) wp_send_json_error('Bu saatte rezervasyon var, silinemez.');
        $wpdb->delete($wpdb->prefix . 'oes_appointment_slots', array('id' => $id));
        wp_send_json_success(array('message' => 'Silindi.'));
    }

    /* ---------------------------------------------------------------------
     *  Çakışma tespiti (tüm kaynaklar)
     * ------------------------------------------------------------------- */
    public static function find_conflicts($user_id, $date, $start, $end, $exclude_event = 0, $exclude_slot = 0) {
        $out = array();
        if (!$start) return $out; // saatsiz (gün boyu) etkinlikte çakışma arama
        $s1 = strtotime("$date $start");
        if (!$s1) return $out;
        // Bitiş yoksa/geçersizse varsayılan +1 saat
        $e1 = ($end && strtotime("$date $end") > $s1) ? strtotime("$date $end") : $s1 + 3600;

        $events = self::get_calendar($user_id, $date, $date);
        foreach ($events as $ev) {
            if (empty($ev['start'])) continue; // saatsiz mevcut öğeyi atla
            if ($exclude_event && $ev['type'] === 'personal' && (int) $ev['id'] === (int) $exclude_event) continue;
            if ($exclude_slot && $ev['type'] === 'slot' && (int) $ev['id'] === (int) $exclude_slot) continue;

            $s2 = strtotime("$date " . $ev['start']);
            if (!$s2) continue;
            $e2 = (!empty($ev['end']) && strtotime("$date " . $ev['end']) > $s2) ? strtotime("$date " . $ev['end']) : $s2 + 3600;

            if ($s2 < $e1 && $s1 < $e2) { // zaman aralıkları örtüşüyor
                $label = substr($ev['start'], 0, 5) . (!empty($ev['end']) ? '–' . substr($ev['end'], 0, 5) : '');
                $out[] = array('title' => $ev['title'], 'time' => $label, 'type' => $ev['type']);
            }
        }
        return $out;
    }

    /* ---------------------------------------------------------------------
     *  Takvim toplama: dönem oturumları + kişisel etkinlik + slot + randevu
     * ------------------------------------------------------------------- */
    public static function get_calendar($user_id, $from_date, $to_date) {
        global $wpdb;
        $events = array();

        // 1) Kişisel etkinlikler
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}oes_teacher_events WHERE teacher_id = %d AND event_date BETWEEN %s AND %s",
            $user_id, $from_date, $to_date
        ));
        foreach ($rows as $r) {
            $events[] = array('id'=>(int)$r->id, 'type'=>'personal', 'date'=>$r->event_date, 'start'=>$r->start_time, 'end'=>$r->end_time,
                'title'=>$r->title, 'color'=>$r->color ?: '#0b2a5e', 'note'=>$r->note, 'meta'=>'Kişisel');
        }

        // 2) Randevu slotları + rezervasyon sayısı
        $slots = $wpdb->get_results($wpdb->prepare(
            "SELECT s.*, p.post_title AS course_name,
                    (SELECT COUNT(*) FROM {$wpdb->prefix}oes_appointments WHERE slot_id = s.id AND status='booked') AS booked
             FROM {$wpdb->prefix}oes_appointment_slots s
             LEFT JOIN {$wpdb->posts} p ON s.course_id = p.ID
             WHERE s.teacher_id = %d AND s.slot_date BETWEEN %s AND %s",
            $user_id, $from_date, $to_date
        ));
        foreach ($slots as $s) {
            $events[] = array('id'=>(int)$s->id, 'type'=>'slot', 'date'=>$s->slot_date, 'start'=>$s->start_time, 'end'=>$s->end_time,
                'title'=>($s->course_name ? $s->course_name : 'Randevu') . ' — ' . intval($s->booked) . '/' . intval($s->capacity),
                'color'=>'#0f6e56', 'note'=>$s->note, 'meta'=>'Randevu slotu', 'booked'=>(int)$s->booked, 'capacity'=>(int)$s->capacity);
        }

        // 3) Dönem oturumları (eğitmenin kurslarına ait periyotların schedule'ı)
        $course_ids = OES_Teacher::get_teacher_course_ids($user_id);
        if (!empty($course_ids)) {
            $ph = implode(',', array_fill(0, count($course_ids), '%d'));
            $periods = $wpdb->get_results($wpdb->prepare(
                "SELECT per.name, per.schedule, p.post_title AS course_name
                 FROM {$wpdb->prefix}oes_periods per
                 LEFT JOIN {$wpdb->posts} p ON per.course_id = p.ID
                 WHERE per.course_id IN ($ph) AND per.schedule IS NOT NULL AND per.schedule != ''",
                $course_ids
            ));
            foreach ($periods as $per) {
                $sch = json_decode($per->schedule, true);
                if (!is_array($sch)) continue;
                foreach ($sch as $item) {
                    $d = $item['date'] ?? '';
                    if (!$d || $d < $from_date || $d > $to_date) continue;
                    $t = $item['time'] ?? '';
                    $events[] = array('id'=>0, 'type'=>'period', 'date'=>$d, 'start'=>$t ?: null, 'end'=>null,
                        'title'=>($item['title'] ?? 'Oturum') . ' · ' . $per->course_name,
                        'color'=>'#7c3aed', 'note'=>($item['notes'] ?? ''), 'link'=>($item['link'] ?? ''), 'meta'=>$per->name);
                }
            }
        }

        // Tarihe + saate göre sırala
        usort($events, function ($a, $b) {
            $ka = $a['date'] . ' ' . ($a['start'] ?: '00:00');
            $kb = $b['date'] . ' ' . ($b['start'] ?: '00:00');
            return strcmp($ka, $kb);
        });

        return $events;
    }

    /** Bir slotun rezervasyonları (öğrenci adlarıyla) */
    public static function get_slot_bookings($user_id, $slot_id) {
        global $wpdb;
        $slot_id = (int) $slot_id;
        $owner = (int) $wpdb->get_var($wpdb->prepare("SELECT teacher_id FROM {$wpdb->prefix}oes_appointment_slots WHERE id = %d", $slot_id));
        if ($owner !== (int) $user_id) return array();
        return $wpdb->get_results($wpdb->prepare(
            "SELECT a.*, u.display_name, u.user_email FROM {$wpdb->prefix}oes_appointments a
             LEFT JOIN {$wpdb->users} u ON a.user_id = u.ID
             WHERE a.slot_id = %d AND a.status='booked' ORDER BY a.created_at ASC", $slot_id
        ));
    }
}

OES_Teacher_Calendar::instance();
