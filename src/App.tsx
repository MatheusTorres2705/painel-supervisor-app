// src/App.tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import EquipePage from "@/pages/EquipePage";
import PiramidePage from "@/pages/PiramidePage";

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
import FuncionarioDetalhePage from "@/pages/FuncionarioDetalhePage";
import HoraExtraPage from "./pages/HoraExtraPage";


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
          <Route path="/piramide" 
          element={
              <ProtectedRoute>
                <Layout>
                  <PiramidePage />
                  
                </Layout>
              </ProtectedRoute>
            }
          
          // element={<PiramidePage />} 
          />

           <Route
            path="/hora-extra"
            element={
              <ProtectedRoute>
                <Layout>
                  <HoraExtraPage />
                  
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* redirects */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          <Route
  path="/equipe/:codfunc"
  element={
    <ProtectedRoute>
      <Layout>
        <FuncionarioDetalhePage />
      </Layout>
    </ProtectedRoute>
  }
/>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}



/*  
filtrar o turnos na alocacao ( noturno / diurno )
filtrar o colaborador na alocacao ( fintrar por nome e setor )


*/