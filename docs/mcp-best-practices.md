# MCP Server Best Practices

Компиляция best practices, использованных при проектировании Kadam MCP Server. Источники: спецификация MCP, статьи от Phil Schmid, Block Engineering, Docker, MCPcat.

---

## Содержание

1. [Ключевой принцип: MCP ≠ REST](#1-ключевой-принцип-mcp--rest)
2. [Outcomes, Not Operations](#2-outcomes-not-operations)
3. [Flatten Your Arguments](#3-flatten-your-arguments)
4. [Instructions Are Context](#4-instructions-are-context)
5. [Curate Ruthlessly (Tool Budget)](#5-curate-ruthlessly-tool-budget)
6. [Name Tools for Discovery](#6-name-tools-for-discovery)
7. [Paginate Large Results](#7-paginate-large-results)
8. [Три примитива MCP: Tools, Resources, Prompts](#8-три-примитива-mcp-tools-resources-prompts)
9. [Tool Annotations](#9-tool-annotations)
10. [Трёхуровневая обработка ошибок](#10-трёхуровневая-обработка-ошибок)
11. [Token Budget и управление размером ответа](#11-token-budget-и-управление-размером-ответа)
12. [Prompt Prefix Caching](#12-prompt-prefix-caching)
13. [Lazy Connections и Self-Contained Tool Calls](#13-lazy-connections-и-self-contained-tool-calls)
14. [Server Instructions](#14-server-instructions)
15. [Безопасность и разделение по уровню риска](#15-безопасность-и-разделение-по-уровню-риска)
16. [Тестирование: MCP Inspector](#16-тестирование-mcp-inspector)
17. [Упаковка и распространение](#17-упаковка-и-распространение)
18. [Организация tools at scale](#18-организация-tools-at-scale)
19. [Используйте сильные стороны LLM](#19-используйте-сильные-стороны-llm)
20. [Мониторинг](#20-мониторинг)
21. [Источники](#21-источники)
22. [Как мы применили это в Kadam MCP](#22-как-мы-применили-это-в-kadam-mcp)

---

## 1. Ключевой принцип: MCP ≠ REST

> **"A Good REST API is not a good MCP server."**
> — Phil Schmid, [MCP is Not the Problem, It's your Server](https://www.philschmid.de/mcp-best-practices)

MCP — это **User Interface для AI-агентов**, а не обёртка над REST API. REST спроектирован для человеческих разработчиков: composability, discoverability, flexibility. Эти принципы **не работают** для LLM:

| REST-принцип | Для людей | Для агентов |
|---|---|---|
| **Discovery** | Дёшево: прочитал доки один раз | Дорого: схема в каждом запросе |
| **Composability** | Комбинируй мелкие эндпоинты | Каждый вызов — round-trip, медленно |
| **Flexibility** | Больше опций = больше гибкости | Сложность → галлюцинации |

**Практический пример (Phil Schmid):**

Плохой MCP — три отдельных тула:
```
get_user_by_email(email)
list_orders(user_id)
get_order_status(order_id)
```
Агент делает 3 round-trip'а, хранит промежуточные результаты в контексте.

Хороший MCP — один тул:
```
track_latest_order(email) → "Order #12345 shipped via FedEx, arriving Thursday."
```
Оркестрация внутри сервера, один вызов.

---

## 2. Outcomes, Not Operations

> **Источник:** Phil Schmid

**Ловушка:** Маппинг REST-эндпоинтов 1:1 в MCP-тулы.

**Решение:** Проектируй тулы вокруг того, чего пользователь/агент хочет **достичь**.

Вместо трёх атомарных тулов для статуса заказа — один высокоуровневый тул, который делает оркестрацию в своём коде, а не в context window LLM.

**Пример (Block — Google Calendar MCP):**

v1 (плохо): 4 тула — `list_calendars`, `list_calendar_events`, `retrieve_timezone`, `retrieve_free_busy_slots`. Для ответа на "что у меня сегодня?" нужно 3-4 вызова.

v2 (хорошо): Один `query_database(sql)` с DuckDB — один SQL-запрос на любой вопрос:
```sql
SELECT * FROM free_slots(['alice@example.com', 'bob@example.com'],
                         '2025-05-13T09:00:00Z', '2025-05-17T18:00:00Z');
```

---

## 3. Flatten Your Arguments

> **Источник:** Phil Schmid

**Ловушка:** Сложные вложенные словари/объекты как аргументы.

**Решение:** Top-level примитивы с ограниченными типами.

| Плохо | Хорошо |
|---|---|
| `search_orders(filters: dict)` | `search_orders(email: str, status: Literal["pending", "shipped", "delivered"] = "pending", limit: int = 10)` |
| Агент угадывает структуру | Чёткие типы, ограничения, дефолты |
| Галлюцинирует ключи | `Literal` ограничивает выбор |

**Ключевые правила:**
- Enums как строки (`"push"`, не `30`)
- Дефолты для опциональных полей
- Никаких nested objects на верхнем уровне

---

## 4. Instructions Are Context

> **Источник:** Phil Schmid

**Ловушка:** Пустые docstring'ы, generic ошибки.

**Решение:** Каждый текст — часть контекста агента.

**Docstring'ы = инструкции.** Указывай:
- Что ожидать в ответе: *"Returns order ID and current status"*
- Как форматировать аргументы: *"Email must be lowercase"*
- Когда использовать тул: *"Use when the user asks about order status"*

**Ошибки = контекст.** Не бросай исключение. Верни полезную строку:
```
"User not found. Please try searching by email address instead."
```
Агент видит ошибку как observation и использует твою инструкцию для self-correction на следующем шаге.

**Docker добавляет:** Вместо `"You don't have access"` пиши:
```
"To have access to this system, the MCP server needs to be configured with
a valid API_TOKEN. The current API_TOKEN is not valid."
```
Это информирует агента, что проблема в конфигурации, а не в правах доступа.

---

## 5. Curate Ruthlessly (Tool Budget)

> **Источники:** Phil Schmid, Docker

**Ловушка:** Экспозировать всё, что может API. Возвращать всё, что возвращает API.

**Решение:** Design for discovery, not exhaustive exposure.

Агенты работают под жёсткими ограничениями контекста. Каждое описание тула, каждый ответ, каждая ошибка — конкурируют за context window.

**Правила:**
- **5–15 тулов на сервер** (Phil Schmid)
- Split по персоне (Admin / User)
- Delete unused tools
- One server, one job

**Docker называет это "Tool Budget":** количество тулов, которое агент может эффективно обработать. Слишком много — сервер становится сложным и дорогим в использовании.

**Как сокращать:**
- Объединяй status-change операции: `activate` + `pause` + `archive` → один `set_status(ids, status)`
- Используй MCP Prompts как "макросы" для цепочек вызовов
- Не создавай тул на каждый эндпоинт

---

## 6. Name Tools for Discovery

> **Источник:** Phil Schmid

**Ловушка:** Generic имена типа `create_issue` или `send_message`.

**Решение:** Service-prefixed, action-oriented имена.

MCP-сервер работает рядом с другими. Если GitHub и Jira оба имеют `create_issue` — агент угадывает.

**Паттерн:** `{service}_{action}_{resource}`

```
slack_send_message
linear_list_issues
sentry_get_error_details
kadam_adv_list_campaigns
kadam_pub_set_ad_unit_status
```

> Некоторые MCP-клиенты автоматически добавляют prefix с именем сервера.

---

## 7. Paginate Large Results

> **Источник:** Phil Schmid

**Ловушка:** Возвращать сотни записей.

**Решение:** Пагинация с метаданными.

- Никогда не загружай все результаты в память
- Возвращай `has_more`, `next_offset`, `total_count`
- Уважай параметр `limit` (default 20–50)

```
Showing 25 of 340 campaigns (page 1/14).
Use page=2 to see more.
```

---

## 8. Три примитива MCP: Tools, Resources, Prompts

> **Источники:** MCP Specification, MCPcat, Docker

Большинство MCP-серверов используют только **1/3** возможностей — только Tools. Но спецификация определяет три примитива:

### Tools — действия с side effects
Создание, обновление, удаление. Всё, что меняет состояние:
```typescript
server.tool("create_campaign", { name: z.string(), ... }, handler);
```

### Resources — данные без side effects
Статические справочные данные, которые агент может читать без permission prompt'ов. Загружаются в контекст один раз, дешевле чем tool call:
```
kadam://reference/campaign-types     → типы кампаний и их особенности
kadam://reference/pricing-models     → CPC/CPM/CPA описания
kadam://reference/creative-formats   → какие поля нужны для каждого типа креатива
kadam://docs/api-overview            → общая структура API
```

### Prompts — reusable workflow templates
"Макросы", которые цепочат несколько тулов в один workflow:
```
kadam_launch_campaign    → create folder → create campaign → add creatives
kadam_campaign_performance → get stats → format summary with trends
```

**Docker:** "Вместо того чтобы требовать от пользователя вызывать несколько тулов, создайте один prompt, который цепочит несколько тулов за кулисами."

---

## 9. Tool Annotations

> **Источник:** MCP Specification, Block (Goose)

Опциональные метаданные, описывающие поведение тула. Помогают агентам принимать безопасные решения:

| Аннотация | Описание | Default |
|---|---|---|
| `readOnlyHint` | Тул не меняет состояние | `false` |
| `destructiveHint` | Тул может удалить/изменить данные необратимо | `true` |
| `idempotentHint` | Повторный вызов с теми же аргументами безопасен | `false` |
| `openWorldHint` | Тул взаимодействует с непредсказуемыми внешними системами | `true` |
| `title` | Человекочитаемое название для UI | — |

**Block (Goose):** использует server instructions для построения system prompt и tool annotations для smart approval. Goose поддерживает 3 уровня: Always Allow, Allow Once, Denied.

**Рекомендация Block:** один тул = один уровень риска. Не смешивай read и write в одном туле.

---

## 10. Трёхуровневая обработка ошибок

> **Источник:** MCPcat

### Уровень 1: Transport
Ошибки соединения, таймауты, broken pipes. Обрабатываются **до** протокола MCP. Retry с exponential backoff.

### Уровень 2: Protocol
JSON-RPC 2.0 нарушения: malformed JSON, несуществующие методы, невалидные параметры. Стандартные коды:
- `-32601` Method Not Found
- `-32602` Invalid Params
- `-32603` Internal Error

### Уровень 3: Application
Ошибки бизнес-логики внутри tool handler'ов. Используй флаг `isError: true`:

```typescript
return {
  content: [{ type: "text", text: "Campaign name is required, and bid must be positive." }],
  isError: true
};
```

**Ключевой принцип:** agent-friendly сообщения с guidance по восстановлению:
- Не "HTTP 422"
- А "Campaign name is required. Provide a name and try again."
- Не "Error 804"
- А "API key appears invalid. Check KADAM_ADV_API_KEY environment variable."

---

## 11. Token Budget и управление размером ответа

> **Источник:** Block Engineering

LLM имеют конечное context window (Claude — 200K tokens, но качество падает на длинных контекстах). Разработчик тула лучше всех знает, какие вызовы могут дать большой output.

**Тактики (выбирай по семантике тула):**

1. **Пагинация:** Если все данные могут понадобиться — дай модели получать страницы через tool calls
2. **Truncation:** Сократи до безопасного лимита с пометкой:
   ```
   [Response truncated at 50KB. Use page=2 to see more.]
   ```
3. **Ошибка:** Явно бросай MCP tool execution error, позволяя агенту восстановиться

**Пример (Block — Goose):** Файлы > 400KB бросают ошибку:
```
File 'data.csv' is too large (850KB). Maximum size is 400KB.
Use shell commands like 'head', 'tail', or 'sed -n' to read a subset.
```

**Совет Block:** Для тулов с потенциально большим output — включи fallback-логику заранее. Даже проверка размера файла перед чтением может предотвратить failed tool call.

---

## 12. Prompt Prefix Caching

> **Источник:** Block Engineering

LLM-провайдеры дают **значительные скидки** и снижение latency при попадании в prompt prefix cache.

**Правила:**
- **Не** инжекти динамические данные в описания тулов (текущий timestamp, live-данные)
- Используй данные, которые меняются редко (timestamp сессии, версия сервера)
- Динамический выбор тулов или примеров для инжекции **инвалидирует** кеш
- Мониторь метрики: `cache_read_input_tokens`, `cache_creation_input_tokens`

---

## 13. Lazy Connections и Self-Contained Tool Calls

> **Источник:** Docker

### Lazy Connections
**Не валидируй соединение при старте сервера.** Позволяй тулам быть listed и discovered даже если конфигурация невалидна. Ошибка — только при вызове конкретного тула.

**Почему:** Пользователь должен видеть список доступных тулов, чтобы понять что нужно настроить. Если сервер падает при старте — discoverability нулевая.

### Self-Contained Tool Calls
Каждый вызов тула должен быть самодостаточным: создавать своё соединение, а не зависеть от persistent connection из startup.

**Docker:** "Единственный момент, когда MCP серверу нужно соединение с базой данных (или внешней системой) — когда тул вызван."

**Компромисс:** Ты обмениваешь немного latency на улучшенную usability и reliability.

---

## 14. Server Instructions

> **Источник:** MCP Specification, Block (Goose)

`instructions` — опциональное поле при инициализации MCP-сервера. Goose использует их для построения system prompt.

```typescript
const server = new McpServer({
  name: "kadam",
  version: "1.0.0",
}, {
  instructions: `You are interacting with the Kadam ad network API.
  Use kadam_adv_* tools for advertiser operations.
  Use kadam_pub_* tools for publisher operations.
  Always check kadam://reference/campaign-types before creating campaigns.`
});
```

Другие coding-агенты (Claude Code, Codex) тоже имеют концепцию server instructions — эти hints применимы cross-agent.

---

## 15. Безопасность и разделение по уровню риска

> **Источники:** Block, MCP Specification

### Разделение read/write
Один тул = один уровень риска. Не смешивай read-only и write операции. Это упрощает permission management.

### Деструктивные операции
Варианты защиты:
- Параметр `confirm: true` (safe by default)
- MCP `sampling` для запроса подтверждения у агента
- Чёткая маркировка через `destructiveHint` annotation

### Auth best practices (Block)
- OAuth когда возможно (Authorization Code Grant)
- Минимальные scopes
- Trigger OAuth flow при первом использовании, не при активации
- Храни токены в keyring (macOS Keychain, Windows Credential Locker)
- **Никогда** не сохраняй токены в plaintext файлах

---

## 16. Тестирование: MCP Inspector

> **Источник:** Docker

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) — стандартный инструмент для тестирования:

```bash
npx @modelcontextprotocol/inspector
```

**Три ключевых шага тестирования:**
1. **Tool Calling:** Тул ведёт себя как ожидается, включая failure modes
2. **List Tools:** Что видит AI-агент при инициализации сервера
3. **Connecting:** Валидация, что сервер захватывает всю нужную конфигурацию

**Docker:** "Тестируйте не только функциональность, но и user interactions."

---

## 17. Упаковка и распространение

> **Источник:** Docker

### Docker Image
Docker image = портативность. Пользователю не нужно устанавливать runtime. Если может запустить Docker — может запустить ваш MCP-сервер.

### Каналы распространения
- **npm** — `npx @kadam/mcp-server`
- **Docker** — `docker run ghcr.io/kadam/mcp-server`
- **Docker MCP Catalog** — [hub.docker.com/mcp](https://hub.docker.com/mcp)
- **MCP Registry** — `server.json` в корне репозитория

### Transport
- **stdio** — для локальной разработки, CLI, Cursor, Claude Desktop
- **Streamable HTTP** — для remote deployment (SSE deprecated)

---

## 18. Организация tools at scale

> **Источник:** MCPcat, GitHub MCP Server

### До ~30 тулов: namespace'ы
```
files/read, files/write
database/query, database/backup
```
Или flat prefix: `kadam_adv_*`, `kadam_pub_*`

### 30+ тулов: Dynamic Toolset Management
Динамически загружай только тулы, релевантные текущему контексту. GitHub MCP Server использует:
```
ListAvailableToolsets() → ["files", "database", "system"]
EnableToolset("files") → агент видит только file tools
```

### Масштаб AWS: множество серверов
- По performance: fast-mcp-server / batch-mcp-server
- По permissions: read-mcp-server / write-mcp-server
- По product area: core / analytics / billing

---

## 19. Используйте сильные стороны LLM

> **Источник:** Block Engineering

### LLM хороши в:
- **SQL-запросах** — DuckDB для структурированных данных, чистые схемы, денормализация
- **Markdown / Mermaid диаграммах** — текст как суперсила, валидируй код диаграмм

### LLM плохи в:
- **Планировании на много шагов** — проектируй тулы так, чтобы требовалось меньше chaining
- **Строгие форматы (JSON)** — пропущенные кавычки, запятые. Предпочитай Markdown/XML над raw JSON
- **Генерация длинных имён** — длинное имя таблицы = 32 токена на каждое упоминание

---

## 20. Мониторинг

> **Источник:** MCPcat

Мониторь не только технические метрики (response time, error rate), но и **user intentions** — что пользователи пытаются достичь:

- Error tracking с контекстом действия
- Request/response monitoring
- User intention analysis (что пытался сделать агент, когда тул упал)

---

## 21. Источники

| # | Источник | Автор | URL |
|---|---|---|---|
| 1 | **MCP is Not the Problem, It's your Server** | Phil Schmid | [philschmid.de/mcp-best-practices](https://www.philschmid.de/mcp-best-practices) |
| 2 | **Block's Playbook for Designing MCP Servers** | Block Engineering | [engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers](https://engineering.block.xyz/blog/blocks-playbook-for-designing-mcp-servers) |
| 3 | **Top 5 MCP Server Best Practices** | Docker | [docker.com/blog/mcp-server-best-practices](https://www.docker.com/blog/mcp-server-best-practices/) |
| 4 | **MCP Server Best Practices: Production-Grade Guide** | MCPcat | [mcpcat.io/blog/mcp-server-best-practices](https://mcpcat.io/blog/mcp-server-best-practices/) |
| 5 | **Error Handling in MCP Servers** | MCPcat | [mcpcat.io/guides/error-handling-custom-mcp-servers](https://mcpcat.io/guides/error-handling-custom-mcp-servers/) |
| 6 | **MCP Specification** | Anthropic | [modelcontextprotocol.io](https://modelcontextprotocol.io/) |
| 7 | **MCP Tools Specification** | Anthropic | [modelcontextprotocol.io/specification/2025-06-18/server/tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |

---

## 22. Как мы применили это в Kadam MCP

Чек-лист того, как каждая практика реализована в `@kadam/mcp-server`:

| # | Best Practice | Реализация в Kadam MCP |
|---|---|---|
| 1 | MCP ≠ REST | Stats объединены в 1 тул (`get_stats`) вместо 3 эндпоинтов. Campaign status — 1 тул вместо 3 |
| 2 | Outcomes | `get_stats` с `reportType` оркестрирует config + data внутри. `set_campaign_status` маппит человеческие статусы в API-действия |
| 3 | Flat arguments | Enums как строки (`"push"`, `"cpc"`), дефолты на все опциональные поля, Zod `.describe()` |
| 4 | Instructions as context | Каждый тул имеет description с UI-контекстом. Ошибки — agent-friendly с recovery guidance |
| 5 | Tool budget | 27 тулов (было 47 до объединения). Status tools: 3→1, Stats: 3→1 |
| 6 | Naming | `kadam_adv_*` / `kadam_pub_*` prefix для каждого тула |
| 7 | Pagination | `maxResults` (default 25, max 100), `has_more`, `total_count` в каждом ответе |
| 8 | 3 примитива | 27 Tools + 7 Resources + 4 Prompts |
| 9 | Annotations | `readOnlyHint`, `destructiveHint`, `idempotentHint` на каждом туле |
| 10 | 3-tier errors | Transport retries в HttpClient, Protocol через MCP SDK, Application через `isError: true` |
| 11 | Token budget | 50KB truncation guard в `output-formatter.ts` |
| 12 | Prefix caching | Статические описания тулов, без динамических данных |
| 13 | Lazy connections | Тулы listed без валидации ключей. Ошибка auth — только при вызове |
| 14 | Server instructions | Заданы при инициализации `McpServer` с guidance по использованию |
| 15 | Безопасность | `confirm: true` для деструктивных операций, conditional tool registration по API keys |
| 16 | MCP Inspector | Включён в `README.md` как способ тестирования |
| 17 | Распространение | npm (`npx`), Docker, GitLab CI/CD |
| 18 | Namespace | Flat prefix `kadam_adv_*` / `kadam_pub_*` + conditional registration |
| 19 | LLM strengths | Formatted text output, не raw JSON. Таблицы в Markdown |
| 20 | Мониторинг | Pino structured logging, Sentry-compatible error IDs |
