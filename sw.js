const CACHE_NAME = 'pronuncia-treinador-v2';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './game.js',
    './words.js',
    './manifest.json'
];

// Instalação: Cache dos arquivos base
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Fazendo cache dos assets básicos');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Ativação: Limpeza de caches antigos
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removendo cache antigo', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Interceptação: Cache First, fallback para Network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            // Se encontrou no cache, retorna
            if (response) {
                return response;
            }
            
            // Se não encontrou, busca na rede e salva no cache (útil para os mp3)
            return fetch(event.request).then((networkResponse) => {
                // Não faz cache de requisições que não sejam GET ou que falharam
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                
                // Clona a resposta para colocar no cache e devolver pro browser
                let responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(event.request, responseToCache);
                });
                
                return networkResponse;
            });
        })
    );
});
