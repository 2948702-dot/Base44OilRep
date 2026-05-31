import { Outlet, Link } from 'react-router-dom';
import { BarChart3, Settings, Users, Package, Zap, TrendingUp, AlertCircle, ShoppingCart, Home, Wrench } from 'lucide-react';
import { useRoleAccess } from '@/hooks/useRoleAccess';

const NAV = {
  admin: [
    {
      title: 'Управление',
      items: [
        { label: 'Дашборд', href: '/', icon: Home },
        { label: 'Клиенты', href: '/clients', icon: Users },
        { label: 'Активы', href: '/assets', icon: Package },
        { label: 'Флот (все суда)', href: '/fleet', icon: ShoppingCart },
        { label: 'Критические', href: '/critical', icon: AlertCircle },
        { label: 'Пользователи', href: '/users', icon: Users },
      ]
    },
    {
      title: 'Настройки',
      items: [
        { label: 'Справочник масел', href: '/oil-reference', icon: Settings },
        { label: 'Пороги', href: '/threshold-rules', icon: TrendingUp },
        { label: 'Администрирование', href: '/admin-panel', icon: Wrench },
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
      ]
    }
  ],
  captain: [
    {
      title: 'Мое судно',
      items: [
        { label: 'Дашборд', href: '/', icon: Home },
        { label: 'Состояние', href: '/fleet', icon: ShoppingCart },
      ]
    }
  ]
};

export default function Layout() {
  const { user, isAdmin, isSuperintendent, isCaptain } = useRoleAccess();

  let roleNav = [];
  if (isAdmin) roleNav = NAV.admin;
  else if (isSuperintendent) roleNav = NAV.superintendent;
  else if (isCaptain) roleNav = NAV.captain;

  const roleLabel = isAdmin ? 'Администратор' : 
                     isSuperintendent ? 'Суперинтендант' : 
                     'Капитан';

  return (
    <div className="flex h-full">
      <aside className="w-64 bg-white border-r border-slate-200 overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <h1 className="text-lg font-bold text-slate-900">ДонРечФлот</h1>
          <p className="text-xs text-slate-500 mt-1">{user?.full_name || 'User'}</p>
          <p className="text-xs text-slate-400">{roleLabel}</p>
        </div>

        <nav className="mt-8">
          {roleNav.map(group => (
            <div key={group.title} className="mb-6">
              <p className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">{group.title}</p>
              <ul className="mt-2 space-y-1">
                {group.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        to={item.href}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-slate-600 rounded-lg hover:bg-slate-50"
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
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}