<?php
/**
 * Eğitmen — Mesajlarım.
 * Liste, okundu işaretleme ve "devamını yükle" öğrenci paneliyle AYNI koddan gelir
 * (OES_Notifications) — iki panel ayrışmasın.
 * Beklenen: $data, $panel
 */
if (!defined('ABSPATH')) exit;

$uid = intval($data['user']['id']);
?>
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">
  <div>
    <h2 class="h2-ic"><?php echo class_exists('OES_Notifications') ? OES_Notifications::icon_color() : '<i class="ti ti-mail"></i>'; ?> Mesajlarım</h2>
    <p class="sub">Yeni sorular, görev teslimleri, randevular ve hatırlatmalar. Mesaja tıklayınca ilgili yere gidersin.</p>
  </div>
  <?php if (class_exists('OES_Notifications') && OES_Notifications::unread_count($uid)): ?>
    <button type="button" class="btn ghost" id="nlReadAll"><i class="ti ti-checks"></i> Tümünü okundu işaretle</button>
  <?php endif; ?>
</div>

<?php
if (class_exists('OES_Notifications')) {
    OES_Notifications::render_list($uid);
    OES_Notifications::inline_js();
}
?>
