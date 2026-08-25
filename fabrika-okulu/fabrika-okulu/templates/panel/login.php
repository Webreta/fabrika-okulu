<?php
/**
 * Fabrika Okulu — Öğrenci girişi (v2 split). $this = OES_Panel
 *
 * OES_Panel::maybe_render'dan gelen isteğe bağlı değişkenler:
 *   $start  : açılış sekmesi — 'login' | 'forgot' | 'reset'
 *   $reset  : ['key','login','valid'] — şifre sıfırlama bağlantısıyla gelindiyse
 *   $notice : üstte gösterilecek bilgi mesajı (ör. "Şifren güncellendi")
 */
if (!defined('ABSPATH')) exit;
$logo  = $this->get_logo_url();
$home  = home_url('/');
$nonce = wp_create_nonce('oes_panel_auth');

$start  = isset($start) ? $start : 'login';
$reset  = isset($reset) ? $reset : null;
$notice = isset($notice) ? $notice : '';
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title><?php echo esc_html(get_bloginfo('name')); ?> — Giriş</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.11.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/panel.css?v=' . oes_asset_ver('assets/css/panel.css')); ?>">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/login.css?v=' . oes_asset_ver('assets/css/login.css')); ?>">
<?php if (class_exists('OES_PWA')) OES_PWA::head_tags(); ?>
</head>
<body>
<div class="lo-split">
  <aside class="lo-aside">
    <div class="lo-aside-in">
      <a class="lo-logo-pill" href="<?php echo esc_url($home); ?>"><img src="<?php echo esc_url($logo); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>"></a>
      <h2>Öğrenme yolculuğun burada başlıyor.</h2>
      <p class="tag">Kendi ritminde ilerle; video dersler, sınavlar ve görevlerle adım adım geliş.</p>
      <ul class="lo-feats">
        <li><i class="ti ti-player-play"></i><div><b>Esnek eğitimler</b><span>İstediğin zaman, istediğin yerden izle.</span></div></li>
        <li><i class="ti ti-calendar-event"></i><div><b>Takvimli programlar</b><span>Canlı oturumlar ve dönemlerle ilerle.</span></div></li>
        <li><i class="ti ti-checklist"></i><div><b>Görev &amp; sınavlar</b><span>Öğrendiğini uygula, ilerlemeni gör.</span></div></li>
      </ul>
    </div>
  </aside>

  <main class="lo-main">
    <div class="login-card">
      <div class="lo-mlogo"><a href="<?php echo esc_url($home); ?>"><img src="<?php echo esc_url($logo); ?>" alt=""></a></div>
      <h1 id="lTitle">Hoş geldin</h1>
      <p class="lsub" id="lSub">Öğrenci paneline giriş yap</p>
      <div class="lmsg<?php echo $notice ? ' show ok' : ''; ?>" id="lMsg"><?php echo esc_html($notice); ?></div>

      <div class="login-tabs"<?php echo $start === 'reset' ? ' style="display:none"' : ''; ?>>
        <button class="login-tab active" data-tab="login">Giriş Yap</button>
        <button class="login-tab" data-tab="register">Kayıt Ol</button>
      </div>

      <form class="login-form active" data-form="login">
        <div class="lfield"><i class="ti ti-user"></i><input type="text" name="log" placeholder="Kullanıcı adı veya e-posta" autocomplete="username" required></div>
        <div class="lfield has-toggle"><i class="ti ti-lock"></i><input type="password" name="pwd" placeholder="Şifre" autocomplete="current-password" required><button type="button" class="lpass" aria-label="Şifreyi göster"><i class="ti ti-eye"></i></button></div>
        <div class="lrow">
          <label class="lremember"><input type="checkbox" name="remember" value="1" checked> Beni hatırla</label>
          <button type="button" class="lforgot" data-goto="forgot">Şifremi unuttum</button>
        </div>
        <button type="submit" class="lbtn">Giriş yap</button>
      </form>

      <form class="login-form" data-form="register">
        <?php // Ad-soyad: panelde ve sertifikalarda bu isim kullanılır ?>
        <div class="lfield"><i class="ti ti-user"></i><input type="text" name="fname" placeholder="Adın" autocomplete="given-name" required></div>
        <div class="lfield"><i class="ti ti-user"></i><input type="text" name="lname" placeholder="Soyadın" autocomplete="family-name" required></div>
        <div class="lfield"><i class="ti ti-mail"></i><input type="email" name="email" placeholder="E-posta adresin" autocomplete="email" required></div>
        <div class="lfield has-toggle"><i class="ti ti-lock"></i><input type="password" name="pwd" placeholder="Şifre (en az 6 karakter)" autocomplete="new-password" required><button type="button" class="lpass" aria-label="Şifreyi göster"><i class="ti ti-eye"></i></button></div>
        <div class="lfield has-toggle"><i class="ti ti-lock-check"></i><input type="password" name="pwd2" placeholder="Şifreyi tekrar gir" autocomplete="new-password" required><button type="button" class="lpass" aria-label="Şifreyi göster"><i class="ti ti-eye"></i></button></div>
        <button type="submit" class="lbtn">Kayıt ol</button>
        <p class="lfine">Kayıt olarak kullanım koşullarını kabul etmiş olursun.</p>
      </form>

      <form class="login-form" data-form="forgot">
        <div class="lfield"><i class="ti ti-mail"></i><input type="text" name="login" placeholder="E-posta veya kullanıcı adı" autocomplete="username" required></div>
        <button type="submit" class="lbtn">Sıfırlama bağlantısı gönder</button>
        <button type="button" class="lback" data-goto="login">← Girişe dön</button>
      </form>

      <?php // Şifre sıfırlama — mail'deki bağlantıdan gelenler için ?>
      <form class="login-form" data-form="reset">
        <?php if ($reset && empty($reset['valid'])): ?>
          <p class="lfine" style="text-align:center;margin-bottom:14px;">
            Bu sıfırlama bağlantısının süresi dolmuş ya da daha önce kullanılmış.
            Aşağıdan yeni bir bağlantı isteyebilirsin.
          </p>
          <button type="button" class="lbtn" data-goto="forgot">Yeni bağlantı iste</button>
        <?php else: ?>
          <div class="lfield has-toggle"><i class="ti ti-lock"></i><input type="password" name="pwd" placeholder="Yeni şifre (en az 6 karakter)" autocomplete="new-password" required><button type="button" class="lpass" aria-label="Şifreyi göster"><i class="ti ti-eye"></i></button></div>
          <div class="lfield has-toggle"><i class="ti ti-lock-check"></i><input type="password" name="pwd2" placeholder="Yeni şifreyi tekrar gir" autocomplete="new-password" required><button type="button" class="lpass" aria-label="Şifreyi göster"><i class="ti ti-eye"></i></button></div>
          <button type="submit" class="lbtn">Şifremi güncelle</button>
        <?php endif; ?>
        <button type="button" class="lback" data-goto="login">← Girişe dön</button>
      </form>

      <a class="lback" href="<?php echo esc_url($home); ?>">← Siteye dön</a>
    </div>
  </main>
