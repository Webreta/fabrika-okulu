<?php
if (!defined('ABSPATH')) exit;
/** @var array $data */
/** @var OES_Teacher_Panel $panel */

$uid        = $data['user']['id'];
$list_url   = $panel->panel_url('sinavlar');
$new_url    = $list_url . '&new=1';
$my_courses = $data['courses'];
$periods_on = class_exists('OES_Module_Manager') && OES_Module_Manager::is_active('periods');

$mode = 'list'; $quiz = null; $att = null; $grade = null; $err = '';
if (isset($_GET['new'])) {
    $mode = 'edit';
} elseif (isset($_GET['edit'])) {
    $quiz = OES_Teacher_Quizzes::get_quiz_for_edit($uid, intval($_GET['edit']));
    $quiz ? $mode = 'edit' : $err = 'Bu sınava erişiminiz yok.';
} elseif (isset($_GET['attempts'])) {
    $att = OES_Teacher_Quizzes::get_attempts($uid, intval($_GET['attempts']));
    $att ? $mode = 'attempts' : $err = 'Bu sınavın sonuçlarına erişiminiz yok.';
} elseif (isset($_GET['grade'])) {
    $grade = OES_Teacher_Quizzes::get_attempt_for_grading($uid, intval($_GET['grade']));
    $grade ? $mode = 'grade' : $err = 'Bu denemeye erişiminiz yok.';
}
$type_labels = array('multiple_choice' => 'Çoktan seçmeli', 'true_false' => 'Doğru / Yanlış', 'open_ended' => 'Açık uçlu');
?>

<?php if ($err): ?><div class="oesp-auth-msg error" style="margin-bottom:16px;"><?php echo esc_html($err); ?></div><?php endif; ?>

<?php if ($mode === 'list'): ?>
<!-- ===== LİSTE ===== -->
<?php $items = OES_Teacher_Quizzes::get_teacher_quizzes($uid); ?>
<div class="oestp-page-head">
    <div class="oestp-page-head-txt"><h1>Sınavlar</h1><p><?php echo count($items); ?> sınav</p></div>
    <?php if (!empty($my_courses)): ?><a href="<?php echo esc_url($new_url); ?>" class="oesp-btn oesp-btn-green"><i class="ti ti-plus"></i> Yeni Sınav</a><?php endif; ?>
</div>

<?php if (empty($my_courses)): ?>
<div class="oestp-empty"><div class="oestp-empty-ic"><i class="ti ti-book-off"></i></div><p>Önce bir kursun olmalı.</p></div>
<?php elseif (empty($items)): ?>
<div class="oestp-empty"><div class="oestp-empty-ic"><i class="ti ti-clipboard-off"></i></div><p>Henüz sınav yok. İlk sınavını oluştur.</p><a href="<?php echo esc_url($new_url); ?>" class="oesp-btn oesp-btn-green"><i class="ti ti-plus"></i> Yeni Sınav</a></div>
<?php else: ?>
<div class="oestp-course-list">
    <?php foreach ($items as $q): ?>
    <div class="oestp-course-item">
        <div class="oestp-course-thumb" style="background:linear-gradient(120deg,#7c3aed,#a78bfa);display:flex;align-items:center;justify-content:center;"><i class="ti ti-clipboard-check" style="color:#fff;font-size:26px;"></i></div>
        <div class="oestp-course-info">
            <div class="oestp-course-title"><?php echo esc_html($q->title); ?></div>
            <div class="oestp-course-meta">
                <span class="oestp-badge oestp-badge-<?php echo $q->status==='draft'?'draft':'publish'; ?>"><?php echo $q->status==='draft'?'Taslak':'Aktif'; ?></span>
                <span><i class="ti ti-book"></i> <?php echo esc_html($q->course_name); ?></span>
                <span><i class="ti ti-help-circle"></i> <?php echo intval($q->question_count); ?> soru</span>
                <span><i class="ti ti-users"></i> <?php echo intval($q->completed_count); ?></span>
            </div>
        </div>
        <div class="oestp-course-actions">
            <a href="<?php echo esc_url($list_url . '&attempts=' . intval($q->id)); ?>" class="oestp-icon-btn" title="Sonuçlar" style="position:relative;">
                <i class="ti ti-chart-bar"></i>
                <?php if ($q->pending_count > 0): ?><span class="oestp-count-dot"><?php echo intval($q->pending_count); ?></span><?php endif; ?>
            </a>
            <a href="<?php echo esc_url($list_url . '&edit=' . intval($q->id)); ?>" class="oestp-icon-btn" title="Düzenle"><i class="ti ti-edit"></i></a>
            <button type="button" class="oestp-icon-btn oestp-del-quiz" data-id="<?php echo intval($q->id); ?>" data-title="<?php echo esc_attr($q->title); ?>" title="Sil"><i class="ti ti-trash"></i></button>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<script>
