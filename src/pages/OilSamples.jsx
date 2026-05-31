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
  const [filterClient, setFilterClient] = useState('none');
  const [filterAsset, setFilterAsset] = useState('none');
  const [filterStatus, setFilterStatus] = useState('none');
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
  const { data: results = [] } = useQuery({ queryKey: ['analysis-results'], queryFn: () => base44.entities.AnalysisResult.list() });

  const cleanForm = (d) => {
    const c = { ...d };
    ['total_hours_at_sampling', 'oil_hours_at_sampling'].forEach(k => { if (c[k] === '' || c[k] === null) delete c[k]; });
    return c;
  };

  const save = useMutation({
    mutationFn: d => { const c = cleanForm(d); return c.id ? base44.entities.OilSample.update(c.id, c) : base44.entities.OilSample.create(c); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oil-samples'] }); }
  });
  const saveAnalysis = useMutation({
    mutationFn: d => d.id ? base44.entities.AnalysisResult.update(d.id, d) : base44.entities.AnalysisResult.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['analysis-results'] }); setOpen(false); setForm(DEF); }
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
  const currentAnalysis = results.find(r => r.sample_id === form.id);

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
        <Select value={filterClient} onValueChange={v => { setFilterClient(v); setFilterAsset('none'); }}>
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

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-xs min-w-max">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-28">№ пробы</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-32">Клиент / Актив</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Вязк.<br/>40°C</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Плотн.<br/>кг/м³</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Диэлектр.</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Акт.<br/>вода %</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Вода<br/>ppm</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Железо<br/>мг/л</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Износ</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">OHI</th>
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 w-24">Статус</th>
              <th className="w-20 px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={12} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-10 text-slate-400">Пробы не найдены</td></tr>
            ) : filtered.slice(0, 100).map(s => {
              const res = results.find(r => r.sample_id === s.id);
              const cell = (val, dec = 1) => val != null ? <span className="font-medium text-slate-800">{typeof val === 'number' ? val.toFixed(dec) : val}</span> : <span className="text-slate-300">—</span>;
              const ohiColor = (v) => v == null ? '' : v >= 70 ? 'text-green-600' : v >= 40 ? 'text-yellow-600' : 'text-red-600';
              return (
                <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <div className="font-mono text-slate-900 font-medium">{s.sample_number}</div>
                    <div className="text-slate-400 text-xs">{s.sampling_date ? s.sampling_date.split('-').reverse().join('.') : '—'}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-700 truncate max-w-[130px]">{getName(assets, s.asset_id, 'asset_name')}</div>
                    <div className="text-slate-400 truncate max-w-[130px]">{getName(units, s.equipment_unit_id, 'unit_name')}</div>
                  </td>
                  <td className="px-2 py-2 text-center">{cell(res?.viscosity_40)}</td>
                  <td className="px-2 py-2 text-center">{cell(res?.density, 0)}</td>
                  <td className="px-2 py-2 text-center">{cell(res?.dielectric_constant, 2)}</td>
                  <td className="px-2 py-2 text-center">{cell(res?.water_activity)}</td>
                  <td className="px-2 py-2 text-center">{cell(res?.water_ppm, 0)}</td>
                  <td className="px-2 py-2 text-center">{cell(res?.iron_mg_l)}</td>
                  <td className="px-2 py-2 text-center">{cell(res?.wear_index, 1)}</td>
                  <td className="px-2 py-2 text-center">
                    {res?.oil_health_index != null
                      ? <span className={`font-bold ${ohiColor(res.oil_health_index)}`}>{Math.round(res.oil_health_index)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={s.sample_status} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Добавить результат анализа" onClick={() => navigate(`/analysis-results?sample=${s.id}`)}>                        <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Редактировать пробу и параметры" onClick={() => { const newForm = { ...s }; const existingAnalysis = results.find(r => r.sample_id === s.id); if (existingAnalysis) Object.assign(newForm, existingAnalysis); setForm(newForm); setOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить пробу?') && del.mutate(s.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filtered.length > 100 && (
              <tr><td colSpan={12} className="text-center py-3 text-slate-400">Показано 100 из {filtered.length}. Используйте поиск или фильтры для уточнения.</td></tr>
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

            <div className="col-span-3 border-t pt-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Параметры анализа</p>
            </div>
            <div className="space-y-1"><Label>Железо, мг/л</Label><Input type="number" step="0.01" value={form.iron_mg_l !== undefined && form.iron_mg_l !== '' ? form.iron_mg_l : ''} onChange={e => f('iron_mg_l', e.target.value === '' ? '' : +e.target.value)} /></div>
            <div className="space-y-1"><Label>Вода раств., ppm</Label><Input type="number" step="0.1" value={form.water_ppm !== undefined && form.water_ppm !== '' ? form.water_ppm : ''} onChange={e => f('water_ppm', e.target.value === '' ? '' : +e.target.value)} /></div>
            <div className="space-y-1"><Label>Активность воды (aw)</Label><Input type="number" step="0.001" min="0" max="1" value={form.water_activity !== undefined && form.water_activity !== '' ? form.water_activity : ''} onChange={e => f('water_activity', e.target.value === '' ? '' : +e.target.value)} /></div>
            <div className="space-y-1"><Label>Вязкость при 40°C</Label><Input type="number" step="0.01" value={form.viscosity_40 !== undefined && form.viscosity_40 !== '' ? form.viscosity_40 : ''} onChange={e => f('viscosity_40', e.target.value === '' ? '' : +e.target.value)} /></div>
            <div className="space-y-1"><Label>Плотность, кг/м³</Label><Input type="number" step="0.1" value={form.density !== undefined && form.density !== '' ? form.density : ''} onChange={e => f('density', e.target.value === '' ? '' : +e.target.value)} /></div>
            <div className="space-y-1"><Label>Диэлектрич. постоянная</Label><Input type="number" step="0.01" value={form.dielectric_constant !== undefined && form.dielectric_constant !== '' ? form.dielectric_constant : ''} onChange={e => f('dielectric_constant', e.target.value === '' ? '' : +e.target.value)} /></div>
            <div className="col-span-3 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => {
              const { iron_mg_l, water_ppm, water_activity, viscosity_40, density, dielectric_constant, ...sampleData } = form;
              const hasAnalysisData = iron_mg_l !== undefined && iron_mg_l !== '' || water_ppm !== undefined && water_ppm !== '' || water_activity !== undefined && water_activity !== '' || viscosity_40 !== undefined && viscosity_40 !== '' || density !== undefined && density !== '' || dielectric_constant !== undefined && dielectric_constant !== '';
              
              save.mutate(sampleData, {
                onSuccess: () => {
                  if (hasAnalysisData) {
                    const analysisData = { sample_id: form.id, client_id: form.client_id, asset_id: form.asset_id };
                    if (iron_mg_l !== undefined && iron_mg_l !== '') analysisData.iron_mg_l = iron_mg_l;
                    if (water_ppm !== undefined && water_ppm !== '') analysisData.water_ppm = water_ppm;
                    if (water_activity !== undefined && water_activity !== '') analysisData.water_activity = water_activity;
                    if (viscosity_40 !== undefined && viscosity_40 !== '') analysisData.viscosity_40 = viscosity_40;
                    if (density !== undefined && density !== '') analysisData.density = density;
                    if (dielectric_constant !== undefined && dielectric_constant !== '') analysisData.dielectric_constant = dielectric_constant;
                    if (currentAnalysis?.id) analysisData.id = currentAnalysis.id;
                    saveAnalysis.mutate(analysisData);
                  } else {
                    setOpen(false);
                    setForm(DEF);
                  }
                }
              });
            }} disabled={!form.sample_number || !form.sampling_date || (form.sample_type === 'in_service' && !form.client_id) || (form.sample_type === 'in_service' && !form.engine_state) || save.isPending || saveAnalysis.isPending}>
              {save.isPending || saveAnalysis.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}