import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildPayload } from '@/utils/payload';
import { OIL_SAMPLE_FIELDS, OIL_SAMPLE_NUMBER_FIELDS } from '@/utils/entityFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Search, CheckCircle2, FlaskConical, ChevronRight, ChevronLeft, Plus, X } from 'lucide-react';
import QRScanner from '@/components/mobile/QRScanner';
import { getThresholdSeverity, resolveThresholdRule } from '@/utils/thresholdRules';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import OilFormDialog from '@/components/OilFormDialog';

const PARAMS = [
  { key: 'iron_mg_l', label: 'Железо', unit: 'мг/л' },
  { key: 'water_ppm', label: 'Вода', unit: 'ppm' },
  { key: 'water_activity', label: 'Активность воды', unit: '%' },
  { key: 'viscosity_40', label: 'Вязкость 40°C', unit: 'мм²/с' },
  { key: 'density', label: 'Плотность', unit: 'кг/м³' },
  { key: 'dielectric_constant', label: 'Диэлектр. константа', unit: '' },
];

function StatusDot({ value, rule }) {
  if (value === '' || value === null || value === undefined || !rule) return null;
  const severity = getThresholdSeverity(rule, value);
  let color = 'bg-slate-300';
  if (severity === 'green') color = 'bg-green-500';
  else if (severity === 'yellow') color = 'bg-yellow-400';
  else if (severity === 'red') color = 'bg-red-500';
  return <span className={`w-3 h-3 rounded-full ${color} flex-shrink-0 mt-1`} />;
}

const today = () => new Date().toISOString().split('T')[0];

const genSampleNumber = (existing) => {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;
  const nums = existing
    .map(s => s.sample_number)
    .filter(n => n && n.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, ''), 10))
    .filter(n => !Number.isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
};

const makeManualForm = (existingSamples) => {
  const date = today();
  return {
    sample_type: 'fresh_oil',
    sample_number: genSampleNumber(existingSamples),
    sample_origin: 'client_delivered',
    container_type: 'client_container',
    external_sample_label: '',
    can_qr_code: '',
    client_id: '',
    asset_id: '',
    equipment_unit_id: '',
    oil_type_id: '',
    sampling_date: date,
    received_date: date,
    hours_source: 'reported_by_client',
    engine_state: 'warm',
    sample_status: 'in_analysis',
    comments: '',
    attachments: [],
  };
};

