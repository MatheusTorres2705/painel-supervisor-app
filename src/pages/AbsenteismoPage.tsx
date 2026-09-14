// src/pages/AbsenteismoPage.tsx
// Absenteísmo. Cópia da rotina do painel-diretoria
// (painel-diretoria/src/pages/AbsenteismoPage.tsx).
//
// A LÓGICA está linha a linha igual à de lá: os SQLs (view AD_VFALTA +
// TFPFUN), a taxa (HH perdido ÷ HH disponível), a série de 12 meses, o drill
// gerente → supervisor → colaborador → dias e a análise de reincidência.
//
// DIFERENÇA DE LÓGICA: filtro "Apenas meus colaboradores" (não existe lá).
// Ligado, TODAS as consultas ficam restritas aos colaboradores cujo supervisor
// no cadastro é o usuário logado (TFPFUN.USUVPJSUP) — o mesmo critério de
// Equipe, Pirâmide e Hora Extra. Inclui o denominador: o HH disponível passa a
// contar só a equipe, senão a % seria faltas da equipe ÷ efetivo da empresa.
// É o supervisor de HOJE no cadastro: em meses passados aparecem as faltas de
// quem está na equipe agora, não de quem estava na época.
//
// A INTERFACE foi portada para o design system deste projeto. Diferenças:
//  · tipos: `unknown`/ErpRow no lugar de `any` (lint deste projeto);
//  · erro da consulta via mensagemErro — sessão vencida não aparece como
//    "Token inválido";
//  · o Modal virou Dialog; o MonthYearPicker, dois <Select>;
//  · rótulos clicáveis do ranking viraram <button> — lá só a <tr> tinha
//    onClick, sem teclado;
//  · os formatadores vêm de lib/formatDiretoria (ver o cabeçalho de lá).
import React from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";
import { UserX, Users, CalendarX, Hourglass, Percent, ChevronLeft, TrendingUp, BarChart3 } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";

import { obterReg } from "@/lib/obterReg";
import { int, hours as fmtHours, pct as fmtPct } from "@/lib/formatDiretoria";
import { MESES_CURTO, MESES_LONGO } from "@/lib/datetime";
import type { ErpRow } from "@/lib/format";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { PANEL_MARGIN, PANEL_Y_WIDTH, axisProps, chartSemantic, gridProps, legendProps, token } from "@/lib/chartTheme";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/patterns/PageHeader";
import { StatCard } from "@/components/patterns/StatCard";
import { EmptyState } from "@/components/patterns/EmptyState";
import { ChartPanels } from "@/components/patterns/ChartPanels";

/* ===================== Helpers ===================== */
const n = (v: unknown) => (v == null || v === "" ? 0 : Number(v));
const s = (v: unknown) => (v == null ? "" : String(v));
const getAny = (row: ErpRow, key: string): unknown =>
  row?.[key] ?? row?.[key.toUpperCase()] ?? row?.[key.toLowerCase()];
