// POST /api/sale — вебхук продажи из 1С.
// Защита: заголовок X-1C-Token должен совпадать с env C1_WEBHOOK_TOKEN.
// Body: {
//   ean_code,            // штрихкод карты клиента (обязательно)
//   amount,              // сумма чека в сомони (обязательно)
//   item_name,           // наименование/комментарий (необязательно)
//   receipt_no,          // номер чека (необязательно)
//   c1_doc_ref,          // уникальная ссылка документа 1С — идемпотентность (рекомендуется)
//   purchased_at         // ISO-дата продажи (необязательно, по умолчанию now)
// }
// Бонус: если amount >= 150 сомони → +20 бонусов (порог и бонус настраиваются в RPC).
import { supabase } from './_lib/supabase.js';
import { handleOptions, readJson, ok, fail } from './_lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return fail(res, 405, 'Только POST');

  // Проверка токена 1С.
  const expected = (process.env.C1_WEBHOOK_TOKEN || '').trim();
  const got = (req.headers['x-1c-token'] || req.headers['X-1C-Token'] || '').toString().trim();
  if (!expected) return fail(res, 500, 'C1_WEBHOOK_TOKEN не настроен на сервере');
  if (got !== expected) return fail(res, 401, 'Неверный токен 1С');

  const body = await readJson(req);

  // Режим погашения reward-кода на кассе: { redeem_code, c1_doc_ref }.
  if (body.redeem_code) {
    const { data, error } = await supabase.rpc('loyalty_redeem_reward', {
      p_code: String(body.redeem_code).trim(),
      p_c1_ref: body.c1_doc_ref || null,
    });
    if (error) return fail(res, 500, error.message);
    if (!data?.ok) return fail(res, 400, data?.error || 'Не удалось погасить код');
    return ok(res, { ok: true, result: data });
  }

  const ean = (body.ean_code || '').toString().trim();
  const amount = Number(body.amount);
  if (!ean) return fail(res, 400, 'Не указан ean_code');
  if (!Number.isFinite(amount) || amount <= 0) return fail(res, 400, 'Некорректная сумма');

  const { data, error } = await supabase.rpc('loyalty_record_sale', {
    p_ean: ean,
    p_amount: amount,
    p_item_name: body.item_name || null,
    p_receipt_no: body.receipt_no || null,
    p_c1_doc_ref: body.c1_doc_ref || null,
    p_purchased_at: body.purchased_at || new Date().toISOString(),
  });
  if (error) return fail(res, 500, error.message);

  return ok(res, { ok: true, result: data });
}
