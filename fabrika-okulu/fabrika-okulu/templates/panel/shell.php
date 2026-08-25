<?php
/**
 * Fabrika Okulu — Öğrenci paneli (v4) standalone shell.
 * Beklenen: $view (aktif sekme), $data (collect_data çıktısı), $this = OES_Panel
 */
if (!defined('ABSPATH')) exit;

$panel   = $this;
$user    = wp_get_current_user();
$uname   = $user->display_name ?: $user->user_login;
$uinit   = mb_strtoupper(mb_substr($uname, 0, 1));
$logo    = $panel->get_logo_url();
$home    = home_url('/');
$logout  = wp_logout_url($home);
$cart    = function_exists('wc_get_cart_url') ? wc_get_cart_url() : $home;
$ajaxurl = admin_url('admin-ajax.php');

// "Mesajlarım" ikonu (gömülü zarf SVG). Sınıf bir sebeple yoksa Tabler'a düş —
// şablonun ortasında fatal verip beyaz ekran çıkmasın.
// Header düğmesi (.hicon) MAVİ zeminli ve beyaz ikon bekliyor; oraya renkli PNG
// değil, aynı çizimin currentColor'lı SVG sürümü konur.
$msg_ic  = class_exists('OES_Notifications') ? OES_Notifications::icon_mono()  : '<i class="ti ti-mail"></i>';
$msg_icc = class_exists('OES_Notifications') ? OES_Notifications::icon_color() : '<i class="ti ti-mail"></i>';

// Anket başlığı (menü, şerit ve bölüm başlığı aynı ismi kullansın)
$sv_title = class_exists('OES_Surveys') ? OES_Surveys::get_schema()['title'] : 'Kariyer Rotam';

// Menü/kısayol ikonları: PNG'si olan bölüm PNG, olmayan Tabler ikonuyla devam eder.
$ic = array(
    'panel'     => OES_Panel::icon('panel',     'ti-layout-dashboard'),
    'egitim'    => OES_Panel::icon('egitim',    'ti-player-play'),
    'takvim'    => OES_Panel::icon('takvim',    'ti-calendar'),
    'aksiyon'   => OES_Panel::icon('aksiyon',   'ti-checklist'),
    'bildirim'  => OES_Panel::icon('bildirim',  'ti-bell'),
    'sertifika' => OES_Panel::icon('sertifika', 'ti-certificate'),
    'siparis'   => OES_Panel::icon('siparis',   'ti-receipt'),
    'belge'     => OES_Panel::icon('belge',     'ti-file-upload'),
    'hesap'     => OES_Panel::icon('hesap',     'ti-user-cog'),
    'yeni'      => OES_Panel::icon('yeni-program',   'ti-compass'),
    'bitmis'    => OES_Panel::icon('bitmis-program', 'ti-award'),
);

$courses = $data['courses'];

/* --- Türetilmiş değerler --- */
$active_courses = array_filter($courses, function ($c) { return empty($c['done']); });
$done_courses   = array_filter($courses, function ($c) { return !empty($c['done']); });

// Devam kartı: ilerlemesi 0<..<100 olan ilk kurs, yoksa ilk aktif kurs
$resume = null;
foreach ($courses as $c) { if ($c['percent'] > 0 && $c['percent'] < 100) { $resume = $c; break; } }
if (!$resume) { foreach ($courses as $c) { if (empty($c['done'])) { $resume = $c; break; } } }

$tasks    = $data['tasks'];
$quizzes  = $data['quizzes'];
$orders   = $data['orders'];
$calendar = $data['calendar'];

$pending_tasks = array_filter($tasks,   function ($t) { return $t['status'] === 'pending'; });
$upcoming_quiz = array_filter($quizzes, function ($q) { return empty($q['taken']); });
$taken_quiz    = array_filter($quizzes, function ($q) { return !empty($q['taken']); });

/* --- AKSİYONLARIM: görev + sınav tek listede, son tarihe göre --- */
$actions = array();
foreach ($tasks as $t) {
    $done = ($t['status'] === 'graded' || $t['status'] === 'submitted');
    $actions[] = array(
        'kind'     => 'gorev',
        'title'    => $t['title'],
        'course'   => $t['course'] ?? '',
        'due_ts'   => intval($t['due_ts'] ?? 0),
        'due_time' => $t['due_time'] ?? '',
        'done'     => $done,
        'link'     => $t['link'],
        'score'    => null,
        'state'    => $done ? ($t['status'] === 'graded' ? 'Değerlendirildi' : 'Teslim edildi') : 'Bekliyor',
    );
}
foreach ($quizzes as $q) {
    $actions[] = array(
        'kind'     => 'sinav',
        'title'    => $q['title'],
        'course'   => $q['course'] ?? '',
        'due_ts'   => intval($q['due_ts'] ?? 0),
        'due_time' => $q['due_time'] ?? '',
        'done'     => !empty($q['taken']),
        'link'     => $q['link'],
        'score'    => !empty($q['taken']) ? $q['best'] : null,
        'state'    => !empty($q['taken']) ? 'Tamamlandı' : 'Yaklaşıyor',
    );
}
// Sıralama: önce yapılacaklar, sonra bitenler; her grup son tarihe göre
// (tarihi olmayanlar kendi grubunun sonunda). Aynı gün ise saate göre.
usort($actions, function ($a, $b) {
    if ($a['done'] !== $b['done']) return $a['done'] ? 1 : -1;
    if (!$a['due_ts'] && !$b['due_ts']) return 0;
    if (!$a['due_ts']) return 1;
    if (!$b['due_ts']) return -1;
    return $a['due_ts'] <=> $b['due_ts'];
});
$open_actions = array_filter($actions, function ($a) { return empty($a['done']); });

// Genel ilerleme %
$tot = 0; $com = 0;
foreach ($courses as $c) { $tot += intval($c['total']); $com += intval($c['completed']); }
$overall = $tot > 0 ? round($com / $tot * 100) : 0;

// Sınav ortalaması
$sum = 0; $n = 0;
foreach ($taken_quiz as $q) { if ($q['best'] !== null) { $sum += $q['best']; $n++; } }
$quiz_avg = $n > 0 ? round($sum / $n, 1) : 0;

if (!function_exists('fabo_short_month')) {
    function fabo_short_month($ts) {
        $m = array(1=>'Oca',2=>'Şub',3=>'Mar',4=>'Nis',5=>'May',6=>'Haz',7=>'Tem',8=>'Ağu',9=>'Eyl',10=>'Eki',11=>'Kas',12=>'Ara');
        return $m[intval(date('n', $ts))];
    }
}
$shop_url = function_exists('wc_get_page_permalink') ? wc_get_page_permalink('shop') : $home;

/* Panel görünümü: banner görseli + ortamına uyan renk teması (kullanıcıya özel,
   Tercihler & Ayarlar'dan değiştirilir). Header bu temadan ETKİLENMEZ. */
