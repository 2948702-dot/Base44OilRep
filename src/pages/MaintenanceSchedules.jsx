import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PLANNING_METHODS } from '@/utils/labels';
import StatusBadge from '@/components/StatusBadge';

const DEF = { client_id: '', asset_id: '', equipment_unit_id: '', sampling_point_id: '', maintenance_type: 'Замена масла', planning_method: 'hours', interval_hours: '', target_hours: '', target_date: '', current_hours: '', remaining_hours: '', remaining_days: '', status: 'normal', notification_enabled: false, comments: '' };

function calcStatus(form) {
  let status = 'normal';
  if (form.planning_method === 'hours' || form.planning_method === 'whichever_first') {
    const rem = +form.remaining_hours;
    if (!isNaN(rem)) { if (rem < 0) status = 'overdue'; else if (rem < 100) status = 'due_soon'; }
  }
  if (form.planning_method === 'date' || form.planning_method === 'whichever_first') {
    if (form.target_date) {
      const days = Math.ceil((new Date(form.target_date) - new Date()) / 86400000);
      const remDays = isNaN(days) ? null : days;
      if (remDays !== null) {
        if (form.planning_method === 'whichever_first') {
          if (remDays < 0 || status === 'overdue') status = 'overdue';
          else if (remDays < 14 || status === 'due_soon') status = 'due_soon';
        } else {
          if (remDays < 0) status = 'overdue'; else if (remDays < 14) status = 'due_soon';
        }
      }
    }
  }
  return status;
}

export default function MaintenanceSchedules() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterStatus, setFilterStatus] = useState('');
  const qc = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery({ queryKey: ['maintenance-schedules'], queryFn: () => base44.entities.MaintenanceSchedule.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });

  const save = useMutation({
    mutationFn: d => {
      const status = calcStatus(d);
      const remDays = d.target_date ? Math.ceil((new Date(d.target_date) - new Date()) / 86400000) : null;
      const remHours = d.target_hours && d.current_hours ? d.target_hours - d.current_hours : (d.remaining_hours || null);
      const data = { ...d, status, remaining_hours: remHours, remaining_days: remDays };
      return d.id ? base44.entities.MaintenanceSchedule.update(d.id, data) : base44.entities.MaintenanceSchedule.create(data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-schedules'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.MaintenanceSchedule.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-schedules'] })
  });

  const filtAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);
  const filtUnits = units.filter(u => !form.asset_id || u.asset_id === form.asset_id);
  const filtPoints = points.filter(p => !form.equipment_unit_id || p.equipment_unit_id === form.equipment_unit_id);
  const filtered = schedules.filter(s => !filterStatus || s.status === filterStatus);
  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Планы технического обслуживания</h1>
          <p className="text-slate-500 text-sm mt-0.5">{schedules.length} планов</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить план
        </Button>
      </div>

      <div className="mb-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Все статусы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Все</SelectItem>
            <SelectItem value="normal">Норма</SelectItem>
            <SelectItem value="due_soon">Скоро</SelectItem>
            <SelectItem value="overdue">Просрочено</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип ТО</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Метод</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Цель (ч)</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Цель (дата)</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Остаток ч.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Остаток дн.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={9} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
              : filtered.length === 0 ? <tr><td colSpan={9} className="text-center py-10 text-slate-400">Планы не найдены</td></tr>
                : filtered.map(s => (
                  <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{s.maintenance_type}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{getName(assets, s.asset_id, 'asset_name')}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{PLANNING_METHODS[s.planning_method] || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.target_hours ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.target_date || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{s.remaining_hours ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{s.remaining_days ?? '—'}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(s); setOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить план?') && del.mutate(s.id)}><Trash2 className="w-3.5 h-3.5 text-red-500" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать план' : 'Добавить план ТО'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-1 max-h-[70vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>Клиент *</Label>
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
            <div className="col-span-2 space-y-1">
              <Label>Тип ТО *</Label>
              <Input value={form.maintenance_type} onChange={e => f('maintenance_type', e.target.value)} placeholder="Замена масла" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Метод планирования *</Label>
              <Select value={form.planning_method} onValueChange={v => f('planning_method', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PLANNING_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {(form.planning_method === 'hours' || form.planning_method === 'whichever_first') && (
              <>
                <div className="space-y-1">
                  <Label>Целевые М/ч</Label>
                  <Input type="number" value={form.target_hours} onChange={e => f('target_hours', +e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Текущие М/ч</Label>
                  <Input type="number" value={form.current_hours} onChange={e => f('current_hours', +e.target.value)} />
                </div>
              </>
            )}
            {(form.planning_method === 'date' || form.planning_method === 'whichever_first') && (
              <div className={`space-y-1 ${form.planning_method === 'date' ? 'col-span-2' : ''}`}>
                <Label>Целевая дата</Label>
                <Input type="date" value={form.target_date} onChange={e => f('target_date', e.target.value)} />
              </div>
            )}
            <div className="col-span-2 flex items-center gap-3">
              <Switch checked={form.notification_enabled} onCheckedChange={v => f('notification_enabled', v)} />
              <Label>Включить уведомления</Label>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.client_id || !form.maintenance_type || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}