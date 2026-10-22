import { CLINIC_MARK, getClinicName } from '../config/clinicBrand.js';

export default function ClinicLetterhead({ clinic, title, className = '' }) {
  return <header className={`clinic-letterhead flex items-center gap-4 border-b-2 border-forest-700 pb-4 ${className}`}>
    <img src={CLINIC_MARK} alt={`${getClinicName(clinic)} logo`} className="h-20 w-20 shrink-0 rounded-xl bg-white object-contain print:rounded-none" />
    <div className="min-w-0 flex-1">
      <h1 className="font-display text-2xl font-bold leading-tight">{getClinicName(clinic)}</h1>
      {clinic?.address && <p className="mt-1 text-sm">{clinic.address}</p>}
      {clinic?.phone && <p className="text-sm">Phone: {clinic.phone}</p>}
      {title && <p className="mt-2 text-xs font-bold uppercase tracking-widest">{title}</p>}
    </div>
  </header>;
}
