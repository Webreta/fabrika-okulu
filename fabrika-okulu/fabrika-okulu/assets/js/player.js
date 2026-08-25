/* ============================================================
   Fabrika Okulu — Player motoru
   no-fast-forward · hız 1x/1.5x/2x · resume · otomatik tamamlama
   ============================================================ */
(function () {
  'use strict';
  var CFG = window.OESP || {};
  function $(s, r) { return (r || document).querySelector(s); }
  function post(action, data) {
    var body = 'action=' + action + '&nonce=' + encodeURIComponent(CFG.nonce);
    for (var k in data) body += '&' + k + '=' + encodeURIComponent(data[k]);
    return fetch(CFG.ajax, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, credentials: 'same-origin' }).then(function (r) { return r.json(); });
  }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var m = Math.floor(s / 60), ss = s % 60; return m + ':' + (ss < 10 ? '0' : '') + ss; }

  /* ---------- Header dropdown / mobil ---------- */
  window.toggleUser = function (e) { e.stopPropagation(); var m = $('#userMenu'); if (m) m.classList.toggle('open'); };
  document.addEventListener('click', function (e) { if (!e.target.closest('#userMenu')) { var m = $('#userMenu'); if (m) m.classList.remove('open'); } });

  /* ---------- Müfredat akordeon ---------- */
  window.toggleMod = function (btn) { btn.parentElement.classList.toggle('open'); };

  /* ---------- Sekmeler ---------- */
  window.setTab = function (btn, id) {
    var tabs = btn.parentElement.querySelectorAll('.ltab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('active');
    btn.classList.add('active');
    var panes = document.querySelectorAll('.ltab-pane');
    for (var j = 0; j < panes.length; j++) panes[j].hidden = (panes[j].id !== id);
    if (id === 'tab-qa') loadQA();
  };

  /* ============================================================
     VIDEO MOTORU
     ============================================================ */
  var V = null; // adaptör
  var watchedMax = 0, duration = 0, curTime = 0, lastVol = 1;
  // Önizlemede video serbest gezilir (ileri sarma yasağı yok) — eğitmen hatayı arıyor
  var completed = !!CFG.lessonDone || !!CFG.preview, marked = !!CFG.lessonDone;
  var posKey = CFG.lesson ? ('oesp_pos_' + CFG.courseId + '_' + CFG.lesson.key) : null;
  var savedPos = 0;
  try { if (posKey) savedPos = parseFloat(localStorage.getItem(posKey)) || 0; } catch (e) {}

  var screen = $('#pvScreen'), elBar = $('#pvBar'), elWatched = $('#pvWatched'), elKnob = $('#pvKnob'),
      elTime = $('#pvTime'), elPlay = $('#pvPlay'), elPP = $('#pvPP'), elFwd = $('#pvFwd10');

  function savePos(t) { try { if (posKey) localStorage.setItem(posKey, String(Math.floor(t))); } catch (e) {} }
  function maxSeek() { return completed ? duration : watchedMax; } // ileri: sadece izlenen yere kadar
  function updateBar(t) {
    if (duration > 0 && elWatched && elKnob) { var pc = Math.min(100, (t / duration) * 100); elWatched.style.width = pc + '%'; elKnob.style.left = pc + '%'; }
    if (elTime) elTime.textContent = fmt(t) + ' / ' + fmt(duration);
  }
  function updateFwd() { if (elFwd) elFwd.classList.toggle('dim', !(curTime < maxSeek() - 0.6)); } // ileri gidilemiyorsa sönük
  function doSeek(target) {
    if (!V || !duration) return;
    target = Math.max(0, Math.min(target, maxSeek()));
    V.seek(target); curTime = target; updateBar(target); updateFwd();
  }
  function setVol(x) {
    x = Math.max(0, Math.min(1, x));
    if (V && V.vol) V.vol(x);
    if (x > 0) lastVol = x;
    var vr = $('#pvVolBar'); if (vr) vr.value = Math.round(x * 100);
    var mb = $('#pvMute'); if (mb) { var ic = mb.querySelector('i'); if (ic) ic.className = 'ti ' + (x === 0 ? 'ti-volume-off' : (x < 0.5 ? 'ti-volume-2' : 'ti-volume')); }
  }

  // Oynatma durumunu tek yerden yönet: kontrol ikonu (üçgen ↔ duraklat) + ekran sınıfı
  function setPlaying(on) {
    if (screen) { screen.classList.toggle('playing', !!on); screen.classList.toggle('paused', !on); }
    if (elPP) { var i = elPP.querySelector('i'); if (i) i.className = 'ti ' + (on ? 'ti-player-pause-filled' : 'ti-player-play-filled'); }
  }

  function onTick(t, d) {
    if (d && d !== duration) duration = d;
    if (t > watchedMax) watchedMax = t; // ileriye ancak izleyerek gidilir
    curTime = t;
    setPlaying(true);
    updateBar(t); updateFwd();
    savePos(t);
    // Otomatik tamamlama (≥ %90)
    if (!marked && duration > 0 && t >= duration * 0.9) { markComplete(); }
  }
  function onEnd() { markComplete(); autoAdvance(); }

  // Video bitince 3-2-1 sayıp sıradaki içeriğe geç (kilitli/son içerikse geçmez)
  var advancing = false;
  function autoAdvance(href) {
    if (advancing) return;
    href = href || (CFG.nextUrl || '');
    if (!href) { var nb = document.querySelector('.lh-actions a.btn:not(.ghost)'); href = nb && nb.getAttribute('href'); }
    if (!href) return;
    advancing = true;
    var ov = document.createElement('div'); ov.className = 'pv-next-ov';
    ov.innerHTML = '<div class="pv-next-card"><i class="ti ti-player-track-next"></i><div class="pv-next-t">Sıradaki içeriğe yönlendiriliyorsun</div><div class="pv-next-c" id="pvNextC">3</div><button type="button" class="pv-next-cancel" id="pvNextCancel">İptal et</button></div>';
    document.body.appendChild(ov);
    var n = 3, tid = setInterval(function () {
      n--; var c = $('#pvNextC'); if (c) c.textContent = n;
      if (n <= 0) { clearInterval(tid); location.href = href; }
    }, 1000);
    var cx = $('#pvNextCancel');
    if (cx) cx.addEventListener('click', function () { clearInterval(tid); advancing = false; if (ov.parentNode) ov.parentNode.removeChild(ov); });
  }

  function markComplete() {
    if (marked || !CFG.lesson) return;
    // Önizleme (eğitmen): ilerleme yazılmaz — sunucu zaten reddederdi ve
    // başarısız istek her karede yeniden denenirdi.
    if (CFG.preview) {
      marked = true; completed = true;
      var apd = $('#autoDone');
      if (apd) { apd.classList.add('done'); apd.innerHTML = '<i class="ti ti-eye"></i> <span>Önizleme — ilerleme <b>kaydedilmez</b>.</span>'; }
      return;
    }
    marked = true;
    post('oes_mark_lesson_complete', { course_id: CFG.courseId, lesson_id: CFG.lesson.key }).then(function (res) {
      if (res && res.success) {
        completed = true; // artık videoda serbest gezinilebilir
        var ad = $('#autoDone');
        if (ad) { ad.classList.add('done'); ad.innerHTML = '<i class="ti ti-circle-check"></i> <span>Bu ders <b>tamamlandı</b> olarak işaretlendi.</span>'; }
        // İlerleme çubuğunu güncelle
        var pb = $('#cbProgBar'), pt = $('#cbProgTxt'), cp = $('#currBar'), cpp = $('#currProg');
        var p = res.data.progress;
        if (pb) pb.style.width = p + '%'; if (pt) pt.textContent = '%' + p;
        if (cp) cp.style.width = p + '%';
        if (cpp) cpp.textContent = res.data.completed + ' / ' + res.data.total + ' tamamlandı · %' + p;
        var ci = document.querySelector('.citem.active'); if (ci) ci.classList.add('done');
      } else {
        marked = false; // başarısız → sonraki tick/bitişte tekrar denenir
      }
    }).catch(function () { marked = false; });
  }

  // Kullanıcı çubuğa tıklayınca: sadece izlenen yere kadar (no-fast-forward)
  function barSeek(e) {
    if (!V || !duration) return;
    var rect = elBar.getBoundingClientRect();
    var ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    doSeek(ratio * duration); // no-fast-forward: doSeek izlenen yere kadar sınırlar
  }

  /* ---- Adaptörler ---- */
  function initHTML5() {
    var v = $('#oespVideo'); if (!v) return;
    V = {
      play: function () { v.play(); }, pause: function () { v.pause(); },
      seek: function (t) { v.currentTime = t; }, rate: function (r) { v.playbackRate = r; },
      vol: function (x) { v.volume = x; v.muted = (x === 0); }
    };
    v.addEventListener('loadedmetadata', function () {
      duration = v.duration || 0;
      if (completed) watchedMax = duration; // tamamlanmış ders → tüm videoda serbest gezinme
      if (savedPos > 2 && savedPos < duration) { v.currentTime = savedPos; if (savedPos > watchedMax) watchedMax = savedPos; }
      updateBar(v.currentTime); updateFwd();
    });
    v.addEventListener('timeupdate', function () { onTick(v.currentTime, v.duration); });
    v.addEventListener('ended', onEnd);
    v.addEventListener('play', function () { setPlaying(true); });
    v.addEventListener('pause', function () { setPlaying(false); });
    if (elPlay) elPlay.addEventListener('click', function () { v.play(); });
    if (elPP) elPP.addEventListener('click', function () { v.paused ? v.play() : v.pause(); });
  }

  function initYouTube() {
    var holder = $('#oespYT'); if (!holder) return;
    var tag = document.createElement('script'); tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = function () {
      var yt = new YT.Player('oespYT', {
        videoId: holder.getAttribute('data-vid'),
        playerVars: { controls: 0, rel: 0, modestbranding: 1, disablekb: 1, playsinline: 1 },
        events: {
          onReady: function () {
            duration = yt.getDuration() || 0;
            if (completed) watchedMax = duration; // tamamlanmış ders → tüm videoda serbest gezinme
            if (savedPos > 2 && savedPos < duration) { if (savedPos > watchedMax) watchedMax = savedPos; yt.seekTo(savedPos, true); }
            setInterval(function () {
              try { if (yt.getPlayerState() === 1) onTick(yt.getCurrentTime(), yt.getDuration()); } catch (e) {}
            }, 500);
          },
          onStateChange: function (ev) { if (ev.data === 0) onEnd(); else if (ev.data === 1) setPlaying(true); else if (ev.data === 2) setPlaying(false); }
        }
      });
      V = { play: function () { yt.playVideo(); }, pause: function () { yt.pauseVideo(); }, seek: function (t) { yt.seekTo(t, true); }, rate: function (r) { yt.setPlaybackRate(r); }, vol: function (x) { if (x === 0) yt.mute(); else { yt.unMute(); yt.setVolume(Math.round(x * 100)); } } };
      if (elPlay) elPlay.addEventListener('click', function () { yt.playVideo(); });
      if (elPP) elPP.addEventListener('click', function () { var s = yt.getPlayerState(); s === 1 ? yt.pauseVideo() : yt.playVideo(); });
    };
  }

  function initVimeo() {
    var ifr = $('#oespVimeo'); if (!ifr) return;
    var tag = document.createElement('script'); tag.src = 'https://player.vimeo.com/api/player.js';
    tag.onload = function () {
      var vp = new Vimeo.Player(ifr);
      V = { play: function () { vp.play(); }, pause: function () { vp.pause(); }, seek: function (t) { vp.setCurrentTime(t); }, rate: function (r) { vp.setPlaybackRate(r).catch(function(){}); }, vol: function (x) { vp.setVolume(x).catch(function(){}); } };
      vp.getDuration().then(function (d) { duration = d; if (completed) watchedMax = d; if (savedPos > 2 && savedPos < d) { if (savedPos > watchedMax) watchedMax = savedPos; vp.setCurrentTime(savedPos); } updateFwd(); });
      vp.on('timeupdate', function (d) { onTick(d.seconds, d.duration); });
      vp.on('play', function () { setPlaying(true); });
      vp.on('pause', function () { setPlaying(false); });
      vp.on('ended', onEnd);
      if (elPlay) elPlay.addEventListener('click', function () { vp.play(); });
      if (elPP) elPP.addEventListener('click', function () { vp.getPaused().then(function (p) { p ? vp.play() : vp.pause(); }); });
    };
    document.head.appendChild(tag);
  }

  if (CFG.lesson && CFG.lesson.videoType) {
    if (elBar) elBar.addEventListener('click', barSeek);
    // 10 sn geri/ileri (ileri sadece izlenen yere kadar)
    var back10 = $('#pvBack10'), fwd10 = $('#pvFwd10'), muteBtn = $('#pvMute'), volBar = $('#pvVolBar');
    if (back10) back10.addEventListener('click', function () { doSeek(curTime - 10); });
    if (fwd10) fwd10.addEventListener('click', function () { if (curTime < maxSeek() - 0.6) doSeek(curTime + 10); });
    if (volBar) volBar.addEventListener('input', function () { setVol(this.value / 100); });
    if (muteBtn) muteBtn.addEventListener('click', function () { var vr = $('#pvVolBar'); var cur = vr ? vr.value / 100 : 1; setVol(cur > 0 ? 0 : (lastVol || 1)); });
    // Tam ekran
    var fullBtn = $('#pvFull');
    if (fullBtn) fullBtn.addEventListener('click', function () {
      var el = document.querySelector('.pvideo') || screen; if (!el) return;
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      } else {
        (el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen || function () {}).call(el);
      }
    });
    document.addEventListener('fullscreenchange', function () {
      var i = fullBtn && fullBtn.querySelector('i'); if (i) i.className = 'ti ' + (document.fullscreenElement ? 'ti-minimize' : 'ti-maximize');
    });
    var speedBtns = document.querySelectorAll('.pv-speed button');
    for (var i = 0; i < speedBtns.length; i++) {
      speedBtns[i].addEventListener('click', function () {
        for (var j = 0; j < speedBtns.length; j++) speedBtns[j].classList.remove('active');
        this.classList.add('active');
        if (V) V.rate(parseFloat(this.getAttribute('data-rate')));
      });
    }
    if (CFG.lesson.videoType === 'youtube') initYouTube();
    else if (CFG.lesson.videoType === 'vimeo') initVimeo();
    else if (CFG.lesson.videoType === 'file') initHTML5();
  }

  /* ============================================================
     Q&A (Sorular)
     ============================================================ */
  var qaLoaded = false;
  function loadQA() {
    if (qaLoaded) return; qaLoaded = true;
    var list = $('#qaList'); if (!list) return;
    list.innerHTML = '<div class="qa-empty">Yükleniyor…</div>';
    post('oes_get_lesson_questions', { course_id: CFG.courseId }).then(function (res) {
      if (!res || !res.success || !res.data.length) { list.innerHTML = '<div class="qa-empty">Henüz soru sormadın. İlk soruyu sen sor!</div>'; return; }
      var html = '';
      res.data.forEach(function (q) {
        html += '<div class="qa-item"><div class="qa-q"><span class="qa-av">' + initials(CFG.userName) + '</span><div><div class="qa-name">Sen · <small>' + tdate(q.created_at) + '</small></div><div class="qa-txt">' + esc(q.question_text || q.question) + '</div></div></div>';
        (q.answers || []).forEach(function (a) {
          html += '<div class="qa-a"><span class="qa-av navy">' + initials(a.display_name || 'Eğitmen') + '</span><div><div class="qa-name">' + esc(a.display_name || 'Eğitmen') + ' <span class="qa-badge">Eğitmen</span> · <small>' + tdate(a.created_at) + '</small></div><div class="qa-txt">' + esc(a.answer) + '</div></div></div>';
        });
        html += '</div>';
      });
      list.innerHTML = html;
    }).catch(function () { list.innerHTML = '<div class="qa-empty">Sorular yüklenemedi.</div>'; });
  }
  window.submitQuestion = function () {
    var ta = $('#qaText'); if (!ta || !ta.value.trim()) return;
    var btn = $('#qaSend'); if (btn) btn.disabled = true;
    post('oes_submit_question', { course_id: CFG.courseId, lesson_key: (CFG.lesson ? CFG.lesson.key : ''), lesson_title: (CFG.lesson ? CFG.lesson.title : ''), question: ta.value.trim() }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res && res.success) { ta.value = ''; qaLoaded = false; loadQA(); }
      else alert((res && res.data) || 'Soru gönderilemedi.');
    });
  };
  function initials(s) { s = (s || '?').trim(); return (s.charAt(0) || '?').toUpperCase(); }
  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function tdate(s) { if (!s) return ''; var d = new Date(s.replace(' ', 'T')); return isNaN(d) ? '' : d.toLocaleDateString('tr-TR'); }

  /* ============================================================
     SINAV (quiz-view varsa)
     ============================================================ */
  window.pickOpt = function (el) {
    var opts = el.parentElement.querySelectorAll('.qz-opt');
    for (var i = 0; i < opts.length; i++) opts[i].classList.remove('selected');
    el.classList.add('selected');
    var r = el.querySelector('input'); if (r) r.checked = true;
  };
  var QZ = window.OESP_QUIZ;
  if (QZ) {
    var qzIdx = 0, qzAnswers = {};
    window.qzNext = function () { collectAnswer(); if (qzIdx < QZ.questions.length - 1) { qzIdx++; renderQ(); } else submitQuiz(); };
    window.qzPrev = function () { collectAnswer(); if (qzIdx > 0) { qzIdx--; renderQ(); } };
    function collectAnswer() {
      var sel = document.querySelector('#qzBody .qz-opt.selected');
      var q = QZ.questions[qzIdx];
      if (sel) qzAnswers[q.id] = sel.getAttribute('data-val');
      else { var ta = document.querySelector('#qzBody textarea'); if (ta) qzAnswers[q.id] = ta.value; }
    }
    function renderQ() {
      var q = QZ.questions[qzIdx];
      var body = $('#qzBody'); if (!body) return;
      var html = '<div class="qz-prog"><div class="qz-prog-bar"><div style="width:' + Math.round((qzIdx) / QZ.questions.length * 100) + '%"></div></div><span>Soru ' + (qzIdx + 1) + ' / ' + QZ.questions.length + '</span></div>';
      html += '<div class="qz-qtext">' + esc(q.text) + '</div>';
      if (q.type === 'open_ended') {
        html += '<textarea class="av-note" placeholder="Yanıtını yaz…">' + esc(qzAnswers[q.id] || '') + '</textarea>';
      } else {
        (q.options || []).forEach(function (opt, i) {
          var letter = String.fromCharCode(65 + i);
          var val = (q.type === 'true_false') ? opt.val : letter;
          var sel = (qzAnswers[q.id] === val) ? ' selected' : '';
          html += '<label class="qz-opt' + sel + '" data-val="' + val + '" onclick="pickOpt(this)"><input type="radio" name="qzq"' + (sel ? ' checked' : '') + '><span>' + esc(opt.label) + '</span></label>';
        });
      }
      body.innerHTML = html;
      var nb = $('#qzNextBtn'); if (nb) nb.innerHTML = (qzIdx === QZ.questions.length - 1) ? 'Sınavı bitir <i class="ti ti-check"></i>' : 'Sonraki <i class="ti ti-chevron-right"></i>';
    }
    function submitQuiz() {
      var btn = $('#qzNextBtn'); if (btn) btn.disabled = true;
      post('oes_player_submit_quiz', { quiz_id: QZ.id, answers: JSON.stringify(qzAnswers) }).then(function (res) {
        if (btn) btn.disabled = false;
        var body = $('#qzBody'), nav = $('#qzNav');
        if (nav) nav.style.display = 'none';
        if (!res || !res.success) { if (body) body.innerHTML = '<div class="qa-empty">' + ((res && res.data) || 'Gönderilemedi.') + '</div>'; return; }
        if (res.data.pending) {
          body.innerHTML = '<div class="qz-result"><i class="ti ti-clock" style="font-size:44px;color:var(--amber)"></i><div class="rlabel">Yanıtların alındı</div><p style="color:var(--ink3);font-size:13px;margin-top:6px;">Açık uçlu sorular değerlendirildikten sonra sonucun görünecek.</p></div>';
        } else {
          var e = res.data.earned, t = res.data.total;
          body.innerHTML = '<div class="qz-result"><div class="score-big" style="color:var(--navy)">' + e + '<small style="font-size:22px;color:var(--ink3)">/' + t + '</small></div><div class="rlabel">' + t + ' sorudan ' + e + ' doğru · Tamamlandı 🎉</div></div>';
        }
        // Sınav bitti → sıradaki içerik kilidi açılır (F5 gerekmez)
        if (CFG.nextUrl) {
          body.innerHTML += '<div style="text-align:center;margin-top:16px;"><a class="btn" href="' + CFG.nextUrl + '"><i class="ti ti-player-track-next"></i> Sıradaki içeriğe geç</a></div>';
          autoAdvance(CFG.nextUrl);
        }
      });
    }
    renderQ();
  }
})();
