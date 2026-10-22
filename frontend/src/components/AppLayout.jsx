import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { get } from '../api/client.js';
import { CLINIC_MARK, getClinicName } from '../config/clinicBrand.js';

const receptionSections = [
  { id: 'dashboard', label: 'Dashboard', roles: ['Admin', 'Receptionist', 'Doctor'] },
  { id: 'register', label: 'New patient registration', roles: ['Admin', 'Receptionist'] },
  { id: 'book', label: 'Token booking', roles: ['Admin', 'Receptionist'] },
  { id: 'patients', label: 'Patient details', roles: ['Admin', 'Receptionist', 'Doctor'] },
];
const consultationSections = [
  { id: 'consultation', label: 'Visit notes & vitals', roles: ['Admin', 'Doctor'] },
  { id: 'prescription', label: 'Prescription', roles: ['Admin', 'Doctor'] },
  { id: 'history', label: 'Patient history', roles: ['Admin', 'Doctor'] },
];
const pharmacySections = [
  { id: 'dashboard', label: 'Medicine Dashboard', roles: ['Admin', 'Pharmacist'] },
  { id: 'list', label: 'Medicine List', roles: ['Admin', 'Pharmacist'] },
  { id: 'add', label: 'Add Medicine', roles: ['Admin', 'Pharmacist'] },
  { id: 'inventory', label: 'Medicine Inventory', roles: ['Admin', 'Pharmacist'] },
  { id: 'expiry', label: 'Stock & Expiry', roles: ['Admin', 'Pharmacist'] },
  { id: 'billing', label: 'Medicine Sales', roles: ['Admin', 'Pharmacist'] },
  { id: 'reports', label: 'Medicine Reports', roles: ['Admin', 'Pharmacist'] },
];
const supplierSections = [
  { id: 'details', label: 'Supplier details', roles: ['Admin', 'Pharmacist'] },
  { id: 'bill', label: 'Bills', roles: ['Admin', 'Pharmacist'] },
];
const therapySections = [
  { id: 'today', label: "Today's procedures", roles: ['Admin', 'Therapist', 'Accountant', 'Doctor'] },
  { id: 'schedule', label: 'Schedule a plan', roles: ['Admin', 'Therapist', 'Doctor'] },
  { id: 'billing', label: 'Procedure billing', roles: ['Admin', 'Therapist', 'Accountant'] },
  { id: 'catalog', label: 'Procedure catalog', roles: ['Admin'] },
];
const accountSections = [
  { id: 'daybook', label: 'Day book', roles: ['Admin', 'Accountant'] },
  { id: 'expenses', label: 'Expenses', roles: ['Admin', 'Accountant'] },
  { id: 'reports', label: 'Reports', roles: ['Admin', 'Accountant'] },
  { id: 'dues', label: 'Outstanding dues', roles: ['Admin', 'Accountant'] },
];
const teamSections = [
  { id: 'team', label: 'Team members', roles: ['Admin'] },
  { id: 'invite', label: 'Invite staff', roles: ['Admin'] },
  { id: 'departments', label: 'Departments', roles: ['Admin'] },
];

