import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, Info } from 'lucide-react';

const ENTITY_LABELS = {
  AnalysisResult: 'Результаты анализов',
  MaintenanceEvent: 'События обслуживания',
  OilLifecycle: 'Жизненные циклы масла',
  OilSample: 'Пробы масла',
  SamplingPoint: 'Точки отбора',
  EquipmentUnit: 'Узлы оборудования',
  Asset: 'Активы (суда)',
};

const FUNCTIONS = [
  {
    name: 'generateFleetTestData',
    label: 'Сгенерировать данные для флота',
    desc: 'Создаёт реалистичные данные по пробам масла, анализам и событиям смены масла за последний год',
  },
  {
    name: 'deleteTestData',
    label: 'Удалить все тестовые данные',
    desc: 'Удаляет активы, узлы, точки отбора, пробы, анализы и пр. (50 записей за запуск)',
  },
];

export default function AdminPanel() {
  const [loading, setLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [counts, setCounts] = useState(null);
  const [countsLoading, setCountsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const fetchCounts = async () => {
    setCountsLoading(true);
    try {
      const [ar, me, ol, os, sp, eu, a] = await Promise.all([
        base44.entities.AnalysisResult.list('id', 1000),
        base44.entities.MaintenanceEvent.list('id', 1000),
        base44.entities.OilLifecycle.list('id', 1000),
        base44.entities.OilSample.list('id', 1000),
        base44.entities.SamplingPoint.list('id', 1000),
        base44.entities.EquipmentUnit.list('id', 1000),
        base44.entities.Asset.list('id', 1000),
      ]);
      setCounts({
        AnalysisResult: ar.length,
        MaintenanceEvent: me.length,
        OilLifecycle: ol.length,
        OilSample: os.length,
        SamplingPoint: sp.length,
        EquipmentUnit: eu.length,
        Asset: a.length,
      });
    } finally {
      setCountsLoading(false);
    }
  };

  useEffect(() => { fetchCounts(); }, []);

  const runFunction = async (funcName) => {
    setLoading(funcName);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke(funcName, {});
      setResult({ func: funcName, data: res.data });
      await fetchCounts();
    } catch (err) {
      setError({ func: funcName, msg: err.message });
    } finally {
      setLoading(null);
    }
  };

  const totalRecords = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Администрирование</h1>
      <p className="text-slate-600 mb-8">Управление тестовыми данными и очистка БД</p>

      {/* Current DB counts */}
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Текущее состояние базы данных</h2>
          <button onClick={fetchCounts} disabled={countsLoading} className="text-xs text-slate-500 hover:text-slate-800 underline">
            {countsLoading ? 'Обновление...' : 'Обновить'}
          </button>
        </div>
        {countsLoading && !counts ? (
          <p className="text-sm text-slate-400">Загрузка...</p>
        ) : counts ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(ENTITY_LABELS).map(([key, label]) => (
              <div key={key} className="bg-white border border-slate-200 rounded px-3 py-2">
                <p className="text-xs text-slate-500 leading-tight">{label}</p>
                <p className={`text-lg font-bold mt-0.5 ${counts[key] > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                  {counts[key]}
                </p>
              </div>
            ))}
            <div className="bg-slate-800 text-white border border-slate-700 rounded px-3 py-2">
              <p className="text-xs text-slate-300 leading-tight">Всего записей</p>
              <p className="text-lg font-bold mt-0.5">{totalRecords}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4">
        {FUNCTIONS.map(func => (
          <div key={func.name} className="p-4 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{func.label}</h3>
                <p className="text-sm text-slate-600 mt-1">{func.desc}</p>
                {func.name === 'deleteTestData' && counts && totalRecords > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    Будет удалено до 50 записей каждого типа. Всего сейчас: {totalRecords} записей.
                  </p>
                )}
                {func.name === 'deleteTestData' && counts && totalRecords === 0 && (
                  <p className="text-xs text-green-600 mt-1">База данных уже пуста.</p>
                )}
              </div>
              <div className="relative flex-shrink-0">
                <Button
                  onClick={() => runFunction(func.name)}
                  disabled={!!loading}
                  variant={func.name === 'deleteTestData' ? 'destructive' : 'default'}
                  size="sm"
                  onMouseEnter={() => func.name === 'deleteTestData' && setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                >
                  {loading === func.name ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Выполнение...</>
                  ) : (
                    'Запустить'
                  )}
                </Button>
                {func.name === 'deleteTestData' && showTooltip && counts && (
                  <div className="absolute right-0 top-10 z-50 w-64 bg-slate-900 text-white text-xs rounded-lg p-3 shadow-xl">
                    <p className="font-semibold mb-2 text-slate-200">Записей в базе:</p>
                    {Object.entries(ENTITY_LABELS).map(([key, label]) => (
                      <div key={key} className="flex justify-between py-0.5">
                        <span className="text-slate-300">{label}</span>
                        <span className={counts[key] > 0 ? 'text-yellow-300 font-bold' : 'text-slate-500'}>{counts[key]}</span>
                      </div>
                    ))}
                    <div className="border-t border-slate-700 mt-2 pt-2 flex justify-between">
                      <span className="text-slate-300">Итого</span>
                      <span className="text-white font-bold">{totalRecords}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {result && result.data.deleted && (
        <div className={`mt-6 p-4 border rounded-lg ${result.data.doneCompletely ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <p className={`text-sm font-semibold mb-3 ${result.data.doneCompletely ? 'text-green-900' : 'text-yellow-900'}`}>
            {result.data.message || '✓ Операция выполнена'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            {Object.entries(result.data.deleted).map(([k, v]) => (
              <div key={k} className="bg-white border rounded px-3 py-2">
                <p className="text-xs text-slate-500 leading-tight">{ENTITY_LABELS[k] || k}</p>
                <p className="text-lg font-bold text-red-600 mt-0.5">−{v}</p>
                {result.data.stillRemaining?.[k] && result.data.stillRemaining[k] !== '0' && (
                  <p className="text-xs text-yellow-600">ещё есть</p>
                )}
              </div>
            ))}
          </div>
          {!result.data.doneCompletely && (
            <button
              onClick={() => runFunction('deleteTestData')}
              disabled={!!loading}
              className="px-4 py-2 bg-yellow-600 text-white rounded text-sm font-medium hover:bg-yellow-700 disabled:opacity-50"
            >
              {loading === 'deleteTestData' ? 'Удаление...' : 'Запустить ещё раз'}
            </button>
          )}
        </div>
      )}

      {result && !result.data.deleted && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-900">{result.data.message || '✓ Операция выполнена успешно'}</p>
        </div>
      )}

      {error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">{error.func}</p>
            <p className="text-sm text-red-700 mt-1">{error.msg}</p>
          </div>
        </div>
      )}

      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold mb-1">Ручное удаление (быстрее):</p>
          <p>Зайдите в <strong>Dashboard → Data</strong> (левое меню платформы Base44), выберите нужную сущность, выделите все записи и нажмите <strong>Delete</strong>. Повторите для каждой сущности.</p>
        </div>
      </div>
    </div>
  );
}