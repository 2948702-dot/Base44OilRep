import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { EQ_TYPES } from '@/utils/labels';
import SamplingPointsPanel from '@/components/SamplingPointsPanel';

const DEF = {
  client_id: '', asset_id: '', unit_name: '', equipment_type: '',
  manufacturer: '', model: '', serial_number: '', total_operating_hours: '', comments: ''
};

export default function EquipmentUnits() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [expandedId, setExpandedId] = useState(null);
  const [filterClient, setFilterClient] = useState('none');
  const [filterAsset, setFilterAsset] = useState('none');
  const qc = useQueryClient();

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['equipment-units'],
    queryFn: () => base44.entities.EquipmentUnit.list()
  });
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });
  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list()
  });
  const { data: oils = [] } = useQuery({
    queryKey: ['oil-references'],
    queryFn: () => base44.entities.OilReference.list()
  });

  const save = useMutation({
    mutationFn: d => {
      const clean = { ...d };
      if (clean.total_operating_hours === '' || clean.total_operating_hours === undefined) delete clean.total_operating_hours;
      else clean.total_operating_hours = Number(clean.total_operating_hours);
      return clean.id
        ? base44.entities.EquipmentUnit.update(clean.id, clean)
        : base44.entities.EquipmentUnit.create(clean);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
      setOpen(false);
      setForm(DEF);
    }
  });

  const del = useMutation({
    mutationFn: id => base44.entities.EquipmentUnit.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['equipment-units'] })
  });

  const filterAssets = assets.filter(a => filterClient === 'none' || a.client_id === filterClient);
  const formAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);

  const filteredUnits = units.filter(u =>
    (filterClient === 'none' || u.client_id === filterClient) &&
    (filterAsset === 'none' || u.asset_id === filterAsset)
  );

  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleExpand = (id) => setExpandedId(prev => prev === id ? null : id);

  const openCreate = () => { setForm(DEF); setOpen(true); };
  const openEdit = (u) => {
    setForm({ ...u, total_operating_hours: u.total_operating_hours ?? '' });
    setOpen(true);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Агрегаты</h1>
          <p className="text-slate-500 text-sm mt-0.5">{units.length} записей · нажмите на строку для просмотра точек отбора</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить агрегат
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        <Select value={filterClient} onValueChange={v => { setFilterClient(v); setFilterAsset('none'); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Все клиенты" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAsset} onValueChange={setFilterAsset} disabled={filterClient === 'none'}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Все активы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все активы</SelectItem>
            {filterAssets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-8 px-2 py-2.5"></th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Производитель / Модель</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч всего</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filteredUnits.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Агрегаты не найдены</td></tr>
            ) : filteredUnits.map(u => (
              <>
                <tr
                  key={u.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${expandedId === u.id ? 'bg-blue-50/40' : ''}`}
                  onClick={() => toggleExpand(u.id)}
                >
                  <td className="px-2 py-2.5 text-slate-400">
                    {expandedId === u.id
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />
                    }
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{u.unit_name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{EQ_TYPES[u.equipment_type] || u.equipment_type}</td>
                  <td className="px-4 py-2.5 text-slate-600">{getName(assets, u.asset_id, 'asset_name')}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {u.manufacturer || '—'}
                    {u.model && <span className="text-slate-400"> / {u.model}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{u.total_operating_hours ?? '—'}</td>
                  <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить агрегат?') && del.mutate(u.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
                {expandedId === u.id && (
                  <tr key={`${u.id}-expanded`}>
                    <td colSpan={7} className="p-0">
                      <SamplingPointsPanel unit={u} oils={oils} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Equipment Unit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Редактировать агрегат' : 'Добавить агрегат'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1">
              <Label>Клиент *</Label>
              <Select value={form.client_id} onValueChange={v => { f('client_id', v); f('asset_id', ''); }}>
                <SelectTrigger><SelectValue placeholder="Клиент" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Актив *</Label>
              <Select value={form.asset_id} onValueChange={v => f('asset_id', v)} disabled={!form.client_id}>
                <SelectTrigger><SelectValue placeholder="Актив" /></SelectTrigger>
                <SelectContent>
                  {formAssets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Наименование *</Label>
              <Input value={form.unit_name} onChange={e => f('unit_name', e.target.value)} placeholder="ГД Caterpillar C18" />
            </div>
            <div className="space-y-1">
              <Label>Тип оборудования *</Label>
              <Select value={form.equipment_type} onValueChange={v => f('equipment_type', v)}>
                <SelectTrigger><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EQ_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>М/ч всего</Label>
              <Input type="number" value={form.total_operating_hours} onChange={e => f('total_operating_hours', e.target.value)} />
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
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.client_id || !form.asset_id || !form.unit_name || !form.equipment_type || save.isPending}
            >
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}