</div>

<script>
(function(){
  var ajax=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>, nonce=<?php echo wp_json_encode($nonce); ?>;
  var rdr=<?php echo wp_json_encode(isset($_GET['r']) ? wp_validate_redirect(wp_unslash($_GET['r']), '') : ''); ?>;
  var start=<?php echo wp_json_encode($start); ?>;
  var reset=<?php echo wp_json_encode($reset ? array('key'=>$reset['key'],'login'=>$reset['login']) : null); ?>;
  var card=document.querySelector('.login-card'), msg=document.getElementById('lMsg');
  var meta={login:{t:'Hoş geldin',s:'Öğrenci paneline giriş yap'},register:{t:'Hesap oluştur',s:'Birkaç saniyede kayıt ol'},forgot:{t:'Şifreni sıfırla',s:'Bağlantıyı e-postana gönderelim'},reset:{t:'Yeni şifreni belirle',s:'Güvenli bir şifre seç ve devam et'}};
  var tabs=card.querySelector('.login-tabs');
  function show(name){
    card.querySelectorAll('.login-form').forEach(function(f){f.classList.toggle('active',f.getAttribute('data-form')===name);});
    card.querySelectorAll('.login-tab').forEach(function(t){t.classList.toggle('active',t.getAttribute('data-tab')===name);});
    if(meta[name]){document.getElementById('lTitle').textContent=meta[name].t;document.getElementById('lSub').textContent=meta[name].s;}
    // Sekme şeridi yalnızca giriş/kayıt için anlamlı
    if(tabs) tabs.style.display=(name==='login'||name==='register')?'':'none';
    msg.className='lmsg';
  }
  card.querySelectorAll('.login-tab').forEach(function(t){t.addEventListener('click',function(){show(t.getAttribute('data-tab'));});});
  card.querySelectorAll('[data-goto]').forEach(function(b){b.addEventListener('click',function(){show(b.getAttribute('data-goto'));});});
  if(start!=='login'){ var keep=msg.className; show(start); msg.className=keep; }
  /* Şifre göster/gizle */
  card.querySelectorAll('.lpass').forEach(function(btn){
    btn.addEventListener('click',function(){
      var inp=btn.parentNode.querySelector('input'); if(!inp)return;
      var reveal=(inp.type==='password');
      inp.type=reveal?'text':'password';
      btn.querySelector('i').className='ti '+(reveal?'ti-eye-off':'ti-eye');
      btn.setAttribute('aria-label',reveal?'Şifreyi gizle':'Şifreyi göster');
    });
  });
  function msgShow(txt,ok){msg.className='lmsg show '+(ok?'ok':'err');msg.textContent=txt;}
  function post(action,data,btn){
    var body='action='+action+'&nonce='+encodeURIComponent(nonce);
    for(var k in data) body+='&'+k+'='+encodeURIComponent(data[k]);
    btn.disabled=true;
    fetch(ajax,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
      btn.disabled=false;
      if(res.success){ if(res.data&&res.data.redirect){msgShow('Yönlendiriliyorsun…',true);location.href=res.data.redirect;} else msgShow((res.data&&res.data.message)||'Tamam.',true); }
      else msgShow(res.data||'Bir hata oluştu.',false);
    }).catch(function(){btn.disabled=false;msgShow('Bağlantı hatası.',false);});
  }
  card.querySelectorAll('.login-form').forEach(function(form){
    form.addEventListener('submit',function(e){e.preventDefault();var type=form.getAttribute('data-form');var btn=form.querySelector('.lbtn');msg.className='lmsg';
      if(type==='login') post('oes_panel_login',{log:form.log.value,pwd:form.pwd.value,remember:(form.remember&&form.remember.checked)?1:0,redirect:rdr},btn);
      else if(type==='register'){ if(form.pwd.value!==form.pwd2.value){msgShow('Şifreler eşleşmiyor.',false);return;} post('oes_panel_register',{fname:form.fname.value,lname:form.lname.value,email:form.email.value,pwd:form.pwd.value,pwd2:form.pwd2.value,redirect:rdr},btn); }
      else if(type==='reset'){
        if(!reset){msgShow('Bağlantı geçersiz. Sıfırlama e-postasını yeniden iste.',false);return;}
        if(form.pwd.value!==form.pwd2.value){msgShow('Şifreler eşleşmiyor.',false);return;}
        post('oes_panel_resetpass',{key:reset.key,login:reset.login,pwd:form.pwd.value,pwd2:form.pwd2.value},btn);
      }
      else post('oes_panel_lostpass',{login:form.login.value},btn);
    });
  });
})();
</script>
</body>
</html>
