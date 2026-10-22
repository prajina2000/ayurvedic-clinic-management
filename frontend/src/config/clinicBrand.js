import clinicMarkDataUrl from '../assets/clinic-mark.jpg?inline';

export const CLINIC_NAME = 'Kariyil Krishna Clinic of Ayurveda';
export const CLINIC_MARK = clinicMarkDataUrl;

const genericNames = new Set(['ayurvedic clinic', 'krishna clinic of ayurveda']);

export function getClinicName(clinic) {
  const configuredName = String(clinic?.name || '').trim();
  return !configuredName || genericNames.has(configuredName.toLocaleLowerCase())
    ? CLINIC_NAME
    : configuredName;
}