(function(){ var T=window.oesTeacher;
    document.querySelectorAll('.oestp-del-quiz').forEach(function(btn){ btn.addEventListener('click',function(){
        if(!confirm('"'+(btn.dataset.title||'sınav')+'" silinsin mi?')) return;
        var p=new URLSearchParams(); p.append('action','oes_tp_delete_quiz'); p.append('nonce',T.nonce); p.append('id',btn.dataset.id); btn.disabled=true;
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'})
        .then(function(r){return r.json();}).then(function(res){ if(res.success) location.reload(); else { alert(res.data||'Hata'); btn.disabled=false; } });
    }); });
})();
</script>
<?php endif; ?>

<?php elseif ($mode === 'edit'): ?>
<!-- ===== SINAV AYARLARI + SORULAR ===== -->
<?php
$is_new = ($quiz === null);
$q = $quiz ?: (object) array('id'=>0,'course_id'=>0,'period_id'=>null,'title'=>'','description'=>'','time_limit'=>0,'pass_score'=>60,'max_attempts'=>1,'shuffle_questions'=>0,'shuffle_answers'=>0,'show_correct_answers'=>1,'status'=>'active','questions'=>array());
?>
<div class="oestp-editor" id="oestpQuizEditor">
    <div class="oestp-editor-head">
        <a href="<?php echo esc_url($list_url); ?>" class="oestp-back-btn"><i class="ti ti-arrow-left"></i></a>
        <div class="oestp-page-head-txt"><h1><?php echo $is_new?'Yeni Sınav':'Sınavı Düzenle'; ?></h1><p>Ayarlar<?php echo $is_new?'':' ve sorular'; ?></p></div>
    </div>
    <div class="oesp-auth-msg" id="qzMsg" hidden></div>
    <input type="hidden" id="qz_id" value="<?php echo intval($q->id); ?>">

    <div class="oestp-card">
        <div class="oestp-fields">
            <label>Kurs *
                <select id="qz_course"><option value="">Kurs seçin</option>
                <?php foreach ($my_courses as $c): ?><option value="<?php echo intval($c['id']); ?>" <?php selected($q->course_id,$c['id']); ?>><?php echo esc_html($c['title']); ?></option><?php endforeach; ?>
                </select>
            </label>
            <?php if ($periods_on): ?>
            <label>Dönem (opsiyonel)
                <select id="qz_period" data-current="<?php echo intval($q->period_id); ?>"><option value="">Tüm dönemler</option></select>
            </label>
            <?php endif; ?>
            <label>Başlık *
                <input type="text" id="qz_title" value="<?php echo esc_attr($q->title); ?>" placeholder="Örn. Ünite 1 Sınavı">
            </label>
            <label>Açıklama
                <textarea id="qz_description" rows="3" placeholder="Sınav yönergesi"><?php echo esc_textarea($q->description); ?></textarea>
            </label>
            <div class="oestp-form-row">
                <label>Süre (dk, 0=sınırsız)<input type="number" id="qz_time" min="0" value="<?php echo intval($q->time_limit); ?>"></label>
                <label>Geçme puanı (%, 0=puansız)<input type="number" id="qz_pass" min="0" max="100" value="<?php echo intval($q->pass_score); ?>"></label>
            </div>
            <div class="oestp-form-row">
                <label>Deneme hakkı (0=sınırsız)<input type="number" id="qz_attempts" min="0" value="<?php echo intval($q->max_attempts); ?>"></label>
                <label>Durum
                    <select id="qz_status"><option value="active" <?php selected($q->status,'active'); ?>>Aktif</option><option value="draft" <?php selected($q->status,'draft'); ?>>Taslak</option></select>
                </label>
            </div>
            <div class="oestp-checks">
                <label class="oestp-check-inline"><input type="checkbox" id="qz_sq" <?php checked($q->shuffle_questions,1); ?>> Soruları karıştır</label>
                <label class="oestp-check-inline"><input type="checkbox" id="qz_sa" <?php checked($q->shuffle_answers,1); ?>> Şıkları karıştır</label>
                <label class="oestp-check-inline"><input type="checkbox" id="qz_show" <?php checked($q->show_correct_answers,1); ?>> Doğru cevapları göster</label>
            </div>
        </div>
    </div>

    <div class="oestp-editor-foot" style="position:static;padding:0 0 16px;">
        <a href="<?php echo esc_url($list_url); ?>" class="oesp-btn oesp-btn-ghost">İptal</a>
        <button type="button" class="oesp-btn oesp-btn-green" id="qzSave"><i class="ti ti-device-floppy"></i> Ayarları kaydet</button>
    </div>

    <?php if (!$is_new): ?>
    <!-- Sorular -->
    <div class="oestp-card">
        <div class="oestp-curr-head">
            <div class="oesp-section-title" style="margin:0;">Sorular (<?php echo count($q->questions); ?>)</div>
            <button type="button" class="oesp-btn oesp-btn-ghost" id="qAddBtn"><i class="ti ti-plus"></i> Soru ekle</button>
        </div>

        <div class="oestp-qlist">
            <?php foreach ($q->questions as $i => $qq):
                $opts = json_decode((string) $qq->options, true) ?: array();
                $corr = json_decode((string) $qq->correct_answer, true);
            ?>
            <div class="oestp-qcard" data-id="<?php echo intval($qq->id); ?>"
                 data-type="<?php echo esc_attr($qq->question_type); ?>"
                 data-text="<?php echo esc_attr($qq->question_text); ?>"
                 data-points="<?php echo intval($qq->points); ?>"
                 data-explanation="<?php echo esc_attr($qq->explanation); ?>"
                 data-options='<?php echo esc_attr(wp_json_encode($opts)); ?>'
                 data-correct='<?php echo esc_attr(is_array($corr) ? wp_json_encode($corr) : wp_json_encode((string)$qq->correct_answer)); ?>'>
                <div class="oestp-qcard-top">
                    <span class="oestp-qnum"><?php echo $i+1; ?></span>
                    <span class="oestp-qtype oestp-qtype-<?php echo esc_attr($qq->question_type); ?>"><?php echo esc_html($type_labels[$qq->question_type] ?? $qq->question_type); ?></span>
                    <span class="oestp-qpts"><?php echo intval($qq->points); ?> puan</span>
                    <div class="oestp-qcard-actions">
                        <button type="button" class="oestp-icon-btn q-edit" title="Düzenle"><i class="ti ti-edit"></i></button>
                        <button type="button" class="oestp-icon-btn q-del" title="Sil"><i class="ti ti-x"></i></button>
                    </div>
                </div>
                <div class="oestp-qtext"><?php echo esc_html($qq->question_text); ?></div>
            </div>
            <?php endforeach; ?>
        </div>
        <div class="oestp-curr-empty" id="qEmpty" style="<?php echo count($q->questions)?'display:none;':''; ?>">Henüz soru yok. "Soru ekle" ile başla.</div>
    </div>
    <?php endif; ?>
