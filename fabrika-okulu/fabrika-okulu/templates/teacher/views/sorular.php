<?php
/** Eğitmen — Sorular (kullanıcı bazlı sohbet gelen kutusu). $data, $panel kapsamda. */
if (!defined('ABSPATH')) exit;
global $wpdb;
$cids  = array_map('intval', $data['course_ids']);
$nonce = wp_create_nonce('oes_teacher_panel');

$convos = array();
if (!empty($cids) && OES_Module_Manager::is_active('questions')) {
    $ph = implode(',', array_fill(0, count($cids), '%d'));
    $rows = $wpdb->get_results($wpdb->prepare("
        SELECT q.user_id, q.course_id, u.display_name, u.user_email, p.post_title AS course_title,
               MAX(q.created_at) AS last_at, COUNT(*) AS msg_count,
               SUM(CASE WHEN q.status = 'pending' THEN 1 ELSE 0 END) AS pending_count
        FROM {$wpdb->prefix}oes_questions q
        INNER JOIN {$wpdb->users} u ON u.ID = q.user_id
        LEFT JOIN {$wpdb->posts} p ON p.ID = q.course_id
        WHERE q.course_id IN ($ph)
        GROUP BY q.user_id, q.course_id
        ORDER BY last_at DESC
        LIMIT 300
    ", $cids));

    foreach ($rows as $r) {
        $qs = $wpdb->get_results($wpdb->prepare(
            "SELECT id, question_text, lesson_title, created_at FROM {$wpdb->prefix}oes_questions
             WHERE user_id = %d AND course_id = %d ORDER BY created_at ASC", $r->user_id, $r->course_id));
        $msgs = array();
        foreach ($qs as $q) {
            $msgs[] = array('who' => 'student', 'name' => $r->display_name, 'text' => $q->question_text, 'at' => $q->created_at, 'lesson' => $q->lesson_title);
            foreach ($wpdb->get_results($wpdb->prepare(
                "SELECT a.answer, a.created_at, a.is_instructor, au.display_name
                 FROM {$wpdb->prefix}oes_question_answers a
                 LEFT JOIN {$wpdb->users} au ON au.ID = a.user_id
                 WHERE a.question_id = %d ORDER BY a.created_at ASC", $q->id)) as $a) {
                $msgs[] = array(
                    'who'  => $a->is_instructor ? 'teacher' : 'student',
                    'name' => $a->display_name ?: ($a->is_instructor ? 'Eğitmen' : $r->display_name),
                    'text' => $a->answer,
                    'at'   => $a->created_at,
                );
            }
        }
        $last = end($msgs);
        $convos[] = array(
            'cid'      => $r->user_id . '_' . $r->course_id,
            'uid'      => intval($r->user_id),
            'courseId' => intval($r->course_id),
            'name'     => $r->display_name ?: $r->user_email,
            'email'    => $r->user_email,
            'course'   => $r->course_title ?: '',
            'pending'  => intval($r->pending_count),
            'last'     => $last ? $last['text'] : '',
            'last_at'  => $r->last_at,
            'messages' => $msgs,
        );
    }
}
$fmt_time = function ($s) { return $s ? date_i18n('d M · H:i', strtotime($s)) : ''; };
?>
<style>
.qib{display:grid;grid-template-columns:320px 1fr;gap:0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#fff;min-height:560px;}
.qib-list{border-right:1px solid var(--line);overflow-y:auto;max-height:640px;}
.qib-item{display:flex;gap:10px;padding:12px 14px;cursor:pointer;border-bottom:1px solid var(--line);position:relative;}
.qib-item:hover{background:var(--hover);}
.qib-item.active{background:#eaf1f8;}
.qib-item .st-av{width:38px;height:38px;flex-shrink:0;}
.qib-im{flex:1;min-width:0;}
.qib-top{display:flex;justify-content:space-between;gap:8px;align-items:baseline;}
.qib-name{font-weight:700;font-size:13.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.qib-time{font-size:11px;color:var(--ink3);flex-shrink:0;}
.qib-course{font-size:11.5px;color:var(--navy);margin:1px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.qib-last{font-size:12.5px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.qib-dot{position:absolute;right:12px;top:14px;width:9px;height:9px;border-radius:50%;background:var(--amber);}
.qib-thread{display:flex;flex-direction:column;max-height:640px;}
.qib-thread-head{padding:14px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:10px;}
.qib-thread-head .st-av{width:36px;height:36px;}
.qib-msgs{flex:1;overflow-y:auto;padding:18px;display:flex;flex-direction:column;gap:12px;background:var(--bg);}
.qmsg{max-width:76%;}
.qmsg.student{align-self:flex-start;}
.qmsg.teacher{align-self:flex-end;}
.qmsg-bubble{padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.55;}
.qmsg.student .qmsg-bubble{background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px;color:var(--ink);}
.qmsg.teacher .qmsg-bubble{background:var(--navy);color:#fff;border-bottom-right-radius:4px;}
.qmsg-meta{font-size:11px;color:var(--ink3);margin-top:3px;padding:0 4px;}
.qmsg.teacher .qmsg-meta{text-align:right;}
.qib-reply{padding:12px 16px;border-top:1px solid var(--line);display:flex;gap:10px;align-items:flex-end;background:#fff;}
.qib-reply textarea{flex:1;border:1px solid var(--line);border-radius:10px;padding:9px 12px;font-size:13.5px;font-family:inherit;resize:vertical;min-height:44px;max-height:130px;}
.qib-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--ink3);font-size:13.5px;padding:40px;text-align:center;}
@media(max-width:820px){.qib{grid-template-columns:1fr;}.qib-list{max-height:280px;border-right:none;border-bottom:1px solid var(--line);}}
</style>

<h2>Sorular</h2>
<p class="sub">Öğrencilerin soruları kişi kişi gruplanır — en son yazan en üstte. Birine tıkla, o kişiyle tüm sohbet geçmişini gör ve yanıtla.</p>

<?php if (empty($convos)): ?>
  <div class="empty"><i class="ti ti-message-circle"></i><p>Henüz bir soru yok.</p></div>
<?php else: ?>
<div class="qib">
  <div class="qib-list">
    <?php foreach ($convos as $i => $c): $init = mb_strtoupper(mb_substr($c['name'] ?: '?', 0, 1)); ?>
    <div class="qib-item<?php echo $i === 0 ? ' active' : ''; ?>" data-cid="<?php echo esc_attr($c['cid']); ?>" onclick="qOpen(this)">
      <span class="st-av"><?php echo esc_html($init); ?></span>
      <div class="qib-im">
        <div class="qib-top"><span class="qib-name"><?php echo esc_html($c['name']); ?></span><span class="qib-time"><?php echo esc_html($fmt_time($c['last_at'])); ?></span></div>
        <div class="qib-course"><i class="ti ti-book" style="font-size:11px;"></i> <?php echo esc_html($c['course']); ?></div>
        <div class="qib-last"><?php echo esc_html(wp_trim_words($c['last'], 9)); ?></div>
      </div>
      <?php if ($c['pending'] > 0): ?><span class="qib-dot" title="Yanıt bekliyor"></span><?php endif; ?>
    </div>
    <?php endforeach; ?>
  </div>
  <div class="qib-thread">
    <div class="qib-thread-head" id="qHead"></div>
    <div class="qib-msgs" id="qMsgs"><div class="qib-empty">Soldan bir kişi seç.</div></div>
    <div class="qib-reply" id="qReplyBox" style="display:none;">
      <textarea id="qReplyText" placeholder="Yanıtını yaz…"></textarea>
      <button class="btn" onclick="qReply()"><i class="ti ti-send"></i> Yanıtla</button>
    </div>
  </div>
</div>

<script>
var Q_CONVOS = <?php echo wp_json_encode(array_column($convos, null, 'cid')); ?>;
var Q_NONCE = <?php echo wp_json_encode($nonce); ?>, Q_AJAX = <?php echo wp_json_encode(admin_url('admin-ajax.php')); ?>;
var Q_CUR = null;
function qEsc(s){var d=document.createElement('div');d.textContent=(s==null?'':s);return d.innerHTML;}
function qInit(s){s=(s||'?').trim();return (s.charAt(0)||'?').toUpperCase();}
function qDate(s){if(!s)return'';var d=new Date(s.replace(' ','T'));return isNaN(d)?'':d.toLocaleString('tr-TR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});}
function qOpen(el){
  document.querySelectorAll('.qib-item').forEach(function(n){n.classList.remove('active');});
  el.classList.add('active');
  var dot=el.querySelector('.qib-dot'); if(dot)dot.remove();
  qRender(el.getAttribute('data-cid'));
}
function qRender(cid){
  var c=Q_CONVOS[cid]; if(!c)return; Q_CUR=c;
  document.getElementById('qHead').innerHTML='<span class="st-av">'+qInit(c.name)+'</span><div><div style="font-weight:700;">'+qEsc(c.name)+'</div><div style="font-size:12px;color:var(--ink3);">'+qEsc(c.course)+' · '+qEsc(c.email||'')+'</div></div>';
  var box=document.getElementById('qMsgs'), html='';
  (c.messages||[]).forEach(function(m){
    html+='<div class="qmsg '+(m.who==='teacher'?'teacher':'student')+'"><div class="qmsg-bubble">'+qEsc(m.text).replace(/\n/g,'<br>')+'</div><div class="qmsg-meta">'+qEsc(m.who==='teacher'?(m.name||'Eğitmen'):(m.name||''))+' · '+qDate(m.at)+(m.lesson?' · <b>'+qEsc(m.lesson)+'</b>':'')+'</div></div>';
  });
  box.innerHTML=html||'<div class="qib-empty">Mesaj yok.</div>';
  box.scrollTop=box.scrollHeight;
  document.getElementById('qReplyBox').style.display='flex';
}
function qReply(){
  if(!Q_CUR)return;
  var ta=document.getElementById('qReplyText'), val=ta.value.trim(); if(!val)return;
  var btn=document.querySelector('#qReplyBox .btn'); btn.disabled=true;
  var body='action=oes_tp_answer_question&nonce='+encodeURIComponent(Q_NONCE)+'&chat_user_id='+Q_CUR.uid+'&chat_course_id='+Q_CUR.courseId+'&answer='+encodeURIComponent(val);
  fetch(Q_AJAX,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body,credentials:'same-origin'}).then(function(r){return r.json();}).then(function(res){
    btn.disabled=false;
    if(res&&res.success){
      Q_CUR.messages.push({who:'teacher',name:'Sen',text:val,at:''});
      ta.value=''; qRender(Q_CUR.cid);
    } else alert((res&&res.data)||'Yanıt gönderilemedi.');
  }).catch(function(){btn.disabled=false;alert('Bağlantı hatası.');});
}
/* Açılışta hangi sohbet? Push bildiriminden gelindiyse (?chat=uid_courseId)
   O sohbet; yoksa en üstteki (en son yazan). */
(function(){
  var want=(location.search.match(/[?&]chat=([^&#]+)/)||[])[1];
  var el=null;
  if(want){
    want=decodeURIComponent(want);
    el=document.querySelector('.qib-item[data-cid="'+want.replace(/"/g,'')+'"]');
    if(el && el.scrollIntoView) el.scrollIntoView({block:'nearest'});
  }
  if(!el) el=document.querySelector('.qib-item');
  // qRender DEĞİL qOpen: açılışta da "yanıt bekliyor" noktası düşsün ve satır
  // aktif görünsün (eskiden yalnızca tıklayınca oluyordu, açılışta duruyordu).
  if(el) qOpen(el);
})();
</script>
<?php endif; ?>
