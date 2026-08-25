<?php
/**
 * Fabrika Okulu — Eğitmen paneli (v1) standalone shell.
 * Beklenen: $data (collect_data), $this = OES_Teacher_Panel
 */
if (!defined('ABSPATH')) exit;

$panel  = $this;
$view   = $panel->get_active_view();
$u      = $data['user'];
$uname  = $u['name'];
$uinit  = $u['initial'];
$logo   = $panel->get_logo_url();
$home   = home_url('/');
$logout = wp_logout_url($home);

$nav = array(
    'dashboard'  => 'Panelim',
    'kurslarim'  => 'Eğitimlerim',
    'ogrenciler' => 'Öğrencilerim',
    'gonderim'   => 'Gönderimler',
    'sorular'    => 'Sorular',
);
// Sertifika tanımlıysa: şartı sağlayan öğrencilere sertifika verme ekranı
if (class_exists('OES_Certificates') && OES_Certificates::get_all()) {
    $nav['sertifika'] = 'Sertifikalar';
}
// Süper Eğitmen: belge/kupon yönetimi + anket sonuçları
if (class_exists('OES_Teacher') && OES_Teacher::is_super_teacher($u['id'])) {
    $nav['belgeler'] = 'Belgeler';
    if (class_exists('OES_Surveys_Admin')) $nav['anketler'] = 'Anketler';
}
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title><?php echo esc_html(get_bloginfo('name')); ?> — Eğitmen</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.11.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/teacher-panel.css?v=' . oes_asset_ver('assets/css/teacher-panel.css')); ?>">
<?php if ($view === 'anketler'): // sonuç ekranı admin tasarımını kullanıyor ?>
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/fabo-admin.css?v=' . oes_asset_ver('assets/css/fabo-admin.css')); ?>">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/survey.css?v=' . oes_asset_ver('assets/css/survey.css')); ?>">
<?php endif; ?>
<?php if (class_exists('OES_PWA')) OES_PWA::head_tags(); ?>
</head>
<body>

<div class="topbar">
  <div class="promo"><div class="promo-inner">Kariyer gelişiminde yol arkadaşın. </div></div>
  <div class="site-header">
    <div class="hleft">
      <button class="burger" onclick="drawer(1)" aria-label="Menü"><i class="ti ti-menu-2"></i></button>
      <nav class="acct-nav">
        <?php foreach ($nav as $k => $label): ?>
        <a class="anav<?php echo $view === $k ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url($k)); ?>"><?php echo esc_html($label); ?></a>
        <?php endforeach; ?>
      </nav>
    </div>
    <a class="brand" href="<?php echo esc_url($home); ?>" title="Anasayfa"><img src="<?php echo esc_url($logo); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>"></a>
    <div class="hactions">
      <?php $tunread = class_exists('OES_Notifications') ? OES_Notifications::unread_count($u['id']) : 0; ?>
      <a class="anav hact-takvim<?php echo $view === 'takvim' ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('takvim')); ?>"><i class="ti ti-calendar"></i>Takvim</a>
      <a class="hbell<?php echo $view === 'bildirim' ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('bildirim')); ?>" title="Mesajlarım" aria-label="Mesajlarım">
        <?php echo class_exists('OES_Notifications') ? OES_Notifications::icon_mono() : '<i class="ti ti-mail"></i>'; ?>
        <?php if ($tunread): ?><span class="nbadge"><?php echo intval($tunread) > 9 ? '9+' : intval($tunread); ?></span><?php endif; ?>
      </a>
      <?php // Mobilde gizlenir (.btn-new) — yan menüde "Yeni Eğitim" zaten var ?>
      <a class="btn-new" href="<?php echo esc_url($panel->panel_url('editor')); ?>"><i class="ti ti-plus"></i><span>Yeni Eğitim</span></a>
      <div class="user-menu" id="userMenu">
        <button class="user-btn" onclick="toggleUser(event)"><span class="uav"><?php echo esc_html($uinit); ?></span><span class="uname"><?php echo esc_html($uname); ?></span><i class="ti ti-chevron-down uchev"></i></button>
        <div class="user-drop">
          <div class="drop-head"><div class="dn"><?php echo esc_html($uname); ?></div><div class="dr">Eğitmen</div></div>
          <a class="drop-item" href="<?php echo esc_url($panel->panel_url('hesap')); ?>"><i class="ti ti-user-cog"></i> Hesap detayları</a>
          <a class="drop-item" href="<?php echo esc_url($home); ?>"><i class="ti ti-home"></i> Anasayfa</a>
          <div class="drop-div"></div>
          <a class="drop-item danger" href="<?php echo esc_url($logout); ?>"><i class="ti ti-logout"></i> Çıkış yap</a>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="panelbar"><div class="panelbar-in"><span class="pb-title">Eğitmen</span></div></div>

<div class="overlay" onclick="drawer(0)"></div>
<aside id="sidebar">
  <div class="s-userblock">
    <div class="s-av"><?php echo esc_html($uinit); ?></div>
    <div><div class="s-un"><?php echo esc_html($uname); ?></div><div class="s-ur">Eğitmen</div></div>
  </div>
  <?php foreach ($nav as $k => $label): ?>
  <a class="ni<?php echo $view === $k ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url($k)); ?>"><?php echo esc_html($label); ?></a>
  <?php endforeach; ?>
  <a class="ni<?php echo $view === 'takvim' ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('takvim')); ?>">Takvim</a>
  <a class="ni<?php echo $view === 'bildirim' ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('bildirim')); ?>"><?php // Eğitmen yan menüsünde diğer öğelerde ikon yok — tek öğeye ikon koymak hizayı bozar ?>Mesajlarım<?php if (!empty($tunread)): ?> <span class="nbadge inline"><?php echo intval($tunread); ?></span><?php endif; ?></a>
  <a class="ni<?php echo $view === 'editor' ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('editor')); ?>">Yeni Eğitim</a>
  <div class="sdiv"></div>
  <a class="ni<?php echo $view === 'hesap' ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('hesap')); ?>">Hesap</a>
  <a class="ni danger" href="<?php echo esc_url($logout); ?>"><i class="ti ti-logout"></i>Çıkış yap</a>
</aside>

<div class="content">
  <?php
  $vf = OES_PLUGIN_DIR . 'templates/teacher/views/' . $view . '.php';
  if (file_exists($vf)) {
      include $vf;
  } else {
      echo '<h2>' . esc_html($nav[$view] ?? ucfirst($view)) . '</h2><p class="sub">Bu bölüm hazırlanıyor.</p><div class="empty"><i class="ti ti-tools"></i><p>Bu ekran birazdan eklenecek.</p></div>';
  }
  ?>
</div>

<script>
function toggleUser(e){e.stopPropagation();document.getElementById('userMenu').classList.toggle('open');}
document.addEventListener('click',function(e){if(!e.target.closest('#userMenu'))document.getElementById('userMenu').classList.remove('open');});
function drawer(o){document.getElementById('sidebar').classList.toggle('open',!!o);document.querySelector('.overlay').classList.toggle('show',!!o);}
</script>
</body>
</html>