</div>

<!-- Soru formu (modal) -->
<div class="oestp-media-modal" id="qModal">
    <div class="oestp-media-box" style="max-width:560px;">
        <div class="oestp-media-head"><strong><i class="ti ti-help-circle"></i> <span id="qModalTitle">Soru</span></strong><button type="button" class="oestp-icon-btn" id="qClose"><i class="ti ti-x"></i></button></div>
        <div style="padding:16px;overflow-y:auto;min-height:0;flex:1;">
            <input type="hidden" id="q_id" value="">
            <div class="oestp-fields">
                <label>Soru tipi
                    <select id="q_type">
                        <option value="multiple_choice">Çoktan seçmeli</option>
                        <option value="true_false">Doğru / Yanlış</option>
                        <option value="open_ended">Açık uçlu</option>
                    </select>
                </label>
                <label>Soru metni *
                    <textarea id="q_text" rows="3" placeholder="Soruyu yazın"></textarea>
                </label>
                <div class="oestp-form-row">
                    <label>Puan<input type="number" id="q_points" min="1" value="1"></label>
                    <label>Açıklama (opsiyonel)<input type="text" id="q_explanation" placeholder="Cevap açıklaması"></label>
                </div>

                <div id="q_mc_wrap">
                    <div class="oestp-field-label">Şıklar (doğru olanı işaretle)</div>
                    <div id="q_options"></div>
                    <button type="button" class="oesp-btn oesp-btn-ghost oesp-btn-sm" id="q_add_opt"><i class="ti ti-plus"></i> Şık ekle</button>
                </div>

                <div id="q_tf_wrap">
                    <div class="oestp-field-label">Doğru cevap</div>
                    <div class="oestp-checks">
                        <label class="oestp-check-inline"><input type="radio" name="q_tf" value="true"> Doğru</label>
                        <label class="oestp-check-inline"><input type="radio" name="q_tf" value="false"> Yanlış</label>
                    </div>
                </div>

                <div id="q_oe_wrap"><p style="font-size:13px;color:#94a3b8;margin:0;">Açık uçlu sorular eğitmen tarafından elle değerlendirilir.</p></div>
            </div>
        </div>
        <div class="oestp-media-foot" style="text-align:right;">
            <button type="button" class="oesp-btn oesp-btn-ghost" id="qCancel">İptal</button>
            <button type="button" class="oesp-btn oesp-btn-green" id="qSaveBtn"><i class="ti ti-check"></i> Kaydet</button>
        </div>
    </div>
