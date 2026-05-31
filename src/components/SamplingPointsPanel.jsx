import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';
import { SAMPLING_METHODS } from '@/utils/labels';
import OilSearch from '@/components/OilSearch';

const DEF_POINT = {
  point_name: '',
  sampling_method: '',
  oil_type_id: '',
  oil_volume: '',
  current_total_hours: '',
  current_oil_hours: '',
  comments: ''
};

export default function SamplingPointsPanel({ unit, oils = [] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF_POINT);
  const qc = useQueryClient();

  const { data: points = [], isLoading } = useQuery({
    queryKey: ['sampling-points', unit.id],
    queryFn: () => base44.entities.SamplingPoint.filter({ equipment_unit_id: unit.id }),
    enabled: !!unit.id
  });

  const clean = (d) => {
    const out = { ...d };
    ['oil_volume', 'current_total_hours', 'current_oil_hours'].forEach(k => {
      if (out[k] === '' || out[k] === undefined) delete out[k];
      else out[k] = Number(out[k]);
    });
    if (!out.oil_type_id) delete out.oil_type_id;
    return out;
  };

  const save = useMutation({
    mutationFn: d => {
      const c = clean(d);
      const payload = {
        ...c,
        client_id: unit.client_id,
        asset_id: unit.asset_id,
        equipment_unit_id: unit.id
      };
      return c.id
        ? base44.entities.SamplingPoint.update(c.id, payload)
        : base44.entities.SamplingPoint.create(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sampling-points', unit.id] });
      qc.invalidateQueries({ queryKey: ['sampling-points'] });
      setOpen(false);
      setForm(DEF_POINT);
    }
  });

  const del = useMutation({
    mutationFn: id => base44.entities.SamplingPoint.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sampling-points', unit.id] });
      qc.invalidateQueries({ queryKey: ['sampling-points'] });
    }
  });

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openCreate = () => { setForm(DEF_POINT); setOpen(true); };
  const openEdit = (p) => {
    setForm({
      id: p.id,
      point_name: p.point_name || '',
      sampling_method: p.sampling_method || '',
      oil_type_id: p.oil_type_id || '',
      oil_volume: p.oil_volume ?? '',
      current_total_hours: p.current_total_hours ?? '',
      current_oil_hours: p.current_oil_hours ?? '',
      comments: p.comments || ''
    });
    setOpen(true);
  };

  return (
    <div className="bg-slate-50 border-t border-slate-100 px-6 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Точки отбора
          </span>
          {points.length > 0 && (
            <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{points.length}</span>
          )}
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openCreate}>
          <Plus className="w-3 h-3" />Добавить точку
        </Button>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-400 py-2">Загрузка...</p>
      ) : points.length === 0 ? (
        <div className="text-center py-4 border border-dashed border-slate-200 rounded-lg">
          <MapPin className="w-5 h-5 text-slate-300 mx-auto mb-1" />
          <p className="text-xs text-slate-400">Нет точек отбора. Нажмите «Добавить точку».</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Точка отбора</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">Метод</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">М/ч масла</th>
                <th className="text-left px-3 py-2 font-medium text-slate-500">М/ч всего</th>
                <th className="w-16 px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {points.map(p => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-800">{p.point_name}</td>
                  <td className="px-3 py-2 text-slate-500">{SAMPLING_METHODS[p.sampling_method] || '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{p.current_oil_hours ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-500">{p.current_total_hours ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-0.5">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(p)}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => window.confirm('Удалить точку?') && del.mutate(p.id)}>
                        <Trash2 className="w-3 h-3 text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Редактировать точку' : 'Добавить точку отбора'}</DialogTitle>
            <p className="text-xs text-slate-500 mt-1">{unit.unit_name}</p>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Наименование точки <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Например: Картер, Сливная пробка..."
                value={form.point_name}
                onChange={e => f('point_name', e.target.value)}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Метод отбора <span className="text-red-500">*</span></Label>
              <Select value={form.sampling_method} onValueChange={v => f('sampling_method', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите метод" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SAMPLING_METHODS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Тип масла</Label>
              <OilSearch oils={oils} value={form.oil_type_id} onChange={v => f('oil_type_id', v)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч масла</Label>
              <Input type="number" placeholder="0" value={form.current_oil_hours} onChange={e => f('current_oil_hours', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч всего</Label>
              <Input type="number" placeholder="0" value={form.current_total_hours} onChange={e => f('current_total_hours', e.target.value)} />
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
              disabled={!form.point_name || !form.sampling_method || save.isPending}
            >
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}