import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Pencil, Trash2, GitCompare, FlaskConical } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import OilFormDialog from '@/components/OilFormDialog';

function deviation(passport, lab) {
  if (passport == null || lab == null || passport === '' || lab === '') return null;
  const pct = ((lab - passport) / passport * 100).toFixed(1);
  return { pct: +pct, abs: (lab - passport).toFixed(3) };
}

function DevRow({ label, passport, lab }) {
  const dev = deviation(passport, lab);
  const cls = dev == null ? 'text-slate-400' : Math.abs(dev.pct) < 5 ? 'text-green-600' : Math.abs(dev.pct) < 15 ? 'text-yellow-600' : 'text-red-600';
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50">
      <td className="px-4 py-2 text-slate-700 text-sm">{label}</td>
      <td className="px-4 py-2 text-slate-600 text-sm">{passport ?? '—'}</td>
      <td className="px-4 py-2 text-slate-600 text-sm">{lab ?? '—'}</td>
      <td className={`px-4 py-2 text-sm font-medium ${cls}`}>{dev ? `${dev.pct > 0 ? '+' : ''}${dev.pct}%` : '—'}</td>
    </tr>
  );
}

export default function OilReferenceDB() {
  const [formOpen, setFormOpen] = useState(false);
  const [editData, setEditData] = useState(null);
  const [compareOil, setCompareOil] = useState(null);
  const [search, setSearch] = useState('');
  const qc = useQueryClient();

  const { data: oils = [], isLoading } = useQuery({ queryKey: ['oil-references'], queryFn: () => base44.entities.OilReference.list() });

  const del = useMutation({
    mutationFn: id => base44.entities.OilReference.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oil-references'] })
  });

  const filtered = oils.filter(o =>
    o.oil_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.manufacturer?.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditData(null); setFormOpen(true); };
  const openEdit = (oil) => { setEditData(oil); setFormOpen(true); };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">База масел</h1>
          <p className="text-slate-500 text-sm mt-0.5">{oils.length} марок масел</p>
        </div>
        <Button size="sm" onClick={openCreate}>
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
              <tr>
                <td colSpan={8} className="text-center py-12">
                  <p className="text-slate-400 mb-3">Масла не найдены</p>
                  {oils.length === 0 && (
                    <Button size="sm" onClick={openCreate}>
                      <Plus className="w-4 h-4 mr-1.5" />Добавить первое масло
                    </Button>
                  )}
                </td>
              </tr>
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(o)}>
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
              </tbody>
            </table>
            <p className="text-xs text-slate-400 mt-3 px-4">Допустимое отклонение: <span className="text-green-600">&lt;5%</span> · Требует внимания: <span className="text-yellow-600">5–15%</span> · Критично: <span className="text-red-600">&gt;15%</span></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompareOil(null)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OilFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialData={editData}
        key={editData?.id || 'new'}
      />
    </div>
  );
}