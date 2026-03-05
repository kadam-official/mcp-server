# Kadam Partners API — Баг-репорты и проблемы

Обнаружено при интеграции внешнего клиента (MCP-сервер) с `partners.kadam.net/api/v1`.  
Дата тестирования: 4 марта 2026. Scope: Advertiser API, Bearer-token авторизация.

---

## Часть 1. Баги (server-side crashes)

### 1.1 Custom Reports — crash при отсутствии `filters.filters`

| | |
|---|---|
| **Endpoint** | `POST /custom-reports/data` |
| **Sentry Issue** | #659189 |
| **Sentry Event** | `f32dc7c1ebff428a96b26be7a2157a88` |
| **Severity** | Critical — статистика полностью недоступна через API |

**Суть**: при запросе без ключа `filters.filters` сервер падает с `ErrorException: Invalid argument supplied for foreach()`.

**Воспроизведение**:
```bash
curl -X POST 'https://partners.kadam.net/api/v1/custom-reports/data' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"groups":["time_day"],"metrics":["finance_moneyOut"],"filters":{"dateFrom":"2026-01-01","dateTo":"2026-01-31"}}'
```

**Причина** — `ConstructorCommandService.php:148`:
```php
foreach ($this->params->filters['filters'] as $customFilter) {
```
Когда `filters.filters` не передан, значение `null`, а `foreach(null)` бросает исключение в PHP 7.4.

**Фикс (одна строка)**:
```php
foreach ($this->params->filters['filters'] ?? [] as $customFilter) {
```

**Обход на клиенте**: всегда отправлять `"filters": []` внутри объекта `filters`:
```json
{"groups":["time_day"],"metrics":["finance_moneyOut"],"filters":{"dateFrom":"2026-01-01","dateTo":"2026-01-31","filters":[]}}
```

---

### 1.2 Audiences — ошибка 804 (UserNotFoundException в конструкторе DI)

| | |
|---|---|
| **Endpoint** | `POST /audiences` (и все actions в `AudienceController`) |
| **Severity** | Critical — все endpoints аудиторий полностью недоступны через Bearer-token API |

**Суть**: любой запрос к эндпоинту с Bearer-токеном возвращает ошибку 804. Через сессионную авторизацию (фронтенд) работает нормально.

**Воспроизведение**:
```bash
curl -X POST 'https://partners.kadam.net/api/v1/audiences' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

**Ответ**:
```json
{"success": false, "code": 804, "msg": {"exception": "Что-то пошло не так. Сообщите менеджеру поддержки."}}
```

**Root cause** — `UsersFacade::current()` вызывается **до** Bearer-авторизации:

1. `AudienceController` инжектит `AudiencesDataTable` через конструктор (DI)
2. `AudiencesDataTable::__construct()` (строка 31) вызывает `UsersFacade::current()->getUser()`
3. `UsersFacade::current()` → `authRestUser()` — в production это **noop** (работает только в DEV/TEST)
4. Проверяет `Yii::$app->user->isGuest` → **true**, т.к. `CompositeAuth` behavior ещё не запустился
5. Бросается `UserNotFoundException` с кодом **804**

Проблема: `CompositeAuth` (Bearer-token auth) — это behavior, запускается в `beforeAction()`, **после** конструктора контроллера и DI-резолва. Сессионная авторизация (cookie) работает раньше — при инициализации приложения.

**Файлы**:
- `adv/modules/audiences/datatables/AudiencesDataTable.php:31` — `$this->user = UsersFacade::current()->getUser();`
- `common/services/users/UsersFacade.php:562-590` — `current()` бросает `UserNotFoundException(code: 804)`
- `common/services/users/exceptions/UserNotFoundException.php:20` — дефолтный код 804

**Почему не попадает в Sentry**: `UserNotFoundException extends UserException` — Yii2 трактует `UserException` как "ожидаемую" ошибку и не логирует в Sentry.

**Сравнение с работающими контроллерами**: `CampaignController` создаёт `CampaignsDataTable` **внутри action-метода** (после auth), а не инжектит через DI-конструктор.

**Фикс** (любой из вариантов):
1. **Lazy-загрузка** — убрать `UsersFacade::current()` из конструктора `AudiencesDataTable`, вызывать при первом обращении к `$this->user`
2. **Перенести создание** `AudiencesDataTable` внутрь action-метода (как в `CampaignController`)
3. Использовать `CurrentUserServiceInterface` через DI с отложенным резолвом

---

### 1.3 Создание кампании — серия crash-ей из-за недокументированных обязательных полей

| | |
|---|---|
| **Endpoint** | `POST /campaigns/create` |
| **Sentry Issues** | #659367, #659368, #659370 |
| **Severity** | Critical — создание кампаний через API невозможно без знания внутренней структуры фронтенда |

API-форма `CampaignCreateForm` наследует ту же модель, что использует фронтенд-визард (4 шага). Фронтенд всегда отправляет полный payload из ~50 полей. API не задаёт дефолты для отсутствующих полей, что приводит к серии `NullPointerException` в `CampaignCreateService`.

#### Crash 1 — `getAudiences()` returns null

**Sentry**: `#9daf1109f13b451ab3d3e5f4271906d1` (Issue #659367)

