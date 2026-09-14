// src/App.tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider } from "@/auth/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppShell } from "@/components/layout/AppShell";
import { ToastProvider } from "@/components/ui/toast";

import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import MnoPage from "@/pages/MnoPage";
import OpePage from "@/pages/OpePage";
import EquipePage from "@/pages/EquipePage";
import FuncionarioDetalhePage from "@/pages/FuncionarioDetalhePage";
import PiramidePage from "@/pages/PiramidePage";
import AtividadesPage from "@/pages/AtividadesPage";
import AlocacaoPage from "@/pages/AlocacaoPage";
import MateriaisPage from "@/pages/MateriaisPage";
import ListaFaltasPage from "@/pages/ListaFaltasPage";
import CalendarioPage from "@/pages/CalendarioPage";
import HoraExtraPage from "@/pages/HoraExtraPage";
import AbsenteismoPage from "@/pages/AbsenteismoPage";
import PlanoAcaoPage from "@/pages/PlanoAcaoPage";

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            {/* Pública */}
            <Route path="/login" element={<LoginPage />} />

            {/*
              Rota de layout: o par ProtectedRoute + shell era repetido
              9 vezes. Agora as filhas renderizam dentro do <Outlet/>.
            */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/meta-producao" element={<MnoPage />} />
              <Route path="/ope" element={<OpePage />} />
              <Route path="/equipe" element={<EquipePage />} />
              <Route path="/equipe/:codfunc" element={<FuncionarioDetalhePage />} />
              <Route path="/piramide" element={<PiramidePage />} />
              <Route path="/atividades" element={<AtividadesPage />} />
              <Route
                path="/atividades/alocacao/:opId"
                element={<AlocacaoPage />}
              />
              <Route path="/materiais" element={<MateriaisPage />} />
              <Route path="/lista-faltas" element={<ListaFaltasPage />} />
              <Route path="/calendario" element={<CalendarioPage />} />
              <Route path="/hora-extra" element={<HoraExtraPage />} />
              <Route path="/absenteismo" element={<AbsenteismoPage />} />
              <Route path="/plano-acao" element={<PlanoAcaoPage />} />
            </Route>

            {/* Redirects — o catch-all vem por último. */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