const esc = (v: string) => v.replace(/'/g, "''");

/* Formatação delegada a @/lib/formatDiretoria — os nomes locais viram aliases
   finos para não alterar os pontos de chamada copiados. */
const num = (v: number) => int(v);
const fmtHoras = (v: number) => fmtHours(v, { decimals: 0 });
const pct = (v: number) => fmtPct(v, { decimals: 2 });

const MESES_PT = MESES_CURTO.slice(1);   // esta tela indexa por 0 (mes-1)
const MESES_FULL = MESES_LONGO.slice(1);
const oracleData = (d: string) => `TO_DATE('${d}','DD/MM/YYYY')`;
const pad2 = (x: number) => String(x).padStart(2, "0");

// Taxa de absenteísmo = HH perdido ÷ HH disponível × 100
const taxaAbs = (hhFalta: number, hhDisp: number) => (hhDisp > 0 ? (hhFalta / hhDisp) * 100 : 0);
// Condição "colaborador disponível no dia D" (DTADM ≤ D e não demitido até D)
const ATIVO_NO_DIA = (col: string) => `TRUNC(F.DTADM) <= ${col} AND (F.DTDEM IS NULL OR TRUNC(F.DTDEM) >= ${col})`;

/* ── Escopo "Apenas meus colaboradores" (só neste painel) ──────────
   `sup` = CODUSU do supervisor logado, ou null para a empresa toda.
   O casamento com AD_VFALTA é por CODFUNC, igual ao JOIN que já existia em
   FROM_BASE. */
type Sup = number | null;
/** Para consultas que já têm TFPFUN com alias. */
const escopoFun = (alias: string, sup: Sup) => (sup == null ? "" : ` AND ${alias}.USUVPJSUP = ${Number(sup)}`);
/** Para consultas só em AD_VFALTA. */
const escopoFalta = (col: string, sup: Sup) =>
  sup == null ? "" : ` AND ${col} IN (SELECT CODFUNC FROM TFPFUN WHERE USUVPJSUP = ${Number(sup)})`;

const CHAVE_MEUS = "absenteismo:apenas-meus";
function lerMeus(): boolean {
  try { return localStorage.getItem(CHAVE_MEUS) !== "0"; } catch { return true; }
}
function gravarMeus(v: boolean) {
  try { localStorage.setItem(CHAVE_MEUS, v ? "1" : "0"); } catch { /* armazenamento bloqueado: só não lembra */ }
}

/* Cores do gráfico: os papéis de lá (CHART.warn/ink2/ink3) em tokens daqui. */
const COR = {
  taxa: chartSemantic.warning,
  media: chartSemantic.muted,
  contexto: token("muted-foreground", 0.45),
  faltas: chartSemantic.primary,
};

/* ===================== SQL (view AD_VFALTA + TFPFUN) ===================== */
// Faltas mês a mês (efetivo/HH disponível vem de SQL_EFETIVO_MENSAL)
const makeSqlMensal = (sup: Sup) => `
SELECT ANOREF, MESREF,
  COUNT(DISTINCT CODFUNC) AS FALTANTES,
  COUNT(*)                AS FALTAS,
  SUM(HH_PERDIDO)         AS HH_PERDIDO
FROM AD_VFALTA
WHERE 1 = 1${escopoFalta("CODFUNC", sup)}
GROUP BY ANOREF, MESREF
ORDER BY ANOREF, TO_NUMBER(MESREF)
`;

// Efetivo disponível por mês — dias úteis (seg–sex) × ativos no dia (DTADM/DTDEM)
const makeSqlEfetivoMensal = (ini: string, fim: string, sup: Sup) => `
WITH DIAS AS (
  SELECT D FROM (
    SELECT ${oracleData(ini)} + LEVEL - 1 AS D
    FROM DUAL CONNECT BY LEVEL <= ${oracleData(fim)} - ${oracleData(ini)} + 1
  )
  WHERE TO_CHAR(D,'DY','NLS_DATE_LANGUAGE=ENGLISH') NOT IN ('SAT','SUN')
),
EFETIVO AS (
  SELECT D.D, COUNT(*) AS ATIVOS
  FROM DIAS D
  JOIN TFPFUN F ON ${ATIVO_NO_DIA("D.D")}${escopoFun("F", sup)}
  GROUP BY D.D
)
SELECT TO_CHAR(D,'YYYY') AS ANOREF, TO_CHAR(D,'MM') AS MESREF,
  COUNT(*)           AS DIAS_UTEIS,
  ROUND(AVG(ATIVOS)) AS EFETIVO_MEDIO,
  SUM(ATIVOS) * 8    AS HH_DISPONIVEL
FROM EFETIVO
GROUP BY TO_CHAR(D,'YYYY'), TO_CHAR(D,'MM')
ORDER BY 1, 2
`;

// Diário — faltas por dia + ativos no próprio dia (DTADM/DTDEM)
const makeSqlDia = (ini: string, fim: string, sup: Sup) => `
SELECT g.DIA, g.FALTAS, g.HH_PERDIDO,
  (SELECT COUNT(*) FROM TFPFUN F WHERE ${ATIVO_NO_DIA("g.DT")}${escopoFun("F", sup)}) AS ATIVOS,
  ROUND(100 * g.FALTAS / NULLIF((SELECT COUNT(*) FROM TFPFUN F WHERE ${ATIVO_NO_DIA("g.DT")}${escopoFun("F", sup)}),0), 2) AS PCT_ABSENTEISMO
FROM (
  SELECT TRUNC(DTREF) AS DT, TO_CHAR(DTREF,'DD/MM/YYYY') AS DIA,
    COUNT(*) AS FALTAS, SUM(HH_PERDIDO) AS HH_PERDIDO
  FROM AD_VFALTA
  WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}${escopoFalta("CODFUNC", sup)}
  GROUP BY TRUNC(DTREF), TO_CHAR(DTREF,'DD/MM/YYYY')
) g
ORDER BY g.DT
`;

const FROM_BASE = (ini: string, fim: string, sup: Sup) => `
FROM AD_VFALTA v
JOIN TFPFUN f ON f.CODFUNC = v.CODFUNC
WHERE TRUNC(v.DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}${escopoFun("f", sup)}`;
const GERENTE_EXPR = `NVL(f.AD_GERENTE,'(sem gerente)')`;
const SUPERVISOR_EXPR = `NVL(v.GESTOR,'(sem gestor)')`;
const METRICAS = `COUNT(*) AS FALTAS, COUNT(DISTINCT v.CODFUNC) AS FALTANTES, SUM(v.HH_PERDIDO) AS HH_PERDIDO`;

// Nível 0 — por gerente
const makeSqlGerentes = (ini: string, fim: string, sup: Sup) => `
SELECT ${GERENTE_EXPR} AS GERENTE, ${METRICAS}
${FROM_BASE(ini, fim, sup)}
GROUP BY ${GERENTE_EXPR}
ORDER BY FALTAS DESC
`;

// Nível 1 — supervisores de um gerente
const makeSqlSupervisores = (ini: string, fim: string, gerente: string, sup: Sup) => `
SELECT ${SUPERVISOR_EXPR} AS SUPERVISOR, ${METRICAS}
${FROM_BASE(ini, fim, sup)}
  AND ${GERENTE_EXPR} = '${esc(gerente)}'
GROUP BY ${SUPERVISOR_EXPR}
ORDER BY FALTAS DESC
`;

// Nível 2 — colaboradores de gerente + supervisor
const makeSqlFuncionarios = (ini: string, fim: string, gerente: string, supervisor: string, sup: Sup) => `
SELECT v.CODFUNC, v.NOMEFUNC, COUNT(*) AS FALTAS, SUM(v.HH_PERDIDO) AS HH_PERDIDO
${FROM_BASE(ini, fim, sup)}
  AND ${GERENTE_EXPR} = '${esc(gerente)}'
  AND ${SUPERVISOR_EXPR} = '${esc(supervisor)}'
GROUP BY v.CODFUNC, v.NOMEFUNC
ORDER BY FALTAS DESC
`;

// Nível 3 — dias da falta de um colaborador
const makeSqlDiasColab = (ini: string, fim: string, codfunc: number) => `
SELECT TO_CHAR(DTREF,'DD/MM/YYYY') AS DIA, HH_PERDIDO
FROM AD_VFALTA
WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
  AND CODFUNC = ${Number(codfunc)}
ORDER BY DTREF
`;

// Análise do mês — colaboradores que mais faltaram (com gerente/supervisor)
const makeSqlTopMes = (ini: string, fim: string, sup: Sup) => `
SELECT v.CODFUNC, v.NOMEFUNC, ${GERENTE_EXPR} AS GERENTE, ${SUPERVISOR_EXPR} AS SUPERVISOR,
  COUNT(*) AS FALTAS, SUM(v.HH_PERDIDO) AS HH_PERDIDO
${FROM_BASE(ini, fim, sup)}
GROUP BY v.CODFUNC, v.NOMEFUNC, ${GERENTE_EXPR}, ${SUPERVISOR_EXPR}
ORDER BY FALTAS DESC
`;
// Reincidência — faltas por colaborador por mês (janela do histórico)
const makeSqlReincidencia = (ini: string, fim: string, sup: Sup) => `
SELECT CODFUNC, ANOREF, MESREF, COUNT(*) AS FALTAS
FROM AD_VFALTA
WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}${escopoFalta("CODFUNC", sup)}
GROUP BY CODFUNC, ANOREF, MESREF
`;

/* ===================== Tipos ===================== */
type MensalRow = { ano: number; mes: number; faltantes: number; faltas: number; hh: number };
type EfetivoRow = { efetivoMedio: number; hhDisp: number; dias: number };
type GrupoRow = { key: string; label: string; sub?: string; faltas: number; faltantes?: number; hh: number; onClick?: () => void };
type DiaRow = { dia: string; hh: number };

/* Tooltips */
type TooltipProps<T> = { active?: boolean; payload?: ReadonlyArray<{ payload: T }>; label?: string | number };

const TOOLTIP_CLS = "rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-overlay";

function LinhaTooltip({ rotulo, children, destaque }: { rotulo: string; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-4", destaque && "mt-1 border-t border-border pt-1")}>
      <span className="text-muted-foreground">{rotulo}</span>
      {children}
    </div>
  );
}

function HistTooltip({ active, payload, label }: TooltipProps<{ faltas: number; hh: number; faltantes: number; efetivo: number; du: number; hhDisp: number; pct: number; parcial?: boolean }>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={TOOLTIP_CLS}>
      <div className="mb-1 font-semibold text-foreground">{label}{d.parcial ? " · parcial" : ""}</div>
      <LinhaTooltip rotulo="Colaboradores"><b className="tabular">{num(d.efetivo)}</b></LinhaTooltip>
      <LinhaTooltip rotulo="Faltas"><b className="tabular">{num(d.faltas)}</b></LinhaTooltip>
      <LinhaTooltip rotulo="Faltantes"><b className="tabular">{num(d.faltantes)}</b></LinhaTooltip>
      <LinhaTooltip rotulo="HH perdido"><b className="tabular">{fmtHoras(d.hh)}</b></LinhaTooltip>
      <LinhaTooltip rotulo="HH disponível">
        <span><b className="tabular">{fmtHoras(d.hhDisp)}</b> <span className="text-muted-foreground">({d.du} dias)</span></span>
      </LinhaTooltip>
      <LinhaTooltip rotulo="% Absenteísmo" destaque><b className="tabular text-primary">{pct(d.pct)}</b></LinhaTooltip>
    </div>
  );
}
function DiaTooltip({ active, payload, label }: TooltipProps<{ faltas: number; hh: number; pctAbs: number }>) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className={TOOLTIP_CLS}>
      <div className="mb-1 font-semibold text-foreground">{label}</div>
      <LinhaTooltip rotulo="Faltas"><b className="tabular">{num(d.faltas)}</b></LinhaTooltip>
      <LinhaTooltip rotulo="HH perdido"><b className="tabular">{fmtHoras(d.hh)}</b></LinhaTooltip>
      <LinhaTooltip rotulo="% absenteísmo" destaque><b className="tabular text-primary">{pct(d.pctAbs)}</b></LinhaTooltip>
    </div>
  );
}

