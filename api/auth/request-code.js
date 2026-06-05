// POST /api/auth/request-code — запрос SMS-кода для входа по телефону.
// Body: { phone }. Генерирует 6-значный код, пишет в loyalty_otp, отправляет SMS.
// Боевая логика: вход разрешён И существующим держателям карт, И новым клиентам
// (новый пользователь будет создан на этапе verify-code, как было в исходном index.html).
import { supabase } from '../_lib/supabase.js';
import { handleOptions, readJson, ok, fail } from '../_lib/http.js';
import { sendSms, normalizePhone, smsProviderName } from '../_lib/sms.js';

const CODE_TTL_MIN = 5;          // срок жизни кода, минут
const RESEND_COOLDOWN_SEC = 60;  // антиспам: повторная отправка не чаще раза в минуту
const MAX_PER_HOUR = 5;          // не больше 5 кодов на номер в час

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Только POST');

  const body = await readJson(req);
  const phone = normalizePhone(body.phone);
  if (!phone || phone.length < 9) return fail(res, 400, 'Укажите корректный номер телефона');

  const nowIso = new Date().toISOString();

  // Антиспам: последний код по номеру.
  const { data: recent } = await supabase
    .from('loyalty_otp')
    .select('created_at')
    .eq('phone', phone)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent) {
    const ageSec = (Date.now() - new Date(recent.created_at).getTime()) / 1000;
    if (ageSec < RESEND_COOLDOWN_SEC) {
      return fail(res, 429, `Код уже отправлен. Повторить можно через ${Math.ceil(RESEND_COOLDOWN_SEC - ageSec)} с.`);
    }
  }

  // Лимит за час.
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await supabase
    .from('loyalty_otp')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', hourAgo);
  if ((count || 0) >= MAX_PER_HOUR) {
    return fail(res, 429, 'Слишком много запросов. Попробуйте позже.');
  }

  // Генерация кода.
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 цифр
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString();

  const { error: insErr } = await supabase.from('loyalty_otp').insert({
    phone,
    code,
    expires_at: expiresAt,
    consumed: false,
    attempts: 0,
  });
  if (insErr) return fail(res, 500, insErr.message);

  // Отправка SMS.
  const text = `Ортосалон: ваш код для входа ${code}. Действует ${CODE_TTL_MIN} мин.`;
  let smsResult;
  try {
    smsResult = await sendSms({ phone, text });
  } catch (e) {
    return fail(res, 502, `Не удалось отправить SMS: ${e.message}`);
  }

  const resp = {
    ok: true,
    sent: true,
    phone,
    expires_in: CODE_TTL_MIN * 60,
    provider: smsProviderName(),
  };
  // В dev-режиме возвращаем код для теста без реального SMS.
  if (smsResult.provider === 'dev') resp.dev_code = code;
  return ok(res, resp);
}
