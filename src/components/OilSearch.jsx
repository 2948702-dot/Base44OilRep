import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X, Search } from 'lucide-react';

export default function OilSearch({ oils = [], value, onChange, onCreateNew }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = oils.find(o => o.id === value);
  const filtered = oils.filter(o =>
    o.oil_name?.toLowerCase().includes(search.toLowerCase()) ||
    o.manufacturer?.toLowerCase().includes(search.toLowerCase())
  ).slice(0, 12);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-md bg-slate-50">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{selected.oil_name}</p>
          <p className="text-xs text-slate-500">{selected.manufacturer} {selected.iso_vg_grade ? `· ISO VG ${selected.iso_vg_grade}` : ''}</p>
        </div>
        <button onClick={() => onChange(null)} className="text-slate-400 hover:text-slate-600 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
        <Input
          className="pl-8"
          placeholder="Поиск масла по названию или производителю..."
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-56 overflow-auto">
          {filtered.length > 0 ? filtered.map(o => (
            <button
              key={o.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center justify-between gap-3"
              onClick={() => { onChange(o.id); setSearch(''); setOpen(false); }}
            >
              <span className="font-medium text-slate-900">{o.oil_name}</span>
              <span className="text-slate-400 text-xs shrink-0">{o.manufacturer}</span>
            </button>
          )) : (
            <div className="px-3 py-2 text-sm text-slate-500">Масло не найдено</div>
          )}
          <div className="border-t border-slate-100 p-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              onClick={() => { setOpen(false); onCreateNew?.(); }}
            >
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              Создать новое масло
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}