$fo_themes    = class_exists('OES_Panel_Themes') ? OES_Panel_Themes::themes() : array();
$fo_theme     = class_exists('OES_Panel_Themes') ? OES_Panel_Themes::get_user_theme($user->ID) : 'yok';
$fo_banner_ok = !empty($fo_themes[$fo_theme]['img']);
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title><?php echo esc_html(get_bloginfo('name')); ?> — Çalışma Odam</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.11.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/panel.css?v=' . oes_asset_ver('assets/css/panel.css')); ?>">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/survey.css?v=' . oes_asset_ver('assets/css/survey.css')); ?>">
<?php if (class_exists('OES_PWA')) OES_PWA::head_tags(); ?>
<?php // Tüm temaların CSS'i tek seferde basılır → tema değişimi sayfa yenilemeden olur
if (class_exists('OES_Panel_Themes')): ?>
<style id="foThemeCss"><?php echo OES_Panel_Themes::css(); ?></style>
<?php endif; ?>
</head>
<body data-fo-theme="<?php echo esc_attr($fo_theme); ?>">

<!-- HEADER -->
<div class="topbar">
  <div class="promo"><div class="promo-inner">Kariyer gelişiminde yol arkadaşın. </div></div>
  <div class="site-header">
    <div class="hleft">
      <button class="burger" onclick="drawer(1)" aria-label="Menü"><i class="ti ti-menu-2"></i></button>
      <nav class="acct-nav" id="acctNav"></nav>
    </div>
    <a class="brand" href="<?php echo esc_url($home); ?>" title="Anasayfa" aria-label="Fabrika Okulu — Anasayfa">
      <img src="<?php echo esc_url($logo); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>">
    </a>
    <div class="hactions">
      <?php $nunread = class_exists('OES_Notifications') ? OES_Notifications::unread_count($user->ID) : 0; ?>
      <?php // Mobilde gizlenir (.hbelge) — yan menüde zaten var, header kalabalık olmasın ?>
      <a class="hbelge" onclick="select('belge')" title="Belge Yükle" aria-label="Belge Yükle"><i class="ti ti-file-upload"></i><span>Belge Yükle</span></a>
      <a class="hicon hbell" onclick="select('bildirim')" title="Mesajlarım" aria-label="Mesajlarım">
        <?php echo $msg_ic; ?>
        <?php if ($nunread): ?><span class="nbadge"><?php echo intval($nunread) > 9 ? '9+' : intval($nunread); ?></span><?php endif; ?>
      </a>
      <a class="hicon" href="<?php echo esc_url($cart); ?>" aria-label="Sepet"><i class="ti ti-shopping-bag"></i></a>
      <div class="user-menu" id="userMenu">
        <button class="user-btn" onclick="toggleUser(event)">
          <span class="uav"><?php echo esc_html($uinit); ?></span>
          <span class="uname"><?php echo esc_html($uname); ?></span>
          <i class="ti ti-chevron-down uchev"></i>
        </button>
        <div class="user-drop">
          <?php // Üst menüde yer olmayan bölümler (secondary) buraya JS ile basılır ?>
          <div id="dropNav"></div>
          <div class="drop-div"></div>
          <a class="drop-item" href="<?php echo esc_url($home); ?>"><i class="ti ti-home"></i> Anasayfa</a>
          <a class="drop-item danger" href="<?php echo esc_url($logout); ?>"><i class="ti ti-logout"></i> Çıkış yap</a>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="overlay" onclick="drawer(0)"></div>

