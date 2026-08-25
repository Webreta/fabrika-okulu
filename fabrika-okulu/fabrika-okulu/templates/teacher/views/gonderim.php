<?php
/** Eğitmen — Gönderimler (değerlendirme YOK, sadece toplanır). $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
global $wpdb;
$cids = array_map('intval', $data['course_ids']);
$ctitles = array();
foreach ($data['courses'] as $c) { $ctitles[intval($c['id'])] = $c['title']; }
$gon_nonce = wp_create_nonce('oes_teacher_panel');

$subs = array(); $quizzes = array();
if (!empty($cids)) {
    $ph = implode(',', array_fill(0, count($cids), '%d'));
    if (OES_Module_Manager::is_active('assignments')) {
        $subs = $wpdb->get_results($wpdb->prepare(
            "SELECT s.*, a.title AS a_title, a.course_id, u.display_name
             FROM {$wpdb->prefix}oes_assignment_submissions s
             INNER JOIN {$wpdb->prefix}oes_assignments a ON a.id = s.assignment_id
             INNER JOIN {$wpdb->users} u ON u.ID = s.user_id
             WHERE a.course_id IN ($ph)
             ORDER BY s.id DESC LIMIT 60", $cids));
    }
    if (OES_Module_Manager::is_active('quizzes')) {
        $quizzes = $wpdb->get_results($wpdb->prepare(
            "SELECT qa.id, qa.score, qa.earned_points, qa.total_points, qa.status, q.title AS q_title, q.course_id, u.display_name
             FROM {$wpdb->prefix}oes_quiz_attempts qa
             INNER JOIN {$wpdb->prefix}oes_quizzes q ON q.id = qa.quiz_id
             INNER JOIN {$wpdb->users} u ON u.ID = qa.user_id
             WHERE q.course_id IN ($ph) AND qa.status IN ('completed','pending_review')
             ORDER BY qa.id DESC LIMIT 40", $cids));
    }
}
$first_file = function ($json) { $a = json_decode($json, true); return (is_array($a) && !empty($a[0]['url'])) ? $a[0] : null; };
?>
<?php
// Bekleyen soru sayısı — Sorular AYRI SAYFADA; burada yalnızca varsa kısayol gösterilir
$gon_pending_q = 0;
if (!empty($cids) && OES_Module_Manager::is_active('questions')) {
    $ph_q = implode(',', array_fill(0, count($cids), '%d'));
    $gon_pending_q = (int) $wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->prefix}oes_questions WHERE course_id IN ($ph_q) AND status = 'pending'", $cids));
}
?>
<h2>Gönderimler</h2>
<p class="sub">Öğrencilerinin görev teslimleri ve sınav sonuçları.</p>

<!-- Kutular: tıklayıp içine gir. Sorular AYRI SAYFADA (üst menüde). -->
<div class="gon-hub" id="gonHub">
  <?php if ($gon_pending_q): ?>
  <a class="hub-box hub-wide" href="<?php echo esc_url($panel->panel_url('sorular')); ?>">
    <span class="hub-ic ic-amber"><i class="ti ti-message-circle"></i></span>
    <span class="hub-body">
      <span class="hub-t">Sorular</span>
      <span class="hub-c"><?php echo intval($gon_pending_q); ?> soru yanıt bekliyor</span>
    </span>
    <span class="hub-badge"><?php echo intval($gon_pending_q); ?></span>
    <i class="ti ti-chevron-right hub-arrow"></i>
  </a>
  <?php endif; ?>
  <button type="button" class="hub-box" onclick="gonShow('gorev')">
    <span class="hub-ic ic-sky"><i class="ti ti-file-text"></i></span>
    <span class="hub-body"><span class="hub-t">Görev Teslimleri</span><span class="hub-c"><?php echo count($subs); ?> teslim</span></span>
    <i class="ti ti-chevron-right hub-arrow"></i>
  </button>
  <button type="button" class="hub-box" onclick="gonShow('sinav')">
    <span class="hub-ic ic-green"><i class="ti ti-clipboard-check"></i></span>
    <span class="hub-body"><span class="hub-t">Sınav Sonuçları</span><span class="hub-c"><?php echo count($quizzes); ?> sonuç</span></span>
    <i class="ti ti-chevron-right hub-arrow"></i>
  </button>
</div>


<!-- Görev teslimleri detay -->
<div class="gon-section" id="secGorev" hidden>
  <button type="button" class="gon-back" onclick="gonShow('')"><i class="ti ti-arrow-left"></i> Geri</button>
  <div class="sechead"><i class="ti ti-file-text"></i> Görev teslimleri</div>
  <?php if (empty($subs)): ?>
    <div class="empty"><i class="ti ti-inbox"></i><p>Henüz görev teslimi yok.</p></div>
  <?php else: ?>
  <div class="grid">
    <?php foreach ($subs as $s):
      $file = $first_file($s->file_url);
      $voice = $first_file($s->voice_url);
      $tcached = '';
      if ($voice) {
          $tmap = json_decode($s->voice_transcript ?? '', true);
          if (is_array($tmap) && isset($tmap['0'])) $tcached = (string) $tmap['0'];
      } ?>
    <div class="gcard">
      <div class="gc-top"><div class="gc-ic ic-sky"><i class="ti ti-file-text"></i></div><span class="chip c-sky">Teslim edildi</span></div>
      <div class="gc-title"><?php echo esc_html($s->a_title); ?></div>
      <div class="gc-meta"><i class="ti ti-user"></i> <?php echo esc_html($s->display_name); ?> · <?php echo esc_html($ctitles[$s->course_id] ?? ''); ?></div>
      <?php if (!empty($s->submission_text)): ?><div class="gc-note"><?php echo nl2br(esc_html($s->submission_text)); ?></div><?php endif; ?>
      <?php if ($voice): ?><audio class="gc-audio" controls preload="none" playsinline src="<?php echo esc_url($voice['url']); ?>"></audio><?php endif; ?>
      <div class="gc-foot">
        <?php if ($file): ?><a class="btn sm ghost" href="<?php echo esc_url($file['url']); ?>" target="_blank" rel="noopener"><i class="ti ti-download"></i> İndir</a><?php endif; ?>
        <?php if ($voice): ?><button type="button" class="btn sm ghost oes-tp-tr" data-sid="<?php echo intval($s->id); ?>" data-vidx="0" data-audio="<?php echo esc_url($voice['url']); ?>"><i class="ti ti-file-text"></i> <span class="tr-lbl"><?php echo $tcached !== '' ? 'Transkript' : 'Transkript çıkar'; ?></span></button><?php endif; ?>
        <?php if (!$file && !$voice && empty($s->submission_text)): ?><span class="gc-meta">Sadece metin</span><?php endif; ?>
      </div>
      <?php if ($voice): ?><div class="gc-tr" id="tp-tr-<?php echo intval($s->id); ?>" data-has="<?php echo $tcached !== '' ? '1' : '0'; ?>" hidden><?php echo $tcached !== '' ? nl2br(esc_html($tcached)) : ''; ?></div><?php endif; ?>
    </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>

<!-- Sınav sonuçları detay -->
<div class="gon-section" id="secSinav" hidden>
  <button type="button" class="gon-back" onclick="gonShow('')"><i class="ti ti-arrow-left"></i> Geri</button>
  <div class="sechead"><i class="ti ti-clipboard-check"></i> Sınav sonuçları <span class="chip c-gray" style="font-weight:600;">otomatik</span></div>
  <?php if (empty($quizzes)): ?>
    <div class="empty"><i class="ti ti-inbox"></i><p>Henüz sınav sonucu yok.</p></div>
  <?php else: ?>
  <div class="grid">
    <?php foreach ($quizzes as $q):
      $pending = $q->status === 'pending_review'; ?>
    <div class="gcard">
      <div class="gc-top"><div class="gc-ic <?php echo $pending ? 'ic-amber' : 'ic-green'; ?>"><i class="ti ti-clipboard-check"></i></div><span class="chip <?php echo $pending ? 'c-amber' : 'c-green'; ?>"><?php echo $pending ? 'Değerlendirme bekliyor' : 'Sonuçlandı'; ?></span></div>
      <div class="gc-title"><?php echo esc_html($q->q_title); ?></div>
      <div class="gc-meta"><i class="ti ti-user"></i> <?php echo esc_html($q->display_name); ?> · <?php echo esc_html($ctitles[$q->course_id] ?? ''); ?></div>
      <div class="gc-foot" style="justify-content:space-between;">
        <?php if (!$pending): ?><span style="font-size:18px;font-weight:700;color:var(--navy);"><?php echo (int) $q->earned_points; ?><small style="font-size:12px;color:var(--ink3);">/<?php echo (int) $q->total_points; ?> doğru</small></span><?php else: ?><span class="gc-meta">Açık uçlu · incelenmeli</span><?php endif; ?>
        <button class="btn sm ghost" onclick="gonQuizDetail(<?php echo intval($q->id); ?>)"><i class="ti ti-eye"></i> İncele</button>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>

<!-- Sınav inceleme modalı -->
<div class="qad-overlay" id="qadOverlay" onclick="if(event.target===this)this.classList.remove('show')">
  <div class="qad-modal">
    <div class="qad-head">
      <div><h3 id="qadTitle">Sınav incelemesi</h3><div class="qad-sub" id="qadSub"></div></div>
      <button type="button" class="qad-x" onclick="document.getElementById('qadOverlay').classList.remove('show')"><i class="ti ti-x"></i></button>
    </div>
    <div class="qad-body" id="qadBody"></div>
  </div>
</div>
<style>
.qad-overlay{position:fixed;inset:0;background:rgba(15,30,55,.55);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;}
.qad-overlay.show{display:flex;}
.qad-modal{background:#fff;border-radius:16px;width:100%;max-width:640px;max-height:86vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.3);overflow:hidden;}
.qad-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:18px 20px;border-bottom:1px solid var(--line);}
.qad-head h3{font-size:16px;margin:0;color:var(--navy);}
.qad-sub{font-size:12.5px;color:var(--ink3);margin-top:3px;}
.qad-x{background:none;border:none;font-size:20px;color:var(--ink3);cursor:pointer;}
.qad-body{padding:16px 20px;overflow-y:auto;}
.qad-item{border:1px solid var(--line);border-radius:12px;padding:13px 15px;margin-bottom:12px;}
.qad-q{font-size:14px;font-weight:600;color:var(--ink);margin-bottom:9px;line-height:1.5;}
.qad-n{color:var(--navy);}
.qad-pts{font-size:11px;font-weight:600;color:var(--ink3);background:var(--card);border-radius:20px;padding:1px 8px;margin-left:4px;}
.qad-opt{font-size:13px;padding:7px 10px;border-radius:8px;margin-bottom:5px;color:var(--ink2);display:flex;align-items:center;gap:6px;}
.qad-opt .qad-mark{width:14px;font-weight:800;}
.qad-opt.opt-correct{background:#effaf3;color:#0f6e56;border:1px solid #b6e6cd;}
.qad-opt.opt-wrong{background:#fdecec;color:#b8382c;border:1px solid #f3c9c4;}
.qad-tf{font-size:13px;padding:8px 11px;border-radius:8px;}
.qad-tf.ok{background:#effaf3;color:#0f6e56;} .qad-tf.no{background:#fdecec;color:#b8382c;}
.qad-open{background:#f5f8fc;border:1px solid var(--line);border-radius:10px;padding:10px 12px;}
.qad-lbl{font-size:11.5px;font-weight:700;color:var(--navy);margin-bottom:5px;display:flex;align-items:center;gap:5px;}
.qad-open-txt{font-size:13.5px;color:var(--ink);line-height:1.6;}
/* İki kutu (hub) */
.gon-hub{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px;margin-top:6px;}
.hub-box{display:flex;align-items:center;gap:14px;width:100%;text-align:left;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:18px 18px;cursor:pointer;box-shadow:0 1px 2px rgba(20,43,86,.04),0 8px 22px rgba(20,43,86,.05);transition:border-color .15s,box-shadow .15s,transform .1s;font-family:inherit;}
.hub-box:hover{border-color:var(--navy);box-shadow:0 6px 26px rgba(20,43,86,.12);transform:translateY(-1px);}
/* Sorular kutusu tam genişlik (en üstte, öne çıksın) */
.gon-hub .hub-wide{grid-column:1/-1;}
.hub-badge{margin-left:auto;background:#d1493d;color:#fff;font-size:12px;font-weight:700;min-width:22px;height:22px;border-radius:20px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;}
.hub-ic{width:52px;height:52px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;}
.hub-body{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0;}
.hub-t{font-size:16px;font-weight:700;color:var(--ink);}
.hub-c{font-size:13px;color:var(--ink3);}
.hub-arrow{font-size:20px;color:var(--ink3);flex-shrink:0;}
.gon-back{display:inline-flex;align-items:center;gap:6px;background:none;border:none;color:var(--navy);font-size:13.5px;font-weight:600;cursor:pointer;padding:2px 0;margin-bottom:4px;font-family:inherit;}
.gon-back:hover{text-decoration:underline;}
.gon-section .sechead{margin-top:12px;}
/* Ses/transkript kart içi — taşma yok, düzgün akış */
.gc-note{font-size:13px;color:var(--ink2);margin-top:8px;line-height:1.55;word-break:break-word;}
.gc-audio{display:block;width:100%;height:36px;margin-top:12px;}
.gc-foot{flex-wrap:wrap;}
.gc-tr{margin-top:11px;background:#f5f8fc;border:1px solid var(--line);border-radius:10px;padding:11px 13px;font-size:13.5px;line-height:1.65;color:var(--ink);white-space:pre-wrap;word-break:break-word;}
.oes-tp-tr[disabled]{opacity:.7;cursor:progress;}
</style>
<script>
var GON_NONCE=<?php echo wp_json_encode($gon_nonce); ?>, GON_AJAX=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
/* İki kutu ↔ detay geçişi */
function gonShow(which){
  var hub=document.getElementById('gonHub'),
      g=document.getElementById('secGorev'), s=document.getElementById('secSinav');
  var open=(which==='gorev'||which==='sinav');
  if(hub) hub.hidden=open;
  if(g) g.hidden=which!=='gorev';
  if(s) s.hidden=which!=='sinav';
  try{ if(open){ history.replaceState(null,'','#'+which); } window.scrollTo(0,0); }catch(e){}
}
/* Derin link (#gorev / #sinav) ile açılabilsin. Sorular artık AYRI SAYFA. */
(function(){
  var h=(location.hash||'').replace('#','');
  if(h==='gorev'||h==='sinav') gonShow(h);
})();
function gonQuizDetail(id){
  var ov=document.getElementById('qadOverlay'), body=document.getElementById('qadBody');
  body.innerHTML='<div style="padding:30px;text-align:center;color:var(--ink3);">Yükleniyor…</div>';
  document.getElementById('qadTitle').textContent='Sınav incelemesi'; document.getElementById('qadSub').textContent='';
  ov.classList.add('show');
  var b='action=oes_tp_quiz_attempt&nonce='+encodeURIComponent(GON_NONCE)+'&attempt_id='+id;
  fetch(GON_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
    if(res&&res.success){
      document.getElementById('qadTitle').textContent=res.data.title||'Sınav incelemesi';
      document.getElementById('qadSub').textContent=(res.data.student||'')+(res.data.pending?' · Değerlendirme bekliyor':' · '+res.data.earned+'/'+res.data.total+' doğru');
      body.innerHTML=res.data.html||'<div style="padding:20px;color:var(--ink3);">Kayıt yok.</div>';
    } else body.innerHTML='<div style="padding:24px;color:#b32d2e;">'+((res&&res.data)||'Hata')+'</div>';
  }).catch(function(){body.innerHTML='<div style="padding:24px;color:#b32d2e;">Bağlantı hatası</div>';});
}

/* ---- Ses transkripti (istemci tarafı Whisper WASM; sonuç oes_tp_save_transcript ile önbelleğe alınır) ---- */
async function tpDecode(arrayBuffer){
  var Off=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  var probe=new Off(1,1,16000), tmp;
  try{ tmp=await probe.decodeAudioData(arrayBuffer.slice(0)); }catch(e){ throw new Error('Ses formatı desteklenmiyor'); }
  var len=Math.max(1,Math.ceil(tmp.duration*16000));
  var ctx=new Off(1,len,16000);
  var buf=await ctx.decodeAudioData(arrayBuffer.slice(0));
  if(buf.numberOfChannels===1) return buf.getChannelData(0);
  var l=buf.getChannelData(0), r=buf.getChannelData(1), out=new Float32Array(l.length);
  for(var i=0;i<l.length;i++) out[i]=(l[i]+r[i])/2;
  return out;
}
document.addEventListener('click',function(e){
  var btn=e.target.closest?e.target.closest('.oes-tp-tr'):null; if(!btn) return;
  var sid=btn.getAttribute('data-sid'), box=document.getElementById('tp-tr-'+sid); if(!box) return;
  var lbl=btn.querySelector('.tr-lbl');
  if(box.getAttribute('data-has')==='1'){ box.hidden=!box.hidden; if(lbl) lbl.textContent=box.hidden?'Transkript':'Gizle'; return; }
  tpTranscribe(btn, box, sid, btn.getAttribute('data-vidx'), btn.getAttribute('data-audio'));
});
async function tpTranscribe(btn, box, sid, vidx, url){
  var lbl=btn.querySelector('.tr-lbl');
  try{
    btn.disabled=true;
    if(lbl) lbl.textContent='Ses indiriliyor…';
    var resp=await fetch(url,{credentials:'same-origin'}); if(!resp.ok) throw new Error('Ses indirilemedi');
    var buf=await resp.arrayBuffer();
    if(lbl) lbl.textContent='Ses hazırlanıyor…';
    var data=await tpDecode(buf);
    if(lbl) lbl.textContent='AI yükleniyor…';
    var mod=await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');
    var transcriber=await mod.pipeline('automatic-speech-recognition','Xenova/whisper-small',{quantized:true});
    if(lbl) lbl.textContent='Metne çevriliyor…';
    var out=await transcriber(data,{language:'turkish',task:'transcribe',return_timestamps:false,chunk_length_s:30,stride_length_s:5});
    var text=(out.text||'').trim();
    if(!text) throw new Error('Konuşma tespit edilemedi');
    var b='action=oes_tp_save_transcript&nonce='+encodeURIComponent(GON_NONCE)+'&submission_id='+encodeURIComponent(sid)+'&voice_index='+encodeURIComponent(vidx)+'&transcript='+encodeURIComponent(text);
    fetch(GON_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b,credentials:'same-origin'});
    box.textContent=text; box.hidden=false; box.setAttribute('data-has','1');
    btn.disabled=false; if(lbl) lbl.textContent='Gizle';
  }catch(err){
    btn.disabled=false; if(lbl) lbl.textContent='Transkript çıkar';
    alert('Transkript hatası: '+((err&&err.message)||err));
  }
}
</script>
