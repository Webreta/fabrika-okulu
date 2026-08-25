<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
$uid = $data['user']['id'];

// Güvenlik: yalnızca süper eğitmen
if (!class_exists('OES_Teacher') || !OES_Teacher::is_super_teacher($uid)) {
    echo '<div class="oestp-empty"><div class="oestp-empty-ic"><i class="ti ti-lock"></i></div><p>Bu bölüm yalnızca süper eğitmenlere açıktır.</p></div>';
    return;
}
$push_ok = class_exists('OES_Push') && OES_Push::available();

global $wpdb;
$courses = $wpdb->get_results("SELECT p.ID, p.post_title FROM {$wpdb->posts} p
    INNER JOIN {$wpdb->postmeta} m ON m.post_id = p.ID AND m.meta_key = '_oes_is_course' AND m.meta_value = 'yes'
    WHERE p.post_type = 'product' AND p.post_status = 'publish' ORDER BY p.post_title ASC");
?>
<div class="oestp-page-head">
    <div class="oestp-page-head-txt"><h1>Duyuru</h1><p>Öğrencilere ve eğitmenlere toplu bildirim gönder</p></div>
</div>

<?php if (!$push_ok): ?>
<div class="oesp-auth-msg error" style="margin-bottom:16px;">Push altyapısı bu sunucuda kullanılamıyor.</div>
<?php else: ?>

<div class="oestp-card" style="max-width:560px;">
    <div class="oesp-auth-msg" id="annMsg" hidden></div>
    <div class="oestp-fields">
        <label>Başlık *
            <input type="text" id="ann_title" placeholder="Örn. Yarın canlı ders var">
        </label>
        <label>Mesaj *
            <textarea id="ann_body" rows="3" placeholder="Bildirim metni"></textarea>
        </label>
        <label>Bağlantı (tıklayınca gidilecek — opsiyonel)
            <input type="text" id="ann_url" placeholder="<?php echo esc_attr(home_url('/panel/')); ?>">
        </label>
        <label>Hedef
            <select id="ann_target">
                <option value="all">Tüm kullanıcılar</option>
                <option value="students" selected>Öğrenciler</option>
                <option value="teachers">Eğitmenler</option>
                <?php if (!empty($courses)): ?>
                <optgroup label="Belirli kurs">
                    <?php foreach ($courses as $c): ?>
                    <option value="<?php echo intval($c->ID); ?>"><?php echo esc_html($c->post_title); ?></option>
                    <?php endforeach; ?>
                </optgroup>
                <?php endif; ?>
            </select>
        </label>
        <button type="button" class="oesp-btn oesp-btn-green" id="annSend"><i class="ti ti-send"></i> Duyuru gönder</button>
        <p style="font-size:12px;color:#94a3b8;margin:0;">Bildirim, seçilen hedefteki <strong>bildirime izin vermiş</strong> kullanıcılara anında gider.</p>
    </div>
</div>

<script>
(function(){
    var T = window.oesTeacher, m = document.getElementById('annMsg');
    document.getElementById('annSend').addEventListener('click', function(){
        var btn = this;
        var title = document.getElementById('ann_title').value.trim();
        var body  = document.getElementById('ann_body').value.trim();
        if(!title || !body){ m.textContent='Başlık ve mesaj zorunlu.'; m.className='oesp-auth-msg error'; m.hidden=false; return; }
        var p = new URLSearchParams();
        p.append('action','oes_tp_announce'); p.append('nonce',T.nonce);
        p.append('title',title); p.append('body',body);
        p.append('url',document.getElementById('ann_url').value);
        p.append('target',document.getElementById('ann_target').value);
        btn.disabled=true; btn.classList.add('loading');
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'})
        .then(function(r){return r.json();}).then(function(res){
            btn.disabled=false; btn.classList.remove('loading');
            m.textContent = res.data && res.data.message ? res.data.message : (res.success?'Gönderildi.':(res.data||'Hata'));
            m.className = 'oesp-auth-msg ' + (res.success?'success':'error'); m.hidden=false;
            if(res.success){ document.getElementById('ann_title').value=''; document.getElementById('ann_body').value=''; }
        }).catch(function(){ btn.disabled=false; btn.classList.remove('loading'); m.textContent='Bağlantı hatası.'; m.className='oesp-auth-msg error'; m.hidden=false; });
    });
})();
</script>
<?php endif; ?>
