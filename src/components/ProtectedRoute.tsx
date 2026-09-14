// src/components/ProtectedRoute.tsx
import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";
import { tokenVencido } from "../auth/token";

export const ProtectedRoute: React.FC<React.PropsWithChildren> = ({ children }) => {
  const { token, expirarSessao } = useAuth();
  const loc = useLocation();

  /* Defesa extra: o AuthProvider já expira no agendamento e ao voltar para a
     aba, mas uma troca de rota logo depois do vencimento não deve montar a
     página e disparar consultas com o token morto. */
  const vencido = !!token && tokenVencido(token);
  useEffect(() => {
    if (vencido) expirarSessao();
  }, [vencido, expirarSessao]);

  if (!token || vencido) return <Navigate to="/login" replace state={{ from: loc }} />;
  return <>{children}</>;
};
