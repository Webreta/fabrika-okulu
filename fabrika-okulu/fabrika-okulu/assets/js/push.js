/**
 * OES Push — istemci: SW kaydı + izin + abonelik.
 * window.oesPush = { publicKey, ajaxUrl, nonce, swUrl, scope } gerektirir.
 */
(function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    if (!window.oesPush || !oesPush.publicKey) return;

    function urlB64(base64) {
        var pad = '='.repeat((4 - base64.length % 4) % 4);
        var b64 = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
        var raw = atob(b64), arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        return arr;
    }

    var regPromise = navigator.serviceWorker.register(oesPush.swUrl, { scope: oesPush.scope || '/' });
    // Her açılışta SW'yi proaktif güncelle (yeni sürüm/özellikler reinstall gerektirmesin)
    regPromise.then(function (reg) { try { reg.update(); } catch (e) {} });

    // Mevcut aboneliğin VAPID anahtarı, sunucudaki güncel anahtarla aynı mı?
    function keysMatch(existing, current) {
        if (!existing) return false;
        var e = new Uint8Array(existing);
        if (e.length !== current.length) return false;
        for (var i = 0; i < current.length; i++) if (e[i] !== current[i]) return false;
        return true;
    }

    function subscribe() {
        var appKey = urlB64(oesPush.publicKey);
        return regPromise.then(function (reg) {
            return reg.pushManager.getSubscription().then(function (sub) {
                // Abonelik var: anahtar güncelse kullan, değilse (eklenti yeniden kuruldu vb.) yenile
                if (sub) {
                    var cur = sub.options && sub.options.applicationServerKey;
                    if (keysMatch(cur, appKey)) return sub;
                    return sub.unsubscribe().then(function () {
                        return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
                    });
                }
                return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
            });
        }).then(function (sub) {
            if (!sub) return;
            var body = 'action=oes_push_subscribe&nonce=' + encodeURIComponent(oesPush.nonce) +
                '&subscription=' + encodeURIComponent(JSON.stringify(sub));
            return fetch(oesPush.ajaxUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body, credentials: 'same-origin' });
        }).catch(function () {});
    }

    // Hesap sayfasından çağrılabilir global fonksiyonlar
    window.oesPushEnable = function () {
        return Notification.requestPermission().then(function (p) {
            if (p === 'granted') { try { localStorage.removeItem('oes_push_dismiss'); } catch (e) {} return subscribe().then(function () { return 'granted'; }); }
            return p;
        });
    };
    window.oesPushState = function () { return Notification.permission; };

    if (Notification.permission === 'granted') {
        subscribe();
        return;
    }
    if (Notification.permission === 'denied') return;

    // default → kullanıcı jestiyle iste
    try { if (localStorage.getItem('oes_push_dismiss') === '1') return; } catch (e) {}

    function banner() {
        if (document.getElementById('oesPushBanner')) return;
        var b = document.createElement('div');
        b.id = 'oesPushBanner'; b.className = 'oesp-push-banner';
        b.innerHTML = '<i class="ti ti-bell"></i><div class="oesp-pb-txt"><strong>Bildirimleri aç</strong><span>Yeni görev, not ve mesajlardan anında haberdar ol.</span></div>' +
            '<button class="oesp-pb-yes" id="oesPushYes">Aç</button><button class="oesp-pb-no" id="oesPushNo" aria-label="Kapat">&times;</button>';
        document.body.appendChild(b);
        requestAnimationFrame(function () { b.classList.add('show'); });
        document.getElementById('oesPushYes').addEventListener('click', function () {
            Notification.requestPermission().then(function (p) { if (p === 'granted') subscribe(); });
            b.classList.remove('show'); setTimeout(function () { b.remove(); }, 300);
        });
        document.getElementById('oesPushNo').addEventListener('click', function () {
            b.classList.remove('show'); setTimeout(function () { b.remove(); }, 300);
            try { localStorage.setItem('oes_push_dismiss', '1'); } catch (e) {}
        });
    }
    setTimeout(banner, 2500);
})();
