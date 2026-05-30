import { Link, useLocation, Outlet } from 'react-router-dom';
import { LayoutDashboard, Users, Ship, Settings2, Droplets, FlaskConical, BarChart3, Database, Scale, Wrench, CalendarClock, Timer, TrendingUp, FileText, Gauge } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV = [
  { group: 'Обзор', items: [
    { path: '/', label: 'Дашборд', icon: LayoutDashboard },
    { path: '/fleet', label: 'Флот — OHI', icon: Gauge },
  ] },
  {
    group: 'Мастер-данные', items: [
      { path: '/clients', label: 'Клиенты', icon: Users },
      { path: '/assets', label: 'Активы', icon: Ship },
      { path: '/equipment-units', label: 'Оборудование', icon: Settings2 },
      { path: '/sampling-points', label: 'Точки отбора', icon: Droplets },
    ]
  },
  {
    group: 'Лаборатория', items: [
      { path: '/oil-samples', label: 'Пробы масла', icon: FlaskConical },
      { path: '/analysis-results', label: 'Результаты', icon: BarChart3 },
      { path: '/oil-reference', label: 'База масел', icon: Database },
      { path: '/threshold-rules', label: 'Пороговые правила', icon: Scale },
    ]
  },
  {
    group: 'Обслуживание', items: [
      { path: '/maintenance-events', label: 'События ТО', icon: Wrench },
      { path: '/maintenance-schedules', label: 'Планы ТО', icon: CalendarClock },
      { path: '/sampling-schedules', label: 'Графики отбора', icon: Timer },
      { path: '/oil-lifecycles', label: 'Циклы масла', icon: Droplets },
    ]
  },
  {
    group: 'Аналитика', items: [
      { path: '/oil-forecast', label: 'Прогноз масла', icon: TrendingUp },
      { path: '/reports', label: 'Отчёты PDF', icon: FileText },
    ]
  },
];

export default function Layout() {
  const location = useLocation();
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="w-56 bg-slate-900 flex flex-col overflow-y-auto shrink-0">
        <div className="px-4 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center shrink-0">
              <Droplets className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-bold tracking-tight text-sm">SmartOil</span>
          </div>
          <p className="text-slate-500 text-[10px] mt-0.5 pl-9">Мониторинг масла</p>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
          {NAV.map(({ group, items }) => (
            <div key={group}>
              <p className="text-slate-600 text-[9px] font-bold uppercase tracking-widest px-2 mb-1">{group}</p>
              {items.map(({ path, label, icon: Icon }) => {
                const active = location.pathname === path;
                return (
                  <Link key={path} to={path} className={cn(
                    'flex items-center gap-2 px-2 py-1.5 rounded-md text-xs mb-0.5 transition-colors',
                    active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                  )}>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-slate-800">
          <p className="text-slate-600 text-[10px]">SmartOil v1.0</p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}