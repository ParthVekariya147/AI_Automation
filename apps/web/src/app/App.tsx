import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { AnalyticsPage } from "../pages/AnalyticsPage";
import { BusinessesPage } from "../pages/BusinessesPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DriveBrowserPage } from "../pages/DriveBrowserPage";
import { IntegrationsPage } from "../pages/IntegrationsPage";
import { LoginPage } from "../pages/LoginPage";
import { PostsPage } from "../pages/PostsPage";
import { QueueDetailPage } from "../pages/QueueDetailPage";
import { QueueGroupPage } from "../pages/QueueGroupPage";
import { QueuePage } from "../pages/QueuePage";
import { SetupPage } from "../pages/SetupPage";
import { useAuthStore } from "../store/auth-store";

export default function App() {
  const hydrateMe = useAuthStore((state) => state.hydrateMe);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    hydrateMe()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [hydrateMe]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-glow">
        <div className="rounded-full bg-slate-950 px-6 py-3 text-sm uppercase tracking-[0.3em] text-white">
          Loading platform
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/drive-browser" element={<DriveBrowserPage />} />
                <Route path="/queue" element={<QueuePage />} />
                <Route path="/posts" element={<PostsPage />} />
                <Route path="/queue/:id" element={<QueueDetailPage />} />
                <Route path="/queue/group/:groupId" element={<QueueGroupPage />} />
                <Route path="/businesses" element={<BusinessesPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/integrations" element={<IntegrationsPage />} />
              </Routes>
            </AppShell>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
