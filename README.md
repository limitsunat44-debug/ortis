# Ортосалон — ORTO.CARDS (карта лояльности)

Личный кабинет держателя карты лояльности. Вход по номеру телефона + SMS-код (OsonSMS).
Бонусы и скидки считаются на стороне Supabase; **1С только продаёт** и присылает вебхук о продаже.

## Архитектура

- **Фронтенд** — статический `index.html` (+ `styles.css`). Секретов не содержит:
  ни ключей Supabase, ни SMS-hash. Вся чувствительная логика — на сервере `/api/`.
- **Бэкенд** — serverless-функции Vercel (Node, ESM), используют **SERVICE_ROLE**-ключ Supabase.
- **БД** — Supabase, проект `mvjiqysmcclvceswfqwv`. Основная таблица клиентов — `loyalty_users`
  (поле `ean_code` = штрихкод карты).

## Эндпоинты `/api/`

| Метод | Путь | Назначение |
|------|------|-----------|
| POST | `/api/auth/request-code` | `{ phone }` → генерирует код, пишет в `loyalty_otp`, шлёт SMS |
| POST | `/api/auth/verify-code` | `{ phone, code }` → проверяет код, создаёт пользователя при необходимости, выдаёт `token` |
| GET  | `/api/me` | по `Authorization: Bearer <token>` → профиль, баланс, история покупок |
| PUT  | `/api/me` | `{ name }` → обновить профиль |
| POST | `/api/sale` | **вебхук 1С** о продаже (см. ниже) |

Токен сессии — HMAC-подпись штрихкода (`CARD_TOKEN_SECRET`), без БД-сессий.

## Вебхук продажи из 1С — `POST /api/sale`

Заголовок: `X-1C-Token: <C1_WEBHOOK_TOKEN>` (секрет в env Vercel).

Тело JSON:
```json
{
  "ean_code": "8089148678434",     // штрихкод карты клиента (обязательно)
  "amount": 200,                    // сумма чека в сомони (обязательно)
  "item_name": "Ортопедические стельки",
  "receipt_no": "R-001",
  "c1_doc_ref": "1C-DOC-uuid",      // уникальная ссылка документа 1С (идемпотентность)
  "purchased_at": "2026-06-05T12:00:00Z"
}
```

**Бонусная логика** (RPC `loyalty_record_sale` в Supabase):
- клиент ищется по `ean_code`;
- покупка пишется в `loyalty_purchases`, движение баллов — в `loyalty_points_ledger`;
- если `amount >= 150` сомони → начисляется **+20 бонусов**;
- повторный вебхук с тем же `c1_doc_ref` не начисляет бонус дважды (идемпотентность).

Ответ: `{ ok, result: { ok, duplicate, new_balance, purchase_id, bonus_awarded } }`.

## Переменные окружения (Vercel → Project ortis → Production)

| Переменная | Описание |
|-----------|----------|
| `SUPABASE_URL` | URL проекта Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role ключ (только сервер!) |
| `SMS_PROVIDER` | `osonsms` (боевой) / `dev` (тест, код в ответе API) |
| `OSONSMS_LOGIN` `OSONSMS_SENDER` `OSONSMS_HASH` `OSONSMS_SERVER` | реквизиты OsonSMS |
| `CARD_TOKEN_SECRET` | секрет для подписи токена сессии |
| `C1_WEBHOOK_TOKEN` | секрет для аутентификации вебхука 1С |

## Структура БД (добавлено миграцией, существующие данные сохранены)

- `loyalty_users` — клиенты (267 записей сохранены) + новые поля `points_balance`, `discount_pct`.
- `loyalty_otp` — одноразовые SMS-коды.
- `loyalty_purchases` — покупки (история).
- `loyalty_points_ledger` — журнал начислений/списаний баллов.
- RPC `loyalty_record_sale(...)` — атомарная запись продажи + начисление бонуса.
