import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Pencil, Trash2, GitCompare, FlaskConical } from 'lucide-react';

const DEF = {
  oil_name: '', manufacturer: '', oil_category: '', iso_vg_grade: '', sae_grade: '',
  passport_viscosity_40: '', passport_viscosity_100: '', passport_viscosity_index: '',
  passport_density_15: '', passport_flash_point: '', passport_pour_point: '',
  passport_dielectric: '', passport_tbn: '', passport_tan: '', passport_ash_content: '',
  lab_viscosity_40: '', lab_viscosity_100: '', lab_density: '', lab_dielectric: '',
  lab_water_activity: '', lab_water_ppm: '', lab_measured_date: '', lab_comments: '', comments: ''
};

function deviation(passport, lab) {
  if (passport == null || lab == null || passport === '' || lab === '') return null;
  const pct = ((lab - passport) / passport * 100).toFixed(1);
  return { pct: +pct, abs: (lab - passport).toFixed(3) };
}

function DevRow({ label, passport, lab, unit = '' }) {
  const dev = deviation(passport, lab);
  const cls = dev == null ? 'text-slate-400' : Math.abs(dev.pct) < 5 ? 'text-green-600' : Math.abs(dev.pct) < 15 ? 'text-yellow-600' : 'text-red-600';
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50">
      <td className="px-4 py-2 text-slate-700 text-sm">{label}</td>
      <td className="px-4 py-2 text-slate-600 text-sm">{passport ?? '—'} {unit}</td>
      <td className="px-4 py-2 text-slate-600 text-sm">{lab ?? '—'} {unit}</td>
      <td className={`px-4 py-2 text-sm font-medium ${cls}`}>{dev ? `${dev.pct > 0 ? '+' : ''}${dev.pct}%` : '—'}</td>
    </tr>
  );
}

function NInput({ label, value, onChange, unit }) {
  return (
    <div className="space-y-1">
      <Label>{label}{unit ? <span className="text-slate-400 text-xs ml-1">{unit}</span> : ''}</Label>
      <Input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? '' : +e.target.value)} />
    </div>
  );
}

export default function OilReferenceDB() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [compareOil, setCompareOil] = useState(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const { data: oils = [], isLoading } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.OilReference.update(d.id, d) : base44.entities.OilReference.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['oil-references'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.OilReference.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oil-references'] })
  });

  const filtered = oils.filter(o =>
    o.oil_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.manufacturer?.toLowerCase().includes(search.toLowerCase())
  );
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">База масел</h1>
          <p className="text-slate-500 text-sm mt-0.5">{oils.length} марок масел</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить масло
        </Button>
      </div>

      <div className="mb-3">
        <Input placeholder="Поиск по названию или производителю..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Производитель</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Категория</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">ISO VG</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Вязк. 40°C</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">TBN</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Лаб. данные</th>
              <th className="w-24 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">Масла не найдены</td></tr>
            ) : filtered.map(o => (
              <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{o.oil_name}</td>
                <td className="px-4 py-2.5 text-slate-600">{o.manufacturer}</td>
                <td className="px-4 py-2.5 text-slate-600">{o.oil_category || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{o.iso_vg_grade || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{o.passport_viscosity_40 ?? '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{o.passport_tbn ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {o.lab_viscosity_40 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                      <FlaskConical className="w-3 h-3" />Есть
                    </span>
                  ) : <span className="text-slate-300 text-xs">—</span>}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="Сравнить с паспортом" onClick={() => setCompareOil(o)}>
                      <GitCompare className="w-3.5 h-3.5 text-blue-500" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(o); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить масло?') && del.mutate(o.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Compare dialog */}
      <Dialog open={!!compareOil} onOpenChange={() => setCompareOil(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Сравнение с паспортом — {compareOil?.oil_name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-slate-600 text-xs">Параметр</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600 text-xs">Паспорт</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600 text-xs">Лаборатория</th>
                  <th className="text-left px-4 py-2 font-medium text-slate-600 text-xs">Отклонение</th>
                </tr>
              </thead>
              <tbody>
                <DevRow label="Вязкость при 40°C, мм²/с" passport={compareOil?.passport_viscosity_40} lab={compareOil?.lab_viscosity_40} />
                <DevRow label="Вязкость при 100°C, мм²/с" passport={compareOil?.passport_viscosity_100} lab={compareOil?.lab_viscosity_100} />
                <DevRow label="Плотность, кг/м³" passport={compareOil?.passport_density_15} lab={compareOil?.lab_density} />
                <DevRow label="Диэлектр. постоянная" passport={compareOil?.passport_dielectric} lab={compareOil?.lab_dielectric} />
                <DevRow label="Активность воды (aw)" passport={null} lab={compareOil?.lab_water_activity} />
                <DevRow label="Вода растворённая, ppm" passport={null} lab={compareOil?.lab_water_ppm} />
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3 px-4">Допустимое отклонение: <span className="text-green-600">&lt;5%</span> · Требует внимания: <span className="text-yellow-600">5–15%</span> · Критично: <span className="text-red-600">&gt;15%</span></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareOil(null)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать масло' : 'Добавить масло'}</DialogTitle></DialogHeader>
          <Tabs defaultValue="passport">
            <TabsList className="mb-3">
              <TabsTrigger value="passport">Паспортные данные</TabsTrigger>
              <TabsTrigger value="lab">Лабораторные данные</TabsTrigger>
            </TabsList>
            <TabsContent value="passport">
              <div className="grid grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                <div className="col-span-3 space-y-1">
                  <Label>Наименование масла *</Label>
                  <Input value={form.oil_name} onChange={e => f('oil_name', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Производитель *</Label>
                  <Input value={form.manufacturer} onChange={e => f('manufacturer', e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Категория</Label>
                  <Input value={form.oil_category} onChange={e => f('oil_category', e.target.value)} placeholder="Минеральное / Синтетическое" />
                </div>
                <div className="space-y-1">
                  <Label>ISO VG / SAE</Label>
                  <Input value={form.iso_vg_grade} onChange={e => f('iso_vg_grade', e.target.value)} placeholder="ISO VG 46" />
                </div>
                <NInput label="Вязкость при 40°C" unit="мм²/с" value={form.passport_viscosity_40} onChange={v => f('passport_viscosity_40', v)} />
                <NInput label="Вязкость при 100°C" unit="мм²/с" value={form.passport_viscosity_100} onChange={v => f('passport_viscosity_100', v)} />
                <NInput label="Индекс вязкости" value={form.passport_viscosity_index} onChange={v => f('passport_viscosity_index', v)} />
                <NInput label="Плотность при 15°C" unit="кг/м³" value={form.passport_density_15} onChange={v => f('passport_density_15', v)} />
                <NInput label="Диэлектр. постоянная" value={form.passport_dielectric} onChange={v => f('passport_dielectric', v)} />
                <NInput label="Температура вспышки" unit="°C" value={form.passport_flash_point} onChange={v => f('passport_flash_point', v)} />
                <NInput label="Температура застывания" unit="°C" value={form.passport_pour_point} onChange={v => f('passport_pour_point', v)} />
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
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.oil_name || !form.manufacturer || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}