const nav = [
  { label: 'Overview', href: '/dashboard', icon: '◫', roles: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist', 'Therapist', 'Accountant'] },
  { label: 'Reception', href: '/reception?view=dashboard', icon: '⌂', roles: ['Admin', 'Receptionist', 'Doctor'], children: receptionSections },
  { label: 'Consultations', href: '/doctor?view=consultation', icon: '✳', roles: ['Admin', 'Doctor'], children: consultationSections },
  { label: 'Pharmacy', href: '/pharmacy?view=dashboard', icon: '◈', roles: ['Admin', 'Pharmacist'], childrenHeading: 'Medicine Management', children: pharmacySections },
  { label: 'Suppliers', href: '/suppliers?view=details', icon: '▣', roles: ['Admin', 'Pharmacist'], children: supplierSections },
  { label: 'Therapies', href: '/procedures?view=today', icon: '❋', roles: ['Admin', 'Therapist', 'Accountant', 'Doctor'], children: therapySections },
  { label: 'Accounts', href: '/accounts?view=daybook', icon: '▤', roles: ['Admin', 'Accountant'], children: accountSections },
  { label: 'Team access', href: '/users?view=team', icon: '♙', roles: ['Admin'], children: teamSections },
];

export function AppLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedSection, setExpandedSection] = useState(null);
  const [clinic, setClinic] = useState(null);
  useEffect(() => { get('/clinic').then(setClinic).catch(() => {}); }, []);
  const clinicName = getClinicName(clinic);
  const links = nav.filter((item) => item.roles.includes(user?.role));
  const isSavedPrescription = location.pathname.startsWith('/doctor/prescriptions/');
  const activeNav = nav.find((item) => item.href.split('?')[0] === location.pathname) || (isSavedPrescription ? nav.find((item) => item.label === 'Consultations') : null);
  const currentView = new URLSearchParams(location.search).get('view');
  const pharmacyLegacyViews = { stock: 'expiry', medicines: 'list', invoices: 'billing' };
  const activeView = pharmacyLegacyViews[currentView] || currentView || (activeNav?.label === 'Pharmacy' ? 'dashboard' : isSavedPrescription ? 'history' : null);
  const activeChild = activeNav?.children?.find((child) => child.id === activeView);
  const heading = isSavedPrescription
    ? 'Consultations · Saved prescription'
    : activeNav?.children
    ? `${activeNav.label} · ${activeChild?.label || activeNav.children[0].label}`
    : (activeNav?.label || 'Clinic workspace');
  const initials = user?.name?.split(' ').map((part) => part[0]).join('').slice(0, 2);

  return <div className="min-h-screen bg-canvas lg:flex">
    <aside className="no-print hidden w-[250px] shrink-0 flex-col border-r border-line bg-white px-5 py-6 lg:flex">
      <div className="mb-6 flex items-center gap-3 px-1"><img src={CLINIC_MARK} alt={clinicName} className="h-16 w-16 shrink-0 rounded-xl bg-white object-contain" /><p className="font-display text-sm font-extrabold leading-5 text-forest-800">{clinicName}</p></div>
      <p className="mb-3 px-2 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
      <nav className="space-y-1" aria-label="Main menu">
        {links.map((item) => <div key={item.href}>
          {item.children ? <button
            type="button"
            aria-expanded={expandedSection === item.label}
            aria-controls={`submenu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={() => {
              if (expandedSection === item.label) {
                setExpandedSection(null);
                return;
              }
              setExpandedSection(item.label);
              navigate(item.href);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${activeNav?.label === item.label ? 'bg-forest-50 text-forest-700' : 'text-slate-500 hover:bg-canvas hover:text-ink'}`}
          >
            <span className="w-5 text-center text-base">{item.icon}</span><span className="flex-1">{item.label}</span>
            <span aria-hidden="true" className={`text-[10px] transition-transform ${expandedSection === item.label ? 'rotate-180' : ''}`}>⌄</span>
          </button> : <NavLink to={item.href} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? 'bg-forest-50 text-forest-700' : 'text-slate-500 hover:bg-canvas hover:text-ink'}`}>
            <span className="w-5 text-center text-base">{item.icon}</span>{item.label}
          </NavLink>}
          {item.children && expandedSection === item.label && <div id={`submenu-${item.label.toLowerCase().replace(/\s+/g, '-')}`} className="mb-2 ml-5 mt-1 space-y-1 border-l border-line pl-3">
            {item.childrenHeading && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[.12em] text-slate-400">{item.childrenHeading}</p>}
            {item.children.filter((child) => child.roles.includes(user?.role)).map((child) => {
              const href = `${item.href.split('?')[0]}?view=${child.id}`;
              const isActive = activeNav?.label === item.label && activeView === child.id;
              return <Link key={child.id} to={href} aria-current={isActive ? 'page' : undefined} className={`block rounded-lg px-3 py-2 text-xs font-medium transition ${isActive ? 'bg-forest-50 font-semibold text-forest-700' : 'text-slate-500 hover:bg-canvas hover:text-ink'}`}>
                {child.label}
              </Link>;
            })}
          </div>}
        </div>)}
      </nav>
      <div className="mt-auto rounded-2xl bg-forest-50 p-4"><div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm">☼</div><p className="text-xs font-bold text-forest-800">A calmer clinic day</p><p className="mt-1 text-[11px] leading-5 text-forest-700/80">Your visits, people and practice in one place.</p></div>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-line p-3"><div className="flex h-9 w-9 items-center justify-center rounded-full bg-sand text-xs font-bold text-amber-900">{initials}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{user?.name}</p><p className="text-[10px] text-muted">{user?.role}</p></div><button className="text-xs text-muted hover:text-ink" title="Sign out" onClick={logout}>↗</button></div>
    </aside>

    <div className="min-w-0 flex-1">
      <header className="no-print sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur sm:px-7 lg:px-9">
        <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white lg:hidden"><img src={CLINIC_MARK} alt="" className="h-full w-full object-contain" /></div><div className="min-w-0"><p className="font-display text-sm font-bold">{heading}</p><p className="max-w-64 truncate text-[11px] text-muted">{clinicName}</p></div></div>
        <div className="flex items-center gap-3"><span className="hidden rounded-full bg-forest-50 px-3 py-1.5 text-[11px] font-semibold text-forest-700 sm:inline-flex">● Clinic open</span><button onClick={logout} title={`Sign out ${user?.name || ''}`} className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-white text-xs font-bold text-forest-700 lg:hidden">{initials}</button></div>
      </header>
      <main className="mx-auto max-w-[1500px] px-4 py-6 pb-24 sm:px-7 sm:py-8 lg:px-9 lg:pb-10"><Outlet /></main>
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex justify-start gap-3 overflow-x-auto border-t border-line bg-white/95 px-3 py-2 backdrop-blur lg:hidden" aria-label="Mobile main menu">
        {links.map((item) => <NavLink key={item.href} to={item.href} className={({ isActive }) => `flex min-w-14 shrink-0 flex-col items-center gap-1 px-2 py-1 text-[9px] font-semibold ${isActive ? 'text-forest-700' : 'text-muted'}`}>
          <span className="text-lg">{item.icon}</span>{item.label}
        </NavLink>)}
      </nav>
    </div>
  </div>;
}
