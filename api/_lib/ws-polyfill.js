// WebSocket polyfill для Node < 22 (локальная разработка/тесты).
// На Vercel (Node 22+) глобальный WebSocket уже есть — полифил не активируется.
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    const ws = await import('ws');
    globalThis.WebSocket = ws.default || ws.WebSocket || ws;
  } catch {
    // ws не установлен в проде — не страшно, realtime мы не используем.
  }
}
