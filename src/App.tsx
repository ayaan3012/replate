import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ToastProvider } from "@/context/ToastContext";
import Layout from "@/components/Layout";
import RequireRole from "@/components/RequireRole";
import Home from "@/pages/Home";
import Donor from "@/pages/Donor";
import Order from "@/pages/Order";
import Volunteer from "@/pages/Volunteer";
import Hub from "@/pages/Hub";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Layout>
            <Routes>
              {/* Public */}
              <Route path="/"    element={<Home />} />
              <Route path="/hub" element={<Hub />} />

              {/* Role-guarded */}
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
          </Layout>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
