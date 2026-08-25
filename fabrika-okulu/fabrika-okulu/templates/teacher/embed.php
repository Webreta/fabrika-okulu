<?php
/**
 * Fabrika Okulu — Eğitmen paneli GÖMÜLÜ (embed) render.
 * wp-admin ürün ekranındaki iframe için: site header/nav olmadan yalnızca görünüm.
 * Beklenen: $data, $this = OES_Teacher_Panel
 */
if (!defined('ABSPATH')) exit;

$panel     = $this;
$view      = $panel->get_active_view();
$oes_embed = true; // editor.php bunu görüp kaydettikten sonra yönlendirme yapmaz
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?php echo esc_html(get_bloginfo('name')); ?> — Editör</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.11.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/teacher-panel.css?v=' . OES_VERSION); ?>">
<style>
  html,body{background:#fff;}
  body{margin:0;padding:8px 4px;}
  .content{max-width:none;margin:0;padding:0;}
  /* Gömülü modda gereksiz üst boşlukları azalt + panele dönüş linkini gizle */
  .ed-top{margin-top:0;}
  .ed-back{display:none !important;}
</style>
</head>
<body>
<div class="content">
  <?php
  $vf = OES_PLUGIN_DIR . 'templates/teacher/views/' . $view . '.php';
  if (file_exists($vf)) {
      include $vf;
  } else {
      echo '<div class="empty"><i class="ti ti-tools"></i><p>Bu görünüm bulunamadı.</p></div>';
  }
  ?>
</div>
</body>
</html>
