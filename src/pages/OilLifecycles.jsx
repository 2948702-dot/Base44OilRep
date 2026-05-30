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
import StatusBadge from '@/components/StatusBadge';

function Req() { return <span className="text-red-500 ml-0.5">*</span>; }

const DEF = { sampling_point_id: '', oil_type_id: '', start_date: '', start_operating_hours: '', end_date: '', end_operating_hours: '', status: 'active', start_reason: '', end_reason: '', comments: '' };

const clean = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === '' ? undefined : v]));

export default function OilLifecycles() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterPoint, setFilterPoint] = useState('');
  const qc = useQueryClient();

  const { data: lifecycles = [], isLoading } = useQuery({ queryKey: ['oil-lifecycles'], queryFn: () => base44.entities.OilLifecycle.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });

  const save = useMutation({
    mutationFn: d => { const c = clean(d); return c.id ? base44.entities.OilLifecycle.update(c.id, c) : base44.entities.OilLifecycle.create(c); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oil-lifecycles'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.OilLifecycle.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oil-lifecycles'] })
  });

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const filtered = lifecycles.filter(l => !filterPoint || l.sampling_point_id === filterPoint);

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Жизненные циклы масла</h1>
          <p className="text-slate-500 text-sm mt-0.5">{lifecycles.length} записей</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Новый цикл
        </Button>
      </div>

      <div className="mb-3">
        <Select value={filterPoint} onValueChange={setFilterPoint}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Все точки отбора" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Все точки отбора</SelectItem>
            {points.map(p => <SelectItem key={p.id} value={p.id}>{p.point_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Точка отбора</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Масло</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Начало</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч начало</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Окончание</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Циклы не найдены</td></tr>
            ) : filtered.map(l => (
              <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{getName(points, l.sampling_point_id, 'point_name')}</td>
                <td className="px-4 py-2.5 text-slate-600">{getName(oils, l.oil_type_id, 'oil_name')}</td>
                <td className="px-4 py-2.5 text-slate-600">{l.start_date || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{l.start_operating_hours ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{l.end_date || '—'}</td>
                <td className="px-4 py-2.5"><StatusBadge status={l.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(l); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить цикл?') && del.mutate(l.id)}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать цикл' : 'Новый жизненный цикл'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
            <div className="col-span-2 space-y-1">
              <Label>Точка отбора <Req /></Label>
              <Select value={form.sampling_point_id} onValueChange={v => f('sampling_point_id', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите точку" /></SelectTrigger>
                <SelectContent>{points.map(p => <SelectItem key={p.id} value={p.id}>{p.point_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Тип масла <Req /></Label>
              <Select value={form.oil_type_id} onValueChange={v => f('oil_type_id', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите масло" /></SelectTrigger>
                <SelectContent>{oils.map(o => <SelectItem key={o.id} value={o.id}>{o.oil_name} — {o.manufacturer}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Дата начала <Req /></Label>
              <Input type="date" value={form.start_date} onChange={e => f('start_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч начало</Label>
              <Input type="number" value={form.start_operating_hours ?? ''} onChange={e => f('start_operating_hours', e.target.value === '' ? '' : +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Дата окончания</Label>
              <Input type="date" value={form.end_date} onChange={e => f('end_date', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч окончание</Label>
              <Input type="number" value={form.end_operating_hours ?? ''} onChange={e => f('end_operating_hours', e.target.value === '' ? '' : +e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Статус <Req /></Label>
              <Select value={form.status} onValueChange={v => f('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Активный</SelectItem>
                  <SelectItem value="closed">Закрыт</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Причина начала</Label>
              <Input value={form.start_reason} onChange={e => f('start_reason', e.target.value)} placeholder="Плановая замена, ремонт..." />
            </div>
            <div className="space-y-1">
              <Label>Причина закрытия</Label>
              <Input value={form.end_reason} onChange={e => f('end_reason', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.sampling_point_id || !form.oil_type_id || !form.start_date || save.isPending}
            >
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}