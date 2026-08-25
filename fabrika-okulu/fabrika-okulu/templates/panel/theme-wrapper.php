<?php
/**
 * Panel tema sarmalayıcısı
 *
 * Panel içeriğini (login veya shell) sitenin KENDİ header/footer'ı içine gömer.
 * Böylece "Hesabım" ayrı bir uygulama değil, sitenin doğal bir parçası gibi görünür.
 * template_include üzerinden OES_Panel::panel_template() ile yüklenir.
 */
if (!defined('ABSPATH')) exit;

get_header();

$oes_panel = OES_Panel::instance();
$oes_is_login = ($oes_panel->get_render_mode() === 'login');
?>
<div class="oesp-site-wrap<?php echo $oes_is_login ? ' oesp-site-wrap-login' : ''; ?>">
    <?php $oes_panel->render_panel_body(); ?>
</div>
<?php

get_footer();
