import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const DEF = {
  oil_name: '', manufacturer: '', oil_category: '', iso_vg_grade: '', sae_grade: '',
  passport_viscosity_40: '', passport_viscosity_100: '', passport_viscosity_index: '',
  passport_density_15: '', passport_flash_point: '', passport_pour_point: '',
  passport_dielectric: '', passport_tbn: '', passport_tan: '', passport_ash_content: '',
  lab_viscosity_40: '', lab_viscosity_100: '', lab_density: '', lab_dielectric: '',
  lab_water_activity: '', lab_water_ppm: '', lab_measured_date: '', lab_comments: '', comments: ''
};

function Req() { return <span className="text-red-500 ml-0.5">*</span>; }

function NInput({ label, value, onChange, unit, required }) {
  return (
    <div className="space-y-1">
      <Label>{label}{required && <Req />}{unit ? <span className="text-slate-400 text-xs ml-1">{unit}</span> : ''}</Label>
      <Input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} />
    </div>
  );
}

const clean = (d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v === '' ? undefined : v]));

export default function OilFormDialog({ open, onOpenChange, initialData = null, onCreated }) {
  const [form, setForm] = useState(initialData || DEF);
  const qc = useQueryClient();
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = useMutation({
    mutationFn: d => {
      const c = clean(d);
      return c.id ? base44.entities.OilReference.update(c.id, c) : base44.entities.OilReference.create(c);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['oil-references'] });
      onCreated?.(data);
      onOpenChange(false);
      setForm(DEF);
    }
  });

  const handleOpen = (v) => {
    if (!v) setForm(DEF);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Редактировать масло' : 'Добавить масло'}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="passport">
          <TabsList className="mb-3">
            <TabsTrigger value="passport">Паспортные данные</TabsTrigger>
            <TabsTrigger value="lab">Лабораторные данные</TabsTrigger>
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
                <Input value={form.iso_vg_grade} onChange={e => f('iso_vg_grade', e.target.value)} placeholder="ISO VG 46" />
              </div>
              <div className="space-y-1">
                <Label>SAE</Label>
                <Input value={form.sae_grade} onChange={e => f('sae_grade', e.target.value)} placeholder="SAE 15W-40" />
              </div>
              <NInput label="Вязкость при 40°C" unit="мм²/с" value={form.passport_viscosity_40} onChange={v => f('passport_viscosity_40', v)} />
              <NInput label="Вязкость при 100°C" unit="мм²/с" value={form.passport_viscosity_100} onChange={v => f('passport_viscosity_100', v)} />
              <NInput label="Индекс вязкости" value={form.passport_viscosity_index} onChange={v => f('passport_viscosity_index', v)} />
              <NInput label="Плотность при 15°C" unit="кг/м³" value={form.passport_density_15} onChange={v => f('passport_density_15', v)} />
              <NInput label="Диэлектр. постоянная" value={form.passport_dielectric} onChange={v => f('passport_dielectric', v)} />
              <NInput label="Т. вспышки" unit="°C" value={form.passport_flash_point} onChange={v => f('passport_flash_point', v)} />
              <NInput label="Т. застывания" unit="°C" value={form.passport_pour_point} onChange={v => f('passport_pour_point', v)} />
              <NInput label="TBN" unit="мг KOH/г" value={form.passport_tbn} onChange={v => f('passport_tbn', v)} />
              <NInput label="TAN" unit="мг KOH/г" value={form.passport_tan} onChange={v => f('passport_tan', v)} />
              <NInput label="Зольность" unit="%" value={form.passport_ash_content} onChange={v => f('passport_ash_content', v)} />
              <div className="col-span-3 space-y-1">
                <Label>Комментарии</Label>
                <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
              </div>
            </div>
          </TabsContent>
          <TabsContent value="lab">
            <div className="grid grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
              <p className="col-span-3 text-xs text-slate-500 bg-blue-50 rounded-md px-3 py-2">Значения, измеренные в нашей лаборатории для нового масла из паспортной партии</p>
              <NInput label="Вязкость при 40°C" unit="мм²/с" value={form.lab_viscosity_40} onChange={v => f('lab_viscosity_40', v)} />
              <NInput label="Вязкость при 100°C" unit="мм²/с" value={form.lab_viscosity_100} onChange={v => f('lab_viscosity_100', v)} />
              <NInput label="Плотность" unit="кг/м³" value={form.lab_density} onChange={v => f('lab_density', v)} />
              <NInput label="Диэлектр. постоянная" value={form.lab_dielectric} onChange={v => f('lab_dielectric', v)} />
              <NInput label="Активность воды (aw)" value={form.lab_water_activity} onChange={v => f('lab_water_activity', v)} />
              <NInput label="Вода растворённая" unit="ppm" value={form.lab_water_ppm} onChange={v => f('lab_water_ppm', v)} />
              <div className="space-y-1">
                <Label>Дата измерения</Label>
                <Input type="date" value={form.lab_measured_date} onChange={e => f('lab_measured_date', e.target.value)} />
              </div>
              <div className="col-span-3 space-y-1">
                <Label>Комментарии лаборатории</Label>
                <Textarea value={form.lab_comments} onChange={e => f('lab_comments', e.target.value)} rows={3} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
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