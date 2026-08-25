<?php
/**
 * Eğitmen (SÜPER EĞİTMEN) — Anket sonuçları.
 *
 * Liste, filtreler ve kullanıcı detayı wp-admin ile AYNI koddan gelir
 * (OES_Surveys_Admin::render_results) — iki yüzey ayrışmasın.
 * Anket TANIMINI düzenleme burada YOK; o yalnızca yöneticide.
 *
 * Beklenen: $data, $panel, $view
 */
if (!defined('ABSPATH')) exit;

if (!class_exists('OES_Surveys_Admin') || !OES_Surveys_Admin::can_view()) {
    echo '<h2>Anketler</h2><div class="empty"><i class="ti ti-lock"></i><p>Bu bölüme erişimin yok.</p></div>';
    return;
}

$schema = OES_Surveys::get_schema();
?>
<h2><?php echo esc_html($schema['title']); ?> — Sonuçlar</h2>
<p class="sub">
  Kullanıcıları cevaplarına göre filtreleyip liste çıkarabilirsin.
  Anket sürümü <?php echo intval($schema['version']); ?>.
</p>

<?php
// Filtre formu ve sayfalama linkleri bu view'un adresine kurulur.
// .fabo-wrap sarmalayıcısı şart: admin ekranının stilleri (tablo, çip, filtre
// satırı) o kapsam altında tanımlı, yoksa düzen çözülmez.
$base = $panel->panel_url('anketler');
?>
<div class="fabo-wrap">
  <?php OES_Surveys_Admin::render_results($base); ?>
</div>