<div class="layout">
  <aside id="sidebar">
    <div class="suser">
      <div class="a"><?php echo esc_html($uinit); ?></div>
      <div><div class="nm"><?php echo esc_html($uname); ?></div><div class="rl">Öğrenci</div></div>
    </div>
    <nav class="snav" id="nav"></nav>
    <div class="sdiv"></div>
    <a class="ni" href="<?php echo esc_url($home); ?>"><i class="ti ti-home"></i>Anasayfa</a>
    <a class="ni logout" href="<?php echo esc_url($logout); ?>"><i class="ti ti-logout"></i>Çıkış yap</a>
  </aside>

  <div class="content">
    <div class="dash">
    <div class="dash-main">

    <!-- PANELIM -->
    <section class="panel<?php echo $view==='panel'?' show':''; ?>" data-p="panel">

      <?php /* ÇALIŞMA ORTAMI BANNER'I — .dash-main içinde durur, bu yüzden sağ
               raya (ve mobil çekmeceye) TAŞMAZ; görseli ve panel renklerini
               Tercihler & Ayarlar > Panel Görünümü belirler. Tema "Klasik" ise
               banner gizlenir ama düğüm DOM'da kalır (canlı değişim için).

               DEĞİŞTİRİLEBİLİRLİĞİ GÖSTERMEK için banner'ın sağ üstünde her
               zaman görünen bir "Görünüm" düğmesi var; ayarlara gitmeden
               buradan da tema seçilebiliyor. Banner kapalıyken (Klasik) düğme
               kaybolmasın diye sarmalayıcı .fo-hero--bare moduna geçer. */ ?>
      <?php if (class_exists('OES_Panel_Themes')): ?>
      <div class="fo-hero<?php echo $fo_banner_ok ? '' : ' fo-hero--bare'; ?>" id="foHero">
        <div class="fo-banner" id="foBanner" role="img"
             aria-label="Çalışma ortamı görseli"<?php echo $fo_banner_ok ? '' : ' hidden'; ?>></div>

        <button type="button" class="fo-thmbtn" id="foThmBtn" aria-haspopup="true" aria-expanded="false"
                title="Panel görünümünü değiştir">
          <i class="ti ti-palette"></i><span>Görünüm</span>
        </button>

        <div class="fo-thmpop" id="foThmPop" hidden>
          <div class="fo-thmpop-h">Çalışma ortamını seç</div>
          <div class="fo-thmpop-list">
            <?php foreach ($fo_themes as $tid => $t):
              $timg = OES_Panel_Themes::image_url($tid);
              $tv   = isset($t['vars']) ? $t['vars'] : array();
              $c1   = isset($tv['navy']) ? $tv['navy'] : '#194977';
            ?>
            <button type="button" class="thm thm-sm<?php echo $tid === $fo_theme ? ' active' : ''; ?>" data-thm="<?php echo esc_attr($tid); ?>">
              <span class="thm-prev"<?php if ($timg): ?> style="background-image:url('<?php echo esc_url($timg); ?>');background-position:<?php echo esc_attr(isset($t['focus']) ? $t['focus'] : '50% 60%'); ?>;"<?php endif; ?>>
                <?php if (!$timg): ?><i class="ti ti-square-off"></i><?php endif; ?>
              </span>
              <span class="thm-meta"><b><?php echo esc_html($t['label']); ?></b></span>
              <span class="thm-dot" style="background:<?php echo esc_attr($c1); ?>"></span>
              <span class="thm-tick"><i class="ti ti-check"></i></span>
            </button>
            <?php endforeach; ?>
          </div>
          <a class="fo-thmpop-all" onclick="select('hesap')"><i class="ti ti-settings"></i> Tüm görünüm ayarları</a>
        </div>
      </div>
      <?php endif; ?>

      <h2>Merhaba, <?php echo esc_html($user->first_name ?: $uname); ?> 👋</h2>
      <p class="sub">Kaldığın yerden devam et — her ders bir adım daha ileri.</p>

      <?php // Anket eksikse (hiç doldurmadıysa ya da "şimdilik geç" dediyse) hatırlat
      if (class_exists('OES_Surveys') && OES_Surveys::needs_attention($user->ID)): ?>
      <div class="banner amber" style="cursor:pointer" onclick="select('anket')">
        <i class="ti ti-route"></i>
        <div>
          <b><?php echo esc_html($sv_title); ?> anketin tamamlanmadı.</b>
          Birkaç dakikanı ayır; sana uygun programları buna göre önerelim.
          <u>Şimdi doldur →</u>
        </div>
      </div>
      <?php endif; ?>

      <?php if ($resume): ?>
      <div class="resume">
        <i class="ti ti-player-play ill"></i>
        <div class="lbl">Kaldığın yerden devam et</div>
        <h3><?php echo esc_html($resume['title']); ?></h3>
        <div class="meta"><?php echo intval($resume['completed']); ?>/<?php echo intval($resume['total']); ?> ders tamamlandı</div>
        <div class="pbar"><div style="width:<?php echo intval($resume['percent']); ?>%"></div></div>
        <div class="pct">%<?php echo intval($resume['percent']); ?> tamamlandı</div>
        <a class="go" href="<?php echo esc_url($resume['player']); ?>">▸ Derse devam et</a>
      </div>
      <?php endif; ?>

      <div class="kpis">
        <div class="kpi"><div class="kpi-ic ic-navy"><i class="ti ti-player-play"></i></div><div><div class="v"><?php echo count($active_courses); ?></div><div class="l">Aktif eğitim</div></div></div>
        <div class="kpi"><div class="kpi-ic ic-amber"><i class="ti ti-checklist"></i></div><div><div class="v"><?php echo count($pending_tasks); ?></div><div class="l">Bekleyen görev</div></div></div>
        <div class="kpi"><div class="kpi-ic ic-sky"><i class="ti ti-writing"></i></div><div><div class="v"><?php echo count($upcoming_quiz); ?></div><div class="l">Yaklaşan sınav</div></div></div>
        <div class="kpi"><div class="kpi-ic ic-green"><i class="ti ti-award"></i></div><div><div class="v"><?php echo count($done_courses); ?></div><div class="l">Tamamlanan</div></div></div>
      </div>

      <?php if (!empty($calendar)): ?>
      <div class="sechead" style="margin-top:26px"><i class="ti ti-calendar-event"></i> Yaklaşan</div>
      <div class="tk-grid">
        <?php foreach (array_slice($calendar, 0, 6) as $ev): $ts = strtotime($ev['date']); ?>
        <div class="tk-card">
          <div class="tk-top"><div class="tk-date" style="background:var(--navy-soft);color:var(--navy)"><b><?php echo intval(date('j',$ts)); ?></b><span><?php echo esc_html(fabo_short_month($ts)); ?></span></div><span class="chip c-navy">Canlı</span></div>
          <div class="tk-title"><?php echo esc_html($ev['title']); ?></div>
          <div class="tk-time"><i class="ti ti-clock"></i> <?php echo esc_html(trim(($ev['time'] ?: '') . ' · ' . ($ev['course'] ?: ''), ' ·')); ?></div>
        </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>

    <!-- EĞİTİMLERİM -->
    <section class="panel<?php echo $view==='egitim'?' show':''; ?>" data-p="egitim">
      <h2>Eğitimlerim</h2>
      <p class="sub">Kayıtlı olduğun tüm programlar.</p>

      <?php // Devam Eden / Bitmiş sekmeleri + katalog kısayolu (tek bölüm, üç görünüm)
      // Hiç kurs yoksa sekme şeridi gösterilmez — 0/0 sayaçlı boş şerit anlamsız. ?>
      <?php if (!empty($courses)): ?>
      <div class="ptabs" id="egTabs">
        <button type="button" class="ptab active" data-eg="devam"><?php echo $ic['egitim']; ?> Devam Eden <span class="ptab-n"><?php echo count($active_courses); ?></span></button>
        <button type="button" class="ptab" data-eg="bitmis"><?php echo $ic['bitmis']; ?> Bitmiş <span class="ptab-n"><?php echo count($done_courses); ?></span></button>
        <a class="ptab as-link" href="<?php echo esc_url($shop_url); ?>"><?php echo $ic['yeni']; ?> Yeni Program</a>
      </div>
      <?php endif; ?>

      <?php if (empty($courses)): ?>
        <div class="empty"><i class="ti ti-books"></i><p>Henüz bir eğitime kayıtlı değilsin.</p><a class="btn" href="<?php echo esc_url($shop_url); ?>">Programları keşfet</a></div>
      <?php else: ?>
      <div class="egrid3">
        <?php foreach ($courses as $i => $c):
          $done = !empty($c['done']);
          $col  = $done ? 'var(--green)' : ($i % 2 ? 'var(--sky)' : 'var(--navy)');
          $chipc= $done ? 'c-green' : ($i % 2 ? 'c-sky' : 'c-navy'); ?>
        <div class="ecard" data-eg="<?php echo $done ? 'bitmis' : 'devam'; ?>"><div class="cbody">
          <div class="chead">
            <div class="cicn" style="background:<?php echo $col; ?>"><i class="ti <?php echo $done?'ti-circle-check':'ti-player-play'; ?>"></i></div>
            <span class="chip <?php echo $chipc; ?>"><?php echo $done ? 'Tamamlandı' : 'Devam ediyor'; ?></span>
          </div>
          <div class="et"><?php echo esc_html($c['title']); ?></div>
          <div class="em"><?php echo intval($c['completed']); ?>/<?php echo intval($c['total']); ?> ders</div>
          <div class="bar"><div style="width:<?php echo intval($c['percent']); ?>%;background:<?php echo $col; ?>"></div></div>
          <div class="pctline">%<?php echo intval($c['percent']); ?> · <?php echo intval($c['completed']); ?>/<?php echo intval($c['total']); ?> ders</div>
          <div class="cfoot">
            <?php if ($done): ?>
              <a class="ebtn" style="background:var(--surface);color:var(--navy);border:1px solid var(--line)" href="<?php echo esc_url($c['player']); ?>"><i class="ti ti-rotate-clockwise" style="font-size:14px;vertical-align:-2px;"></i> Tekrar izle</a>
            <?php else: ?>
              <a class="ebtn" style="background:<?php echo $col; ?>" href="<?php echo esc_url($c['player']); ?>">Devam et ▸</a>
            <?php endif; ?>
          </div>
        </div></div>
        <?php endforeach; ?>
      </div>
      <?php // Sekme boşsa: kart ızgarası JS ile gizlenir, buradaki uygun mesaj görünür ?>
      <div class="empty eg-empty" data-eg="devam"<?php echo count($active_courses) ? ' hidden' : ''; ?>>
        <i class="ti ti-player-play"></i><p>Devam eden programın yok.</p>
        <a class="btn" href="<?php echo esc_url($shop_url); ?>">Yeni program keşfet</a>
      </div>
      <div class="empty eg-empty" data-eg="bitmis" hidden>
        <i class="ti ti-award"></i><p>Henüz bitirdiğin bir program yok.</p>
      </div>
      <?php endif; ?>
    </section>

    <!-- TAKVİM -->
    <section class="panel<?php echo $view==='takvim'?' show':''; ?>" data-p="takvim">
      <h2>Eğitim Takvimim</h2>
      <p class="sub">Canlı dersler, görev ve sınav son tarihlerin — hepsi tarih sırasıyla.</p>
      <?php if (empty($calendar)): ?>
        <div class="empty"><i class="ti ti-calendar"></i><p>Takvimde yaklaşan bir etkinlik yok.</p></div>
      <?php else: ?>
      <div class="tk-grid">
        <?php foreach ($calendar as $ev):
          $ts = strtotime($ev['date']);
          $type = $ev['type'] ?? 'session';
          $done = !empty($ev['done']);
          if ($type === 'assignment') { $chip='Görev'; $chipcls='c-amber'; $dbg='#fff4e6'; $dcol='#8a5a00'; $ic='ti-checklist'; }
          elseif ($type === 'quiz')   { $chip='Sınav'; $chipcls='c-sky';   $dbg='var(--sky-soft)';  $dcol='#2a577d';    $ic='ti-writing'; }
          else                        { $chip='Canlı ders'; $chipcls='c-navy'; $dbg='var(--navy-soft)'; $dcol='var(--navy)'; $ic='ti-video'; }
        ?>
        <div class="tk-card"<?php echo $done ? ' style="opacity:.55;"' : ''; ?>>
          <div class="tk-top"><div class="tk-date" style="background:<?php echo $dbg; ?>;color:<?php echo $dcol; ?>"><b><?php echo intval(date('j',$ts)); ?></b><span><?php echo esc_html(fabo_short_month($ts)); ?></span></div><span class="chip <?php echo $chipcls; ?>"><i class="ti <?php echo $ic; ?>"></i> <?php echo $chip . ($done ? ' ✓' : ''); ?></span></div>
          <div class="tk-title"><?php echo esc_html($ev['title']); ?></div>
          <div class="tk-time"><i class="ti ti-clock"></i> <?php echo esc_html(trim(($ev['time'] ?: '') . ' · ' . ($ev['course'] ?: ''), ' ·')); ?></div>
          <?php if (!empty($ev['link']) && !$done): ?><div style="margin-top:10px;"><a class="btn" href="<?php echo esc_url($ev['link']); ?>" <?php echo $type==='session'?'target="_blank" rel="noopener"':''; ?>><i class="ti ti-<?php echo $type==='session'?'external-link':'arrow-right'; ?>"></i> <?php echo $type==='session'?'Katıl':'Git'; ?></a></div><?php endif; ?>
        </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>

    <!-- AKSİYONLARIM (görev + sınav, tarih sıralı) -->
    <section class="panel<?php echo $view==='aksiyon'?' show':''; ?>" data-p="aksiyon">
      <h2>Aksiyonlarım</h2>
      <p class="sub">Görevlerin ve sınavların tek listede — son tarihi en yakın olan en üstte.</p>

      <div class="kpis k3" style="margin-bottom:22px;">
        <div class="kpi"><div class="kpi-ic ic-amber"><i class="ti ti-clock"></i></div><div><div class="v"><?php echo count($open_actions); ?></div><div class="l">Bekleyen</div></div></div>
        <div class="kpi"><div class="kpi-ic ic-green"><i class="ti ti-circle-check"></i></div><div><div class="v"><?php echo count($actions) - count($open_actions); ?></div><div class="l">Tamamlanan</div></div></div>
        <div class="kpi"><div class="kpi-ic ic-navy"><i class="ti ti-trophy"></i></div><div><div class="v"><?php echo $n>0 ? esc_html(number_format($quiz_avg,1,',','')) : '—'; ?></div><div class="l">Sınav ortalaması</div></div></div>
      </div>

      <?php
      // En yakın son tarihli bekleyen aksiyon için hatırlatma şeridi
      $near = null;
      foreach ($open_actions as $a) { if ($a['due_ts']) { $near = $a; break; } }
      if ($near): ?>
      <div class="banner amber"><i class="ti ti-bell-ringing"></i><div><b><?php echo esc_html($near['title']); ?></b> için son tarih yaklaşıyor<?php if ($near['due_ts']): ?> — <?php echo esc_html(date_i18n('d M Y', $near['due_ts'])); ?><?php if ($near['due_time']): ?> · <?php echo esc_html($near['due_time']); ?><?php endif; ?><?php endif; ?>. Öncesinde e-posta ile hatırlatılacaksın.</div></div>
      <?php endif; ?>

      <?php if (empty($actions)): ?>
        <div class="empty"><i class="ti ti-checklist"></i><p>Henüz bir görevin ya da sınavın yok.</p></div>
      <?php else: ?>
      <div class="gv-grid">
        <?php foreach ($actions as $a):
          $is_quiz = ($a['kind'] === 'sinav');
          if (!empty($a['done'])) {
            $ic='ti-circle-check'; $icbg='var(--green-soft)'; $iccol='var(--green)';
          } else {
            $ic = $is_quiz ? 'ti-writing' : 'ti-pencil';
            $icbg = $is_quiz ? 'var(--amber-soft)' : 'var(--navy-soft)';
            $iccol= $is_quiz ? 'var(--amber)'      : 'var(--navy)';
          }
        ?>
        <div class="gv-card<?php echo empty($a['done'])?' active':''; ?>">
          <div class="gv-top">
            <div class="gv-ic" style="background:<?php echo $icbg; ?>"><i class="ti <?php echo $ic; ?>" style="color:<?php echo $iccol; ?>"></i></div>
            <?php if ($is_quiz && !empty($a['done']) && $a['score'] !== null): ?>
              <span class="score"><?php echo intval($a['score']); ?><small>/100</small></span>
            <?php else: ?>
              <span class="chip <?php echo !empty($a['done']) ? 'c-green' : 'c-amber'; ?>"><?php echo esc_html($a['state']); ?></span>
            <?php endif; ?>
          </div>
          <div class="gv-title"><?php echo esc_html($a['title']); ?></div>
          <div class="gv-meta">
            <span class="chip <?php echo $is_quiz ? 'c-sky' : 'c-navy'; ?>" style="margin-right:6px;"><?php echo $is_quiz ? 'Sınav' : 'Görev'; ?></span>
            <?php if (!empty($a['course'])): ?><?php echo esc_html($a['course']); ?><?php endif; ?>
          </div>
          <?php if ($a['due_ts']): ?>
          <div class="gv-meta"><i class="ti ti-clock"></i> Son tarih: <?php echo esc_html(date_i18n('d M Y', $a['due_ts'])); ?><?php if (!empty($a['due_time'])): ?> · <?php echo esc_html($a['due_time']); ?><?php endif; ?></div>
          <?php endif; ?>
          <?php if (empty($a['done']) && !empty($a['link'])): ?>
            <a class="ebtn" style="background:var(--navy);margin-top:12px;" href="<?php echo esc_url($a['link']); ?>"><?php echo $is_quiz ? 'Sınava başla' : 'Göreve git'; ?> ▸</a>
          <?php endif; ?>
        </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>

    <!-- SİPARİŞLER -->
    <section class="panel<?php echo $view==='siparis'?' show':''; ?>" data-p="siparis">
      <h2>Siparişler</h2>
      <p class="sub">Satın aldığın eğitimler.</p>
      <?php $ord_done = array_filter($orders, function($o){ return $o['status_key']==='completed'; }); ?>
      <div class="kpis k3" style="margin-bottom:22px;">
        <div class="kpi"><div class="kpi-ic ic-navy"><i class="ti ti-shopping-bag"></i></div><div><div class="v"><?php echo count($orders); ?></div><div class="l">Sipariş</div></div></div>
        <div class="kpi"><div class="kpi-ic ic-green"><i class="ti ti-circle-check"></i></div><div><div class="v"><?php echo count($ord_done); ?></div><div class="l">Tamamlanan</div></div></div>
        <div class="kpi"><div class="kpi-ic ic-sky"><i class="ti ti-books"></i></div><div><div class="v"><?php echo count($courses); ?></div><div class="l">Eğitim</div></div></div>
      </div>
      <?php if (empty($orders)): ?>
        <div class="empty"><i class="ti ti-receipt"></i><p>Henüz siparişin yok.</p></div>
      <?php else: ?>
      <div class="gv-grid">
        <?php foreach ($orders as $o): ?>
        <div class="gv-card">
          <div class="gv-top"><div class="gv-ic" style="background:var(--navy-soft)"><i class="ti ti-receipt" style="color:var(--navy)"></i></div><span class="chip <?php echo $o['status_key']==='completed'?'c-green':'c-amber'; ?>"><?php echo esc_html($o['status']); ?></span></div>
          <div class="gv-title"><?php echo esc_html(implode(', ', $o['items'])); ?></div>
          <div class="gv-meta">#<?php echo esc_html($o['number']); ?> · <?php echo esc_html($o['date']); ?></div>
          <div class="gv-price"><?php echo wp_kses_post($o['total']); ?></div>
        </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>

    <!-- HESAP -->
    <section class="panel<?php echo $view==='hesap'?' show':''; ?>" data-p="hesap">
      <h2>Hesap Detayları</h2>
      <p class="sub">Kişisel bilgilerin.</p>
      <div class="acc-wrap">
        <div class="card">
          <div class="acc-msg" id="accMsg"></div>
          <form class="acc-form" id="accForm">
            <div class="acc-grid">
              <div class="acc-field"><label>Ad</label><input type="text" name="first_name" value="<?php echo esc_attr($user->first_name); ?>"></div>
              <div class="acc-field"><label>Soyad</label><input type="text" name="last_name" value="<?php echo esc_attr($user->last_name); ?>"></div>
            </div>
            <div class="acc-field"><label>E-posta</label><input type="email" value="<?php echo esc_attr($user->user_email); ?>" disabled></div>
            <div class="acc-grid">
              <div class="acc-field"><label>Mevcut şifre</label><input type="password" name="current_pass" autocomplete="current-password" placeholder="••••••••"></div>
              <div class="acc-field"><label>Yeni şifre</label><input type="password" name="new_pass" autocomplete="new-password" placeholder="En az 6 karakter"></div>
            </div>
            <div style="margin-top:6px;"><button type="submit" class="btn"><i class="ti ti-device-floppy" style="font-size:15px;"></i> Bilgileri kaydet</button></div>
          </form>
        </div>

        <?php /* PANEL GÖRÜNÜMÜ — banner görseli + o ortama uyan panel renkleri.
                 Seçim anında uygulanır (sayfa yenilenmez), ardından kaydedilir. */ ?>
        <?php if (class_exists('OES_Panel_Themes')): ?>
        <div class="card" id="thmCard" style="margin-top:16px;">
          <div class="sechead"><i class="ti ti-palette"></i> Panel Görünümü</div>
          <p class="sub" style="margin-bottom:14px;">Çalışma ortamını seç — panelinin üst görseli ve renkleri buna göre değişir. Üst menü ve logo aynı kalır.</p>
          <div class="thm-grid">
            <?php foreach ($fo_themes as $tid => $t):
              $timg = OES_Panel_Themes::image_url($tid);
              $tv   = isset($t['vars']) ? $t['vars'] : array();
              $c1   = isset($tv['navy']) ? $tv['navy'] : '#194977';
              $c2   = isset($tv['sky'])  ? $tv['sky']  : '#5baecf';
              $c3   = isset($tv['card']) ? $tv['card'] : '#f5f7fa';
            ?>
            <button type="button" class="thm<?php echo $tid === $fo_theme ? ' active' : ''; ?>" data-thm="<?php echo esc_attr($tid); ?>">
              <span class="thm-prev"<?php if ($timg): ?> style="background-image:url('<?php echo esc_url($timg); ?>');background-position:<?php echo esc_attr(isset($t['focus']) ? $t['focus'] : '50% 60%'); ?>;"<?php endif; ?>>
                <?php if (!$timg): ?><i class="ti ti-square-off"></i><?php endif; ?>
              </span>
              <span class="thm-meta">
                <b><?php echo esc_html($t['label']); ?></b>
                <i><?php echo esc_html($t['desc']); ?></i>
                <span class="thm-dots">
                  <em style="background:<?php echo esc_attr($c1); ?>"></em>
                  <em style="background:<?php echo esc_attr($c2); ?>"></em>
                  <em style="background:<?php echo esc_attr($c3); ?>"></em>
                </span>
              </span>
              <span class="thm-tick"><i class="ti ti-check"></i></span>
            </button>
            <?php endforeach; ?>
          </div>
          <div class="acc-msg" id="thmMsg"></div>
        </div>
        <?php endif; ?>
        <?php // Renkler tema değişkenlerinden gelir — sıcak temalarda mavi kalmasın ?>
        <div class="banner" style="background:var(--sky-soft);border:1px solid var(--line);color:var(--ink2);margin-top:14px;"><i class="ti ti-shield-check"></i><div>Hesabın güvende. Şifreni düzenli güncellemeni öneririz.</div></div>
      </div>
    </section>

    <!-- BELGE YÜKLE -->
    <section class="panel<?php echo $view==='belge'?' show':''; ?>" data-p="belge">
      <h2>Belge Yükle</h2>
      <p class="sub">Belge yükleyerek bazı eğitimleri <b>ücretsiz</b> veya <b>indirimli</b> alma başvurusu yapabilirsin. Belgen incelendikten sonra sana özel bir eğitim kuponu tanımlanır.</p>
      <div class="card">
        <div class="acc-msg" id="docMsg"></div>
        <form id="docForm">
          <div class="acc-field" style="margin-bottom:12px;">
            <label>Belge <span style="color:var(--ink3);font-weight:400;">(PDF, görsel veya Word — en fazla 10MB)</span></label>
            <div class="upbox" onclick="document.getElementById('docFile').click()" style="border:1px dashed var(--line);border-radius:10px;padding:18px;text-align:center;cursor:pointer;color:var(--ink2);background:var(--surface);"><i class="ti ti-cloud-upload" style="font-size:24px;"></i><div id="docFileName" style="margin-top:6px;font-size:13px;">Dosya seç ya da buraya tıkla</div></div>
            <input type="file" id="docFile" hidden accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx">
          </div>
          <div class="acc-field" style="margin-bottom:12px;"><label>Not <span style="color:var(--ink3);font-weight:400;">(opsiyonel)</span></label><textarea id="docNote" placeholder="Belgenle ilgili kısa açıklama…" style="width:100%;min-height:72px;border:1px solid var(--line);border-radius:10px;padding:10px;font-family:inherit;font-size:14px;"></textarea></div>
          <button type="submit" class="btn"><i class="ti ti-upload" style="font-size:15px;"></i> Belgeyi gönder</button>
        </form>
      </div>

      <?php
      $my_docs = class_exists('OES_Documents') ? OES_Documents::get_user_documents($user->ID) : array();
      if (!empty($my_docs)): ?>
      <div style="margin-top:22px;">
        <h3 style="font-size:15px;margin-bottom:10px;">Belgelerim</h3>
        <?php foreach ($my_docs as $md): $issued = ($md->status === 'coupon_issued'); ?>
        <div class="card" style="display:flex;align-items:center;gap:12px;margin-bottom:8px;padding:12px 14px;">
          <span class="qic ic-sky"><i class="ti ti-file"></i></span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><?php echo esc_html($md->file_name ?: 'Belge'); ?></div>
            <div style="font-size:12px;color:var(--ink3);"><?php echo esc_html(date_i18n('d M Y', strtotime($md->created_at))); ?></div>
          </div>
          <?php if ($issued): ?>
            <span class="chip c-green" title="Kupon kodu"><i class="ti ti-ticket"></i> <?php echo esc_html($md->coupon_code); ?></span>
          <?php else: ?>
            <span class="chip c-amber">İnceleniyor</span>
          <?php endif; ?>
        </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>

    </section>

    <!-- KARİYER ROTAM (anket — cevaplar sonradan güncellenebilir) -->
    <section class="panel<?php echo $view==='anket'?' show':''; ?>" data-p="anket">
      <h2><?php echo esc_html($sv_title); ?></h2>
      <p class="sub">Cevaplarını istediğin zaman güncelleyebilirsin — hedefin değiştiyse burayı tazele.</p>
      <?php
      /* ÖNEMLİ: Zorunlu anket modalı bu sayfada açılacaksa buradaki düz formu
         BASMA. İkisi de id="svForm"/"svMsg"/"svSubmit" kullanıyor; ikisi birden
         basılırsa JS yanlış forma bağlanır ve modal çalışmaz. Modal zaten
         sayfanın üstünü kapattığı için buradaki form görünmez de olurdu. */
      if (class_exists('OES_Surveys')) {
          if (OES_Surveys::must_answer($user->ID)) {
              echo '<div class="sv-note">Anketi ekranda açılan pencereden tamamlayabilirsin.</div>';
          } else {
              // Panel içinde 'edit' modu: kaydettikten sonra yönlendirme yok, yerinde kalır.
              OES_Surveys::render_form($user->ID, 'edit');
          }
      }
      ?>
    </section>

    <!-- MESAJLARIM -->
    <section class="panel<?php echo $view==='bildirim'?' show':''; ?>" data-p="bildirim">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;">
        <div>
          <h2 class="h2-ic"><?php echo $msg_icc; ?> Mesajlarım</h2>
          <p class="sub">Görev, sınav, soru ve hatırlatma mesajların. Mesaja tıklayınca ilgili yere gidersin;
             o içeriğe henüz sıran gelmediyse kaldığın yere yönlendirilirsin.</p>
        </div>
        <?php if (class_exists('OES_Notifications') && OES_Notifications::unread_count($user->ID)): ?>
          <button type="button" class="btn ghost" id="nlReadAll"><i class="ti ti-checks"></i> Tümünü okundu işaretle</button>
        <?php endif; ?>
      </div>
      <?php
      if (class_exists('OES_Notifications')) {
          OES_Notifications::render_list($user->ID);
          OES_Notifications::inline_js();
      }
      ?>
    </section>

    <!-- SERTİFİKALARIM -->
    <section class="panel<?php echo $view==='sertifika'?' show':''; ?>" data-p="sertifika">
      <h2>Sertifikalarım</h2>
      <p class="sub">Eğitmenin onayıyla tanımlanan belgelerin burada listelenir. Her sertifikanın kendine özel bir adresi vardır — bağlantıyı paylaşarak belgeni doğrulatabilirsin.</p>
      <?php
      $my_certs = class_exists('OES_Certificates') ? OES_Certificates::get_user_certificates($user->ID) : array();
      if (empty($my_certs)): ?>
        <div class="empty">
          <i class="ti ti-certificate"></i>
          <p>Henüz bir sertifikan yok. Eğitimlerini tamamladıkça eğitmenin sana sertifika tanımlayabilir.</p>
        </div>
      <?php else: ?>
      <div class="gv-grid">
        <?php foreach ($my_certs as $mc):
          $cert_title = get_the_title($mc->cert_id);
          $cert_url   = OES_Certificates::certificate_url($mc->token); ?>
        <div class="gv-card">
          <div class="gv-top">
            <div class="gv-ic" style="background:var(--green-soft)"><i class="ti ti-certificate" style="color:var(--green)"></i></div>
            <span class="chip c-green">Tanımlandı</span>
          </div>
          <div class="gv-title"><?php echo esc_html($cert_title ?: 'Sertifika'); ?></div>
          <div class="gv-meta"><i class="ti ti-book"></i> <?php echo esc_html(get_the_title($mc->course_id)); ?></div>
          <div class="gv-meta"><i class="ti ti-calendar"></i> <?php echo esc_html(date_i18n('d M Y', strtotime($mc->issued_at))); ?></div>
          <a class="ebtn" style="background:var(--navy)" href="<?php echo esc_url($cert_url); ?>" target="_blank" rel="noopener">Görüntüle / indir ▸</a>
        </div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
    </section>

    </div><!-- /dash-main -->

    <!-- SABİT SAĞ RAY -->
    <div class="rail">
      <div class="side-card">
        <h4><i class="ti ti-bolt"></i> Hızlı Erişim</h4>
        <?php // .qic zeminleri AÇIK tonlu → renkli PNG ikonlar burada net okunur ?>
        <a class="qlink" onclick="select('egitim')"><span class="qic ic-navy"><?php echo $ic['egitim']; ?></span> Eğitimlerim <i class="ti ti-chevron-right qchev"></i></a>
        <a class="qlink" href="<?php echo esc_url($shop_url); ?>"><span class="qic ic-sky"><?php echo $ic['yeni']; ?></span> Yeni programlar <i class="ti ti-chevron-right qchev"></i></a>
        <a class="qlink" onclick="select('takvim')"><span class="qic ic-amber"><?php echo $ic['takvim']; ?></span> Takvimim <i class="ti ti-chevron-right qchev"></i></a>
        <a class="qlink" onclick="select('aksiyon')"><span class="qic ic-green"><?php echo $ic['aksiyon']; ?></span> Aksiyonlarım <?php if (count($open_actions)): ?><span class="chip c-amber" style="margin-left:auto;"><?php echo count($open_actions); ?></span> <?php endif; ?><i class="ti ti-chevron-right qchev"></i></a>
        <a class="qlink" onclick="select('bildirim')"><span class="qic ic-sky"><?php echo $ic['bildirim']; ?></span> Mesajlarım <?php if ($nunread): ?><span class="chip c-amber" style="margin-left:auto;"><?php echo intval($nunread); ?></span> <?php endif; ?><i class="ti ti-chevron-right qchev"></i></a>
        <?php
        // Sertifikası olana kısayol (yoksa boş bölüme yönlendirmeyelim)
        $cert_count = class_exists('OES_Certificates') ? count(OES_Certificates::get_user_certificates($user->ID)) : 0;
        if ($cert_count): ?>
        <a class="qlink" onclick="select('sertifika')"><span class="qic ic-green"><?php echo $ic['sertifika']; ?></span> Sertifikalarım <span class="chip c-green" style="margin-left:auto;"><?php echo intval($cert_count); ?></span> <i class="ti ti-chevron-right qchev"></i></a>
        <?php endif; ?>
      </div>

      <div class="side-card">
        <h4><i class="ti ti-chart-donut"></i> Genel ilerleme</h4>
        <div class="ring-wrap">
          <svg class="ring" viewBox="0 0 36 36">
            <path d="M18 2a16 16 0 100 32 16 16 0 100-32" fill="none" stroke="#eef1f6" stroke-width="4"/>
            <path d="M18 2a16 16 0 100 32 16 16 0 100-32" fill="none" stroke="#194977" stroke-width="4" stroke-dasharray="<?php echo intval($overall); ?> 100" stroke-linecap="round"/>
            <text x="18" y="21" text-anchor="middle" font-size="9" font-weight="700" fill="#12233a">%<?php echo intval($overall); ?></text>
          </svg>
          <div class="ann"><b><?php echo count($courses); ?> eğitimden <?php echo count($done_courses); ?>'i</b> tamamlandı. Toplam <b><?php echo intval($data['lessons_done']); ?> ders</b> izledin.</div>
        </div>
      </div>

      <div class="cta">
        <h5>Yeni eğitimler seni bekliyor</h5>
        <p>Katalogdaki tüm programları keşfet, sana uygun olanı seç.</p>
        <a class="cta-btn" href="<?php echo esc_url($shop_url); ?>"><i class="ti ti-arrow-right"></i> Eğitimleri incele</a>
      </div>
    </div>

    </div><!-- /dash -->
  </div>
