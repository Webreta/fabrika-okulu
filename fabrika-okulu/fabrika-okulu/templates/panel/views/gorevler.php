<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
?>
<div class="oesp-page-head">
    <h1>Görevlerim</h1>
    <p>Teslim edilecek ve değerlendirilen görevler</p>
</div>

<?php if (empty($data['tasks'])): ?>
<div class="oesp-empty">
    <i class="ti ti-file-off"></i>
    <p>Atanmış bir görev bulunmuyor.</p>
</div>
<?php else: ?>
<div class="oesp-list">
    <?php foreach ($data['tasks'] as $t):
        $badge_class = 'pending'; $badge_text = 'Bekliyor';
        if ($t['status'] === 'graded')    { $badge_class = 'graded';    $badge_text = $t['label']; }
        if ($t['status'] === 'submitted') { $badge_class = 'submitted'; $badge_text = 'Teslim edildi'; }
        // Son teslim SAATİ de gösterilir (baz saatinde biter; baz saatsizse 23:59)
        $due = !empty($t['due_ts']) ? date_i18n('d M Y · H:i', $t['due_ts'])
             : ($t['due'] ? date_i18n('d M Y', strtotime($t['due'])) : '');
    ?>
    <a href="<?php echo esc_url($t['link']); ?>" class="oesp-list-item">
        <div class="oesp-list-main">
            <div class="oesp-list-title"><?php echo esc_html($t['title']); ?></div>
            <?php if ($due): ?><div class="oesp-list-sub">Son teslim: <?php echo esc_html($due); ?></div><?php endif; ?>
        </div>
        <span class="oesp-pill oesp-pill-<?php echo esc_attr($badge_class); ?>"><?php echo esc_html($badge_text); ?></span>
    </a>
    <?php endforeach; ?>
</div>
<?php endif; ?>
