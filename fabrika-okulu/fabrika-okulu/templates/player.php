<?php
/**
 * Fabrika Okulu — Ders İzleme (Player v1)
 * Değişkenler (render_player'dan): $product, $course_id, $curriculum, $progress_data,
 *   $quizzes (id=>obj), $assignments, $active_type, $active_section, $active_lesson,
 *   $active_quiz, $active_assign, $total_lessons, $completed_lessons, $progress_percent,
 *   $player_nonce, $user_id
 */
if (!defined('ABSPATH')) exit;
global $wpdb;

$user   = wp_get_current_user();
$uname  = $user->display_name ?: $user->user_login;
$uinit  = mb_strtoupper(mb_substr($uname, 0, 1));
$logo   = OES_Panel::instance()->get_logo_url();
$home   = home_url('/');
$panel  = home_url('/panel/');
$logout = wp_logout_url($home);

if (!function_exists('fabo_purl')) {
    function fabo_purl($cid, $args) { $args['oes-player'] = $cid; return add_query_arg($args, home_url('/kurs-izle/')); }
}

/* --- Görev (assignment) haritası (müfredat görev öğeleri için) --- */
$assign_map = array();
foreach ($assignments as $a) { $assign_map[intval($a->id)] = $a; }
$referenced_assign = array();

/* --- Müfredat öğelerini düzleştir + kilit sınırı (frontier) ---
       DOSYALAR SIRAYA DAHİLDİR (üstündeki içerik bitmeden açılamaz) ama
       İLERLEMEYE SAYILMAZ: 'counts' = false. Dosya açılır açılmaz "yapıldı"
       sayılır ve sonrakinin kilidi düşer; yüzde ise değişmez.
       Örn. 4 video + 1 dosya: 3 video + dosya açık → %75 (3/4), %80 değil. --- */
$items = array(); $gidx = 0; $frontier = null;
foreach ($curriculum as $s => $section) {
    if (empty($section['lessons'])) continue;
    foreach ($section['lessons'] as $l => $lesson) {
        $type   = $lesson['type'] ?? 'video';
        $key    = $s . '_' . $l;
        $counts = ($type !== 'file'); // yüzde paydasına giriyor mu?
        if ($type === 'file') {
            // Açıldıysa (progress damgası varsa) sıradaki açılır
            $done = isset($progress_data[$key]) && $progress_data[$key]->status === 'complete';
        } elseif ($type === 'quiz') {
            $qid  = intval($lesson['quiz_id'] ?? 0);
            $qz   = ($qid && isset($quizzes[$qid])) ? $quizzes[$qid] : null;
            $done = $qz && ($qz->best_score !== null || intval($qz->attempt_count) > 0);
        } elseif ($type === 'assign') {
            $aid = intval($lesson['assignment_id'] ?? 0);
            if ($aid) $referenced_assign[$aid] = true;
            $done = $aid && isset($assign_map[$aid]) && !empty($assign_map[$aid]->sub_status);
        } else {
            $done = isset($progress_data[$key]) && $progress_data[$key]->status === 'complete';
        }
        $items[] = array('s' => $s, 'l' => $l, 'type' => $type, 'key' => $key, 'lesson' => $lesson,
                         'done' => $done, 'counts' => $counts, 'gidx' => $gidx);
        if ($frontier === null && !$done) $frontier = $gidx;
        $gidx++;
    }
}
if ($frontier === null) $frontier = $gidx;

/* ÖNİZLEME (eğitmen/yönetici kendi kursunu deniyor): önkoşul kilidi yok — her içeriğe
   doğrudan atlayıp hatasını görebilsin. Hiçbir ilerleme yazılmaz (bkz. OES_Player::$preview). */
$is_preview = class_exists('OES_Player') && OES_Player::is_preview();
if ($is_preview) $frontier = $gidx;

/* --- İlerleme: yalnızca SAYILAN öğeler (video→progress, sınav→attempt,
       görev→submission). Dosyalar sırada yer alır ama paydaya girmez. --- */
$total_lessons     = 0;
$completed_lessons = 0;
foreach ($items as $it) {
    if (empty($it['counts'])) continue;
    $total_lessons++;
    if (!empty($it['done'])) $completed_lessons++;
}
$progress_percent  = $total_lessons > 0 ? round(($completed_lessons / $total_lessons) * 100) : 0;

/* --- ÖNKOŞUL KİLİDİ: istenen içerik frontier'ın ilerisindeyse (önceki içerik/dersler
       tamamlanmadıysa) doğrudan erişilemez; öğrenci kaldığı yere (frontier) yönlendirilir.
       Takvim/görev linkinden ya da URL'den gelinse bile geçerlidir. --- */
$active_gidx = null;
foreach ($items as $it) {
    if ($active_type === 'quiz') {
        if ($it['type'] === 'quiz' && intval($it['lesson']['quiz_id'] ?? 0) === (int) $active_quiz) { $active_gidx = $it['gidx']; break; }
    } elseif ($active_type === 'assign') {
        if ($it['type'] === 'assign' && intval($it['lesson']['assignment_id'] ?? 0) === (int) $active_assign) { $active_gidx = $it['gidx']; break; }
    } else {
        if ($it['type'] !== 'quiz' && $it['type'] !== 'assign' && (int) $it['s'] === (int) $active_section && (int) $it['l'] === (int) $active_lesson) { $active_gidx = $it['gidx']; break; }
    }
}
if ($active_gidx !== null && $active_gidx > $frontier && isset($items[$frontier])) {
    $t = $items[$frontier];
    $lock_url = ($t['type'] === 'quiz')
        ? fabo_purl($course_id, array('quiz' => intval($t['lesson']['quiz_id'] ?? 0)))
        : (($t['type'] === 'assign')
            ? fabo_purl($course_id, array('gorev' => intval($t['lesson']['assignment_id'] ?? 0)))
            : fabo_purl($course_id, array('section' => $t['s'], 'lesson' => $t['l'])));
    wp_safe_redirect($lock_url);
    exit;
}

/* --- Aktif ders / video --- */
$cur = ($active_type === 'video' && isset($curriculum[$active_section]['lessons'][$active_lesson]))
    ? $curriculum[$active_section]['lessons'][$active_lesson] : null;
