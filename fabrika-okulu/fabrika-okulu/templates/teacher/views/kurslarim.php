<?php
/** Eğitmen — Eğitimlerim (liste). $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
$courses = $data['courses'];
?>
<style>
/* Kart altındaki ikon aksiyonları (çoğalt / taslak önizle) */
.ec-foot{flex-wrap:wrap;}
.ec-foot .btn.sm.ghost i{margin:0;}
.ec-foot .kc-dup,.ec-foot .kc-eye{padding:8px 10px;}
.ec-foot .kc-dup{margin-left:auto;}
</style>
<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:22px;">
  <div><h2 style="margin-bottom:3px;">Eğitimlerim</h2><p class="sub" style="margin:0;">Yayındaki ve taslak tüm eğitimlerin.</p></div>
  <a class="btn" href="<?php echo esc_url($panel->panel_url('editor')); ?>"><i class="ti ti-plus"></i> Yeni Eğitim</a>
</div>

<?php if (empty($courses)): ?>
  <div class="empty"><i class="ti ti-books"></i><p>Henüz bir eğitimin yok.</p><a class="btn" href="<?php echo esc_url($panel->panel_url('editor')); ?>"><i class="ti ti-plus"></i> İlk eğitimini oluştur</a></div>
<?php else: ?>
<div class="egrid3">
  <?php foreach ($courses as $c):
    $pub = $c['status'] === 'publish';
    $lesson_count = 0;
    $cur = get_post_meta($c['id'], '_oes_course_curriculum', true) ?: array();
    foreach ($cur as $sec) { if (!empty($sec['lessons'])) $lesson_count += count($sec['lessons']); }
    $has_periods = false;
    global $wpdb;
    if (OES_Module_Manager::is_active('periods')) {
      $has_periods = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->prefix}oes_periods WHERE course_id = %d", $c['id'])) > 0;
    }
  ?>
  <div class="ecard">
    <div class="ec-top">
      <div class="ec-ic"<?php echo $pub ? '' : ' style="background:#94a3b8;"'; ?>><i class="ti ti-player-play"></i></div>
      <?php if (!empty($c['closed'])): ?><span class="chip c-gray"><i class="ti ti-lock"></i> Kapalı</span><?php else: ?><span class="chip <?php echo $pub ? 'c-green' : 'c-gray'; ?>"><?php echo ($has_periods ? 'Dönemli · ' : '') . ($pub ? 'Yayında' : 'Taslak'); ?></span><?php endif; ?>
    </div>
    <div class="ec-title"><?php echo esc_html($c['title']); ?></div>
    <div class="ec-meta"><span><b><?php echo intval($c['students']); ?></b> öğrenci</span><span><b><?php echo $lesson_count; ?></b> ders</span><span><?php echo $has_periods ? 'Dönemli' : 'Standart'; ?></span></div>
    <div class="ec-foot">
      <a class="btn sm" href="<?php echo esc_url($panel->panel_url('detay') . '?course=' . intval($c['id'])); ?>"><i class="ti ti-chart-bar"></i> Detaylar</a>
      <a class="btn sm ghost" href="<?php echo esc_url($panel->panel_url('editor') . '?edit=' . intval($c['id'])); ?>"><i class="ti ti-edit"></i> Düzenle</a>
      <button type="button" class="btn sm ghost kc-dup" title="Çoğalt — aynı formatta yeni taslak oluşturur"
              onclick="kcDuplicate(this,<?php echo intval($c['id']); ?>,<?php echo wp_json_encode($c['title']); ?>)"><i class="ti ti-copy"></i></button>
      <a class="btn sm ghost kc-eye" title="<?php echo $pub ? 'Eğitim sayfasını aç' : 'Taslak sayfasını önizle'; ?>" target="_blank" rel="noopener"
         href="<?php echo esc_url(get_permalink($c['id'])); ?>"><i class="ti ti-eye"></i></a>
      <a class="btn sm ghost kc-eye" title="Dersleri öğrenci gözüyle önizle (ilerleme kaydedilmez)" target="_blank" rel="noopener"
         href="<?php echo esc_url(add_query_arg('oes-player', intval($c['id']), home_url('/kurs-izle/'))); ?>"><i class="ti ti-player-play"></i></a>
    </div>
  </div>
  <?php endforeach; ?>
</div>

<script>
var KC_NONCE=<?php echo wp_json_encode(wp_create_nonce('oes_teacher_panel')); ?>,
    KC_AJAX=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
/* Çoğalt: aynı formatta yeni TASLAK eğitim açar, editöre götürür. */
function kcDuplicate(btn,id,title){
  if(!confirm('"'+title+'" eğitimi çoğaltılsın mı?\n\nAynı müfredat ve sınav sorularıyla yeni bir TASLAK oluşturulur; dönemler kopyalanmaz. Yayına almadan içeriğini düzenleyebilirsin.')) return;
  btn.disabled=true;
  var p=new URLSearchParams();
  p.append('action','oes_tp_duplicate_course'); p.append('nonce',KC_NONCE); p.append('course_id',id);
  fetch(KC_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'})
    .then(function(r){return r.json();})
    .then(function(res){
      if(res&&res.success){ location.href=res.data.redirect; }
      else { btn.disabled=false; alert((res&&res.data)||'Eğitim çoğaltılamadı.'); }
    })
    .catch(function(){ btn.disabled=false; alert('Bağlantı hatası.'); });
}
</script>
<?php endif; ?>
