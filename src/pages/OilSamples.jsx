import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ENGINE_STATES, SAMPLE_STATUSES } from '@/utils/labels';
import StatusBadge from '@/components/StatusBadge';

const DEF = {
  sample_number: '', client_id: '', asset_id: '', equipment_unit_id: '', sampling_point_id: '',
  oil_type_id: '', lifecycle_id: '', sampling_date: '', total_hours_at_sampling: '',
  oil_hours_at_sampling: '', engine_state: 'warm', sample_status: 'pending',
  operator_user_id: '', comments: ''
};

const genSampleNumber = (existing) => {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  const nums = existing
    .map(s => s.sample_number)
    .filter(n => n && n.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
};

export default function OilSamples() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterClient, setFilterClient] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const qc = useQueryClient();

  const { data: samples = [], isLoading } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: lifecycles = [] } = useQuery({ queryKey: ['oil-lifecycles'], queryFn: () => base44.entities.OilLifecycle.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.OilSample.update(d.id, d) : base44.entities.OilSample.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oil-samples'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.OilSample.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oil-samples'] })
  });

  const filtAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);
  const filtUnits = units.filter(u => !form.asset_id || u.asset_id === form.asset_id);
  const filtPoints = points.filter(p => !form.equipment_unit_id || p.equipment_unit_id === form.equipment_unit_id);
  const activeLC = lifecycles.filter(l => l.status === 'active' && (!form.sampling_point_id || l.sampling_point_id === form.sampling_point_id));

  const filtered = samples.filter(s =>
    (!filterClient || s.client_id === filterClient) &&
    (!filterStatus || s.sample_status === filterStatus)
  );

  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Пробы масла</h1>
          <p className="text-slate-500 text-sm mt-0.5">{samples.length} проб</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...DEF, sampling_date: new Date().toISOString().split('T')[0], sample_number: genSampleNumber(samples) }); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить пробу
        </Button>
      </div>

      <div className="flex gap-2 mb-3">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Все клиенты" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Все статусы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Все статусы</SelectItem>
            {Object.entries(SAMPLE_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">№ пробы</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Дата</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Клиент / Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Точка отбора</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Агрегат</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч масла</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Пробы не найдены</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-slate-900 text-xs font-medium">{s.sample_number}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.sampling_date}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  <div className="text-xs font-medium">{getName(clients, s.client_id, 'company_name')}</div>
                  <div className="text-slate-400 text-xs">{getName(assets, s.asset_id, 'asset_name')}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{getName(points, s.sampling_point_id, 'point_name')}</td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{ENGINE_STATES[s.engine_state] || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.oil_hours_at_sampling ?? '—'}</td>
                <td className="px-4 py-2.5"><StatusBadge status={s.sample_status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(s); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить пробу?') && del.mutate(s.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать пробу' : 'Добавить пробу масла'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2 max-h-[75vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>№ пробы <span className="text-red-500">*</span></Label>
              <Input value={form.sample_number} onChange={e => f('sample_number', e.target.value)} placeholder="SO-2024-001" />
            </div>
            <div className="space-y-1">
              <Label>Дата отбора <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.sampling_date} onChange={e => f('sampling_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Состояние агрегата <span className="text-red-500">*</span></Label>
              <Select value={form.engine_state} onValueChange={v => f('engine_state', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ENGINE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Клиент <span className="text-red-500">*</span></Label>
              <Select value={form.client_id} onValueChange={v => f('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Клиент" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Актив</Label>
              <Select value={form.asset_id} onValueChange={v => f('asset_id', v)}>
                <SelectTrigger><SelectValue placeholder="Актив" /></SelectTrigger>
                <SelectContent>{filtAssets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Оборудование</Label>
              <Select value={form.equipment_unit_id} onValueChange={v => f('equipment_unit_id', v)}>
                <SelectTrigger><SelectValue placeholder="Оборудование" /></SelectTrigger>
                <SelectContent>{filtUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unit_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Точка отбора</Label>
              <Select value={form.sampling_point_id} onValueChange={v => f('sampling_point_id', v)}>
                <SelectTrigger><SelectValue placeholder="Точка" /></SelectTrigger>
                <SelectContent>{filtPoints.map(p => <SelectItem key={p.id} value={p.id}>{p.point_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>М/ч всего</Label>
              <Input type="number" value={form.total_hours_at_sampling} onChange={e => f('total_hours_at_sampling', +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч масла</Label>
              <Input type="number" value={form.oil_hours_at_sampling} onChange={e => f('oil_hours_at_sampling', +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Статус пробы</Label>
              <Select value={form.sample_status} onValueChange={v => f('sample_status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SAMPLE_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {activeLC.length > 0 && (
              <div className="col-span-3 space-y-1">
                <Label>Жизненный цикл масла</Label>
                <Select value={form.lifecycle_id} onValueChange={v => f('lifecycle_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Выберите цикл" /></SelectTrigger>
                  <SelectContent>{activeLC.map(l => <SelectItem key={l.id} value={l.id}>{l.start_date} — активный</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="col-span-3 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.sample_number || !form.client_id || !form.sampling_date || !form.engine_state || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}