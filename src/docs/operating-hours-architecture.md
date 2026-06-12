# Operating Hours Architecture

## Источники данных

### MaintenanceEvent — журнал событий (источник истины)

Все изменения моточасов и масла фиксируются только через записи `MaintenanceEvent`.  
Никогда не обновляйте `EquipmentUnit.current_*` напрямую из фронта.

| Тип события | Эффект |
|---|---|
| `hour_reading` | Фиксирует текущие м/ч агрегата; если указано `oil_hours` — сбрасывает точку отсчёта м/ч масла |
| `oil_change` | Сбрасывает счётчик м/ч масла до 0 (или указанного значения); меняет тип масла; закрывает активный OilLifecycle |
| `oil_topup` | Добавляет объём масла; м/ч масла продолжают накапливаться без сброса |

---

## EquipmentUnit — поля

| Поле | Тип | Назначение |
|---|---|---|
| `total_operating_hours` | стартовое | Начальные м/ч агрегата на момент регистрации в системе |
| `initial_oil_hours` | стартовое | Начальные м/ч масла (если масло уже б/у) |
| `current_total_hours` | **производный снимок** | Рассчитывается `recalculateEquipmentUnitState` — не редактировать вручную |
| `current_oil_hours` | **производный снимок** | Рассчитывается `recalculateEquipmentUnitState` — не редактировать вручную |
| `current_oil_type_id` | **производный снимок** | Тип масла после последней замены |

### Алгоритм расчёта current_oil_hours

```
current_oil_hours = lastResetOilHours + (currentTotal - lastResetTotal)
```

Точка отсчёта (`lastResetTotal`, `lastResetOilHours`) сбрасывается при:
- `oil_change` → обычно `lastResetOilHours = 0`
- `hour_reading` с явно указанным `oil_hours`

---

## Место отбора — сам агрегат

Отдельная сущность `SamplingPoint` удалена. По продуктовой модели один агрегат имеет одно место отбора:

- `OilSample`, `SamplingSchedule`, `MaintenanceEvent` и `OilLifecycle` ссылаются на `equipment_unit_id`;
- QR-код хранится в `EquipmentUnit.sampling_qr_code`;
- способ отбора хранится в `EquipmentUnit.sampling_method`;
- актуальные моточасы и масло берутся только из `EquipmentUnit.current_*`.

---

## Backend-функции

### `saveMobileMaintenanceEvent`
- Используется мобильным интерфейсом (MobileSampling).
- Выполняет RBAC-проверку (`captain` → `asset_id`, `superintendent` → `client_id`, `admin` → всё).
- Использует `asServiceRole` **только после** проверки прав.
- Обновляет `EquipmentUnit.current_*` через встроенный `recalcUnit`.

### `saveMaintenanceEvent`
- Используется desktop-интерфейсом (MaintenanceEvents).
- Аналогичная RBAC-логика и lifecycle-менеджмент.
- Единая бизнес-логика для desktop и mobile.

### `recalculateEquipmentUnitState`
- Перепроигрывает историю событий для агрегата и пересчитывает `current_*`.
- **Требует проверки прав**: `captain` — только свой `asset_id`, `superintendent` — только свой `client_id`.
- Вызывается после create/update/delete `MaintenanceEvent` и после save `EquipmentUnit`.

### `migrateEquipmentUnitState`
- Административный инструмент (только `admin`).
- Запускается один раз при миграции данных.

---

## Desktop vs Mobile — одна логика

| | Desktop | Mobile |
|---|---|---|
| Создание события ТО | `saveMaintenanceEvent` | `saveMobileMaintenanceEvent` |
| Lifecycle-менеджмент | backend (service role) | backend (service role) |
| Пересчёт current_* | backend | backend |

---

## viscosity_100 — не используется

Вязкость при 100°C **не измеряется** в рабочем лабораторном процессе.  
- Отсутствует в схеме `AnalysisResult`.  
- Не отображается в UI форм и таблиц.  
- Не отправляется в payload `AnalysisResult`.  
- Отсутствует в `ThresholdRules.PARAMS`.  
- Отсутствует в PDF-отчётах (`pdfExport.js`).

Если в базе данных есть старые `ThresholdRule` с `parameter_name = 'viscosity_100'` — они не будут удалены автоматически, но UI больше не позволяет создавать новые правила для этого параметра.
