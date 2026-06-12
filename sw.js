/**
 * Auxy Finance Lab - Service Worker (PWA)
 * Stratégies :
 *  - network-first : index.html, data/rates.json (toujours frais quand le réseau le permet)
 *  - stale-while-revalidate : assets locaux (js/css/images) et CDN (Chart.js, jsPDF, SheetJS, fonts)
 * Incrémenter CACHE_VERSION à chaque évolution notable du front.
 */

const CACHE_VERSION = 'auxy-finance-lab-v4';

const PRECACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './css/style.css',
    './js/app.js',
    './js/modules/dashboard.js',
    './js/modules/credit.js',
    './js/modules/structured.js',
    './js/modules/benchmark.js',
    './js/modules/immobilier.js',
    './js/modules/covenants.js',
    './js/modules/debtprofile.js',
    './js/modules/tools.js',
    './js/modules/history.js',
    './js/utils/financial.js',
    './js/utils/debtengine.js',
    './js/utils/charts.js',
    './js/utils/export.js',
    './js/utils/storage.js',
    './js/utils/i18n.js',
    './js/utils/logo-data.js',
    './js/utils/sanitize.js',
    './js/utils/share.js',
    './js/utils/market.js',
    './js/utils/cloud.js',
    './assets/logo.png',
    './assets/favicon.svg',
    './assets/icon-192.png',
    './assets/icon-512.png'
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'cdn.sheetjs.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
    // Pas de skipWaiting automatique : le nouveau SW reste en attente et
    // l'app affiche un bandeau « Mettre à jour » (voir app.js). L'activation
    // n'a lieu qu'au clic, via le message SKIP_WAITING — la page rechargée
    // et le SW actif restent ainsi toujours de la même version.
    // Set : addAll rejette les URLs dupliquées (InvalidStateError) — un
    // doublon dans PRECACHE a déjà cassé silencieusement l'install (v3).
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then(cache => cache.addAll([...new Set(PRECACHE)]))
            .catch(err => {
                console.error('[SW] échec du précache — installation annulée', err);
                throw err;
            })
    );
});

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function networkFirst(request) {
    const cache = await caches.open(CACHE_VERSION);
    try {
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
    } catch {
        const cached = await cache.match(request);
        if (cached) return cached;
        throw new Error('offline et absent du cache');
    }
}

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(request);
    const refresh = fetch(request)
        .then(resp => {
            if (resp.ok || resp.type === 'opaque') cache.put(request, resp.clone());
            return resp;
        })
        .catch(() => null);
    return cached || refresh.then(r => r || Response.error());
}

self.addEventListener('fetch', event => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    const sameOrigin = url.origin === self.location.origin;

    // Données de marché, config cloud et page d'entrée : réseau d'abord
    if (sameOrigin && (url.pathname.endsWith('/data/rates.json') || url.pathname.endsWith('/data/cloud-config.json') || url.pathname.endsWith('/index.html') || url.pathname.endsWith('/'))) {
        event.respondWith(networkFirst(request));
        return;
    }

    // API Supabase : jamais mise en cache (données vivantes + auth)
    if (/(^|\.)supabase\.(co|in)$/.test(url.hostname)) {
        return;
    }

    if (sameOrigin || CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(staleWhileRevalidate(request));
    }
});
