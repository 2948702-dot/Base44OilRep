import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';

const FUNCTIONS = [
  { name: 'generateFleetTestData', label: 'Сгенерировать данные для флота', desc: 'Создаёт реалистичные данные по пробам масла, анализам и событиям смены масла за последний год' },
  { name: 'deleteTestData', label: 'Удалить все тестовые данные', desc: 'Удаляет активы, узлы, пробы и прочие тестовые данные' },
];

export default function AdminPanel() {
  const [loading, setLoading] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const runFunction = async (funcName) => {
    setLoading(funcName);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke(funcName, {});
      setResult({ func: funcName, data: res.data });
    } catch (err) {
      setError({ func: funcName, msg: err.message });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-2">Администрирование</h1>
      <p className="text-slate-600 mb-8">Управление тестовыми данными и очистка БД</p>

      <div className="grid gap-4">
        {FUNCTIONS.map(func => (
          <div key={func.name} className="p-4 bg-white border border-slate-200 rounded-lg">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{func.label}</h3>
                <p className="text-sm text-slate-600 mt-1">{func.desc}</p>
              </div>
              <Button
                onClick={() => runFunction(func.name)}
                disabled={!!loading}
                variant="destructive"
                size="sm"
              >
                {loading === func.name ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Выполнение...</>
                ) : (
                  'Запустить'
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {result && (
        <div className={`mt-8 p-4 border rounded-lg ${result.data.doneCompletely ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <p className={`text-sm font-semibold mb-2 ${result.data.doneCompletely ? 'text-green-900' : 'text-yellow-900'}`}>
            {result.data.message || '✓ Операция выполнена успешно'}
          </p>
          {result.data.deleted && (
            <div className="text-sm text-slate-700 space-y-1">
              {Object.entries(result.data.deleted).map(([k, v]) => (
                <p key={k}>
                  {k}: удалено {v}
                  {result.data.stillRemaining?.[k] && result.data.stillRemaining[k] !== '0' ? ' (ещё есть)' : ''}
                </p>
              ))}
            </div>
          )}
          {!result.data.doneCompletely && (
            <button
              onClick={() => runFunction('deleteTestData')}
              disabled={!!loading}
              className="mt-3 px-4 py-2 bg-yellow-600 text-white rounded text-sm font-medium hover:bg-yellow-700 disabled:opacity-50"
            >
              {loading === 'deleteTestData' ? 'Удаление...' : 'Запустить ещё раз'}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mt-8 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">{error.func}</p>
            <p className="text-sm text-red-700 mt-1">{error.msg}</p>
          </div>
        </div>
      )}
    </div>
  );
}