/* Tabela: cabeçalho e zebra comuns às quatro tabelas da tela */
const TH = "px-3 py-2 font-medium";
const THEAD_CLS = "sticky top-0 z-10 bg-muted";
const THEAD_TR = "border-b border-border text-left text-2xs uppercase tracking-wide text-muted-foreground";
const zebra = (i: number) => (i % 2 === 0 ? "bg-card" : "bg-muted/30");

/* Tabela de ranking reutilizável (gerente / supervisor / colaborador) */
function RankFaltas({
  items, loading, labelHead, emptyText, showFaltantes = true, maxH,
}: {
  items: GrupoRow[];
  loading: boolean;
  labelHead: string;
  emptyText: string;
  showFaltantes?: boolean;
  maxH?: string;
}) {
  const totFaltas = items.reduce((a, it) => a + it.faltas, 0);
  const totFaltantes = items.reduce((a, it) => a + (it.faltantes ?? 0), 0);
  const totHH = items.reduce((a, it) => a + it.hh, 0);
  const cols = showFaltantes ? 7 : 6;
  return (
    <div className="overflow-auto scrollbar-slim" style={maxH ? { maxHeight: maxH } : undefined}>
      <table className="w-full min-w-[37.5rem] text-sm">
        <thead className={THEAD_CLS}>
          <tr className={THEAD_TR}>
            <th className={TH}>#</th>
            <th className={TH}>{labelHead}</th>
            <th className={cn(TH, "border-l border-border text-right")}>Faltas</th>
            {showFaltantes && <th className={cn(TH, "border-l border-border text-right")}>Faltantes</th>}
            <th className={cn(TH, "border-l border-border text-right")}>HH perdido</th>
            <th className={cn(TH, "text-right")}>% s/ total</th>
            <th className={cn(TH, "w-28")}>Repres.</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className={zebra(i)}>
                {Array.from({ length: cols }).map((__, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-3" /></td>)}
              </tr>
            ))
          ) : items.length === 0 ? (
            <tr><td colSpan={cols}><EmptyState icon={CalendarX} title={emptyText} /></td></tr>
          ) : (
            items.map((it, i) => {
              const rep = totFaltas > 0 ? (it.faltas / totFaltas) * 100 : 0;
              return (
                <tr key={it.key} onClick={it.onClick}
                  className={cn("border-t border-border/60 transition-colors", zebra(i), it.onClick && "cursor-pointer hover:bg-muted")}>
                  <td className="px-3 py-2 tabular text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      {it.onClick ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); it.onClick?.(); }}
                          className="w-fit text-left font-medium leading-tight text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                          title="Detalhar"
                        >
                          {it.label || "—"}
                        </button>
                      ) : (
                        <span className="font-medium leading-tight text-foreground">{it.label || "—"}</span>
                      )}
                      {it.sub && <span className="text-2xs text-muted-foreground">{it.sub}</span>}
                    </div>
                  </td>
                  <td className="border-l border-border px-3 py-2 text-right font-semibold tabular text-foreground">{num(it.faltas)}</td>
                  {showFaltantes && <td className="border-l border-border px-3 py-2 text-right tabular text-muted-foreground">{num(it.faltantes ?? 0)}</td>}
                  <td className="border-l border-border px-3 py-2 text-right tabular text-muted-foreground">{fmtHoras(it.hh)}</td>
                  <td className="px-3 py-2 text-right tabular text-muted-foreground">{pct(rep)}</td>
                  <td className="px-3 py-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, rep))}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        {!loading && items.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
              <td className="px-3 py-2" colSpan={2}>Total Geral</td>
              <td className="border-l border-border px-3 py-2 text-right tabular">{num(totFaltas)}</td>
              {showFaltantes && <td className="border-l border-border px-3 py-2 text-right tabular">{num(totFaltantes)}</td>}
              <td className="border-l border-border px-3 py-2 text-right tabular">{fmtHoras(totHH)}</td>
              <td className="px-3 py-2 text-right tabular text-muted-foreground">100%</td>
              <td className="px-3 py-2" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Secao({ titulo, children, semPadding }: { titulo: string; children: React.ReactNode; semPadding?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className={semPadding ? "p-0" : undefined}>{children}</CardContent>
    </Card>
  );
}

/* ===================== Página ===================== */
const HOJE = new Date();

export default function AbsenteismoPage() {
  const { user } = useAuth();
  const codusu = user?.codusu != null && Number.isFinite(Number(user.codusu)) ? Number(user.codusu) : null;
  const [apenasMeus, setApenasMeus] = React.useState(lerMeus);
  const trocarEscopo = (v: boolean) => { setApenasMeus(v); gravarMeus(v); };
  // Sem usuário identificado não há como recortar: cai na empresa toda e o chip some.
  const sup: Sup = apenasMeus && codusu != null ? codusu : null;

  const [ano, setAno] = React.useState(HOJE.getFullYear());
  const [mes, setMes] = React.useState(HOJE.getMonth() + 1);

  const [mensalAll, setMensalAll] = React.useState<MensalRow[]>([]);
  const [loadingMensal, setLoadingMensal] = React.useState(true);
  const [dias, setDias] = React.useState<{ dia: string; faltas: number; hh: number; pctAbs: number }[]>([]);
  const [gerentes, setGerentes] = React.useState<(GrupoRow)[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const ini = `01/${pad2(mes)}/${ano}`;
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const ehMesCorrente = ano === HOJE.getFullYear() && mes === HOJE.getMonth() + 1;
  const diaApuracao = ehMesCorrente ? HOJE.getDate() : ultimoDia;
  const fim = `${pad2(diaApuracao)}/${pad2(mes)}/${ano}`;

  // Mensal (faltas) + Efetivo por mês (DTADM/DTDEM) — uma vez
  const [efetivoMap, setEfetivoMap] = React.useState<Map<string, EfetivoRow>>(new Map());
  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingMensal(true);
      const anoIni = HOJE.getFullYear() - 1;
      const efIni = `01/01/${anoIni}`;
      const efFim = `${pad2(HOJE.getDate())}/${pad2(HOJE.getMonth() + 1)}/${HOJE.getFullYear()}`;
      try {
        const [faltaRaw, efRaw] = await Promise.all([
          obterReg(makeSqlMensal(sup), { pageSize: 5000, maxPages: 5 }),
          obterReg(makeSqlEfetivoMensal(efIni, efFim, sup), { pageSize: 5000, maxPages: 5 }),
        ]);
        if (!alive) return;
        setMensalAll(faltaRaw.map(r => ({
          ano: n(getAny(r, "ANOREF")), mes: n(getAny(r, "MESREF")),
          faltantes: n(getAny(r, "FALTANTES")), faltas: n(getAny(r, "FALTAS")), hh: n(getAny(r, "HH_PERDIDO")),
        })));
        const map = new Map<string, EfetivoRow>();
        efRaw.forEach(r => {
          const key = `${n(getAny(r, "ANOREF"))}-${pad2(n(getAny(r, "MESREF")))}`;
          map.set(key, { efetivoMedio: n(getAny(r, "EFETIVO_MEDIO")), hhDisp: n(getAny(r, "HH_DISPONIVEL")), dias: n(getAny(r, "DIAS_UTEIS")) });
        });
        setEfetivoMap(map);
      } catch { if (alive) { setMensalAll([]); setEfetivoMap(new Map()); } }
      finally { if (alive) setLoadingMensal(false); }
    })();
    return () => { alive = false; };
  }, [sup]);
  const efDoMes = (a: number, m: number) => efetivoMap.get(`${a}-${pad2(m)}`);

  // Diário + gerentes — ao mudar período
  React.useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const [diaRaw, gerRaw] = await Promise.all([
          obterReg(makeSqlDia(ini, fim, sup), { pageSize: 5000, maxPages: 5 }),
          obterReg(makeSqlGerentes(ini, fim, sup), { pageSize: 5000, maxPages: 5 }),
        ]);
        if (!alive) return;
        setDias(diaRaw.map(r => ({
          dia: s(getAny(r, "DIA")), faltas: n(getAny(r, "FALTAS")),
          hh: n(getAny(r, "HH_PERDIDO")), pctAbs: n(getAny(r, "PCT_ABSENTEISMO")),
        })));
        setGerentes(gerRaw.map(r => {
          const g = s(getAny(r, "GERENTE")) || "(sem gerente)";
          return { key: g, label: g, faltas: n(getAny(r, "FALTAS")), faltantes: n(getAny(r, "FALTANTES")), hh: n(getAny(r, "HH_PERDIDO")) };
        }));
      } catch (e: unknown) {
        if (!alive) return;
        setErr(mensagemErro(e, "Falha ao carregar absenteísmo."));
        setDias([]); setGerentes([]);
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [ini, fim, sup]);

  // KPIs do mês
  const mesAtual = React.useMemo(() => mensalAll.find(r => r.ano === ano && r.mes === mes), [mensalAll, ano, mes]);
  const efMes = efDoMes(ano, mes);
  const ativos = efMes?.efetivoMedio ?? 0;      // efetivo médio disponível no mês
  const hhDispMes = efMes?.hhDisp ?? 0;
  const duMes = efMes?.dias ?? 0;
  const faltantes = mesAtual?.faltantes ?? 0;
  const faltas = mesAtual?.faltas ?? 0;
  const hhPerdido = mesAtual?.hh ?? 0;
  const pctMes = taxaAbs(hhPerdido, hhDispMes);

  const serie = React.useMemo(() => {
    const sel = ano * 12 + (mes - 1);
    const arr = mensalAll
      .filter(r => { const k = r.ano * 12 + (r.mes - 1); return k <= sel && k > sel - 12; })
      .sort((a, b) => (a.ano * 12 + a.mes) - (b.ano * 12 + b.mes))
      .map(r => {
        const parcial = r.ano === ano && r.mes === mes && ehMesCorrente;
        const ef = efetivoMap.get(`${r.ano}-${pad2(r.mes)}`);
        const hhDisp = ef?.hhDisp ?? 0;
        return {
          label: `${MESES_PT[r.mes - 1]}/${String(r.ano).slice(2)}`,
          faltas: r.faltas, faltantes: r.faltantes, hh: r.hh,
          efetivo: ef?.efetivoMedio ?? 0, du: ef?.dias ?? 0, hhDisp, pct: taxaAbs(r.hh, hhDisp),
          parcial,
        };
      });
    const media = arr.length ? arr.reduce((a, d) => a + d.pct, 0) / arr.length : 0;
    return arr.map(d => ({ ...d, media }));
  }, [mensalAll, efetivoMap, ano, mes, ehMesCorrente]);
  const mediaGeral = serie.length ? serie[0].media : 0;

  /* Drill: Gerente → Supervisor → Colaborador → Dias */
  const [dGerente, setDGerente] = React.useState<string | null>(null);
  const [dSupervisor, setDSupervisor] = React.useState<string | null>(null);
  const [dColab, setDColab] = React.useState<{ codfunc: number; nome: string } | null>(null);
  const [supRows, setSupRows] = React.useState<GrupoRow[]>([]);
  const [supLoading, setSupLoading] = React.useState(false);
  const [funcRows, setFuncRows] = React.useState<GrupoRow[]>([]);
  const [funcLoading, setFuncLoading] = React.useState(false);
  const [diaRows, setDiaRows] = React.useState<DiaRow[]>([]);
  const [diaLoading, setDiaLoading] = React.useState(false);

  React.useEffect(() => {
    if (!dGerente) return;
    let alive = true;
    (async () => {
      setSupLoading(true); setSupRows([]);
      try {
        const raw = await obterReg(makeSqlSupervisores(ini, fim, dGerente, sup), { pageSize: 5000, maxPages: 5 });
        if (alive) setSupRows(raw.map(r => {
          const sup = s(getAny(r, "SUPERVISOR")) || "(sem gestor)";
          return { key: sup, label: sup, faltas: n(getAny(r, "FALTAS")), faltantes: n(getAny(r, "FALTANTES")), hh: n(getAny(r, "HH_PERDIDO")), onClick: () => { setDSupervisor(sup); setDColab(null); } };
        }));
      } catch { if (alive) setSupRows([]); }
      finally { if (alive) setSupLoading(false); }
    })();
    return () => { alive = false; };
  }, [dGerente, ini, fim, sup]);

  React.useEffect(() => {
    if (!dGerente || !dSupervisor) return;
    let alive = true;
    (async () => {
      setFuncLoading(true); setFuncRows([]);
      try {
        const raw = await obterReg(makeSqlFuncionarios(ini, fim, dGerente, dSupervisor, sup), { pageSize: 5000, maxPages: 10 });
        if (alive) setFuncRows(raw.map(r => {
          const cod = n(getAny(r, "CODFUNC")); const nome = s(getAny(r, "NOMEFUNC")) || `#${cod}`;
          return { key: String(cod), label: nome, sub: `#${cod}`, faltas: n(getAny(r, "FALTAS")), hh: n(getAny(r, "HH_PERDIDO")), onClick: () => setDColab({ codfunc: cod, nome }) };
        }));
      } catch { if (alive) setFuncRows([]); }
      finally { if (alive) setFuncLoading(false); }
    })();
    return () => { alive = false; };
  }, [dGerente, dSupervisor, ini, fim, sup]);

  React.useEffect(() => {
    if (!dColab) return;
    let alive = true;
    (async () => {
      setDiaLoading(true); setDiaRows([]);
      try {
        const raw = await obterReg(makeSqlDiasColab(ini, fim, dColab.codfunc), { pageSize: 5000, maxPages: 5 });
        if (alive) setDiaRows(raw.map(r => ({ dia: s(getAny(r, "DIA")), hh: n(getAny(r, "HH_PERDIDO")) })));
      } catch { if (alive) setDiaRows([]); }
      finally { if (alive) setDiaLoading(false); }
    })();
    return () => { alive = false; };
  }, [dColab, ini, fim]);

  const fecharModal = () => { setDGerente(null); setDSupervisor(null); setDColab(null); };
  const diaTotHH = diaRows.reduce((a, r) => a + r.hh, 0);

  const anosSel = Array.from(new Set([HOJE.getFullYear(), HOJE.getFullYear() - 1, ano])).sort((a, b) => b - a);
  const periodoLabel = `${MESES_FULL[mes - 1]}/${ano}`;

  /* Análise do mês: top faltantes + reincidência (6 meses) */
  const TOP_N = 40;
  const mesesHist = React.useMemo(() => {
    const sel = ano * 12 + (mes - 1);
    const out: { ano: number; mes: number; key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const k = sel - i;
      const a = Math.floor(k / 12), m = (k % 12) + 1;
      out.push({ ano: a, mes: m, key: `${a}-${pad2(m)}`, label: `${MESES_PT[m - 1]}/${String(a).slice(2)}` });
    }
    return out;
  }, [ano, mes]);
  const iniHist = `01/${pad2(mesesHist[0].mes)}/${mesesHist[0].ano}`;

  type TopRow = { codfunc: number; nome: string; gerente: string; supervisor: string; faltas: number; hh: number };
  const [analiseOpen, setAnaliseOpen] = React.useState(false);
  const [topRows, setTopRows] = React.useState<TopRow[]>([]);
  const [reincMap, setReincMap] = React.useState<Map<number, Record<string, number>>>(new Map());
  const [analiseLoading, setAnaliseLoading] = React.useState(false);

  React.useEffect(() => {
    if (!analiseOpen) return;
    let alive = true;
    (async () => {
      setAnaliseLoading(true);
      try {
        const [topRaw, reincRaw] = await Promise.all([
          obterReg(makeSqlTopMes(ini, fim, sup), { pageSize: 5000, maxPages: 20 }),
          obterReg(makeSqlReincidencia(iniHist, fim, sup), { pageSize: 5000, maxPages: 40 }),
        ]);
        if (!alive) return;
        setTopRows(topRaw.map(r => ({
          codfunc: n(getAny(r, "CODFUNC")), nome: s(getAny(r, "NOMEFUNC")),
          gerente: s(getAny(r, "GERENTE")) || "(sem gerente)", supervisor: s(getAny(r, "SUPERVISOR")) || "(sem gestor)",
          faltas: n(getAny(r, "FALTAS")), hh: n(getAny(r, "HH_PERDIDO")),
        })));
        const map = new Map<number, Record<string, number>>();
        reincRaw.forEach(r => {
          const c = n(getAny(r, "CODFUNC"));
          const key = `${n(getAny(r, "ANOREF"))}-${pad2(n(getAny(r, "MESREF")))}`;
          if (!map.has(c)) map.set(c, {});
          map.get(c)![key] = n(getAny(r, "FALTAS"));
        });
        setReincMap(map);
      } catch { if (alive) { setTopRows([]); setReincMap(new Map()); } }
      finally { if (alive) setAnaliseLoading(false); }
    })();
    return () => { alive = false; };
  }, [analiseOpen, ini, fim, iniHist, sup]);

  const botaoVoltar = "mb-3 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absenteísmo"
        description={`Gente e Gestão — RH · Apuração 01–${pad2(diaApuracao)}/${pad2(mes)}/${ano}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setAnaliseOpen(true)}>
              <BarChart3 className="h-4 w-4" /> <span className="hidden sm:inline">Análise do mês</span>
            </Button>
            <div className="w-36">
              <Select value={mes} onChange={e => setMes(Number(e.target.value))} aria-label="Mês">
                {MESES_FULL.map((nome, i) => (
                  <option key={i + 1} value={i + 1}>{nome}</option>
                ))}
              </Select>
            </div>
            <div className="w-24">
              <Select value={ano} onChange={e => setAno(Number(e.target.value))} aria-label="Ano">
                {anosSel.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
          </>
        }
      >
        {codusu != null && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Colaboradores">
              <Chip ativo={sup != null} onClick={() => trocarEscopo(true)}>Apenas meus colaboradores</Chip>
              <Chip ativo={sup == null} onClick={() => trocarEscopo(false)}>Todos</Chip>
            </div>
            <span className="text-2xs text-muted-foreground">
              {sup != null
                ? `Supervisor no cadastro: ${user?.name || `usuário ${codusu}`}`
                : "Empresa toda"}
            </span>
          </div>
        )}
      </PageHeader>

      {err && <Alert variant="destructive" title="Falha ao carregar">{err}</Alert>}

      {sup != null && !loadingMensal && efetivoMap.size === 0 && (
        <Alert variant="info" title="Nenhum colaborador na sua equipe">
          Não há colaboradores ativos com você como supervisor no cadastro (TFPFUN.USUVPJSUP) desde janeiro do ano passado.
          Selecione “Todos” para ver a empresa toda.
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-5">
        <StatCard icon={Users} label="Colaboradores ativos" loading={loadingMensal} value={num(ativos)} detail={loadingMensal ? "" : `efetivo médio · ${duMes} dias úteis`} />
        <StatCard icon={UserX} label="Faltantes" tone="danger" loading={loadingMensal} value={num(faltantes)} detail="colaboradores distintos" />
        <StatCard icon={CalendarX} label="Faltas" loading={loadingMensal} value={num(faltas)} detail="ocorrências (dia)" />
        <StatCard icon={Hourglass} label="HH perdido" loading={loadingMensal} value={fmtHoras(hhPerdido)} detail="8h por falta" />
        <StatCard icon={Percent} label="% Absenteísmo" tone="warning" loading={loadingMensal} value={pct(pctMes)} detail={loadingMensal ? "" : `${fmtHoras(hhPerdido)} ÷ ${fmtHoras(hhDispMes)} (${duMes} dias úteis)`} />
      </div>

      {/* Histórico mensal */}
      <Secao titulo="Histórico de absenteísmo (12 meses)">
        {loadingMensal ? (
          <Skeleton className="h-52 w-full md:h-72 2xl:h-80" />
        ) : serie.length === 0 ? (
          <EmptyState icon={TrendingUp} title="Sem histórico" />
        ) : (
          /* Dois painéis com o mesmo eixo X no lugar do eixo duplo — ver
             components/patterns/ChartPanels. Em cima o %, embaixo o efetivo. */
          <ChartPanels
            rotuloApoio="Efetivo médio disponível (colaboradores)"
            legenda={<>
              Linha cheia = % de absenteísmo (HH falta ÷ HH disponível). Linha tracejada = média geral do período ({pct(mediaGeral)}).
              {serie.some(d => d.parcial) && " Barra mais clara = mês em apuração (parcial)."}
            </>}
            principal={
              <ResponsiveContainer key={`hist-pct-${ano}-${mes}`} width="100%" height="100%">
                <ComposedChart data={serie} margin={PANEL_MARGIN}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="label" tick={false} axisLine={false} height={0} />
                  <YAxis {...axisProps} tickFormatter={(v) => `${v}%`} width={PANEL_Y_WIDTH} domain={[0, "auto"]} />
                  <Tooltip content={<HistTooltip />} cursor={{ fill: token("muted-foreground", 0.08) }} />
                  <Legend {...legendProps} />
                  <Line type="monotone" dataKey="pct" name="% Absenteísmo" stroke={COR.taxa} strokeWidth={2} dot={{ r: 3, fill: COR.taxa }} activeDot={{ r: 5 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="media" name="Média geral" stroke={COR.media} strokeWidth={2} strokeDasharray="5 3" dot={false} activeDot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            }
            apoio={
              <ResponsiveContainer key={`hist-efetivo-${ano}-${mes}`} width="100%" height="100%">
                <ComposedChart data={serie} margin={PANEL_MARGIN}>
                  <CartesianGrid {...gridProps} />
                  <XAxis {...axisProps} dataKey="label" tickMargin={8} />
                  <YAxis {...axisProps} tickFormatter={(v) => num(v)} width={PANEL_Y_WIDTH} />
                  <Tooltip content={<HistTooltip />} cursor={{ fill: token("muted-foreground", 0.08) }} />
                  <Bar dataKey="efetivo" name="Colaboradores" radius={[5, 5, 0, 0]} maxBarSize={46} isAnimationActive={false}>
                    {serie.map((d, i) => <Cell key={i} fill={COR.contexto} fillOpacity={d.parcial ? 0.55 : 1} />)}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            }
          />
        )}
      </Secao>

      {/* Gráfico diário */}
      <Secao titulo={`Faltas por dia — ${periodoLabel}`}>
        {loading ? (
          <Skeleton className="h-52 w-full md:h-72" />
        ) : dias.length === 0 ? (
          <EmptyState icon={CalendarX} title="Sem faltas no período" />
        ) : (
          <div className="h-52 md:h-72">
            <ResponsiveContainer key={`dia-${ano}-${mes}`} width="100%" height="100%">
              <ComposedChart data={dias} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis {...axisProps} dataKey="dia" tick={{ ...axisProps.tick, fontSize: 10 }} tickFormatter={(d) => String(d).slice(0, 5)} tickMargin={8} interval="preserveStartEnd" />
                <YAxis {...axisProps} yAxisId="left" width={36} />
                <YAxis {...axisProps} yAxisId="right" orientation="right" tickFormatter={(v) => `${v}%`} width={40} />
                <Tooltip content={<DiaTooltip />} cursor={{ fill: token("muted-foreground", 0.08) }} />
                <Legend {...legendProps} />
                <Bar yAxisId="left" dataKey="faltas" name="Faltas" fill={COR.faltas} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                <Line yAxisId="right" type="monotone" dataKey="pctAbs" name="% absenteísmo" stroke={COR.taxa} strokeWidth={2} dot={{ r: 2, fill: COR.taxa }} activeDot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </Secao>

      {/* Ranking por gerente */}
      <Secao titulo={`Faltas por gerente — ${periodoLabel}`} semPadding>
        <RankFaltas
          items={gerentes.map(g => ({ ...g, onClick: () => { setDGerente(g.label); setDSupervisor(null); setDColab(null); } }))}
          loading={loading}
          labelHead="Gerente"
          emptyText="Sem faltas no período"
        />
      </Secao>

      <p className="text-xs text-muted-foreground">
        <b>% Absenteísmo</b> = HH perdido ÷ HH disponível. <b>HH disponível</b> = soma, por dia útil (seg–sex), dos colaboradores ativos no dia × 8h — efetivo real via <span className="font-mono">TFPFUN.DTADM/DTDEM</span> (não conta demitidos/futuros; feriados não descontados). Faltas: view <span className="font-mono">AD_VFALTA</span>. Ranking por <b>AD_GERENTE</b> → supervisores → colaboradores → dias.
        {sup != null && <> <b>Apenas meus colaboradores</b>: faltas e efetivo só de quem tem você como supervisor no cadastro hoje (<span className="font-mono">TFPFUN.USUVPJSUP</span>) — em meses passados, a equipe atual.</>}
      </p>

      {/* Drill-down */}
      <Dialog open={dGerente !== null} onOpenChange={(v) => { if (!v) fecharModal(); }}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dColab ? `Faltas — ${dColab.nome} · ${periodoLabel}`
                : dSupervisor ? `Colaboradores — ${dSupervisor} · ${periodoLabel}`
                : `Supervisores — ${dGerente ?? ""} · ${periodoLabel}`}
            </DialogTitle>
          </DialogHeader>

          {dColab ? (
            /* Nível 3: dias da falta */
            <div>
              <button type="button" onClick={() => setDColab(null)} className={botaoVoltar}>
                <ChevronLeft className="h-3.5 w-3.5" /> Voltar aos colaboradores
              </button>
              <div className="max-h-[60vh] overflow-auto rounded-md border border-border scrollbar-slim">
                <table className="w-full min-w-[22.5rem] text-sm">
                  <thead className={THEAD_CLS}>
                    <tr className={THEAD_TR}>
                      <th className={TH}>Dia da falta</th>
                      <th className={cn(TH, "text-right")}>HH perdido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diaLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className={zebra(i)}>
                          {Array.from({ length: 2 }).map((__, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-3" /></td>)}
                        </tr>
                      ))
                    ) : diaRows.length === 0 ? (
                      <tr><td colSpan={2}><EmptyState icon={CalendarX} title="Sem faltas no período" /></td></tr>
                    ) : diaRows.map((r, i) => (
                      <tr key={i} className={cn("border-t border-border/60", zebra(i))}>
                        <td className="px-3 py-2 font-medium tabular text-foreground">{r.dia}</td>
                        <td className="px-3 py-2 text-right tabular text-muted-foreground">{fmtHoras(r.hh)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {!diaLoading && diaRows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                        <td className="px-3 py-2">{diaRows.length} {diaRows.length === 1 ? "falta" : "faltas"}</td>
                        <td className="px-3 py-2 text-right tabular">{fmtHoras(diaTotHH)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          ) : dSupervisor ? (
            /* Nível 2: colaboradores */
            <div>
              <button type="button" onClick={() => setDSupervisor(null)} className={botaoVoltar}>
                <ChevronLeft className="h-3.5 w-3.5" /> Voltar aos supervisores
              </button>
              <div className="overflow-hidden rounded-md border border-border">
                <RankFaltas items={funcRows} loading={funcLoading} labelHead="Colaborador" emptyText="Sem faltas para este supervisor" showFaltantes={false} maxH="58vh" />
              </div>
            </div>
          ) : (
            /* Nível 1: supervisores */
            <div className="overflow-hidden rounded-md border border-border">
              <RankFaltas items={supRows} loading={supLoading} labelHead="Supervisor" emptyText="Sem faltas para este gerente" maxH="58vh" />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Análise do mês: top faltantes + reincidência */}
      <Dialog open={analiseOpen} onOpenChange={setAnaliseOpen}>
        <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{`Análise do mês — ${periodoLabel}`}</DialogTitle>
          </DialogHeader>
          <div className="text-xs text-muted-foreground">
            Colaboradores que mais registraram falta em {periodoLabel}, com gerente/supervisor, e a <b>reincidência</b> nos últimos 6 meses (nº de faltas por mês).
            {topRows.length > TOP_N && <> Exibindo o top {TOP_N} de {num(topRows.length)}.</>}
          </div>
          <div className="max-h-[68vh] overflow-auto rounded-md border border-border scrollbar-slim">
            <table className="w-full min-w-[57.5rem] text-sm">
              <thead className={THEAD_CLS}>
                <tr className={THEAD_TR}>
                  <th className={TH}>#</th>
                  <th className={TH}>Colaborador</th>
                  <th className={TH}>Gerente</th>
                  <th className={TH}>Supervisor</th>
                  <th className={cn(TH, "border-l border-border text-right")}>Faltas mês</th>
                  {mesesHist.map(mh => (
                    <th key={mh.key} className={cn("whitespace-nowrap border-l border-border px-2 py-2 text-right font-medium", mh.ano === ano && mh.mes === mes && "text-primary")}>{mh.label}</th>
                  ))}
                  <th className={cn(TH, "border-l border-border text-right")}>Total 6m</th>
                </tr>
              </thead>
              <tbody>
                {analiseLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className={zebra(i)}>
                      {Array.from({ length: 6 + mesesHist.length }).map((__, j) => <td key={j} className="px-3 py-2.5"><Skeleton className="h-3" /></td>)}
                    </tr>
                  ))
                ) : topRows.length === 0 ? (
                  <tr><td colSpan={6 + mesesHist.length}><EmptyState icon={CalendarX} title="Sem faltas no período" /></td></tr>
                ) : (
                  topRows.slice(0, TOP_N).map((r, i) => {
                    const rec = reincMap.get(r.codfunc) || {};
                    const total6 = mesesHist.reduce((a, mh) => a + (rec[mh.key] || 0), 0);
                    return (
                      <tr key={r.codfunc} className={cn("border-t border-border/60 transition-colors hover:bg-muted", zebra(i))}>
                        <td className="px-3 py-2 tabular text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="flex flex-col">
                            <span className="font-medium leading-tight text-foreground">{r.nome || "—"}</span>
                            <span className="text-2xs text-muted-foreground">#{r.codfunc}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.gerente}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.supervisor}</td>
                        <td className="border-l border-border px-3 py-2 text-right font-semibold tabular text-primary">{num(r.faltas)}</td>
                        {mesesHist.map(mh => {
                          const c = rec[mh.key] || 0;
                          const cls = c === 0 ? "text-muted-foreground" : c >= 3 ? "text-destructive font-semibold" : c === 2 ? "text-warning font-medium" : "text-foreground";
                          return <td key={mh.key} className={cn("border-l border-border/60 px-2 py-2 text-right tabular", cls, mh.ano === ano && mh.mes === mes && "bg-muted")}>{c || "—"}</td>;
                        })}
                        <td className="border-l border-border px-3 py-2 text-right font-semibold tabular text-foreground">{num(total6)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="text-2xs text-muted-foreground">
            Reincidência: <span className="font-medium text-foreground">preto</span> = 1 falta · <span className="font-medium text-warning">âmbar</span> = 2 · <span className="font-medium text-destructive">vermelho</span> = 3+ no mês. Coluna destacada = mês selecionado.
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
