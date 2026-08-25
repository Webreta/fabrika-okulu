<?php
/** Eğitmen — Kurs Detayı (tek kurs: istatistik + öğrenci + gönderim + soru). $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
global $wpdb;

$uid = intval($data['user']['id']);
$cid = isset($_GET['course']) ? intval($_GET['course']) : 0;

if (!$cid || !OES_Teacher::owns_course($uid, $cid)) {
    echo '<div class="empty" style="margin-top:20px;"><i class="ti ti-alert-triangle"></i><p>Kurs bulunamadı veya erişim yetkin yok.</p><a class="btn" href="' . esc_url($panel->panel_url('kurslarim')) . '">Eğitimlerime dön</a></div>';
    return;
}

$product   = function_exists('wc_get_product') ? wc_get_product($cid) : null;
$title     = $product ? $product->get_name() : get_the_title($cid);
$status    = get_post_status($cid);
$pub       = ($status === 'publish');
$price_html = $product ? $product->get_price_html() : '';
$cover     = get_the_post_thumbnail_url($cid, 'medium') ?: '';
$is_period = get_post_meta($cid, '_oes_period_based', true) === 'yes';
$closed    = OES_Teacher_Courses::is_course_closed($cid);
$nonce     = wp_create_nonce('oes_teacher_panel');

/* Müfredat özeti */
$cur = get_post_meta($cid, '_oes_course_curriculum', true) ?: array();
$mods = is_array($cur) ? count($cur) : 0;
// $lessons = ilerlemeye SAYILAN içerik sayısı; ders dosyaları (PDF/görsel) hariç
// (ortalama ilerleme paydası budur — dosyalar sayılsa ortalama hiç %100 olmazdı).
$lessons = 0; $vids = 0; $qz = 0; $gv = 0; $dosya = 0;
foreach ((array) $cur as $s) {
    foreach (($s['lessons'] ?? array()) as $l) {
        $t = $l['type'] ?? 'video';
        if ($t === 'file')        { $dosya++; continue; }
        $lessons++;
        if ($t === 'quiz')        $qz++;
        elseif ($t === 'assign')  $gv++;
        else                      $vids++;
    }
}