</div>

<script>
(function(){
    var T = window.oesTeacher;
    var msg = document.getElementById('qzMsg');
    function showMsg(t,type){ msg.textContent=t; msg.className='oesp-auth-msg '+(type||'error'); msg.hidden=false; msg.scrollIntoView({behavior:'smooth',block:'center'}); }

    // Dönem yükleme
    var courseSel=document.getElementById('qz_course'), periodSel=document.getElementById('qz_period');
    function loadPeriods(){ if(!periodSel) return; var cid=courseSel.value, cur=periodSel.getAttribute('data-current'); periodSel.innerHTML='<option value="">Tüm dönemler</option>'; if(!cid) return;
        var p=new URLSearchParams(); p.append('action','oes_tp_course_periods'); p.append('nonce',T.nonce); p.append('course_id',cid);
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){ if(res.success&&res.data.periods){res.data.periods.forEach(function(pr){var o=document.createElement('option');o.value=pr.id;o.textContent=pr.name;if(String(pr.id)===String(cur))o.selected=true;periodSel.appendChild(o);});} });
    }
    if(periodSel){ courseSel.addEventListener('change',loadPeriods); loadPeriods(); }

    // Sınav ayarlarını kaydet
    document.getElementById('qzSave').addEventListener('click',function(){
        var btn=this, course=courseSel.value, title=document.getElementById('qz_title').value.trim();
        if(!course){ showMsg('Kurs seçin.'); return; } if(!title){ showMsg('Başlık zorunlu.'); return; }
        var p=new URLSearchParams(); p.append('action','oes_tp_save_quiz'); p.append('nonce',T.nonce);
        p.append('id',document.getElementById('qz_id').value); p.append('course_id',course);
        if(periodSel) p.append('period_id',periodSel.value);
        p.append('title',title); p.append('description',document.getElementById('qz_description').value);
        p.append('time_limit',document.getElementById('qz_time').value||'0');
        p.append('pass_score',document.getElementById('qz_pass').value||'0');
        p.append('max_attempts',document.getElementById('qz_attempts').value||'0');
        p.append('shuffle_questions',document.getElementById('qz_sq').checked?1:0);
        p.append('shuffle_answers',document.getElementById('qz_sa').checked?1:0);
        p.append('show_correct_answers',document.getElementById('qz_show').checked?1:0);
        p.append('status',document.getElementById('qz_status').value);
        btn.disabled=true; btn.classList.add('loading');
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
            btn.disabled=false; btn.classList.remove('loading');
            if(res.success){ showMsg(res.data.message||'Kaydedildi.','success'); setTimeout(function(){ location.href=res.data.redirect; },500); }
            else showMsg(res.data||'Kaydedilemedi.');
        }).catch(function(){ btn.disabled=false; btn.classList.remove('loading'); showMsg('Bağlantı hatası.'); });
    });

    // ---- Soru modal ----
    var modal=document.getElementById('qModal'); if(!modal) return;
    var qType=document.getElementById('q_type'), optWrap=document.getElementById('q_options');
    function syncType(){ var t=qType.value; document.getElementById('q_mc_wrap').style.display=t==='multiple_choice'?'':'none'; document.getElementById('q_tf_wrap').style.display=t==='true_false'?'':'none'; document.getElementById('q_oe_wrap').style.display=t==='open_ended'?'':'none'; }
    qType.addEventListener('change',syncType);
    function optRow(text,checked){ var d=document.createElement('div'); d.className='oestp-opt-row'; d.innerHTML='<input type="checkbox" class="opt-correct" '+(checked?'checked':'')+'><input type="text" class="opt-text" placeholder="Şık" value="'+(text||'').replace(/"/g,'&quot;')+'"><button type="button" class="oestp-icon-btn opt-del"><i class="ti ti-x"></i></button>'; d.querySelector('.opt-del').addEventListener('click',function(){d.remove();}); optWrap.appendChild(d); }
    document.getElementById('q_add_opt').addEventListener('click',function(){ optRow('',false); });

    function openModal(qc){
        document.getElementById('qModalTitle').textContent = qc ? 'Soruyu düzenle' : 'Yeni soru';
        document.getElementById('q_id').value = qc ? qc.dataset.id : '';
        qType.value = qc ? qc.dataset.type : 'multiple_choice';
        document.getElementById('q_text').value = qc ? qc.dataset.text : '';
        document.getElementById('q_points').value = qc ? qc.dataset.points : 1;
        document.getElementById('q_explanation').value = qc ? qc.dataset.explanation : '';
        optWrap.innerHTML='';
        document.querySelectorAll('input[name=q_tf]').forEach(function(r){r.checked=false;});
        if(qc){
            var opts=[]; var corr=null; try{opts=JSON.parse(qc.dataset.options||'[]');}catch(e){} try{corr=JSON.parse(qc.dataset.correct||'null');}catch(e){}
            if(qc.dataset.type==='multiple_choice'){ var ci=Array.isArray(corr)?corr.map(Number):[]; opts.forEach(function(o,idx){ optRow(o, ci.indexOf(idx)>-1); }); if(!opts.length){ optRow('',false); optRow('',false); } }
            else if(qc.dataset.type==='true_false'){ var val=(corr===true||corr==='true')?'true':(corr==='false'||corr===false?'false':String(corr)); document.querySelectorAll('input[name=q_tf]').forEach(function(r){ if(r.value===val) r.checked=true; }); }
        } else { optRow('',false); optRow('',false); }
        syncType();
        modal.classList.add('open');
    }
    var addBtn=document.getElementById('qAddBtn'); if(addBtn) addBtn.addEventListener('click',function(){ openModal(null); });
    document.querySelectorAll('.q-edit').forEach(function(b){ b.addEventListener('click',function(){ openModal(b.closest('.oestp-qcard')); }); });
    document.querySelectorAll('.q-del').forEach(function(b){ b.addEventListener('click',function(){ var card=b.closest('.oestp-qcard'); if(!confirm('Soru silinsin mi?')) return;
        var p=new URLSearchParams(); p.append('action','oes_tp_delete_question'); p.append('nonce',T.nonce); p.append('question_id',card.dataset.id);
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){ if(res.success) location.reload(); else alert(res.data||'Hata'); });
    }); });
    document.getElementById('qClose').addEventListener('click',function(){modal.classList.remove('open');});
    document.getElementById('qCancel').addEventListener('click',function(){modal.classList.remove('open');});

    document.getElementById('qSaveBtn').addEventListener('click',function(){
        var btn=this, t=qType.value, text=document.getElementById('q_text').value.trim();
        if(!text){ alert('Soru metni zorunlu.'); return; }
        var p=new URLSearchParams(); p.append('action','oes_tp_save_question'); p.append('nonce',T.nonce);
        p.append('quiz_id',document.getElementById('qz_id').value);
        p.append('question_id',document.getElementById('q_id').value);
        p.append('question_type',t);
        p.append('question_text',text);
        p.append('points',document.getElementById('q_points').value||'1');
        p.append('explanation',document.getElementById('q_explanation').value);
        if(t==='multiple_choice'){
            var rows=optWrap.querySelectorAll('.oestp-opt-row'); var any=false; var oi=0;
            rows.forEach(function(r){ var txt=r.querySelector('.opt-text').value.trim(); if(txt!==''){ p.append('options[]',txt); if(r.querySelector('.opt-correct').checked){ p.append('correct[]',oi); any=true; } oi++; } });
            if(!any){ alert('En az bir doğru şık işaretleyin.'); return; }
        } else if(t==='true_false'){
            var sel=document.querySelector('input[name=q_tf]:checked'); if(!sel){ alert('Doğru cevabı seçin.'); return; } p.append('correct',sel.value);
        }
        btn.disabled=true; btn.classList.add('loading');
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){ if(res.success) location.reload(); else { alert(res.data||'Hata'); btn.disabled=false; btn.classList.remove('loading'); } }).catch(function(){ btn.disabled=false; btn.classList.remove('loading'); alert('Bağlantı hatası.'); });
    });
})();
</script>

