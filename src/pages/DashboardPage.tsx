// src/pages/DashboardPage.tsx
import React, { useEffect, useMemo, useState } from "react";
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
  Legend,
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

type SeniorCompareBar = {
  nivel: "I" | "II" | "III";
  label: string;
  atual: number;
  previsto: number;
  diff: number; // atual - previsto
  pct: number | null; // atual/previsto
};

function normalizeNivel(raw: any): "I" | "II" | "III" | null {
  const up = String(raw ?? "").trim().toUpperCase();
  if (up === "III" || up.startsWith("III")) return "III";
  if (up === "II" || up.startsWith("II")) return "II";
  if (up === "I" || up.startsWith("I")) return "I";
  return null;
}

function nivelLabel(n: "I" | "II" | "III") {
  if (n === "I") return "Nível I";
  if (n === "II") return "Nível II";
  return "Nível III";
}

function fmtInt(n: number) {
  return Number.isFinite(n) ? Math.round(n).toString() : "0";
}

function fmtPct(p: number | null) {
  if (p === null || !Number.isFinite(p)) return "—";
  return `${Math.round(p * 100)}%`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const data = mockKpis();

  // ===== Gráfico de atividades por colaborador (real via ERP) =====
  const [barData, setBarData] = useState<BarColab[]>([]);
  const [barLoading, setBarLoading] = useState(true);
  const [barErro, setBarErro] = useState<string | null>(null);

  // ===== Pirâmide de senioridade (comparativo Real x Previsto) =====
  const [seniorData, setSeniorData] = useState<SeniorCompareBar[]>([]);
  const [seniorLoading, setSeniorLoading] = useState(true);
  const [seniorErro, setSeniorErro] = useState<string | null>(null);

  // (fixo por enquanto, conforme sua query)
  const CODDEP_ALVO = 101040600;

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
          .sort((a, b) => b.hh - a.hh);

        setBarData(list);
      } catch (e: any) {
        console.error("[DashboardPage] Erro ao carregar gráfico de atividades:", e);
        if (!cancel)
          setBarErro(
            e?.message || "Falha ao carregar a representatividade por colaborador."
          );
      } finally {
        if (!cancel) setBarLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [user]);

  // --------- Pirâmide de senioridade (comparativo Real x Previsto) ----------
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setSeniorLoading(true);
        setSeniorErro(null);

        const CODUSU_SUP = (user as any)?.codusu ?? 134;

        const sql = `
          SELECT 
            SUM(QTD) AS QTD, 
            NIVEL , 
            SUM(NIVELI) AS I , 
            SUM(NIVELII) AS II,
            SUM(AD_NIVELIII) AS III
          FROM (
            SELECT 
              COUNT(*) AS QTD,
              CAR.AD_NIVEL AS NIVEL,
              DEP.AD_NIVELI AS NIVELI,
              DEP.AD_NIVELII AS NIVELII,
              DEP.AD_NIVELIII
            FROM TFPFUN FUN 
            JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
            JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
            WHERE FUN.USUVPJSUP = ${CODUSU_SUP}
              AND FUN.SITUACAO = '1'
              AND FUN.CODDEP = ${CODDEP_ALVO}
            GROUP BY CAR.AD_NIVEL, DEP.AD_NIVELI, DEP.AD_NIVELII, DEP.AD_NIVELIII
          )
          GROUP BY NIVEL
          ORDER BY 2 ASC
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        // Planned pode vir repetido por nível; usamos a “primeira linha” como fonte
        const planned = {
          I: rows?.length ? Number(rows[0]?.I ?? 0) : 0,
          II: rows?.length ? Number(rows[0]?.II ?? 0) : 0,
          III: rows?.length ? Number(rows[0]?.III ?? 0) : 0,
        };

        // Atual por nível
        const atualMap: Record<"I" | "II" | "III", number> = { I: 0, II: 0, III: 0 };
        for (const r of rows || []) {
          const n = normalizeNivel(r?.NIVEL);
          if (!n) continue;
          atualMap[n] += Number(r?.QTD ?? 0);
        }

        // Sempre monta I/II/III (completo). Ordena como pirâmide: III topo, II meio, I base.
        const order: ("III" | "II" | "I")[] = ["III", "II", "I"];

        const list: SeniorCompareBar[] = order.map((n) => {
          const atual = atualMap[n];
          const previsto = planned[n];
          const diff = atual - previsto;
          const pct = previsto > 0 ? atual / previsto : null;

          return {
            nivel: n,
            label: nivelLabel(n),
            atual,
            previsto,
            diff,
            pct,
          };
        });

        setSeniorData(list);
      } catch (e: any) {
        console.error("[DashboardPage] Erro ao carregar pirâmide comparativa:", e);
        if (!cancel)
          setSeniorErro(
            e?.message || "Falha ao carregar a pirâmide de senioridade (comparativo)."
          );
      } finally {
        if (!cancel) setSeniorLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [user]);

  const seniorResumo = useMemo(() => {
    const totalAtual = seniorData.reduce((acc, x) => acc + (x.atual || 0), 0);
    const totalPrev = seniorData.reduce((acc, x) => acc + (x.previsto || 0), 0);
    const diff = totalAtual - totalPrev;
    const pct = totalPrev > 0 ? totalAtual / totalPrev : null;
    return { totalAtual, totalPrev, diff, pct };
  }, [seniorData]);

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

        {/* Pirâmide de senioridade (Real x Previsto) */}
        <Card className="hover:shadow-lg transition">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Pirâmide de senioridade (Real × Previsto)</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                Dep.: {CODDEP_ALVO} • Supervisor: {(user as any)?.codusu ?? 134}
              </div>
            </div>

            {/* Resumo geral */}
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Atual: {fmtInt(seniorResumo.totalAtual)}
              </Badge>
              <Badge variant="secondary">
                Previsto: {fmtInt(seniorResumo.totalPrev)}
              </Badge>
              <Badge
                variant={seniorResumo.diff >= 0 ? "default" : "destructive"}
                className="whitespace-nowrap"
              >
                {seniorResumo.diff >= 0 ? "Excedente" : "Faltam"}{" "}
                {fmtInt(Math.abs(seniorResumo.diff))} • {fmtPct(seniorResumo.pct)}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-2" style={{ height: 220 }}>
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
                Nenhum colaborador ativo para o filtro atual.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={seniorData}
                  layout="vertical"
                  margin={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  barCategoryGap={10}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={80}
                    tick={{ fontSize: 11 }}
                  />
                  <Legend />
                  <Tooltip
                    formatter={(value: any, name: any, props: any) => {
                      const row: SeniorCompareBar = props?.payload;
                      if (name === "previsto") return [value, "Previsto"];
                      if (name === "atual") return [value, "Atual"];

                      return [value, name];
                    }}
                    labelFormatter={(label) => `Nível: ${label}`}
                    contentStyle={{ fontSize: 12 }}
                    wrapperStyle={{ outline: "none" }}
                  />
                  {/* Previsto x Atual (lado a lado) */}
                  <Bar dataKey="previsto" name="Previsto" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="atual" name="Atual" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>

          {/* Linha de detalhes por nível (visual rápido) */}
          {!seniorLoading && !seniorErro && seniorData.length > 0 ? (
            <div className="px-6 pb-4 pt-0 grid grid-cols-3 gap-3 text-xs">
              {seniorData.map((x) => (
                <div
                  key={x.nivel}
                  className="rounded-md border p-2 flex items-center justify-between"
                >
                  <div className="font-medium">{x.label}</div>
                  <div className="text-right">
                    <div className="text-muted-foreground">
                      Atual {fmtInt(x.atual)} • Prev {fmtInt(x.previsto)}
                    </div>
                    <div className={x.diff >= 0 ? "text-foreground" : "text-red-600"}>
                      {x.diff >= 0 ? "+" : "-"}
                      {fmtInt(Math.abs(x.diff))} • {fmtPct(x.pct)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
