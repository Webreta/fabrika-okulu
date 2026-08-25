<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
/** @var OES_Teacher_Panel $panel */

$uid       = $data['user']['id'];
$list_url  = $panel->panel_url('gorevler');
$new_url   = $list_url . '&new=1';
$my_courses = $data['courses']; // id, title, ...

$mode = 'list'; $edit = null; $subs = null; $err = '';
if (isset($_GET['new'])) {
    $mode = 'edit';
} elseif (isset($_GET['edit'])) {
    $edit = OES_Teacher_Assignments::get_assignment_for_edit($uid, intval($_GET['edit']));
    $edit ? $mode = 'edit' : $err = 'Bu görevi düzenleme yetkiniz yok.';
} elseif (isset($_GET['submissions'])) {
    $subs = OES_Teacher_Assignments::get_submissions($uid, intval($_GET['submissions']));
    $subs ? $mode = 'submissions' : $err = 'Bu görevin gönderimlerine erişiminiz yok.';
}
$status_labels = array('active' => 'Aktif', 'draft' => 'Taslak');
?>

<?php if ($err): ?><div class="oesp-auth-msg error" style="margin-bottom:16px;"><?php echo esc_html($err); ?></div><?php endif; ?>

<?php if ($mode === 'list'): ?>
<!-- ===== LİSTE ===== -->
<?php $items = OES_Teacher_Assignments::get_teacher_assignments($uid); ?>
<div class="oestp-page-head">
    <div class="oestp-page-head-txt"><h1>Görevler</h1><p><?php echo count($items); ?> görev</p></div>
    <?php if (!empty($my_courses)): ?>
    <a href="<?php echo esc_url($new_url); ?>" class="oesp-btn oesp-btn-green"><i class="ti ti-plus"></i> Yeni Görev</a>
    <?php endif; ?>
</div>

<?php if (empty($my_courses)): ?>
<div class="oestp-empty"><div class="oestp-empty-ic"><i class="ti ti-book-off"></i></div><p>Önce bir kursun olmalı. Kurslarım'dan kurs oluştur, sonra görev ekle.</p></div>
<?php elseif (empty($items)): ?>
<div class="oestp-empty"><div class="oestp-empty-ic"><i class="ti ti-file-off"></i></div><p>Henüz görev yok. İlk görevini oluştur.</p><a href="<?php echo esc_url($new_url); ?>" class="oesp-btn oesp-btn-green"><i class="ti ti-plus"></i> Yeni Görev</a></div>
<?php else: ?>
<div class="oestp-course-list">
    <?php foreach ($items as $a):
        $due = $a->due_date ? date_i18n('d M Y H:i', strtotime($a->due_date)) : 'Süresiz';
    ?>
    <div class="oestp-course-item">
        <div class="oestp-course-thumb" style="background:linear-gradient(120deg,#b45309,#f59e0b);display:flex;align-items:center;justify-content:center;"><i class="ti ti-file-text" style="color:#fff;font-size:26px;"></i></div>
        <div class="oestp-course-info">
            <div class="oestp-course-title"><?php echo esc_html($a->title); ?></div>
            <div class="oestp-course-meta">
                <span class="oestp-badge oestp-badge-<?php echo $a->status==='draft'?'draft':'publish'; ?>"><?php echo esc_html($status_labels[$a->status] ?? $a->status); ?></span>
                <span><i class="ti ti-book"></i> <?php echo esc_html($a->course_name); ?></span>
                <span><i class="ti ti-clock"></i> <?php echo esc_html($due); ?></span>
            </div>
        </div>
        <div class="oestp-course-actions">
            <a href="<?php echo esc_url($list_url . '&submissions=' . intval($a->id)); ?>" class="oestp-icon-btn" title="Gönderimler" style="position:relative;">
                <i class="ti ti-inbox"></i>
                <?php if ($a->pending_count > 0): ?><span class="oestp-count-dot"><?php echo intval($a->pending_count); ?></span><?php endif; ?>
            </a>
            <a href="<?php echo esc_url($list_url . '&edit=' . intval($a->id)); ?>" class="oestp-icon-btn" title="Düzenle"><i class="ti ti-edit"></i></a>
            <button type="button" class="oestp-icon-btn oestp-del-assignment" data-id="<?php echo intval($a->id); ?>" data-title="<?php echo esc_attr($a->title); ?>" title="Sil"><i class="ti ti-trash"></i></button>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<script>
