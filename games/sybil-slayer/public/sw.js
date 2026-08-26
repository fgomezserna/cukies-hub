const SHELL_CACHE_PREFIX = 'treasure-hunt-shell';
const LEGACY_CACHE_PREFIX = 'treasure-hunt-static';
const ASSET_CACHE_NAME = 'treasure-hunt-assets-v1';
const CACHE_VERSION =
  new URL(self.location.href).searchParams.get('v') || 'dev';
const SHELL_CACHE_NAME = `${SHELL_CACHE_PREFIX}-${CACHE_VERSION}`;
const SCOPE_PATHNAME = new URL(self.registration.scope).pathname.replace(/\/$/, '');

function scopedPathname(pathname) {
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${SCOPE_PATHNAME}${normalizedPathname}` || '/';
}

function pathWithinScope(pathname) {
  if (!SCOPE_PATHNAME) return pathname;
  if (pathname === SCOPE_PATHNAME) return '/';
  return pathname.startsWith(`${SCOPE_PATHNAME}/`)
    ? pathname.slice(SCOPE_PATHNAME.length)
    : pathname;
}

const SCOPE_ROOT_PATHNAME = scopedPathname('/');
const URLS_TO_CACHE = [
  SCOPE_ROOT_PATHNAME,
  scopedPathname('/icon.png'),
  scopedPathname('/manifest.json')
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE_NAME)
      .then((cache) => cache.addAll(URLS_TO_CACHE))
      .catch((error) => {
        console.log('Service Worker install error:', error);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      const assetCache = await caches.open(ASSET_CACHE_NAME);

      // La versión anterior guardaba shell y assets en la misma caché ligada al
      // commit. Migrar los /assets ya descargados evita volver a pedir todos los
      // sprites justo después del despliegue que introduce esta separación.
      for (const cacheName of cacheNames) {
        if (!cacheName.startsWith(LEGACY_CACHE_PREFIX)) continue;
        const legacyCache = await caches.open(cacheName);
        const requests = await legacyCache.keys();

        for (const request of requests) {
          const requestUrl = new URL(request.url);
          if (
            requestUrl.origin !== self.location.origin ||
            !pathWithinScope(requestUrl.pathname).startsWith('/assets/')
          ) {
            continue;
          }

          if (await assetCache.match(request)) continue;
          const response = await legacyCache.match(request);
          if (response) {
            try {
              await assetCache.put(request, response);
            } catch {
              // Una cuota de caché limitada no debe impedir activar el worker.
            }
          }
        }
      }

      await Promise.all(
        cacheNames.map((cacheName) => {
          const isOldShell =
            cacheName.startsWith(SHELL_CACHE_PREFIX) &&
            cacheName !== SHELL_CACHE_NAME;
          const isLegacyCache = cacheName.startsWith(LEGACY_CACHE_PREFIX);
          return isOldShell || isLegacyCache
            ? caches.delete(cacheName)
            : Promise.resolve(false);
        }),
      );
    })(),
  );
  event.waitUntil(self.clients.claim());
});

function isStaticAsset(requestUrl) {
  return (
    requestUrl.origin === self.location.origin &&
    pathWithinScope(requestUrl.pathname).startsWith('/assets/')
  );
}

function isVersionedAppAsset(requestUrl) {
  return (
    requestUrl.origin === self.location.origin &&
    pathWithinScope(requestUrl.pathname).startsWith('/_next/static/')
  );
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(event.request);
  const networkResponse = fetch(
    event.request,
    cachedResponse ? undefined : { cache: 'reload' },
  )
    .then(async (response) => {
      if (response.ok && response.type === 'basic') {
        try {
          await cache.put(event.request, response.clone());
        } catch {
          // Servir la respuesta de red aunque el navegador no pueda persistirla.
        }
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
      const cache = await caches.open(SHELL_CACHE_NAME);
      try {
        await cache.put(SCOPE_ROOT_PATHNAME, response.clone());
      } catch {
        // La navegación de red sigue siendo válida aunque la caché esté llena.
      }
    }
    return response;
  } catch {
    return (await caches.match(SCOPE_ROOT_PATHNAME)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (isStaticAsset(requestUrl)) {
    event.respondWith(staleWhileRevalidate(event, ASSET_CACHE_NAME));
    return;
  }

  if (isVersionedAppAsset(requestUrl)) {
    event.respondWith(staleWhileRevalidate(event, SHELL_CACHE_NAME));
    return;
  }

  if (
    requestUrl.origin === self.location.origin &&
    event.request.mode === 'navigate'
  ) {
    event.respondWith(networkFirstNavigation(event.request));
  }
});