`CampaignCreateForm::getAudiences()` имеет strict return type `array`, но свойство `audiences` = `null` когда не передано.

```php
// CampaignCreateService.php:244
$campaign->campaignRetargeting = (int) (count($form->getAudiences()['include']) || count($form->getAudiences()['exclude']));
```

**Фикс**: задать дефолт в `CampaignCreateForm`:
```php
public $audiences = ['mode' => 20, 'include' => [], 'exclude' => []];
```

#### Crash 2 — `postConversionForm` is null

**Sentry**: `#c442a6edf6064c1f8f248b80b67bb3bf` (Issue #659368)

`$this->postConversionForm` устанавливается только в методе-валидаторе `validatePostConversion()`. Если поле `postConversion` не передано, валидатор не запускается и свойство остаётся `null`.

```php
// CampaignCreateForm.php:1239
$this->postConversionForm->getAudiences()  // NullPointerException
```

**Фикс**: задать дефолт:
```php
public $postConversion = ['audiences' => [], 'windowLength' => null, 'countFirstConversionOnly' => false, 'countLastCampaignOnly' => false];
```

#### Crash 3 — `windowLength` = 0 не проходит Assert

**Sentry**: Issue #659370

`CampaignPostConversionCreateDto::__construct()` проверяет: `Assert::range($windowLength, 1, 168)`. Значение `0` не проходит, хотя `null` допустим.

```php
// CampaignPostConversionCreateDto.php:38
if ($windowLength !== null) {
    Assert::range($windowLength, 1, 168, 'Window length must be between 1 and 168 hours.');
}
```

**Фикс**: в `CampaignPostConversionForm::getWindowLength()` возвращать `null` вместо `0` при отсутствии значения.

#### Полный список недокументированных обязательных полей

Все эти поля нужны для успешного создания кампании, но не указаны в OpenAPI-спецификации:

```json
{
  "audiences": {"mode": 20, "include": [], "exclude": []},
  "sites": {"mode": 0, "list": []},
  "ips": {"mode": 0, "list": []},
  "newAudiences": [],
  "cities": {"mode": 0, "list": []},
  "isps": {"mode": 0, "list": []},
  "materialViews": {"count": 0, "days": 0},
  "campaignView": {"count": 0, "days": 0},
  "postConversion": {"audiences": [], "windowLength": null, "countFirstConversionOnly": false, "countLastCampaignOnly": false},
  "commonMoneyLimit": 0,
  "isEvenDistribution": 0,
  "totalLossLimit": 0,
  "minBlockViews": 0,
  "maxBlockViews": 0,
  "dayClickLimit": 0,
  "dayConversionsLimit": 0,
  "isConversionFromPostback": 0,
  "allowMultiAds": 0,
  "time": {"mode": 1, "list": [{"day": 1, "hours": [0..23]}, ..., {"day": 7, "hours": [0..23]}]},
  "timezone": 0,
  "startDate": null,
  "stopDate": null,
  "autorules": [],
  "proxies": [],
  "conversion": null,
  "platformVersions": null,
  "devices": null,
  "languages": null,
  "disableProxy": 1
}
```

Кроме того, ряд полей **зависит от типа кампании** — отправка "чужих" полей вызывает ошибку валидации:

| Тип кампании | Допустимые дополнительные поля |
|---|---|
| Push (30), InPage Push (100) | `subAges`, `isNeedSecondPush`, `pushType` |
| Native (10), Banner (20) | `gender`, `age`, `allowMultiAds` |
| Popunder (40) | `isPauseAfterModerate` |

**Общая рекомендация**: задать дефолты в `CampaignCreateForm` для всех полей, либо создать отдельную API-форму с минимальным набором обязательных полей, не зависящую от фронтенд-визарда.

#### Crash 4 — `time: null` делает кампанию нередактируемой в UI

**Sentry**: не генерируется (ошибка валидации в UI, не crash на бэкенде)

**Суть**: если при создании кампании через API поле `time` передано как `null`, кампания создаётся успешно. Однако при попытке отредактировать эту кампанию в UI, фронтенд загружает `time: null` с бэкенда, и при сохранении `CampaignUpdateForm::validateTime()` падает с ошибкой `"Timetable cannot be empty"`.

Бэкенд принимает `null` при **создании** (пропускает валидацию `time`, т.к. поле входит только в `SCENARIO_LIMITS`, а валидация сценарная), но **обновление** валидирует все сценарии вместе.

**Фикс**: задать дефолт для `time` — "все дни, все часы":
```json
{
  "time": {
    "mode": 1,
    "list": [
      {"day": 1, "hours": [0,1,2,...,23]},
      {"day": 2, "hours": [0,1,2,...,23]},
      ...
      {"day": 7, "hours": [0,1,2,...,23]}
    ]
  }
}
```

Альтернатива: в `CampaignCreateForm::init()` задавать дефолтное расписание 24/7 если `$this->time === null`.

#### Crash 5 — `bids` требует скрытое поле `leadCost`

**Суть**: OpenAPI-спецификация для `bids` показывает только `countries` и `bid`, но бэкенд (`CampaignCreateForm`) также валидирует поле `leadCost`. Если `leadCost` отсутствует, возвращается ошибка `"Cost per action is empty"`.

Фронтенд всегда отправляет полную структуру:
```json
{"bid": 0.01, "leadCost": 0, "countries": [1, 34]}
```

Для `cpType: 4` (CPA Target) bids содержат только `leadCost` (без `bid`):
```json
{"leadCost": 5.0, "countries": [1, 34]}
```

**Фикс**: документировать `leadCost` в OpenAPI-спецификации. Или задать `leadCost = 0` по умолчанию в форме.

---

## Часть 2. Проблемы дизайна API

### 2.1 Недокументированный response wrapper

Все эндпоинты оборачивают ответ в:

```json
{"success": true, "code": 200, "msg": [], "data": { ... }}
```

OpenAPI-спецификация показывает свойства `data` как top-level, но реальный ответ всегда вложен в `data`. Стандартные OpenAPI-кодогенераторы сгенерируют нерабочий клиент.

**Рекомендация**: документировать wrapper в спецификации или использовать стандартные HTTP status codes.

---

### 2.2 POST вместо GET для чтения данных

| Endpoint | Текущий метод | Стандарт REST |
|----------|---------------|---------------|
| `/campaigns` | POST | GET |
| `/campaigns/folders` | POST | GET |
| `/materials` | POST | GET |
| `/audiences` | POST | GET |
| `/finances/operations` | POST | GET |
| `/stats/sites` | POST | GET |
| `/stats/postback` | POST | GET |

POST-запросы на чтение не кешируются, нарушают семантику REST и делают невозможным использование стандартных REST-клиентов.

---

### 2.3 Обновление кампании требует полный payload

`PUT /campaigns/{id}/update` использует ту же форму (`CampaignUpdateForm`), что и создание. Partial update невозможен — отправка одного поля (например, только `name`) вызывает ошибки валидации для всех остальных полей:

```bash
curl -X PUT 'https://partners.kadam.net/api/v1/campaigns/887453/update' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"name": "New name"}'

# Ответ: type, cpType, url, bids, connectionType, categories, disableProxy, dayMoneyLimit, browsers — cannot be blank
```

**Рекомендация**: поддержать partial update (PATCH-семантика) — обновлять только переданные поля, остальные брать из текущих данных кампании.

---

### 2.4 Folder update: скрытое обязательное поле `limitsEnabled`

`PUT /campaigns/folders/{id}/settings` требует поле `limitsEnabled` (boolean) для включения лимитов. Без него — ошибка валидации. Не документировано в OpenAPI.

---

### 2.5 Нет эндпоинта для получения справочников

API требует integer ID для множества полей, но не предоставляет способа узнать допустимые значения:

| Поле | Примеры ID | Как узнать? |
|------|-----------|-------------|
| `categories` | `[1001]` | Неизвестно |
| `browsers` | `[2, 4]` | Неизвестно |
| `devices` | `[3, 4]` | Неизвестно |
| `platforms` (OS) | `[1, 2, ...]` | Неизвестно |
| `countries` (в bids) | `[247]` | Неизвестно (не ISO-коды!) |
| `connectionType` | `1=3G, 2=WiFi, 3=All` | Только в описании OpenAPI |

**Рекомендация**: добавить `GET /dictionaries/{type}` возвращающий `[{id, label}]`. Без этого создание кампаний через API — метод проб и ошибок.

---

### 2.6 Форматированные строки вместо чисел

Эндпоинты списков возвращают отформатированные строки вместо raw-значений:

```json
{
  "dayMoneyLimit": "$50.00",
  "views": "0",
  "CPC": "$0.0000",
  "ROI": "0%",
  "moneyOut": "$0.00"
}
```

**Проблема**: невозможна сортировка, фильтрация и математические операции без парсинга строк регулярками. Форматирование — ответственность клиента.

**Причина**: `FieldFormattingTrait` (`formatSum()`, `formatPercents()`) вызывается в `BaseAdvertiserDataTable`, конвертируя числа в строки на уровне сервера.

**Рекомендация**: для API-эндпоинтов возвращать raw-числа, форматирование оставить фронтенду.

---

### 2.7 Несогласованное именование полей

**Status actions** — разные имена для одной операции:

| Entity | Body field |
|--------|-----------|
| Campaigns | `campaignIds` |
| Materials | `adsIds` |

**Folder settings** — внутренние имена в публичном API:

| Значение | Поле API | Интуитивное имя |
|----------|---------|-----------------|
| Дневной лимит | `groupDailyLimit` | `dailyLimit` |
| Общий лимит | `groupTotalLimit` | `totalLimit` |
| Равномерное распределение | `groupSpendingEvenly` | `evenDistribution` |

**Type representation** — несогласованность между read и write:
- `GET` (list campaigns): `type.id = "clickunder"`
- `POST` (create campaign): `type = 40`

---

### 2.8 Несогласованные ошибки

Поле `msg` в ответе имеет разный тип в зависимости от контекста:

```json
// Валидация — объект с массивами ошибок по полям
"msg": {"categories": ["Categories cannot be blank."], "bids": ["No countries"]}

// Server error — объект с exception
"msg": {"exception": "Something went wrong. Error code: #abc123..."}

// Success — пустой массив
"msg": []

// Server error на русском
"msg": {"exception": "Что-то пошло не так. Сообщите менеджеру поддержки."}
```

Проблемы:
- `msg` меняет тип (array / object) в зависимости от контекста
- Язык ошибок зависит от настроек юзера (RU/EN), непредсказуемо для API-клиента
- `code: 0` используется и для ошибок валидации, и для server errors
- Нет machine-readable error codes

**Рекомендация**: стандартизировать формат ошибок, например:
```json
{"success": false, "code": 422, "error": "VALIDATION_ERROR", "details": {"field": ["message"]}}
```

---

### 2.9 OpenAPI-спецификация не соответствует реальности

| Проблема | Детали |
|----------|--------|
| Wrapper не документирован | `{success, code, msg, data}` не описан в большинстве response-схем |
| Неверные URL | Spec: `/stats/postback` (singular), реально `/stats/sites` (plural) |
| Избыточные URL | `PUT /campaigns/{id}/update` — `/update` суффикс избыточен в REST |
| Нестандартный routing | `POST /campaigns/folders/create` вместо `POST /campaigns/folders` |
| `OPTIONS` overloaded | `OPTIONS /custom-reports` возвращает конфигурацию отчётов, а не CORS preflight |

---

### 2.10 Несогласованная пагинация

| Endpoint | `totalRows` | `page` | `perPage` | `isHasNextPage` |
|----------|-------------|--------|-----------|-----------------|
| `/campaigns` | ✅ | ❌ | ❌ | ❌ |
| `/finances/operations` | ✅ (всегда 0) | ✅ | ❌ | ❌ |
| `/custom-reports/data` | ✅ | ✅ | ✅ | ❌ |

**Рекомендация**: единообразная пагинация во всех list-ответах:
```json
{"rows": [...], "totalRows": 100, "page": 1, "perPage": 25}
```

---

## Сводная таблица

| # | Severity | Проблема | Воспроизводится | Рекомендация |
|---|----------|----------|-----------------|--------------|
| 1.1 | **Critical** | `custom-reports/data` crash на `foreach(null)` | Всегда при отсутствии `filters.filters` | Добавить `?? []` |
| 1.2 | **Critical** | `audiences` — error 804 | Всегда | Требует расследования |
| 1.3 | **Critical** | `campaigns/create` — серия NPE из-за 30+ недокументированных полей | Всегда при неполном payload | Задать дефолты в форме |
| 2.1 | High | Response wrapper не в спецификации | Всегда | Документировать |
| 2.2 | High | POST для read-операций | By design | Перевести на GET |
| 2.3 | High | `campaigns/update` не поддерживает partial update | Всегда | PATCH-семантика |
| 2.4 | High | `folders/settings` требует скрытое поле `limitsEnabled` | Всегда | Документировать |
| 2.5 | High | Нет эндпоинта справочников | By design | Добавить `/dictionaries` |
| 2.6 | High | Строки вместо чисел в list-ответах | Всегда | Возвращать raw-числа |
| 2.7 | Medium | Несогласованные имена полей | By design | Унифицировать |
| 2.8 | Medium | Разный формат ошибок | Всегда | Стандартизировать |
| 2.9 | Medium | OpenAPI не соответствует реальности | By design | Обновить спецификацию |
| 2.10 | Low | Несогласованная пагинация | Всегда | Унифицировать |

---

## Часть 3. Рекомендации по улучшению API для внешних интеграций

Ниже — предложения, которые сделают API удобным для сторонних клиентов (MCP-серверы, скрипты автоматизации, SDK). Сгруппированы от самых важных к «nice to have».

### 3.1 Отделить API-формы от фронтенд-визарда (Critical)

Сейчас `CampaignCreateForm` в API наследует ту же модель, что используется во фронтенд-визарде из 4 шагов. Фронтенд всегда шлёт ~50 полей, поэтому отсутствие любого из них приводит к NPE в бизнес-логике.

**Предложение**: создать для API отдельную «slim»-форму с минимальным набором обязательных полей и разумными дефолтами. Пример минимального payload для создания popunder-кампании:

```json
{
  "type": 40,
  "name": "My campaign",
  "url": "https://example.com",
  "folderId": 123,
  "cpType": 0,
  "bid": 0.003,
  "country": "ALL",
  "dailyBudget": 10
}
```

Всё остальное (audiences, sites, ips, postConversion, materialViews...) должно иметь дефолты на бэкенде.

---

### 3.2 Эндпоинт справочников `GET /dictionaries` (Critical)

Без справочников невозможно программно создавать кампании — нужно знать ID категорий, браузеров, стран, устройств, OS и т.д. Предлагаемый формат:

```
GET /dictionaries/countries    → [{"id": 247, "code": "US", "name": "United States"}, ...]
GET /dictionaries/categories   → [{"id": 1001, "name": "General"}, ...]
GET /dictionaries/browsers     → [{"id": 2, "name": "Chrome"}, ...]
GET /dictionaries/devices      → [{"id": 3, "name": "Desktop"}, ...]
GET /dictionaries/os           → [{"id": 1, "name": "Windows"}, ...]
GET /dictionaries/campaign-types → [{"id": 40, "name": "Popunder", "alias": "clickunder"}, ...]
GET /dictionaries/pricing-models → [{"id": 0, "name": "CPC"}, {"id": 2, "name": "CPM"}, ...]
```

Альтернатива — один эндпоинт `GET /dictionaries` который вернёт все словари разом.

---

### 3.3 Упрощение создания кампаний (High)

Сейчас создание кампании требует знания внутренних структур:

```json
"bids": [{"bid": 0.003, "leadCost": 0, "countries": [247]}]
```

Для большинства случаев API-клиенту достаточно задать одну ставку на все страны. Предложение — поддержать «плоские» параметры:

```json
{
  "bid": 0.003,
  "countries": ["US", "DE"]
}
```

А бэкенд сам преобразует это в нужный формат `bids`. Аналогично для других вложенных структур:

| Сейчас (сложно) | Предложение (просто) |
|------------------|----------------------|
| `"audiences": {"mode": 20, "include": [], "exclude": []}` | Не отправлять = нет аудиторий |
| `"sites": {"mode": 0, "list": []}` | Не отправлять = нет фильтра по сайтам |
| `"cities": {"mode": 0, "list": []}` | Не отправлять = все города |
| `"bids": [{"bid": 0.003, "leadCost": 0, "countries": [247]}]` | `"bid": 0.003` |

---

### 3.4 Числа в ответах вместо форматированных строк (High)

Для list-эндпоинтов добавить параметр `?format=raw` или создать отдельную модель ответа для API, которая возвращает числа:

```json
// Сейчас (для фронтенда)
{"dayMoneyLimit": "$50.00", "views": "0", "CPC": "$0.0000", "ROI": "0%"}

// Для API
{"dayMoneyLimit": 50.0, "views": 0, "CPC": 0.0, "ROI": 0.0}
```

Причина: `FieldFormattingTrait` (`formatSum`, `formatPercents`) вызывается в `BaseAdvertiserDataTable`. Для API-контроллеров можно обходить форматирование.

---

### 3.5 ISO-коды стран вместо внутренних ID (High)

Сейчас страны — внутренние integer ID (247 = US). Для внешнего API удобнее ISO 3166-1 alpha-2:

```json
// Сейчас
"bids": [{"bid": 0.003, "countries": [247]}]

// Предложение
"bids": [{"bid": 0.003, "countries": ["US"]}]
```

Бэкенд может конвертировать ISO → internal ID. Это стандартная практика в рекламных API (Google Ads, Facebook Ads, etc.).

---

### 3.6 Упрощение статистики (Medium)

Сейчас для получения статистики нужно:
1. `OPTIONS /custom-reports` — получить список доступных metrics/groups
2. Найти нужные ID (например `finance_moneyOut`, `time_day`)
3. `POST /custom-reports/data` с вложенным `filters.filters`

Предложение — добавить упрощённый эндпоинт:

```
GET /stats?metrics=spend,clicks,ctr&groupBy=day&dateFrom=2026-01-01&dateTo=2026-01-31
```

С human-readable именами метрик (`spend` вместо `finance_moneyOut`, `clicks` вместо `traffic_clicks`). Текущий конструктор можно оставить как advanced endpoint.

---

### 3.7 Webhook-и для статусов (Medium)

Для автоматизации полезны вебхуки:
- Кампания прошла модерацию / отклонена
- Материал (креатив) прошёл модерацию / отклонён
- Бюджет кампании исчерпан
- Баланс аккаунта ниже порога

Без вебхуков клиент вынужден поллить API, что неэффективно и создаёт нагрузку.

---

### 3.8 Batch-операции (Medium)

Добавить возможность создавать/обновлять несколько сущностей за один запрос:

```json
POST /campaigns/batch-create
[
  {"type": 40, "name": "Campaign 1", ...},
  {"type": 40, "name": "Campaign 2", ...}
]
```

Аналогично для массовой загрузки креативов. Это частый use-case для рекламодателей, которые создают десятки кампаний по шаблону.

---

### 3.9 Rate limiting с заголовками (Low)

Сейчас `RateLimiter` включён, но заголовки отключены (`enableRateLimitHeaders => false` в `ActiveController`). Для API-клиентов важно знать лимиты:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1709589600
```

**Фикс**: `enableRateLimitHeaders => true` для API-контроллеров.

---

### 3.10 Версионирование API (Low)

Сейчас API живёт на `/api/v1/`, но нет механизма обратной совместимости. При внесении breaking changes (например, переход с POST на GET для list-операций) стоит:
- Выпустить `/api/v2/` с новым дизайном
- Поддерживать `/api/v1/` с deprecation header на переходный период
- Документировать changelog между версиями

---

### Приоритеты

| Приоритет | Что сделать | Трудоёмкость | Эффект |
|-----------|-------------|--------------|--------|
| 🔴 P0 | Пофиксить 3 crash-а (1.1, 1.2, 1.3) | Низкая (1-2 дня) | API перестанет падать |
| 🔴 P0 | Дефолты в `CampaignCreateForm` | Низкая | Кампании можно создавать |
| 🟠 P1 | `GET /dictionaries` | Средняя (2-3 дня) | Можно программно создавать кампании |
| 🟠 P1 | Raw-числа в API-ответах | Средняя | Данные можно обрабатывать |
| 🟡 P2 | Slim-форма для создания кампаний | Средняя | Упрощение интеграции в 10 раз |
| 🟡 P2 | ISO-коды стран | Низкая | Стандартный подход |
| 🟡 P2 | Обновить OpenAPI-спецификацию | Средняя | Можно генерировать SDK |
| ⚪ P3 | Упрощённый эндпоинт статистики | Средняя | UX для простых запросов |
| ⚪ P3 | Webhook-и, batch-операции | Высокая | Продвинутая автоматизация |
