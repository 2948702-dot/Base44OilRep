import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2 } from 'lucide-react';

const FUNCTIONS = [
  { name: 'assignDonRechFlotToAssets', label: 'Присвоить ДонРечФлот судам без клиента', desc: 'Добавляет клиента ДонРечФлот ко всем судам без клиента' },
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
        <div className="p-4 bg-slate-100 border border-slate-300 rounded-lg text-center text-slate-600">
          <p>Все временные функции удалены.</p>
        </div>
      </div>

      {result && (
        <div className="mt-8 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-semibold text-green-900 mb-2">✓ {result.func} успешно выполнена</p>
          <pre className="text-xs text-green-800 overflow-auto max-h-40">
            {JSON.stringify(result.data, null, 2)}
          </pre>
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