<?php
/** Eğitmen — Belgeler (yalnızca Süper Eğitmen): belge listesi + kupon tanımlama. $data, $panel. */
if (!defined('ABSPATH')) exit;

$uid = intval($data['user']['id']);
if (!class_exists('OES_Teacher') || !OES_Teacher::is_super_teacher($uid)) {
    echo '<div class="empty"><i class="ti ti-lock"></i><p>Bu bölüm yalnızca süper eğitmenlere açıktır.</p></div>';
    return;
}

$docs  = OES_Documents::get_all();
$copts = OES_Documents::course_options_html();
$topts = OES_Documents::preset_options_html();
$nonce = wp_create_nonce('oes_documents_manage');
?>
<style>
.bg-form{margin-top:8px;background:#f4f8fc;border:1px solid var(--line);border-radius:10px;padding:12px;display:none;}
.bg-form select,.bg-form input{border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;background:#fff;}
.bg-form .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;}
.bg-result{font-size:12.5px;font-weight:600;}
</style>

<h2>Belgeler</h2>
<p class="sub">Kullanıcıların yüklediği belgeler. İncele ve ilgili kullanıcıya bir eğitim için indirim kuponu tanımla: <b>Öğrenci indirimi (%90)</b>, <b>Yeni mezun (%50)</b> veya <b>Özel</b> (yüzdeyi sen girersin). Kapsam varsayılan olarak <b>tüm eğitimlerdir</b>; listeden tek bir eğitim seçersen kupon yalnızca onda geçerli olur. Kod kişiye özeldir — aynı kullanıcıya sonradan tekrar kupon tanımlayabilirsin.</p>

<?php if (empty($docs)): ?>
  <div class="empty"><i class="ti ti-file-off"></i><p>Henüz belge yüklenmemiş.</p></div>
<?php else: ?>
<div class="tbl-wrap">
  <table class="stable">
    <thead><tr><th>Kullanıcı</th><th>Belge</th><th>Not</th><th>Tarih</th><th>Durum</th><th style="width:150px;">İşlem</th></tr></thead>
    <tbody>
      <?php foreach ($docs as $d): $issued = ($d->status === 'coupon_issued'); ?>
      <tr data-doc="<?php echo intval($d->id); ?>">
        <td><div class="st-user"><span class="st-av"><?php echo esc_html(mb_strtoupper(mb_substr($d->display_name ?: '?', 0, 1))); ?></span><div><div style="font-weight:600;"><?php echo esc_html($d->display_name ?: '—'); ?></div><div style="font-size:12px;color:var(--ink3);"><?php echo esc_html($d->user_email); ?></div></div></div></td>
        <td><a class="btn sm ghost" href="<?php echo esc_url($d->file_url); ?>" target="_blank" rel="noopener"><i class="ti ti-download"></i> <?php echo esc_html(mb_strimwidth($d->file_name ?: 'Belge', 0, 22, '…')); ?></a></td>
        <td style="max-width:220px;font-size:13px;color:var(--ink2);"><?php echo $d->note ? nl2br(esc_html($d->note)) : '—'; ?></td>
        <td style="font-size:13px;"><?php echo esc_html(date_i18n('d M Y', strtotime($d->created_at))); ?></td>
        <td>
          <?php if ($issued): ?>
            <span class="chip c-green">Kupon verildi</span><br><code style="font-size:12px;"><?php echo esc_html($d->coupon_code); ?></code>
          <?php else: ?>
            <span class="chip c-amber">Bekliyor</span>
          <?php endif; ?>
        </td>
        <td>
          <?php // Kupon verilmiş olsa bile tekrar tanımlanabilir (yeni kod üretilir) ?>
          <button type="button" class="btn sm bg-toggle"><i class="ti ti-ticket"></i> <?php echo $issued ? 'Yeni kupon' : 'Kupon'; ?></button>
          <button type="button" class="btn sm ghost bg-del"><i class="ti ti-trash"></i></button>
          <div class="bg-form">
            <select class="bg-course" style="width:100%;"><?php echo $copts; ?></select>
            <div class="row">
              <select class="bg-type"><?php echo $topts; ?></select>
              <input type="number" class="bg-amount" placeholder="Yüzde (1-100)" min="1" max="100" style="width:110px;" disabled>
              <input type="number" class="bg-expiry" placeholder="Geçerlilik (gün)" style="width:130px;" title="Boş = süresiz">
              <button type="button" class="btn sm bg-issue">Oluştur</button>
            </div>
            <div class="bg-note" style="margin-top:8px;font-size:11.5px;color:var(--ink3);">
              <i class="ti ti-lock"></i> Kod kişiye özeldir: yalnızca bu kullanıcının hesabında çalışır. Kapsam varsayılan olarak tüm eğitimlerdir.
            </div>
            <div class="bg-result" style="margin-top:8px;"></div>
          </div>
        </td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
</div>
<?php endif; ?>

<script>
(function(){
  var AJAX=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>, NONCE=<?php echo wp_json_encode($nonce); ?>;
  function post(data){var b='';for(var k in data)b+=(b?'&':'')+k+'='+encodeURIComponent(data[k]);
    return fetch(AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:b,credentials:'same-origin'}).then(function(r){return r.json();});}
  document.querySelectorAll('.bg-toggle').forEach(function(b){b.addEventListener('click',function(){
    var f=b.parentNode.querySelector('.bg-form'); f.style.display=f.style.display==='block'?'none':'block';});});
  // Yüzde alanı yalnızca "Özel" seçilince açılır (Öğrenci/Yeni mezun sabit oranlı)
  document.querySelectorAll('.bg-type').forEach(function(s){s.addEventListener('change',function(){
    var a=s.closest('.bg-form').querySelector('.bg-amount'); a.disabled=(s.value!=='custom'); if(a.disabled)a.value='';});});
  document.querySelectorAll('.bg-issue').forEach(function(b){b.addEventListener('click',function(){
    var row=b.closest('tr'), form=b.closest('.bg-form'), res=form.querySelector('.bg-result');
    var course=form.querySelector('.bg-course').value, type=form.querySelector('.bg-type').value, amount=form.querySelector('.bg-amount').value, expiry=form.querySelector('.bg-expiry').value;
    // course = "0" → tüm eğitimler (varsayılan), seçim zorunlu değil
    b.disabled=true;res.textContent='Oluşturuluyor…';res.style.color='#555';
    post({action:'oes_issue_document_coupon',nonce:NONCE,doc_id:row.getAttribute('data-doc'),course_id:course,type:type,amount:amount,expiry_days:expiry}).then(function(r){
      b.disabled=false;
      if(r&&r.success){res.textContent=r.data.message;res.style.color='#0f6e56';setTimeout(function(){location.reload();},1000);}
      else{res.textContent=(r&&r.data)||'Hata';res.style.color='#b32d2e';}
    }).catch(function(){b.disabled=false;res.textContent='Bağlantı hatası';res.style.color='#b32d2e';});
  });});
  document.querySelectorAll('.bg-del').forEach(function(b){b.addEventListener('click',function(){
    if(!confirm('Bu belgeyi silmek istediğine emin misin?'))return; var row=b.closest('tr'); b.disabled=true;
    post({action:'oes_delete_document',nonce:NONCE,doc_id:row.getAttribute('data-doc')}).then(function(r){
      if(r&&r.success){row.remove();}else{b.disabled=false;alert((r&&r.data)||'Hata');}
    }).catch(function(){b.disabled=false;alert('Bağlantı hatası');});
  });});
})();
</script>
