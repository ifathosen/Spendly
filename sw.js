/* Spendly service worker v6 — offline shell + background reminders. No user data stored here. */
const CACHE = 'spendly-shell-v6';
const CORE = ['./', './index.html', './manifest.json', './icon.svg'];
const MSGS = [
  'কিগো 💚 কিছু খেয়েছ? খেয়ে থাকলে এন্ট্রিটা ভরে দাও না আমায়…',
  'তোমার রিয়ালগুলো কোথায় যাচ্ছে জানতে চাই 👀 আজকের হিসাবটা দাও না!',
  'আজ এখনো তোমার কোনো খবর নেই… 🥺 খরচ হলে আমায় জানাও না কেন?',
  'শুনো, হিসাব ছাড়া ভালোবাসা টেকে না 💌 একটা এন্ট্রি দাও!',
  'পকেট থেকে টাকা বের হলেই আমার কথা মনে পড়ে না, তাই না? 😌 হিসাবটা দাও!',
  'মিষ্টি করে বলছি 💖 আজকের হিসাবটা দিলে খুব খুশি হবো!',
  'তুমি এন্ট্রি দিলে আমার মন ভালো হয়ে যায় 💖 দাও না একটা!',
  'টাকা গেলো কোথায় না জানলে রাতে ঘুম আসে না আমার 😴 এন্ট্রি দাও!',
  'এক মিনিটই লাগবে! খরচটা লিখে দাও, আমি যত্নে রেখে দেবো 🤲',
  'ভালোবাসা মানে হিসাব রাখা 💖 আজকেরটা দিয়ে প্রমাণ করো!'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  if (url.origin === location.origin || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(caches.match(req).then(hit => {
      const net = fetch(req).then(r => { if (r && r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; }).catch(() => hit);
      return hit || net;
    }));
  }
});
self.addEventListener('periodicsync', e => {
  if (e.tag === 'spendly-reminder') {
    e.waitUntil(self.registration.showNotification('Spendly 💚', {
      body: MSGS[Math.floor(Math.random() * MSGS.length)],
      icon: 'icon.svg', badge: 'icon.svg', tag: 'spendly-reminder',
      data: { url: './index.html?go=cashout' }
    }));
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) { if ('focus' in w) { w.navigate(target); return w.focus(); } }
    return clients.openWindow(target);
  }));
});
