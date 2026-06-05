// POST /api/auth/verify-code — проверка SMS-кода и выдача токена сессии.
// Body: { phone, code }. При успехе возвращает token + user.
// Боевая логика: если пользователя нет — создаём (генерируем EAN-13), как в исходнике.
import { supabase } from '../_lib/supabase.js';
import { signCard } from '../_lib/token.js';
import { handleOptions, readJson, ok, fail } from '../_lib/http.js';
import { normalizePhone } from '../_lib/sms.js';

const MAX_ATTEMPTS = 5; // максимум попыток ввода на один код

// Генерация валидного EAN-13 (12 случайных цифр + контрольная).
function generateEAN13() {
  let code = '';
  for (let i = 0; i < 12; i++) code += Math.floor(Math.random() * 10);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * parseInt(code[i], 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return code + checkDigit;
}

// Гарантируем уникальный ean_code (несколько попыток на случай коллизии).
async function generateUniqueEAN() {
  for (let i = 0; i < 8; i++) {
    const ean = generateEAN13();
    const { data } = await supabase
      .from('loyalty_users')
      .select('id')
      .eq('ean_code', ean)
      .maybeSingle();
    if (!data) return ean;
  }
  // крайне маловероятный фолбэк
  return generateEAN13();
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Только POST');

  const body = await readJson(req);
  const phone = normalizePhone(body.phone);
  const code = (body.code || '').toString().replace(/\D/g, '').trim();
  if (!phone) return fail(res, 400, 'Укажите номер телефона');
  if (!code || code.length !== 6) return fail(res, 400, 'Введите 6-значный код');

  // Берём самый свежий неиспользованный код по номеру.
  const { data: otp, error: otpErr } = await supabase
    .from('loyalty_otp')
    .select('*')
    .eq('phone', phone)
    .eq('consumed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (otpErr) return fail(res, 500, otpErr.message);
  if (!otp) return fail(res, 400, 'Код не найден. Запросите новый.');

  // Срок действия.
  if (new Date(otp.expires_at).getTime() < Date.now()) {
    return fail(res, 400, 'Срок действия кода истёк. Запросите новый.');
  }

  // Лимит попыток.
  if ((otp.attempts || 0) >= MAX_ATTEMPTS) {
    await supabase.from('loyalty_otp').update({ consumed: true }).eq('id', otp.id);
    return fail(res, 429, 'Превышено число попыток. Запросите новый код.');
  }

  // Сверка кода.
  if (otp.code !== code) {
    await supabase.from('loyalty_otp').update({ attempts: (otp.attempts || 0) + 1 }).eq('id', otp.id);
    const left = MAX_ATTEMPTS - (otp.attempts || 0) - 1;
    return fail(res, 401, left > 0 ? `Неверный код. Осталось попыток: ${left}.` : 'Неверный код. Запросите новый.');
  }

  // Успех: гасим код.
  await supabase.from('loyalty_otp').update({ consumed: true }).eq('id', otp.id);

  // Телефон в БД может храниться в формате +992... — ищем по обоим вариантам.
  const phonePlus = '+' + phone;
  const { data: users, error: uErr } = await supabase
    .from('loyalty_users')
    .select('*')
    .or(`phone.eq.${phone},phone.eq.${phonePlus}`);
  if (uErr) return fail(res, 500, uErr.message);

  let user = (users || [])[0] || null;
  const nowIso = new Date().toISOString();

  if (!user) {
    // Новый клиент — создаём карту с уникальным EAN-13.
    const ean = await generateUniqueEAN();
    const { data: created, error: insErr } = await supabase
      .from('loyalty_users')
      .insert({
        phone: phonePlus,
        name: '',
        ean_code: ean,
        points_balance: 0,
        discount_pct: 0,
        created_at: nowIso,
        last_login: nowIso,
      })
      .select('*')
      .single();
    if (insErr) return fail(res, 500, insErr.message);
    user = created;
  } else {
    // Существующий клиент — обновляем last_login.
    await supabase
      .from('loyalty_users')
      .update({ last_login: nowIso })
      .eq('id', user.id);
    user.last_login = nowIso;
  }

  const token = signCard(user.ean_code);
  return ok(res, {
    ok: true,
    token,
    user: {
      id: user.id,
      ean_code: user.ean_code,
      name: user.name,
      phone: user.phone,
      discount_pct: user.discount_pct,
      points_balance: user.points_balance,
    },
  });
}
