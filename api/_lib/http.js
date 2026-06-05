// Утилиты для serverless-функций: CORS, чтение JSON-тела.
export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-1C-Token');
}

export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    cors(res);
    res.status(204).end();
    return true;
  }
  return false;
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.length) {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
  });
}

export function ok(res, body) {
  cors(res);
  res.status(200).json(body);
}

export function fail(res, code, error) {
  cors(res);
  res.status(code).json({ ok: false, error });
}
