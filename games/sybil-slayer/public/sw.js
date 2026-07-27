const CACHE_PREFIX = 'treasure-hunt-static';
const CACHE_VERSION =
  new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `${CACHE_PREFIX}-${CACHE_VERSION}`;
const URLS_TO_CACHE = [
  '/',
  '/icon.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(URLS_TO_CACHE))
      .catch((error) => {
        console.log('Service Worker install error:', error);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
          return Promise.resolve(false);
        })
      );
    })
  );
  event.waitUntil(self.clients.claim());
});

function isStaticAsset(requestUrl) {
  return (
    requestUrl.origin === self.location.origin &&
    (
      requestUrl.pathname.startsWith('/assets/') ||
      requestUrl.pathname.startsWith('/_next/static/')
    )
  );
}

async function staleWhileRevalidate(event) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(event.request);
  const networkResponse = fetch(
    event.request,
    cachedResponse ? undefined : { cache: 'reload' },
  )
    .then(async (response) => {
      if (response.ok && response.type === 'basic') {
        await cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cachedResponse) {
    event.waitUntil(networkResponse);
    return cachedResponse;
  }

  return (await networkResponse) || Response.error();
}

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put('/', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('/')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (isStaticAsset(requestUrl)) {
    event.respondWith(staleWhileRevalidate(event));
    return;
  }

  if (
    requestUrl.origin === self.location.origin &&
    event.request.mode === 'navigate'
  ) {
    event.respondWith(networkFirstNavigation(event.request));
  }
});