</div>

<script>
var OES_VIEW = <?php echo wp_json_encode($view); ?>;
var OES_BASE = <?php echo wp_json_encode(home_url('/panel/')); ?>;
var OES_AJAX = <?php echo wp_json_encode($ajaxurl); ?>;
var OES_ACC_NONCE = <?php echo wp_json_encode(wp_create_nonce('oes_panel_account')); ?>;
var OES_DOC_NONCE = <?php echo wp_json_encode(wp_create_nonce('oes_documents_upload')); ?>;
var OES_THM_NONCE = <?php echo wp_json_encode(wp_create_nonce('oes_panel_theme')); ?>;
/* Hangi temada banner var? (Klasik'te banner gizlenir.) */
var OES_THM_HASIMG = <?php
  $fo_hasimg = array();
  foreach ($fo_themes as $tid => $t) $fo_hasimg[$tid] = !empty($t['img']);
  echo wp_json_encode($fo_hasimg);
?>;

const primary=[
  {k:'panel',   i:'ti-layout-dashboard', t:'Panelim'},
  {k:'egitim',  i:'ti-player-play',      t:'Eğitimlerim'},
  {k:'takvim',  i:'ti-calendar',         t:'Takvim'},
  {k:'aksiyon', i:'ti-checklist',        t:'Aksiyonlarım'},
];
// Menü ikonları PHP'den gelir (PNG varsa <img>, yoksa Tabler <i>).
var NAV_IC = <?php echo wp_json_encode($ic); ?>;
const secondary=[
  {k:'bildirim', i:'ti-bell',        t:'Mesajlarım'},
  {k:'sertifika',i:'ti-certificate', t:'Sertifikalarım'},
  {k:'siparis',i:'ti-receipt',     t:'Satınalma Geçmişim'},
  {k:'belge',  i:'ti-file-upload',  t:'Belge Yükle'},
  {k:'anket',  i:'ti-route',       t:<?php echo wp_json_encode($sv_title); ?>},
  {k:'hesap',  i:'ti-user-cog',    t:'Tercihler & Ayarlar'},
];
var acctNav=document.getElementById('acctNav');
primary.forEach(function(it){
  var a=document.createElement('a');a.className='anav'+(it.k===OES_VIEW?' active':'');a.dataset.k=it.k;
  a.textContent=it.t;a.onclick=function(){select(it.k);};acctNav.appendChild(a);
});
var nav=document.getElementById('nav');
primary.concat(secondary).forEach(function(it){
  var a=document.createElement('a');a.className='ni'+(it.k===OES_VIEW?' active':'');a.dataset.k=it.k;
  a.innerHTML=(NAV_IC[it.k]||'<i class="ti '+it.i+'"></i>')+it.t;a.onclick=function(){select(it.k);};nav.appendChild(a);
});
/* Masaüstünde üst menü yalnız primary'yi gösteriyor; secondary bölümlere
   (Mesajlarım, Sertifikalarım, Kariyer Rotam, Ayarlar…) ancak buradan
   ulaşılabiliyordu — kullanıcı adının altındaki menüye ikonlarıyla basılır. */
