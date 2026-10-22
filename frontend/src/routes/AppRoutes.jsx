import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { AppLayout } from '../components/AppLayout.jsx';
import { Spinner } from '../components/UI.jsx';
import Login from '../pages/Login.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Reception from '../pages/Reception.jsx';
import Doctor from '../pages/Doctor.jsx';
import PrescriptionView from '../pages/PrescriptionView.jsx';
import Pharmacy from '../pages/Pharmacy.jsx';
import Procedures from '../pages/Procedures.jsx';
import Accounts from '../pages/Accounts.jsx';
import Users from '../pages/Users.jsx';

function AuthGate(){const {user,ready}=useAuth();if(!ready)return <div className="grid min-h-screen place-items-center"><Spinner label="Opening your workspace…" /></div>;return user?<AppLayout />:<Navigate to="/login" replace />;}
function PageGate({roles,children}){const {user}=useAuth();return roles.includes(user?.role)?children:<Navigate to="/dashboard" replace />;}
export default function AppRoutes(){const {user}=useAuth();return <Routes><Route path="/login" element={user?<Navigate to="/dashboard" replace />:<Login />} /><Route element={<AuthGate />}><Route index element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<Dashboard />} /><Route path="/reception" element={<PageGate roles={['Admin','Receptionist','Doctor']}><Reception /></PageGate>} /><Route path="/doctor/prescriptions/:prescriptionId" element={<PageGate roles={['Admin','Doctor']}><PrescriptionView /></PageGate>} /><Route path="/doctor" element={<PageGate roles={['Admin','Doctor']}><Doctor /></PageGate>} /><Route path="/pharmacy" element={<PageGate roles={['Admin','Pharmacist']}><Pharmacy /></PageGate>} /><Route path="/suppliers" element={<PageGate roles={['Admin','Pharmacist']}><Pharmacy supplierWorkspace /></PageGate>} /><Route path="/procedures" element={<PageGate roles={['Admin','Therapist','Accountant','Doctor']}><Procedures /></PageGate>} /><Route path="/accounts" element={<PageGate roles={['Admin','Accountant']}><Accounts /></PageGate>} /><Route path="/users" element={<PageGate roles={['Admin']}><Users /></PageGate>} /><Route path="*" element={<Navigate to={user?'/dashboard':'/login'} replace />} /></Route></Routes>;}
