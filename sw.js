/* ============================================================
   DIA_D2026 — Service Worker v1.0
   Cache básico de archivos estáticos
   ============================================================ */

const CACHE_NAME = 'dia-d2026-v1';

// Archivos a cachear (los esenciales)
const ARCHIVOS_CACHE = [
  './',
  './index.html',
  './assets/css/base.css',
  './assets/css/components.css',
  './assets/css/layout.css',
  './assets/css/login.css',
  './assets/js/config.js',
  './assets/js/utils.js',
  './assets/js/cache.js',
  './assets/js/api.js',
  './assets/js/sync.js',
  './assets/js/auth.js',
  './assets/img/logo-lista1.png',
  './assets/img/icon-192.png',
  './assets/img/icon-512.png'
];

// Instalación: cachear archivos
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ARCHIVOS_CACHE).catch(err => {
        console.warn('Algunos archivos no se pudieron cachear:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activación: limpiar caches viejos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nombres) => {
      return Promise.all(
        nombres.map((nombre) => {
          if (nombre !== CACHE_NAME) {
            return caches.delete(nombre);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: estrategia network-first (para que siempre tenga los datos frescos)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // NO interceptar requests al backend de Apps Script
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // NO interceptar POST
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Guardar copia en caché
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(() => {
        // Si falla la red, usar caché
        return caches.match(event.request);
      })
  );
});
