import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LandingPage, Dashboard, AdminDashboard, AdminSystemInfo } from './pages';
import { useAuth, login } from './hooks';

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  const handleLogin = () => {
    login();
  };

  const handleSubscribe = () => {
    // For now, redirect to login which will then redirect to dashboard
    // Later, this will go to Stripe checkout
    login();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Public landing page */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LandingPage onLogin={handleLogin} onSubscribe={handleSubscribe} />
            )
          }
        />

        {/* Pricing page (public) */}
        <Route
          path="/pricing"
          element={
            <LandingPage onLogin={handleLogin} onSubscribe={handleSubscribe} />
          }
        />

        {/* Dashboard (protected - Azure handles auth redirect) */}
        <Route
          path="/dashboard"
          element={<Dashboard />}
        />
        <Route
          path="/dashboard/*"
          element={<Dashboard />}
        />

        {/* Admin Dashboard (protected - checks admin status internally) */}
        <Route
          path="/admin"
          element={<AdminDashboard />}
        />

        {/* Admin System Info (protected - checks admin status internally) */}
        <Route
          path="/admin/system"
          element={<AdminSystemInfo />}
        />

        {/* Catch-all redirect */}
        <Route
          path="*"
          element={<Navigate to="/" replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
