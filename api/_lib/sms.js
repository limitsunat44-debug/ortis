// SMS-провайдер (provider-agnostic).
// Поддержка: OsonSMS (legacy str_hash, sendsms_v1.php), универсальный HTTP, dev-режим.
// Провайдер выбирается переменной SMS_PROVIDER: 'osonsms' | 'http' | 'dev' (по умолчанию 'dev').
import crypto from 'crypto';

// .trim() — на случай если значение env-переменной попало с лишним переносом строки.
const env = (k, def) => (process.env[k] == null ? def : String(process.env[k]).trim()) || def;
const PROVIDER = env('SMS_PROVIDER', 'dev').toLowerCase();

// Нормализация номера к формату OsonSMS: 992XXXXXXXXX (без + и пробелов).
export function normalizePhone(raw) {
  let p = (raw || '').toString().replace(/[^\d]/g, '');
  if (p.startsWith('00')) p = p.slice(2);
  if (p.length === 9) p = '992' + p;          // локальный 9-значный → +992
  if (p.startsWith('0') && p.length === 10) p = '992' + p.slice(1);
  return p;
}

// --- OsonSMS (legacy str_hash) ---
// str_hash = sha256(txn_id ; login ; sender ; phone_number ; hash)
async function sendOsonSMS({ phone, text, txnId }) {
  const login  = env('OSONSMS_LOGIN', '');
  const sender = env('OSONSMS_SENDER', '');
  const secret = env('OSONSMS_HASH', '');            // pass_salt_hash
  const server = env('OSONSMS_SERVER', 'https://api.osonsms.com/sendsms_v1.php');
  if (!login || !sender || !secret) {
    throw new Error('OsonSMS не настроен (OSONSMS_LOGIN/SENDER/HASH)');
  }
  const phoneNum = normalizePhone(phone);
  const strHash = crypto
    .createHash('sha256')
    .update(`${txnId};${login};${sender};${phoneNum};${secret}`)
    .digest('hex');

  const params = new URLSearchParams({
    from: sender,
    phone_number: phoneNum,
    msg: text,
    str_hash: strHash,
    txn_id: txnId,
    login,
    t: '23',
  });
  const url = `${server}?${params.toString()}`;
  const resp = await fetch(url, { method: 'GET' });
  const bodyText = await resp.text();
  let body;
  try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText }; }

  // Успех: HTTP 200/201, status=ok, есть msg_id.
  if (resp.ok && (body.status === 'ok' || body.msg_id)) {
    return { ok: true, provider: 'osonsms', msg_id: body.msg_id || null };
  }
  const errMsg = body?.error?.msg || body?.msg || bodyText || `HTTP ${resp.status}`;
  throw new Error(`OsonSMS: ${errMsg}`);
}

// --- Универсальный HTTP-провайдер ---
// Настраивается через env: SMS_HTTP_URL, SMS_HTTP_METHOD (GET/POST),
// SMS_HTTP_BODY (шаблон с {phone}/{text}), SMS_HTTP_HEADERS (JSON).
async function sendHttpSMS({ phone, text }) {
  const url = process.env.SMS_HTTP_URL;
  if (!url) throw new Error('SMS_HTTP_URL не задан');
  const method = (process.env.SMS_HTTP_METHOD || 'POST').toUpperCase();
  const phoneNum = normalizePhone(phone);
  const fill = (s) => s.replace(/\{phone\}/g, phoneNum).replace(/\{text\}/g, encodeURIComponent(text));
  let headers = { 'Content-Type': 'application/json' };
  if (process.env.SMS_HTTP_HEADERS) {
    try { headers = { ...headers, ...JSON.parse(process.env.SMS_HTTP_HEADERS) }; } catch {}
  }
  const init = { method, headers };
  if (method === 'GET') {
    const target = fill(url);
    const resp = await fetch(target);
    if (!resp.ok) throw new Error(`HTTP SMS: ${resp.status}`);
    return { ok: true, provider: 'http' };
  }
  init.body = process.env.SMS_HTTP_BODY
    ? fill(process.env.SMS_HTTP_BODY)
    : JSON.stringify({ phone: phoneNum, text });
  const resp = await fetch(url, init);
  if (!resp.ok) throw new Error(`HTTP SMS: ${resp.status}`);
  return { ok: true, provider: 'http' };
}

// Публичная функция: отправить SMS с кодом.
// Возвращает { ok, provider, devCode? } — devCode только в dev-режиме.
export async function sendSms({ phone, text, txnId }) {
  const id = txnId || `otp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  if (PROVIDER === 'osonsms') return sendOsonSMS({ phone, text, txnId: id });
  if (PROVIDER === 'http')    return sendHttpSMS({ phone, text });
  // dev: ничего не шлём, код вернётся в ответе API (для теста).
  return { ok: true, provider: 'dev' };
}

export function smsProviderName() {
  return PROVIDER;
}
