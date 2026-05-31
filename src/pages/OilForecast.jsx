import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, Send } from 'lucide-react';

const PERIODS = [
  { label: '1 месяц', months: 1 },
  { label: '3 месяца', months: 3 },
  { label: '6 месяцев', months: 6 },
  { label: '12 месяцев', months: 12 },
];

export default function OilForecast() {
  const [period, setPeriod] = useState(3);
  const [selectedAssets, setSelectedAssets] = useState([]);
  const [showForecast, setShowForecast] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: schedules = [] } = useQuery({ queryKey: ['maintenance-schedules'], queryFn: () => base44.entities.MaintenanceSchedule.list() });
  const { data: events = [] } = useQuery({ queryKey: ['maintenance-events'], queryFn: () => base44.entities.MaintenanceEvent.list() });

  const toggleAsset = (id) => {
    setSelectedAssets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setShowForecast(false);
  };

  const forecast = useMemo(() => {
    if (!showForecast) return [];
    const assetIds = selectedAssets.length > 0 ? selectedAssets : assets.map(a => a.id);
    const now = new Date();
    const endDate = new Date(now);
    endDate.setMonth(endDate.getMonth() + period);

    // Group oil changes by oil type per asset
    const rows = {};
    const key = (assetId, oilId) => `${assetId}__${oilId}`;

    // From maintenance schedules (planned oil changes)
    schedules.forEach(s => {
      if (!assetIds.includes(s.asset_id)) return;
      // include all oil-related maintenance schedules
      const pt = points.find(p => p.id === s.sampling_point_id);
      if (!pt?.oil_type_id || !pt.oil_volume) return;
      const k = key(s.asset_id, pt.oil_type_id);
      if (!rows[k]) rows[k] = { asset_id: s.asset_id, oil_id: pt.oil_type_id, changes: 0, volume: 0 };
      rows[k].changes += 1;
      rows[k].volume += pt.oil_volume;
    });

    // Estimate topups from historical events (average per month × period)
    const topups = {};
    events.forEach(e => {
      if (e.event_type !== 'oil_topup' || !assetIds.includes(e.asset_id)) return;
      const pt2 = points.find(p => p.id === e.sampling_point_id);
      const oilId = e.new_oil_type_id || e.old_oil_type_id || pt2?.oil_type_id;
      if (!oilId) return;
      const k = key(e.asset_id, oilId);
      if (!topups[k]) topups[k] = { asset_id: e.asset_id, oil_id: oilId, total: 0, count: 0 };
      topups[k].total += (e.added_oil_volume || 0);
      topups[k].count++;
    });

    Object.entries(topups).forEach(([k, t]) => {
      const avgPerEvent = t.count > 0 ? t.total / t.count : 0;
      const projectedEvents = Math.ceil(t.count / 12 * period);
      if (!rows[k]) rows[k] = { asset_id: t.asset_id, oil_id: t.oil_id, changes: 0, volume: 0 };
      rows[k].volume += avgPerEvent * projectedEvents;
    });

    return Object.values(rows).map(r => ({
      ...r,
      asset_name: assets.find(a => a.id === r.asset_id)?.asset_name || '—',
      client_name: (() => { const a = assets.find(x => x.id === r.asset_id); return clients.find(c => c.id === a?.client_id)?.company_name || '—'; })(),
      oil_name: oils.find(o => o.id === r.oil_id)?.oil_name || '—',
      oil_manufacturer: oils.find(o => o.id === r.oil_id)?.manufacturer || '—',
    })).sort((a, b) => b.volume - a.volume);
  }, [showForecast, period, selectedAssets, assets, points, oils, schedules, events]);

  const totalByOil = useMemo(() => {
    const map = {};
    forecast.forEach(r => {
      const k = r.oil_id;
      if (!map[k]) map[k] = { oil_name: r.oil_name, manufacturer: r.oil_manufacturer, total: 0 };
      map[k].total += r.volume;
    });
    return Object.values(map);
  }, [forecast]);

  const sendReport = async () => {
    if (!email) return;
    setSending(true);
    const rows = forecast.map(r => `${r.client_name} / ${r.asset_name} — ${r.oil_name}: ${r.volume.toFixed(0)} л`).join('\n');
    const summary = totalByOil.map(o => `${o.oil_name} (${o.manufacturer}): ${o.total.toFixed(0)} л`).join('\n');
    await base44.integrations.Core.SendEmail({
      to: email,
      subject: `SmartOil — Прогноз потребности в масле на ${period} мес.`,
      body: `Прогноз потребности в масле на ${period} месяцев\n\nПо объектам:\n${rows}\n\nИТОГО по маркам масла:\n${summary}\n\nДата формирования: ${new Date().toLocaleDateString('ru-RU')}`
    });
    setSending(false);
    setSent(true);
    setTimeout(() => setSent(false), 3000);
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Прогноз потребности в масле</h1>
        <p className="text-slate-500 text-sm mt-0.5">Планирование закупок на основе графиков ТО и истории доливок</p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label>Период прогноза</Label>
            <Select value={String(period)} onValueChange={v => { setPeriod(+v); setShowForecast(false); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>{PERIODS.map(p => <SelectItem key={p.months} value={String(p.months)}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={() => setShowForecast(true)} className="gap-2">
            <TrendingUp className="w-4 h-4" />Рассчитать прогноз
          </Button>
        </div>

        <div>
          <Label className="mb-2 block">Выбрать активы (не выбрано = все)</Label>
          <div className="flex flex-wrap gap-2">
            {assets.map(a => (
              <button
                key={a.id}
                onClick={() => toggleAsset(a.id)}
                className={`px-3 py-1 rounded-full text-xs border transition-colors ${selectedAssets.includes(a.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}
              >
                {a.asset_name}
              </button>
            ))}
            {selectedAssets.length > 0 && (
              <button onClick={() => setSelectedAssets([])} className="px-3 py-1 rounded-full text-xs border border-slate-200 text-slate-400 hover:text-slate-600">
                Сбросить
              </button>
            )}
          </div>
        </div>
      </div>

      {showForecast && (
        <>
          {forecast.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-10 text-center text-slate-400">
              Нет данных для прогноза. Добавьте планы ТО с типом, содержащим слово "масл".
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm">Детальный прогноз по объектам</h3>
                  <p className="text-xs text-slate-500">Период: {period} мес. · {forecast.length} позиций</p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Клиент</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Актив</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Марка масла</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Производитель</th>
                      <th className="text-right px-4 py-2.5 font-medium text-slate-600 text-xs">Объём, л</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.map((r, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-700 text-xs">{r.client_name}</td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{r.asset_name}</td>
                        <td className="px-4 py-2.5 text-slate-700">{r.oil_name}</td>
                        <td className="px-4 py-2.5 text-slate-500 text-xs">{r.oil_manufacturer}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-slate-900">{r.volume.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-lg border border-slate-200">
                <div className="px-4 py-3 border-b border-slate-100">
                  <h3 className="font-semibold text-slate-800 text-sm">Итого по маркам масла</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Марка масла</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Производитель</th>
                      <th className="text-right px-4 py-2.5 font-medium text-slate-600 text-xs">Итого, л</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalByOil.map((o, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">{o.oil_name}</td>
                        <td className="px-4 py-2.5 text-slate-500">{o.manufacturer}</td>
                        <td className="px-4 py-2.5 text-right text-xl font-bold text-blue-700">{o.total.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-800 text-sm mb-3">Отправить отчёт закупщику</h3>
                <div className="flex gap-3">
                  <Input
                    type="email"
                    placeholder="Email закупщика..."
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="max-w-sm"
                  />
                  <Button onClick={sendReport} disabled={!email || sending || sent} className="gap-2">
                    <Send className="w-4 h-4" />
                    {sending ? 'Отправка...' : sent ? '✓ Отправлено' : 'Отправить'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}