function LookupField({ value, options, onChange, placeholder, disabled = false, allowClear = true, actionLabel, onAction }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const selected = options.find(option => option.id === value);
    setQuery(selected?.label || '');
  }, [value, options]);

  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options
    .filter(option => `${option.label} ${option.meta || ''}`.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 12);

  const clear = () => {
    onChange('');
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          className="h-12 pl-9 pr-9 text-base"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => !disabled && setOpen(true)}
          onChange={event => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {allowClear && value && !disabled && (
          <button type="button" onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {open && !disabled && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto">
          {filtered.length > 0 ? filtered.map(option => (
            <button
              key={option.id}
              type="button"
              className="w-full text-left px-3 py-3 text-sm hover:bg-slate-50 border-b border-slate-50 last:border-0"
              onMouseDown={() => {
                onChange(option.id);
                setQuery(option.label);
                setOpen(false);
              }}
            >
              <span className="font-medium text-slate-800">{option.label}</span>
              {option.meta && <span className="block text-xs text-slate-400 mt-0.5">{option.meta}</span>}
            </button>
          )) : (
            <div className="px-3 py-4 text-sm text-slate-500">Ничего не найдено</div>
          )}
          {onAction && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-3 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
              onMouseDown={(event) => {
                event.preventDefault();
                setOpen(false);
                onAction();
              }}
            >
              <Plus className="h-4 w-4" />
              {actionLabel || 'Добавить'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LabHeader({ muted = false }) {
  return (
    <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${muted ? 'bg-slate-100 text-slate-500' : 'bg-purple-50 text-purple-700'}`}>
          <FlaskConical className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight text-slate-900">Ввод результатов</h1>
          <p className="text-xs leading-tight text-slate-500">Лабораторный анализ масла</p>
        </div>
      </div>
    </div>
  );
}

export default function MobileLab() {
  const qc = useQueryClient();
  const { user, isAdmin, isClientAdmin, isLabTechnician } = useRoleAccess();
  const canUseLab = isAdmin || isClientAdmin || isLabTechnician;
  const [step, setStep] = useState(0); // 0=search, 1=form, 2=done, 3=manual sample
  const [scanner, setScanner] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sample, setSample] = useState(null);
  const [results, setResults] = useState({});
  const [recommendation, setRecommendation] = useState('');
  const [manualForm, setManualForm] = useState(() => makeManualForm([]));
  const [oilDialogOpen, setOilDialogOpen] = useState(false);

  const { data: allSamples = [] } = useQuery({
    queryKey: ['oil-samples'],
    queryFn: () => base44.entities.OilSample.list(),
    enabled: canUseLab,
  });
  const { data: thresholds = [] } = useQuery({
    queryKey: ['threshold-rules'],
    queryFn: () => base44.entities.ThresholdRule.list(),
    enabled: canUseLab,
  });
  const { data: equipmentUnits = [] } = useQuery({
    queryKey: ['equipment-units'],
    queryFn: () => base44.entities.EquipmentUnit.list(),
    enabled: canUseLab,
  });
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list(),
    enabled: canUseLab,
  });
  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list(),
    enabled: canUseLab,
  });
  const { data: oils = [] } = useQuery({
    queryKey: ['oil-references'],
    queryFn: () => base44.entities.OilReference.list(),
    enabled: canUseLab,
  });

  const pendingSamples = allSamples.filter(s => s.sample_status === 'pending' || s.sample_status === 'in_analysis');

  const handleScan = (data) => {
    setScanner(false);
    const normalized = String(data || '').trim().toLowerCase();
    const found = allSamples.find(s => [
      s.can_qr_code,
      s.sample_number,
      s.external_sample_label,
    ].some(value => String(value || '').trim().toLowerCase() === normalized));
    if (found) { selectSample(found); }
    else alert('Проба с таким кодом не найдена');
  };

  const selectSample = async (s) => {
    setSample(s);
    if (s.sample_status === 'pending') {
      await base44.entities.OilSample.update(s.id, { sample_status: 'in_analysis' });
      qc.invalidateQueries({ queryKey: ['oil-samples'] });
    }
    setStep(1);
  };

  const saveResults = useMutation({
    mutationFn: async () => {
      const numericResults = {};
      Object.entries(results).forEach(([k, v]) => {
        if (v !== '') numericResults[k] = Number(v);
      });
      const unit = equipmentUnits.find(u => u.id === sample.equipment_unit_id);
      const oilTypeId = sample.oil_type_id || unit?.current_oil_type_id || unit?.oil_type_id;
      // Determine status
      let overall = 'green';
      PARAMS.forEach(({ key }) => {
        if (numericResults[key] === null || numericResults[key] === undefined || Number.isNaN(numericResults[key])) return;
        const rule = resolveThresholdRule(thresholds, key, oilTypeId, unit);
        if (!rule) return;
        const severity = getThresholdSeverity(rule, numericResults[key]);
        if (severity === 'red') overall = 'red';
        else if (overall !== 'red' && severity === 'yellow') overall = 'yellow';
      });
      // Upsert: update existing result if any, create otherwise
      const existing = await base44.entities.AnalysisResult.filter({ sample_id: sample.id });
      const resultData = { sample_id: sample.id, client_id: sample.client_id, ...numericResults, recommendation_text: recommendation, overall_status: overall };
      if (sample.asset_id) resultData.asset_id = sample.asset_id;
      if (existing.length > 0) {
        await base44.entities.AnalysisResult.update(existing[0].id, resultData);
      } else {
        await base44.entities.AnalysisResult.create(resultData);
      }
      await base44.entities.OilSample.update(sample.id, { sample_status: 'completed' });
      qc.invalidateQueries({ queryKey: ['oil-samples'] });
      qc.invalidateQueries({ queryKey: ['analysis-results'] });
    },
    onSuccess: () => setStep(2),
  });

  const createManualSample = useMutation({
    mutationFn: async () => {
      const unit = equipmentUnits.find(u => u.id === manualForm.equipment_unit_id);
      const data = {
        ...manualForm,
        asset_id: manualForm.asset_id || unit?.asset_id || '',
        oil_type_id: manualForm.oil_type_id || unit?.current_oil_type_id || unit?.oil_type_id || '',
        equipment_unit_id: manualForm.equipment_unit_id || '',
        engine_state: manualForm.sample_type === 'in_service' ? manualForm.engine_state : null,
        sample_status: 'in_analysis',
      };
      const payload = buildPayload(data, OIL_SAMPLE_FIELDS, OIL_SAMPLE_NUMBER_FIELDS);
      return base44.entities.OilSample.create(payload);
    },
    onSuccess: (createdSample) => {
      qc.invalidateQueries({ queryKey: ['oil-samples'] });
      setSample(createdSample);
      setResults({});
      setRecommendation('');
      setStep(1);
    },
  });

  const getUnitName = (id) => equipmentUnits.find(u => u.id === id)?.unit_name || '';
  const getClientName = (id) => clients.find(c => c.id === id)?.company_name || '';
  const getAssetName = (id) => assets.find(a => a.id === id)?.asset_name || '';
  const getOilName = (id) => oils.find(o => o.id === id)?.oil_name || '';
  const getUnitClientId = (unit) => unit?.client_id || assets.find(a => a.id === unit?.asset_id)?.client_id || '';
  const getContainerLabel = (s) => {
    if (s.can_qr_code) return `QR: ${s.can_qr_code.slice(0, 20)}${s.can_qr_code.length > 20 ? '...' : ''}`;
    if (s.external_sample_label) return `Маркировка клиента: ${s.external_sample_label}`;
    return 'Без QR и номера банки';
  };
  const selectedUnit = sample ? equipmentUnits.find(u => u.id === sample.equipment_unit_id) : null;
  const selectedOilTypeId = sample?.oil_type_id || selectedUnit?.current_oil_type_id || selectedUnit?.oil_type_id;

  const filtered = pendingSamples.filter(s => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return [
      s.sample_number,
      s.can_qr_code,
      s.external_sample_label,
      getUnitName(s.equipment_unit_id),
      getAssetName(s.asset_id),
      getClientName(s.client_id),
    ].some(value => String(value || '').toLowerCase().includes(query));
  });
  const displayedSamples = searchQuery ? filtered : pendingSamples;
  const manualAssets = assets.filter(a => !manualForm.client_id || a.client_id === manualForm.client_id);
  const manualUnits = equipmentUnits.filter(u =>
    (!manualForm.client_id || getUnitClientId(u) === manualForm.client_id) &&
    (!manualForm.asset_id || u.asset_id === manualForm.asset_id)
  );
  const clientOptions = clients.map(c => ({ id: c.id, label: c.company_name, meta: c.contact_person || c.email || '' }));
  const assetOptions = manualAssets.map(a => ({ id: a.id, label: a.asset_name, meta: getClientName(a.client_id) }));
  const unitOptions = manualUnits.map(u => ({ id: u.id, label: u.unit_name, meta: getAssetName(u.asset_id) }));
  const oilOptions = oils.map(o => ({ id: o.id, label: o.oil_name, meta: o.manufacturer || '' }));
  const canCreateManualSample =
    manualForm.sample_number &&
    manualForm.sampling_date &&
    manualForm.client_id &&
    (
      manualForm.sample_type === 'fresh_oil'
        ? manualForm.oil_type_id
        : manualForm.asset_id && manualForm.equipment_unit_id && manualForm.engine_state
    ) &&
    !createManualSample.isPending;

  const openManualForm = () => {
    setManualForm(makeManualForm(allSamples));
    setResults({});
    setRecommendation('');
    setStep(3);
  };

  const handleOilCreated = (oil) => {
    qc.invalidateQueries({ queryKey: ['oil-references'] });
    if (oil?.id) {
      setManualForm(p => ({ ...p, oil_type_id: oil.id }));
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
        <LabHeader muted />
        <div className="flex-1 p-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Проверяем права доступа...
          </div>
        </div>
      </div>
    );
  }

  if (!canUseLab) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
        <LabHeader muted />
        <div className="flex-1 p-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Ввод лабораторных анализов доступен только лаборанту или админу франчайзи.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
      {scanner && <QRScanner label="Сканируйте QR банки с пробой" onScan={handleScan} onClose={() => setScanner(false)} />}
      <OilFormDialog
        open={oilDialogOpen}
        onOpenChange={setOilDialogOpen}
        onCreated={handleOilCreated}
      />

      <LabHeader />

      <div className="flex-1 p-4 overflow-y-auto">

        {/* Step 0: Search */}
        {step === 0 && (
          <div className="space-y-4">
            <Button className="w-full h-14 text-base gap-3" onClick={() => setScanner(true)}>
              <Camera className="w-5 h-5" />
              Сканировать QR банки
            </Button>
            <Button variant="outline" className="w-full h-14 text-base gap-3 bg-white" onClick={openManualForm}>
              Нет QR — ввести пробу вручную
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300" /></div>
              <div className="relative flex justify-center text-sm"><span className="bg-slate-50 px-3 text-slate-500">или выберите из списка</span></div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-9 h-12 text-base" placeholder="Поиск: клиент, судно, агрегат, № пробы, QR..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            {(searchQuery || pendingSamples.length > 0) && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide">
                  {searchQuery ? `Результаты (${filtered.length})` : `Ожидают анализа (${pendingSamples.length})`}
                </p>
                {displayedSamples.map(s => (
                  <button key={s.id} className="w-full text-left bg-white rounded-xl p-4 border border-slate-200 hover:border-purple-300 active:bg-purple-50"
                    onClick={() => selectSample(s)}>
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-slate-900 font-mono">{s.sample_number}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.sample_status === 'in_analysis' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>
                        {s.sample_status === 'in_analysis' ? 'В анализе' : 'Ожидает'}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">{getUnitName(s.equipment_unit_id)} · {s.sampling_date}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{getClientName(s.client_id)} · {getAssetName(s.asset_id)}</p>
                    <p className={`text-xs mt-1 ${s.can_qr_code || s.external_sample_label ? 'text-slate-400' : 'text-amber-600'}`}>
                      {getContainerLabel(s)}
                    </p>
                  </button>
                ))}
                {displayedSamples.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                    Ничего не найдено. Можно очистить поиск и выбрать пробу из общего списка ожидающих анализа.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 3: Manual sample creation */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Проба без QR</p>
                <p className="text-xs text-slate-500 mt-0.5">Заполните данные банки, затем сразу внесите результаты анализа.</p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Тип пробы</Label>
                <Select value={manualForm.sample_type} onValueChange={value => setManualForm(p => ({ ...p, sample_type: value, asset_id: '', equipment_unit_id: '', oil_type_id: value === 'fresh_oil' ? p.oil_type_id : '' }))}>
                  <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fresh_oil">Свежее (базовое) масло</SelectItem>
                    <SelectItem value="in_service">Масло из узла</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">№ пробы</Label>
                  <Input className="h-12 text-base" value={manualForm.sample_number} onChange={e => setManualForm(p => ({ ...p, sample_number: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Дата</Label>
                  <Input className="h-12 text-base" type="date" value={manualForm.sampling_date} onChange={e => setManualForm(p => ({ ...p, sampling_date: e.target.value, received_date: e.target.value }))} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Клиент *</Label>
                <LookupField
                  value={manualForm.client_id}
                  options={clientOptions}
                  placeholder="Найти клиента..."
                  onChange={value => setManualForm(p => ({ ...p, client_id: value, asset_id: '', equipment_unit_id: '' }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Актив{manualForm.sample_type === 'in_service' ? ' *' : ''}</Label>
                <LookupField
                  value={manualForm.asset_id}
                  options={assetOptions}
                  placeholder={manualForm.client_id ? 'Найти актив...' : 'сначала клиент'}
                  disabled={!manualForm.client_id}
                  onChange={value => setManualForm(p => ({ ...p, asset_id: value, equipment_unit_id: '' }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">Агрегат / узел{manualForm.sample_type === 'in_service' ? ' *' : ''}</Label>
                <LookupField
                  value={manualForm.equipment_unit_id}
                  options={unitOptions}
                  placeholder={manualForm.client_id ? 'Найти агрегат...' : 'сначала клиент'}
                  disabled={!manualForm.client_id}
                  onChange={value => {
                    const unit = equipmentUnits.find(u => u.id === value);
                    const unitOilId = unit?.current_oil_type_id || unit?.oil_type_id || '';
                    setManualForm(p => ({
                      ...p,
                      asset_id: unit?.asset_id || p.asset_id,
                      equipment_unit_id: value,
                      oil_type_id: p.sample_type === 'in_service' ? unitOilId || p.oil_type_id : p.oil_type_id || unitOilId,
                    }));
                  }}
                />
              </div>

              {manualForm.sample_type === 'fresh_oil' && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Базовое масло *</Label>
                  <LookupField
                    value={manualForm.oil_type_id}
                    options={oilOptions}
                    placeholder="Найти масло..."
                    onChange={value => setManualForm(p => ({ ...p, oil_type_id: value }))}
                    actionLabel="Добавить масло"
                    onAction={() => setOilDialogOpen(true)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-center gap-2 bg-white text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    onClick={() => setOilDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" />
                    Добавить масло
                  </Button>
                </div>
              )}

              {manualForm.sample_type === 'in_service' && (
                <div className="space-y-1.5">
                  <Label className="text-sm">Состояние агрегата</Label>
                  <Select value={manualForm.engine_state} onValueChange={value => setManualForm(p => ({ ...p, engine_state: value }))}>
                    <SelectTrigger className="h-12 text-base"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warm">Тёплый</SelectItem>
                      <SelectItem value="cold">Холодный</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-sm">Надпись клиента / комментарий</Label>
                <Input className="h-12 text-base" value={manualForm.external_sample_label} onChange={e => setManualForm(p => ({ ...p, external_sample_label: e.target.value }))} placeholder="если есть" />
              </div>

              {manualForm.sample_type === 'fresh_oil' && (
                <p className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-700">
                  Для базового масла достаточно клиента и масла. Актив и агрегат можно указать, если известно куда применять базу.
                </p>
              )}

              {createManualSample.isError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Ошибка создания пробы: {createManualSample.error?.message || 'Base44 не принял данные'}
                </div>
              )}
            </div>

            <Button className="w-full h-14 text-base" onClick={() => createManualSample.mutate()} disabled={!canCreateManualSample}>
              {createManualSample.isPending ? 'Создание...' : 'Продолжить к анализу'}
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(0)}>
              <ChevronLeft className="w-4 h-4 mr-1" />Назад
            </Button>
          </div>
        )}

        {/* Step 1: Results form */}
        {step === 1 && sample && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-xs text-purple-600 font-medium uppercase tracking-wide mb-1">Проба</p>
              <p className="font-bold text-purple-900 font-mono text-lg">{sample.sample_number}</p>
              <p className="text-sm text-purple-700">{getUnitName(sample.equipment_unit_id) || getOilName(sample.oil_type_id) || getClientName(sample.client_id)}</p>
              <p className="text-xs text-purple-500">{sample.sampling_date}</p>
              <p className="text-xs text-purple-600 mt-1">{getContainerLabel(sample)}</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-700">Параметры анализа</p>
                <p className="text-xs text-slate-500 mt-0.5">Цветная точка = соответствие нормам</p>
              </div>
              <div className="divide-y divide-slate-100">
                {PARAMS.map(({ key, label, unit }) => (
                  <div key={key} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">{label}</p>
                      {unit && <p className="text-xs text-slate-400">{unit}</p>}
                    </div>
                    <StatusDot value={results[key]} rule={resolveThresholdRule(thresholds, key, selectedOilTypeId, selectedUnit)} />
                    <Input
                      className="w-28 h-10 text-right text-base"
                      inputMode="decimal"
                      placeholder="—"
                      value={results[key] || ''}
                      onChange={e => setResults(p => ({ ...p, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
              <Label className="text-sm font-semibold">Рекомендации</Label>
              <Textarea rows={4} placeholder="Введите рекомендации по результатам анализа..." value={recommendation} onChange={e => setRecommendation(e.target.value)} />
            </div>

            <Button className="w-full h-14 text-base" onClick={() => saveResults.mutate()} disabled={saveResults.isPending}>
              {saveResults.isPending ? 'Сохранение...' : 'Сохранить результаты'}
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(0)}>
              <ChevronLeft className="w-4 h-4 mr-1" />Назад
            </Button>
          </div>
        )}

        {/* Step 2: Done */}
        {step === 2 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <CheckCircle2 className="w-20 h-20 text-green-500" />
            <h2 className="text-2xl font-bold text-slate-900">Результаты сохранены!</h2>
            <p className="text-slate-500">Проба <span className="font-mono font-bold text-slate-800">{sample?.sample_number}</span> завершена</p>
            <Button className="w-full h-14 text-base mt-4" onClick={() => { setSample(null); setResults({}); setRecommendation(''); setStep(0); }}>
              Следующая проба
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