$active_key  = $active_section . '_' . $active_lesson;
$lesson_done = isset($progress_data[$active_key]) && $progress_data[$active_key]->status === 'complete';
$vid = $cur ? OES_Player::parse_video($cur['video_url'] ?? ($cur['file_url'] ?? '')) : array('type' => 'none', 'id' => '', 'url' => '');

/* --- Aktif sınav --- */
$active_quiz_obj = ($active_type === 'quiz' && isset($quizzes[$active_quiz])) ? $quizzes[$active_quiz] : null;
$quiz_questions = array();
if ($active_quiz_obj) {
    $qrows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY id ASC", $active_quiz));
    foreach ($qrows as $qr) {
        $opts = array();
        if ($qr->question_type === 'multiple_choice') {
            $raw = json_decode($qr->options, true) ?: array();
            foreach ($raw as $oi => $ol) { $opts[] = array('label' => $ol, 'val' => chr(65 + $oi)); }
        } elseif ($qr->question_type === 'true_false') {
            $opts[] = array('label' => 'Doğru', 'val' => 'true');
            $opts[] = array('label' => 'Yanlış', 'val' => 'false');
        }
        // correct_answer İSTEMCİYE GÖNDERİLMEZ (sunucu puanlar)
        $quiz_questions[] = array('id' => intval($qr->id), 'text' => $qr->question_text, 'type' => $qr->question_type, 'options' => $opts);
    }
}

/* --- Aktif görev --- */
$active_assign_obj = null;
if ($active_type === 'assign') {
    foreach ($assignments as $a) { if (intval($a->id) === $active_assign) { $active_assign_obj = $a; break; } }
}

/* --- Aktif dosya (korumalı görüntüleyici) ---
       Ham dosya yolu istemciye HİÇ gitmez; yalnızca kurs+bölüm+ders indeksiyle
       çalışan, oturum ve kurs erişimi denetleyen akış ucunun URL'i verilir. --- */
$active_file = null;
if ($active_type === 'file' && isset($curriculum[$active_section]['lessons'][$active_lesson])) {
    $fl   = $curriculum[$active_section]['lessons'][$active_lesson];
    $path = class_exists('OES_Course_Files') ? OES_Course_Files::resolve_path($fl) : '';
    $mime = $path ? OES_Course_Files::mime_for($path) : '';
    $active_file = array(
        'title'  => $fl['title'] ?? ($fl['file_name'] ?? 'Dosya'),
        'name'   => $fl['file_name'] ?? '',
        'exists' => (bool) $path,
        'kind'   => $path ? OES_Course_Files::viewer_type($mime) : 'none',
        'url'    => $path ? OES_Course_Files::stream_url($course_id, $active_section, $active_lesson) : '',
    );
}

/* --- Panel görünümü (tema) — player da öğrencinin seçtiği temayı kullanır ---
       Player kendi <html> iskeletini kurduğu için panel shell'indeki tema
       çıktısı buraya kendiliğinden gelmiyordu; öğrenci derse girince panel
       varsayılan renklere düşüyordu. Aynı user_meta okunur, aynı CSS basılır.
       Değişkenler player'ın içerik kapsayıcılarına iner → header dokunulmaz. */
$fo_theme = '';
$fo_themed = false; // Klasik (renksiz) temada player'ın kendi paleti kalır
if (class_exists('OES_Panel_Themes')) {
    $fo_theme  = OES_Panel_Themes::get_user_theme($user->ID);
    $fo_all    = OES_Panel_Themes::themes();
    $fo_themed = !empty($fo_all[$fo_theme]['vars']);
}

$body_class = trim(($is_preview ? 'is-preview ' : '') . ($fo_themed ? 'fo-themed' : ''));
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title><?php echo esc_html($product->get_name()); ?> — İzle</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.11.0/dist/tabler-icons.min.css">
<?php $oes_pv = @filemtime(OES_PLUGIN_DIR . 'assets/css/player.css') ?: OES_VERSION; ?>
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/player.css?v=' . $oes_pv); ?>">
<?php if (class_exists('OES_PWA')) OES_PWA::head_tags(); ?>
<?php // Panelle aynı tema CSS'i — kapsam player'ın içerik alanları (header hariç)
if (class_exists('OES_Panel_Themes')): ?>
<style id="foThemeCss"><?php echo OES_Panel_Themes::css('.coursebar, .player'); ?></style>
<?php endif; ?>
</head>
<body<?php echo $body_class ? ' class="' . esc_attr($body_class) . '"' : ''; ?><?php echo $fo_theme ? ' data-fo-theme="' . esc_attr($fo_theme) . '"' : ''; ?>>

<?php if ($is_preview): ?>
<!-- Eğitmen önizlemesi: kayıt yok, kilit yok -->
<div class="pv-prev-bar">
  <i class="ti ti-eye"></i>
  <div><b>Önizleme</b> — bu eğitimi <b>eğitmen olarak</b> izliyorsun. İlerleme kaydedilmez, tüm içerik kilitsizdir; sınav/görev gönderimlerin öğrenci verisine karışmasın diye <b>kaydedilmez</b>.</div>
  <a class="pv-prev-edit" href="<?php echo esc_url(home_url('/egitmen/editor/') . '?edit=' . intval($course_id)); ?>"><i class="ti ti-edit"></i> Editöre dön</a>
</div>
<?php endif; ?>

<!-- HEADER -->
<div class="topbar">
  <div class="promo"><div class="promo-inner">İhtiyacına göre seç, kendi ritminde ilerle.</div></div>
  <div class="site-header">
    <div class="hleft">
      <button class="burger" aria-label="Menü" onclick="location.href='<?php echo esc_url($panel); ?>'"><i class="ti ti-menu-2"></i></button>
      <nav class="acct-nav">
        <a class="anav" href="<?php echo esc_url($panel); ?>?view=panel">Panelim</a>
        <a class="anav active" href="<?php echo esc_url($panel); ?>?view=egitim">Eğitimlerim</a>
        <a class="anav" href="<?php echo esc_url($panel); ?>?view=takvim">Takvim</a>
        <a class="anav" href="<?php echo esc_url($panel); ?>?view=gorev">Görevlerim</a>
        <a class="anav" href="<?php echo esc_url($panel); ?>?view=sinav">Sınavlarım</a>
      </nav>
    </div>
    <a class="brand" href="<?php echo esc_url($home); ?>" title="Anasayfa"><img src="<?php echo esc_url($logo); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>"></a>
    <div class="hactions">
      <a class="hicon" href="<?php echo esc_url(function_exists('wc_get_cart_url') ? wc_get_cart_url() : $home); ?>" aria-label="Sepet"><i class="ti ti-shopping-bag"></i></a>
      <div class="user-menu" id="userMenu">
        <button class="user-btn" onclick="toggleUser(event)"><span class="uav"><?php echo esc_html($uinit); ?></span><span class="uname"><?php echo esc_html($uname); ?></span><i class="ti ti-chevron-down uchev"></i></button>
        <div class="user-drop">
          <a class="drop-item" href="<?php echo esc_url($panel); ?>?view=hesap"><i class="ti ti-user-cog"></i> Hesap detayları</a>
          <a class="drop-item" href="<?php echo esc_url($home); ?>"><i class="ti ti-home"></i> Anasayfa</a>
          <div class="drop-div"></div>
          <a class="drop-item danger" href="<?php echo esc_url($logout); ?>"><i class="ti ti-logout"></i> Çıkış yap</a>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- KURS BAĞLAM ÇUBUĞU -->
