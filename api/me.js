// GET /api/me — данные текущего держателя карты по токену.
// PUT /api/me — обновление имени/почты.
// Заголовок: Authorization: Bearer <token>. Токен содержит ean_code (штрихкод).
import { supabase } from './_lib/supabase.js';
import { getBarcodeFromRequest } from './_lib/token.js';
import { handleOptions, readJson, ok, fail } from './_lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ean = getBarcodeFromRequest(req);
  if (!ean) return fail(res, 401, 'Требуется авторизация');

  // Находим пользователя по штрихкоду.
  const { data: user, error: uErr } = await supabase
    .from('loyalty_users')
    .select('*')
    .eq('ean_code', ean)
    .maybeSingle();
  if (uErr) return fail(res, 500, uErr.message);
  if (!user) return fail(res, 404, 'Карта не найдена');

  if (req.method === 'PUT') {
    const body = await readJson(req);
    const patch = {};
    if (typeof body.name === 'string') patch.name = body.name.trim().slice(0, 120);
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { error: upErr } = await supabase
        .from('loyalty_users')
        .update(patch)
        .eq('id', user.id);
      if (upErr) return fail(res, 500, upErr.message);
      Object.assign(user, patch);
    }
  } else if (req.method !== 'GET') {
    return fail(res, 405, 'Только GET или PUT');
  }

  // История покупок (последние 50).
  const { data: purchases } = await supabase
    .from('loyalty_purchases')
    .select('id, amount, item_name, receipt_no, bonus_awarded, purchased_at')
    .eq('user_id', user.id)
    .order('purchased_at', { ascending: false })
    .limit(50);

  // Активный reward-код (если есть).
  const { data: activeReward } = await supabase
    .from('loyalty_rewards')
    .select('code, value_somoni, status, created_at')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .maybeSingle();

  const REWARD_THRESHOLD = 100;
  const points = user.points_balance || 0;

  return ok(res, {
    ok: true,
    user: {
      id: user.id,
      ean_code: user.ean_code,
      name: user.name,
      phone: user.phone,
      discount_pct: user.discount_pct,
      points_balance: points,
      created_at: user.created_at,
    },
    purchases: purchases || [],
    reward: {
      threshold: REWARD_THRESHOLD,
      points_to_reward: Math.max(0, REWARD_THRESHOLD - points),
      can_claim: points >= REWARD_THRESHOLD && !activeReward,
      active_code: activeReward ? activeReward.code : null,
      active_value: activeReward ? activeReward.value_somoni : null,
    },
  });
}
