// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EquipePage from "@/pages/EquipePage";
// import AtividadesPage from "@/pages/AtividadesPage";
// import AlocacaoPage from "@/pages/AlocacaoPage";
// import MateriaisPage from "@/pages/MateriaisPage";
// import CalendarioPage from "@/pages/CalendarioPage";
// import PlanoAcaoPage from "@/pages/PlanoAcaoPage";
import { Layout } from "@/components/ui/Layout"; // ✅ caminho correto
import AtividadesPage from "./pages/AtividadesPage";
import AlocacaoPage from "./pages/AlocacaoPage";
import MateriaisPage from "./pages/MateriaisPage";
import CalendarioPage from "./pages/CalendarioPage";
import PlanoAcaoPage from "./pages/PlanoAcaoPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* pública */}
          <Route path="/login" element={<LoginPage />} />

          {/* protegidas */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <DashboardPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/equipe"
            element={
              <ProtectedRoute>
                <Layout>
                  <EquipePage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/atividades"
            element={
              <ProtectedRoute>
                <Layout>
                  <AtividadesPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/atividades/alocacao/:opId"
            element={
              <ProtectedRoute>
                <Layout>
                  <AlocacaoPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/materiais"
            element={
              <ProtectedRoute>
                <Layout>
                  <MateriaisPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendario"
            element={
              <ProtectedRoute>
                <Layout>
                  <CalendarioPage />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/plano-acao"
            element={
              <ProtectedRoute>
                <Layout>
                  <PlanoAcaoPage />
                  
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
