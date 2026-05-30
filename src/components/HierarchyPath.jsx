import { ChevronRight } from 'lucide-react';

/**
 * Shows a breadcrumb-style hierarchy path: Client > Asset > Unit > Point
 * Pass only the names you want to show (undefined/null = skip)
 */
export default function HierarchyPath({ client, asset, unit, point }) {
  const parts = [client, asset, unit, point].filter(Boolean);
  if (parts.length === 0) return null;

  return (
    <div className="flex items-center flex-wrap gap-0.5 text-xs text-slate-500 mt-1 px-1">
      {parts.map((p, i) => (
        <span key={i} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
          <span className={i === parts.length - 1 ? 'text-slate-700 font-medium' : ''}>{p}</span>
        </span>
      ))}
    </div>
  );
}