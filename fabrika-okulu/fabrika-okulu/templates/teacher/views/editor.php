<?php
/** Eğitmen — Kurs Editörü (ürün girme). $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
global $wpdb;

$edit_id = isset($_GET['edit']) ? intval($_GET['edit']) : 0;
$ec = $edit_id ? OES_Teacher_Courses::get_course_for_edit($data['user']['id'], $edit_id) : null;
$is_new = !$ec;
$nonce  = wp_create_nonce('oes_teacher_panel');
$cats   = get_terms(array('taxonomy' => 'product_cat', 'hide_empty' => false));
$curr   = $ec ? $ec['curriculum'] : array();

$periods = array();
if (!$is_new && OES_Module_Manager::is_active('periods')) {
    $periods = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_periods WHERE course_id = %d ORDER BY start_date ASC", $edit_id));
}

// Yayınlanmış kurs → kilit modu: mevcut müfredat + dönem tarihleri düzenlenemez.
// Sadece yeni müfredat öğesi eklenebilir ve dönem Zoom linkleri güncellenebilir.
$locked = (!$is_new && ($ec['status'] ?? '') === 'publish' && !current_user_can('manage_options'));

/* Sınav öğeleri için mevcut soruları çek */
$quiz_q = array(); $quiz_pass = array();
foreach ($curr as $sec) {
    foreach (($sec['lessons'] ?? array()) as $ls) {
        if (($ls['type'] ?? '') === 'quiz' && intval($ls['quiz_id'] ?? 0)) {
            $qid = intval($ls['quiz_id']);
            $quiz_q[$qid] = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$wpdb->prefix}oes_quiz_questions WHERE quiz_id = %d ORDER BY id ASC", $qid));
            $quiz_pass[$qid] = (int) $wpdb->get_var($wpdb->prepare("SELECT pass_score FROM {$wpdb->prefix}oes_quizzes WHERE id = %d", $qid));
        }
    }
}
$qb_uid = 0;

