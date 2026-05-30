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
import { EQ_TYPES } from '@/utils/labels';

const DEF = { client_id: '', asset_id: '', unit_name: '', equipment_type: '', manufacturer: '', model: '', serial_number: '', total_operating_hours: '', comments: '' };

export default function EquipmentUnits() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterClient, setFilterClient] = useState('');
  const [filterAsset, setFilterAsset] = useState('');
  const qc = useQueryClient();

  const { data: units = [], isLoading } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.EquipmentUnit.update(d.id, d) : base44.entities.EquipmentUnit.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['equipment-units'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.EquipmentUnit.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment-units'] })
  });

  const filteredAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);
  const filteredUnits = units.filter(u =>
    (filterClient === 'none' || u.client_id === filterClient) &&
    (filterAsset === 'none' || u.asset_id === filterAsset)
  );
  const filterAssets = assets.filter(a => filterClient === 'none' || a.client_id === filterClient);
  const getName = (list, id, field = 'company_name') => list.find(x => x.id === id)?.[field] || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Единицы оборудования</h1>
          <p className="text-slate-500 text-sm mt-0.5">{units.length} записей</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить
        </Button>
      </div>

      <div className="flex gap-2 mb-3">
        <Select value={filterClient} onValueChange={v => { setFilterClient(v); setFilterAsset(''); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Все клиенты" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAsset} onValueChange={setFilterAsset}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Все активы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все активы</SelectItem>
            {filterAssets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Производитель</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч всего</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filteredUnits.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Записи не найдены</td></tr>
            ) : filteredUnits.map(u => (
              <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{u.unit_name}</td>
                <td className="px-4 py-2.5 text-slate-600">{EQ_TYPES[u.equipment_type] || u.equipment_type}</td>
                <td className="px-4 py-2.5 text-slate-600">{getName(assets, u.asset_id, 'asset_name')}</td>
                <td className="px-4 py-2.5 text-slate-600">{u.manufacturer || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{u.total_operating_hours ?? '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(u); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить запись?') && del.mutate(u.id)}>
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
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать' : 'Добавить оборудование'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[70vh] overflow-y-auto">
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
              <Label>Наименование *</Label>
              <Input value={form.unit_name} onChange={e => f('unit_name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Тип оборудования *</Label>
              <Select value={form.equipment_type} onValueChange={v => f('equipment_type', v)}>
                <SelectTrigger><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>{Object.entries(EQ_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>М/ч всего</Label>
              <Input type="number" value={form.total_operating_hours} onChange={e => f('total_operating_hours', +e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Производитель</Label>
              <Input value={form.manufacturer} onChange={e => f('manufacturer', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Модель</Label>
              <Input value={form.model} onChange={e => f('model', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Серийный номер</Label>
              <Input value={form.serial_number} onChange={e => f('serial_number', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.client_id || !form.asset_id || !form.unit_name || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}