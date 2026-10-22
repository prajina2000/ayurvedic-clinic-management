import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function ModuleSubnav({ basePath, sections, defaultView }) {
  const location = useLocation();
  const { user } = useAuth();
  const visibleSections = sections.filter((section) => !section.roles || section.roles.includes(user?.role));
  const requestedView = new URLSearchParams(location.search).get('view');
  const activeView = visibleSections.some((section) => section.id === requestedView) ? requestedView : defaultView;

  return <nav aria-label="Module sections" className="no-print mb-5 flex max-w-full gap-2 overflow-x-auto border-b border-line pb-2">
    {visibleSections.map((section) => {
      const active = activeView === section.id;
      return <Link
        key={section.id}
        to={`${basePath}?view=${section.id}`}
        aria-current={active ? 'page' : undefined}
        className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${active ? 'bg-forest-50 text-forest-700' : 'text-slate-500 hover:bg-canvas hover:text-ink'}`}
      >{section.label}</Link>;
    })}
  </nav>;
}
