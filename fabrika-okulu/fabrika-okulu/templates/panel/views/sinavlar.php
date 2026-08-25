<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
?>
<div class="oesp-page-head">
    <h1>Sınavlarım</h1>
    <p>Çözülecek ve tamamlanan sınavlar</p>
</div>

<?php if (empty($data['quizzes'])): ?>
<div class="oesp-empty">
    <i class="ti ti-clipboard-off"></i>
    <p>Aktif bir sınav bulunmuyor.</p>
</div>
<?php else: ?>
<div class="oesp-list">
    <?php foreach ($data['quizzes'] as $q): ?>
    <div class="oesp-list-item">
        <div class="oesp-list-main">
            <div class="oesp-list-title"><?php echo esc_html($q['title']); ?></div>
            <div class="oesp-list-sub">
                <?php if ($q['taken']): ?>
                    Sonuç: %<?php echo intval($q['best']); ?> · <?php echo $q['passed'] ? 'Geçti' : 'Kaldı'; ?>
                <?php else: ?>
                    Henüz çözülmedi
                <?php endif; ?>
            </div>
        </div>
        <?php if ($q['taken']): ?>
            <span class="oesp-pill <?php echo $q['passed'] ? 'oesp-pill-graded' : 'oesp-pill-failed'; ?>"><?php echo $q['passed'] ? 'Geçti' : 'Kaldı'; ?></span>
        <?php else: ?>
            <a href="<?php echo esc_url($q['link']); ?>" class="oesp-btn oesp-btn-green oesp-btn-sm">Başla</a>
        <?php endif; ?>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>
