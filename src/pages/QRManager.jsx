import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, Download, Plus, QrCode, MapPin, Package } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function generateCanId() {
  return 'CAN-' + crypto.randomUUID().split('-')[0].toUpperCase() + '-' + crypto.randomUUID().split('-')[1].toUpperCase();
}

function QRCard({ value, label, sublabel, size = 128 }) {
  return (
    <div className="flex flex-col items-center bg-white border border-slate-200 rounded-xl p-4 gap-2 print-card">
      <QRCodeSVG value={value} size={size} level="M" includeMargin />
      <p className="text-sm font-bold text-slate-900 text-center leading-tight">{label}</p>
      {sublabel && <p className="text-xs text-slate-500 text-center">{sublabel}</p>}
      <p className="text-[10px] text-slate-400 font-mono break-all text-center">{value.slice(0, 32)}{value.length > 32 ? '…' : ''}</p>
    </div>
  );
}

export default function QRManager() {
  const [tab, setTab] = useState('points');
  const [selectedClient, setSelectedClient] = useState('all');
  const [canCount, setCanCount] = useState(10);
  const [generatedCans, setGeneratedCans] = useState([]);
  const printRef = useRef(null);

  const { data: samplingPoints = [] } = useQuery({
    queryKey: ['sampling-points'],
    queryFn: () => base44.entities.SamplingPoint.list()
  });
  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list()
  });
  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list()
  });
  const { data: equipmentUnits = [] } = useQuery({
    queryKey: ['equipment-units'],
    queryFn: () => base44.entities.EquipmentUnit.list()
  });

  const getAssetName = (assetId) => assets.find(a => a.id === assetId)?.asset_name || '';
  const getUnitName = (id) => equipmentUnits.find(u => u.id === id)?.unit_name || '';
  const getClientName = (id) => clients.find(c => c.id === id)?.company_name || '';

  const filteredPoints = selectedClient === 'all'
    ? samplingPoints
    : samplingPoints.filter(p => p.client_id === selectedClient);

  const generateCans = () => {
    const cans = Array.from({ length: canCount }, () => generateCanId());
    setGeneratedCans(cans);
  };

  const printPage = () => {
    window.print();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: fixed; inset: 0; padding: 20px; }
          .print-card { break-inside: avoid; }
          .no-print { display: none; }
        }
      `}</style>

      <div className="flex justify-between items-start mb-6 no-print">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <QrCode className="w-5 h-5" />Менеджер QR-кодов
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Генерация и печать QR-кодов для точек отбора и банок</p>
        </div>
        <Button onClick={printPage} className="gap-2">
          <Printer className="w-4 h-4" />Печать
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg mb-6 no-print w-fit">
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'points' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
          onClick={() => setTab('points')}
        >
          <MapPin className="w-4 h-4 inline mr-1.5 -mt-0.5" />Точки отбора
        </button>
        <button
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'cans' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
          onClick={() => setTab('cans')}
        >
          <Package className="w-4 h-4 inline mr-1.5 -mt-0.5" />Банки для проб
        </button>
      </div>

      {/* Tab: Sampling Points */}
      {tab === 'points' && (
        <div>
          <div className="mb-4 no-print">
            <Label className="text-sm mb-2 block">Фильтр по клиенту</Label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все клиенты</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div id="print-area">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredPoints.map(p => (
                <QRCard
                  key={p.id}
                  value={p.id}
                  label={p.point_name}
                  sublabel={`${getAssetName(p.asset_id)} · ${getUnitName(p.equipment_unit_id)}`}
                />
              ))}
              {filteredPoints.length === 0 && (
                <div className="col-span-4 text-center py-12 text-slate-400">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p>Точек отбора не найдено</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Cans */}
      {tab === 'cans' && (
        <div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 no-print">
            <p className="text-sm font-semibold text-blue-900 mb-2">Генерация QR-кодов для банок</p>
            <p className="text-sm text-blue-700 mb-4">
              Создайте уникальные QR-коды, распечатайте и наклейте на банки. 
              Клиент при отборе пробы сканирует код банки — он привяжется к пробе автоматически.
            </p>
            <div className="flex items-center gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Количество кодов</Label>
                <Input
                  type="number"
                  className="w-28 h-9"
                  min={1}
                  max={100}
                  value={canCount}
                  onChange={e => setCanCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                />
              </div>
              <Button className="mt-5 gap-2" onClick={generateCans}>
                <Plus className="w-4 h-4" />Сгенерировать
              </Button>
            </div>
          </div>

          {generatedCans.length > 0 && (
            <div id="print-area">
              <div className="flex justify-between items-center mb-3 no-print">
                <p className="text-sm text-slate-600 font-medium">Сгенерировано: {generatedCans.length} кодов</p>
                <Button variant="outline" size="sm" onClick={generateCans} className="gap-2">
                  <Plus className="w-3.5 h-3.5" />Перегенерировать
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {generatedCans.map((canId, i) => (
                  <QRCard
                    key={canId}
                    value={canId}
                    label={`Банка #${String(i + 1).padStart(3, '0')}`}
                    sublabel="Для отбора пробы масла"
                  />
                ))}
              </div>
            </div>
          )}

          {generatedCans.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Нажмите «Сгенерировать» для создания QR-кодов банок</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}