import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import Assets from './pages/Assets';
import EquipmentUnits from './pages/EquipmentUnits';
import OilSamples from './pages/OilSamples';
import CompareSamples from './pages/CompareSamples';
import AnalysisResults from './pages/AnalysisResults';
import OilReferenceDB from './pages/OilReferenceDB';
import ThresholdRules from './pages/ThresholdRules';
import MaintenanceEvents from './pages/MaintenanceEvents';
import MaintenanceSchedules from './pages/MaintenanceSchedules';
import SamplingSchedules from './pages/SamplingSchedules';
import OilForecast from './pages/OilForecast';
import Reports from './pages/Reports';
import OilLifecycles from './pages/OilLifecycles';
import FleetDashboard from './pages/FleetDashboard';
import VesselDashboard from './pages/VesselDashboard';
import CriticalVessels from './pages/CriticalVessels';
import UserManagement from './pages/UserManagement';
import EquipmentDetailPage from './pages/EquipmentDetailPage';
import AdminPanel from './pages/AdminPanel';
import MobileSampling from './pages/MobileSampling';
import MobileLab from './pages/MobileLab';
import QRManager from './pages/QRManager';
import AssetDetail from './pages/AssetDetail';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/assets" element={<Assets />} />
        <Route path="/equipment-units" element={<EquipmentUnits />} />
        <Route path="/oil-samples" element={<OilSamples />} />
        <Route path="/compare-samples" element={<CompareSamples />} />
        <Route path="/analysis-results" element={<AnalysisResults />} />
        <Route path="/oil-reference" element={<OilReferenceDB />} />
        <Route path="/threshold-rules" element={<ThresholdRules />} />
        <Route path="/maintenance-events" element={<MaintenanceEvents />} />
        <Route path="/maintenance-schedules" element={<MaintenanceSchedules />} />
        <Route path="/sampling-schedules" element={<SamplingSchedules />} />
        <Route path="/oil-forecast" element={<OilForecast />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/oil-lifecycles" element={<OilLifecycles />} />
        <Route path="/fleet" element={<FleetDashboard />} />
        <Route path="/vessel/:assetId" element={<VesselDashboard />} />
        <Route path="/critical" element={<CriticalVessels />} />
        <Route path="/users" element={<UserManagement />} />
        <Route path="/equipment/:equipmentId" element={<EquipmentDetailPage />} />
        <Route path="/admin-panel" element={<AdminPanel />} />
        <Route path="/mobile-sampling" element={<MobileSampling />} />
        <Route path="/mobile-lab" element={<MobileLab />} />
        <Route path="/qr-manager" element={<QRManager />} />
        <Route path="/asset/:assetId" element={<AssetDetail />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
