export const ASSET_TYPES = {
  vessel: 'Судно',
  vehicle: 'Транспортное средство',
  machine: 'Машина',
  industrial: 'Промышленное оборудование'
};

export const EQ_TYPES = {
  main_engine: 'Главный двигатель',
  aux_engine: 'Вспом. двигатель',
  generator: 'Генератор',
  gearbox: 'Редуктор',
  hydraulic: 'Гидравлика',
  compressor: 'Компрессор',
  pump: 'Насос',
  other: 'Прочее'
};

export const SAMPLING_METHODS = {
  pump: 'Насосом',
  drain_plug: 'Из пробки',
  minimess_port: 'Minimess порт'
};

export const ENGINE_STATES = {
  warm: 'Прогретый',
  cold: 'Холодный'
};

export const SAMPLE_STATUSES = {
  pending: 'Ожидает',
  in_analysis: 'В анализе',
  completed: 'Завершена',
  cancelled: 'Отменена'
};

export const EVENT_TYPES = {
  oil_change: 'Замена масла',
  oil_topup: 'Долив масла',
  oil_filter: 'Фильтр масляный',
  air_filter: 'Фильтр воздушный',
  repair: 'Ремонт',
  component_replacement: 'Замена компонента',
  other: 'Прочее'
};

export const PLANNING_METHODS = {
  hours: 'По моточасам',
  date: 'По дате',
  whichever_first: 'По первому событию'
};

export const SCHEDULE_STATUSES = {
  normal: 'Норма',
  due_soon: 'Скоро',
  overdue: 'Просрочено'
};

export const FREQ_TYPES = {
  days: 'дней',
  weeks: 'недель',
  months: 'месяцев',
  hours: 'моточасов',
  hours_or_days_first: 'дней или моточасов (первое)'
};

export const SAE_GRADES = [
  'SAE 0W-20', 'SAE 0W-30', 'SAE 0W-40',
  'SAE 5W-20', 'SAE 5W-30', 'SAE 5W-40',
  'SAE 10W-30', 'SAE 10W-40', 'SAE 10W-60',
  'SAE 15W-40', 'SAE 20W-50',
  'SAE 30', 'SAE 40', 'SAE 50',
  'SAE 80W-90', 'SAE 85W-140',
  'SAE 75W-90', 'SAE 75W-140'
];