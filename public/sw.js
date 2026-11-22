/* Service worker de CERO HEALTH : reçoit les notifications Web Push de la messagerie.
   Il n'affiche que l'expéditeur (jamais le texte d'un message) et ne dit rien si l'application est déjà sous les yeux. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(data.title || 'Nouveau message', {
      body: data.body || '',
      tag: 'chat-' + (data.conversation_id == null ? 'x' : data.conversation_id),
      renotify: true,
      data: { conversationId: data.conversation_id == null ? null : String(data.conversation_id) },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const id = event.notification.data && event.notification.data.conversationId;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length > 0) {
      await windows[0].focus();
      windows[0].postMessage({ type: 'chat-open', conversationId: id });
    } else {
      await self.clients.openWindow(id ? '/#chat=' + id : '/');
    }
  })());
});
