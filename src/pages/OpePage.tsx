// src/pages/OpePage.tsx
// OPE — Operacional de Produção. Equivalente à DashboardPage do painel-diretoria
// (rota "/" de lá, rotulada "OPE" no menu), que só envolve o detalhamento.
import { PageHeader } from "@/components/patterns/PageHeader";
import { OpeDetalhamentoModal } from "./OpeDetalhamentoModal";

export default function OpePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="OPE"
        description="Operacional de Produção — quanto da hora paga virou atividade apontada"
      />
      <OpeDetalhamentoModal />
    </div>
  );
}
