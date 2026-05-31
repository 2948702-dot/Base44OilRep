import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, QrCode, Droplets, ChevronRight, ChevronLeft, Search, Camera, Wrench, Plus, FlaskConical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import QRScanner from '@/components/mobile/QRScanner';
import { format } from 'date-fns';

function genSampleNumber() {
  return 'S-' + Date.now().toString(36).toUpperCase();
}

const MODE_CONFIG = {
  sample: { label: 'Отбор пробы', steps: ['Точка', 'Банка', 'Данные', 'Готово'] },
  topup:  { label: 'Долив масла',  steps: ['Точка', 'Данные', 'Готово'] },
  change: { label: 'Замена масла', steps: ['Точка', 'Данные', 'Готово'] },
};

export default function MobileSampling() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null);
  const [step, setStep] = useState(0);
  const [scanner, setScanner] = useState(null);
  const [samplingPoint, setSamplingPoint] = useState(null);
  const [canQR, setCanQR] = useState('');
  const [searchPoint, setSearchPoint] = useState('');

  const [sampleForm, setSampleForm] = useState({
    sample_number: genSampleNumber(),
    sampling_date: format(new Date(), 'yyyy-MM-dd'),
    sample_type: 'in_service',
    engine_state: 'warm',
    total_hours_at_sampling: '',
    oil_hours_at_sampling: '',
    comments: '',
  });

  const [eventForm, setEventForm] = useState({
    oil_type_id: '',
    volume: '',
    filter_changed: false,
    total_operating_hours: '',
    comments: '',
  });

  const { data: samplingPoints = [] } = useQuery({ queryKey: ['sampling-points'], queryFn: () => base44.entities.SamplingPoint.list() });
  const { data: equipmentUnits = [] } = useQuery({ queryKey: ['equipment-units'], queryFn: () => base44.entities.EquipmentUnit.list() });
  const { data: oils = [] } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });
  // lifecycles query removed — handled server-side in saveMobileMaintenanceEvent function

  const saveSample = useMutation({
    mutationFn: () => {
      const unit = equipmentUnits.find(u => u.id === samplingPoint.equipment_unit_id);
      return base44.entities.OilSample.create({
        ...sampleForm,
        can_qr_code: canQR,
        sampling_point_id: samplingPoint.id,
        equipment_unit_id: samplingPoint.equipment_unit_id,
        asset_id: samplingPoint.asset_id,
        client_id: samplingPoint.client_id,
        sample_status: 'pending',
        oil_type_id: unit?.current_oil_type_id || unit?.oil_type_id || undefined,
        total_hours_at_sampling: sampleForm.total_hours_at_sampling ? Number(sampleForm.total_hours_at_sampling) : undefined,
        oil_hours_at_sampling: sampleForm.oil_hours_at_sampling ? Number(sampleForm.oil_hours_at_sampling) : undefined,
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oil-samples'] }); setStep(3); }
  });

  const saveEvent = useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke('saveMobileMaintenanceEvent', {
        mode,
        base: {
          event_date: format(new Date(), 'yyyy-MM-dd'),
          client_id: samplingPoint.client_id,
          asset_id: samplingPoint.asset_id,
          equipment_unit_id: samplingPoint.equipment_unit_id,
          total_operating_hours: eventForm.total_operating_hours ? Number(eventForm.total_operating_hours) : undefined,
          comment: eventForm.comments || undefined,
        },
        oil_type_id: eventForm.oil_type_id || null,
        volume: eventForm.volume || null,
        filter_changed: eventForm.filter_changed || false,
        sampling_point_id: samplingPoint.id,
      });
      if (!res.data?.success) throw new Error(res.data?.error || 'Server error');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-events'] });
      qc.invalidateQueries({ queryKey: ['oil-lifecycles'] });
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
      setStep(2);
    }
  });

  const selectPoint = (point) => {
    setSamplingPoint(point);
    // Pre-fill hours from current EquipmentUnit state
    const unit = equipmentUnits.find(u => u.id === point.equipment_unit_id);
    if (unit) {
      const currentTotal = unit.current_total_hours ?? unit.total_operating_hours ?? '';
      const currentOil = unit.current_oil_hours ?? '';
      setSampleForm(p => ({ ...p, total_hours_at_sampling: currentTotal, oil_hours_at_sampling: currentOil }));
      setEventForm(p => ({ ...p, total_operating_hours: currentTotal }));
    }
    setStep(1);
  };

  const handlePointQR = (data) => {
    setScanner(null);
    const point = samplingPoints.find(p => p.id === data || p.qr_code === data);
    if (point) selectPoint(point);
    else alert('Точка отбора не найдена. Попробуйте выбрать вручную.');
  };

  const handleCanQR = (data) => { setScanner(null); setCanQR(data); setStep(2); };

  const filteredPoints = samplingPoints.filter(p => p.point_name?.toLowerCase().includes(searchPoint.toLowerCase()));
  const getUnitName = (id) => equipmentUnits.find(u => u.id === id)?.unit_name || '';

  const reset = () => {
    setMode(null); setStep(0); setSamplingPoint(null); setCanQR(''); setSearchPoint('');
    setSampleForm({ sample_number: genSampleNumber(), sampling_date: format(new Date(), 'yyyy-MM-dd'), sample_type: 'in_service', engine_state: 'warm', total_hours_at_sampling: '', oil_hours_at_sampling: '', comments: '' });
    setEventForm({ oil_type_id: '', volume: '', filter_changed: false, total_operating_hours: '', comments: '' });
  };

  const currentSteps = mode ? MODE_CONFIG[mode].steps : [];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
      {scanner && (
        <QRScanner
          label={scanner === 'point' ? 'Сканируйте QR точки отбора' : 'Сканируйте QR банки'}
          onScan={scanner === 'point' ? handlePointQR : handleCanQR}
          onClose={() => setScanner(null)}
        />
      )}

      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-1">
          <Droplets className="w-5 h-5 text-blue-400" />
          <h1 className="font-bold text-lg">{mode ? MODE_CONFIG[mode].label : 'Мобильный учёт'}</h1>
        </div>
        {mode && (
          <div className="flex items-center gap-1 mt-2">
            {currentSteps.map((s, i) => (
              <div key={i} className="flex items-center gap-1 flex-1">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i <= step ? 'bg-blue-500' : 'bg-slate-700 text-slate-400'}`}>
                  {i < step ? '✓' : i + 1}
                </div>
                <span className={`text-xs truncate ${i === step ? 'text-white' : 'text-slate-500'}`}>{s}</span>
                {i < currentSteps.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? 'bg-blue-500' : 'bg-slate-700'}`} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 p-4 overflow-y-auto">

        {/* Mode selection */}
        {!mode && (
          <div className="space-y-3 pt-4">
            <p className="text-sm text-slate-500 text-center mb-4">Выберите действие</p>
            <button className="w-full bg-white rounded-2xl border-2 border-blue-200 p-5 text-left hover:border-blue-400 active:bg-blue-50"
              onClick={() => { setMode('sample'); setStep(0); }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Droplets className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">Отбор пробы</p>
                  <p className="text-sm text-slate-500">Зафиксировать отбор масла для анализа</p>
                </div>
              </div>
            </button>
            <button className="w-full bg-white rounded-2xl border-2 border-amber-200 p-5 text-left hover:border-amber-400 active:bg-amber-50"
              onClick={() => { setMode('topup'); setStep(0); }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Plus className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">Долив масла</p>
                  <p className="text-sm text-slate-500">Зафиксировать добавление масла в агрегат</p>
                </div>
              </div>
            </button>
            <button className="w-full bg-white rounded-2xl border-2 border-red-200 p-5 text-left hover:border-red-400 active:bg-red-50"
              onClick={() => { setMode('change'); setStep(0); }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <Wrench className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">Замена масла</p>
                  <p className="text-sm text-slate-500">Зафиксировать полную замену масла</p>
                </div>
              </div>
            </button>
            <button className="w-full bg-white rounded-2xl border-2 border-purple-200 p-5 text-left hover:border-purple-400 active:bg-purple-50"
              onClick={() => navigate('/mobile-lab')}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                  <FlaskConical className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-lg">Ввод анализа</p>
                  <p className="text-sm text-slate-500">Внести результаты лабораторного анализа</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step 0: Point selection (all modes) */}
        {mode && step === 0 && (
          <div className="space-y-4">
            <Button className="w-full h-16 text-base gap-3" onClick={() => setScanner('point')}>
              <Camera className="w-6 h-6" />
              Сканировать QR точки отбора
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300" /></div>
              <div className="relative flex justify-center text-sm"><span className="bg-slate-50 px-3 text-slate-500">или выбрать вручную</span></div>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input className="pl-9 h-12" placeholder="Поиск точки..." value={searchPoint} onChange={e => setSearchPoint(e.target.value)} />
            </div>
            <div className="space-y-2">
              {filteredPoints.map(p => (
                <button key={p.id} className="w-full text-left bg-white rounded-xl p-4 border border-slate-200 hover:border-blue-300 active:bg-blue-50"
                  onClick={() => selectPoint(p)}>
                  <p className="font-semibold text-slate-900">{p.point_name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{getUnitName(p.equipment_unit_id)}</p>
                </button>
              ))}
            </div>
            <Button variant="ghost" className="w-full" onClick={reset}>← Назад к выбору действия</Button>
          </div>
        )}

        {/* Sample: Step 1 - Can QR */}
        {mode === 'sample' && step === 1 && (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs text-green-600 font-medium uppercase tracking-wide mb-1">Точка отбора</p>
              <p className="font-bold text-green-900">{samplingPoint?.point_name}</p>
              <p className="text-sm text-green-700">{getUnitName(samplingPoint?.equipment_unit_id)}</p>
            </div>
            <Button className="w-full h-16 text-base gap-3" onClick={() => setScanner('can')}>
              <Camera className="w-6 h-6" />
              Сканировать QR банки
            </Button>
            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300" /></div>
              <div className="relative flex justify-center text-sm"><span className="bg-slate-50 px-3 text-slate-500">или без привязки банки</span></div>
            </div>
            <Button variant="outline" className="w-full h-12" onClick={() => setStep(2)}>Продолжить без банки</Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(0)}><ChevronLeft className="w-4 h-4 mr-1" />Назад</Button>
          </div>
        )}

        {/* Sample: Step 2 - Form */}
        {mode === 'sample' && step === 2 && (
          <div className="space-y-4">
            {canQR && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-2">
                <QrCode className="w-4 h-4 text-blue-600" />
                <p className="text-sm text-blue-800 font-medium">Банка: {canQR.slice(0, 16)}…</p>
              </div>
            )}
            <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Номер пробы</Label>
                <Input className="h-12 text-base" value={sampleForm.sample_number} onChange={e => setSampleForm(p => ({ ...p, sample_number: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Тип пробы</Label>
                  <Select value={sampleForm.sample_type} onValueChange={v => setSampleForm(p => ({ ...p, sample_type: v }))}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_service">Рабочее масло</SelectItem>
                      <SelectItem value="fresh_oil">Свежее масло</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Двигатель</Label>
                  <Select value={sampleForm.engine_state} onValueChange={v => setSampleForm(p => ({ ...p, engine_state: v }))}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="warm">Тёплый</SelectItem>
                      <SelectItem value="cold">Холодный</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Всего м/ч</Label>
                  <Input className="h-12 text-base" inputMode="numeric" placeholder="0" value={sampleForm.total_hours_at_sampling} onChange={e => setSampleForm(p => ({ ...p, total_hours_at_sampling: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">М/ч масла</Label>
                  <Input className="h-12 text-base" inputMode="numeric" placeholder="0" value={sampleForm.oil_hours_at_sampling} onChange={e => setSampleForm(p => ({ ...p, oil_hours_at_sampling: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Комментарий</Label>
                <Textarea rows={3} value={sampleForm.comments} onChange={e => setSampleForm(p => ({ ...p, comments: e.target.value }))} />
              </div>
            </div>
            <Button className="w-full h-14 text-base" onClick={() => saveSample.mutate()} disabled={saveSample.isPending}>
              {saveSample.isPending ? 'Сохранение...' : 'Зафиксировать пробу'}<ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(1)}><ChevronLeft className="w-4 h-4 mr-1" />Назад</Button>
          </div>
        )}

        {/* Topup / Change: Step 1 - Event form */}
        {(mode === 'topup' || mode === 'change') && step === 1 && (
          <div className="space-y-4">
            <div className={`border rounded-xl p-4 ${mode === 'topup' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-xs font-medium uppercase tracking-wide mb-1 ${mode === 'topup' ? 'text-amber-600' : 'text-red-600'}`}>Точка</p>
              <p className="font-bold text-slate-900">{samplingPoint?.point_name}</p>
              <p className="text-sm text-slate-600">{getUnitName(samplingPoint?.equipment_unit_id)}</p>
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Тип масла</Label>
                <Select value={eventForm.oil_type_id} onValueChange={v => setEventForm(p => ({ ...p, oil_type_id: v }))}>
                  <SelectTrigger className="h-12"><SelectValue placeholder="Выберите масло" /></SelectTrigger>
                  <SelectContent>
                    {oils.map(o => <SelectItem key={o.id} value={o.id}>{o.oil_name} ({o.manufacturer})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">{mode === 'topup' ? 'Объём долива (л)' : 'Объём замены (л)'}</Label>
                <Input className="h-12 text-base" inputMode="decimal" placeholder="0" value={eventForm.volume} onChange={e => setEventForm(p => ({ ...p, volume: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Моточасы всего</Label>
                <Input className="h-12 text-base" inputMode="numeric" placeholder="0" value={eventForm.total_operating_hours} onChange={e => setEventForm(p => ({ ...p, total_operating_hours: e.target.value }))} />
              </div>
              {mode === 'change' && (
                <label className="flex items-center gap-3 p-4 bg-orange-50 border border-orange-200 rounded-xl cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-orange-500"
                    checked={eventForm.filter_changed}
                    onChange={e => setEventForm(p => ({ ...p, filter_changed: e.target.checked }))}
                  />
                  <div>
                    <p className="font-semibold text-slate-800">Масляный фильтр заменён</p>
                    <p className="text-xs text-slate-500">Создаётся отдельная запись о замене фильтра</p>
                  </div>
                </label>
              )}
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Комментарий</Label>
                <Textarea rows={2} value={eventForm.comments} onChange={e => setEventForm(p => ({ ...p, comments: e.target.value }))} />
              </div>
            </div>
            <Button
              className={`w-full h-14 text-base ${mode === 'topup' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}`}
              onClick={() => saveEvent.mutate()}
              disabled={saveEvent.isPending}
            >
              {saveEvent.isPending ? 'Сохранение...' : (mode === 'topup' ? 'Зафиксировать долив' : 'Зафиксировать замену')}
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(0)}><ChevronLeft className="w-4 h-4 mr-1" />Назад</Button>
          </div>
        )}

        {/* Sample success */}
        {mode === 'sample' && step === 3 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <CheckCircle2 className="w-20 h-20 text-green-500" />
            <h2 className="text-2xl font-bold text-slate-900">Проба записана!</h2>
            <p className="text-slate-500">Номер: <span className="font-mono font-bold text-slate-800">{sampleForm.sample_number}</span></p>
            <p className="text-slate-500">Точка: <span className="font-semibold">{samplingPoint?.point_name}</span></p>
            <Button className="w-full h-14 text-base mt-4" onClick={reset}>Записать ещё</Button>
          </div>
        )}

        {/* Event success */}
        {(mode === 'topup' || mode === 'change') && step === 2 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <CheckCircle2 className="w-20 h-20 text-green-500" />
            <h2 className="text-2xl font-bold text-slate-900">{mode === 'topup' ? 'Долив зафиксирован!' : 'Замена зафиксирована!'}</h2>
            <p className="text-slate-500">Точка: <span className="font-semibold">{samplingPoint?.point_name}</span></p>
            <Button className="w-full h-14 text-base mt-4" onClick={reset}>Записать ещё</Button>
          </div>
        )}

      </div>
    </div>
  );
}