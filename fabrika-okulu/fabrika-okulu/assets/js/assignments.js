/**
 * Görev/Görev Sistemi JavaScript
 */

(function ($) {
    'use strict';

    // ==================== Site İçi Bildirim & Onay (native alert/confirm yerine) ====================

    // Stilleri bir kez enjekte et
    (function injectOesUiStyles() {
        if (document.getElementById('oes-ui-styles')) return;
        var css = ''
            + '.oes-toast-wrap{position:fixed;top:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:10px;pointer-events:none}'
            + '.oes-toast{pointer-events:auto;min-width:260px;max-width:380px;background:#fff;border:1px solid #e2e8f0;border-left:4px solid #10b981;border-radius:10px;box-shadow:0 10px 30px rgba(2,6,23,.12);padding:14px 16px;display:flex;align-items:flex-start;gap:10px;font-size:14px;color:#1e293b;opacity:0;transform:translateX(20px);transition:opacity .25s ease,transform .25s ease;font-family:inherit}'
            + '.oes-toast.show{opacity:1;transform:translateX(0)}'
            + '.oes-toast.error{border-left-color:#ef4444}'
            + '.oes-toast.info{border-left-color:#3b82f6}'
            + '.oes-toast-ic{flex-shrink:0;width:20px;height:20px;margin-top:1px}'
            + '.oes-toast.success .oes-toast-ic{color:#10b981}.oes-toast.error .oes-toast-ic{color:#ef4444}.oes-toast.info .oes-toast-ic{color:#3b82f6}'
            + '.oes-toast-msg{flex:1;line-height:1.45}'
            + '.oes-cfm-ov{position:fixed;inset:0;z-index:999998;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s ease;padding:20px;font-family:inherit}'
            + '.oes-cfm-ov.show{opacity:1}'
            + '.oes-cfm{background:#fff;border-radius:16px;max-width:420px;width:100%;box-shadow:0 24px 60px rgba(2,6,23,.3);transform:scale(.94);transition:transform .2s ease;overflow:hidden}'
            + '.oes-cfm-ov.show .oes-cfm{transform:scale(1)}'
            + '.oes-cfm-body{padding:26px 24px 20px;text-align:center}'
            + '.oes-cfm-ic{width:52px;height:52px;border-radius:50%;background:#fef2f2;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#ef4444}'
            + '.oes-cfm-title{font-size:17px;font-weight:700;color:#0f172a;margin:0 0 8px}'
            + '.oes-cfm-text{font-size:14px;color:#64748b;line-height:1.5;margin:0}'
            + '.oes-cfm-actions{display:flex;gap:10px;padding:0 24px 24px}'
            + '.oes-cfm-btn{flex:1;padding:12px 16px;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;border:none;transition:all .15s ease;font-family:inherit}'
            + '.oes-cfm-cancel{background:#f1f5f9;color:#475569}.oes-cfm-cancel:hover{background:#e2e8f0}'
            + '.oes-cfm-ok{background:#ef4444;color:#fff}.oes-cfm-ok:hover{background:#dc2626}';
        var st = document.createElement('style');
        st.id = 'oes-ui-styles';
        st.textContent = css;
        document.head.appendChild(st);
    })();

    var OES_ICONS = {
        success: '<svg class="oes-toast-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg class="oes-toast-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        info: '<svg class="oes-toast-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    // Site içi bildirim (native alert yerine)
    function oesToast(message, type) {
        type = type || 'success';
        var $wrap = $('.oes-toast-wrap');
        if (!$wrap.length) {
            $wrap = $('<div class="oes-toast-wrap"></div>').appendTo('body');
        }
        var $t = $('<div class="oes-toast ' + type + '">' + (OES_ICONS[type] || OES_ICONS.info) +
            '<div class="oes-toast-msg"></div></div>');
        $t.find('.oes-toast-msg').text(message);
        $wrap.append($t);
        requestAnimationFrame(function () { $t.addClass('show'); });
        setTimeout(function () {
            $t.removeClass('show');
            setTimeout(function () { $t.remove(); }, 300);
        }, 3500);
    }

    // Site içi onay penceresi (native confirm yerine). Promise döner.
    function oesConfirm(opts) {
        opts = opts || {};
        var title = opts.title || 'Emin misiniz?';
        var text = opts.text || '';
        var okText = opts.okText || 'Evet, devam et';
        var cancelText = opts.cancelText || 'Vazgeç';

        return new Promise(function (resolve) {
            var $ov = $('<div class="oes-cfm-ov">' +
                '<div class="oes-cfm">' +
                  '<div class="oes-cfm-body">' +
                    '<div class="oes-cfm-ic"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>' +
                    '<h3 class="oes-cfm-title"></h3>' +
                    '<p class="oes-cfm-text"></p>' +
                  '</div>' +
                  '<div class="oes-cfm-actions">' +
                    '<button type="button" class="oes-cfm-btn oes-cfm-cancel"></button>' +
                    '<button type="button" class="oes-cfm-btn oes-cfm-ok"></button>' +
                  '</div>' +
                '</div>' +
              '</div>');

            $ov.find('.oes-cfm-title').text(title);
            $ov.find('.oes-cfm-text').text(text);
            $ov.find('.oes-cfm-ok').text(okText);
            $ov.find('.oes-cfm-cancel').text(cancelText);
            $('body').append($ov);
            requestAnimationFrame(function () { $ov.addClass('show'); });

            function close(result) {
                $ov.removeClass('show');
                setTimeout(function () { $ov.remove(); }, 220);
                resolve(result);
            }
            $ov.find('.oes-cfm-ok').on('click', function () { close(true); });
            $ov.find('.oes-cfm-cancel').on('click', function () { close(false); });
            $ov.on('click', function (e) { if (e.target === this) close(false); });
        });
    }

    // Global erişim (başka scriptler de kullanabilsin)
    window.oesToast = oesToast;
    window.oesConfirm = oesConfirm;

    // ==================== Admin İşlemleri ====================

    $(document).on('submit', '#oesAssignmentForm', function (e) {
        e.preventDefault();

        var $form = $(this);
        var $btn = $form.find('button[type="submit"]');

        $btn.prop('disabled', true).text('Kaydediliyor...');

        $.post(oesAssignments.ajaxUrl, {
            action: 'oes_save_assignment',
            nonce: oesAssignments.nonce,
            assignment_id: $form.find('[name="assignment_id"]').val(),
            course_id: $form.find('[name="course_id"]').val(),
            period_id: $form.find('[name="period_id"]').val(),
            title: $form.find('[name="title"]').val(),
            description: $form.find('[name="description"]').val(),
            due_date: $form.find('[name="due_date"]').val(),
            extra_days: $form.find('[name="extra_days"]').val(),
            max_score: $form.find('[name="max_score"]').val(),
            allow_file: $form.find('[name="allow_file"]').is(':checked') ? 1 : 0,
            allow_voice: $form.find('[name="allow_voice"]').is(':checked') ? 1 : 0,
            allow_text: $form.find('[name="allow_text"]').is(':checked') ? 1 : 0,
            status: $form.find('[name="status"]').val()
        }, function (res) {
            if (res.success) {
                window.location.href = res.data.redirect;
            } else {
                oesToast(res.data || 'Hata', 'error');
                $btn.prop('disabled', false).text('Kaydet');
            }
        });
    });

    $(document).on('change', '#assignmentCourse', function () {
        var courseId = $(this).val();
        var $period = $('#assignmentPeriod');

        if (!courseId) {
            $period.html('<option value="">Önce kurs seçin</option>');
            return;
        }

        $period.html('<option value="">Yükleniyor...</option>');

        $.post(oesAssignments.ajaxUrl, {
            action: 'oes_get_periods',
            nonce: oesAssignments.nonce,
            course_id: courseId
        }, function (res) {
            var html = '<option value="">Tüm Dönemler</option>';
            if (res.success && res.data.length) {
                res.data.forEach(function (p) {
                    html += '<option value="' + p.id + '">' + p.name + '</option>';
                });
            }
            $period.html(html);
        });
    });

    $(document).on('click', '.oes-delete-assignment', function () {
        var $btn = $(this);
        oesConfirm({
            title: 'Görevi sil',
            text: 'Bu görevi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.',
            okText: 'Evet, sil'
        }).then(function (ok) {
            if (!ok) return;
            $.post(oesAssignments.ajaxUrl, {
                action: 'oes_delete_assignment',
                nonce: oesAssignments.nonce,
                assignment_id: $btn.data('id')
            }, function (res) {
                if (res.success) {
                    $btn.closest('tr').fadeOut(300, function () { $(this).remove(); });
                    oesToast('Görev silindi.', 'success');
                } else {
                    oesToast(res.data || 'Silme başarısız.', 'error');
                }
            });
        });
    });

    $(document).on('click', '.oes-delete-submission', function () {
        var $btn = $(this);
        oesConfirm({
            title: 'Gönderimi sil',
            text: 'Bu gönderimi silmek istediğinizden emin misiniz? Öğrenci bu gönderimi kaybedecek.',
            okText: 'Evet, sil'
        }).then(function (ok) {
            if (!ok) return;
            $.post(oesAssignments.ajaxUrl, {
                action: 'oes_delete_submission',
                nonce: oesAssignments.nonce,
                submission_id: $btn.data('id')
            }, function (res) {
                if (res.success) {
                    $btn.closest('.oes-submission-card').fadeOut(300, function () { $(this).remove(); });
                    oesToast('Gönderim silindi.', 'success');
                } else {
                    oesToast(res.data || 'Silme başarısız.', 'error');
                }
            });
        });
    });

    $(document).on('submit', '.oes-grade-form', function (e) {
        e.preventDefault();
        var $form = $(this);

        $.post(oesAssignments.ajaxUrl, {
            action: 'oes_grade_submission',
            nonce: oesAssignments.nonce,
            submission_id: $form.data('submission-id'),
            score: $form.find('[name="score"]').val(),
            feedback: $form.find('[name="feedback"]').val()
        }, function (res) {
            if (res.success) location.reload();
        });
    });

    // ==================== Çoklu Dosya Yükleme ====================

    var uploadedFiles = [];
    var $uploadArea = $('#uploadArea');
    var $fileInput = $('#assignmentFile');
    var $filesList = $('#filesList');

    // Mevcut dosyaları yükle
    if ($('#existingFiles').length) {
        try {
            var existing = JSON.parse($('#existingFiles').val() || '[]');
            uploadedFiles = existing;
            renderFilesList();
        } catch (e) { }
    }

    if ($uploadArea.length) {
        $uploadArea.on('click', function () {
            $fileInput.trigger('click');
        });

        $uploadArea.on('dragover dragenter', function (e) {
            e.preventDefault();
            $(this).addClass('dragover');
        }).on('dragleave drop', function (e) {
            e.preventDefault();
            $(this).removeClass('dragover');
        }).on('drop', function (e) {
            var files = e.originalEvent.dataTransfer.files;
            for (var i = 0; i < files.length; i++) {
                handleFileUpload(files[i]);
            }
        });

        $fileInput.on('change', function () {
            for (var i = 0; i < this.files.length; i++) {
                handleFileUpload(this.files[i]);
            }
            this.value = '';
        });

        $(document).on('click', '.oes-remove-file', function () {
            var idx = $(this).data('idx');
            uploadedFiles.splice(idx, 1);
            renderFilesList();
        });
    }

    function handleFileUpload(file) {
        if (file.size > 10 * 1024 * 1024) {
            oesToast('Dosya 10MB\'dan büyük olamaz: ' + file.name, 'error');
            return;
        }

        var formData = new FormData();
        formData.append('action', 'oes_upload_assignment_file');
        formData.append('nonce', oesAssignments.nonce);
        formData.append('file', file);

        // Geçici göster
        var tempIdx = uploadedFiles.length;
        uploadedFiles.push({ name: file.name, url: '', uploading: true });
        renderFilesList();

        $.ajax({
            url: oesAssignments.ajaxUrl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (res) {
                if (res.success) {
                    uploadedFiles[tempIdx] = { name: res.data.name, url: res.data.url };
                } else {
                    uploadedFiles.splice(tempIdx, 1);
                    oesToast(res.data || 'Yükleme hatası', 'error');
                }
                renderFilesList();
            },
            error: function () {
                uploadedFiles.splice(tempIdx, 1);
                renderFilesList();
                oesToast('Yükleme hatası.', 'error');
            }
        });
    }

    function renderFilesList() {
        if (!$filesList.length) return;

        var html = '';
        uploadedFiles.forEach(function (f, i) {
            if (f.uploading) {
                html += '<div class="oes-file-item uploading"><span>⏳ ' + f.name + '</span></div>';
            } else {
                html += '<div class="oes-file-item">';
                html += '<a href="' + f.url + '" target="_blank">' + f.name + '</a>';
                html += '<button type="button" class="oes-remove-file" data-idx="' + i + '">×</button>';
                html += '</div>';
            }
        });
        $filesList.html(html);
        $('#filesData').val(JSON.stringify(uploadedFiles));
    }

    // ==================== Çoklu Ses Kaydı ====================

    var audioContext = null;
    var analyser = null;
    var mediaRecorder = null;
    var audioChunks = [];
    var animationId = null;
    var recordingTimer = null;
    var recordingSeconds = 0;
    var audioStream = null;
    var uploadedVoices = [];

    var $recordBtn = $('#recordBtn');
    var $waveCanvas = $('#waveCanvas');
    var $recordTime = $('#recordTime');
    var $voicesList = $('#voicesList');

    // Mevcut sesleri yükle
    if ($('#existingVoices').length) {
        try {
            var existingV = JSON.parse($('#existingVoices').val() || '[]');
            uploadedVoices = existingV;
            renderVoicesList();
        } catch (e) { }
    }

    if ($recordBtn.length) {
        $recordBtn.on('click', function () {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                stopRecording();
            } else {
                startRecording();
            }
        });

        $(document).on('click', '.oes-remove-voice', function () {
            var idx = $(this).data('idx');
            uploadedVoices.splice(idx, 1);
            renderVoicesList();
        });
    }

    function startRecording() {
        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(function (stream) {
                audioStream = stream;

                // Audio Context ve Analyser (dalga için)
                try {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    analyser = audioContext.createAnalyser();
                    var source = audioContext.createMediaStreamSource(stream);
                    source.connect(analyser);
                    analyser.fftSize = 256;
                } catch (e) {
                    console.log('AudioContext error:', e);
                }

                // MediaRecorder - basit kullan
                try {
                    mediaRecorder = new MediaRecorder(stream);
                } catch (e) {
                    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
                }

                audioChunks = [];

                mediaRecorder.ondataavailable = function (e) {
                    if (e.data && e.data.size > 0) {
                        audioChunks.push(e.data);
                    }
                };

                mediaRecorder.onstop = function () {
                    // Süreyi DURDURMA anında sabitle (sonraki kayıt sıfırlamadan etkilenmesin)
                    var capturedDuration = recordingSeconds;

                    // Blob oluştur
                    var mimeType = mediaRecorder.mimeType || 'audio/webm';
                    var audioBlob = new Blob(audioChunks, { type: mimeType });

                    // Önce LOCAL URL ile göster (anında dinlenebilir)
                    var localUrl = URL.createObjectURL(audioBlob);
                    console.log('Local blob URL:', localUrl, 'Size:', audioBlob.size);

                    // Geçici olarak local URL ile ekle
                    var tempIdx = uploadedVoices.length;
                    uploadedVoices.push({ url: localUrl, duration: capturedDuration, uploading: false, isLocal: true });
                    renderVoicesList();

                    // Sonra arka planda upload et
                    uploadVoiceRecording(audioBlob, tempIdx, capturedDuration);
                };

                mediaRecorder.start();
                console.log('Recording started, state:', mediaRecorder.state);

                // UI
                $recordBtn.addClass('recording').find('.oes-rec-text').text('Durdur');
                if ($waveCanvas.length) {
                    $waveCanvas.show();
                    drawWave();
                }
                $recordTime.show();

                // Timer
                recordingSeconds = 0;
                updateRecordTime();
                recordingTimer = setInterval(function () {
                    recordingSeconds++;
                    updateRecordTime();
                    if (recordingSeconds >= 300) stopRecording();
                }, 1000);
            })
            .catch(function (err) {
                oesToast('Mikrofon erişimi reddedildi: ' + err.message, 'error');
                console.error('Mic error:', err);
            });
    }

    function stopRecording() {
        console.log('Stopping recording...');

        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }

        if (audioStream) {
            audioStream.getTracks().forEach(function (track) { track.stop(); });
            audioStream = null;
        }

        if (audioContext && audioContext.state !== 'closed') {
            audioContext.close();
            audioContext = null;
        }

        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }

        clearInterval(recordingTimer);

        $recordBtn.removeClass('recording').find('.oes-rec-text').text('Yeni Kayıt');
        if ($waveCanvas.length) $waveCanvas.hide();
        $recordTime.hide();
    }

    function drawWave() {
        if (!analyser || !$waveCanvas.length) return;

        var canvas = $waveCanvas[0];
        var canvasCtx = canvas.getContext('2d');
        var bufferLength = analyser.frequencyBinCount;
        var dataArray = new Uint8Array(bufferLength);
        var WIDTH = canvas.width;
        var HEIGHT = canvas.height;

        function draw() {
            if (!analyser) return;
            animationId = requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            canvasCtx.fillStyle = '#f3f4f6';
            canvasCtx.fillRect(0, 0, WIDTH, HEIGHT);

            var barWidth = (WIDTH / bufferLength) * 2.5;
            var x = 0;

            for (var i = 0; i < bufferLength; i++) {
                var barHeight = (dataArray[i] / 255) * HEIGHT;
                canvasCtx.fillStyle = '#10b981';
                canvasCtx.fillRect(x, HEIGHT - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        }
        draw();
    }

    function updateRecordTime() {
        var mins = Math.floor(recordingSeconds / 60);
        var secs = recordingSeconds % 60;
        $recordTime.text((mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs);
    }

    function uploadVoiceRecording(blob, existingIdx, capturedDuration) {
        console.log('Uploading voice, blob size:', blob.size);
        // onstop anında sabitlenen süreyi kullan; yoksa anlık değere düş
        var durSec = (typeof capturedDuration === 'number') ? capturedDuration : recordingSeconds;

        if (blob.size < 1000) {
            oesToast('Ses kaydı çok kısa veya boş.', 'error');
            if (existingIdx !== undefined) {
                uploadedVoices.splice(existingIdx, 1);
                renderVoicesList();
            }
            return;
        }

        var formData = new FormData();
        formData.append('action', 'oes_upload_voice_recording');
        formData.append('nonce', oesAssignments.nonce);
        formData.append('voice', blob, 'recording.webm');

        // Eğer existingIdx varsa, o item'ı güncelle
        var tempIdx = existingIdx;
        if (tempIdx === undefined) {
            tempIdx = uploadedVoices.length;
            uploadedVoices.push({ url: '', uploading: true, duration: durSec });
            renderVoicesList();
        }

        $.ajax({
            url: oesAssignments.ajaxUrl,
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function (res) {
                console.log('Upload response:', res);
                $recordBtn.prop('disabled', false).find('.oes-rec-text').text('Yeni Kayıt');

                if (res.success && res.data && res.data.url) {
                    // Local URL'yi server URL ile değiştir
                    var oldItem = uploadedVoices[tempIdx];
                    uploadedVoices[tempIdx] = {
                        url: res.data.url,
                        duration: oldItem ? oldItem.duration : durSec,
                        isLocal: false
                    };
                    console.log('Voice uploaded successfully:', res.data.url);
                    // Sadece JSON'ı güncelle, audio player'ı değiştirme (zaten çalışıyor)
                    $('#voicesData').val(JSON.stringify(uploadedVoices));
                } else {
                    console.error('Upload failed:', res);
                    // Upload başarısız olsa bile local URL ile dinlenebilir
                    // Ama gönderimde sorun olur, kullanıcıyı uyar
                    oesToast('Ses yüklenemedi. Lütfen tekrar deneyin.', 'error');
                }
            },
            error: function (xhr, status, error) {
                console.error('Upload error:', status, error);
                $recordBtn.prop('disabled', false).find('.oes-rec-text').text('Yeni Kayıt');
                oesToast('Yükleme hatası: ' + error, 'error');
            }
        });
    }

    function renderVoicesList() {
        if (!$voicesList.length) return;

        var html = '';
        uploadedVoices.forEach(function (v, i) {
            if (v.uploading) {
                html += '<div class="oes-voice-item uploading"><span>⏳ Yükleniyor...</span></div>';
            } else if (v.url) {
                var mins = Math.floor((v.duration || 0) / 60);
                var secs = (v.duration || 0) % 60;
                var durText = (mins < 10 ? '0' : '') + mins + ':' + (secs < 10 ? '0' : '') + secs;

                html += '<div class="oes-voice-item">';
                html += '<audio controls preload="auto" src="' + v.url + '"></audio>';
                html += '<span class="oes-voice-dur">' + durText + '</span>';
                html += '<button type="button" class="oes-remove-voice" data-idx="' + i + '">×</button>';
                html += '</div>';
            }
        });
        $voicesList.html(html);
        $('#voicesData').val(JSON.stringify(uploadedVoices));

        // Audio elementlerini yükle
        $voicesList.find('audio').each(function () {
            this.load();
        });
    }

    // ==================== Konuşarak Yazma ====================

    var recognition = null;
    var $speechBtn = $('#oesSpeechBtn');
    var $textarea = $('#submissionText');

    if ($speechBtn.length && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
        var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'tr-TR';
        recognition.continuous = true;
        recognition.interimResults = true;

        var finalTranscript = '';

        recognition.onstart = function () {
            $speechBtn.addClass('active').text('Dinleniyor...');
            finalTranscript = $textarea.val();
        };

        recognition.onend = function () {
            $speechBtn.removeClass('active').text('Sesle Yaz');
        };

        recognition.onresult = function (event) {
            var interimTranscript = '';
            for (var i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            $textarea.val(finalTranscript + interimTranscript);
        };

        $speechBtn.on('click', function () {
            if ($speechBtn.hasClass('active')) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
    } else if ($speechBtn.length) {
        $speechBtn.hide();
    }

    // ==================== Görev Gönderme ====================

    $(document).on('submit', '#oesSubmissionForm', function (e) {
        e.preventDefault();

        var $form = $(this);
        var $btn = $('#submitBtn');

        var text = $form.find('[name="submission_text"]').val() || '';
        var filesJson = $('#filesData').val() || '[]';
        var voicesJson = $('#voicesData').val() || '[]';

        var files = [];
        var voices = [];
        try { files = JSON.parse(filesJson); } catch (e) { }
        try { voices = JSON.parse(voicesJson); } catch (e) { }

        if (!text.trim() && files.length === 0 && voices.length === 0) {
            oesToast('Lütfen en az bir yanıt gönderin.', 'info');
            return;
        }

        $btn.prop('disabled', true).text('Gönderiliyor...');

        $.post(oesAssignments.ajaxUrl, {
            action: 'oes_submit_assignment',
            nonce: oesAssignments.nonce,
            assignment_id: $form.data('assignment-id'),
            submission_text: text,
            files_json: filesJson,
            voices_json: voicesJson
        }, function (res) {
            if (res.success) {
                oesToast('Yanıtınız başarıyla gönderildi.', 'success');
                setTimeout(function () { location.reload(); }, 1200);
            } else {
                oesToast(res.data || 'Bir hata oluştu.', 'error');
                $btn.prop('disabled', false).text('Gönder');
            }
        });
    });


    // ==================== WHISPER WASM TRANSKRİPT ====================

    // Ses URL'sinden hash oluştur (unique ID için)
    function hashCode(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    $(document).on('click', '.oes-transcribe-btn', function () {
        const $btn = $(this);
        const submissionId = parseInt($btn.data('submission-id'));
        const voiceIndex = parseInt($btn.data('voice-index'));
        const audioUrl = $btn.data('audio-url');

        // Ses URL'sinden unique hash oluştur (ses değişirse farklı olur!)
        const audioHash = hashCode(audioUrl);

        // Div ID'si (hash OLMADAN - template'teki ile aynı)
        const baseResultDiv = 'transcript-' + submissionId + '-' + voiceIndex;
        let $result = $('#' + baseResultDiv);

        // Eğer div yoksa (ilk kez), oluştur
        if ($result.length === 0) {
            $btn.after('<div id="' + baseResultDiv + '" style="display:none"></div>');
            $result = $('#' + baseResultDiv);
        }

        console.log('🎤 Transkript başlatıldı:', { submissionId, voiceIndex, audioUrl, audioHash });

        // Eğer zaten yüklüyse göster/gizle
        if ($result.data('loaded') && $result.data('audio-hash') === audioHash) {
            $result.slideToggle();
            $btn.text($result.is(':visible') ? '🔼 Gizle' : '📝 Transkript');
            return;
        }

        // Ses değiştiyse (farklı hash) veya ilk kez yükleniyor
        // Önce veritabanında var mı kontrol et
        checkTranscript(submissionId, voiceIndex, audioHash, function (transcript) {
            if (transcript) {
                console.log('✅ Veritabanından geldi');
                showTranscript($result, $btn, transcript, audioHash, true);
            } else {
                console.log('🧠 Whisper ile oluşturuluyor...');
                createTranscript($btn, submissionId, voiceIndex, audioHash, audioUrl, $result);
            }
        });
    });

    function checkTranscript(submissionId, voiceIndex, audioHash, callback) {
        $.post(oesAssignments.ajaxUrl, {
            action: 'oes_get_transcript',
            nonce: oesAssignments.nonce,
            submission_id: submissionId,
            voice_index: voiceIndex,
            audio_hash: audioHash
        })
            .done(function (res) {
                if (res.success && res.data.transcript) {
                    callback(res.data.transcript);
                } else {
                    callback(null);
                }
            })
            .fail(function () {
                callback(null);
            });
    }

    function showTranscript($result, $btn, transcript, audioHash, fromCache) {
        const html =
            '<div style="background:#fff;padding:16px;border:1px solid #e2e8f0;border-radius:8px;margin-top:12px">' +
            '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">' +
            '<strong style="color:#1e293b;font-size:14px">📝 Metin Dökümü</strong>' +
            (fromCache ?
                '<span style="font-size:11px;color:#10b981;background:#d1fae5;padding:4px 8px;border-radius:4px">✓ Kaydedildi</span>' :
                '<span style="font-size:11px;color:#2563eb;background:#dbeafe;padding:4px 8px;border-radius:4px">✓ Yeni</span>') +
            '</div>' +
            '<p style="margin:0;color:#334155;font-size:14px;line-height:1.7;white-space:pre-wrap">' +
            transcript +
            '</p>' +
            '</div>';

        $result.html(html).data('loaded', true).data('audio-hash', audioHash).slideDown();
        $btn.prop('disabled', false).text('🔼 Gizle');
    }

    async function createTranscript($btn, submissionId, voiceIndex, audioHash, audioUrl, $result) {
        try {
            $btn.prop('disabled', true).html('⏳ Hazırlanıyor...');

            $btn.html('📥 Ses indiriliyor...');
            console.log('📥 Ses indiriliyor:', audioUrl);

            const response = await fetch(audioUrl);
            if (!response.ok) throw new Error('Ses dosyası indirilemedi');

            const arrayBuffer = await response.arrayBuffer();
            console.log('✅ Ses indirildi:', arrayBuffer.byteLength, 'bytes');

            $btn.html('🔄 Ses hazırlanıyor...');
            console.log('🔄 Decode başlıyor...');

            const audioData = await decodeAudio(arrayBuffer);
            console.log('✅ Decode tamamlandı:', audioData.length, 'samples');

            $btn.html('🧠 AI yükleniyor... (60-90sn)');
            console.log('🧠 Whisper yükleniyor...');

            const { pipeline } = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0');

            // whisper-small kullan (daha iyi metin anlama!)
            const transcriber = await pipeline(
                'automatic-speech-recognition',
                'Xenova/whisper-small',
                { quantized: true }
            );

            console.log('✅ Whisper yüklendi');

            $btn.html('🎤 Metne çevriliyor... (2-3 dk)');
            console.log('🎤 Transkript oluşturuluyor...');

            const result = await transcriber(audioData, {
                language: 'turkish',
                task: 'transcribe',
                return_timestamps: false,
                chunk_length_s: 30,
                stride_length_s: 5
            });

            const transcript = result.text || '';
            console.log('✅ Transkript:', transcript.substring(0, 100) + '...');

            if (!transcript.trim()) {
                throw new Error('Ses kaydında konuşma tespit edilemedi');
            }

            $btn.html('💾 Kaydediliyor...');
            console.log('💾 Kaydediliyor...');

            await saveTranscript(submissionId, voiceIndex, audioHash, transcript.trim());

            console.log('✅ Başarılı!');
            showTranscript($result, $btn, transcript.trim(), audioHash, false);

        } catch (error) {
            console.error('❌ HATA:', error);
            oesToast('Hata: ' + error.message + ' — Lütfen sayfayı yenileyin ve tekrar deneyin.', 'error');
            $btn.prop('disabled', false).text('📝 Transkript');
        }
    }

    async function decodeAudio(arrayBuffer) {
        // SADECE OfflineAudioContext kullan - HİÇ SES ÇIKMAZ!
        // İlk önce ses süresini bulmak için geçici decode
        const tempOfflineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            1, // mono
            1, // minimal length
            16000 // sample rate
        );

        let tempBuffer;
        try {
            // ArrayBuffer'ı kopyala (slice ile)
            tempBuffer = await tempOfflineCtx.decodeAudioData(arrayBuffer.slice(0));
        } catch (e) {
            throw new Error('Ses formatı desteklenmiyor');
        }

        const duration = tempBuffer.duration;
        const sampleRate = 16000;
        const length = Math.ceil(duration * sampleRate);

        console.log('Ses süresi:', duration, 'saniye, samples:', length);

        // Gerçek decode için yeni OfflineAudioContext
        const offlineCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
            1, // mono
            length,
            sampleRate
        );

        const buffer = await offlineCtx.decodeAudioData(arrayBuffer);

        // Mono kanala çevir
        let audioData;
        if (buffer.numberOfChannels === 1) {
            audioData = buffer.getChannelData(0);
        } else {
            const left = buffer.getChannelData(0);
            const right = buffer.getChannelData(1);
            audioData = new Float32Array(left.length);
            for (let i = 0; i < left.length; i++) {
                audioData[i] = (left[i] + right[i]) / 2;
            }
        }

        return audioData;
    }

    function saveTranscript(submissionId, voiceIndex, audioHash, transcript) {
        return new Promise((resolve, reject) => {
            $.post(oesAssignments.ajaxUrl, {
                action: 'oes_save_transcript',
                nonce: oesAssignments.nonce,
                submission_id: submissionId,
                voice_index: voiceIndex,
                audio_hash: audioHash,
                transcript: transcript
            })
                .done(function (res) {
                    if (res.success) {
                        resolve();
                    } else {
                        reject(new Error(res.data || 'Kayıt hatası'));
                    }
                })
                .fail(function (xhr, status, error) {
                    reject(new Error('Sunucu hatası: ' + error));
                });
        });
    }

})(jQuery);