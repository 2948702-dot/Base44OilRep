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
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { EVENT_TYPES, PLANNING_METHODS } from '@/utils/labels';
import StatusBadge from '@/components/StatusBadge';
import { buildPayload } from '@/utils/payload';
import { useSaveMutation } from '@/hooks/useSaveMutation';
import {
  MAINTENANCE_SCHEDULE_FIELDS,
  MAINTENANCE_SCHEDULE_NUMBER_FIELDS,
} from '@/utils/entityFields';

const DEF = {
  client_id: '', asset_id: '', equipment_unit_id: '',
  maintenance_type: '', event_type: 'oil_change', planning_method: 'hours',
  interval_hours: '', interval_days: '', target_hours: '',
  target_date: '', current_hours: '', remaining_hours: '', remaining_days: '',
  initial_target_hours: '', initial_target_date: '',
  status: 'normal', notification_enabled: false, comments: ''
};

function calcStatus(form) {
  const updated = { ...form };
  if (form.planning_method === 'hours' && form.target_hours && form.current_hours) {
    const rem = +form.target_hours - +form.current_hours;
    updated.remaining_hours = rem;
    updated.status = rem < 0 ? 'overdue' : rem < 100 ? 'due_soon' : 'normal';
  } else if (form.planning_method === 'date' && form.target_date) {
    const days = Math.round((new Date(form.target_date) - new Date()) / (1000 * 60 * 60 * 24));
    updated.remaining_days = days;
    updated.status = days < 0 ? 'overdue' : days < 14 ? 'due_soon' : 'normal';
  } else if (form.planning_method === 'whichever_first') {
    let status = 'normal';
    if (form.target_hours && form.current_hours) {
      const remH = +form.target_hours - +form.current_hours;
      updated.remaining_hours = remH;
      if (remH < 0) status = 'overdue';
      else if (remH < 100) status = 'due_soon';
    }
    if (form.target_date) {
      const days = Math.round((new Date(form.target_date) - new Date()) / (1000 * 60 * 60 * 24));
      updated.remaining_days = days;
      if (days < 0) status = 'overdue';
      else if (days < 14 && status !== 'overdue') status = 'due_soon';
    }
    updated.status = status;
  }
  return updated;
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

  const save = useSaveMutation({
    mutationFn: async (d) => {
      const unit = units.find(item => item.id === d.equipment_unit_id);
      const calculated = calcStatus({
        ...d,
        current_hours: unit?.current_total_hours ?? d.current_hours,
        initial_target_hours: d.initial_target_hours || d.target_hours || null,
        initial_target_date: d.initial_target_date || d.target_date || null,
      });
      const payload = buildPayload(
        calculated,
        MAINTENANCE_SCHEDULE_FIELDS,
        MAINTENANCE_SCHEDULE_NUMBER_FIELDS,
      );
      return d.id
        ? base44.entities.MaintenanceSchedule.update(d.id, payload)
        : base44.entities.MaintenanceSchedule.create(payload);
    },
    invalidateKeys: [['maintenance-schedules']],
    onSuccess: () => {
      setOpen(false);
      setForm(DEF);
    },
  });
  const del = useMutation({
    mutationFn: id => base44.entities.MaintenanceSchedule.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['maintenance-schedules'] })
  });

  const filtAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);
  const filtUnits = units.filter(u => !form.asset_id || u.asset_id === form.asset_id);
  const filtered = schedules.filter(s => !filterStatus || s.status === filterStatus);
  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = () => save.mutate(form);

  const formatVariance = (value, unit) => {
    if (value == null) return '—';
    if (value === 0) return `0 ${unit}`;
    return `${value > 0 ? '+' : ''}${value} ${unit}`;
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Планы ТО</h1>
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
            <SelectItem value={null}>Все статусы</SelectItem>
            <SelectItem value="normal">Норма</SelectItem>
            <SelectItem value="due_soon">Скоро</SelectItem>
            <SelectItem value="overdue">Просрочено</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm min-w-max">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип ТО</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Клиент / Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Метод</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Цель (ч)</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Цель (дата)</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Остаток ч.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Остаток дн.</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Последний факт</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">План-факт</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={11} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} className="text-center py-10 text-slate-400">Планы не найдены</td></tr>
            ) : filtered.map(s => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{s.maintenance_type}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  <div className="text-xs font-medium">{getName(clients, s.client_id, 'company_name')}</div>
                  <div className="text-xs text-slate-400">{getName(assets, s.asset_id, 'asset_name')}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{PLANNING_METHODS[s.planning_method]}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.target_hours ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.target_date ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.remaining_hours ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.remaining_days ?? '—'}</td>
                <td className="px-4 py-2.5 text-xs text-slate-600">
                  <div>{s.last_completed_date || '—'}</div>
                  <div className="text-slate-400">{s.last_completed_hours != null ? `${s.last_completed_hours} м/ч` : ''}</div>
                </td>
                <td className="px-4 py-2.5 text-xs">
                  <div className={s.last_date_variance_days > 0 ? 'text-red-600' : 'text-slate-600'}>
                    {formatVariance(s.last_date_variance_days, 'дн.')}
                  </div>
                  <div className={s.last_hours_variance > 0 ? 'text-red-600' : 'text-slate-400'}>
                    {formatVariance(s.last_hours_variance, 'м/ч')}
                  </div>
                </td>
                <td className="px-4 py-2.5"><StatusBadge status={s.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(s); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить план?') && del.mutate(s.id)}>
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
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать план' : 'Добавить план ТО'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[72vh] overflow-y-auto pr-1">
            <div className="col-span-2 space-y-1">
              <Label>Тип обслуживания *</Label>
              <Input value={form.maintenance_type} onChange={e => f('maintenance_type', e.target.value)} placeholder="Замена масла, Замена фильтра..." />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Связанное событие *</Label>
              <Select value={form.event_type} onValueChange={v => f('event_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EVENT_TYPES).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Клиент</Label>
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
            <div className="col-span-2 space-y-1">
              <Label>Оборудование</Label>
              <Select value={form.equipment_unit_id} onValueChange={v => f('equipment_unit_id', v)}>
                <SelectTrigger><SelectValue placeholder="Оборудование" /></SelectTrigger>
                <SelectContent>{filtUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unit_name}</SelectItem>)}</SelectContent>
              </Select>
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
                  <Label>Целевые м/ч</Label>
                  <Input type="number" value={form.target_hours} onChange={e => f('target_hours', +e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Текущие м/ч</Label>
                  <Input
                    type="number"
                    value={units.find(item => item.id === form.equipment_unit_id)?.current_total_hours ?? form.current_hours}
                    readOnly
                    className="bg-slate-50"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Интервал, м/ч</Label>
                  <Input type="number" value={form.interval_hours} onChange={e => f('interval_hours', +e.target.value)} />
                </div>
              </>
            )}
            {(form.planning_method === 'date' || form.planning_method === 'whichever_first') && (
              <>
                <div className="space-y-1">
                  <Label>Целевая дата</Label>
                  <Input type="date" value={form.target_date} onChange={e => f('target_date', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Интервал, дней</Label>
                  <Input type="number" min="1" value={form.interval_days} onChange={e => f('interval_days', e.target.value)} />
                </div>
              </>
            )}
            <div className="col-span-2 flex items-center justify-between py-1">
              <Label>Уведомления</Label>
              <Switch checked={form.notification_enabled} onCheckedChange={v => f('notification_enabled', v)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          {save.errorBlock}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={!form.maintenance_type || save.isPending} className="gap-2">
              <RefreshCw className="w-3.5 h-3.5" />{save.isPending ? 'Сохранение...' : 'Рассчитать и сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
