// Íris — service worker.
// Não guarda nenhuma página, resposta ou arquivo do app: só a página estática
// "Sem conexão" e um ícone. Dado financeiro nunca é servido velho, nem para
// outra pessoa no mesmo aparelho. Por isso a atualização é direta (não há
// versão antiga do app guardada para conflitar).
const CACHE = 'iris-estatico-v1'
const OFFLINE_URL = '/sem-conexao.html'
const PRECACHE = [OFFLINE_URL, '/icons/icon-192.png']
const START = '/inicio'

// Destinos que um aviso pode abrir: os mesmos formatos de isAllowedTarget
// (src/domain/notifications.ts). O servidor já confere; aqui fica a segunda
// barreira. sw.test.ts compara as duas.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const MONTH = '20\\d{2}-(0[1-9]|1[0-2])'
const TARGETS = [
  /^\/(inicio|anotar|planejamento|familia)$/,
  /^\/relatorios\?periodo=mes-passado$/,
  new RegExp('^/contas\\?mes=' + MONTH + '(&pagar=' + UUID + ')?$'),
  new RegExp('^/familia/contas\\?pagar=' + UUID + '$'),
  new RegExp('^/metas/' + UUID + '$'),
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

// Só navegação, e sempre pela rede. Sem rede: a página "Sem conexão".
// Dados, ações e arquivos do Next não passam por aqui.
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)))
})

function safeUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 200) return START
  if (/[\\\u0000-\u001f\u007f%]/.test(raw)) return START
  return TARGETS.some((re) => re.test(raw)) ? raw : START
}

// Aviso que chega sem conteúdo que sirva. O navegador exige que todo push mostre
// alguma coisa (senão mostra um aviso dele, "o site foi atualizado em segundo
// plano"). Mostra a frase calma da retomada, igual à de messages.ts ('comeback'):
// texto fixo, sem botões, e nada do que chegou é usado. sw.test.ts compara as duas.
const FALLBACK = { body: 'Seu mês continua aqui. Quer atualizar?', url: START, tag: 'comeback', pay: false }

self.addEventListener('push', (event) => {
  let data = null
  try {
    data = event.data ? event.data.json() : null
  } catch {
    data = null
  }
  if (!data || typeof data.body !== 'string' || data.body.length === 0 || data.body.length > 300) data = FALLBACK
  event.waitUntil(
    self.registration.showNotification('Íris', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      lang: 'pt-BR',
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 64) : undefined,
      data: { url: safeUrl(data.url) },
      actions: data.pay === true
        ? [{ action: 'pay', title: 'Marcar como paga' }, { action: 'later', title: 'Agora não' }]
        : [],
    }),
  )
})

// Uma janela da Íris já aberta exatamente no destino só recebe o foco. Senão,
// o destino abre em outra: uma janela aberta em outra tela nunca é trocada de
// lugar (a pessoa pode estar no meio de um registro).
async function openTarget(url) {
  try {
    const target = new URL(url, self.location.origin).href
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const same = open.find((client) => client.url === target)
    if (same) {
      await same.focus()
      return
    }
  } catch {
    // sem lista de janelas ou sem foco: abre o destino
  }
  await self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'later') return
  event.waitUntil(openTarget(safeUrl(event.notification.data && event.notification.data.url)))
})