(function(){
    var T = window.oesTeacher;
    document.querySelectorAll('.oestp-del-assignment').forEach(function(btn){
        btn.addEventListener('click', function(){
            if(!confirm('"'+(btn.dataset.title||'görev')+'" silinsin mi? Tüm gönderimler de silinir.')) return;
            var p = new URLSearchParams(); p.append('action','oes_tp_delete_assignment'); p.append('nonce',T.nonce); p.append('assignment_id',btn.dataset.id);
            btn.disabled=true;
            fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'})
            .then(function(r){return r.json();}).then(function(res){ alert(res.data&&res.data.message?res.data.message:(res.success?'Silindi':'Hata')); if(res.success) location.reload(); else btn.disabled=false; })
            .catch(function(){ btn.disabled=false; alert('Bağlantı hatası.'); });
        });
    });
})();
</script>
<?php endif; ?>

<?php elseif ($mode === 'edit'): ?>
<!-- ===== EDİTÖR ===== -->
<?php
$is_new = ($edit === null);
$e = $edit ?: (object) array('id'=>0,'course_id'=>0,'period_id'=>null,'title'=>'','description'=>'','due_date'=>'','extra_days'=>2,'is_graded'=>1,'max_score'=>100,'allow_file'=>1,'allow_voice'=>1,'allow_text'=>1,'status'=>'active');
$due_val = $e->due_date ? date('Y-m-d\TH:i', strtotime($e->due_date)) : '';
$periods_on = class_exists('OES_Module_Manager') && OES_Module_Manager::is_active('periods');
?>
<div class="oestp-editor" id="oestpAsgEditor">
    <div class="oestp-editor-head">
        <a href="<?php echo esc_url($list_url); ?>" class="oestp-back-btn"><i class="ti ti-arrow-left"></i></a>
        <div class="oestp-page-head-txt"><h1><?php echo $is_new?'Yeni Görev':'Görevi Düzenle'; ?></h1><p>Görev bilgileri</p></div>
    </div>
    <div class="oesp-auth-msg" id="asgMsg" hidden></div>
    <input type="hidden" id="asg_id" value="<?php echo intval($e->id); ?>">

    <div class="oestp-card">
        <div class="oestp-fields">
            <label>Kurs *
                <select id="asg_course">
                    <option value="">Kurs seçin</option>
                    <?php foreach ($my_courses as $c): ?>
                    <option value="<?php echo intval($c['id']); ?>" <?php selected($e->course_id, $c['id']); ?>><?php echo esc_html($c['title']); ?></option>
                    <?php endforeach; ?>
                </select>
            </label>
            <?php if ($periods_on): ?>
            <label>Dönem (opsiyonel)
                <select id="asg_period" data-current="<?php echo intval($e->period_id); ?>"><option value="">Tüm dönemler</option></select>
            </label>
            <?php endif; ?>
            <label>Başlık *
                <input type="text" id="asg_title" value="<?php echo esc_attr($e->title); ?>" placeholder="Örn. 1. Hafta Görevi">
            </label>
            <label>Açıklama
                <textarea id="asg_description" rows="4" placeholder="Görev yönergesi"><?php echo esc_textarea($e->description); ?></textarea>
            </label>
            <div class="oestp-form-row">
                <label>Son teslim tarihi
                    <input type="datetime-local" id="asg_due" value="<?php echo esc_attr($due_val); ?>">
                </label>
                <label>Ek süre (gün)
                    <input type="number" id="asg_extra" min="0" value="<?php echo intval($e->extra_days); ?>">
                </label>
            </div>
            <div class="oestp-form-row">
                <label class="oestp-check-inline"><input type="checkbox" id="asg_graded" <?php checked($e->is_graded, 1); ?>> Puanlı</label>
                <label>Maksimum puan
                    <input type="number" id="asg_max" min="0" value="<?php echo intval($e->max_score); ?>" <?php echo $e->is_graded ? '' : 'disabled'; ?>>
                </label>
            </div>
            <div class="oestp-field-label">Teslim türleri</div>
            <div class="oestp-checks">
                <label class="oestp-check-inline"><input type="checkbox" id="asg_file" <?php checked($e->allow_file, 1); ?>> Dosya</label>
                <label class="oestp-check-inline"><input type="checkbox" id="asg_voice" <?php checked($e->allow_voice, 1); ?>> Ses kaydı</label>
                <label class="oestp-check-inline"><input type="checkbox" id="asg_text" <?php checked($e->allow_text, 1); ?>> Metin</label>
            </div>
            <label>Durum
                <select id="asg_status">
                    <option value="active" <?php selected($e->status,'active'); ?>>Aktif (öğrenciye görünür)</option>
                    <option value="draft" <?php selected($e->status,'draft'); ?>>Taslak</option>
                </select>
            </label>
        </div>
    </div>

    <div class="oestp-editor-foot">
        <a href="<?php echo esc_url($list_url); ?>" class="oesp-btn oesp-btn-ghost">İptal</a>
        <button type="button" class="oesp-btn oesp-btn-green" id="asgSave"><i class="ti ti-device-floppy"></i> <?php echo $is_new?'Oluştur':'Kaydet'; ?></button>
    </div>