<?php elseif ($mode === 'attempts'): ?>
<!-- ===== SONUÇLAR ===== -->
<?php $q = $att['quiz']; $rows = $att['attempts']; ?>
<div class="oestp-editor-head">
    <a href="<?php echo esc_url($list_url); ?>" class="oestp-back-btn"><i class="ti ti-arrow-left"></i></a>
    <div class="oestp-page-head-txt"><h1><?php echo esc_html($q->title); ?></h1><p><?php echo count($rows); ?> deneme<?php echo $q->pass_score>0?(' · Geçme %'.intval($q->pass_score)):' · Puansız'; ?></p></div>
</div>
<?php if (empty($rows)): ?>
<div class="oestp-empty"><div class="oestp-empty-ic"><i class="ti ti-chart-bar-off"></i></div><p>Henüz deneme yok.</p></div>
<?php else: ?>
<div class="oestp-subs">
    <?php foreach ($rows as $a):
        $pending = $a->status === 'pending_review';
    ?>
    <div class="oestp-sub-card">
        <div class="oestp-sub-head">
            <div class="oesp-avatar"><?php echo esc_html(mb_strtoupper(mb_substr($a->display_name ?: '?',0,1))); ?></div>
            <div class="oestp-sub-who"><strong><?php echo esc_html($a->display_name ?: 'Öğrenci'); ?></strong><span><?php echo esc_html($a->user_email); ?> · <?php echo $a->completed_at ? esc_html(date_i18n('d M Y H:i', strtotime($a->completed_at))) : '—'; ?></span></div>
            <?php if ($pending): ?>
                <span class="oestp-badge oestp-badge-pending">Değerlendirme bekliyor</span>
            <?php else: ?>
                <span class="oestp-badge <?php echo $a->passed ? 'oestp-badge-publish' : 'oestp-badge-fail'; ?>"><?php echo intval($a->score); ?>% · <?php echo $a->passed ? 'Geçti' : 'Kaldı'; ?></span>
            <?php endif; ?>
        </div>
        <div class="oestp-grade" style="border:0;padding-top:0;">
            <?php if ($pending): ?>
            <a href="<?php echo esc_url($list_url . '&grade=' . intval($a->id)); ?>" class="oesp-btn oesp-btn-green"><i class="ti ti-pencil"></i> Açık uçluları değerlendir</a>
            <?php else: ?>
            <a href="<?php echo esc_url($list_url . '&grade=' . intval($a->id)); ?>" class="oesp-btn oesp-btn-ghost oesp-btn-sm"><i class="ti ti-eye"></i> Detay / yeniden değerlendir</a>
            <?php endif; ?>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<?php endif; ?>

