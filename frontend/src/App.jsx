import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/Layout";
import NavigationProgressBar from "./components/NavigationProgressBar";
import PageLoader from "./components/PageLoader";

// Code-split route components with lazy loading
const Login = lazy(() => import("./pages/Login"));
const AutoLogin = lazy(() => import("./pages/AutoLogin"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const Live = lazy(() => import("./pages/Live"));
const ZoneManager = lazy(() => import("./pages/ZoneManager"));
const Admin = lazy(() => import("./pages/Admin"));
const Analysis = lazy(() => import("./pages/Analysis"));
const CameraManager = lazy(() => import("./pages/CameraManager"));

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          {/* Top route transition progress bar */}
          <NavigationProgressBar />
          
          {/* Suspense fallback for page loading */}
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/autologin" element={<AutoLogin />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Dashboard />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/vehicles/:id"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <VehicleDetail />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/live"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Live />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/zones"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <ZoneManager />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/analysis"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <Analysis />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cameras"
                element={
                  <ProtectedRoute>
                    <Layout>
                      <CameraManager />
                    </Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute adminOnly>
                    <Layout>
                      <Admin />
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
