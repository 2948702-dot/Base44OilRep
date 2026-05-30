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
import { SAMPLING_METHODS } from '@/utils/labels';
import OilSearch from '@/components/OilSearch';

const DEF = { client_id: '', asset_id: '', equipment_unit_id: '', point_name: '', qr_code: '', oil_type_id: '', oil_volume: '', current_total_hours: '', current_oil_hours: '', sampling_method: '', comments: '' };

export default function SamplingPoints() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [oilFormOpen, setOilFormOpen] = useState(false);
  const [filterClient, setFilterClient] = useState('');
  const qc = useQueryClient();

  const { data: points = [], isLoading } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.SamplingPoint.update(d.id, d) : base44.entities.SamplingPoint.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sampling-points'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.SamplingPoint.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sampling-points'] })
  });

  const filteredAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);
  const filteredUnits = units.filter(u => !form.asset_id || u.asset_id === form.asset_id);
  const filteredPoints = points.filter(p => !filterClient || p.client_id === filterClient);
  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Точки отбора проб</h1>
          <p className="text-slate-500 text-sm mt-0.5">{points.length} точек</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить точку
        </Button>
      </div>

      <div className="mb-3">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Все клиенты" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Оборудование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Метод отбора</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Масло</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Объём, л</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч масла</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filteredPoints.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Точки не найдены</td></tr>
            ) : filteredPoints.map(p => (
              <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{p.point_name}</td>
                <td className="px-4 py-2.5 text-slate-600">{getName(units, p.equipment_unit_id, 'unit_name')}</td>
                <td className="px-4 py-2.5 text-slate-600">{SAMPLING_METHODS[p.sampling_method] || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{getName(oils, p.oil_type_id, 'oil_name')}</td>
                <td className="px-4 py-2.5 text-slate-600">{p.oil_volume ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{p.current_oil_hours ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(p); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить точку?') && del.mutate(p.id)}>
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
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать точку' : 'Добавить точку отбора'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[75vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>Клиент *</Label>
              <Select value={form.client_id} onValueChange={v => f('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Клиент" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Актив *</Label>
              <Select value={form.asset_id} onValueChange={v => f('asset_id', v)}>
                <SelectTrigger><SelectValue placeholder="Актив" /></SelectTrigger>
                <SelectContent>{filteredAssets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Единица оборудования *</Label>
              <Select value={form.equipment_unit_id} onValueChange={v => f('equipment_unit_id', v)}>
                <SelectTrigger><SelectValue placeholder="Оборудование" /></SelectTrigger>
                <SelectContent>{filteredUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unit_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Наименование точки *</Label>
              <Input value={form.point_name} onChange={e => f('point_name', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Метод отбора *</Label>
              <Select value={form.sampling_method} onValueChange={v => f('sampling_method', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите метод" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SAMPLING_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Тип масла</Label>
              <OilSearch oils={oils} value={form.oil_type_id} onChange={v => f('oil_type_id', v)} onCreateNew={() => { setOpen(false); setOilFormOpen(true); }} />
            </div>
            <div className="space-y-1">
              <Label>Объём масла, л</Label>
              <Input type="number" value={form.oil_volume} onChange={e => f('oil_volume', +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч всего</Label>
              <Input type="number" value={form.current_total_hours} onChange={e => f('current_total_hours', +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>М/ч масла</Label>
              <Input type="number" value={form.current_oil_hours} onChange={e => f('current_oil_hours', +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>QR код</Label>
              <Input value={form.qr_code} onChange={e => f('qr_code', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.client_id || !form.point_name || !form.sampling_method || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}