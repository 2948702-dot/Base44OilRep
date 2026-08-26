# SmartOil

> В репозитории также разрабатывается второй продукт — **AI Investigation Platform**
> («Объяснительная»): платформа внутренних корпоративных расследований.
> Собственный стек: PostgreSQL + pgvector, Node + Fastify, Docker на VPS; Base44 не используется.
> Код: `investigation/`, `src/investigation/`. Документация:
> [`src/docs/investigation/README.md`](src/docs/investigation/README.md).

SmartOil - система учета и предиктивной диагностики масел и оборудования. Она объединяет лабораторные пробы, состояние агрегатов, события обслуживания, жизненные циклы масла, пороговые правила и план-факт замены масла.

## Стек

- React 18, Vite, Tailwind CSS, shadcn/ui
- TanStack Query
- Base44 entities и RLS
- Base44 serverless functions на Deno/TypeScript
- Recharts для аналитики

## Ключевая модель

```text
Client -> Asset -> EquipmentUnit -> OilSample -> AnalysisResult
                         |
                         +-> MaintenanceEvent
                         +-> OilLifecycle
                         +-> MaintenanceSchedule
                         +-> SamplingSchedule
```

Отдельной сущности `SamplingPoint` в продуктовой модели больше нет. Один агрегат является одним местом отбора; QR-код и способ отбора хранятся в `EquipmentUnit`.

Источники истины:

- моточасы и текущее масло: `MaintenanceEvent -> EquipmentUnit.current_*`;
- результаты лаборатории: `OilSample -> AnalysisResult`;
- пороги: индивидуальные границы агрегата или стандартные правила выбранного масла;
- состояние масла на момент отбора: snapshot-поля в `OilSample`.

## Быстрый старт

Требуется Node.js и npm.

```bash
npm install
npm run dev
```

Для локального запуска создайте `.env.local`:

```env
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
```

Обязательные проверки:

```bash
npm run build
npm run lint
```

Дополнительная проверка типов:

```bash
npm run typecheck
```

На текущем baseline `typecheck` имеет известные ошибки типизации JSX и SDK; см. `KI-011` в `src/docs/known-issues.md`.

## GitHub и Base44

Репозиторий синхронизирован с Base44. Изменения, отправленные в основную ветку GitHub, появляются в редакторе Base44. Публикация production-версии выполняется отдельно кнопкой Publish в Base44.

Перед изменением сущностей или backend-функций:

1. прочитайте `AGENTS.md`;
2. проверьте ограничения Base44;
3. не выполняйте запись в production без прямого разрешения владельца;
4. после изменения запустите build и lint.

## Документация

Главная карта документов: [`src/docs/README.md`](src/docs/README.md).

Обязательное чтение для разработчиков и AI-агентов:

- [`AGENTS.md`](AGENTS.md) - правила работы агентов;
- [`src/docs/architecture-overview.md`](src/docs/architecture-overview.md) - архитектура и потоки данных;
- [`src/docs/data-model.md`](src/docs/data-model.md) - сущности и связи;
- [`src/docs/business-rules.md`](src/docs/business-rules.md) - бизнес-правила;
- [`src/docs/decisions.md`](src/docs/decisions.md) - принятые решения;
- [`src/docs/known-issues.md`](src/docs/known-issues.md) - риски и технический долг;
- [`ROADMAP.md`](ROADMAP.md) - текущий продуктовый статус;
- [`src/docs/investigation/README.md`](src/docs/investigation/README.md) - платформа расследований.

## Структура репозитория

```text
base44/entities/       схемы сущностей и RLS
base44/functions/      независимые backend-функции Base44
src/pages/             страницы приложения
src/components/        прикладные и UI-компоненты
src/hooks/             общие React-хуки
src/utils/             резолверы и общая бизнес-логика
src/docs/              архитектурная и эксплуатационная документация
```

## Поддержка Base44

- [GitHub integration](https://docs.base44.com/Integrations/Using-GitHub)
- [Base44 support](https://app.base44.com/support)
