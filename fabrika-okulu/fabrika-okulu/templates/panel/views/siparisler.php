<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
$back_url = OES_Panel::instance()->panel_url('hesap');
?>
<div class="oesp-detail-head">
    <a href="<?php echo esc_url($back_url); ?>" class="oesp-back"><i class="ti ti-arrow-left"></i> Hesap detayları</a>
</div>

<div class="oesp-page-head">
    <h1>Siparişlerim</h1>
    <p>Geçmiş siparişlerin</p>
</div>

<?php if (empty($data['orders'])): ?>
<div class="oesp-empty">
    <i class="ti ti-receipt-off"></i>
    <p>Henüz siparişin yok.</p>
</div>
<?php else: ?>
<div class="oesp-list">
    <?php foreach ($data['orders'] as $o):
        $pill = 'pending';
        if (in_array($o['status_key'], array('completed'), true)) $pill = 'graded';
        elseif (in_array($o['status_key'], array('processing','on-hold'), true)) $pill = 'submitted';
        elseif (in_array($o['status_key'], array('cancelled','failed','refunded'), true)) $pill = 'failed';
    ?>
    <div class="oesp-order-item">
        <div class="oesp-order-head">
            <span class="oesp-order-no">#<?php echo esc_html($o['number']); ?></span>
            <span class="oesp-pill oesp-pill-<?php echo esc_attr($pill); ?>"><?php echo esc_html($o['status']); ?></span>
        </div>
        <div class="oesp-order-items"><?php echo esc_html(implode(', ', $o['items'])); ?></div>
        <div class="oesp-order-foot">
            <span><?php echo esc_html($o['date']); ?></span>
            <strong><?php echo wp_kses_post($o['total']); ?></strong>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>