<?php elseif ($mode === 'grade'): ?>
<!-- ===== AÇIK UÇLU DEĞERLENDİRME ===== -->
<?php $qz = $grade['quiz']; $questions = $grade['questions']; $answers = $grade['answers']; $graded = $grade['graded']; ?>
<div class="oestp-editor-head">
    <a href="<?php echo esc_url($list_url . '&attempts=' . intval($qz->id)); ?>" class="oestp-back-btn"><i class="ti ti-arrow-left"></i></a>
    <div class="oestp-page-head-txt"><h1>Değerlendirme</h1><p><?php echo esc_html($grade['student']); ?> · <?php echo esc_html($qz->title); ?></p></div>
</div>
<div class="oesp-auth-msg" id="grMsg" hidden></div>
<input type="hidden" id="gr_attempt" value="<?php echo intval($grade['attempt']->id); ?>">

<div class="oestp-subs">
    <?php foreach ($questions as $i => $qq):
        $ua = isset($answers[$qq->id]) ? $answers[$qq->id] : '';
        $opts = json_decode((string) $qq->options, true) ?: array();
    ?>
    <div class="oestp-sub-card">
        <div class="oestp-qcard-top" style="margin-bottom:8px;">
            <span class="oestp-qnum"><?php echo $i+1; ?></span>
            <span class="oestp-qtype oestp-qtype-<?php echo esc_attr($qq->question_type); ?>"><?php echo esc_html($type_labels[$qq->question_type] ?? ''); ?></span>
            <span class="oestp-qpts"><?php echo intval($qq->points); ?> puan</span>
        </div>
        <div class="oestp-qtext" style="margin-bottom:8px;"><?php echo esc_html($qq->question_text); ?></div>

        <?php if ($qq->question_type === 'open_ended'):
            $g = $graded[$qq->id] ?? null;
        ?>
        <div class="oestp-sub-text"><?php echo $ua !== '' ? nl2br(esc_html($ua)) : '<em style="color:#94a3b8;">Boş bırakılmış</em>'; ?></div>
        <div class="oestp-grade" data-qid="<?php echo intval($qq->id); ?>" data-max="<?php echo intval($qq->points); ?>">
            <input type="number" class="g-oe-points" min="0" max="<?php echo intval($qq->points); ?>" value="<?php echo $g ? intval($g->points_earned) : ''; ?>" placeholder="Puan / <?php echo intval($qq->points); ?>">
            <input type="text" class="g-oe-feedback" value="<?php echo $g ? esc_attr($g->feedback) : ''; ?>" placeholder="Geri bildirim (opsiyonel)">
        </div>
        <?php else:
            // Otomatik soru — öğrencinin cevabı (bilgi amaçlı)
            $display = $ua;
            if ($qq->question_type === 'multiple_choice' && $ua !== '') { $idx = ord(strtoupper((string)$ua)) - 65; $display = isset($opts[$idx]) ? $opts[$idx] : $ua; }
            elseif ($qq->question_type === 'true_false') { $display = ($ua === 'true') ? 'Doğru' : (($ua === 'false') ? 'Yanlış' : $ua); }
        ?>
        <div class="oestp-sub-text" style="background:#f1f5f9;"><strong>Öğrenci cevabı:</strong> <?php echo esc_html($display !== '' ? $display : '—'); ?> <span style="color:#94a3b8;font-size:12px;">(otomatik puanlanır)</span></div>
        <?php endif; ?>
    </div>
    <?php endforeach; ?>
