self.addEventListener('push', event => {
  let data = { title: 'Perfiles LM', body: 'Aviso de prueba' };
  try { if (event.data) data = event.data.json(); } catch (e) {}
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    tag: 'aviso-' + Date.now(),
    requireInteraction: true,
    vibrate: [200, 100, 200]
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('./'));
});
