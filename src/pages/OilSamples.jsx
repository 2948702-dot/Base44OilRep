import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, FlaskConical, Search } from 'lucide-react';
import HierarchyPath from '@/components/HierarchyPath';
import { useNavigate } from 'react-router-dom';
import { ENGINE_STATES, SAMPLE_STATUSES } from '@/utils/labels';
import StatusBadge from '@/components/StatusBadge';

const STORAGE_TYPES = ['Закрытый склад', 'На открытом воздухе', 'Холодное хранилище', 'Другое'];

const DEF = {
  sample_type: 'in_service',
  sample_number: '', client_id: '', asset_id: '', equipment_unit_id: '', sampling_point_id: '',
  oil_type_id: '', lifecycle_id: '', sampling_date: '', total_hours_at_sampling: '',
  oil_hours_at_sampling: '', engine_state: 'warm', sample_status: 'pending',
  batch_number: '', production_date: '', storage_type: '', delivery_date: '', supplier: '',
  operator_user_id: '', comments: ''
};

const genSampleNumber = (existing) => {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  const nums = existing
    .map(s => s.sample_number)
    .filter(n => n && n.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, ''), 10))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
};

export default function OilSamples() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterClient, setFilterClient] = useState('');
  const [filterAsset, setFilterAsset] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [searchText, setSearchText] = useState('');
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: samples = [], isLoading } = useQuery({ queryKey: ['oil-samples'], queryFn: () => base44.entities.OilSample.list(), staleTime: 0 });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });
  const { data: assets = [] } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: units = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: points = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  const { data: lifecycles = [] } = useQuery({ queryKey: ['oil-lifecycles'], queryFn: () => base44.entities.OilLifecycle.list() });

  const cleanForm = (d) => {
    const c = { ...d };
    ['total_hours_at_sampling', 'oil_hours_at_sampling'].forEach(k => { if (c[k] === '' || c[k] === null) delete c[k]; });
    return c;
  };

  const save = useMutation({
    mutationFn: d => { const c = cleanForm(d); return c.id ? base44.entities.OilSample.update(c.id, c) : base44.entities.OilSample.create(c); },
    onSuccess: () => { setOpen(false); setForm(DEF); qc.invalidateQueries({ queryKey: ['oil-samples'] }); qc.refetchQueries({ queryKey: ['oil-samples'] }); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.OilSample.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oil-samples'] }); qc.refetchQueries({ queryKey: ['oil-samples'] }); }
  });

  const filtAssets = assets.filter(a => !form.client_id || a.client_id === form.client_id);
  const filtUnits = units.filter(u => !form.asset_id || u.asset_id === form.asset_id);
  const filtPoints = points.filter(p => !form.equipment_unit_id || p.equipment_unit_id === form.equipment_unit_id);
  const activeLC = lifecycles.filter(l => l.status === 'active' && (!form.sampling_point_id || l.sampling_point_id === form.sampling_point_id));

  const filteredAssetOptions = assets.filter(a => !filterClient || a.client_id === filterClient);

  const filtered = samples.filter(s =>
    (filterClient === 'none' || s.client_id === filterClient) &&
    (filterAsset === 'none' || s.asset_id === filterAsset) &&
    (filterStatus === 'none' || s.sample_status === filterStatus) &&
    (!searchText || s.sample_number?.toLowerCase().includes(searchText.toLowerCase()))
  );

  const getName = (list, id, field) => list.find(x => x.id === id)?.[field] || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Пробы масла</h1>
          <p className="text-slate-500 text-sm mt-0.5">{samples.length} проб</p>
        </div>
        <Button size="sm" onClick={() => { setForm({ ...DEF, sampling_date: new Date().toISOString().split('T')[0], sample_number: genSampleNumber(samples) }); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить пробу
        </Button>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по № пробы..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="pl-8 pr-3 h-9 w-44 rounded-md border border-input bg-transparent text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Select value={filterClient} onValueChange={v => { setFilterClient(v); setFilterAsset(''); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Все клиенты" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterAsset} onValueChange={setFilterAsset}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Все суда" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все суда</SelectItem>
            {filteredAssetOptions.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Все статусы" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все статусы</SelectItem>
            {Object.entries(SAMPLE_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">№ пробы</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Дата</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Клиент / Актив</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Точка отбора</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Состояние</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">М/ч масла</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Статус</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={9} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-slate-400">Пробы не найдены</td></tr>
            ) : filtered.slice(0, 100).map(s => (
              <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono text-slate-900 text-xs font-medium">{s.sample_number}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.sampling_date}</td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{s.sample_type === 'fresh_oil' ? 'Свежее' : 'Из узла'}</td>
                <td className="px-4 py-2.5 text-slate-700">
                  <div className="text-xs font-medium">{getName(clients, s.client_id, 'company_name')}</div>
                  <div className="text-slate-400 text-xs">{getName(assets, s.asset_id, 'asset_name')}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{getName(points, s.sampling_point_id, 'point_name')}</td>
                <td className="px-4 py-2.5 text-slate-600 text-xs">{s.sample_type === 'in_service' ? ENGINE_STATES[s.engine_state] || '—' : '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{s.oil_hours_at_sampling ?? '—'}</td>
                <td className="px-4 py-2.5"><StatusBadge status={s.sample_status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Добавить результат анализа" onClick={() => navigate(`/analysis-results?sample=${s.id}`)}>
                      <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(s); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить пробу?') && del.mutate(s.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length > 100 && (
              <tr><td colSpan={9} className="text-center py-3 text-slate-400 text-xs">Показано 100 из {filtered.length}. Используйте поиск или фильтры для уточнения.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать пробу' : 'Добавить пробу масла'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-3 gap-3 py-2 max-h-[75vh] overflow-y-auto pr-1">
            <div className="space-y-1">
              <Label>Тип пробы <span className="text-red-500">*</span></Label>
              <Select value={form.sample_type} onValueChange={v => f('sample_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresh_oil">Свежее (базовое) масло</SelectItem>
                  <SelectItem value="in_service">Масло из узла</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>№ пробы <span className="text-red-500">*</span></Label>
              <Input value={form.sample_number} onChange={e => f('sample_number', e.target.value)} placeholder="SO-2024-001" />
            </div>
            <div className="space-y-1">
              <Label>Дата отбора <span className="text-red-500">*</span></Label>
              <Input type="date" value={form.sampling_date} onChange={e => f('sampling_date', e.target.value)} />
            </div>

            {form.sample_type === 'in_service' && (
              <>
                <div className="space-y-1">
                  <Label>Состояние агрегата <span className="text-red-500">*</span></Label>
                  <Select value={form.engine_state} onValueChange={v => f('engine_state', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(ENGINE_STATES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 space-y-2">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Иерархия объекта</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Клиент *</Label>
                      <Select value={form.client_id} onValueChange={v => setForm(p => ({ ...p, client_id: v, asset_id: '', equipment_unit_id: '', sampling_point_id: '', lifecycle_id: '' }))}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Клиент" /></SelectTrigger>
                        <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Актив</Label>
                      <Select value={form.asset_id} onValueChange={v => setForm(p => ({ ...p, asset_id: v, equipment_unit_id: '', sampling_point_id: '', lifecycle_id: '' }))} disabled={!form.client_id}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={form.client_id ? 'Актив' : '← сначала клиент'} /></SelectTrigger>
                        <SelectContent>{filtAssets.map(a => <SelectItem key={a.id} value={a.id}>{a.asset_name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Оборудование</Label>
                      <Select value={form.equipment_unit_id} onValueChange={v => setForm(p => ({ ...p, equipment_unit_id: v, sampling_point_id: '', lifecycle_id: '' }))} disabled={!form.asset_id}>
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
                  <Label>М/ч всего</Label>
                  <Input type="number" value={form.total_hours_at_sampling} onChange={e => f('total_hours_at_sampling', e.target.value === '' ? '' : +e.target.value)} placeholder="не указано" />
                </div>
                <div className="space-y-1">
                  <Label>М/ч масла</Label>
                  <Input type="number" value={form.oil_hours_at_sampling} onChange={e => f('oil_hours_at_sampling', e.target.value === '' ? '' : +e.target.value)} placeholder="не указано" />
                </div>
              </>
            )}

            {form.sample_type === 'fresh_oil' && (
              <div className="col-span-3 space-y-2">
                <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Параметры свежего масла</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Партия</Label>
                    <Input value={form.batch_number} onChange={e => f('batch_number', e.target.value)} placeholder="Номер партии" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Дата производства</Label>
                    <Input type="date" value={form.production_date} onChange={e => f('production_date', e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Тип хранения</Label>
                    <Select value={form.storage_type} onValueChange={v => f('storage_type', v)}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Выберите" /></SelectTrigger>
                      <SelectContent>{STORAGE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Дата доставки</Label>
                    <Input type="date" value={form.delivery_date} onChange={e => f('delivery_date', e.target.value)} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs">Поставщик</Label>
                    <Input value={form.supplier} onChange={e => f('supplier', e.target.value)} placeholder="Имя поставщика" />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Статус пробы</Label>
              <Select value={form.sample_status} onValueChange={v => f('sample_status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(SAMPLE_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {form.sample_type === 'in_service' && activeLC.length > 0 && (
              <div className="col-span-3 space-y-1">
                <Label>Жизненный цикл масла</Label>
                <Select value={form.lifecycle_id} onValueChange={v => f('lifecycle_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Выберите цикл" /></SelectTrigger>
                  <SelectContent>{activeLC.map(l => <SelectItem key={l.id} value={l.id}>{l.start_date} — активный</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div className="col-span-3 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.sample_number || !form.sampling_date || (form.sample_type === 'in_service' && !form.client_id) || (form.sample_type === 'in_service' && !form.engine_state) || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}