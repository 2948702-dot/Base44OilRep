import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, AlertCircle, Upload, X, Image } from 'lucide-react';
import HierarchyPath from '@/components/HierarchyPath';
import { EVENT_TYPES } from '@/utils/labels';

const DEF = {
  event_type: '', event_date: '', client_id: '', asset_id: '', equipment_unit_id: '',
  sampling_point_id: '', total_operating_hours: '', oil_hours: '', old_oil_type_id: '', new_oil_type_id: '',
  replaced_oil_volume: '', added_oil_volume: '', comment: '', attachments: []
};

export default function MaintenanceEvents() {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterClient, setFilterClient] = useState('');
  const [filterType, setFilterType] = useState('');
  const qc = useQueryClient();

  const { data: events = [], isLoading } = useQuery({ queryKey: ['maintenance-events'], queryFn: () => base44.entities.MaintenanceEvent.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list(undefined, 500) });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list(undefined, 500) });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: lifecycles = [] } = useQuery({ queryKey: ['oil-lifecycles'], queryFn: () => base44.entities.OilLifecycle.list(undefined, 500) });

  const save = useMutation({
    mutationFn: async (d) => {
      const payload = { ...d };
      if (payload.total_operating_hours === '') delete payload.total_operating_hours;
      else if (payload.total_operating_hours !== undefined) payload.total_operating_hours = Number(payload.total_operating_hours);
      if (payload.oil_hours === '') delete payload.oil_hours;
      else if (payload.oil_hours !== undefined) payload.oil_hours = Number(payload.oil_hours);
      if (payload.replaced_oil_volume === '') delete payload.replaced_oil_volume;
      if (payload.added_oil_volume === '') delete payload.added_oil_volume;

      const result = payload.id
        ? await base44.entities.MaintenanceEvent.update(payload.id, payload)
        : await base44.entities.MaintenanceEvent.create(payload);

      // Oil change: close active lifecycle, create new one
      if (d.event_type === 'oil_change' && d.sampling_point_id) {
        const activeLC = lifecycles.find(l => l.sampling_point_id === d.sampling_point_id && l.status === 'active');
        if (activeLC) {
          await base44.entities.OilLifecycle.update(activeLC.id, {
            status: 'closed', end_date: d.event_date,
            end_operating_hours: d.total_operating_hours, end_reason: 'Замена масла'
          });
        }
        if (d.new_oil_type_id) {
          await base44.entities.OilLifecycle.create({
            sampling_point_id: d.sampling_point_id, oil_type_id: d.new_oil_type_id,
            start_date: d.event_date, start_operating_hours: d.total_operating_hours,
            status: 'active', start_reason: 'Замена масла'
          });
        }
      }

      // Recalculate equipment unit state if unit is specified
      if (d.equipment_unit_id) {
        await base44.functions.invoke('recalculateEquipmentUnitState', { equipment_unit_id: d.equipment_unit_id });
      }

      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-events'] });
      qc.invalidateQueries({ queryKey: ['oil-lifecycles'] });
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
      setOpen(false); setForm(DEF);
    }
  });
  const del = useMutation({
    mutationFn: async ({ id, equipment_unit_id }) => {
      await base44.entities.MaintenanceEvent.delete(id);
      if (equipment_unit_id) {
        await base44.functions.invoke('recalculateEquipmentUnitState', { equipment_unit_id });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-events'] });
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
    }
  });

  const filtAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);
  const filtUnits = units.filter(u => !form.asset_id || u.asset_id === form.asset_id);
  const filtPoints = points.filter(p => !form.equipment_unit_id || p.equipment_unit_id === form.equipment_unit_id);
  const filtered = events.filter(e =>
    (filterClient === 'none' || e.client_id === filterClient) &&
    (filterType === 'none' || e.event_type === filterType)
  );
  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';

  const handleUpload = async (files) => {
    setUploading(true);
    const urls = [];
    for (const file of Array.from(files)) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      urls.push(file_url);
    }
    setForm(p => ({ ...p, attachments: [...(p.attachments || []), ...urls] }));
    setUploading(false);
  };

  const removeAttachment = (url) => {
    setForm(p => ({ ...p, attachments: (p.attachments || []).filter(a => a !== url) }));
  };
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isOilChange = form.event_type === 'oil_change';
  const isHourReading = form.event_type === 'hour_reading';
  const isOilTopup = form.event_type === 'oil_topup';

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">События ТО</h1>
          <p className="text-slate-500 text-sm mt-0.5">{events.length} записей</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...DEF, event_date: new Date().toISOString().split('T')[0] }); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить событие
        </Button>
      </div>

      <div className="flex gap-2 mb-3">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Все клиенты" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Все типы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все типы</SelectItem>
            {Object.entries(EVENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Дата</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Клиент / Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Оборудование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч агрегата</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч масла</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Объём, л</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Фото</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">События не найдены</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {e.event_type === 'oil_change' && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    <span className="text-slate-800">{EVENT_TYPES[e.event_type] || e.event_type}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-slate-600">{e.event_date}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  <div className="text-xs font-medium">{getName(clients, e.client_id, 'company_name')}</div>
                  <div className="text-slate-400 text-xs">{getName(assets, e.asset_id, 'asset_name')}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{getName(units, e.equipment_unit_id, 'unit_name')}</td>
                <td className="px-4 py-2.5 text-slate-600">{e.total_operating_hours ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{e.oil_hours ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{e.replaced_oil_volume ?? e.added_oil_volume ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {e.attachments?.length > 0 ? (
                    <div className="flex items-center gap-1 text-slate-500">
                      <Image className="w-3.5 h-3.5" />
                      <span className="text-xs">{e.attachments.length}</span>
                    </div>
                  ) : '—'}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(e); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить событие?') && del.mutate({ id: e.id, equipment_unit_id: e.equipment_unit_id })}>
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
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать событие' : 'Добавить событие ТО'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2 max-h-[72vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>Тип события *</Label>
              <Select value={form.event_type} onValueChange={v => f('event_type', v)}>
                <SelectTrigger><SelectValue placeholder="Тип" /></SelectTrigger>
                <SelectContent>{Object.entries(EVENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Дата *</Label>
              <Input type="date" value={form.event_date} onChange={e => f('event_date', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Иерархия объекта</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Клиент *</Label>
                  <Select value={form.client_id} onValueChange={v => setForm(p => ({ ...p, client_id: v, asset_id: '', equipment_unit_id: '', sampling_point_id: '' }))}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Клиент" /></SelectTrigger>
                    <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Актив *</Label>
                  <Select value={form.asset_id} onValueChange={v => setForm(p => ({ ...p, asset_id: v, equipment_unit_id: '', sampling_point_id: '' }))} disabled={!form.client_id}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={form.client_id ? 'Актив' : '← сначала клиент'} /></SelectTrigger>
                    <SelectContent>{filtAssets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Оборудование</Label>
                  <Select value={form.equipment_unit_id} onValueChange={v => setForm(p => ({ ...p, equipment_unit_id: v, sampling_point_id: '' }))} disabled={!form.asset_id}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={form.asset_id ? 'Оборудование' : '← сначала актив'} /></SelectTrigger>
                    <SelectContent>{filtUnits.map(u => <SelectItem key={u.id} value={u.id}>{u.unit_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Точка отбора</Label>
                  <Select value={form.sampling_point_id} onValueChange={v => f('sampling_point_id', v)} disabled={!form.equipment_unit_id}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={form.equipment_unit_id ? 'Точка' : '← сначала оборудование'} /></SelectTrigger>
                    <SelectContent>{filtPoints.map(p => <SelectItem key={p.id} value={p.id}>{p.point_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <HierarchyPath
                client={clients.find(c => c.id === form.client_id)?.company_name}
                asset={assets.find(a => a.id === form.asset_id)?.asset_name}
                unit={units.find(u => u.id === form.equipment_unit_id)?.unit_name}
                point={points.find(p => p.id === form.sampling_point_id)?.point_name}
              />
            </div>
            <div className="space-y-1">
              <Label>М/ч агрегата на момент события</Label>
              <Input type="number" value={form.total_operating_hours} onChange={e => f('total_operating_hours', e.target.value)} placeholder="напр. 1250" />
            </div>
            {(isHourReading || isOilChange) && (
              <div className="space-y-1">
                <Label>М/ч масла на момент события{isHourReading ? '' : ' (0 = сброс)'}</Label>
                <Input type="number" value={form.oil_hours} onChange={e => f('oil_hours', e.target.value)} placeholder={isOilChange ? '0' : 'необязательно'} />
                {isHourReading && <p className="text-xs text-slate-400">Если не указано, м/ч масла будут пересчитаны автоматически</p>}
              </div>
            )}
            {isOilChange && (
              <>
                <div className="col-span-2">
                  <div className="flex items-center gap-2 bg-blue-50 rounded-md px-3 py-2 text-xs text-blue-700">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    При замене масла активный жизненный цикл будет закрыт и создан новый.
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Старое масло</Label>
                  <Select value={form.old_oil_type_id} onValueChange={v => f('old_oil_type_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Старое масло" /></SelectTrigger>
                    <SelectContent>{oils.map(o => <SelectItem key={o.id} value={o.id}>{o.oil_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Новое масло</Label>
                  <Select value={form.new_oil_type_id} onValueChange={v => f('new_oil_type_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Новое масло" /></SelectTrigger>
                    <SelectContent>{oils.map(o => <SelectItem key={o.id} value={o.id}>{o.oil_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Объём замены, л</Label>
                  <Input type="number" value={form.replaced_oil_volume} onChange={e => f('replaced_oil_volume', +e.target.value)} />
                </div>
              </>
            )}
            {isOilTopup && (
              <div className="space-y-1">
                <Label>Объём долива, л</Label>
                <Input type="number" value={form.added_oil_volume} onChange={e => f('added_oil_volume', +e.target.value)} />
              </div>
            )}
            <div className="col-span-2 space-y-1">
              <Label>Комментарий</Label>
              <Textarea value={form.comment} onChange={e => f('comment', e.target.value)} rows={2} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Фотографии</Label>
              <label className="flex items-center gap-2 border-2 border-dashed border-slate-200 rounded-md p-3 cursor-pointer hover:border-slate-400 transition-colors">
                <Upload className="w-4 h-4 text-slate-400" />
                <span className="text-sm text-slate-500">{uploading ? 'Загрузка...' : 'Прикрепить фото'}</span>
                <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={e => handleUpload(e.target.files)} />
              </label>
              {(form.attachments || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {(form.attachments || []).map((url, i) => (
                    <div key={i} className="relative group">
                      <img src={url} alt="" className="w-20 h-20 object-cover rounded-md border border-slate-200" />
                      <button
                        onClick={() => removeAttachment(url)}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {save.isError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-2">
              Ошибка сохранения: {save.error?.message || 'неизвестная ошибка'}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.event_type || !form.event_date || !form.client_id || !form.asset_id || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}