</div>

<div class="oestp-editor-foot" style="position:static;">
    <a href="<?php echo esc_url($list_url . '&attempts=' . intval($qz->id)); ?>" class="oesp-btn oesp-btn-ghost">İptal</a>
    <button type="button" class="oesp-btn oesp-btn-green" id="grSave"><i class="ti ti-device-floppy"></i> Değerlendirmeyi kaydet</button>
</div>

<script>
(function(){
    var T=window.oesTeacher; var msg=document.getElementById('grMsg');
    function showMsg(t,type){ msg.textContent=t; msg.className='oesp-auth-msg '+(type||'error'); msg.hidden=false; msg.scrollIntoView({behavior:'smooth',block:'center'}); }
    document.getElementById('grSave').addEventListener('click',function(){
        var btn=this; var grades={};
        document.querySelectorAll('.oestp-grade[data-qid]').forEach(function(g){
            var qid=g.dataset.qid, max=parseInt(g.dataset.max,10);
            var pts=parseInt(g.querySelector('.g-oe-points').value||'0',10); if(isNaN(pts))pts=0; if(pts>max)pts=max; if(pts<0)pts=0;
            grades[qid]={ points:pts, feedback:g.querySelector('.g-oe-feedback').value };
        });
        var p=new URLSearchParams(); p.append('action','oes_tp_grade_open_ended'); p.append('nonce',T.nonce);
        p.append('attempt_id',document.getElementById('gr_attempt').value); p.append('grades',JSON.stringify(grades));
        btn.disabled=true; btn.classList.add('loading');
        fetch(T.ajaxUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:p.toString(),credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
            btn.disabled=false; btn.classList.remove('loading');
            if(res.success){ showMsg('Kaydedildi. Skor: %'+res.data.score+' · '+(res.data.passed?'Geçti':'Kaldı'),'success'); setTimeout(function(){ location.href='<?php echo esc_js($list_url . '&attempts=' . intval($qz->id)); ?>'; },900); }
            else showMsg(res.data||'Hata');
        }).catch(function(){ btn.disabled=false; btn.classList.remove('loading'); showMsg('Bağlantı hatası.'); });
    });
})();
</script>

<?php endif; ?>
