<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
$gorev_id = isset($_GET['id']) ? intval($_GET['id']) : 0;
$back_url = OES_Panel::instance()->panel_url('gorevler');
?>
<div class="oesp-detail-head">
    <a href="<?php echo esc_url($back_url); ?>" class="oesp-back"><i class="ti ti-arrow-left"></i> Görevlerim</a>
</div>

<div class="oesp-detail-body">
    <?php
    if ($gorev_id && class_exists('OES_Assignments') && OES_Module_Manager::is_active('assignments')) {
        $assignments = OES_Assignments::instance();
        if (method_exists($assignments, 'render_detail_for_panel')) {
            $assignments->render_detail_for_panel($gorev_id);
        } else {
            echo '<p>Görev detayı yüklenemedi.</p>';
        }
    } else {
        echo '<div class="oesp-empty"><i class="ti ti-file-off"></i><p>Görev bulunamadı.</p></div>';
    }
    ?>
</div>
