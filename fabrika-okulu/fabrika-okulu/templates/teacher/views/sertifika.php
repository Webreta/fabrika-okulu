<?php
/**
 * Eğitmen — Sertifikalar.
 * Sertifika TASARIMLARINI yönetici wp-admin'de tanımlar. Burada eğitmen, öğrencilerin
 * son başarımlarını (kursu bitirdi / başlattı / kayıt oldu) OTOMATİK listede görür ve
 * "Sertifika tanımla" ile açılan pop-up'tan uygun sertifikayı seçip verir.
 * Otomatik verilmez — her zaman eğitmenin onayı gerekir.
 * Beklenen: $data, $panel
 */
if (!defined('ABSPATH')) exit;
global $wpdb;

$uid   = intval($data['user']['id']);
$certs = OES_Certificates::get_all();
$nonce = wp_create_nonce(OES_Certificates::NONCE);

$course_ids = array_map('intval', (array) $data['course_ids']);
$sel_course = isset($_GET['course']) ? intval($_GET['course']) : 0;
if ($sel_course && !in_array($sel_course, $course_ids, true)) $sel_course = 0;

$feed = array();
if (!empty($certs) && !empty($course_ids)) {
    $ids   = $sel_course ? array($sel_course) : $course_ids;
    $ph    = implode(',', array_fill(0, count($ids), '%d'));
    $te    = $wpdb->prefix . 'oes_enrollments';
    $tp    = $wpdb->prefix . 'oes_progress';

    /* Son hareket eden öğrenciler: en son tamamlama > kursu açma > kayıt.
       Sınırlı tutulur (ilerleme hesabı öğrenci başına sorgu demek). */
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT e.user_id, e.course_id, e.enrolled_at, e.started_at,
                (SELECT MAX(p.completed_at) FROM {$tp} p
                  WHERE p.user_id = e.user_id AND p.course_id = e.course_id AND p.status = 'complete') AS last_done
           FROM {$te} e
          WHERE e.course_id IN ($ph) AND e.status = 'active'
          ORDER BY COALESCE(last_done, e.started_at, e.enrolled_at) DESC
          LIMIT 60", $ids));

    /* Verilmiş sertifikaları TEK sorguda al (satır × sertifika kadar sorgu atmayalım) */
    $issued_map = array();
    if (!empty($rows)) {
        $uids = array_unique(array_map(function ($r) { return (int) $r->user_id; }, $rows));
        $uph  = implode(',', array_fill(0, count($uids), '%d'));
        foreach ($wpdb->get_results($wpdb->prepare(
            "SELECT id, cert_id, user_id, course_id, token FROM {$wpdb->prefix}oes_certificates
              WHERE user_id IN ($uph)", $uids)) as $ic) {
            $issued_map[$ic->cert_id . ':' . $ic->user_id . ':' . $ic->course_id] = $ic;
        }
    }
    /* Sertifika ayarlarını bir kez çöz (satır başına tekrar okunmasın) */
    $cert_cfg = array();
    foreach ($certs as $c) $cert_cfg[$c->ID] = OES_Certificates::get_config($c->ID);

    foreach ($rows as $r) {
        $u = get_userdata($r->user_id);
        if (!$u) continue;

        $p         = OES_Player::compute_course_progress($r->course_id, $r->user_id);
        $completed = !empty($p['total']) && $p['completed'] >= $p['total'];
        $started   = !empty($r->started_at);

        // Ulaşılan en yüksek başarım + o başarımın tarihi
        if ($completed)     { $ach = OES_Certificates::COND_COMPLETED; $when = $r->last_done ?: $r->started_at; $lbl = 'Kursu bitirdi'; $chip = 'c-green'; }
        elseif ($started)   { $ach = OES_Certificates::COND_STARTED;   $when = $r->started_at; $lbl = 'Kursu başlattı'; $chip = 'c-sky'; }
        else                { $ach = OES_Certificates::COND_ENROLLED;  $when = $r->enrolled_at; $lbl = 'Kayıt oldu'; $chip = 'c-gray'; }

        // Bu öğrencinin bu kursta HAK ETTİĞİ sertifikalar (kural zaten elimizdeki
        // bayraklardan çözülür; ilerlemeyi tekrar hesaplamaya gerek yok)
        $elig = array(); $given = array();
        foreach ($certs as $c) {
            $rl = $cert_cfg[$c->ID]['rule'];
            if ($rl['scope'] === 'course' && (int) $rl['course_id'] !== (int) $r->course_id) continue;

            // OES_Certificates::meets() ile AYNI merdiven olmalı: tanınmayan koşul
            // "tamamlandı" sayılır (orada da default: completed dalına düşer).
            if ($rl['condition'] === OES_Certificates::COND_ENROLLED)      $ok = true;
            elseif ($rl['condition'] === OES_Certificates::COND_STARTED)   $ok = $started;
            else                                                            $ok = $completed;
            if (!$ok) continue;

            $issued = $issued_map[$c->ID . ':' . $r->user_id . ':' . $r->course_id] ?? null;
            if ($issued) $given[] = array('title' => $c->post_title, 'url' => OES_Certificates::certificate_url($issued->token), 'id' => (int) $issued->id);
            else         $elig[]  = array('id' => (int) $c->ID, 'title' => $c->post_title, 'cond' => OES_Certificates::condition_label($rl['condition']));
        }
        if (empty($elig) && empty($given)) continue; // hiçbir sertifikaya uygun değil

        $feed[] = array(
            'user_id'   => (int) $r->user_id,
            'course_id' => (int) $r->course_id,
            'name'      => OES_Certificates::display_name($u),
            'email'     => $u->user_email,
            'course'    => get_the_title($r->course_id),
            'ach'       => $ach, 'lbl' => $lbl, 'chip' => $chip,
            'when'      => $when,
            'percent'   => (int) $p['percent'],
            'elig'      => $elig,
            'given'     => $given,
        );
    }
}
?>
<style>
.sc-top{display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;margin-bottom:14px;}
.sc-top select{border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-size:13.5px;font-family:inherit;background:#fff;min-width:220px;}
.sc-res{font-size:12.5px;font-weight:600;margin-left:8px;}
.sc-when{font-size:12px;color:var(--ink3);}
.sc-given{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--green);font-weight:600;}
/* Pop-up */
.cm-ov{position:fixed;inset:0;background:rgba(12,26,46,.55);display:none;align-items:center;justify-content:center;z-index:200;padding:20px;}
.cm-ov.show{display:flex;}
.cm-box{background:#fff;border-radius:16px;max-width:520px;width:100%;box-shadow:0 24px 60px rgba(6,42,99,.3);overflow:hidden;}
.cm-head{padding:16px 18px;border-bottom:1px solid var(--line);}
.cm-head h3{font-size:16px;color:var(--navy);margin:0 0 3px;}
.cm-head p{font-size:12.5px;color:var(--ink3);margin:0;}
.cm-body{padding:14px 18px;max-height:52vh;overflow:auto;}
.cm-opt{display:flex;align-items:center;gap:11px;border:1px solid var(--line);border-radius:11px;padding:12px;margin-bottom:9px;cursor:pointer;}
.cm-opt:hover{border-color:var(--navy);background:var(--card);}
.cm-opt input{margin:0;}
.cm-opt .t{font-weight:600;font-size:13.5px;}
.cm-opt .s{font-size:12px;color:var(--ink3);}
.cm-foot{padding:13px 18px;border-top:1px solid var(--line);display:flex;justify-content:flex-end;gap:9px;background:var(--card);}
</style>

<h2>Sertifikalar</h2>
<p class="sub">Öğrencilerinin <b>son başarımları</b> aşağıda otomatik listelenir. Sertifika vermek için satırdaki <b>Sertifika tanımla</b>ya bas ve uygun sertifikayı seç. Sertifika kendiliğinden verilmez — onay sende.</p>

<?php if (empty($certs)): ?>
  <div class="empty"><i class="ti ti-certificate-off"></i><p>Henüz sertifika tanımlanmamış. Yöneticinin wp-admin → <b>Sertifikalar</b>’dan sertifika oluşturması gerekiyor.</p></div>
<?php elseif (empty($course_ids)): ?>
  <div class="empty"><i class="ti ti-school-off"></i><p>Henüz bir eğitimin yok.</p></div>
<?php else: ?>

<form class="sc-top" method="get" action="<?php echo esc_url($panel->panel_url('sertifika')); ?>">
  <select name="course" onchange="this.form.submit()">
    <option value="0">Tüm eğitimlerim</option>
    <?php foreach ($course_ids as $cid): ?>
      <option value="<?php echo intval($cid); ?>" <?php selected($sel_course, $cid); ?>><?php echo esc_html(get_the_title($cid)); ?></option>
    <?php endforeach; ?>
  </select>
  <span class="sc-when"><i class="ti ti-clock"></i> En son başarım gösterenler üstte · son 60 kayıt</span>
</form>

<?php if (empty($feed)): ?>
  <div class="empty"><i class="ti ti-user-off"></i><p>Sertifika şartını sağlayan öğrenci yok.</p></div>
<?php else: ?>
<div class="tbl-wrap">
  <table class="stable">
    <thead><tr><th>Öğrenci</th><th>Eğitim</th><th>Son başarım</th><th style="width:250px;">Sertifika</th></tr></thead>
    <tbody>
      <?php foreach ($feed as $i => $f): ?>
      <tr data-i="<?php echo intval($i); ?>">
        <td>
          <div class="st-user">
            <span class="st-av"><?php echo esc_html(mb_strtoupper(mb_substr($f['name'] ?: '?', 0, 1))); ?></span>
            <div>
              <div style="font-weight:600;"><?php echo esc_html($f['name']); ?></div>
              <div style="font-size:12px;color:var(--ink3);"><?php echo esc_html($f['email']); ?></div>
            </div>
          </div>
        </td>
        <td style="font-size:13px;"><?php echo esc_html($f['course']); ?><div class="sc-when">%<?php echo intval($f['percent']); ?> tamamlandı</div></td>
        <td>
          <span class="chip <?php echo esc_attr($f['chip']); ?>"><?php echo esc_html($f['lbl']); ?></span>
          <?php if (!empty($f['when'])): ?><div class="sc-when"><?php echo esc_html(date_i18n('d M Y · H:i', strtotime($f['when']))); ?></div><?php endif; ?>
        </td>
        <td>
          <?php foreach ($f['given'] as $g): ?>
            <div style="margin-bottom:5px;">
              <a class="sc-given" href="<?php echo esc_url($g['url']); ?>" target="_blank" rel="noopener"><i class="ti ti-circle-check-filled"></i> <?php echo esc_html($g['title']); ?></a>
              <button type="button" class="btn sm ghost sc-revoke" data-id="<?php echo intval($g['id']); ?>" title="Geri al"><i class="ti ti-x"></i></button>
            </div>
          <?php endforeach; ?>
          <?php if (!empty($f['elig'])): ?>
            <button type="button" class="btn sm sc-open"><i class="ti ti-certificate"></i> Sertifika tanımla</button>
          <?php elseif (empty($f['given'])): ?>
            <span class="sc-when">Uygun sertifika yok</span>
          <?php endif; ?>
          <span class="sc-res"></span>
        </td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
</div>
<?php endif; ?>
<?php endif; ?>

<!-- Sertifika seçme pop-up'ı -->
<div class="cm-ov" id="cmOv">
  <div class="cm-box">
    <div class="cm-head">
      <h3>Sertifika tanımla</h3>
      <p id="cmSub"></p>
    </div>
    <div class="cm-body" id="cmBody"></div>
    <div class="cm-foot">
      <button type="button" class="btn sm ghost" onclick="cmClose()">Vazgeç</button>
      <button type="button" class="btn sm" id="cmGo"><i class="ti ti-check"></i> Tanımla</button>
    </div>
  </div>
</div>

<script>
(function(){
  var AJAX=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>,
      NONCE=<?php echo wp_json_encode($nonce); ?>,
      FEED=<?php echo wp_json_encode(array_map(function ($f) {
              return array('user_id' => $f['user_id'], 'course_id' => $f['course_id'],
                           'name' => $f['name'], 'course' => $f['course'], 'elig' => $f['elig']);
          }, $feed)); ?>;
  var cur=null;

  function post(d){var b='';for(var k in d)b+=(b?'&':'')+k+'='+encodeURIComponent(d[k]);
    return fetch(AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b,credentials:'same-origin'}).then(function(r){return r.json();});}
  function esc(s){var d=document.createElement('div');d.textContent=(s==null?'':s);return d.innerHTML;}

  window.cmClose=function(){document.getElementById('cmOv').classList.remove('show');cur=null;};

  document.querySelectorAll('.sc-open').forEach(function(b){b.addEventListener('click',function(){
    var row=b.closest('tr'), f=FEED[parseInt(row.getAttribute('data-i'),10)];
    if(!f)return;
    cur={row:row,f:f};
    document.getElementById('cmSub').textContent=f.name+' · '+f.course;
    var html='';
    f.elig.forEach(function(c,i){
      html+='<label class="cm-opt"><input type="radio" name="cmcert" value="'+c.id+'"'+(i===0?' checked':'')+'>'
          + '<span><span class="t">'+esc(c.title)+'</span><br><span class="s">Şart: '+esc(c.cond)+'</span></span></label>';
    });
    document.getElementById('cmBody').innerHTML=html;
    document.getElementById('cmOv').classList.add('show');
  });});

  document.getElementById('cmGo').addEventListener('click',function(){
    if(!cur)return;
    var sel=document.querySelector('input[name="cmcert"]:checked');
    if(!sel){alert('Bir sertifika seç.');return;}
    var btn=this, res=cur.row.querySelector('.sc-res');
    btn.disabled=true; btn.textContent='Tanımlanıyor…';
    post({action:'oes_tp_issue_certificate',nonce:NONCE,cert_id:sel.value,
          course_id:cur.f.course_id,user_id:cur.f.user_id}).then(function(r){
      btn.disabled=false; btn.innerHTML='<i class="ti ti-check"></i> Tanımla';
      if(r&&r.success){cmClose();location.reload();}
      else{res.textContent=(r&&r.data)||'Hata';res.style.color='#d1493d';cmClose();}
    }).catch(function(){btn.disabled=false;btn.innerHTML='<i class="ti ti-check"></i> Tanımla';alert('Bağlantı hatası');});
  });

  document.getElementById('cmOv').addEventListener('click',function(e){ if(e.target===this) cmClose(); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') cmClose(); });

  document.querySelectorAll('.sc-revoke').forEach(function(b){b.addEventListener('click',function(){
    if(!confirm('Sertifika geri alınsın mı? Öğrencinin bağlantısı çalışmaz hale gelir.'))return;
    b.disabled=true;
    post({action:'oes_tp_revoke_certificate',nonce:NONCE,id:b.getAttribute('data-id')}).then(function(r){
      if(r&&r.success){location.reload();} else {b.disabled=false;alert((r&&r.data)||'Hata');}
    }).catch(function(){b.disabled=false;alert('Bağlantı hatası');});
  });});
})();
</script>