var dropNav=document.getElementById('dropNav');
if(dropNav) secondary.forEach(function(it){
  var a=document.createElement('a');a.className='drop-item'+(it.k===OES_VIEW?' active':'');a.dataset.k=it.k;
  a.innerHTML=(NAV_IC[it.k]||'<i class="ti '+it.i+'"></i>')+'<span>'+it.t+'</span>';
  a.onclick=function(){select(it.k);};dropNav.appendChild(a);
});
function select(k){
  document.querySelectorAll('.anav,.ni,.drop-item[data-k]').forEach(function(n){n.classList.toggle('active',n.dataset.k===k);});
  document.querySelectorAll('.panel').forEach(function(p){p.classList.toggle('show',p.dataset.p===k);});
  drawer(0);closeUser();
  if(history.replaceState){history.replaceState(null,'',OES_BASE+(k==='panel'?'':k+'/'));}
  window.scrollTo({top:0,behavior:'smooth'});
}
/* Eğitimlerim: Devam Eden / Bitmiş sekmeleri (aynı bölüm, tek veri seti) */
(function(){
  var tabs=document.getElementById('egTabs'); if(!tabs) return;
  function egShow(key){
    tabs.querySelectorAll('.ptab[data-eg]').forEach(function(b){b.classList.toggle('active',b.dataset.eg===key);});
    document.querySelectorAll('.ecard[data-eg]').forEach(function(c){c.hidden=(c.dataset.eg!==key);});
    document.querySelectorAll('.eg-empty').forEach(function(e){
      e.hidden = (e.dataset.eg!==key) || document.querySelector('.ecard[data-eg="'+key+'"]')!==null;
    });
  }
  tabs.querySelectorAll('.ptab[data-eg]').forEach(function(b){
    b.addEventListener('click',function(){egShow(b.dataset.eg);});
  });
  egShow('devam');
})();

