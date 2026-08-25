<?php
/** Eğitmen — Öğrencilerim. $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
global $wpdb;
$cids = array_map('intval', $data['course_ids']);
$sel  = isset($_GET['course']) ? intval($_GET['course']) : 0;
if ($sel && !in_array($sel, $cids, true)) $sel = 0;

$ctitles = array();
foreach ($data['courses'] as $c) { $ctitles[intval($c['id'])] = $c['title']; }

// Kurs başına toplam ders sayısı — ders DOSYALARI (PDF/görsel) ilerlemeye
// dahil olmadığı için sayılmaz; sayılsaydı her şeyi bitiren öğrenci %100 göremezdi.
$totals = array();
foreach ($cids as $cid) {
    $t = 0; $cur = get_post_meta($cid, '_oes_course_curriculum', true) ?: array();
    foreach ($cur as $s) {
        foreach (($s['lessons'] ?? array()) as $l) {
            if (($l['type'] ?? 'video') === 'file') continue;
            $t++;
        }
    }
    $totals[$cid] = $t;
}

$rows = array(); $completed = array();
if (!empty($cids)) {
    $filter = $sel ? array($sel) : $cids;
    $ph = implode(',', array_fill(0, count($filter), '%d'));
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT e.user_id, e.course_id, e.enrolled_at, u.display_name, u.user_email
         FROM {$wpdb->prefix}oes_enrollments e
         INNER JOIN {$wpdb->users} u ON u.ID = e.user_id
         WHERE e.status='active' AND e.course_id IN ($ph)
         ORDER BY e.enrolled_at DESC", $filter));
    $cr = $wpdb->get_results($wpdb->prepare(
        "SELECT user_id, course_id, COUNT(*) c FROM {$wpdb->prefix}oes_progress
         WHERE status='complete' AND course_id IN ($ph) GROUP BY user_id, course_id", $filter));
    foreach ($cr as $r) { $completed[$r->course_id . '_' . $r->user_id] = intval($r->c); }
}
?>
<h2>Öğrencilerim</h2>
<p class="sub">Eğitimlerine kayıtlı öğrenciler ve ilerlemeleri.</p>

<div class="filters">
  <a class="fchip<?php echo $sel === 0 ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('ogrenciler')); ?>">Tümü</a>
  <?php foreach ($ctitles as $cid => $t): ?>
  <a class="fchip<?php echo $sel === $cid ? ' active' : ''; ?>" href="<?php echo esc_url($panel->panel_url('ogrenciler') . '?course=' . $cid); ?>"><?php echo esc_html($t); ?></a>
  <?php endforeach; ?>
</div>

<?php if (empty($rows)): ?>
  <div class="empty"><i class="ti ti-users"></i><p>Henüz kayıtlı öğrenci yok.</p></div>
<?php else: ?>
<div class="tbl-wrap">
  <table class="stable">
    <thead><tr><th>Öğrenci</th><th>Eğitim</th><th>İlerleme</th><th>Kayıt</th></tr></thead>
    <tbody>
      <?php foreach ($rows as $r):
        $nm = $r->display_name ?: $r->user_email;
        $tot = $totals[$r->course_id] ?? 0;
        $com = $completed[$r->course_id . '_' . $r->user_id] ?? 0;
        $pc = $tot > 0 ? round($com / $tot * 100) : 0;
      ?>
      <tr>
        <td><div class="st-user"><span class="st-av"><?php echo esc_html(mb_strtoupper(mb_substr($nm, 0, 1))); ?></span><div><div style="font-weight:600;"><?php echo esc_html($nm); ?></div><div style="font-size:12px;color:var(--ink3);"><?php echo esc_html($r->user_email); ?></div></div></div></td>
        <td><?php echo esc_html($ctitles[$r->course_id] ?? '—'); ?></td>
        <td><div class="st-prog"><div class="bar"><div style="width:<?php echo intval($pc); ?>%"></div></div> %<?php echo intval($pc); ?></div></td>
        <td><?php echo $r->enrolled_at ? esc_html(date_i18n('d M Y', strtotime($r->enrolled_at))) : '—'; ?></td>
      </tr>
      <?php endforeach; ?>
    </tbody>
  </table>
</div>
<?php endif; ?>
