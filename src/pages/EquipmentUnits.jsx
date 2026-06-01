import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EQ_TYPES } from '@/utils/labels';
import UnitThresholdsEditor from '@/components/UnitThresholdsEditor';

const DEF = {
  client_id: '',
  asset_id: '',
  unit_name: '',
  equipment_type: '',
  manufacturer: '',
  model: '',
  serial_number: '',
  total_operating_hours: '',
  initial_oil_hours: '',
  oil_type_id: '',
  oil_volume: '',
  use_standard_thresholds: true,
  custom_thresholds: [],
  comments: ''
};

export default function EquipmentUnits() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterClient, setFilterClient] = useState('none');
  const [filterAsset, setFilterAsset] = useState('none');
  const [selected, setSelected] = useState(new Set());
  const qc = useQueryClient();
  const navigate = useNavigate();

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

  const filteredAssets = assets.filter(asset => filterClient === 'none' || asset.client_id === filterClient);
  const formAssets = assets.filter(asset => !form.client_id || asset.client_id === form.client_id);
  const filteredUnits = units.filter(unit =>
    (filterClient === 'none' || unit.client_id === filterClient) &&
    (filterAsset === 'none' || unit.asset_id === filterAsset)
  );

  const getName = (list, id, field) => list.find(item => item.id === id)?.[field] || '-';
  const f = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: async data => {
      const clean = { ...data };

      if (clean.total_operating_hours === '' || clean.total_operating_hours === undefined) delete clean.total_operating_hours;
      else clean.total_operating_hours = Number(clean.total_operating_hours);

      if (clean.initial_oil_hours === '' || clean.initial_oil_hours === undefined) delete clean.initial_oil_hours;
      else clean.initial_oil_hours = Number(clean.initial_oil_hours);

      if (clean.oil_volume === '' || clean.oil_volume === undefined) delete clean.oil_volume;
      else clean.oil_volume = Number(clean.oil_volume);

      if (!clean.oil_type_id) {
        clean.oil_type_id = null;
        clean.current_oil_type_id = null;
      } else {
        clean.current_oil_type_id = clean.oil_type_id;
      }

      if (clean.use_standard_thresholds === undefined) clean.use_standard_thresholds = true;
      if (Array.isArray(clean.custom_thresholds)) {
        clean.custom_thresholds = clean.custom_thresholds.map(threshold => {
          const next = { parameter_name: threshold.parameter_name };
          ['green_min', 'green_max', 'yellow_min', 'yellow_max', 'red_min', 'red_max'].forEach(field => {
            if (threshold[field] !== '' && threshold[field] !== null && threshold[field] !== undefined) {
              next[field] = Number(threshold[field]);
            }
          });
          return next;
        });
      }

      const result = clean.id
        ? await base44.entities.EquipmentUnit.update(clean.id, clean)
        : await base44.entities.EquipmentUnit.create(clean);

      await base44.functions.invoke('recalculateEquipmentUnitState', { equipment_unit_id: result.id });
      return result;
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

  const bulkDel = useMutation({
    mutationFn: async ids => {
      for (const id of ids) await base44.entities.EquipmentUnit.delete(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
      setSelected(new Set());
    }
  });

  const toggle = id => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => setSelected(prev =>
    prev.size === filteredUnits.length ? new Set() : new Set(filteredUnits.map(unit => unit.id))
  );

  const openCreate = () => {
    setForm(DEF);
    setOpen(true);
  };

  const openEdit = unit => {
    setForm({
      ...unit,
      total_operating_hours: unit.total_operating_hours ?? '',
      initial_oil_hours: unit.initial_oil_hours ?? '',
      oil_type_id: unit.current_oil_type_id || unit.oil_type_id || '',
      oil_volume: unit.oil_volume ?? ''
    });
    setOpen(true);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Агрегаты</h1>
          <p className="text-slate-500 text-sm mt-0.5">{units.length} записей</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => window.confirm(`Удалить ${selected.size} агрегатов?`) && bulkDel.mutate([...selected])}
              disabled={bulkDel.isPending}
            >
              <Trash2 className="w-4 h-4 mr-1.5" />
              Удалить выбранные ({selected.size})
            </Button>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-1.5" />
            Добавить агрегат
          </Button>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <Select value={filterClient} onValueChange={value => { setFilterClient(value); setFilterAsset('none'); }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Все клиенты" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все клиенты</SelectItem>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAsset} onValueChange={setFilterAsset} disabled={filterClient === 'none'}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Все активы" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все активы</SelectItem>
            {filteredAssets.map(asset => (
              <SelectItem key={asset.id} value={asset.id}>{asset.asset_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-8 px-2 py-2.5">
                <input
                  type="checkbox"
                  className="w-4 h-4 cursor-pointer"
                  checked={filteredUnits.length > 0 && selected.size === filteredUnits.length}
                  onChange={toggleAll}
                />
              </th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs whitespace-nowrap">М/ч агрегата</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs whitespace-nowrap">М/ч масла</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 text-xs">Тип масла</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filteredUnits.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Агрегаты не найдены</td></tr>
            ) : filteredUnits.map(unit => {
              const oilId = unit.current_oil_type_id || unit.oil_type_id;
              const oil = oils.find(item => item.id === oilId);

              return (
                <tr
                  key={unit.id}
                  className={`border-b border-slate-100 hover:bg-slate-50 ${selected.has(unit.id) ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-2 py-2.5">
                    <input
                      type="checkbox"
                      className="w-4 h-4 cursor-pointer"
                      checked={selected.has(unit.id)}
                      onChange={() => toggle(unit.id)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-slate-900 truncate max-w-[180px]" title={unit.unit_name}>
                      {unit.unit_name}
                    </div>
                    <button
                      className="text-xs text-slate-400 hover:text-blue-500 hover:underline flex items-center gap-0.5 mt-0.5"
                      onClick={() => navigate(`/asset/${unit.asset_id}`)}
                    >
                      {getName(assets, unit.asset_id, 'asset_name')}
                      <ExternalLink className="w-2.5 h-2.5" />
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 font-mono text-sm">
                    {unit.current_total_hours != null ? unit.current_total_hours : (unit.total_operating_hours ?? '-')}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700 font-mono text-sm">
                    {unit.current_oil_hours != null ? unit.current_oil_hours : '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    {oil ? (
                      <span className="text-xs text-slate-600 truncate max-w-[160px] block" title={oil.oil_name}>
                        {oil.oil_name}
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(unit)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => window.confirm('Удалить агрегат?') && del.mutate(unit.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Редактировать агрегат' : 'Добавить агрегат'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="space-y-1">
              <Label>Клиент *</Label>
              <Select value={form.client_id} onValueChange={value => { f('client_id', value); f('asset_id', ''); }}>
                <SelectTrigger><SelectValue placeholder="Клиент" /></SelectTrigger>
                <SelectContent>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>{client.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Актив *</Label>
              <Select value={form.asset_id} onValueChange={value => f('asset_id', value)} disabled={!form.client_id}>
                <SelectTrigger><SelectValue placeholder="Актив" /></SelectTrigger>
                <SelectContent>
                  {formAssets.map(asset => (
                    <SelectItem key={asset.id} value={asset.id}>{asset.asset_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Наименование *</Label>
              <Input value={form.unit_name} onChange={event => f('unit_name', event.target.value)} placeholder="ГД Caterpillar C18" />
            </div>
            <div className="space-y-1">
              <Label>Тип оборудования *</Label>
              <Select value={form.equipment_type} onValueChange={value => f('equipment_type', value)}>
                <SelectTrigger><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EQ_TYPES).map(([key, value]) => (
                    <SelectItem key={key} value={key}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Масло</Label>
              <Select value={form.oil_type_id || 'none'} onValueChange={value => f('oil_type_id', value === 'none' ? '' : value)}>
                <SelectTrigger><SelectValue placeholder="Масло" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не назначено</SelectItem>
                  {oils.map(oil => (
                    <SelectItem key={oil.id} value={oil.id}>
                      {oil.oil_name}{oil.manufacturer ? ` (${oil.manufacturer})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Объём масла, л</Label>
              <Input type="number" value={form.oil_volume} onChange={event => f('oil_volume', event.target.value)} placeholder="напр. 40" />
            </div>
            <div className="col-span-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Стартовые значения при заведении в систему
              </p>
            </div>
            <div className="space-y-1">
              <Label>Стартовые м/ч агрегата</Label>
              <Input type="number" value={form.total_operating_hours} onChange={event => f('total_operating_hours', event.target.value)} placeholder="напр. 1000" />
            </div>
            <div className="space-y-1">
              <Label>Стартовые м/ч масла</Label>
              <Input type="number" value={form.initial_oil_hours} onChange={event => f('initial_oil_hours', event.target.value)} placeholder="напр. 100" />
            </div>
            {form.id && (form.current_total_hours != null || form.current_oil_hours != null) && (
              <div className="col-span-2 bg-slate-50 rounded-md px-3 py-2.5 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px] mb-1">
                  Текущее состояние рассчитывается автоматически
                </p>
                <div className="flex gap-4">
                  <span>М/ч агрегата: <strong>{form.current_total_hours ?? '-'}</strong></span>
                  <span>М/ч масла: <strong>{form.current_oil_hours ?? '-'}</strong></span>
                </div>
                {form.last_hours_update_date && <p className="text-slate-400">Обновлено: {form.last_hours_update_date}</p>}
              </div>
            )}
            <div className="space-y-1">
              <Label>Производитель</Label>
              <Input value={form.manufacturer} onChange={event => f('manufacturer', event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Модель</Label>
              <Input value={form.model} onChange={event => f('model', event.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Серийный номер</Label>
              <Input value={form.serial_number} onChange={event => f('serial_number', event.target.value)} />
            </div>
            <div className="col-span-2">
              <div className="flex items-center gap-2 py-2 border-t border-slate-100 mt-1">
                <input
                  type="checkbox"
                  id="use-std-thresh"
                  className="w-4 h-4 cursor-pointer"
                  checked={form.use_standard_thresholds !== false}
                  onChange={event => f('use_standard_thresholds', event.target.checked)}
                />
                <label htmlFor="use-std-thresh" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Использовать стандартные границы параметров масла
                </label>
              </div>
              {form.use_standard_thresholds === false && (
                <div className="border border-amber-200 rounded-lg p-3 bg-amber-50 mt-1">
                  <p className="text-xs font-semibold text-amber-800 mb-2">
                    Индивидуальные границы для этого агрегата
                  </p>
                  <UnitThresholdsEditor
                    value={form.custom_thresholds || []}
                    onChange={value => f('custom_thresholds', value)}
                  />
                </div>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={event => f('comments', event.target.value)} rows={2} />
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
