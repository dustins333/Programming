// Web Push service worker for the PWA install (Add to Home Screen). Ported
// from the standalone Nutrition Tracker app's public/sw.js, which has run
// this exact push/notificationclick handling in production since 2026-07 —
// see CLAUDE.md's "Reuse the standalone app's Web Push implementation"
// section. Kova's static export has no /offline route, so the offline-page
// caching half of the original file is intentionally left out — this is
// push delivery only, not an offline-first shell.
const CACHE_NAME = "kova-web-push-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Kova Strength", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Kova Strength";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