function drawer(o){document.getElementById('sidebar').classList.toggle('open',!!o);document.querySelector('.overlay').classList.toggle('show',!!o);}
function toggleUser(e){e.stopPropagation();document.getElementById('userMenu').classList.toggle('open');}
function closeUser(){var d=document.getElementById('userMenu');if(d)d.classList.remove('open');}
document.addEventListener('click',function(e){if(!e.target.closest('#userMenu'))closeUser();});

/* Belge yükleme */
(function(){
  var f=document.getElementById('docFile'), form=document.getElementById('docForm'), nameEl=document.getElementById('docFileName');
  if(!form)return;
  f.addEventListener('change',function(){ nameEl.textContent=f.files.length?f.files[0].name:'Dosya seç ya da buraya tıkla'; });
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var msg=document.getElementById('docMsg'), btn=form.querySelector('button');
    if(!f.files.length){msg.className='acc-msg show err';msg.textContent='Lütfen bir belge seç.';return;}
    var fd=new FormData(); fd.append('action','oes_upload_document'); fd.append('nonce',OES_DOC_NONCE); fd.append('file',f.files[0]); fd.append('note',document.getElementById('docNote').value);
    btn.disabled=true; msg.className='acc-msg';
    fetch(OES_AJAX,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
      btn.disabled=false;
      msg.className='acc-msg show '+(res.success?'ok':'err');
      msg.textContent=(res.success?((res.data&&res.data.message)||'Belgen alındı.'):(res.data||'Yüklenemedi.'));
      if(res.success){form.reset();nameEl.textContent='Dosya seç ya da buraya tıkla';}
    }).catch(function(){btn.disabled=false;msg.className='acc-msg show err';msg.textContent='Bağlantı hatası.';});
  });
})();