/** Sınav soru satırını server-side render (JS ile aynı yapı) */
function fabo_render_question($q, &$uid) {
    $uid++;
    $type = $q->question_type ?? 'multiple_choice';
    $pts  = intval($q->points ?? 1);
    ob_start(); ?>
    <div class="qb-q" data-qtype="<?php echo esc_attr($type); ?>">
      <div class="qb-q-top">
        <select class="qbf-type" onchange="qbType(this)">
          <option value="multiple_choice" <?php selected($type,'multiple_choice'); ?>>Çoktan seçmeli</option>
          <option value="true_false" <?php selected($type,'true_false'); ?>>Doğru / Yanlış</option>
          <option value="open_ended" <?php selected($type,'open_ended'); ?>>Açık uçlu</option>
        </select>
        <input class="qbf-points" type="number" value="<?php echo $pts; ?>" min="1" title="Puan">
        <button type="button" class="qb-delq" onclick="this.closest('.qb-q').remove()"><i class="ti ti-trash"></i></button>
      </div>
      <textarea class="qbf-qtext" placeholder="Sorunuzu buraya yazın"><?php echo esc_textarea($q->question_text); ?></textarea>
      <div class="qb-opts" data-uid="<?php echo $uid; ?>">
        <?php
        if ($type === 'multiple_choice') {
            $opts = json_decode($q->options, true) ?: array();
            $correct = json_decode($q->correct_answer, true); $correct = is_array($correct) ? $correct : array();
            foreach ($opts as $i => $opt): $chk = in_array($i, $correct) ? 'checked' : ''; ?>
              <label class="qb-opt"><input type="radio" name="c-<?php echo $uid; ?>" class="qbf-correct" <?php echo $chk; ?>><input class="qbf-opt" value="<?php echo esc_attr($opt); ?>" placeholder="Cevap seçeneğini girin"><button type="button" onclick="this.closest('.qb-opt').remove()"><i class="ti ti-x"></i></button></label>
            <?php endforeach; ?>
            <button type="button" class="qb-addopt" onclick="qbAddOpt(this)">+ Seçenek</button>
        <?php } elseif ($type === 'true_false') {
            $tf = ($q->correct_answer === 'true'); ?>
            <label class="qb-opt"><input type="radio" name="c-<?php echo $uid; ?>" class="qbf-tf" value="true" <?php checked($tf, true); ?>> Doğru</label>
            <label class="qb-opt"><input type="radio" name="c-<?php echo $uid; ?>" class="qbf-tf" value="false" <?php checked($tf, false); ?>> Yanlış</label>
        <?php } else { ?>
            <div class="qb-hint">Açık uçlu — öğrenci serbest yazar.</div>
        <?php } ?>
      </div>
    </div>
    <?php return ob_get_clean();
}
?>
<style>
.cb-l-extra{display:flex;flex-direction:column;gap:6px;margin-top:6px;}
.cb-l-extra input,.cb-l-extra textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:12.5px;font-family:inherit;outline:none;background:#fff;}
.cb-l-extra textarea{resize:vertical;min-height:52px;}
.img-prev{margin-top:10px;max-width:200px;border-radius:10px;display:none;}
/* Yükleme durumu (kapak görseli) */
.upbox.busy{pointer-events:none;background:#eef5fb;border-color:#c3d0e0;color:var(--navy);}
.upbox.done{border-color:#bfe3cf;background:#f3fbf7;color:#1f7a4d;}
.upbox .ed-bar{display:block;height:4px;border-radius:4px;background:#dbe6f1;margin-top:8px;overflow:hidden;}
.upbox .ed-bar i{display:block;height:100%;width:0;background:var(--navy);transition:width .18s linear;}
.ed-spin{display:inline-block;animation:edspin .9s linear infinite;}
@keyframes edspin{to{transform:rotate(360deg);}}
/* Zengin metin editörü */
.rte{border:1px solid var(--line);border-radius:10px;overflow:hidden;}
.rte-tb{display:flex;gap:2px;padding:6px;background:var(--card);border-bottom:1px solid var(--line);flex-wrap:wrap;}
.rte-tb button{width:32px;height:32px;border:none;background:none;border-radius:7px;color:var(--ink2);cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center;}
.rte-tb button:hover{background:var(--hover);color:var(--navy);}
.rte-body{min-height:140px;padding:12px 14px;font-size:14px;line-height:1.7;outline:none;color:var(--ink);}
.rte-body h3{font-size:16px;margin:10px 0 6px;} .rte-body ul,.rte-body ol{margin:8px 0 8px 22px;} .rte-body p{margin:0 0 8px;}
/* Sınav builder */
.qb{margin-top:8px;border-top:1px dashed var(--line);padding-top:10px;}
.qb-top{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.qb-top label{font-size:12px;color:var(--ink2);font-weight:600;}
.qb-top .cbf-pass{width:90px;border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-size:13px;}
.qb-addq{margin-left:auto;font-size:12.5px;font-weight:600;color:var(--navy);background:none;border:1px dashed #c3d0e0;border-radius:8px;padding:7px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}
.qb-q{border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px;background:#fff;}
.qb-q-top{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
.qb-q-top select,.qb-q-top .qbf-points{border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-size:13px;font-family:inherit;}
.qb-q-top .qbf-points{width:72px;}
.qb-delq{margin-left:auto;background:none;border:none;color:var(--ink3);cursor:pointer;font-size:16px;}
.qb-delq:hover{color:#d1493d;}
.qbf-qtext{width:100%;border:1px solid var(--line);border-radius:8px;padding:9px 11px;font-size:13.5px;font-family:inherit;resize:vertical;min-height:44px;margin-bottom:8px;}
.qb-opt{display:flex;align-items:center;gap:8px;margin-bottom:6px;}
.qb-opt input[type=radio]{accent-color:var(--navy);width:16px;height:16px;flex-shrink:0;}
.qb-opt .qbf-opt{flex:1;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;}
.qb-opt>button{background:none;border:none;color:var(--ink3);cursor:pointer;font-size:15px;}
.qb-addopt{font-size:12px;font-weight:600;color:var(--navy);background:none;border:none;cursor:pointer;padding:4px 0;}
.qb-hint{font-size:11.5px;color:var(--ink3);}
/* Dönem kartları */
.pd-card{border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px;background:#fff;}
.pd-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;}
.pd-head>.ti{color:var(--navy);font-size:18px;}
.pd-head .pf-name{flex:1;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:14px;font-weight:600;font-family:inherit;}
.pd-del{background:none;border:none;color:var(--ink3);cursor:pointer;font-size:16px;}
.pd-del:hover{color:#d1493d;}
.pd-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:10px;}
.fhint{display:block;margin-top:4px;font-size:11px;color:var(--ink3);line-height:1.4;}
.pd-card .field{margin:0;}
.pd-card .field label{font-size:11.5px;color:var(--ink3);display:block;margin-bottom:4px;}
.pd-card .field input{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit;background:#fff;}
@media(max-width:980px){.pd-grid{grid-template-columns:1fr 1fr;}}
@media(max-width:640px){.pd-grid{grid-template-columns:1fr;}}
/* Kilitli alanlar */
.ed-lock input:disabled,.ed-lock textarea:disabled,.ed-lock select:disabled{background:#f1f5f9;color:var(--ink2);cursor:not-allowed;-webkit-text-fill-color:var(--ink2);opacity:1;}
.cb-mod[data-locked] .cbm-del,.cb-lesson[data-locked] .cb-l-act,.pd-card[data-locked] .pd-del{display:none !important;}
.cb-lesson[data-locked] .qb-addq,.cb-lesson[data-locked] .qb-delq,.cb-lesson[data-locked] .qb-addopt,.cb-lesson[data-locked] .qb-opt>button{display:none !important;}
.cb-mod[data-locked] .cb-add{opacity:1;}
/* Yayınlama onay modalı */
.pubm-overlay{position:fixed;inset:0;background:rgba(15,30,55,.55);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px;}
.pubm-overlay.show{display:flex;}
.pubm{background:#fff;border-radius:16px;width:100%;max-width:520px;box-shadow:0 24px 60px rgba(0,0,0,.3);overflow:hidden;}
.pubm-steps{display:flex;gap:6px;padding:16px 20px 0;}
.pubm-steps .st{flex:1;height:4px;border-radius:4px;background:#e2e8f0;}
.pubm-steps .st.on{background:var(--navy);}
.pubm-body{padding:20px 22px 8px;min-height:130px;}
.pubm-body h4{font-size:18px;margin-bottom:6px;color:var(--navy);display:flex;align-items:center;gap:8px;}
.pubm-body p{font-size:13.5px;color:var(--ink2);line-height:1.6;margin-bottom:12px;}
.pubm-kv{background:#f5f7fa;border-radius:10px;padding:8px 14px;font-size:13.5px;}
.pubm-kv .row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #e8edf3;}
.pubm-kv .row:last-child{border-bottom:none;}
.pubm-kv .k{color:var(--ink3);} .pubm-kv .v{font-weight:600;color:var(--ink);text-align:right;}
.pubm-list{margin:0;padding-left:18px;font-size:13.5px;color:var(--ink);line-height:1.7;}
.pubm-warn{background:#fff4e6;border:1px solid #ffd8a8;border-radius:10px;padding:12px 14px;font-size:13.5px;color:#8a5a00;line-height:1.6;}
.pubm-foot{display:flex;align-items:center;gap:8px;padding:14px 20px 18px;border-top:1px solid var(--line);}
/* Dönem ders programı (schedule) */
.pd-sched-head{font-size:12.5px;font-weight:700;color:var(--ink2);margin:14px 0 8px;display:flex;align-items:center;gap:6px;}
.pd-sched-head span{font-weight:400;color:var(--ink3);}
.pd-sched{display:flex;flex-direction:column;gap:8px;}
.ss-row{display:grid;grid-template-columns:150px 108px 1fr 1fr 32px;gap:8px;align-items:center;background:#f4f8fc;border:1px solid var(--line);border-radius:10px;padding:8px;}
.ss-row input{border:1px solid var(--line);border-radius:8px;padding:7px 9px;font-size:12.5px;font-family:inherit;background:#fff;width:100%;}
.ss-del{width:30px;height:30px;border:none;border-radius:8px;background:#fdecec;color:#d1493d;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:15px;}
.ss-del:hover{background:#f7d4d4;}
.pd-addsess{margin-top:10px;font-size:12.5px;font-weight:600;color:var(--navy);background:#eef5fb;border:1px dashed #c3d0e0;border-radius:8px;padding:7px 12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}
.pd-addsess:hover{background:#e2eef8;}
@media(max-width:720px){.ss-row{grid-template-columns:1fr 1fr 30px;}.ss-row .ss-title,.ss-row .ss-link{grid-column:1/-1;}}
.qb-note{font-size:11.5px;color:var(--ink2);display:inline-flex;align-items:center;gap:5px;}
/* Hafif renklendirme — silme/aksiyon butonları görünür olsun (kaybolmasın) */
.cbm-del,.cb-l-act>button,.qb-delq,.pd-del{background:#fdecec;color:#d1493d;border-radius:8px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;}
.cbm-del:hover,.cb-l-act>button:hover,.qb-delq:hover,.pd-del:hover{background:#f7d4d4;color:#b8382c;}
.qb-opt>button{background:#fdecec;color:#d1493d;border-radius:7px;}
.qb-addq{background:#eef5fb;}
.qb-addopt{background:#eef5fb;border-radius:7px;padding:5px 10px;}
/* Ders tiplerini hafif renkle ayır (art arda eklenenler karışmasın) */
.cb-lesson{border-left:3px solid transparent;}
.cb-lesson[data-type="video"]{border-left-color:#5baecf;background:#f5fafd;}
.cb-lesson[data-type="quiz"]{border-left-color:#e0a423;background:#fffaf0;}
.cb-lesson[data-type="assign"]{border-left-color:#27a567;background:#f3fbf7;}
.cb-lesson[data-type="file"]{border-left-color:#7c6ce0;background:#f7f6fd;}
.cb-l-ic.file{background:#ece9fb;color:#5b4bc4;}
.cbfile{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
.cbfile-n{font-size:13px;color:var(--ink2);background:#fff;border:1px solid var(--line);border-radius:8px;padding:7px 11px;flex:1;min-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cbfile-btn{background:#eaf4fa;border:1px solid #cfe4ef;color:#194977;border-radius:8px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;}
.cbfile-btn:hover{background:#dceefa;}
.cbfile-btn:disabled{opacity:.6;cursor:default;}
.cbfile-note{display:block;margin-top:6px;font-size:11.5px;color:var(--ink3);}
</style>

<div class="ed-top">
  <a class="ed-back" href="<?php echo esc_url($panel->panel_url('kurslarim')); ?>"><i class="ti ti-arrow-left"></i> Eğitimlerim</a>
  <h2><?php echo $is_new ? 'Yeni Eğitim' : 'Eğitimi Düzenle'; ?></h2>
  <div class="ed-actions">
    <?php if ($locked): ?>
      <span class="chip c-green" style="align-self:center;"><i class="ti ti-lock"></i> Yayında · kilitli</span>
      <button class="btn ghost" onclick="edPreview('sayfa')"><i class="ti ti-eye"></i> Sayfa</button>
      <button class="btn ghost" onclick="edPreview('player')"><i class="ti ti-player-play"></i> Player</button>
      <button class="btn" onclick="edSave('publish')"><i class="ti ti-device-floppy"></i> Değişiklikleri kaydet</button>
    <?php else: ?>
      <button class="btn ghost" onclick="edPreview('sayfa')"><i class="ti ti-eye"></i> Sayfa önizle</button>
      <button class="btn ghost" onclick="edPreview('player')"><i class="ti ti-player-play"></i> Player önizle</button>
      <button class="btn ghost" onclick="edSave('draft')"><i class="ti ti-device-floppy"></i> Taslak kaydet</button>
      <button class="btn" onclick="edPublish()"><i class="ti ti-upload"></i> Yayınla</button>
    <?php endif; ?>
  </div>
</div>
<div class="banner sky" id="edMsg" style="display:none;"></div>
<?php if ($locked): ?>
<div class="banner amber" style="margin-bottom:16px;"><i class="ti ti-lock"></i><div>Bu eğitim <b>yayında ve kilitli</b>. Müfredat tamamen kilitlidir — mevcut içerik değişmez, <b>yeni video/sınav/görev de eklenemez</b>. Yalnızca <b>devam eden dönemlerin ders programı linkleri</b> güncellenebilir; süresi biten dönemde o da kapalıdır. Daha fazla değişiklik gerekirse yönetici wp-admin'den yapar.</div></div>
<?php endif; ?>

<form id="edForm" onsubmit="return false;">
  <input type="hidden" id="ed_course_id" value="<?php echo intval($edit_id); ?>">
  <input type="hidden" id="ed_image_id" value="<?php echo $ec ? intval($ec['image_id']) : 0; ?>">

  <?php if ($is_new): ?>
  <div class="ed-section">
    <div class="ed-sec-head"><h3><i class="ti ti-layout-grid"></i> Şablondan başla</h3><p>Hazır bir şablonu çoğalt, sadece gerekli alanları değiştir.</p></div>
    <div class="tmpl-grid">
      <div class="tmpl-card" onclick="edTemplate('standart')"><div class="tc-ic"><i class="ti ti-player-play"></i></div><h5>Standart Video Eğitim</h5><p>Sıralı video dersleri + modül sonu sınav ve görev.</p></div>
      <div class="tmpl-card" onclick="edTemplate('donemli')"><div class="tc-ic"><i class="ti ti-broadcast"></i></div><h5>Dönemli Canlı Eğitim</h5><p>Videolar + haftalık canlı oturumlar.</p></div>
      <div class="tmpl-card" onclick="edTemplate('atolye')"><div class="tc-ic"><i class="ti ti-tools"></i></div><h5>Atölye / Uygulama</h5><p>Az video, çok görev ve teslim odaklı.</p></div>
    </div>
  </div>
  <?php endif; ?>

  <div class="ed-section">
    <div class="ed-sec-head"><h3><i class="ti ti-info-circle"></i> Genel Bilgiler</h3></div>
    <div class="field"><label>Eğitim başlığı</label><input type="text" id="ed_title" value="<?php echo $ec ? esc_attr($ec['title']) : ''; ?>" placeholder="ör. Üretim Planlama Temelleri"></div>
    <div class="field"><label>Kısa açıklama</label><input type="text" id="ed_short" value="<?php echo $ec ? esc_attr($ec['short_desc']) : ''; ?>" placeholder="Kart üzerinde görünen tek cümlelik özet"></div>
    <div class="field"><label>Açıklama</label>
      <div class="rte">
        <div class="rte-tb">
          <button type="button" onclick="rteCmd('bold')" title="Kalın"><i class="ti ti-bold"></i></button>
          <button type="button" onclick="rteCmd('italic')" title="İtalik"><i class="ti ti-italic"></i></button>
          <button type="button" onclick="rteBlock('h3')" title="Başlık"><i class="ti ti-heading"></i></button>
          <button type="button" onclick="rteBlock('p')" title="Paragraf"><i class="ti ti-typography"></i></button>
          <button type="button" onclick="rteCmd('insertUnorderedList')" title="Liste"><i class="ti ti-list"></i></button>
          <button type="button" onclick="rteCmd('insertOrderedList')" title="Numaralı liste"><i class="ti ti-list-numbers"></i></button>
          <button type="button" onclick="rteLink()" title="Bağlantı"><i class="ti ti-link"></i></button>
        </div>
        <div class="rte-body" id="ed_desc_rt" contenteditable="true"><?php echo $ec ? wp_kses_post($ec['description']) : ''; ?></div>
      </div>
    </div>
    <div class="field"><label>Kapak görseli</label>
      <div class="upbox" id="ed_upbox" onclick="document.getElementById('ed_cover').click()"><i class="ti ti-photo"></i> Kapak görseli yükle</div>
      <input type="file" id="ed_cover" hidden accept="image/*">
      <img class="img-prev" id="ed_prev" <?php echo ($ec && $ec['image_url']) ? 'src="'.esc_url($ec['image_url']).'" style="display:block;"' : ''; ?>>
    </div>
    <div class="banner sky" style="margin-top:12px;"><i class="ti ti-category"></i><div>Kategori <b>otomatik</b> belirlenir: dönem eklersen <b>Takvimli</b>, ücretsiz işaretlersen <b>Ücretsiz</b>, ikisi de yoksa <b>Esnek</b> gruba girer.</div></div>
  </div>

  <div class="ed-section">
    <div class="ed-sec-head"><h3><i class="ti ti-award"></i> Kazanımlar & İçerik</h3><p>Kurs sayfasında gösterilir.</p></div>
    <div class="field"><label>Kazanımlar <span style="color:var(--ink3);font-weight:400;">(her satıra bir madde)</span></label><textarea id="ed_outcomes" placeholder="Bu eğitimi bitirince neler öğrenecek?"><?php echo $ec ? esc_textarea(implode("\n", (array) $ec['outcomes'])) : ''; ?></textarea></div>
    <div class="field-row">
      <div class="field"><label>Gereksinimler</label><textarea id="ed_req" placeholder="Ön koşullar, gerekli araçlar…"><?php echo $ec ? esc_textarea($ec['requirements']) : ''; ?></textarea></div>
      <div class="field"><label>Hedef kitle</label><textarea id="ed_target" placeholder="Bu eğitim kimler için?"><?php echo $ec ? esc_textarea($ec['target']) : ''; ?></textarea></div>
    </div>
    <div class="field"><label>Önizleme videosu (URL)</label><input type="text" id="ed_preview" value="<?php echo $ec ? esc_attr($ec['preview_video']) : ''; ?>" placeholder="YouTube / Vimeo linki"></div>
  </div>

  <div class="ed-section">
    <div class="ed-sec-head"><h3><i class="ti ti-tag"></i> Fiyatlandırma</h3><p>Fiyatı sen belirlersin, onay beklemeden yayınlarsın.</p></div>
    <div class="switch-row" style="padding-top:0;">
      <div><div class="sr-t">Ücretsiz eğitim</div><div class="sr-s">Açık olursa fiyat alanları devre dışı kalır.</div></div>
      <label class="toggle"><input type="checkbox" id="ed_free" <?php echo ($ec && $ec['is_free']) ? 'checked' : ''; ?> onchange="edFreeToggle()"><span class="tg"></span></label>
    </div>
    <div class="field-row" style="margin-top:8px;">
      <div class="field"><label>Fiyat (₺)</label><input type="number" id="ed_price" value="<?php echo $ec ? esc_attr($ec['price']) : ''; ?>" placeholder="2400"></div>
      <div class="field"><label>İndirimli fiyat (₺) — opsiyonel</label><input type="number" id="ed_sale" value="<?php echo $ec ? esc_attr($ec['sale_price']) : ''; ?>" placeholder="1990"></div>
    </div>
    <div class="field-row" style="margin-top:8px;">
      <div class="field"><label>İndirim bitiş tarihi — opsiyonel</label><input type="date" id="ed_sale_to" value="<?php echo $ec ? esc_attr($ec['sale_to'] ?? '') : ''; ?>"><small class="fhint">Girersen indirimli fiyat bu tarihe kadar geçerli olur; sonrasında otomatik normal fiyata döner.</small></div>
    </div>
  </div>

  <div class="ed-section">
    <div class="ed-sec-head"><h3><i class="ti ti-list-check"></i> Müfredat</h3><p>Modüller ekle; her modüle <b>video, sınav, görev ve dosya</b> ekleyebilirsin. Sınav soruları da burada girilir. Dosyalar (PDF/görsel) öğrenciye indirilemez şekilde gösterilir ve ilerlemeyi etkilemez.</p></div>
    <div id="cbMods">
      <?php if (!empty($curr)): foreach ($curr as $sec): ?>
      <div class="cb-mod"<?php echo $locked ? ' data-locked="1"' : ''; ?>>
        <div class="cb-mod-head"><i class="ti ti-grip-vertical cbm-grip"></i><input class="cbm-title" value="<?php echo esc_attr($sec['title'] ?? ''); ?>"><button type="button" class="cbm-del" onclick="this.closest('.cb-mod').remove()"><i class="ti ti-trash"></i></button></div>
        <div class="cb-lessons">
          <?php foreach (($sec['lessons'] ?? array()) as $ls):
            $t = $ls['type'] ?? 'video'; $qid = intval($ls['quiz_id'] ?? 0); ?>
          <div class="cb-lesson" data-type="<?php echo esc_attr($t); ?>" data-aid="<?php echo intval($ls['assignment_id'] ?? 0); ?>" data-qid="<?php echo $qid; ?>"<?php echo $locked ? ' data-locked="1"' : ''; ?>>
            <span class="cb-l-ic <?php echo $t === 'quiz' ? 'quiz' : ($t === 'assign' ? 'assign' : ($t === 'file' ? 'file' : 'video')); ?>"><i class="ti <?php echo $t === 'quiz' ? 'ti-clipboard-check' : ($t === 'assign' ? 'ti-file-text' : ($t === 'file' ? 'ti-file-typography' : 'ti-player-play')); ?>"></i></span>
            <div class="cb-l-main">
              <input class="cbf-title" placeholder="Başlık" value="<?php echo esc_attr($ls['title'] ?? ''); ?>">
              <?php if ($t === 'file'): ?>
              <div class="cb-l-extra">
                <input type="hidden" class="cbf-file_key" value="<?php echo esc_attr($ls['file_key'] ?? ''); ?>">
                <input type="hidden" class="cbf-file_url" value="<?php echo esc_attr($ls['file_url'] ?? ''); ?>">
                <input type="hidden" class="cbf-file_name" value="<?php echo esc_attr($ls['file_name'] ?? ''); ?>">
                <input type="hidden" class="cbf-file_mime" value="<?php echo esc_attr($ls['file_mime'] ?? ''); ?>">
                <div class="cbfile">
                  <span class="cbfile-n"><?php echo esc_html(!empty($ls['file_name']) ? $ls['file_name'] : 'Dosya seçilmedi'); ?></span>
                  <button type="button" class="cbfile-btn" onclick="edPickFile(this)"><i class="ti ti-upload"></i> Dosya seç</button>
                </div>
                <span class="cbfile-note"><i class="ti ti-lock"></i> PDF veya görsel · öğrenci indiremez/kopyalayamaz · <b>ilerlemeye dahil değildir</b></span>
              </div>
              <?php elseif ($t === 'video'): ?>
              <div class="cb-l-extra"><input class="cbf-video_url" placeholder="Video URL (YouTube/Vimeo/mp4)" value="<?php echo esc_attr($ls['video_url'] ?? ''); ?>"><input class="cbf-duration" inputmode="numeric" placeholder="Süre — dk:sn (ör. 02:35)" onblur="edFixDur(this)" value="<?php echo esc_attr($ls['duration'] ?? ''); ?>"><span class="cbfile-note">Süreyi <b>dakika:saniye</b> yaz — <b>2:35</b> = 2 dk 35 sn. Uzun videoda sa:dk:sn (1:02:35) da olur.</span></div>
              <?php elseif ($t === 'assign'): ?>
              <div class="cb-l-extra"><textarea class="cbf-description" placeholder="Görev açıklaması"><?php echo esc_textarea($ls['description'] ?? ''); ?></textarea><label style="font-size:11.5px;color:var(--ink3);">Teslim süresi — kayıttan (dönemliyse dönem başından) sonra kaç gün?</label><input class="cbf-due_days" type="number" min="0" placeholder="ör. 7 (boş = süresiz)" value="<?php echo esc_attr($ls['due_days'] ?? ''); ?>"></div>
              <?php elseif ($t === 'quiz'): ?>
              <div class="cb-l-extra">
                <label style="font-size:11.5px;color:var(--ink3);">Son tarih — kayıttan (dönemliyse dönem başından) sonra kaç gün?</label>
                <input class="cbf-due_days" type="number" min="0" placeholder="ör. 7 (boş = süresiz)" value="<?php echo esc_attr($ls['due_days'] ?? ''); ?>">
              </div>
              <div class="qb">
                <div class="qb-top"><span class="qb-note"><i class="ti ti-info-circle"></i> Öğrenci çözer ve otomatik geçer; sadece kaçta kaç yaptığını görür.</span><button type="button" class="qb-addq" onclick="qbAddQ(this)"><i class="ti ti-plus"></i> Soru ekle</button></div>
                <div class="qb-qs"><?php if (!empty($quiz_q[$qid])) foreach ($quiz_q[$qid] as $qq) echo fabo_render_question($qq, $qb_uid); ?></div>
              </div>
              <?php endif; ?>
            </div>
            <div class="cb-l-act"><button type="button" onclick="this.closest('.cb-lesson').remove()"><i class="ti ti-trash"></i></button></div>
          </div>
          <?php endforeach; ?>
        </div>
        <div class="cb-add">
          <button type="button" onclick="edAddLesson(this,'video')"><i class="ti ti-player-play"></i> Video ekle</button>
          <button type="button" onclick="edAddLesson(this,'quiz')"><i class="ti ti-clipboard-check"></i> Sınav ekle</button>
          <button type="button" onclick="edAddLesson(this,'assign')"><i class="ti ti-file-text"></i> Görev ekle</button>
          <button type="button" onclick="edAddLesson(this,'file')"><i class="ti ti-file-typography"></i> Dosya ekle</button>
        </div>
      </div>
      <?php endforeach; endif; ?>
    </div>
    <button type="button" class="cb-addmod" onclick="edAddMod()"><i class="ti ti-plus"></i> Yeni modül ekle</button>
  </div>

  <div class="ed-section">
    <div class="ed-sec-head"><h3><i class="ti ti-calendar-event"></i> Dönemler <span class="chip c-navy" style="font-weight:600;">opsiyonel</span></h3><p>Dönem eklersen bu eğitim otomatik <b>takvimli</b> gruba girer. Dönem yoksa <b>esnek</b> eğitim olur.</p></div>
    <div class="banner sky" style="margin-bottom:16px;"><i class="ti ti-lock"></i><div>Eğitim <b>yayınlandıktan sonra</b> dönem bilgileri kilitlenir; yalnızca <b>ders programı linkleri</b> güncellenebilir (isim/saat/tarih değişmez). <b>Süresi biten dönemde</b> link de güncellenemez. Kayıt son tarihi otomatik olarak <b>başlangıçtan bir gün önce</b> (o günün 23:59'u).</div></div>
    <div id="pdList">
      <?php if (!empty($periods)): foreach ($periods as $i => $p):
        $sched = json_decode((string) ($p->schedule ?? ''), true); if (!is_array($sched)) $sched = array();
        $p_passed = (!empty($p->end_date) && strtotime($p->end_date) < strtotime('today'));
      ?>
      <div class="pd-card" data-id="<?php echo intval($p->id); ?>"<?php echo $locked ? ' data-locked="1"' : ''; ?><?php echo $p_passed ? ' data-passed="1"' : ''; ?>>
        <div class="pd-head"><i class="ti ti-calendar-event"></i><input class="pf-name" value="<?php echo esc_attr($p->name); ?>" placeholder="<?php echo intval($i + 1); ?>. Dönem"><?php if ($p_passed): ?><span class="chip c-gray" style="margin-left:auto;"><i class="ti ti-lock"></i> Dönem bitti</span><?php else: ?><button type="button" class="pd-del" onclick="this.closest('.pd-card').remove()"><i class="ti ti-trash"></i></button><?php endif; ?></div>
        <div class="pd-grid">
          <div class="field"><label>Başlangıç tarihi</label><input class="pf-start" type="date" value="<?php echo esc_attr($p->start_date); ?>"></div>
          <div class="field"><label>Başlangıç saati</label><input class="pf-stime" type="time" value="<?php echo esc_attr(!empty($p->start_time) ? substr($p->start_time, 0, 5) : ''); ?>"><span class="fhint">Görev süreleri bu saatte biter</span></div>
          <div class="field"><label>Bitiş tarihi</label><input class="pf-end" type="date" value="<?php echo esc_attr($p->end_date); ?>"></div>
          <div class="field"><label>Kontenjan</label><input class="pf-cap" type="number" min="1" value="<?php echo intval($p->capacity); ?>"></div>
        </div>
        <div class="pd-sched-head"><i class="ti ti-list-details"></i> Ders programı <span>(gün gün etkinlik + canlı ders linki)</span></div>
        <div class="pd-sched">
          <?php foreach ($sched as $s): ?>
          <div class="ss-row">
            <input class="ss-date" type="date" value="<?php echo esc_attr($s['date'] ?? ''); ?>">
            <input class="ss-time" type="time" value="<?php echo esc_attr($s['time'] ?? ''); ?>">
            <input class="ss-title" placeholder="Program başlığı (ör. Canlı Ders - Modül 1)" value="<?php echo esc_attr($s['title'] ?? ''); ?>">
            <input class="ss-link" type="url" placeholder="https://zoom.us/j/..." value="<?php echo esc_attr($s['link'] ?? ''); ?>">
            <button type="button" class="ss-del" onclick="this.closest('.ss-row').remove()"><i class="ti ti-x"></i></button>
          </div>
          <?php endforeach; ?>
        </div>
        <button type="button" class="pd-addsess" onclick="edAddSession(this)"><i class="ti ti-plus"></i> Program günü ekle</button>
      </div>
      <?php endforeach; endif; ?>
    </div>
    <?php if (!$locked): ?>
    <button type="button" class="cb-addmod" onclick="edAddPeriod()"><i class="ti ti-plus"></i> Dönem ekle</button>
    <?php endif; ?>
  </div>

  <div class="publish-bar">
    <?php if ($locked): ?>
      <span class="pb-note"><i class="ti ti-lock" style="vertical-align:-2px;"></i> Eğitim yayında ve kilitli. Yeni içerik ve Zoom linki değişiklikleri kaydedilir.</span>
      <div class="pb-actions"><button class="btn ghost" onclick="edPreview('sayfa')"><i class="ti ti-eye"></i> Sayfa</button><button class="btn ghost" onclick="edPreview('player')"><i class="ti ti-player-play"></i> Player</button><button class="btn" onclick="edSave('publish')"><i class="ti ti-device-floppy"></i> Değişiklikleri kaydet</button></div>
    <?php else: ?>
      <span class="pb-note"><i class="ti ti-info-circle" style="vertical-align:-2px;"></i> Yayınlamadan önce <b>Sayfa önizle</b> ile satış sayfasını, <b>Player önizle</b> ile dersleri öğrenci gözüyle kontrol et. Yayınlayınca öğrenciler kayıt olabilir.</span>
      <div class="pb-actions"><button class="btn ghost" onclick="edPreview('sayfa')"><i class="ti ti-eye"></i> Sayfa önizle</button><button class="btn ghost" onclick="edPreview('player')"><i class="ti ti-player-play"></i> Player önizle</button><button class="btn ghost" onclick="edSave('draft')">Taslak kaydet</button><button class="btn" onclick="edPublish()"><i class="ti ti-upload"></i> Yayınla</button></div>
    <?php endif; ?>
  </div>
</form>

<!-- Yayınlama onay akışı (çok adımlı) -->
<div class="pubm-overlay" id="pubmOverlay" onclick="if(event.target===this)pubmClose()">
  <div class="pubm">
    <div class="pubm-steps" id="pubmSteps"></div>
    <div class="pubm-body" id="pubmBody"></div>
    <div class="pubm-foot">
      <button type="button" class="btn ghost" id="pubmBack" onclick="pubmPrev()">Geri</button>
      <div style="flex:1;"></div>
      <button type="button" class="btn ghost" onclick="pubmClose()">Vazgeç</button>
      <button type="button" class="btn" id="pubmNext" onclick="pubmNext()">Onayla, devam et</button>
    </div>
  </div>
</div>

<script>
var ED_NONCE=<?php echo wp_json_encode($nonce); ?>, ED_AJAX=<?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>, ED_LIST=<?php echo wp_json_encode($panel->panel_url('kurslarim')); ?>;
var ED_LOCKED=<?php echo $locked ? 'true' : 'false'; ?>;
var ED_EMBED=<?php echo (!empty($oes_embed)) ? 'true' : 'false'; ?>;
var ED_PUBLISHED=<?php echo (!$is_new && ($ec['status'] ?? '') === 'publish') ? 'true' : 'false'; ?>;
var ED_URL=<?php echo wp_json_encode($edit_id ? get_permalink($edit_id) : ''); ?>;
var ED_PLAYER=<?php echo wp_json_encode(home_url('/kurs-izle/')); ?>;
var qbUid=100000;

/* Zengin metin editörü */
function rteCmd(c){document.execCommand(c,false,null);document.getElementById('ed_desc_rt').focus();}
function rteBlock(t){document.execCommand('formatBlock',false,t);document.getElementById('ed_desc_rt').focus();}
function rteLink(){var u=prompt('Bağlantı adresi (https://…)');if(u)document.execCommand('createLink',false,u);}

function edFreeToggle(){var f=document.getElementById('ed_free').checked;document.getElementById('ed_price').disabled=f;document.getElementById('ed_sale').disabled=f;document.getElementById('ed_sale_to').disabled=f;}
edFreeToggle();

function edAddMod(){
  var n=document.querySelectorAll('.cb-mod').length+1, d=document.createElement('div'); d.className='cb-mod';
  d.innerHTML='<div class="cb-mod-head"><i class="ti ti-grip-vertical cbm-grip"></i><input class="cbm-title" value="Modül '+n+'"><button type="button" class="cbm-del" onclick="this.closest(\'.cb-mod\').remove()"><i class="ti ti-trash"></i></button></div><div class="cb-lessons"></div><div class="cb-add"><button type="button" onclick="edAddLesson(this,\'video\')"><i class="ti ti-player-play"></i> Video ekle</button><button type="button" onclick="edAddLesson(this,\'quiz\')"><i class="ti ti-clipboard-check"></i> Sınav ekle</button><button type="button" onclick="edAddLesson(this,\'assign\')"><i class="ti ti-file-text"></i> Görev ekle</button><button type="button" onclick="edAddLesson(this,\'file\')"><i class="ti ti-file-typography"></i> Dosya ekle</button></div>';
  document.getElementById('cbMods').appendChild(d);
}
function edAddLesson(btn,type){
  var list=btn.closest('.cb-mod').querySelector('.cb-lessons');
  var ic=type==='quiz'?'quiz':(type==='assign'?'assign':(type==='file'?'file':'video')),
      icon=type==='quiz'?'ti-clipboard-check':(type==='assign'?'ti-file-text':(type==='file'?'ti-file-typography':'ti-player-play')), extra='';
  if(type==='video') extra='<div class="cb-l-extra"><input class="cbf-video_url" placeholder="Video URL (YouTube/Vimeo/mp4)"><input class="cbf-duration" inputmode="numeric" placeholder="Süre — dk:sn (ör. 02:35)" onblur="edFixDur(this)"><span class="cbfile-note">Süreyi <b>dakika:saniye</b> yaz — <b>2:35</b> = 2 dk 35 sn. Uzun videoda sa:dk:sn (1:02:35) da olur.</span></div>';
  else if(type==='assign') extra='<div class="cb-l-extra"><textarea class="cbf-description" placeholder="Görev açıklaması"></textarea><label style="font-size:11.5px;color:var(--ink3);">Teslim süresi — kayıttan (dönemliyse dönem başından) sonra kaç gün?</label><input class="cbf-due_days" type="number" min="0" placeholder="ör. 7 (boş = süresiz)"></div>';
  else if(type==='file') extra='<div class="cb-l-extra"><input type="hidden" class="cbf-file_key"><input type="hidden" class="cbf-file_url"><input type="hidden" class="cbf-file_name"><input type="hidden" class="cbf-file_mime"><div class="cbfile"><span class="cbfile-n">Dosya seçilmedi</span><button type="button" class="cbfile-btn" onclick="edPickFile(this)"><i class="ti ti-upload"></i> Dosya seç</button></div><span class="cbfile-note"><i class="ti ti-lock"></i> PDF veya görsel · öğrenci indiremez/kopyalayamaz · <b>ilerlemeye dahil değildir</b></span></div>';
  else extra='<div class="cb-l-extra"><label style="font-size:11.5px;color:var(--ink3);">Son tarih — kayıttan (dönemliyse dönem başından) sonra kaç gün?</label><input class="cbf-due_days" type="number" min="0" placeholder="ör. 7 (boş = süresiz)"></div>'
           +'<div class="qb"><div class="qb-top"><span class="qb-note"><i class="ti ti-info-circle"></i> Öğrenci çözer ve otomatik geçer; sadece kaçta kaç yaptığını görür.</span><button type="button" class="qb-addq" onclick="qbAddQ(this)"><i class="ti ti-plus"></i> Soru ekle</button></div><div class="qb-qs"></div></div>';
  var d=document.createElement('div'); d.className='cb-lesson'; d.setAttribute('data-type',type); d.setAttribute('data-aid','0'); d.setAttribute('data-qid','0');
  d.innerHTML='<span class="cb-l-ic '+ic+'"><i class="ti '+icon+'"></i></span><div class="cb-l-main"><input class="cbf-title" placeholder="Başlık">'+extra+'</div><div class="cb-l-act"><button type="button" onclick="this.closest(\'.cb-lesson\').remove()"><i class="ti ti-trash"></i></button></div>';
  list.appendChild(d); d.querySelector('.cbf-title').focus();
}

/* Ders dosyası yükleme — korumalı depoya gider (medya kütüphanesine DEĞİL),
   öğrenciye yalnızca akış ucundan, indirilemez görüntüleyicide sunulur. */
function edPickFile(btn){
  var box=btn.closest('.cb-l-extra');
  var inp=document.createElement('input');
  inp.type='file'; inp.accept='.pdf,.jpg,.jpeg,.png,.gif,.webp';
  inp.addEventListener('change',function(){
    if(!this.files.length)return;
    var f=this.files[0], nm=box.querySelector('.cbfile-n');
    nm.textContent='Yükleniyor…'; btn.disabled=true;
    var fd=new FormData();
    fd.append('action','oes_tp_upload_protected'); fd.append('nonce',ED_NONCE); fd.append('file',f);
    fetch(ED_AJAX,{method:'POST',body:fd,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
      btn.disabled=false;
      if(res&&res.success){
        box.querySelector('.cbf-file_key').value=res.data.file_key;
        box.querySelector('.cbf-file_name').value=res.data.file_name;
        box.querySelector('.cbf-file_mime').value=res.data.file_mime;
        box.querySelector('.cbf-file_url').value=''; // yeni dosya korumalı depoda
        nm.textContent=res.data.file_name;
        var t=box.closest('.cb-lesson').querySelector('.cbf-title');
        if(t&&!t.value.trim()) t.value=res.data.file_name.replace(/\.[^.]+$/,'');
      } else {
        nm.textContent='Dosya seçilmedi';
        alert((res&&res.data)||'Dosya yüklenemedi.');
      }
    }).catch(function(){ btn.disabled=false; nm.textContent='Dosya seçilmedi'; alert('Dosya yüklenemedi.'); });
  });
  inp.click();
}

/* Sınav builder */
function qbOptRow(uid,val,chk){return '<label class="qb-opt"><input type="radio" name="c-'+uid+'" class="qbf-correct"'+(chk?' checked':'')+' title="Doğru cevap"><input class="qbf-opt" value="'+(val||'').replace(/"/g,'&quot;')+'" placeholder="Cevap seçeneğini girin"><button type="button" onclick="this.closest(\'.qb-opt\').remove()"><i class="ti ti-x"></i></button></label>';}
function qbAddOpt(btn){var opts=btn.parentNode, uid=opts.getAttribute('data-uid'); btn.insertAdjacentHTML('beforebegin',qbOptRow(uid,'',false));}
function qbType(sel){
  var q=sel.closest('.qb-q'), opts=q.querySelector('.qb-opts'), uid=opts.getAttribute('data-uid'), t=sel.value;
  q.setAttribute('data-qtype',t);
  if(t==='multiple_choice') opts.innerHTML=qbOptRow(uid,'',true)+qbOptRow(uid,'',false)+qbOptRow(uid,'',false)+qbOptRow(uid,'',false)+'<button type="button" class="qb-addopt" onclick="qbAddOpt(this)">+ Seçenek</button>';
  else if(t==='true_false') opts.innerHTML='<label class="qb-opt"><input type="radio" name="c-'+uid+'" class="qbf-tf" value="true" checked> Doğru</label><label class="qb-opt"><input type="radio" name="c-'+uid+'" class="qbf-tf" value="false"> Yanlış</label>';
  else opts.innerHTML='<div class="qb-hint">Açık uçlu — öğrenci serbest yazar.</div>';
}
function qbAddQ(btn){
  var qs=btn.closest('.qb').querySelector('.qb-qs'); qbUid++;
  var d=document.createElement('div'); d.className='qb-q'; d.setAttribute('data-qtype','multiple_choice');
  d.innerHTML='<div class="qb-q-top"><select class="qbf-type" onchange="qbType(this)"><option value="multiple_choice">Çoktan seçmeli</option><option value="true_false">Doğru / Yanlış</option><option value="open_ended">Açık uçlu</option></select><input class="qbf-points" type="number" value="1" min="1" title="Puan"><button type="button" class="qb-delq" onclick="this.closest(\'.qb-q\').remove()"><i class="ti ti-trash"></i></button></div><textarea class="qbf-qtext" placeholder="Sorunuzu buraya yazın"></textarea><div class="qb-opts" data-uid="'+qbUid+'">'+qbOptRow(qbUid,'',true)+qbOptRow(qbUid,'',false)+qbOptRow(qbUid,'',false)+qbOptRow(qbUid,'',false)+'<button type="button" class="qb-addopt" onclick="qbAddOpt(this)">+ Seçenek</button></div>';
  qs.appendChild(d);
}

function edTemplate(t){
  if(ED_LOCKED)return;
  document.getElementById('cbMods').innerHTML='';
  if(t==='atolye'){
    edSeedModule('Atölye 1: Uygulamaya Giriş',[['video','Tanıtım ve kurulum'],['assign','1. Uygulama görevi'],['assign','2. Uygulama görevi']]);
    edSeedModule('Atölye 2: İleri Uygulama',[['video','Vaka çalışması'],['assign','Bitirme projesi']]);
  } else if(t==='donemli'){
    edSeedModule('Modül 1: Temeller',[['video','Karşılama ve genel bakış'],['video','Temel kavramlar'],['quiz','Modül 1 değerlendirme sınavı']]);
    edSeedModule('Modül 2: Canlı Oturumlar',[['video','Canlı derse hazırlık'],['assign','Haftalık görev']]);
  } else {
    edSeedModule('Modül 1: Giriş',[['video','Eğitime giriş'],['video','Konu anlatımı']]);
    edSeedModule('Modül 2: Derinleşme',[['video','İleri konu anlatımı'],['quiz','Modül sonu sınavı'],['assign','Uygulama görevi']]);
  }
  edShow('Şablon uygulandı. Başlıkları ve içerikleri kendine göre düzenle.',false);
}
function edSeedModule(title,lessons){
  edAddMod();
  var mods=document.querySelectorAll('.cb-mod'); var mod=mods[mods.length-1];
  mod.querySelector('.cbm-title').value=title;
  var addBtn=mod.querySelector('.cb-add button');
  lessons.forEach(function(ls){
    edAddLesson(addBtn,ls[0]);
    var items=mod.querySelectorAll('.cb-lesson'); var last=items[items.length-1];
    last.querySelector('.cbf-title').value=ls[1];
    if(ls[0]==='quiz') edSeedQuiz(last);
  });
}
/* Sınava birkaç örnek soru iskeleti ekler (placeholder metinleriyle yönlendirir) */
function edSeedQuiz(lessonEl){
  var btn=lessonEl.querySelector('.qb-addq'); if(!btn)return;
  qbAddQ(btn); qbAddQ(btn);
}

/* Süre alanı: "dk:sn" olarak normalize eder (2:35 → 02:35, 12 → 12:00).
   Sunucudaki fabo_duration_secs ile AYNI kuralı uygular. */
function edFixDur(el){
  var v=(el.value||'').trim(); if(!v){el.value='';return;}
  var total=null, m=v.match(/^(?:(\d+):)?(\d+):(\d{1,2})$/);
  if(m) total=parseInt(m[1]||'0',10)*3600+parseInt(m[2],10)*60+parseInt(m[3],10);
  else if(/^\d+$/.test(v)) total=parseInt(v,10)*60; // düz sayı = dakika
  if(total===null) return;                          // tanımadık biçim → dokunma
  var h=Math.floor(total/3600), mm=Math.floor((total%3600)/60), ss=total%60,
      p=function(n){return (n<10?'0':'')+n;};
  el.value = h>0 ? (h+':'+p(mm)+':'+p(ss)) : (p(mm)+':'+p(ss));
}

/* Kapak görseli — yükleme durumu + yüzde (büyük görselde bekleme belirsiz kalmasın) */
document.getElementById('ed_cover').addEventListener('change',function(){
  if(!this.files.length)return;
  var input=this, box=document.getElementById('ed_upbox');
  var fd=new FormData(); fd.append('action','oes_tp_upload_image'); fd.append('nonce',ED_NONCE); fd.append('file',this.files[0]);
  function state(html,cls){box.className='upbox'+(cls?' '+cls:'');box.innerHTML=html;}
  state('<i class="ti ti-loader-2 ed-spin"></i> Görsel yükleniyor… <b id="edUpPc">%0</b><span class="ed-bar"><i id="edUpBar"></i></span>','busy');
  var xhr=new XMLHttpRequest();
  xhr.open('POST',ED_AJAX,true); xhr.withCredentials=true;
  xhr.upload.onprogress=function(e){
    if(!e.lengthComputable)return;
    var pc=Math.round(e.loaded/e.total*100), t=document.getElementById('edUpPc'), b=document.getElementById('edUpBar');
    if(t)t.textContent='%'+pc; if(b)b.style.width=pc+'%';
    if(pc>=100&&t)t.textContent='işleniyor…';
  };
  xhr.onload=function(){
    var res=null; try{res=JSON.parse(xhr.responseText);}catch(e){}
    if(res&&res.success){
      document.getElementById('ed_image_id').value=res.data.id;
      var p=document.getElementById('ed_prev'); p.src=res.data.url; p.style.display='block';
      state('<i class="ti ti-circle-check"></i> Kapak yüklendi — değiştirmek için tıkla','done');
    } else {
      state('<i class="ti ti-photo"></i> Kapak görseli yükle');
      alert((res&&res.data)||'Görsel yüklenemedi.');
    }
    input.value='';
  };
  xhr.onerror=function(){ state('<i class="ti ti-photo"></i> Kapak görseli yükle'); alert('Görsel yüklenemedi.'); input.value=''; };
  xhr.send(fd);
});

function edCollectCurriculum(){
  var mods=[];
  document.querySelectorAll('#cbMods .cb-mod').forEach(function(m){
    var lessons=[];
    m.querySelectorAll('.cb-lesson').forEach(function(le){
      var type=le.getAttribute('data-type'), o={type:type,title:(le.querySelector('.cbf-title')||{}).value||''};
      if(type==='video'){o.video_url=(le.querySelector('.cbf-video_url')||{}).value||'';o.duration=(le.querySelector('.cbf-duration')||{}).value||'';}
      else if(type==='assign'){o.description=(le.querySelector('.cbf-description')||{}).value||'';o.due_days=parseInt((le.querySelector('.cbf-due_days')||{}).value||'0',10)||0;o.assignment_id=parseInt(le.getAttribute('data-aid')||'0',10)||0;}
      else if(type==='file'){o.file_key=(le.querySelector('.cbf-file_key')||{}).value||'';o.file_url=(le.querySelector('.cbf-file_url')||{}).value||'';o.file_name=(le.querySelector('.cbf-file_name')||{}).value||'';o.file_mime=(le.querySelector('.cbf-file_mime')||{}).value||'';}
      else if(type==='quiz'){
        o.quiz_id=parseInt(le.getAttribute('data-qid')||'0',10)||0;
        o.due_days=parseInt((le.querySelector('.cbf-due_days')||{}).value||'0',10)||0;
        o.questions=[];
        le.querySelectorAll('.qb-q').forEach(function(qq){
          var qt=qq.querySelector('.qbf-type').value, text=(qq.querySelector('.qbf-qtext')||{}).value||'';
          if(!text.trim())return;
          var qo={qtype:qt,text:text,points:parseInt((qq.querySelector('.qbf-points')||{}).value||'1',10)||1};
          if(qt==='multiple_choice'){qo.options=[];var ci=0,i=0;qq.querySelectorAll('.qb-opt').forEach(function(op){var ti=op.querySelector('.qbf-opt');if(!ti)return;qo.options.push(ti.value);var r=op.querySelector('.qbf-correct');if(r&&r.checked)ci=i;i++;});qo.correct=ci;}
          else if(qt==='true_false'){var c=qq.querySelector('.qbf-tf:checked');qo.correct=c?c.value:'true';}
          o.questions.push(qo);
        });
      }
      lessons.push(o);
    });
    mods.push({title:m.querySelector('.cbm-title').value,lessons:lessons});
  });
  return mods;
}

/* ---- Dönemler + gün gün ders programı ---- */
function ssRow(){
  return '<div class="ss-row"><input class="ss-date" type="date"><input class="ss-time" type="time"><input class="ss-title" placeholder="Program başlığı (ör. Canlı Ders - Modül 1)"><input class="ss-link" type="url" placeholder="https://zoom.us/j/..."><button type="button" class="ss-del" onclick="this.closest(\'.ss-row\').remove()"><i class="ti ti-x"></i></button></div>';
}
function edAddSession(btn){ var list=btn.previousElementSibling; list.insertAdjacentHTML('beforeend',ssRow()); }
function edAddPeriod(){
  var n=document.querySelectorAll('#pdList .pd-card').length+1;
  var d=document.createElement('div'); d.className='pd-card'; d.setAttribute('data-id','0');
  d.innerHTML='<div class="pd-head"><i class="ti ti-calendar-event"></i><input class="pf-name" value="'+n+'. Dönem" placeholder="'+n+'. Dönem"><button type="button" class="pd-del" onclick="this.closest(\'.pd-card\').remove()"><i class="ti ti-trash"></i></button></div>'
    +'<div class="pd-grid"><div class="field"><label>Başlangıç tarihi</label><input class="pf-start" type="date"></div><div class="field"><label>Başlangıç saati</label><input class="pf-stime" type="time"><span class="fhint">Görev süreleri bu saatte biter</span></div><div class="field"><label>Bitiş tarihi</label><input class="pf-end" type="date"></div><div class="field"><label>Kontenjan</label><input class="pf-cap" type="number" min="1" value="20"></div></div>'
    +'<div class="pd-sched-head"><i class="ti ti-list-details"></i> Ders programı <span>(gün gün etkinlik + canlı ders linki)</span></div>'
    +'<div class="pd-sched">'+ssRow()+'</div>'
    +'<button type="button" class="pd-addsess" onclick="edAddSession(this)"><i class="ti ti-plus"></i> Program günü ekle</button>';
  document.getElementById('pdList').appendChild(d);
  d.querySelector('.pf-start').focus();
}
function edCollectPeriods(){
  var out=[];
  document.querySelectorAll('#pdList .pd-card').forEach(function(c){
    var sched=[];
    c.querySelectorAll('.pd-sched .ss-row').forEach(function(r){
      var date=(r.querySelector('.ss-date')||{}).value||'', time=(r.querySelector('.ss-time')||{}).value||'',
          title=(r.querySelector('.ss-title')||{}).value||'', link=(r.querySelector('.ss-link')||{}).value||'';
      if(!date && !title && !link) return;
      sched.push({date:date,time:time,title:title,link:link});
    });
    out.push({
      id:parseInt(c.getAttribute('data-id')||'0',10)||0,
      name:(c.querySelector('.pf-name')||{}).value||'',
      start_date:(c.querySelector('.pf-start')||{}).value||'',
      start_time:(c.querySelector('.pf-stime')||{}).value||'',
      end_date:(c.querySelector('.pf-end')||{}).value||'',
      capacity:parseInt((c.querySelector('.pf-cap')||{}).value||'20',10)||20,
      schedule:sched
    });
  });
  return out;
}

/* ---- Yayın sonrası kilit (mevcut müfredat + dönem tarihleri) ---- */
function edApplyLock(){
  if(!ED_LOCKED)return;
  document.getElementById('edForm').classList.add('ed-lock');
  // MÜFREDAT tamamen kilitli: mevcut düzenlenemez, YENİ içerik (video/sınav/görev/modül) eklenemez
  document.querySelectorAll('#cbMods input, #cbMods textarea, #cbMods select').forEach(function(el){el.disabled=true;});
  document.querySelectorAll('#cbMods .cb-add, .cb-addmod, #cbMods .cbm-del, #cbMods .cb-l-act, #cbMods .qb-addq, #cbMods .qb-delq, #cbMods .qb-addopt, #cbMods .qb-opt>button, #cbMods .cbfile-btn').forEach(function(el){el.style.display='none';});
  // DÖNEM: sadece program LİNKLERİ güncellenebilir. Ad/tarih/kontenjan + program tarih/saat/başlık kilitli, ekleme/silme yok.
  document.querySelectorAll('.pd-card[data-locked]').forEach(function(c){
    c.querySelectorAll('.pf-name,.pf-start,.pf-stime,.pf-end,.pf-cap,.ss-date,.ss-time,.ss-title').forEach(function(el){if(el)el.disabled=true;});
    c.querySelectorAll('.ss-del,.pd-addsess,.pd-del').forEach(function(el){if(el)el.style.display='none';});
    // Süresi geçmiş dönem → link bile güncellenemez
    if(c.hasAttribute('data-passed')) c.querySelectorAll('.ss-link').forEach(function(el){el.disabled=true;});
  });
}

/* ---- Çok adımlı yayınlama onayı ---- */
var pubmStep=0, pubmSlides=[];
function edEsc(s){var d=document.createElement('div');d.textContent=(s==null?'':s);return d.innerHTML;}
function edPublish(){
  var title=document.getElementById('ed_title').value.trim();
  if(!title){edShow('Kurs başlığı zorunludur.',true);return;}
  var cur=edCollectCurriculum(), per=edCollectPeriods();
  var mod=cur.length, vid=0, qz=0, gv=0, dosya=0, listHtml='';
  cur.forEach(function(m){
    (m.lessons||[]).forEach(function(l){ if(l.type==='video')vid++; else if(l.type==='quiz')qz++; else if(l.type==='assign')gv++; else if(l.type==='file')dosya++; });
    listHtml+='<li><b>'+edEsc(m.title||'Modül')+'</b> — '+((m.lessons||[]).length)+' içerik</li>';
  });
  pubmSlides=[];
  pubmSlides.push({title:'<i class="ti ti-rocket"></i> Eğitiminizi yayına alıyoruz',
    html:'<p>Bu eğitimi yayınlamak üzeresiniz. Birkaç adımda bilgileri onaylayalım.</p><div class="pubm-kv"><div class="row"><span class="k">Kurs ismi</span><span class="v">'+edEsc(title)+'</span></div></div>'});
  pubmSlides.push({title:'<i class="ti ti-list-check"></i> Kurs içeriği',
    html:'<p>Müfredat özeti aşağıdaki gibi. Doğruysa onaylayın.</p><div class="pubm-kv"><div class="row"><span class="k">Modül</span><span class="v">'+mod+'</span></div><div class="row"><span class="k">Video</span><span class="v">'+vid+'</span></div><div class="row"><span class="k">Sınav</span><span class="v">'+qz+'</span></div><div class="row"><span class="k">Görev</span><span class="v">'+gv+'</span></div>'+(dosya?'<div class="row"><span class="k">Dosya</span><span class="v">'+dosya+' <small style="color:var(--ink3);font-weight:400;">(ilerlemeye dahil değil)</small></span></div>':'')+'</div>'+(listHtml?'<ul class="pubm-list" style="margin-top:10px;">'+listHtml+'</ul>':'')});
  if(per.length){
    var pl='';
    per.forEach(function(p){pl+='<li><b>'+edEsc(p.name||'Dönem')+'</b> — '+edEsc(p.start_date||'?')+(p.start_time?' '+edEsc(p.start_time):'')+' → '+edEsc(p.end_date||'?')+' · kontenjan '+(p.capacity||'-')+'</li>';});
    pubmSlides.push({title:'<i class="ti ti-calendar-event"></i> Dönemler ve tarihler',
      html:'<p>Bu eğitim <b>takvimli</b> olarak yayınlanacak. Dönem tarihleri:</p><ul class="pubm-list">'+pl+'</ul>'});
  }
  pubmSlides.push({title:'<i class="ti ti-alert-triangle"></i> Son onay',final:true,
    html:'<div class="pubm-warn">Onayladığınızda eğitim <b>yayına alınacak</b> ve <b>bir daha tarih veya müfredat düzenlemesi yapamayacaksınız</b>. Yayından sonra yalnızca <b>dönem Zoom bağlantılarını</b> güncelleyebilir ve müfredata <b>yeni içerik ekleyebilirsiniz</b>.</div><p style="margin-top:12px;">Yayına almayı onaylıyor musunuz?</p>'});
  pubmStep=0; pubmRender();
  document.getElementById('pubmOverlay').classList.add('show');
}
function pubmRender(){
  var s=pubmSlides[pubmStep], steps='';
  for(var i=0;i<pubmSlides.length;i++) steps+='<div class="st'+(i<=pubmStep?' on':'')+'"></div>';
  document.getElementById('pubmSteps').innerHTML=steps;
  document.getElementById('pubmBody').innerHTML='<h4>'+s.title+'</h4>'+s.html;
  document.getElementById('pubmBack').style.visibility=(pubmStep===0?'hidden':'visible');
  document.getElementById('pubmNext').innerHTML=s.final?'<i class="ti ti-upload"></i> Evet, yayına al':'Onayla, devam et';
}
function pubmNext(){
  if(pubmSlides[pubmStep].final){pubmClose();edSave('publish');return;}
  if(pubmStep<pubmSlides.length-1){pubmStep++;pubmRender();}
}
function pubmPrev(){ if(pubmStep>0){pubmStep--;pubmRender();} }
function pubmClose(){ document.getElementById('pubmOverlay').classList.remove('show'); }

/* Önizleme: taslağı kaydeder ve yeni sekmede açar.
   mode 'sayfa' → satış sayfası · mode 'player' → ders izleme ekranı (öğrenci gözüyle;
   ilerleme yazılmaz, kilit uygulanmaz — bkz. OES_Player::$preview).
   Yayındaki kursta kaydetmeden doğrudan canlı adresi açar (istenmeyen yazma olmasın).
   Sekme, pop-up engeline takılmamak için TIKLAMA anında açılır. */
function edPlayerUrl(id){ return ED_PLAYER+'?oes-player='+id; }
function edPreview(mode){
  var player=(mode==='player');
  if(ED_PUBLISHED){
    var u=player?edPlayerUrl(document.getElementById('ed_course_id').value):ED_URL;
    if(u) window.open(u,'_blank','noopener');
    return;
  }
  var title=document.getElementById('ed_title').value.trim();
  if(!title){edShow('Önizleme için önce eğitim başlığını gir.',true);return;}
  var w=window.open('','_blank');
  if(w) w.document.write('<title>Önizleme hazırlanıyor…</title><p style="font:15px system-ui;padding:24px;color:#194977;">Taslak kaydediliyor, önizleme hazırlanıyor…</p>');
  edSave('draft',function(d){
    if(!d){ if(w)w.close(); return; }
    var url=player?edPlayerUrl(d.course_id):d.preview_url;
    if(url){ if(w){w.location.href=url;} else {window.open(url,'_blank','noopener');} }
    // Editörü kayıtlı haliyle tazele: yeni açılan sınav/görevlerin id'leri DOM'a insin,
    // aksi halde sonraki kayıt aynı içeriği İKİNCİ kez oluştururdu.
    var u=new URL(location.href); u.searchParams.set('edit',d.course_id);
    setTimeout(function(){location.href=u.toString();},900);
  });
}

/* onDone verilirse liste sayfasına yönlendirmez, sonucu geri verir (önizleme akışı). */
function edSave(status,onDone){
  var title=document.getElementById('ed_title').value.trim();
  if(!title){edShow('Kurs başlığı zorunludur.',true);if(onDone)onDone(null);return;}
  var p=new URLSearchParams();
  p.append('action','oes_tp_save_course'); p.append('nonce',ED_NONCE);
  p.append('course_id',document.getElementById('ed_course_id').value);
  p.append('title',title);
  p.append('short_description',document.getElementById('ed_short').value);
  p.append('description',document.getElementById('ed_desc_rt').innerHTML);
  p.append('outcomes',document.getElementById('ed_outcomes').value);
  p.append('requirements',document.getElementById('ed_req').value);
  p.append('target',document.getElementById('ed_target').value);
  p.append('preview_video',document.getElementById('ed_preview').value);
  p.append('status',status);
  p.append('is_free',document.getElementById('ed_free').checked?'1':'');
  p.append('price',document.getElementById('ed_price').value||'0');
  p.append('sale_price',document.getElementById('ed_sale').value||'');
  p.append('sale_to',document.getElementById('ed_sale_to').value||'');
  p.append('image_id',document.getElementById('ed_image_id').value||'0');
  p.append('curriculum',JSON.stringify(edCollectCurriculum()));
  p.append('periods',JSON.stringify(edCollectPeriods()));
  document.querySelectorAll('.publish-bar .btn,.ed-actions .btn').forEach(function(b){b.disabled=true;});
  fetch(ED_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
    document.querySelectorAll('.publish-bar .btn,.ed-actions .btn').forEach(function(b){b.disabled=false;});
    if(res&&res.success){
      edShow(res.data.message||'Kaydedildi.',false);
      // Yeni kurs önizlemeden sonra tekrar "kaydet" derse kopya oluşmasın
      document.getElementById('ed_course_id').value=res.data.course_id;
      if(onDone) onDone(res.data);
      else if(!ED_EMBED) setTimeout(function(){location.href=ED_LIST;},700);
    } else {
      edShow((res&&res.data)||'Kaydedilemedi.',true);
      if(onDone) onDone(null);
    }
  }).catch(function(){document.querySelectorAll('.publish-bar .btn,.ed-actions .btn').forEach(function(b){b.disabled=false;});edShow('Bağlantı hatası.',true);if(onDone)onDone(null);});
}
function edShow(msg,err){var m=document.getElementById('edMsg');m.style.display='flex';m.className='banner '+(err?'amber':'sky');m.innerHTML='<i class="ti ti-'+(err?'alert-triangle':'circle-check')+'"></i><div>'+msg+'</div>';window.scrollTo({top:0,behavior:'smooth'});}
edApplyLock();
</script>
