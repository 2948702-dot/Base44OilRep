import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Settings2, X } from 'lucide-react';
import { ASSET_TYPES, EQ_TYPES } from '@/utils/labels';

const DEF_ASSET = { client_id: '', asset_name: '', asset_type: '', registration_number: '', location: '', comments: '' };
const DEF_UNIT = { unit_name: '', equipment_type: '', manufacturer: '', model: '' };

export default function Assets() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF_ASSET);
  const [units, setUnits] = useState([]); // draft equipment units for new asset
  const [filterClient, setFilterClient] = useState('none');
  const qc = useQueryClient();

  const { data: assets = [], isLoading } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });

  const save = useMutation({
    mutationFn: async (d) => {
      let asset;
      if (d.id) {
        asset = await base44.entities.Asset.update(d.id, d);
      } else {
        asset = await base44.entities.Asset.create(d);
        // Create all draft equipment units linked to the new asset
        for (const u of units) {
          if (u.unit_name && u.equipment_type) {
            await base44.entities.EquipmentUnit.create({
              ...u,
              client_id: d.client_id,
              asset_id: asset.id,
            });
          }
        }
      }
      return asset;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['equipment-units'] });
      setOpen(false);
      setForm(DEF_ASSET);
      setUnits([]);
    }
  });

  const del = useMutation({
    mutationFn: id => base44.entities.Asset.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] })
  });

  const filtered = assets.filter(a => filterClient === 'none' || a.client_id === filterClient);
  const getClient = id => clients.find(c => c.id === id)?.company_name || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const addUnit = () => setUnits(u => [...u, { ...DEF_UNIT }]);
  const removeUnit = i => setUnits(u => u.filter((_, idx) => idx !== i));
  const setUnit = (i, k, v) => setUnits(u => u.map((unit, idx) => idx === i ? { ...unit, [k]: v } : unit));

  const openCreate = () => { setForm(DEF_ASSET); setUnits([]); setOpen(true); };
  const openEdit = (a) => { setForm(a); setUnits([]); setOpen(true); };

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Активы</h1>
          <p className="text-slate-500 text-sm mt-0.5">{assets.length} объектов</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить актив
        </Button>
      </div>

      <div className="mb-3">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Все клиенты" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Наименование</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Тип</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Клиент</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Рег. номер</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Местоположение</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-slate-400">Активы не найдены</td></tr>
            ) : filtered.map(a => (
              <tr key={a.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium text-slate-900">{a.asset_name}</td>
                <td className="px-4 py-2.5 text-slate-600">{ASSET_TYPES[a.asset_type] || a.asset_type}</td>
                <td className="px-4 py-2.5 text-slate-600">{getClient(a.client_id)}</td>
                <td className="px-4 py-2.5 text-slate-600">{a.registration_number || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{a.location || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить актив?') && del.mutate(a.id)}>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Редактировать актив' : 'Паспортизация актива'}</DialogTitle>
          </DialogHeader>

          {/* ── Section 1: Asset fields ── */}
          <div className="space-y-1 mb-1">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Основные данные</p>
          </div>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Клиент *</Label>
              <Select value={form.client_id} onValueChange={v => f('client_id', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите клиента" /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Наименование актива *</Label>
              <Input value={form.asset_name} onChange={e => f('asset_name', e.target.value)} placeholder="Буксир «Волга»" />
            </div>
            <div className="space-y-1">
              <Label>Тип актива *</Label>
              <Select value={form.asset_type} onValueChange={v => f('asset_type', v)}>
                <SelectTrigger><SelectValue placeholder="Выберите тип" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ASSET_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Рег. / инв. номер</Label>
              <Input value={form.registration_number} onChange={e => f('registration_number', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Местоположение</Label>
              <Input value={form.location} onChange={e => f('location', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>

          {/* ── Section 2: Equipment units (only on create) ── */}
          {!form.id && (
            <div className="border-t border-slate-200 pt-4 mt-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-slate-500" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Оборудование актива</p>
                  {units.length > 0 && (
                    <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{units.length}</span>
                  )}
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addUnit}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Добавить агрегат
                </Button>
              </div>

              {units.length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-lg">
                  <Settings2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Нажмите «Добавить агрегат» для паспортизации двигателей, редукторов, генераторов и т.д.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {units.map((u, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-lg p-3 border border-slate-200">
                      <div className="col-span-4 space-y-1">
                        <Label className="text-xs">Наименование *</Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="ГД Caterpillar"
                          value={u.unit_name}
                          onChange={e => setUnit(i, 'unit_name', e.target.value)}
                        />
                      </div>
                      <div className="col-span-3 space-y-1">
                        <Label className="text-xs">Тип *</Label>
                        <Select value={u.equipment_type} onValueChange={v => setUnit(i, 'equipment_type', v)}>
                          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Тип" /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(EQ_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Производитель</Label>
                        <Input className="h-8 text-sm" placeholder="Caterpillar" value={u.manufacturer} onChange={e => setUnit(i, 'manufacturer', e.target.value)} />
                      </div>
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Модель</Label>
                        <Input className="h-8 text-sm" placeholder="C18" value={u.model} onChange={e => setUnit(i, 'model', e.target.value)} />
                      </div>
                      <div className="col-span-1 flex items-end pb-1">
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => removeUnit(i)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button
              onClick={() => save.mutate(form)}
              disabled={!form.client_id || !form.asset_name || !form.asset_type || save.isPending}
            >
              {save.isPending ? 'Сохранение...' : form.id ? 'Сохранить' : `Создать${units.filter(u => u.unit_name && u.equipment_type).length > 0 ? ` + ${units.filter(u => u.unit_name && u.equipment_type).length} агрег.` : ''}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}