// GET  /api/rewards — текущие reward-коды клиента (активные/использованные).
// POST /api/rewards — получить (claim) новый reward-код при балансе >= 100 баллов.
// Заголовок: Authorization: Bearer <token> (содержит ean_code).
import { supabase } from './_lib/supabase.js';
import { getBarcodeFromRequest } from './_lib/token.js';
import { handleOptions, ok, fail } from './_lib/http.js';

const REWARD_THRESHOLD = 100; // порог баллов для награды
const REWARD_VALUE = 100;     // номинал награды в сомони

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;

  const ean = getBarcodeFromRequest(req);
  if (!ean) return fail(res, 401, 'Требуется авторизация');

  if (req.method === 'POST') {
    // Клиент получает reward-код (списываем 100 баллов).
    const { data, error } = await supabase.rpc('loyalty_claim_reward', {
      p_ean: ean,
      p_threshold: REWARD_THRESHOLD,
      p_value: REWARD_VALUE,
    });
    if (error) return fail(res, 500, error.message);
    if (!data?.ok) {
      const map = {
        user_not_found: 'Карта не найдена',
        not_enough_points: `Недостаточно баллов. Нужно ${REWARD_THRESHOLD}.`,
      };
      return fail(res, 400, map[data?.error] || 'Не удалось получить награду');
    }
    return ok(res, { ok: true, reward: data });
  }

  if (req.method === 'GET') {
    const { data: user } = await supabase
      .from('loyalty_users').select('id').eq('ean_code', ean).maybeSingle();
    if (!user) return fail(res, 404, 'Карта не найдена');
    const { data: rewards } = await supabase
      .from('loyalty_rewards')
      .select('code, value_somoni, status, redeemed_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    return ok(res, { ok: true, rewards: rewards || [] });
  }

  return fail(res, 405, 'Только GET или POST');
}