/* Panel Görünümü — TEK MERKEZ.
   Sayfadaki her [data-thm] düğmesi (banner'ın "Görünüm" seçicisi + Ayarlar
   kartı) aynı fonksiyonu kullanır; biri değiştirince ikisi de senkron olur.
   Tıklanınca ANINDA uygulanır (tüm tema CSS'i head'de hazır), sonra kaydedilir;
   kaydedilemezse eski temaya dönülür. */
(function(){
  var btns=document.querySelectorAll('[data-thm]'); if(!btns.length) return;
  var msg=document.getElementById('thmMsg'),
      banner=document.getElementById('foBanner'),
      hero=document.getElementById('foHero'),
      pop=document.getElementById('foThmPop'),
      popBtn=document.getElementById('foThmBtn');

  function apply(id){
    document.body.setAttribute('data-fo-theme',id);
    var hasImg=!!OES_THM_HASIMG[id];
    document.querySelectorAll('[data-thm]').forEach(function(b){b.classList.toggle('active',b.dataset.thm===id);});
    if(banner) banner.hidden=!hasImg;
    // Banner kapalıyken düğme tek başına kalır → sarmalayıcı sade moda geçer
    if(hero) hero.classList.toggle('fo-hero--bare',!hasImg);
  }
  function closePop(){ if(!pop) return; pop.hidden=true; if(popBtn) popBtn.setAttribute('aria-expanded','false'); }

  if(popBtn&&pop){
    popBtn.addEventListener('click',function(e){
      e.stopPropagation();
      var open=pop.hidden;
      pop.hidden=!open; popBtn.setAttribute('aria-expanded',open?'true':'false');
    });
    pop.addEventListener('click',function(e){e.stopPropagation();});
    // "Tüm görünüm ayarları" → bölüm değişiyor, açık kalan seçici kapansın
    var all=pop.querySelector('.fo-thmpop-all');
    if(all) all.addEventListener('click',closePop);
    document.addEventListener('click',closePop);
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closePop();});
  }

  btns.forEach(function(btn){
    btn.addEventListener('click',function(){
      var id=btn.dataset.thm, prev=document.body.getAttribute('data-fo-theme');
      if(id===prev){closePop();return;}
      apply(id);
      if(msg) msg.className='acc-msg';
      var body='action=oes_panel_set_theme&nonce='+encodeURIComponent(OES_THM_NONCE)+'&theme='+encodeURIComponent(id);
      fetch(OES_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'})
       .then(function(r){return r.json();})
       .then(function(res){
          if(res.success){ if(msg){msg.className='acc-msg show ok';msg.textContent=(res.data&&res.data.message)||'Panel görünümün güncellendi.';} }
          else{apply(prev); if(msg){msg.className='acc-msg show err';msg.textContent=res.data||'Kaydedilemedi.';}}
       })
       .catch(function(){apply(prev); if(msg){msg.className='acc-msg show err';msg.textContent='Bağlantı hatası.';}});
    });
  });
})();

