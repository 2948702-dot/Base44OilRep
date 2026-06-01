import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';

const DEF = { company_name: '', contact_person: '', phone: '', email: '', address: '', comments: '' };

export default function Clients() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(DEF);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({ queryKey: ['clients'], queryFn: () => base44.entities.Client.list() });

  const save = useMutation({
    mutationFn: d => d.id ? base44.entities.Client.update(d.id, d) : base44.entities.Client.create(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setOpen(false); setForm(DEF); }
  });
  const del = useMutation({
    mutationFn: id => base44.entities.Client.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] })
  });
  const bulkDel = useMutation({
    mutationFn: async (ids) => { for (const id of ids) await base44.entities.Client.delete(id); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['clients'] }); setSelected(new Set()); }
  });
  const toggle = (id) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(s => s.size === filtered.length ? new Set() : new Set(filtered.map(x => x.id)));

  const filtered = clients.filter(c => c.company_name?.toLowerCase().includes(search.toLowerCase()));
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-start mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Клиенты</h1>
          <p className="text-slate-500 text-sm mt-0.5">{clients.length} компаний</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button size="sm" variant="destructive" onClick={() => window.confirm(`Удалить ${selected.size} записей?`) && bulkDel.mutate([...selected])} disabled={bulkDel.isPending}>
              <Trash2 className="w-4 h-4 mr-1.5" />Удалить выбранные ({selected.size})
            </Button>
          )}
          <Button size="sm" onClick={() => { setForm(DEF); setOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />Добавить клиента
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <Input placeholder="Поиск по названию..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
      </div>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="w-8 px-3 py-2.5"><input type="checkbox" className="w-4 h-4 cursor-pointer" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleAll} /></th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Компания</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Контакт</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Телефон</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-600 text-xs">Email</th>
              <th className="w-20 px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400">Загрузка...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-slate-400">Клиенты не найдены</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className={`border-b border-slate-50 hover:bg-slate-50 ${selected.has(c.id) ? 'bg-blue-50' : ''}`}>
                <td className="px-3 py-2.5"><input type="checkbox" className="w-4 h-4 cursor-pointer" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td className="px-4 py-2.5 font-medium text-slate-900">{c.company_name}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.contact_person || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.phone || '—'}</td>
                <td className="px-4 py-2.5 text-slate-600">{c.email || '—'}</td>
                <td className="px-4 py-2.5">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(c); setOpen(true); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.confirm('Удалить клиента?') && del.mutate(c.id)}>
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
          <DialogHeader><DialogTitle>{form.id ? 'Редактировать клиента' : 'Добавить клиента'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Название компании *</Label>
              <Input value={form.company_name} onChange={e => f('company_name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Контактное лицо</Label>
              <Input value={form.contact_person} onChange={e => f('contact_person', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Телефон</Label>
              <Input value={form.phone} onChange={e => f('phone', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => f('email', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Адрес</Label>
              <Input value={form.address} onChange={e => f('address', e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Комментарии</Label>
              <Textarea value={form.comments} onChange={e => f('comments', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.company_name || save.isPending}>
              {save.isPending ? 'Сохранение...' : 'Сохранить'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}