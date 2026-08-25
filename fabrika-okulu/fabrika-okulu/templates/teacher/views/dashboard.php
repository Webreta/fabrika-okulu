<?php
/** Eğitmen — Panelim (dashboard). $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
$courses = $data['courses'];
$active  = array_filter($courses, function ($c) { return $c['status'] === 'publish'; });
?>
<h2>Merhaba, <?php echo esc_html($data['user']['first'] ?: $data['user']['name']); ?> 👋</h2>
<p class="sub">Bugün panelinde neler oluyor?</p>

<div class="dash">
  <div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-ic ic-navy"><i class="ti ti-books"></i></div><div><div class="v"><?php echo intval($data['course_count']); ?></div><div class="l">Aktif eğitim</div></div></div>
      <div class="kpi"><div class="kpi-ic ic-sky"><i class="ti ti-users"></i></div><div><div class="v"><?php echo intval($data['student_count']); ?></div><div class="l">Toplam öğrenci</div></div></div>
      <div class="kpi"><div class="kpi-ic ic-amber"><i class="ti ti-inbox"></i></div><div><div class="v"><?php echo intval($data['pending_assignments']); ?></div><div class="l">Görev gönderimi</div></div></div>
      <div class="kpi"><div class="kpi-ic ic-green"><i class="ti ti-clipboard-check"></i></div><div><div class="v"><?php echo intval($data['pending_quizzes']); ?></div><div class="l">Sınav gönderimi</div></div></div>
    </div>

    <div class="sechead"><i class="ti ti-books"></i> Aktif eğitimlerim <a class="sh-link" href="<?php echo esc_url($panel->panel_url('kurslarim')); ?>">Tümü →</a></div>
    <?php if (empty($courses)): ?>
      <div class="empty"><i class="ti ti-books"></i><p>Henüz bir eğitimin yok.</p><a class="btn" href="<?php echo esc_url($panel->panel_url('editor')); ?>"><i class="ti ti-plus"></i> İlk eğitimini oluştur</a></div>
    <?php else: ?>
      <div class="egrid3">
        <?php foreach (array_slice($courses, 0, 6) as $c):
          $pub = $c['status'] === 'publish'; ?>
        <div class="ecard">
          <div class="ec-top"><div class="ec-ic"<?php echo $pub ? '' : ' style="background:#94a3b8;"'; ?>><i class="ti ti-player-play"></i></div><span class="chip <?php echo $pub ? 'c-green' : 'c-gray'; ?>"><?php echo $pub ? 'Yayında' : 'Taslak'; ?></span></div>
          <div class="ec-title"><?php echo esc_html($c['title']); ?></div>
          <div class="ec-meta"><span><b><?php echo intval($c['students']); ?></b> öğrenci</span></div>
          <div class="ec-foot"><a class="btn sm ghost" href="<?php echo esc_url($panel->panel_url('editor') . '?edit=' . intval($c['id'])); ?>"><i class="ti ti-edit"></i> Düzenle</a><a class="btn sm ghost" href="<?php echo esc_url($panel->panel_url('ogrenciler') . '?course=' . intval($c['id'])); ?>"><i class="ti ti-users"></i></a></div>
        </div>
        <?php endforeach; ?>
      </div>
    <?php endif; ?>
  </div>

  <div class="rail">
    <div class="side-card">
      <h4><i class="ti ti-bolt"></i> Hızlı Erişim</h4>
      <a class="qlink" href="<?php echo esc_url($panel->panel_url('editor')); ?>"><span class="qic ic-navy"><i class="ti ti-plus"></i></span> Yeni eğitim oluştur <i class="ti ti-chevron-right qchev"></i></a>
      <a class="qlink" href="<?php echo esc_url($panel->panel_url('gonderim')); ?>"><span class="qic ic-amber"><i class="ti ti-inbox"></i></span> Gönderimler <i class="ti ti-chevron-right qchev"></i></a>
      <a class="qlink" href="<?php echo esc_url($panel->panel_url('sorular')); ?>"><span class="qic ic-green"><i class="ti ti-message-circle"></i></span> Sorular <i class="ti ti-chevron-right qchev"></i></a>
      <a class="qlink" href="<?php echo esc_url($panel->panel_url('takvim')); ?>"><span class="qic ic-sky"><i class="ti ti-calendar"></i></span> Takvim <i class="ti ti-chevron-right qchev"></i></a>
    </div>
    <div class="side-card">
      <h4><i class="ti ti-chart-bar"></i> Özet</h4>
      <div class="kv"><span class="k">Toplam eğitim</span><span class="val"><?php echo intval($data['course_count']); ?></span></div>
      <div class="kv"><span class="k">Yayında</span><span class="val"><?php echo count($active); ?></span></div>
      <div class="kv"><span class="k">Toplam öğrenci</span><span class="val"><?php echo intval($data['student_count']); ?></span></div>
    </div>
    <div class="cta">
      <h5>Bir sonraki eğitimin?</h5>
      <p>Şablondan başla, birkaç alanı değiştir, dakikalar içinde yayına al.</p>
      <a class="cta-btn" href="<?php echo esc_url($panel->panel_url('editor')); ?>"><i class="ti ti-plus"></i> Yeni eğitim</a>
    </div>
  </div>
</div>
