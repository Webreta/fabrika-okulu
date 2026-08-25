<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
$u = $data['user'];
$current = wp_get_current_user();
$account_nonce = wp_create_nonce('oes_panel_account');
$ajax_url = admin_url('admin-ajax.php');
?>
<div class="oesp-page-head">
    <h1>Hesap detayları</h1>
    <p>Bilgilerini görüntüle ve güncelle</p>
</div>

<div class="oesp-account-card">
    <div class="oesp-account-top">
        <div class="oesp-avatar oesp-avatar-lg"><?php echo esc_html($u['initial']); ?></div>
        <div>
            <div class="oesp-account-name"><?php echo esc_html($current->display_name); ?></div>
            <div class="oesp-account-mail"><?php echo esc_html($current->user_email); ?></div>
        </div>
    </div>

    <form id="oespAccountForm" class="oesp-acc-form">
        <div class="oesp-acc-msg" id="oespAccMsg" hidden></div>

        <div class="oesp-acc-grid">
            <div class="oesp-acc-field">
                <label>Ad</label>
                <input type="text" name="first_name" value="<?php echo esc_attr($current->first_name); ?>" placeholder="Adın">
            </div>
            <div class="oesp-acc-field">
                <label>Soyad</label>
                <input type="text" name="last_name" value="<?php echo esc_attr($current->last_name); ?>" placeholder="Soyadın">
            </div>
        </div>

        <div class="oesp-acc-field">
            <label>E-posta</label>
            <input type="email" name="email" value="<?php echo esc_attr($current->user_email); ?>" readonly disabled>
            <span class="oesp-acc-lock"><i class="ti ti-lock"></i> E-posta adresi değiştirilemez.</span>
        </div>

        <div class="oesp-acc-divider"><span>Şifre değiştir</span></div>
        <p class="oesp-acc-hint">Şifreni değiştirmek istemiyorsan bu alanları boş bırak.</p>

        <div class="oesp-acc-field">
            <label>Mevcut şifre</label>
            <input type="password" name="current_pass" autocomplete="current-password" placeholder="••••••••">
        </div>
        <div class="oesp-acc-field">
            <label>Yeni şifre</label>
            <input type="password" name="new_pass" autocomplete="new-password" placeholder="En az 6 karakter">
        </div>

        <button type="submit" class="oesp-btn oesp-btn-navy oesp-btn-block"><span>Bilgileri güncelle</span></button>
    </form>
</div>

<?php // Bildirim (push) kartı — PWA ile birlikte geçici olarak kaldırıldı; PWA yeniden yapılınca geri gelecek. ?>

<div class="oesp-link-list">
    <a href="<?php echo esc_url(OES_Panel::instance()->panel_url('siparisler')); ?>" class="oesp-link-row"><i class="ti ti-receipt"></i><span>Siparişlerim</span><i class="ti ti-chevron-right oesp-chev"></i></a>
</div>

<script>
(function () {
    var form = document.getElementById('oespAccountForm');
    var msg = document.getElementById('oespAccMsg');
    var ajaxUrl = "<?php echo esc_url($ajax_url); ?>";
    var nonce = "<?php echo esc_js($account_nonce); ?>";
    if (!form) return;

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('button[type="submit"]');
        btn.classList.add('loading'); btn.disabled = true;
        msg.hidden = true;

        var body = 'action=oes_panel_update_account&nonce=' + encodeURIComponent(nonce)
            + '&first_name=' + encodeURIComponent(form.first_name.value)
            + '&last_name=' + encodeURIComponent(form.last_name.value)
            + '&current_pass=' + encodeURIComponent(form.current_pass.value)
            + '&new_pass=' + encodeURIComponent(form.new_pass.value);

        fetch(ajaxUrl, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body:body, credentials:'same-origin' })
        .then(function(r){ return r.json(); })
        .then(function(res){
            btn.classList.remove('loading'); btn.disabled = false;
            msg.hidden = false;
            if (res.success) {
                msg.className = 'oesp-acc-msg success';
                msg.textContent = (res.data && res.data.message) || 'Güncellendi.';
                form.current_pass.value = ''; form.new_pass.value = '';
            } else {
                msg.className = 'oesp-acc-msg error';
                msg.textContent = res.data || 'Bir hata oluştu.';
            }
        })
        .catch(function(){ btn.classList.remove('loading'); btn.disabled = false; msg.hidden=false; msg.className='oesp-acc-msg error'; msg.textContent='Bağlantı hatası.'; });
    });
})();
</script>
