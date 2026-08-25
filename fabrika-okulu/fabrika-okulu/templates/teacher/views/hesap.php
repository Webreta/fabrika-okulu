<?php
/** Eğitmen — Hesap. $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
$u = wp_get_current_user();
$nonce = wp_create_nonce('oes_panel_account');
?>
<h2>Hesap Detayları</h2>
<p class="sub">Eğitmen profilin.</p>
<div style="max-width:680px;">
  <div class="ed-section">
    <div class="banner sky" id="thMsg" style="display:none;"></div>
    <form id="thForm" onsubmit="return false;">
      <div class="field-row">
        <div class="field"><label>Ad</label><input type="text" name="first_name" value="<?php echo esc_attr($u->first_name); ?>"></div>
        <div class="field"><label>Soyad</label><input type="text" name="last_name" value="<?php echo esc_attr($u->last_name); ?>"></div>
      </div>
      <div class="field"><label>E-posta</label><input type="email" value="<?php echo esc_attr($u->user_email); ?>" disabled></div>
      <div class="field-row">
        <div class="field"><label>Mevcut şifre</label><input type="password" name="current_pass" placeholder="••••••••"></div>
        <div class="field"><label>Yeni şifre</label><input type="password" name="new_pass" placeholder="En az 6 karakter"></div>
      </div>
      <div style="display:flex;justify-content:flex-end;"><button class="btn"><i class="ti ti-device-floppy"></i> Kaydet</button></div>
    </form>
  </div>
</div>
<script>
(function(){
  var f=document.getElementById('thForm'), nonce=<?php echo wp_json_encode($nonce); ?>, ajax=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
  f.addEventListener('submit',function(){
    var m=document.getElementById('thMsg'), btn=f.querySelector('button');
    var body='action=oes_panel_update_account&nonce='+encodeURIComponent(nonce)
      +'&first_name='+encodeURIComponent(f.first_name.value)+'&last_name='+encodeURIComponent(f.last_name.value)
      +'&current_pass='+encodeURIComponent(f.current_pass.value)+'&new_pass='+encodeURIComponent(f.new_pass.value);
    btn.disabled=true;
    fetch(ajax,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
      btn.disabled=false; m.style.display='flex'; m.className='banner '+(res.success?'sky':'amber');
      m.innerHTML='<i class="ti ti-'+(res.success?'circle-check':'alert-triangle')+'"></i><div>'+(res.success?((res.data&&res.data.message)||'Güncellendi.'):(res.data||'Hata.'))+'</div>';
      if(res.success){f.current_pass.value='';f.new_pass.value='';}
    }).catch(function(){btn.disabled=false;});
  });
})();
</script>
