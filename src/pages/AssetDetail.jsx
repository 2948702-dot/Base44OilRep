import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { EQ_TYPES } from '@/utils/labels';
import SamplingPointsPanel from '@/components/SamplingPointsPanel';

const DEF = {
  unit_name: '', equipment_type: '', manufacturer: '', model: '',
  serial_number: '', total_operating_hours: '', initial_oil_hours: '', comments: ''
};

export default function AssetDetail() {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [expandedId, setExpandedId] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);

  const { data: asset } = useQuery({
    queryKey: ['asset', assetId],
    queryFn: () => base44.entities.Asset.get(assetId),
    enabled: !!assetId
  });
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });
  const { data: units = [], isLoading } = useQuery({
    queryKey: ['equipment-units', assetId],
    queryFn: () => base44.entities.EquipmentUnit.filter({ asset_id: assetId }),
    enabled: !!assetId
  });
  const { data: oils = [] } = useQuery({
    queryKey: ['oil-references'],
    queryFn: () => base44.entities.OilReference.list()
  });

  const save = useMutation({
    mutationFn: async d => {
      const clean = { ...d };
      if (clean.total_operating_hours === '' || clean.total_operating_hours === undefined) delete clean.total_operating_hours;
      else clean.total_operating_hours = Number(clean.total_operating_hours);
      if (clean.initial_oil_hours === '' || clean.initial_oil_hours === undefined) delete clean.initial_oil_hours;
      else clean.initial_oil_hours = Number(clean.initial_oil_hours);
      // Never allow direct edit of current_* snapshot fields
      delete clean.current_total_hours;
      delete clean.current_oil_hours;
      delete clean.current_oil_type_id;
      delete clean.last_hours_update_date;
      const payload = { ...clean, asset_id: assetId, client_id: asset?.client_id };
      const result = clean.id
        ? await base44.entities.EquipmentUnit.update(clean.id, payload)
        : await base44.entities.EquipmentUnit.create(payload);
      const unitId = result?.id || clean.id;
      if (unitId) {
        await base44.functions.invoke('recalculateEquipmentUnitState', { equipment_unit_id: unitId });
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-units', assetId] });
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
      setOpen(false);
      setForm(DEF);
    }
  });

  const del = useMutation({
    mutationFn: id => base44.entities.EquipmentUnit.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-units', assetId] });
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
    }
  });

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const openCreate = () => { setForm(DEF); setOpen(true); };
  const openEdit = (u) => { setForm({ ...u, total_operating_hours: u.total_operating_hours ?? '', initial_oil_hours: u.initial_oil_hours ?? '' }); setOpen(true); };

  const clientName = clients.find(c => c.id === asset?.client_id)?.company_name || '';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{asset?.asset_name || '...'}</h1>
          <p className="text-slate-500 text-sm">{clientName} · {EQ_TYPES[asset?.asset_type] || asset?.asset_type || ''}</p>
        </div>
        <Button size="sm" className="ml-auto" onClick={openCreate} disabled={!asset}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить агрегат
        </Button>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-8 px-2 py-2.5"></th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Производитель / Модель</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч всего</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : units.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Агрегаты не добавлены</td></tr>
            ) : units.map(u => (
              <>
                <tr
                  key={u.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${expandedId === u.id ? 'bg-blue-50/40' : ''}`}
                  onClick={() => setExpandedId(prev => prev === u.id ? null : u.id)}
                >
                  <td className="px-2 py-2.5 text-slate-400">
                    {expandedId === u.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">{u.unit_name}</td>
                  <td className="px-4 py-2.5 text-slate-600">{EQ_TYPES[u.equipment_type] || u.equipment_type}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {u.manufacturer || '—'}{u.model && <span className="text-slate-400"> / {u.model}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{u.current_total_hours ?? u.total_operating_hours ?? '—'}</td>
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
                  <tr key={`${u.id}-exp`}>
                    <td colSpan={6} className="p-0">
                      <SamplingPointsPanel unit={u} oils={oils} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Unit Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Редактировать агрегат' : 'Добавить агрегат'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[70vh] overflow-y-auto">
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
              <Label>Стартовые м/ч агрегата</Label>
              <Input type="number" value={form.total_operating_hours} onChange={e => f('total_operating_hours', e.target.value)} placeholder="начальные моточасы" />
            </div>
            <div className="space-y-1">
              <Label>Стартовые м/ч масла</Label>
              <Input type="number" value={form.initial_oil_hours} onChange={e => f('initial_oil_hours', e.target.value)} placeholder="0" />
            </div>
            {form.id && (
              <div className="col-span-2 grid grid-cols-2 gap-2 bg-slate-50 rounded-md px-3 py-2 text-xs text-slate-500">
                <div>Текущие м/ч агрегата: <span className="font-semibold text-slate-700">{form.current_total_hours ?? '—'}</span></div>
                <div>Текущие м/ч масла: <span className="font-semibold text-slate-700">{form.current_oil_hours ?? '—'}</span></div>
              </div>
            )}
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
          {form.id && (
            <div className="border-t pt-3">
              <SamplingPointsPanel unit={form} oils={oils} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Закрыть</Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.unit_name || !form.equipment_type || save.isPending}
            >
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}