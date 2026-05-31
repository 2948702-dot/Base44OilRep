import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, QrCode, Droplets, ChevronRight, ChevronLeft, Search, Camera } from 'lucide-react';
import QRScanner from '@/components/mobile/QRScanner';
import { format } from 'date-fns';

const STEPS = ['Точка отбора', 'Банка', 'Данные пробы', 'Готово'];

function genSampleNumber() {
  return 'S-' + Date.now().toString(36).toUpperCase();
}

export default function MobileSampling() {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [scanner, setScanner] = useState(null); // 'point' | 'can' | null
  const [samplingPoint, setSamplingPoint] = useState(null);
  const [canQR, setCanQR] = useState('');
  const [searchPoint, setSearchPoint] = useState('');
  const [form, setForm] = useState({
    sample_number: genSampleNumber(),
    sampling_date: format(new Date(), 'yyyy-MM-dd'),
    sample_type: 'in_service',
    engine_state: 'warm',
    total_hours_at_sampling: '',
    oil_hours_at_sampling: '',
    comments: '',
  });

  const { data: samplingPoints = [] } = useQuery({
    queryKey: ['sampling-points'],
    queryFn: () => base44.entities.SamplingPoint.list()
  });
  const { data: equipmentUnits = [] } = useQuery({
    queryKey: ['equipment-units'],
    queryFn: () => base44.entities.EquipmentUnit.list()
  });

  const save = useMutation({
    mutationFn: async () => {
      const unit = equipmentUnits.find(u => u.id === samplingPoint.equipment_unit_id);
      return base44.entities.OilSample.create({
        ...form,
        can_qr_code: canQR,
        sampling_point_id: samplingPoint.id,
        equipment_unit_id: samplingPoint.equipment_unit_id,
        asset_id: samplingPoint.asset_id,
        client_id: samplingPoint.client_id,
        sample_status: 'pending',
        total_hours_at_sampling: form.total_hours_at_sampling ? Number(form.total_hours_at_sampling) : undefined,
        oil_hours_at_sampling: form.oil_hours_at_sampling ? Number(form.oil_hours_at_sampling) : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['oil-samples'] });
      setStep(3);
    }
  });

  const handlePointQR = (data) => {
    setScanner(null);
    const point = samplingPoints.find(p => p.id === data || p.qr_code === data);
    if (point) { setSamplingPoint(point); setStep(1); }
    else alert('Точка отбора не найдена. Попробуйте выбрать вручную.');
  };

  const handleCanQR = (data) => {
    setScanner(null);
    setCanQR(data);
    setStep(2);
  };

  const filteredPoints = samplingPoints.filter(p =>
    p.point_name?.toLowerCase().includes(searchPoint.toLowerCase())
  );

  const getUnitName = (id) => equipmentUnits.find(u => u.id === id)?.unit_name || '';

  const reset = () => {
    setStep(0); setSamplingPoint(null); setCanQR('');
    setForm({ sample_number: genSampleNumber(), sampling_date: format(new Date(), 'yyyy-MM-dd'), sample_type: 'in_service', engine_state: 'warm', total_hours_at_sampling: '', oil_hours_at_sampling: '', comments: '' });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col max-w-md mx-auto">
      {scanner && (
        <QRScanner
          label={scanner === 'point' ? 'Сканируйте QR точки отбора' : 'Сканируйте QR банки с пробой'}
          onScan={scanner === 'point' ? handlePointQR : handleCanQR}
          onClose={() => setScanner(null)}
        />
      )}

      {/* Header */}
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-3">
          <Droplets className="w-5 h-5 text-blue-400" />
          <h1 className="font-bold text-lg">Отбор пробы</h1>
        </div>
        {/* Stepper */}
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1 flex-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i <= step ? 'bg-blue-500' : 'bg-slate-700 text-slate-400'}`}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs truncate ${i === step ? 'text-white' : 'text-slate-500'}`}>{s}</span>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 ${i < step ? 'bg-blue-500' : 'bg-slate-700'}`} />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">

        {/* Step 0: Sampling Point */}
        {step === 0 && (
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
                  onClick={() => { setSamplingPoint(p); setStep(1); }}>
                  <p className="font-semibold text-slate-900">{p.point_name}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{getUnitName(p.equipment_unit_id)}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Can QR */}
        {step === 1 && (
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
            <Button variant="outline" className="w-full h-12" onClick={() => setStep(2)}>
              Продолжить без банки
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(0)}>
              <ChevronLeft className="w-4 h-4 mr-1" />Назад
            </Button>
          </div>
        )}

        {/* Step 2: Form */}
        {step === 2 && (
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
                <Input className="h-12 text-base" value={form.sample_number} onChange={e => setForm(p => ({ ...p, sample_number: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Тип пробы</Label>
                  <Select value={form.sample_type} onValueChange={v => setForm(p => ({ ...p, sample_type: v }))}>
                    <SelectTrigger className="h-12"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_service">Рабочее масло</SelectItem>
                      <SelectItem value="fresh_oil">Свежее масло</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">Двигатель</Label>
                  <Select value={form.engine_state} onValueChange={v => setForm(p => ({ ...p, engine_state: v }))}>
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
                  <Input className="h-12 text-base" inputMode="numeric" placeholder="0" value={form.total_hours_at_sampling} onChange={e => setForm(p => ({ ...p, total_hours_at_sampling: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-semibold">М/ч масла</Label>
                  <Input className="h-12 text-base" inputMode="numeric" placeholder="0" value={form.oil_hours_at_sampling} onChange={e => setForm(p => ({ ...p, oil_hours_at_sampling: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-semibold">Комментарий</Label>
                <Textarea rows={3} value={form.comments} onChange={e => setForm(p => ({ ...p, comments: e.target.value }))} />
              </div>
            </div>

            <Button className="w-full h-14 text-base" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Зафиксировать пробу'}
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => setStep(1)}>
              <ChevronLeft className="w-4 h-4 mr-1" />Назад
            </Button>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <CheckCircle2 className="w-20 h-20 text-green-500" />
            <h2 className="text-2xl font-bold text-slate-900">Проба записана!</h2>
            <p className="text-slate-500">Номер: <span className="font-mono font-bold text-slate-800">{form.sample_number}</span></p>
            <p className="text-slate-500">Точка: <span className="font-semibold">{samplingPoint?.point_name}</span></p>
            <Button className="w-full h-14 text-base mt-4" onClick={reset}>
              Записать ещё пробу
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}