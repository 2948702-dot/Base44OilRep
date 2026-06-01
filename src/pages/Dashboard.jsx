import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import KPICard from '@/components/KPICard';
import StatusBadge from '@/components/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { FlaskConical, CheckCircle2, AlertTriangle, XCircle, Activity, CalendarClock } from 'lucide-react';


export default function Dashboard() {
  const navigate = useNavigate();
  const { isAdmin, isSuperintendent, isCaptain, assignedAssetId, assignedClientId } = useRoleAccess();
  
  const { data: samples = [] } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: results = [] } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });
  const { data: schedules = [] } = useQuery({ queryKey: ['maintenance-schedules'], queryFn: () => base44.entities.MaintenanceSchedule.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });

  // Filter data by role (before early return and hooks)
  let filteredSamples = samples;
  let filteredResults = results;
  let filteredSchedules = schedules;
  let filteredAssets = assets;
  let filteredClients = clients;

  if (isCaptain && assignedAssetId) {
    filteredAssets = assets.filter(a => a.id === assignedAssetId);
    filteredSamples = samples.filter(s => s.asset_id === assignedAssetId);
    filteredSchedules = schedules.filter(s => s.asset_id === assignedAssetId);
  } else if (isSuperintendent && assignedClientId) {
    const clientAssetIds = new Set(assets.filter(a => a.client_id === assignedClientId).map(a => a.id));
    filteredClients = clients.filter(c => c.id === assignedClientId);
    filteredAssets = assets.filter(a => a.client_id === assignedClientId);
    filteredSamples = samples.filter(s => s.client_id === assignedClientId || clientAssetIds.has(s.asset_id));
    filteredSchedules = schedules.filter(s => s.client_id === assignedClientId || clientAssetIds.has(s.asset_id));
  }

  // All hooks must be before early return
  const green = filteredResults.filter(r => r.overall_status === 'green').length;
  const yellow = filteredResults.filter(r => r.overall_status === 'yellow').length;
  const red = filteredResults.filter(r => r.overall_status === 'red').length;
  const avgOHI = filteredResults.length > 0
    ? Math.round(filteredResults.reduce((s, r) => s + (r.oil_health_index || 0), 0) / filteredResults.length)
    : null;

  const samplesByMonth = useMemo(() => {
    const map = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
      map[key] = 0;
    }
    filteredSamples.forEach(s => {
      if (!s.sampling_date) return;
      const d = new Date(s.sampling_date);
      const key = d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
      if (map[key] !== undefined) map[key]++;
    });
    return Object.entries(map).map(([month, count]) => ({ month, count }));
  }, [filteredSamples]);

  const statusData = [
    { name: 'Норма', value: green, color: '#16A34A' },
    { name: 'Внимание', value: yellow, color: '#CA8A04' },
    { name: 'Критично', value: red, color: '#DC2626' },
  ].filter(d => d.value > 0);

  const needAttention = filteredSchedules.filter(s => s.status === 'due_soon' || s.status === 'overdue');

  // Early return for captain after all hooks
  if (isCaptain && assignedAssetId) {
    navigate(`/vessel/${assignedAssetId}`, { replace: true });
    return null;
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Дашборд</h1>
        <p className="text-slate-500 text-sm mt-0.5">Мониторинг состояния масла · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <KPICard title="Всего проб" value={filteredSamples.length} icon={FlaskConical} color="blue" />
        <KPICard title="Норма" value={green} icon={CheckCircle2} color="green" />
        <KPICard title="Внимание" value={yellow} icon={AlertTriangle} color="yellow" />
        <KPICard title="Критично" value={red} icon={XCircle} color="red" />
        <KPICard title="Средний OHI" value={avgOHI !== null ? `${avgOHI}%` : '—'} icon={Activity} color="blue" subtitle="Индекс здоровья масла" />
        <KPICard title={isAdmin ? "Клиентов" : "Судов"} value={isAdmin ? filteredClients.length : filteredAssets.length} icon={CalendarClock} color="slate" subtitle={isAdmin ? `${filteredAssets.length} активов` : ''} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 text-sm mb-3">Пробы по месяцам</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={samplesByMonth} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: '1px solid #e2e8f0' }} />
              <Bar dataKey="count" name="Пробы" fill="#2563EB" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-800 text-sm mb-3">Статусы анализов</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="45%" innerRadius={55} outerRadius={80} dataKey="value" paddingAngle={2}>
                  {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-slate-400 text-sm">Нет данных</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-slate-800 text-sm">Техническое обслуживание</h3>
            <p className="text-xs text-slate-500 mt-0.5">Требует внимания: {needAttention.length}</p>
          </div>
        </div>
        {needAttention.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-sm">{filteredSchedules.length === 0 ? 'Планы ТО не заведены' : 'Все планы в норме ✓'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Метод</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Остаток ч.</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Остаток дн.</th>
                <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              </tr>
            </thead>
            <tbody>
              {needAttention.slice(0, 8).map(s => (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-800">{s.maintenance_type}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{s.planning_method}</td>
                  <td className="px-4 py-2.5 text-slate-600">{s.remaining_hours ?? '—'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{s.remaining_days ?? '—'}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