</div>

<script>
(function(){
    var T = window.oesTeacher;
    var msg = document.getElementById('asgMsg');
    function showMsg(t,type){ msg.textContent=t; msg.className='oesp-auth-msg '+(type||'error'); msg.hidden=false; msg.scrollIntoView({behavior:'smooth',block:'center'}); }

    var gradedChk = document.getElementById('asg_graded');
    var maxInp = document.getElementById('asg_max');
    gradedChk.addEventListener('change', function(){ maxInp.disabled = !gradedChk.checked; });

    // Dönem yükleme (kursa göre)
    var courseSel = document.getElementById('asg_course');
    var periodSel = document.getElementById('asg_period');
    function loadPeriods(){
        if (!periodSel) return;
        var cid = courseSel.value; var current = periodSel.getAttribute('data-current');
        periodSel.innerHTML = '<option value="">Tüm dönemler</option>';
        if (!cid) return;
        var p = new URLSearchParams(); p.append('action','oes_tp_course_periods'); p.append('nonce',T.nonce); p.append('course_id',cid);
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'})
        .then(function(r){return r.json();}).then(function(res){
            if(res.success && res.data.periods){ res.data.periods.forEach(function(pr){ var o=document.createElement('option'); o.value=pr.id; o.textContent=pr.name; if(String(pr.id)===String(current)) o.selected=true; periodSel.appendChild(o); }); }
        });
    }
    if (periodSel){ courseSel.addEventListener('change', loadPeriods); loadPeriods(); }

    document.getElementById('asgSave').addEventListener('click', function(){
        var btn=this;
        var course=courseSel.value, title=document.getElementById('asg_title').value.trim();
        if(!course){ showMsg('Kurs seçin.'); return; }
        if(!title){ showMsg('Başlık zorunlu.'); return; }
        var p=new URLSearchParams();
        p.append('action','oes_tp_save_assignment'); p.append('nonce',T.nonce);
        p.append('assignment_id',document.getElementById('asg_id').value);
        p.append('course_id',course);
        if(periodSel) p.append('period_id',periodSel.value);
        p.append('title',title);
        p.append('description',document.getElementById('asg_description').value);
        p.append('due_date',document.getElementById('asg_due').value);
        p.append('extra_days',document.getElementById('asg_extra').value||'0');
        p.append('is_graded',gradedChk.checked?1:0);
        p.append('max_score',maxInp.value||'0');
        p.append('allow_file',document.getElementById('asg_file').checked?1:0);
        p.append('allow_voice',document.getElementById('asg_voice').checked?1:0);
        p.append('allow_text',document.getElementById('asg_text').checked?1:0);
        p.append('status',document.getElementById('asg_status').value);
        btn.disabled=true; btn.classList.add('loading');
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'})
        .then(function(r){return r.json();}).then(function(res){
            btn.disabled=false; btn.classList.remove('loading');
            if(res.success){ showMsg(res.data.message||'Kaydedildi.','success'); setTimeout(function(){ location.href=res.data.redirect||'<?php echo esc_js($list_url); ?>'; },600); }
            else showMsg(res.data||'Kaydedilemedi.');
        }).catch(function(){ btn.disabled=false; btn.classList.remove('loading'); showMsg('Bağlantı hatası.'); });
    });
})();
</script>

<?php elseif ($mode === 'submissions'): ?>
<!-- ===== GÖNDERİMLER ===== -->
<?php $a = $subs['assignment']; $rows = $subs['submissions']; ?>
<div class="oestp-editor-head">
    <a href="<?php echo esc_url($list_url); ?>" class="oestp-back-btn"><i class="ti ti-arrow-left"></i></a>
    <div class="oestp-page-head-txt"><h1><?php echo esc_html($a->title); ?></h1><p><?php echo count($rows); ?> gönderim<?php echo $a->is_graded ? ' · Maks ' . intval($a->max_score) . ' puan' : ' · Puansız'; ?></p></div>
</div>

