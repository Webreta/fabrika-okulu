<?php
/** Eğitmen — Takvim (dönem oturumları). $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
global $wpdb;
$cids = array_map('intval', $data['course_ids']);
$sessions = array();
if (!empty($cids) && OES_Module_Manager::is_active('periods')) {
    $ph = implode(',', array_fill(0, count($cids), '%d'));
    $periods = $wpdb->get_results($wpdb->prepare(
        "SELECT p.*, pr.post_title AS course_title FROM {$wpdb->prefix}oes_periods p
         LEFT JOIN {$wpdb->posts} pr ON pr.ID = p.course_id
         WHERE p.course_id IN ($ph) ORDER BY p.start_date ASC", $cids));
    foreach ($periods as $p) {
        $sch = json_decode($p->schedule, true);
        if (is_array($sch)) {
            foreach ($sch as $ev) {
                if (empty($ev['date'])) continue;
                $sessions[] = array(
                    'date'   => $ev['date'],
                    'time'   => $ev['time'] ?? '',
                    'title'  => $ev['title'] ?? ($p->course_title . ' oturumu'),
                    'link'   => $ev['link'] ?? '',
                    'period' => $p->name,
                    'course' => $p->course_title,
                );
            }
        }
    }
    usort($sessions, function ($a, $b) { return strcmp($a['date'], $b['date']); });
}
$mon = array(1=>'Oca',2=>'Şub',3=>'Mar',4=>'Nis',5=>'May',6=>'Haz',7=>'Tem',8=>'Ağu',9=>'Eyl',10=>'Eki',11=>'Kas',12=>'Ara');
?>
<h2>Takvim</h2>
<p class="sub">Dönem oturumların ve canlı derslerin.</p>
<div class="banner sky"><i class="ti ti-lock"></i><div>Dönem bilgileri yayından sonra kilitlidir. Bir sorun olursa yalnızca <b>Zoom linkini</b> güncelleyebilirsin (yönetim panelinden).</div></div>

<?php if (empty($sessions)): ?>
  <div class="empty"><i class="ti ti-calendar"></i><p>Takvimde oturum yok. Dönem eklenince oturumlar burada görünür.</p></div>
<?php else: ?>
<div class="grid">
  <?php foreach ($sessions as $ev): $ts = strtotime($ev['date']); ?>
  <div class="gcard">
    <div class="gc-top"><div class="gc-ic ic-navy"><i class="ti ti-calendar"></i></div><span class="chip c-navy"><?php echo intval(date('j', $ts)) . ' ' . esc_html($mon[intval(date('n', $ts))]) . ($ev['time'] ? ' · ' . esc_html($ev['time']) : ''); ?></span></div>
    <div class="gc-title"><?php echo esc_html($ev['title']); ?></div>
    <div class="gc-meta"><i class="ti ti-users"></i> <?php echo esc_html(trim($ev['course'] . ' · ' . $ev['period'], ' ·')); ?></div>
    <?php if (!empty($ev['link'])): ?>
    <div class="gc-foot"><a class="btn sm" href="<?php echo esc_url($ev['link']); ?>" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Zoom'u aç</a></div>
    <?php endif; ?>
  </div>
  <?php endforeach; ?>
</div>
<?php endif; ?>
