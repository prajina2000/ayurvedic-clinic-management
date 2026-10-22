import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { get } from '../api/client.js';
import { Badge, Button, ErrorNotice, PageHeader, Panel, Spinner } from '../components/UI.jsx';
import ClinicLetterhead from '../components/ClinicLetterhead.jsx';

export default function PrescriptionView() {
  const { prescriptionId } = useParams();
  const [searchParams] = useSearchParams();
  const [prescription, setPrescription] = useState(null);
  const [clinic, setClinic] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const patientId = searchParams.get('patientId');
  const historyPath = patientId ? `/doctor?view=history&patientId=${encodeURIComponent(patientId)}` : '/doctor?view=history';

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    Promise.all([get(`/doctor/prescriptions/${prescriptionId}`), get('/clinic').catch(() => null)])
      .then(([result, clinicInfo]) => {
        if (!active) return;
        setPrescription(result.prescription); setClinic(clinicInfo);
      })
      .catch((e) => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [prescriptionId]);

  return <>
    <div className="no-print">
      <Link to={historyPath} className="mb-5 inline-flex text-sm font-semibold text-forest-700 hover:text-forest-900">← Back to patient history</Link>
      <PageHeader eyebrow="Consultation · Patient history" title="Saved prescription" description="Review the prescription and visit details saved for this patient." action={prescription && <Button type="button" variant="secondary" onClick={() => window.print()}>Print prescription</Button>} />
      <ErrorNotice error={error} />
    </div>
    {loading && <Spinner label="Loading saved prescription…" />}
    {!loading && prescription && <div className="no-print space-y-5">
      <Panel title={prescription.name} subtitle={`${prescription.uhid} · ${prescription.age} years · ${prescription.gender}`} action={<Badge tone="blue">{new Date(prescription.visit_date).toLocaleDateString('en-IN')}</Badge>}>
        <div className="grid gap-3 text-sm sm:grid-cols-2"><p><span className="font-semibold">Place:</span> {prescription.place || '—'}</p><p><span className="font-semibold">Doctor:</span> {prescription.doctor_name || '—'}</p></div>
      </Panel>
      <Panel title="Visit details" subtitle="Complaints, examination and diagnosis">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Complaints</p><p className="mt-1 whitespace-pre-wrap text-sm">{prescription.complaints || '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Investigation</p><p className="mt-1 whitespace-pre-wrap text-sm">{prescription.investigation || '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Vitals</p><p className="mt-1 text-sm">BP {prescription.examination?.bp || '—'} · Pulse {prescription.examination?.pulse || '—'} · Temp {prescription.examination?.temperature || '—'} · Weight {prescription.examination?.weight || '—'} · SpO₂ {prescription.examination?.spo2 || '—'}</p></div>
          <div><p className="text-[10px] font-bold uppercase tracking-wide text-muted">Diagnosis</p><p className="mt-1 text-sm">{prescription.diagnosis || '—'} {prescription.icd_code && <span className="ml-1 font-mono text-xs text-forest-700">({prescription.icd_code})</span>}</p></div>
        </div>
      </Panel>
      <Panel title="Prescribed medicines" subtitle={`${prescription.medicines?.length || 0} medicine${prescription.medicines?.length === 1 ? '' : 's'}`}>
        {prescription.medicines?.length ? <div className="space-y-3">{prescription.medicines.map((item, index) => <article key={index} className="rounded-xl border border-line bg-white p-4">
          <div className="flex items-start gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-forest-50 text-xs font-bold text-forest-700">{index + 1}</span><h2 className="font-display text-base font-bold text-ink">{item.medicineName || 'Medicine'}</h2></div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Dose', item.dose], ['Frequency', item.frequency], ['Duration', item.duration], ['Quantity', item.quantity]].map(([label, value]) => <div key={label} className="rounded-lg bg-canvas p-2.5"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value || '—'}</p></div>)}</div>
          {item.instructions && <p className="mt-3 border-t border-line pt-2 text-xs"><span className="font-semibold">Instructions:</span> {item.instructions}</p>}
        </article>)}</div> : <p className="text-sm text-muted">No medicines were added to this visit.</p>}
      </Panel>
    </div>}
    {!loading && prescription && <section className="print-only font-sans text-slate-900">
      <ClinicLetterhead clinic={clinic} title="Prescription" />
      <div className="mt-5 grid grid-cols-2 gap-3 border-b border-slate-300 pb-4 text-sm"><p><b>Patient:</b> {prescription.name}</p><p><b>Patient ID:</b> {prescription.uhid}</p><p><b>Age / Gender:</b> {prescription.age} / {prescription.gender}</p><p><b>Place:</b> {prescription.place}</p><p><b>Date:</b> {new Date(prescription.visit_date).toLocaleDateString('en-IN')}</p><p><b>Doctor:</b> {prescription.doctor_name}</p></div>
      {prescription.complaints && <p className="mt-4 text-sm"><b>Complaints:</b> {prescription.complaints}</p>}
      {prescription.investigation && <p className="mt-2 text-sm"><b>Investigation:</b> {prescription.investigation}</p>}
      <p className="mt-4 text-sm"><b>Vitals:</b> BP {prescription.examination?.bp || '—'} · Pulse {prescription.examination?.pulse || '—'} · Temp {prescription.examination?.temperature || '—'} · Weight {prescription.examination?.weight || '—'} · SpO₂ {prescription.examination?.spo2 || '—'}</p>
      <p className="mt-4 text-sm"><b>Diagnosis:</b> {prescription.diagnosis || '—'} {prescription.icd_code && `(${prescription.icd_code})`}</p>
      <h2 className="mt-7 border-b border-slate-300 pb-2 text-sm font-bold">Medicines</h2>
      <div className="mt-2 space-y-4">{prescription.medicines?.map((item, index) => <article key={index} className="break-inside-avoid border-b border-slate-300 pb-3 text-sm"><div className="flex gap-2"><span className="font-semibold">{index + 1}.</span><p className="text-base font-bold">{item.medicineName || 'Medicine'}</p></div><div className="ml-6 mt-2 grid grid-cols-2 gap-x-6 gap-y-1"><p><b>Dose:</b> {item.dose || '—'}</p><p><b>Frequency:</b> {item.frequency || '—'}</p><p><b>Duration:</b> {item.duration || '—'}</p><p><b>Quantity:</b> {item.quantity || '—'}</p></div>{item.instructions && <p className="ml-6 mt-2"><b>Instructions:</b> {item.instructions}</p>}</article>)}</div>
      <footer className="mt-20 flex justify-end"><div className="w-52 border-t border-slate-500 pt-2 text-center text-xs">Doctor’s signature</div></footer>
    </section>}
  </>;
}
