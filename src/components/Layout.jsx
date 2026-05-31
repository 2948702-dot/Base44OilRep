import { useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { QrCode, Droplets, FlaskConical, Settings, Users, Package, TrendingUp, AlertCircle, ShoppingCart, Home, Wrench, Cog, Menu } from 'lucide-react';
import { useRoleAccess } from '@/hooks/useRoleAccess';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';

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
      ]
    }
  ]
};

function NavContent({ roleNav, location, onClose }) {
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
    </div>
  );
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAdmin, isSuperintendent, isCaptain } = useRoleAccess();
  const location = useLocation();

  let groups = [];
  if (isAdmin) groups = NAV.admin;
  else if (isSuperintendent) groups = NAV.superintendent;
  else if (isCaptain) groups = NAV.captain;

  const roleLabel = isAdmin ? 'Администратор' : isSuperintendent ? 'Суперинтендант' : 'Капитан';
  const roleNav = { groups, _roleLabel: roleLabel, _userName: user?.full_name || 'User' };

  const isMobilePage = location.pathname === '/mobile-sampling' || location.pathname === '/mobile-lab';

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-64 bg-white border-r border-slate-200 overflow-y-auto flex-col">
        <NavContent roleNav={roleNav} location={location} onClose={() => {}} />
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
              <NavContent roleNav={roleNav} location={location} onClose={() => setMobileOpen(false)} />
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