<?php if (empty($rows)): ?>
<div class="oestp-empty"><div class="oestp-empty-ic"><i class="ti ti-inbox"></i></div><p>Henüz gönderim yok.</p></div>
<?php else: ?>
<div class="oestp-subs">
    <?php foreach ($rows as $s): ?>
    <div class="oestp-sub-card" data-id="<?php echo intval($s->id); ?>">
        <div class="oestp-sub-head">
            <div class="oesp-avatar"><?php echo esc_html(mb_strtoupper(mb_substr($s->display_name ?: '?', 0, 1))); ?></div>
            <div class="oestp-sub-who">
                <strong><?php echo esc_html($s->display_name ?: 'Öğrenci'); ?></strong>
                <span><?php echo esc_html($s->user_email); ?> · <?php echo esc_html(date_i18n('d M Y H:i', strtotime($s->submitted_at))); ?></span>
            </div>
            <span class="oestp-badge oestp-badge-<?php echo $s->status==='graded'?'publish':'pending'; ?>"><?php echo $s->status==='graded' ? ('Notlandı'.($a->is_graded?(' · '.intval($s->score)):'')) : 'Bekliyor'; ?></span>
        </div>

        <?php if (!empty($s->submission_text)): ?>
        <div class="oestp-sub-text"><?php echo nl2br(esc_html($s->submission_text)); ?></div>
        <?php endif; ?>

        <?php if (!empty($s->files)): ?>
        <div class="oestp-sub-files">
            <?php foreach ($s->files as $f): if (empty($f['url'])) continue; ?>
            <a href="<?php echo esc_url($f['url']); ?>" target="_blank" rel="noopener" class="oestp-sub-file"><i class="ti ti-paperclip"></i> <?php echo esc_html($f['name'] ?? 'Dosya'); ?></a>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <?php if (!empty($s->voices)): ?>
        <div class="oestp-sub-voices">
            <?php foreach ($s->voices as $vi => $v): if (empty($v['url'])) continue;
                $tr = isset($s->transcripts[(string)$vi]) ? $s->transcripts[(string)$vi] : '';
                if ($tr === '') { foreach ((array) $s->transcripts as $tk => $tv) { if (strpos((string) $tk, $vi . '_') === 0) { $tr = $tv; break; } } }
            ?>
            <div class="oestp-voice" data-sid="<?php echo intval($s->id); ?>" data-vi="<?php echo intval($vi); ?>" data-url="<?php echo esc_url($v['url']); ?>">
                <div class="oestp-voice-row">
                    <audio controls preload="none" src="<?php echo esc_url($v['url']); ?>"></audio>
                    <a href="<?php echo esc_url($v['url']); ?>" download class="oesp-btn oesp-btn-ghost oesp-btn-sm oestp-voice-dl" title="Sesi indir"><i class="ti ti-download"></i></a>
                    <button type="button" class="oesp-btn oesp-btn-ghost oesp-btn-sm oestp-tr-btn"><i class="ti ti-file-text"></i> Transkript</button>
                </div>
                <div class="oestp-tr-result" data-has="<?php echo $tr !== '' ? '1' : '0'; ?>"<?php echo $tr === '' ? ' hidden' : ''; ?>><?php echo esc_html($tr); ?></div>
            </div>
            <?php endforeach; ?>
        </div>
        <?php endif; ?>

        <?php $is_g = ($s->status === 'graded'); ?>
        <div class="oestp-grade-wrap">
            <?php if ($is_g): ?>
            <div class="oestp-graded-view">
                <div class="oestp-graded-info">
                    <?php if ($a->is_graded): ?><span class="oestp-graded-score"><i class="ti ti-award"></i> <?php echo intval($s->score); ?> / <?php echo intval($a->max_score); ?></span><?php else: ?><span class="oestp-graded-score"><i class="ti ti-check"></i> Onaylandı</span><?php endif; ?>
                    <?php if ($s->feedback !== ''): ?><div class="oestp-graded-fb"><strong>Geri bildirim:</strong> <?php echo nl2br(esc_html($s->feedback)); ?></div><?php endif; ?>
                </div>
                <button type="button" class="oesp-btn oesp-btn-ghost oesp-btn-sm oestp-regrade"><i class="ti ti-pencil"></i> Yeniden değerlendir</button>
            </div>
            <?php endif; ?>
            <div class="oestp-grade"<?php echo $is_g ? ' hidden' : ''; ?>>
                <?php if ($a->is_graded): ?>
                <input type="number" class="g-score" min="0" max="<?php echo intval($a->max_score); ?>" value="<?php echo $s->score !== null ? intval($s->score) : ''; ?>" placeholder="Puan / <?php echo intval($a->max_score); ?>">
                <?php endif; ?>
                <input type="text" class="g-feedback" value="<?php echo esc_attr($s->feedback); ?>" placeholder="Geri bildirim (opsiyonel)">
                <button type="button" class="oesp-btn oesp-btn-green g-save"><i class="ti ti-check"></i> <?php echo $a->is_graded ? 'Notlandır' : 'Onayla'; ?></button>
            </div>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<script>
