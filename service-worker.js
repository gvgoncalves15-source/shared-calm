/*
 * Velo — Seu dinheiro em movimento
 * Desenvolvido por Gabriel Gonçalves
 *
 * Service Worker simples: guarda o "esqueleto" do app (HTML/CSS/JS) em cache
 * para abrir instantaneamente e resistir a internet instável.
 * IMPORTANTE: dados (tarefas, despesas etc.) SEMPRE vêm do Supabase, nunca
 * do cache — isso aqui só acelera o carregamento visual do app.
 */

const CACHE_NAME = 'velo-shell-v1';
const SHELL_FILES = [
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Só mexe em arquivos do próprio app — nunca no Supabase nem em CDNs de terceiros.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('supabase.co')) return;

  const isShellFile = SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')));
  if (!isShellFile) return;

  // Cache-first (rápido), com atualização em segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req).then((res) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