var accForm=document.getElementById('accForm');
if(accForm){accForm.addEventListener('submit',function(e){
  e.preventDefault();
  var msg=document.getElementById('accMsg');var btn=accForm.querySelector('button');
  var body='action=oes_panel_update_account&nonce='+encodeURIComponent(OES_ACC_NONCE)
    +'&first_name='+encodeURIComponent(accForm.first_name.value)
    +'&last_name='+encodeURIComponent(accForm.last_name.value)
    +'&current_pass='+encodeURIComponent(accForm.current_pass.value)
    +'&new_pass='+encodeURIComponent(accForm.new_pass.value);
  btn.disabled=true;
  fetch(OES_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'})
   .then(function(r){return r.json();})
   .then(function(res){
      btn.disabled=false;
      msg.className='acc-msg show '+(res.success?'ok':'err');
      msg.textContent=res.success?((res.data&&res.data.message)||'Bilgilerin güncellendi.'):(res.data||'Bir hata oluştu.');
      if(res.success){accForm.current_pass.value='';accForm.new_pass.value='';}
   })
   .catch(function(){btn.disabled=false;msg.className='acc-msg show err';msg.textContent='Bağlantı hatası.';});
});}
</script>

<?php // ZORUNLU ANKET: sayfadan ayrılmadan, bulunduğu ekranın üstünde modal olarak açılır
if (class_exists("OES_Surveys")) OES_Surveys::render_modal();
?>
</body>
</html>
