import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { TrendingUp, Send, Download } from 'lucide-react';

export default function OilForecast() {
  const [period, setPeriod] = useState('3');
  const [filterClient, setFilterClient] = useState('');
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: schedules = [] } = useQuery({ queryKey: ['maintenance-schedules'], queryFn: () => base44.entities.MaintenanceSchedule.list() });
  const { data: events = [] } = useQuery({ queryKey: ['maintenance-events'], queryFn: () => base44.entities.MaintenanceEvent.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });

  const monthsAhead = parseInt(period) || 3;
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + monthsAhead);

  const forecast = useMemo(() => {
    const filteredAssets = assets.filter(a => !filterClient || a.client_id === filterClient);
    const filteredAssetIds = new Set(filteredAssets.map(a => a.id));
    const filteredPoints = points.filter(p => filteredAssetIds.has(p.asset_id));

    // For each point with oil, estimate planned oil changes
    const forecastMap = {};
    filteredPoints.forEach(pt => {
      if (!pt.oil_type_id || !pt.oil_volume) return;
      const oil = oils.find(o => o.id === pt.oil_type_id);
      if (!oil) return;
      const asset = assets.find(a => a.id === pt.asset_id);
      const client = clients.find(c => c.id === pt.client_id);
      const schedule = schedules.find(s => s.sampling_point_id === pt.id && s.maintenance_type?.toLowerCase().includes('масло'));

      let plannedChanges = 0;
      if (schedule) {
        if (schedule.planning_method === 'hours' && schedule.interval_hours && schedule.remaining_hours != null) {
          plannedChanges = Math.max(0, Math.floor(monthsAhead / (schedule.interval_hours / 200)));
        } else if (schedule.planning_method === 'date' && schedule.target_date) {
          const targetDate = new Date(schedule.target_date);
          plannedChanges = targetDate <= endDate ? 1 : 0;
        }
      } else {
        plannedChanges = 1; // Default: 1 change per period
      }

      // Average topups from history
      const pointTopups = events.filter(e => e.sampling_point_id === pt.id && e.event_type === 'oil_topup');
      const avgTopupVol = pointTopups.length > 0
        ? pointTopups.reduce((s, e) => s + (e.added_oil_volume || 0), 0) / pointTopups.length
        : pt.oil_volume * 0.1; // Estimate 10% topup

      const totalVol = plannedChanges * pt.oil_volume + monthsAhead * avgTopupVol;
      const key = `${asset?.asset_name || 'Неизвестный'}__${oil.oil_name}__${client?.company_name || ''}`;
      if (!forecastMap[key]) {
        forecastMap[key] = { asset: asset?.asset_name || '—', client: client?.company_name || '—', oil: oil.oil_name, manufacturer: oil.manufacturer, volume: 0, changes: 0 };
      }
      forecastMap[key].volume += totalVol;
      forecastMap[key].changes += plannedChanges;
    });

    return Object.values(forecastMap).sort((a, b) => b.volume - a.volume);
  }, [assets, points, oils, schedules, events, clients, filterClient, monthsAhead]);

  const totalVolume = forecast.reduce((s, r) => s + r.volume, 0);

  const sendEmail = async () => {
    if (!email) return;
    setSending(true);
    const rows = forecast.map(r => `${r.client} / ${r.asset} | ${r.oil} (${r.manufacturer}) | ${r.volume.toFixed(0)} л | ${r.changes} смен`).join('\n');
    const body = `Прогноз потребности в масле на ${monthsAhead} месяц(а)\n\nДата формирования: ${new Date().toLocaleDateString('ru-RU')}\n\nCудно / Актив | Марка масла | Объём | Смен\n${'—'.repeat(60)}\n${rows}\n\n${'—'.repeat(60)}\nИТОГО: ${totalVolume.toFixed(0)} л`;
    await base44.integrations.Core.SendEmail({ to: email, subject: `SmartOil — Прогноз масла на ${monthsAhead} мес. | ${new Date().toLocaleDateString('ru-RU')}`, body });
    setSending(false);
    setEmailOpen(false);
    setEmail('');
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Прогноз потребности в масле</h1>
          <p className="text-slate-500 text-sm mt-0.5">Расчёт потребности по судам и маркам масел</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEmailOpen(true)} disabled={forecast.length === 0}>
            <Send className="w-4 h-4 mr-1.5" />Отправить закупщику
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label>Период прогноза</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 месяц</SelectItem>
                <SelectItem value="3">3 месяца</SelectItem>
                <SelectItem value="6">6 месяцев</SelectItem>
                <SelectItem value="12">12 месяцев</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Фильтр по клиенту</Label>
            <Select value={filterClient} onValueChange={setFilterClient}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Все клиенты" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>Все клиенты</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-blue-50 rounded-lg px-4 py-2 ml-auto">
            <p className="text-xs text-blue-600 font-medium">Итого потребность</p>
            <p className="text-2xl font-bold text-blue-800">{totalVolume.toFixed(0)} л</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Прогноз на {monthsAhead} месяц(а) — по {endDate.toLocaleDateString('ru-RU')}</p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Клиент</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Судно / Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Марка масла</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Производитель</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Смен</th>
              <th className="text-right px-4 py-2.5 font-medium text-slate-600 text-xs">Объём, л</th>
            </tr>
          </thead>
          <tbody>
            {forecast.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-slate-400">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                <p>Нет данных для расчёта прогноза</p>
                <p className="text-xs mt-1">Добавьте точки отбора с объёмом масла и планами ТО</p>
              </td></tr>
            ) : forecast.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-600 text-xs">{r.client}</td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{r.asset}</td>
                <td className="px-4 py-2.5 text-slate-700">{r.oil}</td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{r.manufacturer}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.changes}</td>
                <td className="px-4 py-2.5 text-right font-bold text-slate-900">{r.volume.toFixed(0)}</td>
              </tr>
            ))}
            {forecast.length > 0 && (
              <tr className="bg-slate-50 border-t border-slate-200">
                <td colSpan={5} className="px-4 py-2.5 text-right font-semibold text-slate-700 text-sm">ИТОГО:</td>
                <td className="px-4 py-2.5 text-right font-bold text-blue-700 text-lg">{totalVolume.toFixed(0)} л</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Отправить отчёт закупщику</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-slate-50 rounded-md p-3 text-xs text-slate-600">
              Будет отправлен прогноз на {monthsAhead} месяц(а):<br />
              {forecast.length} позиций · итого {totalVolume.toFixed(0)} л
            </div>
            <div className="space-y-1">
              <Label>Email получателя *</Label>
              <Input type="email" placeholder="procurement@company.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Отмена</Button>
            <Button onClick={sendEmail} disabled={!email || sending}>
              <Send className="w-4 h-4 mr-1.5" />{sending ? 'Отправка...' : 'Отправить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}