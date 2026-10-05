// v2: el push llega vacío ("toque"); se consulta el estado y se muestra el texto real.
const ESTADO = 'https://aris.gilm.com.mx:5443/webhook/avisos-estado';
const GENERICO = 'Tienes una actualización de Perfiles LM';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

async function textoActual() {
  try {
    const sub = await self.registration.pushManager.getSubscription();
    if (!sub) return GENERICO;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const r = await fetch(ESTADO, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }), signal: ctrl.signal });
    clearTimeout(t);
    const j = await r.json();
    return (j.ok && j.ultimo && j.ultimo.texto) ? j.ultimo.texto : GENERICO;
  } catch (e) {
    return GENERICO;
  }
}

self.addEventListener('push', event => {
  event.waitUntil(textoActual().then(texto => self.registration.showNotification('Perfiles LM', {
    body: texto,
    tag: 'aviso-' + Date.now(),
    requireInteraction: true,
    vibrate: [200, 100, 200]
  })));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