<div class="coursebar">
  <div class="coursebar-in">
    <a class="cb-back" href="<?php echo esc_url($panel); ?>?view=egitim"><i class="ti ti-arrow-left"></i> Eğitimlerim</a>
    <span class="cb-title"><?php echo esc_html($product->get_name()); ?></span>
    <div class="cb-prog">
      <div class="pbar"><div id="cbProgBar" style="width:<?php echo intval($progress_percent); ?>%"></div></div>
      <span class="ptxt" id="cbProgTxt">%<?php echo intval($progress_percent); ?></span>
    </div>
  </div>
</div>

<div class="player">
  <!-- SOL: sahne -->
  <div class="stage">
    <?php if ($active_type === 'video'): ?>
      <div class="pvideo">
        <div class="pv-screen" id="pvScreen">
          <div class="pv-badge"><i class="ti ti-forbid-2"></i> İleri sarma kapalı</div>
          <?php if ($vid['type'] === 'youtube'): ?>
            <div id="oespYT" data-vid="<?php echo esc_attr($vid['id']); ?>"></div>
            <button class="pv-play" id="pvPlay" aria-label="Oynat"><i class="ti ti-player-play-filled"></i></button>
          <?php elseif ($vid['type'] === 'vimeo'): ?>
            <iframe id="oespVimeo" src="https://player.vimeo.com/video/<?php echo esc_attr($vid['id']); ?>?controls=0&keyboard=0&title=0&byline=0&portrait=0" allow="autoplay; fullscreen" allowfullscreen></iframe>
            <button class="pv-play" id="pvPlay" aria-label="Oynat"><i class="ti ti-player-play-filled"></i></button>
          <?php elseif ($vid['type'] === 'file' && !empty($vid['url'])): ?>
            <video id="oespVideo" src="<?php echo esc_url($vid['url']); ?>" playsinline preload="auto"></video>
            <button class="pv-play" id="pvPlay" aria-label="Oynat"><i class="ti ti-player-play-filled"></i></button>
          <?php else: ?>
            <div class="pv-noembed"><i class="ti ti-video-off" style="font-size:34px;display:block;margin-bottom:8px;"></i>Bu ders için video eklenmemiş.</div>
          <?php endif; ?>
        </div>
        <div class="pv-controls">
          <button class="cbtn" id="pvPP" aria-label="Oynat/Duraklat"><i class="ti ti-player-play-filled"></i></button>
          <button class="cbtn" id="pvBack10" title="10 sn geri" aria-label="10 saniye geri"><i class="ti ti-rewind-backward-10"></i></button>
          <button class="cbtn" id="pvFwd10" title="10 sn ileri (izlediğin yere kadar)" aria-label="10 saniye ileri"><i class="ti ti-rewind-forward-10"></i></button>
          <span class="pv-time" id="pvTime">0:00 / 0:00</span>
          <div class="pv-bar" id="pvBar" title="İleri sarma kapalı"><div class="pv-watched" id="pvWatched"></div><div class="pv-knob" id="pvKnob"></div></div>
          <div class="pv-vol">
            <button class="cbtn" id="pvMute" aria-label="Sesi aç/kapat"><i class="ti ti-volume"></i></button>
            <input type="range" id="pvVolBar" class="pv-vol-range" min="0" max="100" value="100" aria-label="Ses düzeyi">
          </div>
          <div class="pv-speed">
            <button class="active" data-rate="1">1x</button>
            <button data-rate="1.5">1.5x</button>
            <button data-rate="2">2x</button>
          </div>
          <button class="cbtn" id="pvFull" title="Tam ekran" aria-label="Tam ekran"><i class="ti ti-maximize"></i></button>
        </div>
      </div>

      <div class="lesson-head">
        <div>
          <div class="lh-crumb"><?php echo esc_html($curriculum[$active_section]['title'] ?? 'Bölüm'); ?></div>
          <div class="lh-title"><?php echo esc_html($cur['title'] ?? 'Ders'); ?></div>
        </div>
        <div class="lh-actions">
          <?php
          $cur_gidx = null;
          foreach ($items as $it) { if ($it['key'] === $active_key) { $cur_gidx = $it['gidx']; break; } }
          $prev = $next = null;
          foreach ($items as $it) {
              if ($cur_gidx !== null && $it['gidx'] === $cur_gidx - 1) $prev = $it;
              if ($cur_gidx !== null && $it['gidx'] === $cur_gidx + 1) $next = $it;
          }
          // Görev de kendi ?gorev= URL'ini almalı: section/lesson verilirse player onu
          // video sanıp "video eklenmemiş" gösteriyordu.
          $mk_url = function($it) use ($course_id) {
              if ($it['type'] === 'quiz')   return fabo_purl($course_id, array('quiz'  => intval($it['lesson']['quiz_id'] ?? 0)));
              if ($it['type'] === 'assign') return fabo_purl($course_id, array('gorev' => intval($it['lesson']['assignment_id'] ?? 0)));
              return fabo_purl($course_id, array('section' => $it['s'], 'lesson' => $it['l']));
          };
          $prev_url = $prev ? $mk_url($prev) : '';
          $next_ok  = $next && ($next['gidx'] <= $frontier); // tamamlanmadan sonrakine geçilemez (önkoşul kilidi)
          $next_url = $next_ok ? $mk_url($next) : '';
          ?>
          <a class="btn ghost" <?php echo $prev_url ? 'href="'.esc_url($prev_url).'"' : 'disabled'; ?>><i class="ti ti-chevron-left"></i> Önceki</a>
          <a class="btn" <?php echo $next_url ? 'href="'.esc_url($next_url).'"' : 'disabled'; ?>>Sonraki <i class="ti ti-chevron-right"></i></a>
        </div>
      </div>

      <div class="lesson-tabs">
        <button class="ltab active" onclick="setTab(this,'tab-desc')">Açıklama</button>
        <button class="ltab" onclick="setTab(this,'tab-qa')">Sorular</button>
      </div>
      <div class="lesson-body">
        <div id="tab-desc" class="ltab-pane">
          <?php if (!empty($cur['description'])): ?><p><?php echo nl2br(esc_html($cur['description'])); ?></p><?php else: ?><p>Bu derse ait açıklama eklenmemiş.</p><?php endif; ?>
          <div class="auto-done<?php echo $lesson_done ? ' done' : ''; ?>" id="autoDone">
            <?php if ($lesson_done): ?><i class="ti ti-circle-check"></i> <span>Bu ders <b>tamamlandı</b> olarak işaretlendi.</span>
            <?php else: ?><i class="ti ti-info-circle"></i> <span>Dersi izledikçe ilerlemen kaydedilir; sonuna geldiğinde <b>otomatik tamamlandı</b> işaretlenir.</span><?php endif; ?>
          </div>
        </div>
        <div id="tab-qa" class="ltab-pane" hidden>
          <div class="qa-ask">
            <textarea id="qaText" placeholder="Bu dersle ilgili bir soru sor…"></textarea>
            <div class="qa-ask-foot"><span>Eğitmenin genelde 1 gün içinde yanıtlar.</span><button class="btn" id="qaSend" onclick="submitQuestion()"><i class="ti ti-send"></i> Soru gönder</button></div>
          </div>
          <div class="qa-list" id="qaList"></div>
        </div>
      </div>

    <?php elseif ($active_type === 'quiz' && $active_quiz_obj): ?>
      <div class="quiz-view">
        <div class="qz-head">
          <div><span class="av-tag" style="background:var(--amber);">SINAV</span><h1><?php echo esc_html($active_quiz_obj->title); ?></h1><div class="qz-meta"><?php echo count($quiz_questions); ?> soru</div></div>
        </div>
        <?php if (empty($quiz_questions)): ?>
          <div class="qa-empty">Bu sınavda henüz soru yok.</div>
        <?php else: ?>
          <div id="qzBody"></div>
          <div class="qz-nav" id="qzNav">
            <a class="btn ghost" href="<?php echo esc_url(fabo_purl($course_id, array())); ?>"><i class="ti ti-x"></i> Çık</a>
            <button class="btn" id="qzNextBtn" onclick="qzNext()">Sonraki <i class="ti ti-chevron-right"></i></button>
          </div>
        <?php endif; ?>
      </div>

    <?php elseif ($active_type === 'assign' && $active_assign_obj):
      $a = $active_assign_obj;
      $submitted = !empty($a->sub_status);
      ?>
      <div class="assign-view">
        <div class="av-head">
          <span class="av-tag">GÖREV</span>
          <h1><?php echo esc_html($a->title); ?></h1>
          <?php if (!empty($a->due_date)): ?><div class="av-dead"><i class="ti ti-clock"></i> Son teslim: <?php echo esc_html(date_i18n('d M Y · H:i', fabo_deadline_ts($a->due_date))); ?></div><?php endif; ?>
        </div>
        <div class="av-desc"><?php echo nl2br(esc_html($a->description)); ?></div>
        <?php if ($submitted): ?>
          <div class="av-done"><i class="ti ti-circle-check"></i> Bu görevi teslim ettin.<?php echo ($a->sub_status === 'graded' && $a->sub_score !== null) ? ' Puan: ' . intval($a->sub_score) : ''; ?></div>
          <div style="margin-top:14px;"><a class="btn ghost" href="<?php echo esc_url(fabo_purl($course_id, array())); ?>"><i class="ti ti-arrow-left"></i> Derse dön</a></div>
        <?php else: ?>
          <form id="avForm" onsubmit="return false;">
            <div class="av-drop" id="avDrop"><i class="ti ti-cloud-upload"></i> Dosyanı buraya sürükle veya <b>bilgisayarından seç</b><span>PDF, DOCX · en fazla 10 MB</span></div>
            <input type="file" id="avFile" hidden accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.jpg,.jpeg,.png">
            <div id="avFiles"></div>

            <div class="av-voice">
              <div class="avv-idle">
                <div class="avv-info"><span class="avv-mic"><i class="ti ti-microphone"></i></span><div><div class="avv-t">Sesli yanıt ekle</div><div class="avv-s">Kısa bir sesli açıklama kaydet (en fazla 3 dk)</div></div></div>
                <button type="button" class="btn ghost" id="avRec"><i class="ti ti-microphone"></i> Kaydet</button>
              </div>
              <div class="avv-recording" hidden><span class="avv-dot"></span> <span class="avv-lbl">Kaydediliyor…</span> <span class="avv-time" id="avRecTime">00:00</span><canvas class="avv-wave" id="avWave"></canvas><button type="button" class="btn" id="avStop"><i class="ti ti-player-stop-filled"></i> <span>Durdur</span></button></div>
              <div class="avv-done" hidden><button type="button" class="avv-playbtn" id="avPlay"><i class="ti ti-player-play-filled"></i></button><div class="avv-wave done"></div><span class="avv-time" id="avVDur">00:00</span><button type="button" class="avv-del" id="avVDel" aria-label="Sil"><i class="ti ti-trash"></i></button></div>
            </div>

            <textarea class="av-note" id="avNote" placeholder="Eğitmenine not eklemek istersen buraya yazabilirsin…"></textarea>
            <div class="av-actions">
              <a class="btn ghost" href="<?php echo esc_url(fabo_purl($course_id, array())); ?>"><i class="ti ti-arrow-left"></i> Derse dön</a>
              <button class="btn" id="avSubmit"><i class="ti ti-send"></i> Teslim et</button>
            </div>
          </form>
        <?php endif; ?>
      </div>
    <?php elseif ($active_type === 'file' && $active_file): ?>
      <div class="file-view">
        <div class="fv-head">
          <div>
            <span class="av-tag" style="background:#5b4bc4;">DOSYA</span>
            <h1><?php echo esc_html($active_file['title']); ?></h1>
            <div class="fv-meta"><i class="ti ti-lock"></i> Bu dosya indirilemez ve kopyalanamaz · ilerlemeni etkilemez</div>
          </div>
          <a class="btn ghost" href="<?php echo esc_url(fabo_purl($course_id, array())); ?>"><i class="ti ti-arrow-left"></i> Derse dön</a>
        </div>

        <?php if (!$active_file['exists'] || $active_file['kind'] === 'none'): ?>
          <div class="qa-empty">Bu dosya görüntülenemiyor. Eğitmeninle iletişime geçebilirsin.</div>
        <?php else: ?>
          <div class="fv-doc" id="fvDoc" data-kind="<?php echo esc_attr($active_file['kind']); ?>" data-src="<?php echo esc_url($active_file['url']); ?>">
            <div class="fv-loading" id="fvLoading"><i class="ti ti-loader-2"></i> Dosya yükleniyor…</div>
            <div class="fv-pages" id="fvPages"></div>
            <?php // Arka plan filigranı: Fabrika Okulu logosu (soluk, tekrarlı) ?>
            <div class="fv-wm" aria-hidden="true"><?php for ($i = 0; $i < 9; $i++): ?><img src="<?php echo esc_url($logo); ?>" alt=""><?php endfor; ?></div>
            <div class="fv-shield" aria-hidden="true"></div>
          </div>
          <div class="fv-foot"><i class="ti ti-info-circle"></i> Bu belge yalnızca görüntülenebilir; indirilemez ve kopyalanamaz.</div>
          <script>
          /* Korumalı dosya görüntüleyici.
             - Dosya, X-OES-Viewer başlığıyla istenir; bu başlık olmadan sunucu 403 döner,
               yani akış URL'i sekmeye yapıştırılıp "farklı kaydet" ile alınamaz.
             - PDF, metin katmanı OLMADAN sayfa sayfa canvas'a çizilir → seçilemez,
               kopyalanamaz, tarayıcının indir/yazdır düğmeleri yoktur.
             - Görsel, blob olarak çizilir; sağ tık ve sürükleme kapalıdır.
             NOT: Ekran görüntüsü teknik olarak engellenemez — bu yüzden filigran var. */
          (function(){
            var doc = document.getElementById('fvDoc');
            if (!doc) return;
            var kind = doc.getAttribute('data-kind'),
                src  = doc.getAttribute('data-src'),
                pages = document.getElementById('fvPages'),
                loading = document.getElementById('fvLoading');

            function done(){ if (loading && loading.parentNode) loading.parentNode.removeChild(loading); }
            function fail(m){ if (loading) loading.innerHTML = '<i class="ti ti-alert-triangle"></i> ' + m; }
            function grab(){
              return fetch(src, {credentials:'same-origin', headers:{'X-OES-Viewer':'1'}})
                .then(function(r){ if(!r.ok) throw new Error(r.status); return r.blob(); });
            }

            if (kind === 'image') {
              grab().then(function(b){
                var im = new Image();
                im.onload = function(){ done(); URL.revokeObjectURL(im.src); };
                im.onerror = function(){ fail('Görsel yüklenemedi.'); };
                im.className = 'fv-img'; im.draggable = false;
                im.src = URL.createObjectURL(b);
                pages.appendChild(im);
              }).catch(function(){ fail('Dosya yüklenemedi.'); });
            } else {
              var CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/';
              var sc = document.createElement('script');
              sc.src = CDN + 'pdf.min.js';
              sc.onerror = function(){ fail('Görüntüleyici yüklenemedi. İnternet bağlantını kontrol et.'); };
              sc.onload = function(){
                if (!window.pdfjsLib) { fail('Görüntüleyici yüklenemedi.'); return; }
                pdfjsLib.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.js';
                grab().then(function(b){ return b.arrayBuffer(); })
                .then(function(buf){ return pdfjsLib.getDocument({data: buf}).promise; })
                .then(function(pdf){
                  done();
                  var n = 1;
                  (function next(){
                    if (n > pdf.numPages) return;
                    pdf.getPage(n).then(function(pg){
                      var base = pg.getViewport({scale: 1}),
                          w = pages.clientWidth || 900,
                          vp = pg.getViewport({scale: Math.min(2.5, (w / base.width) * 1.5)}),
                          c = document.createElement('canvas');
                      c.className = 'fv-canvas';
                      c.width = vp.width; c.height = vp.height;
                      pages.appendChild(c);
                      return pg.render({canvasContext: c.getContext('2d'), viewport: vp}).promise
                        .then(function(){ n++; next(); });
                    }).catch(function(){ fail('Sayfa çizilemedi.'); });
                  })();
                })
                .catch(function(){ fail('PDF yüklenemedi.'); });
              };
              document.head.appendChild(sc);
            }

            /* Kopyalama / kaydetme caydırıcıları */
            doc.addEventListener('contextmenu', function(e){ e.preventDefault(); });
            doc.addEventListener('dragstart',  function(e){ e.preventDefault(); });
            document.addEventListener('keydown', function(e){
              var k = (e.key || '').toLowerCase();
              if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'p')) { e.preventDefault(); }
            });
          })();
          </script>
        <?php endif; ?>
      </div>

    <?php else: ?>
      <div class="quiz-view"><div class="qa-empty">İçerik bulunamadı.</div></div>
    <?php endif; ?>
  </div>

  <!-- SAĞ: müfredat -->
  <div class="curr">
    <div class="curr-head">
      <div class="curr-title">Müfredat</div>
      <div class="curr-prog" id="currProg"><?php echo intval($completed_lessons); ?> / <?php echo intval($total_lessons); ?> tamamlandı · %<?php echo intval($progress_percent); ?></div>
      <div class="curr-bar"><div id="currBar" style="width:<?php echo intval($progress_percent); ?>%"></div></div>
    </div>
    <div class="curr-list">
      <?php foreach ($curriculum as $s => $section):
        if (empty($section['lessons'])) continue;
        // Dosyalar ilerlemeye dahil olmadığı için bölüm sayacına da girmez
        // Bölüm sayacı da yüzdeyle aynı mantık: dosyalar sayılmaz
        $sec_done = 0; $sec_total = 0;
        foreach ($items as $it) {
            if ($it['s'] !== $s || empty($it['counts'])) continue;
            $sec_total++; if ($it['done']) $sec_done++;
        }
        $sec_has_active = false;
        if (($active_type === 'video' || $active_type === 'file') && $active_section === $s) $sec_has_active = true;
        if ($active_type === 'quiz') {
            foreach ($section['lessons'] as $ll) { if (($ll['type'] ?? '') === 'quiz' && intval($ll['quiz_id'] ?? 0) === $active_quiz) { $sec_has_active = true; break; } }
        }
      ?>
      <div class="mod<?php echo $sec_has_active ? ' open' : ''; ?>">
        <button class="mod-head" onclick="toggleMod(this)">
          <span><span class="mh-t"><?php echo esc_html($section['title'] ?? ('Bölüm ' . ($s + 1))); ?></span><span class="mh-s"><?php
            if ($sec_total > 0) {
                echo $sec_done . '/' . $sec_total . ' · ' . ($sec_done >= $sec_total ? 'tamamlandı' : 'devam ediyor');
            } else {
                // Yalnızca dosya içeren bölüm — tamamlanma kavramı yok
                echo count($section['lessons']) . ' dosya';
            }
          ?></span></span>
          <i class="ti ti-chevron-down mh-chev"></i>
        </button>
        <div class="mod-items">
          <?php foreach ($section['lessons'] as $l => $lesson):
            $type = $lesson['type'] ?? 'video';
            $key  = $s . '_' . $l;
            $it = null; foreach ($items as $x) { if ($x['key'] === $key) { $it = $x; break; } }
            $done = $it ? $it['done'] : false;
            $locked = $it ? ($it['gidx'] > $frontier) : false;
            if ($type === 'quiz') {
              $qid = intval($lesson['quiz_id'] ?? 0);
              $is_active = ($active_type === 'quiz' && $qid === $active_quiz);
              $url = fabo_purl($course_id, array('quiz' => $qid));
              $icon = 'ti-clipboard-check';
            } elseif ($type === 'assign') {
              $aid = intval($lesson['assignment_id'] ?? 0);
              $is_active = ($active_type === 'assign' && $aid === $active_assign);
              $url = fabo_purl($course_id, array('gorev' => $aid));
              $icon = 'ti-file-text';
            } elseif ($type === 'file') {
              // Dosya sıraya dahildir: kilit/açıldı durumu $items'tan gelir (yukarıda
              // hesaplandı). Yüzdeye sayılmaz ama açılmadan sonraki içerik açılmaz.
              $is_active = ($active_type === 'file' && $active_section === $s && $active_lesson === $l);
              $url = fabo_purl($course_id, array('section' => $s, 'lesson' => $l));
              $icon = 'ti-file-typography';
            } else {
              $is_active = ($active_type === 'video' && $active_section === $s && $active_lesson === $l);
              $url = fabo_purl($course_id, array('section' => $s, 'lesson' => $l));
              $icon = $is_active ? 'ti-player-play-filled' : 'ti-player-play';
            }
            $cls = 'citem' . ($done ? ' done' : '') . ($is_active ? ' active' : '') . (($locked && !$is_active) ? ' locked' : '');
            $tag = $type === 'quiz' ? '<span class="ci-type t-quiz">SINAV</span>' : ($type === 'assign' ? '<span class="ci-type t-assign">GÖREV</span>' : ($type === 'file' ? '<span class="ci-type t-file">DOSYA</span>' : ''));
          ?>
          <?php if ($locked && !$is_active): ?>
            <div class="<?php echo $cls; ?>"><span class="ci-ic"><i class="ti ti-lock"></i></span><div class="ci-main"><div class="ci-t"><?php echo $tag; ?><?php echo esc_html($lesson['title'] ?? 'Ders'); ?></div><div class="ci-s">Önceki tamamlanınca açılır</div></div></div>
          <?php else: ?>
            <a class="<?php echo $cls; ?>" href="<?php echo esc_url($url); ?>"><span class="ci-ic"><i class="ti <?php echo $icon; ?>"></i></span><div class="ci-main"><div class="ci-t"><?php echo $tag; ?><?php echo esc_html($lesson['title'] ?? 'Ders'); ?></div></div><span class="ci-end"><?php echo $done ? '<i class="ti ti-circle-check-filled"></i>' : (!empty($lesson['duration']) ? esc_html($lesson['duration']) : ''); ?></span></a>
          <?php endif; ?>
          <?php endforeach; ?>
        </div>
      </div>
      <?php endforeach; ?>

      <?php
      // Müfredatta yer almayan (eski/serbest) görevler ayrı bölümde
      $unref_assign = array();
      foreach ($assignments as $a) { if (empty($referenced_assign[intval($a->id)])) $unref_assign[] = $a; }
      if (!empty($unref_assign)): ?>
      <div class="mod<?php echo $active_type === 'assign' ? ' open' : ''; ?>">
        <button class="mod-head" onclick="toggleMod(this)">
          <span><span class="mh-t">Görevler</span><span class="mh-s"><?php echo count($unref_assign); ?> görev</span></span>
          <i class="ti ti-chevron-down mh-chev"></i>
        </button>
        <div class="mod-items">
          <?php foreach ($unref_assign as $a):
            $sub = !empty($a->sub_status);
            $is_active = ($active_type === 'assign' && intval($a->id) === $active_assign);
            $cls = 'citem' . ($sub ? ' done' : '') . ($is_active ? ' active' : '');
          ?>
          <a class="<?php echo $cls; ?>" href="<?php echo esc_url(fabo_purl($course_id, array('gorev' => intval($a->id)))); ?>">
            <span class="ci-ic"><i class="ti ti-file-text"></i></span>
            <div class="ci-main"><div class="ci-t"><span class="ci-type t-assign">GÖREV</span><?php echo esc_html($a->title); ?></div><?php if (!$sub && !empty($a->due_date)): ?><div class="ci-s" style="color:var(--amber);font-weight:600;"><?php echo esc_html(date_i18n('d M', strtotime($a->due_date))); ?></div><?php endif; ?></div>
            <span class="ci-end"><?php echo $sub ? '<i class="ti ti-circle-check-filled"></i>' : '<i class="ti ti-chevron-right"></i>'; ?></span>
          </a>
          <?php endforeach; ?>
        </div>
      </div>
      <?php endif; ?>
    </div>
  </div>