(function(){
    var T = window.oesTeacher;
    document.querySelectorAll('.oestp-sub-card').forEach(function(card){
        var btn = card.querySelector('.g-save');
        if (btn) btn.addEventListener('click', function(){
            var sc = card.querySelector('.g-score');
            var fb = card.querySelector('.g-feedback');
            var p = new URLSearchParams();
            p.append('action','oes_tp_grade_submission'); p.append('nonce',T.nonce);
            p.append('submission_id',card.dataset.id);
            p.append('score', sc ? (sc.value||'0') : '0');
            p.append('feedback', fb.value);
            btn.disabled=true; btn.classList.add('loading');
            fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'})
            .then(function(r){return r.json();}).then(function(res){
                if(res.success){ location.reload(); }
                else { alert(res.data||'Hata'); btn.disabled=false; btn.classList.remove('loading'); }
            }).catch(function(){ btn.disabled=false; btn.classList.remove('loading'); alert('Bağlantı hatası.'); });
        });
        var re = card.querySelector('.oestp-regrade');
        if (re) re.addEventListener('click', function(){ card.querySelector('.oestp-graded-view').style.display='none'; card.querySelector('.oestp-grade').hidden=false; });
    });

    // ---- Transkript (Whisper, tarayıcıda) ----
    document.querySelectorAll('.oestp-voice').forEach(function(v){
        var btn = v.querySelector('.oestp-tr-btn'); var res = v.querySelector('.oestp-tr-result');
        btn.addEventListener('click', function(){
            if (res.dataset.has === '1') { res.hidden = !res.hidden; return; }
            transcribe(v, btn, res);
        });
    });
    async function transcribe(v, btn, res){
        try{
            btn.disabled=true; btn.innerHTML='<i class="ti ti-loader-2"></i> Ses indiriliyor…';
            var resp=await fetch(v.dataset.url); if(!resp.ok) throw new Error('Ses indirilemedi');
            var ab=await resp.arrayBuffer();
            btn.innerHTML='<i class="ti ti-loader-2"></i> AI yükleniyor… (~1dk)';
            var audioData=await decodeAudio(ab);
            var mod=await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');
            // whisper-base: mobilde bellek dostu (small ~240MB sekmeyi çökertiyordu)
            var transcriber=await mod.pipeline('automatic-speech-recognition','Xenova/whisper-base',{quantized:true});
            btn.innerHTML='<i class="ti ti-loader-2"></i> Metne çevriliyor… (2-3dk)';
            var out=await transcriber(audioData,{language:'turkish',task:'transcribe',return_timestamps:false,chunk_length_s:30,stride_length_s:5});
            var text=(out.text||'').trim(); if(!text) throw new Error('Konuşma tespit edilemedi');
            res.textContent=text; res.hidden=false; res.dataset.has='1';
            var p=new URLSearchParams(); p.append('action','oes_tp_save_transcript'); p.append('nonce',T.nonce); p.append('submission_id',v.dataset.sid); p.append('voice_index',v.dataset.vi); p.append('transcript',text);
            fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'});
            btn.disabled=false; btn.innerHTML='<i class="ti ti-file-text"></i> Transkript';
        }catch(e){ alert('Transkript hatası: '+e.message); btn.disabled=false; btn.innerHTML='<i class="ti ti-file-text"></i> Transkript'; }
    }
    async function decodeAudio(ab){
        var Ctx=window.OfflineAudioContext||window.webkitOfflineAudioContext;
        if(!Ctx) throw new Error('Tarayıcı ses çözmeyi desteklemiyor');
        // Tek decode: OfflineAudioContext 16kHz'e yeniden örnekler (Whisper 16kHz ister)
        var ctx=new Ctx(1,1,16000); var buf;
        try{ buf=await ctx.decodeAudioData(ab); }catch(e){ throw new Error('Ses formatı desteklenmiyor'); }
        if(buf.numberOfChannels===1) return buf.getChannelData(0);
        var l=buf.getChannelData(0), r=buf.getChannelData(1), o=new Float32Array(l.length); for(var i=0;i<l.length;i++){ o[i]=(l[i]+r[i])/2; } return o;
    }
})();
</script>
<?php endif; ?>

<?php endif; ?>
