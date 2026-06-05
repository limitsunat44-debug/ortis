// Лёгкая stateless-сессия клиента карты лояльности.
// Токен = подпись HMAC от barcode (без внешних зависимостей).
import crypto from 'crypto';

const SECRET = process.env.CARD_TOKEN_SECRET || 'orto-cards-dev-secret-change-me';

export function signCard(barcode) {
  const payload = Buffer.from(JSON.stringify({ b: barcode, t: Date.now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyCard(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.b || null; // barcode
  } catch {
    return null;
  }
}

export function getBarcodeFromRequest(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  return verifyCard(token);
}
