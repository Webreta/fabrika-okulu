<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
$u = $data['user'];

// İlk devam eden kurs (tamamlanmamış)
$ongoing = null;
foreach ($data['courses'] as $c) { if (!$c['done']) { $ongoing = $c; break; } }
if (!$ongoing && !empty($data['courses'])) $ongoing = $data['courses'][0];

$pending_tasks = 0;
foreach ($data['tasks'] as $t) { if ($t['status'] === 'pending') $pending_tasks++; }
?>
<div class="oesp-hello">
    <div>
        <h1>Merhaba, <?php echo esc_html($u['name']); ?> 👋</h1>
        <p>Bugün öğrenmeye kaldığın yerden devam et.</p>
    </div>
    <div class="oesp-avatar"><?php echo esc_html($u['initial']); ?></div>
</div>

<div class="oesp-stats">
    <div class="oesp-stat" style="--sc:#012963;--sb:#e6eef9">
        <div class="oesp-stat-ic"><i class="ti ti-book"></i></div>
        <div class="oesp-stat-num"><?php echo intval($data['course_count']); ?></div>
        <div class="oesp-stat-lbl">Aktif eğitim</div>
    </div>
    <?php if (OES_Module_Manager::is_active('assignments')): ?>
    <div class="oesp-stat" style="--sc:#b45309;--sb:#fef3c7">
        <div class="oesp-stat-ic"><i class="ti ti-file-text"></i></div>
        <div class="oesp-stat-num"><?php echo intval($pending_tasks); ?></div>
        <div class="oesp-stat-lbl">Bekleyen görev</div>
    </div>
    <?php endif; ?>
    <?php if (OES_Module_Manager::is_active('quizzes')): ?>
    <div class="oesp-stat" style="--sc:#0f6e56;--sb:#d1fae5">
        <div class="oesp-stat-ic"><i class="ti ti-clipboard-check"></i></div>
        <div class="oesp-stat-num"><?php echo count($data['quizzes']); ?></div>
        <div class="oesp-stat-lbl">Sınav</div>
    </div>
    <?php endif; ?>
</div>

<?php if ($ongoing): ?>
<div class="oesp-section-title">Devam eden eğitim</div>
<div class="oesp-course-card">
    <div class="oesp-course-img" style="<?php echo $ongoing['image'] ? 'background-image:url(' . esc_url($ongoing['image']) . ')' : 'background:linear-gradient(120deg,#012963,#10b981)'; ?>"></div>
    <div class="oesp-course-body">
        <div class="oesp-course-name"><?php echo esc_html($ongoing['title']); ?></div>
        <div class="oesp-course-meta"><?php echo intval($ongoing['completed']); ?>/<?php echo intval($ongoing['total']); ?> ders tamamlandı</div>
        <div class="oesp-progress"><div class="oesp-progress-fill" style="width:<?php echo intval($ongoing['percent']); ?>%"></div></div>
        <a href="<?php echo esc_url($ongoing['player']); ?>" class="oesp-btn oesp-btn-green">Devam et →</a>
    </div>
</div>
<?php endif; ?>

<div class="oesp-section-title">Hızlı erişim</div>
<div class="oesp-quick-grid">
    <?php
    $quick = array();
    if (OES_Module_Manager::is_active('periods'))     $quick['takvim']   = array('Eğitim takvimim', 'calendar');
    if (OES_Module_Manager::is_active('assignments')) $quick['gorevler'] = array('Görevlerim', 'file-text');
    if (OES_Module_Manager::is_active('quizzes'))     $quick['sinavlar'] = array('Sınavlarım', 'clipboard-check');
    $quick['hesap'] = array('Hesap detayları', 'user');
    foreach ($quick as $k => $q):
    ?>
    <a href="<?php echo esc_url(OES_Panel::instance()->panel_url($k)); ?>" class="oesp-quick">
        <div class="oesp-quick-ic"><i class="ti ti-<?php echo esc_attr($q[1]); ?>"></i></div>
        <span><?php echo esc_html($q[0]); ?></span>
    </a>
    <?php endforeach; ?>
</div>
