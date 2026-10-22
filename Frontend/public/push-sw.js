// Loaded into the Workbox service worker via importScripts.
self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "Your doctor replied"
  const consultationId = data.consultation_id
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Open CareBridge to read the message.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: consultationId ? `consult-${consultationId}` : "carebridge",
      data: { url: consultationId ? `/app/consult/${consultationId}` : "/app/consults" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || "/app"
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url)
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
