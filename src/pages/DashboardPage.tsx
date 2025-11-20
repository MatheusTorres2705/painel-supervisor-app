// src/pages/DashboardPage.tsx
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Clock3, Gauge, Factory, Award } from "lucide-react";
import { mockKpis } from "../lib/mock";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Bar,
} from "recharts";

const Kpi: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
}> = ({ icon, label, value, detail }) => (
  <Card className="hover:shadow-lg transition">
    <CardHeader className="pb-2">
      <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
        {icon}
        {label}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div className="text-3xl font-semibold">{value}</div>
      {detail ? <Badge variant="secondary" className="mt-2">{detail}</Badge> : null}
    </CardContent>
  </Card>
);

export default function DashboardPage() {
  const data = mockKpis();

  // dados simples para o gráfico de avanço por OP (mock)
  const ops = [
    { name: "OP-2301", pct: 72 },
    { name: "OP-2279", pct: 48 },
    { name: "OP-2310", pct: 15 },
  ];

  return (
    <div className="grid gap-4">
      {/* Linha de KPIs */}
      <div className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        <Kpi
          icon={<Clock3 className="h-4 w-4" />}
          label="HE disponível × consumida"
          value={`${data.he.cons} / ${data.he.disp} h`}
          detail="Mês atual"
        />
        <Kpi
          icon={<Gauge className="h-4 w-4" />}
          label="Avanço da linha (média)"
          value={`${data.avancos[0].pct}%`}
        />
        <Kpi
          icon={<Factory className="h-4 w-4" />}
          label="Materiais faltantes"
          value={`${data.faltantes.qtd}`}
        />
        <Kpi
          icon={<Award className="h-4 w-4" />}
          label="% Retrabalho"
          value={`${data.retrabalho.pct}%`}
        />
      </div>

      {/* Gráfico de avanço por OP */}
      <Card className="hover:shadow-lg transition">
        <CardHeader className="pb-2">
          <CardTitle>Avanço por OP (mock)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4" style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ops} margin={{ left: 12, right: 12 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip formatter={(v: any) => `${v}%`} />
              <Bar dataKey="pct" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cards auxiliares */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card className="hover:shadow-lg transition">
          <CardHeader className="pb-2">
            <CardTitle>Assiduidade (mock)</CardTitle>
          </CardHeader>
          <CardContent className="h-40 grid place-items-center text-muted-foreground">
            [Heatmap/linha de presença aqui]
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition">
          <CardHeader className="pb-2">
            <CardTitle>Pirâmide de senioridade (mock)</CardTitle>
          </CardHeader>
          <CardContent className="h-40 grid place-items-center text-muted-foreground">
            [Gráfico de pirâmide aqui]
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
