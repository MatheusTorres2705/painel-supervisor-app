// src/components/alocacao/AlocacaoResumo.tsx
// Indicadores do período filtrado. Antes o cabeçalho somava TODAS as demandas da
// OP (534 atividades / 693 h) enquanto a grade mostrava só as do período.
import { AlarmClock, CalendarRange, Gauge, ListChecks, Scale } from "lucide-react";

import { StatCard } from "@/components/patterns/StatCard";
import { num } from "@/lib/format";

export type Resumo = {
  demandas: number;
  horas: number;
  alocadas: number;
  horasAlocadas: number;
  atrasadas: number;
  horasAtrasadas: number;
  pessoas: number;
  dias: number;
  capacidade: number;
  carga: number;
};

const h = (v: number) => `${num(v, 1)} h`;

export function AlocacaoResumo({ r, loading, onBacklog }: { r: Resumo; loading: boolean; onBacklog: () => void }) {
  const pctAloc = r.horas > 0 ? (r.horasAlocadas / r.horas) * 100 : 0;
  const saldo = r.capacidade - r.carga;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-5">
      <StatCard icon={ListChecks} label="Demandas no período" value={num(r.demandas)} detail={`${h(r.horas)} a planejar`} loading={loading} />
      <StatCard
        icon={Gauge}
        label="Alocado na tela"
        value={`${num(pctAloc)}%`}
        detail={`${num(r.alocadas)} demandas · ${h(r.horasAlocadas)}`}
        tone={r.horas > 0 && pctAloc >= 99.5 ? "success" : undefined}
        loading={loading}
      />
      <StatCard
        icon={AlarmClock}
        label="Atrasadas"
        value={num(r.atrasadas)}
        detail={`${h(r.horasAtrasadas)} · clique para o backlog`}
        tone={r.atrasadas > 0 ? "danger" : undefined}
        onClick={onBacklog}
        loading={loading}
      />
      <StatCard
        icon={CalendarRange}
        label="Capacidade"
        value={h(r.capacidade)}
        detail={`${num(r.pessoas)} pessoas × ${num(r.dias)} dias`}
        loading={loading}
      />
      <StatCard
        icon={Scale}
        label="Saldo de capacidade"
        value={`${saldo < 0 ? "−" : ""}${h(Math.abs(saldo))}`}
        detail={`carga ${h(r.carga)} (tela + ERP + outras OPs)`}
        tone={saldo < 0 ? "danger" : r.capacidade > 0 && saldo < r.capacidade * 0.1 ? "warning" : "success"}
        loading={loading}
      />
    </div>
  );
}
