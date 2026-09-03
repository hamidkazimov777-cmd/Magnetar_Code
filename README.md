<div align="center">

# Magnetar Code

**Терминальный AI-агент для кода + локальный веб-монитор.**
Bring your own key — любой OpenAI-совместимый эндпоинт.

</div>

---

> **Статус: ранняя разработка.** Готовы ядро и CLI (фазы 0–2 плана).
> Веб-монитор и локальный демон — следующие. План: [`docs/PLAN.md`](docs/PLAN.md).

## Установка

```bash
npm i -g magnetar-code
magnetar
```

Или без установки:

```bash
npx magnetar-code
```

## Настройка провайдера (BYOK)

```bash
magnetar provider
```

Выбираешь пресет (OpenRouter, TokenRouter, Kimi, OpenAI, DeepSeek, Together,
LM Studio, Ollama) — остаётся ввести только API-ключ. Список моделей подтягивается
с эндпоинта автоматически. Ключ уходит в системный keychain, а не в конфиг.

## Неинтерактивный режим

```bash
magnetar -p "какие роуты есть в этом приложении?"
cat error.log | magnetar -p "почему падает"
magnetar -p "добавь health check" --permission-mode auto-edit --output-format json
```

## Структура репозитория

| Пакет           | npm                         | Что это                                             |
| --------------- | --------------------------- | --------------------------------------------------- |
| `packages/core` | `@magnetar/core` (internal) | Провайдеры, agent loop, инструменты, сессии, память |
| `packages/cli`  | `magnetar-code`             | TUI и неинтерактивный режим                         |
| `packages/web`  | `@magnetar/web` (internal)  | Веб-монитор рабочей папки                           |

## Разработка

```bash
npm install          # один раз, из корня — npm workspaces
npm run check        # format:check + lint + typecheck + test
npm run cli          # запустить CLI из исходников
npm run dev -w @magnetar/web
```

Требуется Node.js >= 20.11. CI гоняет проверки на Node 20, 22 и 24.

## Безопасность

Агент умеет выполнять команды и править файлы. По умолчанию каждое такое действие
требует подтверждения. Никогда не запускай агента с отключёнными подтверждениями
в директории, содержимому которой не доверяешь.

## Лицензия

MIT © Hamid Kazimov
