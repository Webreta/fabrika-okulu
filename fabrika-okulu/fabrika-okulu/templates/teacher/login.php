<?php
/** Fabrika Okulu — Eğitmen girişi (v2 split). $this = OES_Teacher_Panel */
if (!defined('ABSPATH')) exit;
$logo  = $this->get_logo_url();
$home  = home_url('/');
$nonce = wp_create_nonce('oes_teacher_auth');
?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?php echo esc_html(get_bloginfo('name')); ?> — Eğitmen Girişi</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.11.0/dist/tabler-icons.min.css">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/teacher-panel.css?v=' . OES_VERSION); ?>">
<link rel="stylesheet" href="<?php echo esc_url(OES_PLUGIN_URL . 'assets/css/login.css?v=' . OES_VERSION); ?>">
<?php if (class_exists('OES_PWA')) OES_PWA::head_tags(); ?>
</head>
<body>
<div class="lo-split">
  <aside class="lo-aside">
    <div class="lo-aside-in">
      <a class="lo-logo-pill" href="<?php echo esc_url($home); ?>"><img src="<?php echo esc_url($logo); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>"></a>
      <h2>Bilgini paylaş, sınıfını yönet.</h2>
      <p class="tag">Eğitimlerini oluştur, fiyatını belirle ve onay beklemeden yayına al.</p>
      <ul class="lo-feats">
        <li><i class="ti ti-layout-grid"></i><div><b>Kolay içerik editörü</b><span>Video, sınav ve görevleri tek yerden ekle.</span></div></li>
        <li><i class="ti ti-users"></i><div><b>Öğrenci takibi</b><span>İlerleme, gönderim ve soruları gör.</span></div></li>
        <li><i class="ti ti-rocket"></i><div><b>Onaysız yayın</b><span>Fiyatını belirle, hemen yayına al.</span></div></li>
      </ul>
    </div>
  </aside>

  <main class="lo-main">
    <div class="login-card">
      <div class="lo-mlogo"><a href="<?php echo esc_url($home); ?>"><img src="<?php echo esc_url($logo); ?>" alt=""></a></div>
      <h1 id="lTitle">Eğitmen Girişi</h1>
      <p class="lsub" id="lSub">Panele erişmek için giriş yap</p>
      <div class="lmsg" id="lMsg"></div>

      <form class="login-form active" data-form="login">
        <div class="lfield"><i class="ti ti-user"></i><input type="text" name="log" placeholder="Kullanıcı adı veya e-posta" autocomplete="username" required></div>
        <div class="lfield has-toggle"><i class="ti ti-lock"></i><input type="password" name="pwd" placeholder="Şifre" autocomplete="current-password" required><button type="button" class="lpass" aria-label="Şifreyi göster"><i class="ti ti-eye"></i></button></div>
        <div class="lrow">
          <label class="lremember"><input type="checkbox" name="remember" value="1" checked> Beni hatırla</label>
          <button type="button" class="lforgot" data-goto="forgot">Şifremi unuttum</button>
        </div>
        <button type="submit" class="lbtn">Giriş yap</button>
      </form>

      <form class="login-form" data-form="forgot">
        <div class="lfield"><i class="ti ti-mail"></i><input type="text" name="login" placeholder="E-posta veya kullanıcı adı" autocomplete="username" required></div>
        <button type="submit" class="lbtn">Sıfırlama bağlantısı gönder</button>
        <button type="button" class="lback" data-goto="login">← Girişe dön</button>
      </form>

      <a class="lback" href="<?php echo esc_url($home); ?>">← Siteye dön</a>
    </div>
  </main>
</div>

<script>
(function(){
  var ajax=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>, nonce=<?php echo wp_json_encode($nonce); ?>;
  var card=document.querySelector('.login-card'), msg=document.getElementById('lMsg');
  var meta={login:{t:'Eğitmen Girişi',s:'Panele erişmek için giriş yap'},forgot:{t:'Şifreni sıfırla',s:'Bağlantıyı e-postana gönderelim'}};
  function show(name){
    card.querySelectorAll('.login-form').forEach(function(f){f.classList.toggle('active',f.getAttribute('data-form')===name);});
    if(meta[name]){document.getElementById('lTitle').textContent=meta[name].t;document.getElementById('lSub').textContent=meta[name].s;}
    msg.className='lmsg';
  }
  card.querySelectorAll('[data-goto]').forEach(function(b){b.addEventListener('click',function(){show(b.getAttribute('data-goto'));});});
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
      if(type==='login') post('oes_teacher_login',{log:form.log.value,pwd:form.pwd.value,remember:(form.remember&&form.remember.checked)?1:0},btn);
      else post('oes_teacher_lostpass',{login:form.login.value},btn);
    });
  });
})();
</script>
</body>
</html>