</div>

<script>
<?php
// Sıradaki içeriğin URL'i (quiz/görev sonrası F5 gerekmeden otomatik geçiş için)
// Sonraki içeriğin URL'i. $active_gidx TÜM tipler için doğru indeks verir (quiz/görev/video);
// eski $active_key ("section_lesson") sınav/görevde -1_-1 olup eşleşmiyordu → nextUrl boş kalıyordu.
$oesp_next_url = '';
if (!empty($items) && isset($active_gidx) && $active_gidx !== null) {
    foreach ($items as $it) {
        if ($it['gidx'] === $active_gidx + 1 && $it['gidx'] <= ($frontier + 1)) {
            $oesp_next_url = ($it['type'] === 'quiz')
                ? fabo_purl($course_id, array('quiz' => intval($it['lesson']['quiz_id'] ?? 0)))
                : (($it['type'] === 'assign')
                    ? fabo_purl($course_id, array('gorev' => intval($it['lesson']['assignment_id'] ?? 0)))
                    : fabo_purl($course_id, array('section' => $it['s'], 'lesson' => $it['l'])));
            break;
        }
    }
}
?>
window.OESP = {
  ajax: <?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>,
  nonce: <?php echo wp_json_encode($player_nonce); ?>,
  courseId: <?php echo intval($course_id); ?>,
  nextUrl: <?php echo wp_json_encode($oesp_next_url); ?>,
  preview: <?php echo $is_preview ? 'true' : 'false'; ?>,
  userName: <?php echo wp_json_encode($uname); ?>,
  lessonDone: <?php echo $lesson_done ? 'true' : 'false'; ?>,
  lesson: <?php echo $cur ? wp_json_encode(array('key' => $active_key, 'title' => $cur['title'] ?? '', 'videoType' => $vid['type'])) : 'null'; ?>
};
<?php if ($active_quiz_obj && !empty($quiz_questions)): ?>
window.OESP_QUIZ = { id: <?php echo intval($active_quiz); ?>, questions: <?php echo wp_json_encode($quiz_questions); ?> };
<?php endif; ?>
</script>
<script src="<?php echo esc_url(OES_PLUGIN_URL . 'assets/js/player.js?v=' . (@filemtime(OES_PLUGIN_DIR . 'assets/js/player.js') ?: OES_VERSION)); ?>"></script>
<?php if ($active_type === 'assign' && $active_assign_obj && empty($active_assign_obj->sub_status)): ?>
<script>
/* Ödev teslim — dosya + not (gerçek uçlara bağlı) */
(function(){
  var files=[], ass=<?php echo intval($active_assign); ?>, anonce=<?php echo wp_json_encode(wp_create_nonce('oes_assignments_nonce')); ?>, ajax=window.OESP.ajax;
  var drop=document.getElementById('avDrop'), inp=document.getElementById('avFile'), list=document.getElementById('avFiles');
  if(drop){drop.addEventListener('click',function(){inp.click();});}
  if(inp){inp.addEventListener('change',function(){ if(!inp.files.length)return; var fd=new FormData(); fd.append('action','oes_upload_assignment_file'); fd.append('nonce',anonce); fd.append('file',inp.files[0]);
    drop.innerHTML='<i class="ti ti-loader"></i> Yükleniyor…';
    fetch(ajax,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
      drop.innerHTML='<i class="ti ti-cloud-upload"></i> Başka dosya ekle';
      if(res&&res.success&&res.data&&res.data.url){ files.push({url:res.data.url,name:res.data.name||inp.files[0].name}); render(); }
      else alert((res&&res.data)||'Yükleme başarısız.');
    }).catch(function(){drop.innerHTML='<i class="ti ti-cloud-upload"></i> Dosya seç'; alert('Yükleme hatası.');});
  });}
  function render(){ list.innerHTML=files.map(function(f){return '<div class="av-file"><i class="ti ti-file"></i> '+f.name+'</div>';}).join(''); }

  /* Ses kaydı (MediaRecorder → oes_upload_voice_recording) */
  var voices=[], mediaRec, chunks=[], recTimer, recSecs=0, recBlob, recMime='audio/webm';
  var vIdle=document.querySelector('.avv-idle'), vRec=document.querySelector('.avv-recording'), vDone=document.querySelector('.avv-done');
  var avAudio=null, avPlaying=false, avCtx=null, avAnalyser=null, avRAF=null, voiceSrvUrl='', blobUrl='';
  function fmtSec(s){var m=Math.floor(s/60),ss=s%60;return (m<10?'0':'')+m+':'+(ss<10?'0':'')+ss;}

  /* Canlı ses dalgası — mikrofon seviyesine göre çubuklar */
  function startWave(stream){
    try{
      avCtx=new (window.AudioContext||window.webkitAudioContext)();
      var src=avCtx.createMediaStreamSource(stream);
      avAnalyser=avCtx.createAnalyser(); avAnalyser.fftSize=256; src.connect(avAnalyser);
      var cv=document.getElementById('avWave'); if(!cv) return;
      var g=cv.getContext('2d'); var data=new Uint8Array(avAnalyser.frequencyBinCount);
      (function draw(){
        avRAF=requestAnimationFrame(draw);
        var w=cv.width=cv.offsetWidth, h=cv.height=cv.offsetHeight;
        avAnalyser.getByteFrequencyData(data);
        g.clearRect(0,0,w,h);
        var gap=4, bw=2.5, bars=Math.max(1,Math.floor(w/gap)), step=Math.max(1,Math.floor(data.length/bars));
        for(var i=0;i<bars;i++){ var v=data[i*step]/255; var bh=Math.max(2,v*h); g.fillStyle='#2a7aa3'; g.fillRect(i*gap,(h-bh)/2,bw,bh); }
      })();
    }catch(e){}
  }
  function stopWave(){ if(avRAF)cancelAnimationFrame(avRAF); avRAF=null; if(avCtx&&avCtx.state!=='closed'){try{avCtx.close();}catch(e){}} avCtx=null; avAnalyser=null; }

  var recBtn=document.getElementById('avRec');
  if(recBtn) recBtn.addEventListener('click',function(){
    if(!navigator.mediaDevices||!window.MediaRecorder){alert('Tarayıcın ses kaydını desteklemiyor.');return;}
    navigator.mediaDevices.getUserMedia({audio:true}).then(function(stream){
      chunks=[];
      // Safari mp4, Chrome/Firefox webm üretir — desteklenen formatı seç
      var pref='';
      if(window.MediaRecorder&&MediaRecorder.isTypeSupported){
        if(MediaRecorder.isTypeSupported('audio/mp4')) pref='audio/mp4';
        else if(MediaRecorder.isTypeSupported('audio/webm')) pref='audio/webm';
      }
      try{ mediaRec=pref?new MediaRecorder(stream,{mimeType:pref}):new MediaRecorder(stream); }
      catch(e){ try{mediaRec=new MediaRecorder(stream);}catch(e2){alert('Ses kaydı başlatılamadı.');return;} }
      recMime=mediaRec.mimeType||pref||'audio/webm';
      mediaRec.ondataavailable=function(e){ if(e.data&&e.data.size>0) chunks.push(e.data); };
      mediaRec.onstop=function(){
        recBlob=new Blob(chunks,{type:recMime}); // GERÇEK mime → iOS'ta da çalar (mobilde sessizlik biterdi)
        stream.getTracks().forEach(function(t){t.stop();});
        stopWave(); vRec.hidden=true; vDone.hidden=false;
        document.getElementById('avVDur').textContent=fmtSec(recSecs);
        setPlayIcon(false); uploadVoice();
      };
      mediaRec.start(); recSecs=0; vIdle.hidden=true; vRec.hidden=false;
      startWave(stream);
      recTimer=setInterval(function(){recSecs++; document.getElementById('avRecTime').textContent=fmtSec(recSecs); if(recSecs>=180){var sb2=document.getElementById('avStop'); if(sb2) sb2.click();}},1000);
    }).catch(function(){alert('Mikrofona erişilemedi. Tarayıcı ayarlarından mikrofon iznini kontrol et.');});
  });
  var stopBtn=document.getElementById('avStop');
  if(stopBtn) stopBtn.addEventListener('click',function(){ clearInterval(recTimer); if(mediaRec&&mediaRec.state!=='inactive') mediaRec.stop(); });
  function uploadVoice(){
    var fd=new FormData(); fd.append('action','oes_upload_voice_recording'); fd.append('nonce',anonce); fd.append('voice',recBlob,'kayit.webm'); fd.append('duration',recSecs);
    fetch(ajax,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
      if(res&&res.success&&res.data&&res.data.url){ voiceSrvUrl=res.data.url; voices=[{url:res.data.url,name:(res.data.name||'ses kaydı'),duration:recSecs}]; }
      else alert((res&&res.data)||'Ses yüklenemedi.');
    }).catch(function(){alert('Ses yükleme hatası.');});
  }
  var vDel=document.getElementById('avVDel');
  if(vDel) vDel.addEventListener('click',function(){ voices=[]; voiceSrvUrl=''; if(blobUrl){try{URL.revokeObjectURL(blobUrl);}catch(e){}blobUrl='';} vDone.hidden=true; vIdle.hidden=false; if(avAudio){try{avAudio.pause();}catch(e){}avAudio=null;} avPlaying=false; });

  /* Oynat/duraklat — tek Audio örneği, ikon değişir. Safari blob mp4'ü oynatamadığı için
     yüklenen sunucu .mp4 URL'i tercih edilir (HTTP byte-range ile sorunsuz); blob yalnızca yedek. */
  function setPlayIcon(on){ var i=document.querySelector('#avPlay i'); if(i) i.className='ti '+(on?'ti-player-pause-filled':'ti-player-play-filled'); avPlaying=on; }
  function ensureAudio(){
    if(!avAudio){
      avAudio=new Audio(); avAudio.setAttribute('playsinline',''); avAudio.preload='auto';
      avAudio.onplay=function(){setPlayIcon(true);};
      avAudio.onpause=function(){setPlayIcon(false);};
      avAudio.onended=function(){setPlayIcon(false); try{avAudio.currentTime=0;}catch(e){}};
    }
    return avAudio;
  }
  function tryPlay(src, canFallback){
    var a=ensureAudio();
    if(a.getAttribute('data-src')!==src){ a.src=src; a.setAttribute('data-src',src); }
    var p=a.play();
    if(p&&p.catch) p.catch(function(){
      if(canFallback && voiceSrvUrl && src!==voiceSrvUrl){ tryPlay(voiceSrvUrl,false); return; }
      if(canFallback && !voiceSrvUrl){ alert('Ses hazırlanıyor, birkaç saniye sonra tekrar dene.'); return; }
      alert('Ses oynatılamadı.');
    });
  }
  var vPlay=document.getElementById('avPlay');
  if(vPlay) vPlay.addEventListener('click',function(){
    if(!recBlob && !voiceSrvUrl) return;
    if(avPlaying && avAudio){ avAudio.pause(); return; }
    if(voiceSrvUrl){ tryPlay(voiceSrvUrl,false); }
    else { if(!blobUrl && recBlob) blobUrl=URL.createObjectURL(recBlob); tryPlay(blobUrl,true); }
  });

  var sb=document.getElementById('avSubmit');
  if(sb){sb.addEventListener('click',function(){
    var note=document.getElementById('avNote').value;
    if(!files.length && !voices.length && !note.trim()){alert('Bir dosya, ses kaydı ya da not ekle.');return;}
    sb.disabled=true;
    var body='action=oes_submit_assignment&nonce='+encodeURIComponent(anonce)+'&assignment_id='+ass+'&submission_text='+encodeURIComponent(note)+'&files_json='+encodeURIComponent(JSON.stringify(files))+'&voices_json='+encodeURIComponent(JSON.stringify(voices));
    fetch(ajax,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
      sb.disabled=false;
      if(res&&res.success){
        // Görev teslim edildi → sonraki içeriğe geç (yoksa sayfayı yenile: "teslim edildi" durumu)
        var nu=(window.OESP&&OESP.nextUrl)?OESP.nextUrl:'';
        window.location.href = nu || window.location.href;
      } else alert((res&&res.data)||'Teslim edilemedi.');
    }).catch(function(){sb.disabled=false;alert('Bağlantı hatası.');});
  });}
})();
</script>
<?php endif; ?>

<?php // ZORUNLU ANKET: sayfadan ayrılmadan, bulunduğu ekranın üstünde modal olarak açılır
if (class_exists("OES_Surveys")) OES_Surveys::render_modal();
?>
</body>
</html>
