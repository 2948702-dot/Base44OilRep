import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ASSET_TYPES } from '@/utils/labels';

const DEF = { client_id: '', asset_name: '', asset_type: '', registration_number: '', location: '', comments: '' };

export default function Assets() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [filterClient, setFilterClient] = useState('');
  const qc = useQueryClient();

  const { data: assets = [], isLoading } = useQuery({ queryKey: ['assets'], queryFn: () => base44.entities.Asset.list() });
  const { data: clients = [] } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.Asset.update(d.id, d) : base44.entities.Asset.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.Asset.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] })
  });

  const filtered = assets.filter(a => !filterClient || a.client_id === filterClient);
  const getClient = id => clients.find(c => c.id === id)?.company_name || '—';
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Активы</h1>
          <p className="text-slate-500 text-sm mt-0.5">{assets.length} объектов</p>
        </div>
        <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />Добавить актив
        </Button>
      </div>

      <div className="mb-3">
        <Select value={filterClient} onValueChange={setFilterClient}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Все клиенты" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={null}>Все клиенты</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
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
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(a); setOpen(true); }}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать актив' : 'Добавить актив'}</DialogTitle></DialogHeader>
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
              <Input value={form.asset_name} onChange={e => f('asset_name', e.target.value)} />
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.client_id || !form.asset_name || !form.asset_type || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}