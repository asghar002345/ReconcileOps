import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AppShell } from './components/AppShell';
import { ImportPage } from './pages/ImportPage';
import { InvestigationDetailPage } from './pages/InvestigationDetailPage';
import { InvestigationsPage } from './pages/InvestigationsPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { ReconciliationPage } from './pages/ReconciliationPage';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <p className="boot" role="status" aria-live="polite">
        Checking session…
      </p>
    );
  }
  if (!user) {
    return (
      <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    );
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Protected>
            <AppShell />
          </Protected>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="reconciliation" element={<ReconciliationPage />} />
        <Route path="investigations" element={<InvestigationsPage />} />
        <Route
          path="investigations/:id"
          element={<InvestigationDetailPage />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
