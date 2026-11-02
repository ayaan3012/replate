import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider }  from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import Layout            from "@/components/Layout";
import RequireRole       from "@/components/RequireRole";
import Home      from "@/pages/Home";
import Donor     from "@/pages/Donor";
import Order     from "@/pages/Order";
import Volunteer from "@/pages/Volunteer";
import Hub       from "@/pages/Hub";

/**
 * Route structure:
 *
 *  /          — public, uses Layout (Nav + About button)
 *  /hub       — public, uses Layout
 *  /donor     — role-guarded, uses DashboardShell (its own shell, no global Nav)
 *  /order     — role-guarded, uses DashboardShell
 *  /volunteer — role-guarded, uses DashboardShell
 *
 * The About button lives inside Layout so it appears on / and /hub.
 * The dashboard pages have their own "Log out" in the sidebar.
 */
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public routes — wrapped in shared Layout (Nav + About) */}
            <Route
              path="/"
              element={
                <Layout>
                  <Home />
                </Layout>
              }
            />
            <Route
              path="/hub"
              element={
                <Layout>
                  <Hub />
                </Layout>
              }
            />

            {/* Role-guarded dashboards — DashboardShell provides its own chrome */}
            <Route
              path="/donor"
              element={
                <RequireRole role="DONOR">
                  <Donor />
                </RequireRole>
              }
            />
            <Route
              path="/order"
              element={
                <RequireRole role="RECIPIENT">
                  <Order />
                </RequireRole>
              }
            />
            <Route
              path="/volunteer"
              element={
                <RequireRole role="VOLUNTEER">
                  <Volunteer />
                </RequireRole>
              }
            />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
