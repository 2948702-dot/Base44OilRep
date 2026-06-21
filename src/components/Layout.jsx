import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { QrCode, Droplets, FlaskConical, Settings, Users, Package, TrendingUp, AlertCircle, ShoppingCart, Home, Wrench, Cog, Menu, Plus } from 'lucide-react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const NAV = {
  admin: [
    {
      title: 'Управление',
      items: [
        { label: 'Дашборд', href: '/', icon: Home },
        { label: 'Клиенты', href: '/clients', icon: Users },
        { label: 'Активы', href: '/assets', icon: Package },
        { label: 'Агрегаты', href: '/equipment-units', icon: Cog },
        { label: 'Флот (все суда)', href: '/fleet', icon: ShoppingCart },
        { label: 'Критические', href: '/critical', icon: AlertCircle },
        { label: 'Пользователи', href: '/users', icon: Users },
        { label: 'Пробы масла', href: '/oil-samples', icon: Droplets },
      ]
    },
    {
      title: 'Настройки',
      items: [
        { label: 'Справочник масел', href: '/oil-reference', icon: Settings },
        { label: 'Пороги', href: '/threshold-rules', icon: TrendingUp },
        { label: 'Администрирование', href: '/admin-panel', icon: Wrench },
        { label: 'QR-коды', href: '/qr-manager', icon: QrCode },
      ]
    },
    {
      title: 'Мобильное',
      items: [
        { label: 'Отбор пробы', href: '/mobile-sampling', icon: Droplets },
        { label: 'Долив масла', href: '/mobile-sampling?mode=topup', icon: Plus },
        { label: 'Замена масла', href: '/mobile-sampling?mode=change', icon: Wrench },
        { label: 'Ввод анализа', href: '/mobile-lab', icon: FlaskConical },
      ]
    }
  ],
  client_admin: [
    {
      title: 'Управление',
      items: [
        { label: 'Дашборд', href: '/', icon: Home },
        { label: 'Активы', href: '/assets', icon: Package },
        { label: 'Агрегаты', href: '/equipment-units', icon: Cog },
        { label: 'Флот', href: '/fleet', icon: ShoppingCart },
        { label: 'Критические', href: '/critical', icon: AlertCircle },
        { label: 'Пробы масла', href: '/oil-samples', icon: Droplets },
        { label: 'Результаты', href: '/analysis-results', icon: TrendingUp },
        { label: 'QR-коды', href: '/qr-manager', icon: QrCode },
      ]
    },
    {
      title: 'Мобильное',
      items: [
        { label: 'Отбор пробы', href: '/mobile-sampling', icon: Droplets },
        { label: 'Долив масла', href: '/mobile-sampling?mode=topup', icon: Plus },
        { label: 'Замена масла', href: '/mobile-sampling?mode=change', icon: Wrench },
        { label: 'Ввод анализа', href: '/mobile-lab', icon: FlaskConical },
      ]
    }
  ],
  superintendent: [
    {
      title: 'Флот',
      items: [
        { label: 'Дашборд', href: '/', icon: Home },
        { label: 'Мои суда', href: '/fleet', icon: ShoppingCart },
        { label: 'Критические', href: '/critical', icon: AlertCircle },
      ]
    },
    {
      title: 'Данные',
      items: [
        { label: 'Пробы масла', href: '/oil-samples', icon: Package },
        { label: 'Результаты', href: '/analysis-results', icon: TrendingUp },
        { label: 'QR-коды', href: '/qr-manager', icon: QrCode },
      ]
    },
    {
      title: 'Мобильное',
      items: [
        { label: 'Отбор пробы', href: '/mobile-sampling', icon: Droplets },
        { label: 'Долив масла', href: '/mobile-sampling?mode=topup', icon: Plus },
        { label: 'Замена масла', href: '/mobile-sampling?mode=change', icon: Wrench },
      ]
    }
  ],
  lab_technician: [
    {
      title: 'Лаборатория',
      items: [
        { label: 'Ввод анализа', href: '/mobile-lab', icon: FlaskConical },
      ]
    }
  ],
  captain: [
    {
      title: 'Мое судно',
      items: [
        { label: 'Дашборд', href: '/', icon: Home },
        { label: 'Состояние', href: '/fleet', icon: ShoppingCart },
        { label: 'Агрегаты', href: '/equipment-units', icon: Cog },
      ]
    },
    {
      title: 'Мобильное',
      items: [
        { label: 'Отбор пробы', href: '/mobile-sampling', icon: Droplets },
        { label: 'Долив масла', href: '/mobile-sampling?mode=topup', icon: Plus },
        { label: 'Замена масла', href: '/mobile-sampling?mode=change', icon: Wrench },
      ]
    }
  ]
};

