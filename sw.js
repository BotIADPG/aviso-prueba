// Mi visita · service worker. El push llega vacío ("toque"): se consulta el estado y se muestra el texto real.
// iOS exige mostrar una notificación en cada push, por eso siempre sale una (la genérica si falla la consulta).
importScripts('config.js');
var GENERICO = 'Tienes una actualización de Perfiles LM';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

function textoActual() {
  return self.registration.pushManager.getSubscription().then(function (sub) {
    if (!sub) return GENERICO;
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 4000);
    return fetch(CONFIG.ESTADO, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }), signal: ctrl.signal
    }).then(function (r) { return r.json(); })   // el límite de 4 s cubre también la lectura del cuerpo
      .then(function (j) { clearTimeout(t); return (j.ok && j.ultimo && j.ultimo.texto) ? j.ultimo.texto : GENERICO; });
  }).catch(function () { return GENERICO; });
}

self.addEventListener('push', function (event) {
  event.waitUntil(textoActual().then(function (texto) {
    return self.registration.showNotification('Perfiles LM', {
      body: texto, icon: 'icono-192.png', badge: 'icono-192.png',
      tag: 'aviso-' + Date.now(), requireInteraction: true, vibrate: [200, 100, 200]
    });
  }).then(function () {
    return self.clients.matchAll({ type: 'window' }).then(function (cs) {
      cs.forEach(function (c) { c.postMessage('actualizar'); });
    });
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cs) {
    for (var i = 0; i < cs.length; i++) { if ('focus' in cs[i]) { cs[i].postMessage('actualizar'); return cs[i].focus(); } }
    return self.clients.openWindow('./');
  }));
});
