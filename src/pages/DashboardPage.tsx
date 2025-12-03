// src/pages/DashboardPage.tsx
import React, { useEffect, useState } from "react";
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
import { useAuth } from "@/auth/AuthProvider";
import { obterReg } from "@/lib/obterReg";

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
      {detail ? (
        <Badge variant="secondary" className="mt-2">
          {detail}
        </Badge>
      ) : null}
    </CardContent>
  </Card>
);

type BarColab = {
  name: string; // NOMEFUNC
  hh: number; // horas (QTD minutos / 60)
};

type SeniorBar = {
  nivelRaw: string; // valor de AD_NIVEL (I/P/S/etc)
  label: "Júnior" | "Pleno" | "Sênior";
  qtd: number;
};

// mapeia AD_NIVEL para label
function nivelToLabel(
  v: string | null | undefined
): "Júnior" | "Pleno" | "Sênior" {
  const up = (v || "").toUpperCase();
  if (up.startsWith("III")) return "Sênior";
  if (up.startsWith("I")) return "Pleno";
  return "Júnior";
}

export default function DashboardPage() {
  const { user } = useAuth();
  const data = mockKpis();

  // ===== Gráfico de atividades por colaborador (real via ERP) =====
  const [barData, setBarData] = useState<BarColab[]>([]);
  const [barLoading, setBarLoading] = useState(true);
  const [barErro, setBarErro] = useState<string | null>(null);

  // ===== Pirâmide de senioridade =====
  const [seniorData, setSeniorData] = useState<SeniorBar[]>([]);
  const [seniorLoading, setSeniorLoading] = useState(true);
  const [seniorErro, setSeniorErro] = useState<string | null>(null);

  // --------- Atividades por colaborador ----------
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setBarLoading(true);
        setBarErro(null);

        const CODUSU_SUP = (user as any)?.codusu ?? 134;

        const sql = `
          SELECT 
            SUM(APO.QTD) AS QTD,
            FUN.NOMEFUNC
          FROM AD_DETALCRONOGRAMAFUNC APO
          JOIN TFPFUN FUN ON FUN.CODFUNC = APO.CODFUNC
          WHERE FUN.USUVPJSUP = ${CODUSU_SUP}
          GROUP BY FUN.NOMEFUNC
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const list: BarColab[] = rows
          .map((r: any) => {
            const qtdMin = Number(r.QTD ?? 0);
            const hh = Math.round((qtdMin / 60) * 10) / 10; // minutos -> horas
            return {
              name: String(r.NOMEFUNC ?? ""),
              hh,
            };
          })
          .sort((a, b) => b.hh - a.hh); // maior primeiro

        setBarData(list);
      } catch (e: any) {
        console.error(
          "[DashboardPage] Erro ao carregar gráfico de atividades:",
          e
        );
        if (!cancel)
          setBarErro(
            e?.message ||
              "Falha ao carregar a representatividade por colaborador."
          );
      } finally {
        if (!cancel) setBarLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [user]);

  // --------- Pirâmide de senioridade ----------
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setSeniorLoading(true);
        setSeniorErro(null);

        const CODUSU_SUP = (user as any)?.codusu ?? 134;

        const sql = `
          SELECT 
            COUNT(*) AS QTD,
            CAR.AD_NIVEL AS NIVEL
          FROM TFPFUN FUN 
          JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
          WHERE FUN.USUVPJSUP = ${CODUSU_SUP}
            AND FUN.SITUACAO = '1'
          GROUP BY CAR.AD_NIVEL
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const list: SeniorBar[] = rows.map((r: any) => {
          const raw = String(r.NIVEL ?? "");
          const label = nivelToLabel(raw);
          return {
            nivelRaw: raw,
            label,
            qtd: Number(r.QTD ?? 0),
          };
        });

        // consolida caso venha duplicado por qualquer motivo (mesmo label com AD_NIVEL diferente)
        const agg: Record<string, SeniorBar> = {};
        for (const item of list) {
          const key = item.label;
          if (!agg[key]) {
            agg[key] = { ...item };
          } else {
            agg[key].qtd += item.qtd;
          }
        }

        const finalList = Object.values(agg).sort((a, b) => {
          const order: Record<string, number> = {
            Sênior: 3,
            Pleno: 2,
            Júnior: 1,
          };
          return order[a.label] - order[b.label]; // Júnior embaixo, Sênior em cima
        });

        setSeniorData(finalList);
      } catch (e: any) {
        console.error(
          "[DashboardPage] Erro ao carregar pirâmide de senioridade:",
          e
        );
        if (!cancel)
          setSeniorErro(
            e?.message || "Falha ao carregar a pirâmide de senioridade."
          );
      } finally {
        if (!cancel) setSeniorLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [user]);

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

      {/* Gráfico de atividades realizadas por colaborador */}
      <Card className="hover:shadow-lg transition">
        <CardHeader className="pb-2">
          <CardTitle>Atividades realizadas por colaborador (ERP)</CardTitle>
        </CardHeader>
        <CardContent className="pt-4" style={{ height: 280 }}>
          {barLoading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Carregando gráfico…
            </div>
          ) : barErro ? (
            <div className="h-full flex items-center justify-center text-sm text-red-600">
              {barErro}
            </div>
          ) : barData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              Nenhum apontamento encontrado para o supervisor.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                margin={{ left: 12, right: 12, top: 8, bottom: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-20}
                  textAnchor="end"
                  height={50}
                  tick={{ fontSize: 10 }}
                />
                <YAxis
                  tickFormatter={(v) => `${v}h`}
                  width={40}
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value: any) => [`${value} h`, "Horas apontadas"]}
                  labelFormatter={(label) => `Colaborador: ${label}`}
                />
                <Bar dataKey="hh" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Cards auxiliares */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Assiduidade (continua mock por enquanto) */}
        <Card className="hover:shadow-lg transition">
          <CardHeader className="pb-2">
            <CardTitle>Assiduidade (mock)</CardTitle>
          </CardHeader>
          <CardContent className="h-40 grid place-items-center text-muted-foreground">
            [Heatmap/linha de presença aqui]
          </CardContent>
        </Card>

        {/* Pirâmide de senioridade (real) */}
        <Card className="hover:shadow-lg transition">
          <CardHeader className="pb-2">
            <CardTitle>Pirâmide de senioridade</CardTitle>
          </CardHeader>
          <CardContent className="h-40 pt-2">
            {seniorLoading ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Carregando pirâmide…
              </div>
            ) : seniorErro ? (
              <div className="h-full flex items-center justify-center text-sm text-red-600">
                {seniorErro}
              </div>
            ) : seniorData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Nenhum colaborador ativo para o supervisor.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={seniorData}
                  layout="vertical"
                  margin={{ top: 8, bottom: 8, left: 12, right: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={70}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(
                      value: any) => [
                      `${value} colaborador(es)`,
                      "Quantidade",
                    ]}
                    labelFormatter={(label) => `Nível: ${label}`}
                  />
                  <Bar dataKey="qtd" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
