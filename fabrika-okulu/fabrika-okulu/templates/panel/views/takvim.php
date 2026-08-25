<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
$months = array('','Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara');
$today = date('Y-m-d');
?>
<div class="oesp-page-head">
    <h1>Eğitim takvimim</h1>
    <p>Yaklaşan dersler ve etkinlikler</p>
</div>

<?php if (empty($data['calendar'])): ?>
<div class="oesp-empty">
    <i class="ti ti-calendar-off"></i>
    <p>Planlanmış bir etkinlik bulunmuyor.</p>
</div>
<?php else: ?>
<div class="oesp-cal-list">
    <?php foreach ($data['calendar'] as $ev):
        $ts = strtotime($ev['date']);
        $day = date('d', $ts);
        $mon = $months[intval(date('n', $ts))];
        $past = $ev['date'] < $today;
        $accent = $past ? '#94a3b8' : '#012963';
    ?>
    <div class="oesp-cal-item<?php echo $past ? ' past' : ''; ?>">
        <div class="oesp-cal-date" style="background:<?php echo $accent; ?>">
            <span class="oesp-cal-day"><?php echo esc_html($day); ?></span>
            <span class="oesp-cal-mon"><?php echo esc_html($mon); ?></span>
        </div>
        <div class="oesp-cal-info">
            <div class="oesp-cal-title"><?php echo esc_html($ev['title']); ?></div>
            <div class="oesp-cal-sub">
                <i class="ti ti-clock"></i> <?php echo esc_html($ev['time'] ?: 'Saat belirtilmedi'); ?>
                <?php if (!empty($ev['period'])): ?> · <?php echo esc_html($ev['period']); ?><?php endif; ?>
            </div>
        </div>
        <?php if (!empty($ev['link']) && !$past): ?>
        <a href="<?php echo esc_url($ev['link']); ?>" target="_blank" class="oesp-cal-join">Katıl</a>
        <?php endif; ?>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>
