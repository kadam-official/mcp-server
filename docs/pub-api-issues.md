# Kadam Publisher API — Баг-репорты и проблемы

Обнаружено при интеграции внешнего клиента (MCP-сервер) с `pub.kadam.net/api`.  
Дата тестирования: 4 марта 2026. Scope: Publisher API, Bearer-token авторизация.

---

## Часть 1. Баги (server-side crashes)

### 1.1 Custom Reports — crash при отсутствии `filters.filters`

| | |
|---|---|
| **Endpoint** | `POST /api/custom-reports/data` |
| **Sentry Issue** | #658890 |
| **Severity** | Critical — статистика полностью недоступна через API |

**Суть**: при запросе без ключа `filters.filters` сервер падает с `ErrorException: Invalid argument supplied for foreach()`. Тот же баг, что и в advertiser API (Sentry #659189) — общий код в `common/services/reports/servicesLayer/ConstructorCommandService.php:148`.

**Воспроизведение**:
```bash
curl -X POST 'https://pub.kadam.net/api/custom-reports/data' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"groups":["time_day"],"metrics":["traffic_views"],"page":1,"perPage":5}'
```

**Ответ**:
```json
{
  "success": false,
  "code": 0,
  "msg": {
    "exception": "Something went wrong. Error code: #830a7964ca774c3d906773aa216955a0. Report this code to customer service."
  }
}
```

Протестированы различные комбинации metrics (`traffic_views`, `traffic_clicks`, `finance_moneyIn`, `webmaster_cpm`), groups (`time_day`), periods (`7days`, `30days`) — ошибка стабильно воспроизводится. Эндпоинт `OPTIONS /custom-reports` при этом работает корректно и возвращает конфигурацию метрик и группировок.

**Причина** — `ConstructorCommandService.php:148`:
```php
foreach ($this->params->filters['filters'] as $customFilter) {
```
Когда `filters.filters` не передан, значение `null`, а `foreach(null)` бросает исключение в PHP 7.4.

**Фикс (одна строка)**:
```php
foreach ($this->params->filters['filters'] ?? [] as $customFilter) {
```

**Обход на клиенте**: всегда отправлять `"filters": {"filters": []}` в теле запроса.

---

### 1.2 Create Source — поле `name` не сохраняется

| | |
|---|---|
| **Endpoint** | `PUT /api/sources` |
| **Severity** | Medium — сайт создаётся, но без имени |

**Суть**: при создании нового сайта переданное поле `name` игнорируется — в ответе API возвращается `"name": null`.

**Воспроизведение**:
```bash
curl -X PUT 'https://pub.kadam.net/api/sources' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"name":"My Test Site","url":"https://example.com"}'
```

**Ответ**:
```json
{
  "success": true,
  "code": 200,
  "data": {
    "id": 69567,
    "name": null,
    "url": "https://example.com",
    "state": "onconfirm",
    ...
  }
}
```

**Ожидание**: `"name": "My Test Site"`.

---

### 1.3 Фильтр `showArchived` не работает в sources-table

| | |
|---|---|
| **Endpoint** | `POST /api/sources/sources-table` |
| **Severity** | Low |

**Суть**: передача `"showArchived": true` не включает архивированные сайты в результат. Только что архивированные сайты (ID 69567, 69568) не появляются в списке.

**Воспроизведение**:
```bash
curl -X POST 'https://pub.kadam.net/api/sources/sources-table' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"page":1,"perPage":25,"showArchived":true}'
```

Возвращает только неархивированные сайты.

---

## Часть 2. Несоответствия REST и проблемы дизайна API

### 2.1 Нет версионирования API

| | |
|---|---|
| **Текущее** | `pub.kadam.net/api/...` |
| **Ожидание** | `pub.kadam.net/api/v1/...` |

Advertiser API использует `/api/v1/`, publisher API — `/api/` без версии. Это затрудняет планирование breaking changes и несовместимо между двумя продуктами.

---

### 2.2 DataTable формат в list-эндпоинтах вместо плоских ресурсов

| | |
|---|---|
| **Endpoints** | `POST /sources/sources-table`, `POST /places/places-table/{id}` |
| **Severity** | High — основная проблема для API-интеграции |

Эти эндпоинты возвращают формат DataTable, заточенный под фронтенд-таблицу, а не REST-ресурсы:

```json
{
  "rows": [
    {
      "source": "fullResult",
      "domain": null,
      "views": "0",
      "clicks": "0",
      "income": "₽0"
    },
    {
      "source": {
        "name": "gamehd.ru",
        "id": 31218,
        "state": 1,
        "stage": "accepted"
      },
      "domain": "gamehd.ru",
      "views": "0",
      "clicks": "0",
      "income": "₽0"
    }
  ]
}
```

**Проблемы**:
1. **Nested entity**: данные о ресурсе (`id`, `name`, `state`) вложены в `source`/`block` объект, а не на верхнем уровне
2. **Summary row**: первый элемент `rows[]` — это строка-итог (`"source": "fullResult"`), а не ресурс. Клиент должен фильтровать
3. **Числа как строки**: `views`, `clicks` — строки `"0"`, а не числа `0`
4. **Форматированные currency**: `income` — `"₽0"` вместо raw числа `0`. Нужен парсинг currency symbol
5. **Нет `url` поля**: только `domain`, а `url` доступен лишь через `GET /sources/{id}`
6. **Колонки**: ответ включает `columns[]` с метаданными UI-таблицы — бесполезно для API

**Ожидание REST API**:
```json
{
  "rows": [
    {
      "id": 31218,
      "name": "gamehd.ru",
      "url": "https://gamehd.ru",
      "state": "accepted",
      "views": 0,
      "clicks": 0,
      "income": 0.0,
      "currency": "rub",
      "adUnits": { "native": 0, "push": 0, "inpagepush": 1 }
    }
  ],
  "totalRows": 1,
  "page": 1,
  "perPage": 25
}
```

---

### 2.3 Аналогичная проблема с ad units (places)

`POST /places/places-table/{sourceId}` — те же проблемы DataTable формата:

```json
{
  "block": {
    "name": "Рекламный блок 1",
    "id": 312787,
    "state": 1,
    "archive": 0
  },
  "type": "inpagepush",
  "queries": "0",
  "views": "0",
  "income": "₽0"
}
```

Нет отдельного `GET /places/{id}` для получения полной информации о блоке.

---

### 2.4 HTTP-методы не соответствуют REST

| Операция | Текущее | Ожидание (REST) |
|---|---|---|
| Список сайтов | `POST /sources/sources-table` | `GET /sources` |
| Создание сайта | `PUT /sources` | `POST /sources` |
| Обновление сайта | `PUT /sources/{id}` | `PUT /sources/{id}` или `PATCH` ✓ |
| Получение сайта | `GET /sources/{id}` ✓ | ✓ |
| Список блоков | `POST /places/places-table/{id}` | `GET /sources/{id}/ad-units` |
| Статус сайта | `POST /sources/{id}/activate` | `PATCH /sources/{id}` с `{"status": "active"}` |
| Архив сайта | `POST /sources/archive/{id}` | `PATCH /sources/{id}` с `{"archived": true}` |
| Информация о пользователе | `POST /users/check-upd` | `GET /me` или `GET /user` |

**Основные проблемы**:
- `PUT` для создания (вместо `POST`)
- `POST` для чтения данных (вместо `GET`)
- Статус/архив/деархив — разные эндпоинты вместо PATCH одного ресурса
- `check-upd` — не RESTful имя для получения информации о пользователе

---

### 2.5 User Info не возвращает профиль

| | |
|---|---|
| **Endpoint** | `POST /users/check-upd` |

**Ответ**:
```json
{
  "balance": 0,
  "currency": "rub",
  "notifications": { "items": [], "totalItems": 0, "unreadItems": 0 }
}
```

**Нет полей**: `email`, `name`, `id`, `registeredAt`, `companyName`. Невозможно программно определить, чей это аккаунт.

---

### 2.6 State vs Status — несогласованная терминология

| Контекст | Поле | Значения |
|---|---|---|
| `GET /sources/{id}` | `state` (string) | "accepted", "onconfirm", "onstat", "onmoderate", "deny" |
| `POST /sources/sources-table` row | `source.state` (number) | 1, 0 |
| `POST /sources/sources-table` row | `source.stage` (string) | "accepted", etc. |

Одно и то же поле (`state`) имеет разные типы (`string` vs `number`) в разных эндпоинтах. Плюс добавляется `stage` в table-формате. Должно быть единообразно.

---

### 2.7 Нет эндпоинта для создания ad unit через API

В API отсутствует `POST /places` или `PUT /places/{sourceId}` для создания рекламного блока. Это можно сделать только через UI. Для автоматизации нужен эндпоинт создания.

---

### 2.8 Несогласованность между Advertiser и Publisher API

| Аспект | Advertiser (`partners.kadam.net`) | Publisher (`pub.kadam.net`) |
|---|---|---|
| Версия | `/api/v1/` | `/api/` (без версии) |
| List формат | Плоские объекты | DataTable (nested + formatted strings) |
| HTTP-методы | POST для list, PUT для create | То же самое |
| Авторизация | `Bearer <token>` | `Bearer <token>` ✓ |
| Response wrapper | `{ success, code, data }` | `{ success, code, data }` ✓ |

---

## Часть 3. Рекомендации по улучшению

### 3.1 Добавить RESTful list-эндпоинты

Параллельно с DataTable-эндпоинтами (которые нужны фронтенду) добавить:
- `GET /sources` — список сайтов с фильтрами через query params
- `GET /sources/{id}/ad-units` — список блоков сайта
- Оба возвращают плоские объекты с raw-числами

### 3.2 Добавить API для создания ad units

```
POST /sources/{sourceId}/ad-units
{
  "name": "My Banner",
  "type": "banner",
  "size": "300x250"
}
```

### 3.3 Добавить версионирование

```
pub.kadam.net/api/v1/sources
```

### 3.4 Вернуть профиль в `/me`

```
GET /api/v1/me
{
  "id": 117043,
  "email": "user@example.com",
  "name": "Company Name",
  "balance": 0.0,
  "currency": "rub"
}
```

### 3.5 Использовать raw-числа вместо форматированных строк

| Текущее | Предлагаемое |
|---|---|
| `"views": "1,234"` | `"views": 1234` |
| `"income": "₽0"` | `"income": 0.0, "currency": "rub"` |
| `"ctr": "1.5%"` | `"ctr": 0.015` |

### 3.6 Унифицировать state/stage

Везде использовать единое поле `status` типа `string`:
```json
{
  "id": 31218,
  "status": "accepted"
}
```

### 3.7 Привести HTTP-методы к REST-стандарту

| Операция | Текущее | Рекомендация |
|---|---|---|
| Create source | `PUT /sources` | `POST /sources` |
| List sources | `POST /sources/sources-table` | `GET /sources` |
| List ad units | `POST /places/places-table/{id}` | `GET /sources/{id}/ad-units` |
| Get user info | `POST /users/check-upd` | `GET /me` |

---

### Приоритеты

| Приоритет | Что сделать | Трудоёмкость | Эффект |
|-----------|-------------|--------------|--------|
| 🔴 P0 | Пофиксить crash custom-reports (1.1) | Низкая (1 день) | Статистика заработает |
| 🔴 P0 | Пофиксить сохранение name при create source (1.2) | Низкая | Сайты создаются корректно |
| 🟠 P1 | RESTful list endpoints с raw-числами | Средняя (3-5 дней) | API становится пригодным для интеграции |
| 🟠 P1 | Добавить версионирование `/api/v1/` | Низкая | Совместимость и предсказуемость |
| 🟡 P2 | GET /me с профилем | Низкая | Идентификация аккаунта |
| 🟡 P2 | API для создания ad units | Средняя | Полная автоматизация |
| 🟡 P2 | Унификация state/stage/status | Средняя | Единообразие API |
| ⚪ P3 | Приведение HTTP-методов к REST | Средняя | Best practices |
