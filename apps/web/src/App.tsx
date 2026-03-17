import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import { AuthGuard } from './components/auth/AuthGuard';
import { DevPanel } from './components/dev/DevPanel';
import { flag } from './lib/flags';
import { ActivityPage } from './pages/ActivityPage';
import { Dashboard } from './pages/Dashboard';
import { DashboardSketch } from './pages/DashboardSketch';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { GroupsPage } from './pages/GroupsPage';
import { HiveSettingsPage } from './pages/HiveSettingsPage';
import { ListDetailPage } from './pages/ListDetailPage';
import { ListsPage } from './pages/ListsPage';
import { LoginPage } from './pages/LoginPage';
import { MembersPage } from './pages/MembersPage';
import { MessagingPage } from './pages/MessagingPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { ProfilePage } from './pages/ProfilePage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { VerifyEmailPage } from './pages/VerifyEmailPage';

// Debug: Unregister any existing service workers (dev only)
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  void (async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
  })();
}

function App() {
  return (
    <BrowserRouter>
      {/* Dev Panel - only visible in dev mode */}
      <DevPanel />

      <Routes>
        {/* Public auth routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        {/* Protected routes */}
        <Route element={<AuthGuard />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/lists" element={<ListsPage />} />
          <Route path="/lists/:id" element={<ListDetailPage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/groups" element={<GroupsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          {/* Phase 3 routes */}
          <Route path="/settings" element={<HiveSettingsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/messages" element={<MessagingPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>

        {/* Dev-only: Designskizzen (nicht in Production) */}
        {flag('devSketches') && (
          <Route element={<AuthGuard />}>
            <Route path="/dev/sketch/dashboard" element={<DashboardSketch />} />
          </Route>
        )}

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
