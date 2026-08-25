<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
?>
<div class="oesp-page-head">
    <h1>Eğitimlerim</h1>
    <p>Kayıtlı olduğun tüm eğitimler</p>
</div>

<?php if (empty($data['courses'])): ?>
<div class="oesp-empty">
    <i class="ti ti-book-off"></i>
    <p>Henüz kayıtlı olduğun bir eğitim yok.</p>
    <a href="<?php echo esc_url(get_permalink(wc_get_page_id('shop'))); ?>" class="oesp-btn oesp-btn-navy">Eğitimlere göz at</a>
</div>
<?php else: ?>
<div class="oesp-course-grid">
    <?php foreach ($data['courses'] as $c): ?>
    <div class="oesp-course-card">
        <div class="oesp-course-img" style="<?php echo $c['image'] ? 'background-image:url(' . esc_url($c['image']) . ')' : 'background:linear-gradient(120deg,#012963,#10b981)'; ?>">
            <?php if ($c['done']): ?><span class="oesp-badge-done"><i class="ti ti-check"></i> Tamamlandı</span><?php endif; ?>
        </div>
        <div class="oesp-course-body">
            <div class="oesp-course-name"><?php echo esc_html($c['title']); ?></div>
            <div class="oesp-course-meta"><?php echo intval($c['completed']); ?>/<?php echo intval($c['total']); ?> ders · %<?php echo intval($c['percent']); ?></div>
            <div class="oesp-progress"><div class="oesp-progress-fill" style="width:<?php echo intval($c['percent']); ?>%"></div></div>
            <a href="<?php echo esc_url($c['player']); ?>" class="oesp-btn <?php echo $c['done'] ? 'oesp-btn-outline' : 'oesp-btn-green'; ?>">
                <?php echo $c['done'] ? 'Tekrar izle' : 'Devam et →'; ?>
            </a>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>
