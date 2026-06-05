// GET /api/products/top — топ реальных товаров (ортопедические категории).
// Популярность считаем по таблице sales (поле product_type — текстовое наименование).
// Цены/картинок в БД нет, поэтому отдаём name + sales_count; оформление — на фронте.
import { supabase } from '../_lib/supabase.js';
import { handleOptions, ok, fail } from '../_lib/http.js';

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET') return fail(res, 405, 'Только GET');

  // Список товаров.
  const { data: products, error: pErr } = await supabase
    .from('products')
    .select('id, name')
    .order('id');
  if (pErr) return fail(res, 500, pErr.message);

  // Подсчёт продаж по product_type.
  const { data: sales } = await supabase
    .from('sales')
    .select('product_type')
    .limit(5000);

  const counts = {};
  (sales || []).forEach(s => {
    const k = (s.product_type || '').trim().toLowerCase();
    if (k) counts[k] = (counts[k] || 0) + 1;
  });

  const ranked = (products || [])
    .map(p => ({
      id: p.id,
      name: p.name,
      sales_count: counts[(p.name || '').trim().toLowerCase()] || 0,
    }))
    .sort((a, b) => b.sales_count - a.sales_count)
    .slice(0, 10);

  return ok(res, { ok: true, products: ranked });
}