function RolePreviewPanel() {
  const { realUser, rolePreview, setRolePreview, clearRolePreview, isRolePreviewActive } = useAuth();
  const isRealAdmin = realUser?.role === 'admin';

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: () => base44.entities.Client.list(),
    enabled: isRealAdmin,
  });
  const { data: assets = [] } = useQuery({
    queryKey: ['assets'],
    queryFn: () => base44.entities.Asset.list(),
    enabled: isRealAdmin,
  });

  if (!isRealAdmin) return null;

  const previewRole = rolePreview?.role || 'admin';
  const selectedClientId = rolePreview?.client_id || '';
  const selectedAssetId = rolePreview?.asset_id || '';

  const updatePreview = (next) => {
    if (!next.role || next.role === 'admin') {
      clearRolePreview();
      return;
    }
    setRolePreview({
      role: next.role,
      client_id: next.client_id || '',
      asset_id: next.asset_id || '',
      asset_ids: next.asset_ids || (next.asset_id ? [next.asset_id] : []),
    });
  };

  const handleRoleChange = (nextRole) => {
    if (nextRole === 'admin') {
      clearRolePreview();
      return;
    }

    if (nextRole === 'client_admin' || nextRole === 'lab_technician' || nextRole === 'superintendent') {
      updatePreview({ role: nextRole, client_id: clients[0]?.id || '' });
      return;
    }

    const firstAsset = assets[0];
    updatePreview({
      role: nextRole,
      asset_id: firstAsset?.id || '',
      asset_ids: firstAsset?.id ? [firstAsset.id] : [],
      client_id: firstAsset?.client_id || '',
    });
  };

  const handleClientChange = (client_id) => {
    updatePreview({ role: previewRole, client_id });
  };

  const handleAssetChange = (asset_id) => {
    const asset = assets.find(item => item.id === asset_id);
    updatePreview({ role: 'captain', asset_id, asset_ids: [asset_id], client_id: asset?.client_id || '' });
  };

  return (
    <div className="border-t border-slate-200 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Просмотр как</p>
        <p className="text-[11px] text-slate-400 mt-1">
          Для проверки интерфейса. RLS проверяй отдельным тестовым входом.
        </p>
      </div>

      <Select value={previewRole} onValueChange={handleRoleChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">Администратор</SelectItem>
          <SelectItem value="client_admin">Админ клиента</SelectItem>
          <SelectItem value="lab_technician">Лаборант</SelectItem>
          <SelectItem value="superintendent">Суперинтендант</SelectItem>
          <SelectItem value="captain">Ответственный</SelectItem>
        </SelectContent>
      </Select>

      {(previewRole === 'client_admin' || previewRole === 'lab_technician' || previewRole === 'superintendent') && (
        <Select value={selectedClientId} onValueChange={handleClientChange}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Клиент" />
          </SelectTrigger>
          <SelectContent>
            {clients.map(client => (
              <SelectItem key={client.id} value={client.id}>
                {client.company_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {previewRole === 'captain' && (
        <Select value={selectedAssetId} onValueChange={handleAssetChange}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Актив" />
          </SelectTrigger>
          <SelectContent>
            {assets.map(asset => (
              <SelectItem key={asset.id} value={asset.id}>
                {asset.asset_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {isRolePreviewActive && (
        <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={clearRolePreview}>
          Вернуться к админу
        </Button>
      )}
    </div>
  );
}

function NavContent({ roleNav, location, onClose, previewPanel }) {
  const roleLabel = roleNav._roleLabel;
  const userName = roleNav._userName;
  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-slate-200">
        <h1 className="text-lg font-bold text-slate-900">ДонРечФлот</h1>
        <p className="text-xs text-slate-500 mt-1">{userName}</p>
        <p className="text-xs text-slate-400">{roleLabel}</p>
      </div>
      <nav className="mt-6 flex-1 overflow-y-auto">
        {roleNav.groups.map(group => (
          <div key={group.title} className="mb-6">
            <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{group.title}</p>
            <ul className="mt-2 space-y-1">
              {group.items.map(item => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm rounded-lg ${
                        isActive ? 'bg-slate-100 text-slate-900 font-medium' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {previewPanel}
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAdmin, isClientAdmin, isSuperintendent, isCaptain, isLabTechnician } = useRoleAccess();
  const location = useLocation();

  let groups = [];
  if (isAdmin) groups = NAV.admin;
  else if (isClientAdmin) groups = NAV.client_admin;
  else if (isLabTechnician) groups = NAV.lab_technician;
  else if (isSuperintendent) groups = NAV.superintendent;
  else if (isCaptain) groups = NAV.captain;

  const roleLabel = isAdmin ? 'Администратор' : isClientAdmin ? 'Админ клиента' : isLabTechnician ? 'Лаборант' : isSuperintendent ? 'Суперинтендант' : 'Ответственный';
  const roleNav = { groups, _roleLabel: roleLabel, _userName: user?.full_name || 'User' };

  const isMobilePage = location.pathname === '/mobile-sampling' || location.pathname === '/mobile-lab';

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 overflow-y-auto flex-col">
        <NavContent roleNav={roleNav} location={location} onClose={() => {}} previewPanel={<RolePreviewPanel />} />
      </aside>

      {/* Mobile layout */}
      <div className="flex flex-col flex-1 min-w-0 md:hidden">
        {/* Mobile top header */}
        <header className="bg-slate-900 text-white px-4 h-14 flex items-center justify-between sticky top-0 z-20 flex-shrink-0">
          <span className="font-bold text-base">ДонРечФлот</span>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button aria-label="Открыть меню" className="p-1">
                <Menu className="w-6 h-6" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <NavContent roleNav={roleNav} location={location} onClose={() => setMobileOpen(false)} previewPanel={<RolePreviewPanel />} />
            </SheetContent>
          </Sheet>
        </header>
        <main className={`flex-1 overflow-y-auto ${isMobilePage ? 'bg-slate-50' : ''}`}>
          <Outlet />
        </main>
      </div>

      {/* Desktop main */}
      <main className="hidden md:block flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
