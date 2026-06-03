import { useEffect, useRef, useState } from 'react';
import { SAE_GRADES } from '@/utils/labels';
import { base44 } from '@/api/base44Client';
import { buildPayload } from '@/utils/payload';
import { useSaveMutation } from '@/hooks/useSaveMutation';
import { OIL_REFERENCE_FIELDS, OIL_REFERENCE_NUMBER_FIELDS } from '@/utils/entityFields';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import OilThresholdsEditor from '@/components/OilThresholdsEditor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ISO_VG_GRADES = [
  'ISO VG 15', 'ISO VG 22', 'ISO VG 32', 'ISO VG 46', 'ISO VG 68', 'ISO VG 100',
  'ISO VG 150', 'ISO VG 220', 'ISO VG 320', 'ISO VG 460', 'ISO VG 680', 'ISO VG 1000'
];

const DEF = {
  oil_name: '', manufacturer: '', oil_category: '', iso_vg_grade: '', sae_grade: '',
  passport_viscosity_40: '', passport_density_15: '', passport_dielectric: '',
  comments: ''
};

function Req() { return <span className="text-red-500 ml-0.5">*</span>; }

function NInput({ label, value, onChange, unit, required, allowNegative }) {
  return (
    <div className="space-y-1">
      <Label>
        {label}{required && <Req />}
        {unit && <span className="text-slate-400 text-xs ml-1">{unit}</span>}
      </Label>
      <Input type="number" step="any" min={allowNegative ? undefined : 0} value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} />
    </div>
  );
}

export default function OilFormDialog({ open, onOpenChange, initialData = null, onCreated }) {
  const [form, setForm] = useState(initialData || DEF);
  const thresholdsRef = useRef(null);
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (open) {
      setForm(initialData ? { ...DEF, ...initialData } : DEF);
    }
  }, [open, initialData]);

  const save = useSaveMutation({
    mutationFn: async (d) => {
      const payload = buildPayload(d, OIL_REFERENCE_FIELDS, OIL_REFERENCE_NUMBER_FIELDS);
      const oilResult = d.id
        ? await base44.entities.OilReference.update(d.id, payload)
        : await base44.entities.OilReference.create(payload);

      const finalOilId = oilResult?.id || d.id;
      if (thresholdsRef.current && finalOilId) {
        const errors = await thresholdsRef.current.saveAll();
        if (errors.length > 0) {
          const paramNames = errors.map(error => error.param).join(', ');
          throw new Error(`Масло сохранено, но не удалось сохранить пороги: ${paramNames}`);
        }
      }

      return oilResult;
    },
    invalidateKeys: [['oil-references'], ['threshold-rules']],
    onSuccess: async (data) => {
      onCreated?.(data);
      onOpenChange(false);
      setForm(DEF);
    },
  });

  const handleOpen = (v) => {
    if (!v) setForm(DEF);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-6xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Редактировать масло' : 'Добавить масло'}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="passport">
          <TabsList className="mb-3">
            <TabsTrigger value="passport">Паспортные данные</TabsTrigger>
            <TabsTrigger value="thresholds">Границы параметров</TabsTrigger>
          </TabsList>
          <TabsContent value="passport">
            <div className="grid grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
              <div className="col-span-2 space-y-1">
                <Label>Наименование масла <Req /></Label>
                <Input value={form.oil_name} onChange={e => f('oil_name', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Производитель <Req /></Label>
                <Input value={form.manufacturer} onChange={e => f('manufacturer', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Категория</Label>
                <Input value={form.oil_category} onChange={e => f('oil_category', e.target.value)} placeholder="Минеральное / Синтетическое" />
              </div>
              <div className="space-y-1">
                <Label>ISO VG</Label>
                <Select value={form.iso_vg_grade || ''} onValueChange={v => f('iso_vg_grade', v)}>
                  <SelectTrigger><SelectValue placeholder="Выберите ISO VG" /></SelectTrigger>
                  <SelectContent>
                    {ISO_VG_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>SAE</Label>
                <Select value={form.sae_grade || ''} onValueChange={v => f('sae_grade', v)}>
                  <SelectTrigger><SelectValue placeholder="Выберите SAE" /></SelectTrigger>
                  <SelectContent>
                    {SAE_GRADES.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <NInput label="Вязкость при 40°C" unit="мм²/с" value={form.passport_viscosity_40} onChange={v => f('passport_viscosity_40', v)} />
              <NInput label="Плотность при 15°C" unit="кг/м³" value={form.passport_density_15} onChange={v => f('passport_density_15', v)} />
              <NInput label="Диэлектр. постоянная" value={form.passport_dielectric} onChange={v => f('passport_dielectric', v)} />
              <div className="col-span-3 space-y-1">
                <Label>Комментарии</Label>
                <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="thresholds">
            <div className="py-1 max-h-[65vh] overflow-y-auto pr-1">
              <OilThresholdsEditor ref={thresholdsRef} oilId={form.id} />
            </div>
          </TabsContent>
        </Tabs>
        {save.errorBlock}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>Отмена</Button>
          <Button onClick={() => save.mutate(form)} disabled={!form.oil_name || !form.manufacturer || save.isPending}>
            {save.isPending ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