/* Öğrenciler + ilerleme */
$students = $wpdb->get_results($wpdb->prepare(
    "SELECT e.user_id, e.enrolled_at, u.display_name, u.user_email
     FROM {$wpdb->prefix}oes_enrollments e
     INNER JOIN {$wpdb->users} u ON u.ID = e.user_id
     WHERE e.status = 'active' AND e.course_id = %d
     ORDER BY e.enrolled_at DESC", $cid));
$compl = array();
foreach ($wpdb->get_results($wpdb->prepare(
    "SELECT user_id, COUNT(*) c FROM {$wpdb->prefix}oes_progress
     WHERE status = 'complete' AND course_id = %d GROUP BY user_id", $cid)) as $r) {
    $compl[$r->user_id] = intval($r->c);
}
$student_count = count($students);
$avg = 0;
if ($student_count && $lessons) {
    $sum = 0;
    foreach ($students as $st) { $sum += min(100, round(($compl[$st->user_id] ?? 0) / $lessons * 100)); }
    $avg = round($sum / $student_count);
}

/* Görev teslimleri */
$subs = array();
if (OES_Module_Manager::is_active('assignments')) {
    $subs = $wpdb->get_results($wpdb->prepare(
        "SELECT s.*, a.title AS a_title, u.display_name
         FROM {$wpdb->prefix}oes_assignment_submissions s
         INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id
         INNER JOIN {$wpdb->users} u ON u.ID = s.user_id
         WHERE a.course_id = %d ORDER BY s.id DESC LIMIT 60", $cid));
}
/* Sınav sonuçları */
$quizzes = array();
if (OES_Module_Manager::is_active('quizzes')) {
    $quizzes = $wpdb->get_results($wpdb->prepare(
        "SELECT qa.id, qa.score, qa.earned_points, qa.total_points, qa.status, q.title AS q_title, u.display_name
         FROM {$wpdb->prefix}oes_quiz_attempts qa
         INNER JOIN {$wpdb->prefix}oes_quizzes q ON q.id = qa.quiz_id
         INNER JOIN {$wpdb->users} u ON u.ID = qa.user_id
         WHERE q.course_id = %d AND qa.status IN ('completed','pending_review')
         ORDER BY qa.id DESC LIMIT 60", $cid));
}
/* Sorular + yanıtlar */
$qs = array();
if (OES_Module_Manager::is_active('questions')) {
    $qs = $wpdb->get_results($wpdb->prepare(
        "SELECT q.* , u.display_name FROM {$wpdb->prefix}oes_questions q
         INNER JOIN {$wpdb->users} u ON u.ID = q.user_id
         WHERE q.course_id = %d ORDER BY q.created_at DESC LIMIT 60", $cid));
    foreach ($qs as &$q) {
        $q->answers = $wpdb->get_results($wpdb->prepare(
            "SELECT a.*, u.display_name FROM {$wpdb->prefix}oes_question_answers a
             LEFT JOIN {$wpdb->users} u ON u.ID = a.user_id
             WHERE a.question_id = %d ORDER BY a.created_at ASC", $q->id));
    }
    unset($q);
}
$first_file = function ($json) { $a = json_decode($json, true); return (is_array($a) && !empty($a[0]['url'])) ? $a[0] : null; };
$sub_count = count($subs);
$q_count = count($qs);
$q_open = 0; foreach ($qs as $q) { if (empty($q->answers)) $q_open++; }

/* Bitirme / aktivite metrikleri */
$finishers = 0;
foreach ($students as $st) { if ($lessons > 0 && ($compl[$st->user_id] ?? 0) >= $lessons) $finishers++; }
$finish_rate = $student_count ? round($finishers / $student_count * 100) : 0;
$total_done  = array_sum($compl); // öğrencilerin tamamladığı toplam ders adedi
$quiz_scores = array();
foreach ($quizzes as $q) { if ($q->status === 'completed') $quiz_scores[] = (float) $q->score; }
$quiz_avg    = $quiz_scores ? round(array_sum($quiz_scores) / count($quiz_scores)) : 0;
?>
<style>
.dt-hero{display:flex;gap:18px;align-items:center;background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px 18px;margin-bottom:18px;}
.dt-cover{width:120px;height:78px;border-radius:12px;object-fit:cover;flex-shrink:0;background:#e9eef5;}
.dt-hero-main{flex:1;min-width:0;}
.dt-hero-main h2{margin:0 0 6px;font-size:20px;}
.dt-hero-meta{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:13px;color:var(--ink2);align-items:center;}
.dt-hero-act{display:flex;gap:8px;flex-shrink:0;}
.dt-content-line{margin-top:8px;color:var(--ink3);font-size:12.5px;display:flex;align-items:center;gap:6px;}
@media(max-width:720px){.dt-hero{flex-direction:column;align-items:flex-start;}.dt-cover{width:100%;height:150px;}.dt-hero-act{width:100%;}}
.dt-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:18px;flex-wrap:wrap;}
.dt-tab{border:none;background:none;padding:10px 16px;font-size:14px;font-weight:600;color:var(--ink3);cursor:pointer;border-bottom:2px solid transparent;font-family:inherit;display:inline-flex;align-items:center;gap:7px;}
.dt-tab:hover{color:var(--navy);}
.dt-tab.on{color:var(--navy);border-bottom-color:var(--navy);}
.dt-tab .cnt{background:#eaf1f8;color:var(--navy);border-radius:20px;font-size:11px;padding:1px 8px;font-weight:700;}
.dt-pane{display:none;} .dt-pane.on{display:block;}
</style>

<div class="ed-top" style="margin-bottom:14px;">
  <a class="ed-back" href="<?php echo esc_url($panel->panel_url('kurslarim')); ?>"><i class="ti ti-arrow-left"></i> Eğitimlerim</a>
  <h2>Kurs Detayı</h2>
</div>

<div class="dt-hero">
  <?php if ($cover): ?><img class="dt-cover" src="<?php echo esc_url($cover); ?>" alt=""><?php else: ?><div class="dt-cover" style="display:flex;align-items:center;justify-content:center;color:#9fb3c8;"><i class="ti ti-player-play" style="font-size:26px;"></i></div><?php endif; ?>
  <div class="dt-hero-main">
    <h2><?php echo esc_html($title); ?></h2>
    <div class="dt-hero-meta">
      <span class="chip <?php echo $pub ? 'c-green' : 'c-gray'; ?>"><i class="ti <?php echo $pub ? 'ti-check' : 'ti-pencil'; ?>"></i> <?php echo $pub ? 'Yayında' : 'Taslak'; ?></span>
      <?php if ($is_period): ?><span class="chip c-navy"><i class="ti ti-calendar-event"></i> Takvimli</span><?php endif; ?>
      <?php if ($closed): ?><span class="chip c-gray"><i class="ti ti-lock"></i> Kapalı</span><?php endif; ?>
      <?php if ($price_html): ?><span><i class="ti ti-tag" style="vertical-align:-2px;"></i> <?php echo wp_kses_post($price_html); ?></span><?php endif; ?>
    </div>
    <div class="dt-content-line"><i class="ti ti-list-check"></i> <?php echo $mods; ?> modül · <?php echo $vids; ?> video · <?php echo $qz; ?> sınav · <?php echo $gv; ?> görev<?php if ($dosya): ?> · <?php echo $dosya; ?> dosya<?php endif; ?></div>
  </div>
  <div class="dt-hero-act">
    <a class="btn ghost sm" href="<?php echo esc_url(get_permalink($cid)); ?>" target="_blank" rel="noopener"><i class="ti ti-eye"></i> Önizle</a>
    <a class="btn sm ghost" href="<?php echo esc_url($panel->panel_url('editor') . '?edit=' . $cid); ?>"><i class="ti ti-edit"></i> Düzenle</a>
    <button type="button" class="btn sm<?php echo $closed ? '' : ' ghost'; ?>" onclick="dtToggleClose(this)"><i class="ti <?php echo $closed ? 'ti-lock-open' : 'ti-lock'; ?>"></i> <?php echo $closed ? 'Eğitimi Aç' : 'Eğitimi Kapat'; ?></button>
  </div>
</div>

<div class="kpis" style="margin-top:16px;">
  <div class="kpi"><div class="kpi-ic ic-navy"><i class="ti ti-users"></i></div><div><div class="v"><?php echo $student_count; ?></div><div class="l">Kayıtlı öğrenci</div></div></div>
  <div class="kpi"><div class="kpi-ic ic-green"><i class="ti ti-progress-check"></i></div><div><div class="v">%<?php echo $finish_rate; ?></div><div class="l"><?php echo $finishers; ?> öğrenci bitirdi</div></div></div>
  <div class="kpi"><div class="kpi-ic ic-sky"><i class="ti ti-chart-line"></i></div><div><div class="v">%<?php echo $avg; ?></div><div class="l">Ort. ilerleme</div></div></div>
  <div class="kpi"><div class="kpi-ic ic-amber"><i class="ti ti-file-text"></i></div><div><div class="v"><?php echo $sub_count; ?></div><div class="l">Görev teslimi</div></div></div>
</div>

<div class="dt-tabs" style="margin-top:20px;">
  <button class="dt-tab on" data-t="ogr" onclick="dtTab('ogr')"><i class="ti ti-users"></i> Öğrenciler <span class="cnt"><?php echo $student_count; ?></span></button>
  <button class="dt-tab" data-t="gon" onclick="dtTab('gon')"><i class="ti ti-inbox"></i> Gönderimler <span class="cnt"><?php echo $sub_count + count($quizzes); ?></span></button>
  <button class="dt-tab" data-t="sor" onclick="dtTab('sor')"><i class="ti ti-message-circle"></i> Sorular <span class="cnt"><?php echo $q_count; ?></span></button>
</div>

<!-- ÖĞRENCİLER -->
<div class="dt-pane on" id="pane-ogr">
  <?php if (empty($students)): ?>
    <div class="empty"><i class="ti ti-users"></i><p>Bu eğitime henüz kayıtlı öğrenci yok.</p></div>
  <?php else: ?>
  <div class="tbl-wrap">
    <table class="stable">
      <thead><tr><th>Öğrenci</th><th>İlerleme</th><th>Kayıt</th></tr></thead>
      <tbody>
        <?php foreach ($students as $st):
          $nm = $st->display_name ?: $st->user_email;
          $done = $compl[$st->user_id] ?? 0;
          $pc = $lessons > 0 ? min(100, round($done / $lessons * 100)) : 0;
        ?>
        <tr>
          <td><div class="st-user"><span class="st-av"><?php echo esc_html(mb_strtoupper(mb_substr($nm, 0, 1))); ?></span><div><div style="font-weight:600;"><?php echo esc_html($nm); ?></div><div style="font-size:12px;color:var(--ink3);"><?php echo esc_html($st->user_email); ?></div></div></div></td>
          <td><div class="st-prog"><div class="bar"><div style="width:<?php echo intval($pc); ?>%"></div></div> %<?php echo intval($pc); ?> <span style="color:var(--ink3);font-size:12px;">(<?php echo intval($done); ?>/<?php echo intval($lessons); ?>)</span></div></td>
          <td><?php echo $st->enrolled_at ? esc_html(date_i18n('d M Y', strtotime($st->enrolled_at))) : '—'; ?></td>
        </tr>
        <?php endforeach; ?>
      </tbody>
    </table>
  </div>
  <?php endif; ?>
</div>

<!-- GÖNDERİMLER -->
<div class="dt-pane" id="pane-gon">
  <?php if (empty($subs) && empty($quizzes)): ?>
    <div class="empty"><i class="ti ti-inbox"></i><p>Henüz gönderim yok.</p></div>
  <?php else: ?>
    <?php if (!empty($subs)): ?>
    <div class="sechead"><i class="ti ti-file-text"></i> Görev teslimleri</div>
    <div class="grid">
      <?php foreach ($subs as $s): $file = $first_file($s->file_url); $voice = $first_file($s->voice_url); ?>
      <div class="gcard">
        <div class="gc-top"><div class="gc-ic ic-sky"><i class="ti ti-file-text"></i></div><span class="chip c-sky">Teslim edildi</span></div>
        <div class="gc-title"><?php echo esc_html($s->a_title); ?></div>
        <div class="gc-meta"><i class="ti ti-user"></i> <?php echo esc_html($s->display_name); ?><?php echo !empty($s->created_at) ? ' · ' . esc_html(date_i18n('d M', strtotime($s->created_at))) : ''; ?></div>
        <?php if (!empty($s->submission_text)): ?><div class="gc-meta" style="margin-top:6px;color:var(--ink2);"><?php echo esc_html(wp_trim_words($s->submission_text, 20)); ?></div><?php endif; ?>
        <div class="gc-foot">
          <?php if ($file): ?><a class="btn sm ghost" href="<?php echo esc_url($file['url']); ?>" target="_blank" rel="noopener"><i class="ti ti-download"></i> İndir</a><?php endif; ?>
          <?php if ($voice): ?><a class="btn sm ghost" href="<?php echo esc_url($voice['url']); ?>" target="_blank" rel="noopener"><i class="ti ti-player-play"></i> Sesli yanıt</a><?php endif; ?>
          <?php if (!$file && !$voice): ?><span class="gc-meta">Sadece metin</span><?php endif; ?>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>

    <?php if (!empty($quizzes)): ?>
    <div class="sechead"><i class="ti ti-clipboard-check"></i> Sınav sonuçları <span class="chip c-gray" style="font-weight:600;">otomatik</span></div>
    <div class="grid">
      <?php foreach ($quizzes as $q): $pending = ($q->status === 'pending_review'); ?>
      <div class="gcard">
        <div class="gc-top"><div class="gc-ic <?php echo $pending ? 'ic-amber' : 'ic-green'; ?>"><i class="ti ti-clipboard-check"></i></div><span class="chip <?php echo $pending ? 'c-amber' : 'c-green'; ?>"><?php echo $pending ? 'Değerlendirme bekliyor' : 'Sonuçlandı'; ?></span></div>
        <div class="gc-title"><?php echo esc_html($q->q_title); ?></div>
        <div class="gc-meta"><i class="ti ti-user"></i> <?php echo esc_html($q->display_name); ?></div>
        <div class="gc-foot" style="justify-content:space-between;">
          <?php if (!$pending): ?><span style="font-size:18px;font-weight:700;color:var(--navy);"><?php echo (int) $q->earned_points; ?><small style="font-size:12px;color:var(--ink3);">/<?php echo (int) $q->total_points; ?> doğru</small></span><?php else: ?><span class="gc-meta">Açık uçlu sorular var</span><?php endif; ?>
        </div>
      </div>
      <?php endforeach; ?>
    </div>
    <?php endif; ?>
  <?php endif; ?>
</div>

<!-- SORULAR -->
<div class="dt-pane" id="pane-sor">
  <?php if (empty($qs)): ?>
    <div class="empty"><i class="ti ti-message-circle"></i><p>Bu eğitim altında henüz soru yok.</p></div>
  <?php else: ?>
  <div style="max-width:820px;">
    <?php foreach ($qs as $q): $init = mb_strtoupper(mb_substr($q->display_name ?: '?', 0, 1)); ?>
    <div class="qa-item2">
      <div class="qa-head"><span class="st-av" style="width:30px;height:30px;font-size:11px;"><?php echo esc_html($init); ?></span> <b><?php echo esc_html($q->display_name); ?></b><?php echo !empty($q->lesson_title) ? ' · ' . esc_html($q->lesson_title) : ''; ?> · <?php echo esc_html(date_i18n('d M', strtotime($q->created_at))); ?></div>
      <div class="qa-q2"><?php echo nl2br(esc_html($q->question_text ?? $q->question ?? '')); ?></div>
      <?php foreach ($q->answers as $a): ?>
        <div class="qa-a2"><b><?php echo esc_html($a->display_name ?: 'Eğitmen'); ?>:</b> <?php echo nl2br(esc_html($a->answer)); ?></div>
      <?php endforeach; ?>
      <textarea class="qa-reply" placeholder="Yanıtını yaz…"></textarea>
      <div style="display:flex;justify-content:flex-end;margin-top:10px;">
        <button class="btn sm" onclick="tpAnswer(this,<?php echo intval($q->user_id); ?>,<?php echo intval($q->course_id); ?>)"><i class="ti ti-send"></i> Yanıtla</button>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>

<script>
function dtTab(k){
  document.querySelectorAll('.dt-tab').forEach(function(b){b.classList.toggle('on',b.getAttribute('data-t')===k);});
  document.querySelectorAll('.dt-pane').forEach(function(p){p.classList.remove('on');});
  var el=document.getElementById('pane-'+k); if(el)el.classList.add('on');
}
var TP_NONCE=<?php echo wp_json_encode($nonce); ?>, TP_AJAX=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
function dtToggleClose(btn){
  var closing = btn.querySelector('i').classList.contains('ti-lock');
  if(closing && !confirm('Bu eğitimi kapatmak istediğine emin misin?\n\nYeni kayıt alınmayacak ve mağazadan kalkacak. Mevcut öğrenciler erişmeye devam eder.'))return;
  btn.disabled=true;
  var body='action=oes_tp_toggle_course&nonce='+encodeURIComponent(TP_NONCE)+'&course_id=<?php echo intval($cid); ?>&closed='+(closing?'1':'');
  fetch(TP_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
    btn.disabled=false;
    if(res&&res.success){ alert(res.data.message); location.reload(); }
    else alert((res&&res.data)||'İşlem başarısız.');
  }).catch(function(){btn.disabled=false;alert('Bağlantı hatası.');});
}
function tpAnswer(btn,uid,cid){
  var card=btn.closest('.qa-item2'), ta=card.querySelector('.qa-reply'), val=ta.value.trim();
  if(!val)return; btn.disabled=true;
  var body='action=oes_tp_answer_question&nonce='+encodeURIComponent(TP_NONCE)+'&chat_user_id='+uid+'&chat_course_id='+cid+'&answer='+encodeURIComponent(val);
  fetch(TP_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
    btn.disabled=false;
    if(res&&res.success){ var d=document.createElement('div'); d.className='qa-a2'; d.innerHTML='<b>Sen:</b> '+val.replace(/</g,'&lt;'); ta.parentNode.insertBefore(d,ta); ta.value=''; }
    else alert((res&&res.data)||'Yanıt gönderilemedi.');
  }).catch(function(){btn.disabled=false;alert('Bağlantı hatası.');});
}
</script>
