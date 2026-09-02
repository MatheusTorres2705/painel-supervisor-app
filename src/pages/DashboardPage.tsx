// src/pages/DashboardPage.tsx
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Award,
  Clock3,
  Factory,
  Gauge,
  RefreshCw,
  Users,
} from "lucide-react";
import { mockKpis } from "@/lib/mock";
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
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/patterns/PageHeader";
import { StatCard } from "@/components/patterns/StatCard";
import { AsyncBoundary } from "@/components/patterns/AsyncBoundary";
import { DataDialog } from "@/components/patterns/DataDialog";
import {
  axisProps,
  chartSemantic,
  gridProps,
  legendProps,
  seriesColor,
  tooltipProps,
  token,
} from "@/lib/chartTheme";


/* =================== Types =================== */
type BarColab = {
  codfunc: number;
  name: string;
  hh: number;
};

type DetAtividade = {
  descrprod: string;
  dtexecucao: string;
  hh: number;
};

type SeniorCompareBar = {
  nivel: "I" | "II" | "III";
  label: string;
  atual: number;
  previsto: number;
  diff: number;
  pct: number | null;
};

type SeniorColab = {
  codfunc: number;
  nomefunc: string;
  nivel: "I" | "II" | "III";
};

type FaltaItem = {
  chassi: string;
  codprod: number;
  descrprod: string;
  necessidade: string;
  dataEntrega: string;
};

type RetrabItem = {
  setor: string;
  atividade: string;
  hh: number;
};

/* =================== Helpers =================== */
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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function nowYearMonth() {
  const d = new Date();
  return { year: String(d.getFullYear()), month: String(d.getMonth() + 1) }; // month 1..12
}

function monthYearLabel(monthNum: string, year: string) {
  const mm = pad2(Number(monthNum || 1));
  return `${mm}/${year}`;
}

/* =================== Gauge (Velocímetro) =================== */
// SVG puro num único sistema de coordenadas. A versão anterior sobrepunha um
// <svg> com viewBox fixo sobre um <PieChart> responsivo, e a agulha saía do arco.

const GAUGE = { cx: 100, cy: 104, r: 76, stroke: 16 } as const;

/** Valor 0..100 -> ângulo em graus (180 = esquerda, 0 = direita). */
const gaugeAngle = (v: number) => 180 - 1.8 * clamp(v, 0, 100);

function polar(angleDeg: number, radius: number) {
  const rad = (Math.PI / 180) * angleDeg;
  return {
    x: GAUGE.cx + radius * Math.cos(rad),
    y: GAUGE.cy - radius * Math.sin(rad),
  };
}

/** Caminho de arco entre dois valores da escala. */
function arcPath(from: number, to: number) {
  const a = polar(gaugeAngle(from), GAUGE.r);
  const b = polar(gaugeAngle(to), GAUGE.r);
  const large = Math.abs(gaugeAngle(from) - gaugeAngle(to)) > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${GAUGE.r} ${GAUGE.r} 0 ${large} 1 ${b.x} ${b.y}`;
}

const SpeedometerGauge = ({
  value,
  max = 100,
  title,
}: {
  value: number;
  max?: number;
  title?: string;
}) => {
  const v = clamp(value, 0, max);
  const shown = Math.round(max > 0 ? (v / max) * 100 : 0);

  const status =
    shown >= 90 ? "Excelente" : shown >= 80 ? "Boa" : shown >= 70 ? "Atenção" : "Crítica";

  // Faixas: 0–70 crítica, 70–90 atenção, 90–100 excelente.
  const bands = [
    { from: 0, to: 70, color: chartSemantic.danger },
    { from: 70, to: 90, color: chartSemantic.warning },
    { from: 90, to: 100, color: chartSemantic.success },
  ];

  const needle = polar(gaugeAngle(shown), GAUGE.r - GAUGE.stroke / 2 - 6);

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2"
      role="img"
      aria-label={`${title ?? "Indicador"}: ${shown}% — ${status}. Meta: 90%.`}
    >
      {title ? (
        <div className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </div>
      ) : null}

      <svg
        viewBox="0 0 200 124"
        className="w-full max-w-[280px]"
        aria-hidden="true"
      >
        {bands.map((b) => (
          <path
            key={b.from}
            d={arcPath(b.from, b.to)}
            fill="none"
            stroke={b.color}
            strokeWidth={GAUGE.stroke}
            strokeLinecap="butt"
          />
        ))}

        {/* Marca da meta (90%) */}
        <line
          {...(() => {
            const a = polar(gaugeAngle(90), GAUGE.r - GAUGE.stroke / 2);
            const b = polar(gaugeAngle(90), GAUGE.r + GAUGE.stroke / 2);
            return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
          })()}
          stroke={token("card")}
          strokeWidth="2"
        />

        <line
          x1={GAUGE.cx}
          y1={GAUGE.cy}
          x2={needle.x}
          y2={needle.y}
          stroke={token("foreground")}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle
          cx={GAUGE.cx}
          cy={GAUGE.cy}
          r="6"
          fill={token("foreground")}
        />
        <circle cx={GAUGE.cx} cy={GAUGE.cy} r="2.5" fill={token("card")} />
      </svg>

      <div className="-mt-2 text-center">
        <div className="tabular text-3xl font-semibold text-foreground">
          {shown}%
        </div>
        <div className="mt-0.5 text-2xs text-muted-foreground">{status}</div>
      </div>

      <div className="text-2xs text-muted-foreground">
        Meta: 90% • Atual: <span className="tabular">{shown}%</span>
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const { user } = useAuth();
  const data = mockKpis();

  const CODUSU_LOGADO = (user as any)?.codusu ?? 134;

  // ================== FILTROS GLOBAIS (topo) ==================
  const initial = useMemo(() => nowYearMonth(), []);
  const [fAno, setFAno] = useState<string>(initial.year);
  const [fMes, setFMes] = useState<string>(initial.month);

  const [anoSel, setAnoSel] = useState<string>(initial.year);
  const [mesSel, setMesSel] = useState<string>(initial.month);

  const MMYYYY_LABEL = useMemo(() => monthYearLabel(mesSel, anoSel), [mesSel, anoSel]);
  const MMYYYY_PAD = useMemo(() => `${pad2(Number(mesSel))}/${anoSel}`, [mesSel, anoSel]);

  const aplicarFiltros = () => {
    const y = String(fAno || "").trim();
    const m = String(fMes || "").trim();

    const yOk = /^\d{4}$/.test(y) ? y : String(new Date().getFullYear());
    const mNum = Number(m);
    const mOk =
      Number.isFinite(mNum) && mNum >= 1 && mNum <= 12
        ? String(mNum)
        : String(new Date().getMonth() + 1);

    setAnoSel(yOk);
    setMesSel(mOk);

    setFAno(yOk);
    setFMes(mOk);
  };

  const irParaHoje = () => {
    const n = nowYearMonth();
    setFAno(n.year);
    setFMes(n.month);
    setAnoSel(n.year);
    setMesSel(n.month);
  };

  // ================== ESTADOS ==================
  const [avancoReal, setAvancoReal] = useState<number>(0);
  const [avancoLoading, setAvancoLoading] = useState<boolean>(true);
  const [avancoErro, setAvancoErro] = useState<string | null>(null);

  const [barData, setBarData] = useState<BarColab[]>([]);
  const [barLoading, setBarLoading] = useState(true);
  const [barErro, setBarErro] = useState<string | null>(null);

  const [detOpen, setDetOpen] = useState(false);
  const [detColab, setDetColab] = useState<{ codfunc: number; name: string } | null>(null);
  const [detLoading, setDetLoading] = useState(false);
  const [detErro, setDetErro] = useState<string | null>(null);
  const [detRows, setDetRows] = useState<DetAtividade[]>([]);

  const [faltQtd, setFaltQtd] = useState<number>(0);
  const [faltLoading, setFaltLoading] = useState<boolean>(true);
  const [faltErro, setFaltErro] = useState<string | null>(null);

  const [faltOpen, setFaltOpen] = useState(false);
  const [faltListLoading, setFaltListLoading] = useState(false);
  const [faltListErro, setFaltListErro] = useState<string | null>(null);
  const [faltRows, setFaltRows] = useState<FaltaItem[]>([]);

  const [retrHH, setRetrHH] = useState<number>(0);
  const [retrLoading, setRetrLoading] = useState<boolean>(true);
  const [retrErro, setRetrErro] = useState<string | null>(null);

  const [retrOpen, setRetrOpen] = useState(false);
  const [retrListLoading, setRetrListLoading] = useState(false);
  const [retrListErro, setRetrListErro] = useState<string | null>(null);
  const [retrRows, setRetrRows] = useState<RetrabItem[]>([]);

  const [assValue] = useState<number>(87); // mock por enquanto

  const [seniorData, setSeniorData] = useState<SeniorCompareBar[]>([]);
  const [seniorLoading, setSeniorLoading] = useState(true);
  const [seniorErro, setSeniorErro] = useState<string | null>(null);

  // ===== Modal: Colaboradores por nível =====
  const [seniorNivelOpen, setSeniorNivelOpen] = useState(false);
  const [seniorNivelSel, setSeniorNivelSel] = useState<"I" | "II" | "III" | null>(null);
  const [seniorNivelLoading, setSeniorNivelLoading] = useState(false);
  const [seniorNivelErro, setSeniorNivelErro] = useState<string | null>(null);
  const [seniorNivelRows, setSeniorNivelRows] = useState<SeniorColab[]>([]);

  const CODDEP_ALVO = 101040600;

  // ================== Avanço: KPI REAL (ERP) ==================
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setAvancoLoading(true);
        setAvancoErro(null);

        const CODUSU_SUP = Number(CODUSU_LOGADO);

        const sql = `
          SELECT ROUND(avg(TRUNC(AVG(T.AVANCO))),2) AS REAL
          FROM (
            SELECT DISTINCT
              (SELECT DISTINCT MAX(DATA)
                 FROM AD_APOAVANCO AVO
                 JOIN AD_COMPONENTECRONO CRO2
                   ON CRO2.SEQ = AVO.SEQ
                  AND AVO.CODUSU = CRO2.CODUSU
                  AND AVO.CODPRODSP = CRO2.CODPRODSP
                WHERE AVO.SEQ = DET.SEQ
                  AND AVO.CODUSU = USU.CODUSU
                  AND RETRABALHO = 'S') AS DTRETRABALHO,
              Snk_Dividir(
                ONE_NUMEROSUPPROD_PREV_DATA(USU.CODUSU , DET.SEQ, sysdate),
                ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
              ) * 100 AS PREVISTO,
              nvl((LOT.CONTROLEPA) , 'Ordem não Lancada') AS BARCO,
              GRU.NOMEGRUPO AS MACROSETOR,
              USU.CODGRUPO AS SETOR,
              USU.NOMEUSU,
              DET.CODUSU,
              CASE
                WHEN Snk_Dividir(
                  ONE_NUMEROSUPPROD_REA(USU.CODUSU , DET.SEQ),
                  ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
                ) * 100 > 100 THEN 100
                ELSE Snk_Dividir(
                  ONE_NUMEROSUPPROD_REA(USU.CODUSU , DET.SEQ),
                  ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
                ) * 100
              END AS AVANCO,
              DET.DTINICIOPREV,
              DET.DTFIMPREV,
              (SELECT MAX(DATA) FROM AD_APOAVANCO WHERE CODUSU = USU.CODUSU AND SEQ = DET.SEQ ) AS ULTAPO,
              ONE_NUMEROSUPPROD_PREV(DET.CODUSU , DET.SEQ) as AvPrev,
              ONE_NUMEROSUPPROD_REA(DET.CODUSU , DET.SEQ) as AvReal,
              DET.SEQ,
              PROC.IDIPROC,
              CASE
                WHEN PAI.AD_CODGRUPOPROD IN (020100,020200,020300,020400,021000) THEN 'NX 260-290'
                WHEN PAI.AD_CODGRUPOPROD IN (020800,021400) THEN 'NX 340-350'
                WHEN PAI.AD_CODGRUPOPROD IN (020500,020600) THEN 'NX 360-370'
                WHEN PAI.AD_CODGRUPOPROD IN (020700,021300) THEN 'NX 410'
                WHEN PAI.AD_CODGRUPOPROD IN (021200) THEN 'NX 440'
                WHEN PAI.AD_CODGRUPOPROD IN (020900,021100) THEN 'NX 500'
                ELSE GRU2.DESCRGRUPOPROD
              END AS DESCRGRUPOPROD,
              PRJ.CODPROJ,
              PRJ.IDENTIFICACAO,
              PAR.CODPARC,
              PAR.NOMEPARC
            FROM AD_CRONOGRAMA CRO
            JOIN TGFGRU GRU2 ON GRU2.CODGRUPOPROD = CRO.CODGRUPOPROD
            JOIN TPRIPROC PROC ON PROC.AD_CODPROJ = CRO.CODPROJ AND PROC.STATUSPROC <> 'C'
            JOIN TPRIPA LOT ON LOT.IDIPROC = PROC.IDIPROC
            JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
            JOIN TSIUSU USU ON USU.CODUSU = DET.CODUSU
            JOIN TSIGRU GRU ON GRU.CODGRUPO = USU.CODGRUPO
            JOIN TCSPRJ PRJ ON CRO.CODPROJ = PRJ.CODPROJ
            JOIN TCSPRJ PAI ON PAI.CODPROJ = PRJ.CODPROJPAI
            LEFT JOIN TGFCAB CAB ON PRJ.CODPROJ = CAB.CODPROJ AND CAB.TIPMOV ='P'
            LEFT JOIN TGFPAR PAR ON PAR.CODPARC = CAB.CODPARC
            WHERE CRO.ANO = '${anoSel}'
              AND CRO.MES = '${mesSel}'
              AND PAI.AD_CODSUPERVISOR = ${CODUSU_SUP}
          ) T
          GROUP BY T.IDIPROC , T.BARCO , T.SEQ , T.DESCRGRUPOPROD, T.CODPROJ, T.IDENTIFICACAO, T.CODPARC, T.NOMEPARC
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const real = Number(rows?.[0]?.REAL ?? 0);
        setAvancoReal(Number.isFinite(real) ? real : 0);
      } catch (e: any) {
        console.error("[DashboardPage] Erro ao carregar avanço (REAL):", e);
        if (!cancel) setAvancoErro(e?.message || "Falha ao carregar o avanço da linha.");
      } finally {
        if (!cancel) setAvancoLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [CODUSU_LOGADO, anoSel, mesSel]);

  // ================== Detalhamento do colaborador (sem filtro de mês por enquanto) ==================
  async function carregarDetalhe(codfunc: number, name: string) {
    try {
      setDetLoading(true);
      setDetErro(null);
      setDetRows([]);

      const sql = `
        SELECT
          PRO.DESCRPROD,
          APO.DTEXECUCAO,
          Snk_Dividir(APO.QTD, 60) AS HH
        FROM AD_DETALCRONOGRAMAFUNC APO
        JOIN TFPFUN FUN ON FUN.CODFUNC = APO.CODFUNC
        JOIN TGFPRO PRO ON PRO.CODPROD = APO.CODPRODSP
        --WHERE FUN.CODFUNC = ${Number(codfunc)}
        ORDER BY APO.DTEXECUCAO DESC
      `.trim();

      const rows = await obterReg(sql);

      const list: DetAtividade[] = (rows || []).map((r: any) => ({
        descrprod: String(r.DESCRPROD ?? ""),
        dtexecucao: String(r.DTEXECUCAO ?? ""),
        hh: Number(r.HH ?? 0),
      }));

      setDetColab({ codfunc, name });
      setDetRows(list);
      setDetOpen(true);
    } catch (e: any) {
      console.error("[DashboardPage] Erro ao carregar detalhe do colaborador:", e);
      setDetErro(e?.message || "Falha ao carregar o detalhamento do colaborador.");
      setDetOpen(true);
    } finally {
      setDetLoading(false);
    }
  }

  // ================== Materiais faltantes (count) ==================
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setFaltLoading(true);
        setFaltErro(null);

        const sql = `
          SELECT COUNT(*) AS QTD
          FROM CND_ONE_LISTA_FALTA F
          JOIN TGFPRO PRO ON PRO.CODPROD = F.CODPROD
          LEFT JOIN AD_LISTADEFALTAMOT MOT
            ON MOT.CODPROD = F.CODPROD
           AND MOT.MES = F.MES
           AND MOT.CHASSI = F.NROLOTE
          LEFT JOIN VW_NX_LISTAFALTA_DATAPREV DTP
            ON DTP.CODPROD = F.CODPROD
           AND DTP.NUNOTAFALT = F.NUNOTA
           AND F.IDIPROC = DTP.IDIPROC
          LEFT JOIN TGFPAR PAR
            ON PAR.CODPARC = PRO.CODPARCFORN
          LEFT JOIN TGFVEN VEN
            ON VEN.CODVEND = PAR.CODVEND
          LEFT JOIN TGFCAB CAB
            ON CAB.NUNOTA = F.NUNOTA
          LEFT JOIN TGFNAT NAT
            ON NAT.CODNAT = CAB.CODNAT
          LEFT JOIN AD_DETALCRONOGRAMA DET
            ON DET.SEQ = F.SEQ
           AND DET.CODUSU = NAT.AD_SETOR
          LEFT JOIN TGFCAB C
            ON C.NUNOTA = F.NUNOTA
          LEFT JOIN TGFITE I
            ON I.NUNOTA = F.NUNOTA
           AND I.SEQUENCIA = F.SEQUENCIA
          LEFT JOIN AD_CRONOGRAMA CRO
            ON CRO.SEQ = F.SEQ
          LEFT JOIN TCSPRJ PRJ
            ON PRJ.CODPROJ = CRO.CODPROJ
          LEFT JOIN TCSPRJ PAI
            ON PAI.CODPROJ = PRJ.CODPROJPAI
          LEFT JOIN TSIUSU USU
            ON USU.CODUSU = PAI.AD_CODSUPERVISOR
          WHERE
            F.SALDO_FINAL < 0
            AND F.ANO IN ('${anoSel}')
            AND F.MES IN ('${String(Number(mesSel))}')
            AND PAI.AD_CODSUPERVISOR = ${Number(CODUSU_LOGADO)}
            AND NVL(PRO.CODCONFKIT, 0) = 0
            AND NOT PRO.CODPROD IN (
              21740,14044,328,19959,9587,21757,21756,14048,14045,18731,18210,
              5725,10190,4772,10191,14047,4969,9588,18211,9589,2580,1414,
              1954,5775,2680,3038,17775,9884,18174,19333,1593,1831,14102,19712
            )
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const qtd = Number(rows?.[0]?.QTD ?? 0);
        setFaltQtd(Number.isFinite(qtd) ? qtd : 0);
      } catch (e: any) {
        console.error("[DashboardPage] Erro ao carregar materiais faltantes (count):", e);
        if (!cancel) setFaltErro(e?.message || "Falha ao carregar materiais faltantes.");
      } finally {
        if (!cancel) setFaltLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [CODUSU_LOGADO, anoSel, mesSel]);

  // ================== Materiais faltantes: modal/lista ==================
  async function abrirFaltantes() {
    setFaltOpen(true);
    if (faltRows.length > 0) return;

    try {
      setFaltListLoading(true);
      setFaltListErro(null);
      setFaltRows([]);

      const sql = `
        SELECT
          F.NROLOTE AS CHASSI,
          PRO.CODPROD AS CODPROD,
          PRO.DESCRPROD AS DESCRPROD,
          F.NECESSIDADE AS NECESSIDADE,
          DTP.DATA_ENTREGA AS DATA_ENTREGA
        FROM CND_ONE_LISTA_FALTA F
        JOIN TGFPRO PRO ON PRO.CODPROD = F.CODPROD
        LEFT JOIN AD_LISTADEFALTAMOT MOT
          ON MOT.CODPROD = F.CODPROD
         AND MOT.MES = F.MES
         AND MOT.CHASSI = F.NROLOTE
        LEFT JOIN VW_NX_LISTAFALTA_DATAPREV DTP
          ON DTP.CODPROD = F.CODPROD
         AND DTP.NUNOTAFALT = F.NUNOTA
         AND F.IDIPROC = DTP.IDIPROC
        LEFT JOIN TGFPAR PAR
          ON PAR.CODPARC = PRO.CODPARCFORN
        LEFT JOIN TGFVEN VEN
          ON VEN.CODVEND = PAR.CODVEND
        LEFT JOIN TGFCAB CAB
          ON CAB.NUNOTA = F.NUNOTA
        LEFT JOIN TGFNAT NAT
          ON NAT.CODNAT = CAB.CODNAT
        LEFT JOIN AD_DETALCRONOGRAMA DET
          ON DET.SEQ = F.SEQ
         AND DET.CODUSU = NAT.AD_SETOR
        LEFT JOIN TGFCAB C
          ON C.NUNOTA = F.NUNOTA
        LEFT JOIN TGFITE I
          ON I.NUNOTA = F.NUNOTA
         AND I.SEQUENCIA = F.SEQUENCIA
        LEFT JOIN AD_CRONOGRAMA CRO
          ON CRO.SEQ = F.SEQ
        LEFT JOIN TCSPRJ PRJ
          ON PRJ.CODPROJ = CRO.CODPROJ
        LEFT JOIN TCSPRJ PAI
          ON PAI.CODPROJ = PRJ.CODPROJPAI
        LEFT JOIN TSIUSU USU
          ON USU.CODUSU = PAI.AD_CODSUPERVISOR
        WHERE
          F.SALDO_FINAL < 0
          AND F.ANO IN ('${anoSel}')
          AND F.MES IN ('${String(Number(mesSel))}')
          AND PAI.AD_CODSUPERVISOR = ${Number(CODUSU_LOGADO)}
          AND NVL(PRO.CODCONFKIT, 0) = 0
          AND NOT PRO.CODPROD IN (
            21740,14044,328,19959,9587,21757,21756,14048,14045,18731,18210,
            5725,10190,4772,10191,14047,4969,9588,18211,9589,2580,1414,
            1954,5775,2680,3038,17775,9884,18174,19333,1593,1831,14102,19712
          )
        ORDER BY 1
      `.trim();

      const rows = await obterReg(sql);

      const list: FaltaItem[] = (rows || []).map((r: any) => ({
        chassi: String(r.CHASSI ?? ""),
        codprod: Number(r.CODPROD ?? 0),
        descrprod: String(r.DESCRPROD ?? ""),
        necessidade: String(r.NECESSIDADE ?? ""),
        dataEntrega: String(r.DATA_ENTREGA ?? ""),
      }));

      setFaltRows(list);
    } catch (e: any) {
      console.error("[DashboardPage] Erro ao carregar lista de faltantes:", e);
      setFaltListErro(e?.message || "Falha ao carregar a lista de materiais faltantes.");
    } finally {
      setFaltListLoading(false);
    }
  }

  // ================== Retrabalho: total (mês/ano selecionado) ==================
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setRetrLoading(true);
        setRetrErro(null);

        const sql = `
          SELECT SUM(APO.QTD) / 60 AS QTD
          FROM AD_CRONOGRAMA CRO
          JOIN AD_COMPONENTECRONO APO ON CRO.SEQ = APO.SEQ 
          JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ 
          JOIN TCSPRJ PAI ON PAI.CODPROJ = PRJ.CODPROJPAI
          JOIN AD_APOAVANCO AV 
            ON AV.SEQ = APO.SEQ 
           AND AV.CODUSU = APO.CODUSU 
           AND AV.CODPRODSP = APO.CODPRODSP
          WHERE PAI.AD_CODSUPERVISOR = ${Number(CODUSU_LOGADO)}
            AND APO.FEITO = 'S'
            AND APO.RETRABALHO = 'S'
            AND TO_CHAR(AV.DATA , 'MM/YYYY') = '${MMYYYY_PAD}'
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const hh = Number(rows?.[0]?.QTD ?? 0);
        setRetrHH(Number.isFinite(hh) ? hh : 0);
      } catch (e: any) {
        console.error("[DashboardPage] Erro ao carregar retrabalho (total):", e);
        if (!cancel) setRetrErro(e?.message || "Falha ao carregar o retrabalho total.");
      } finally {
        if (!cancel) setRetrLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [CODUSU_LOGADO, MMYYYY_PAD]);

  async function abrirRetrabalho() {
    setRetrOpen(true);
    if (retrRows.length > 0) return;

    try {
      setRetrListLoading(true);
      setRetrListErro(null);
      setRetrRows([]);

      const sql = `
        SELECT 
          USU.NOMEUSU AS SETOR,
          PRO.DESCRPROD AS ATIVIDADE,
          Snk_Dividir(APO.QTD, 60) AS HH
        FROM AD_CRONOGRAMA CRO
        JOIN AD_COMPONENTECRONO APO ON CRO.SEQ = APO.SEQ 
        JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ 
        JOIN TCSPRJ PAI ON PAI.CODPROJ = PRJ.CODPROJPAI
        JOIN AD_APOAVANCO AV 
          ON AV.SEQ = APO.SEQ 
         AND AV.CODUSU = APO.CODUSU 
         AND AV.CODPRODSP = APO.CODPRODSP
        JOIN TGFPRO PRO ON PRO.CODPROD = APO.CODPRODSP
        JOIN TSIUSU USU ON USU.CODUSU = APO.CODUSU 
        WHERE PAI.AD_CODSUPERVISOR = ${Number(CODUSU_LOGADO)}
          AND APO.FEITO = 'S'
          AND APO.RETRABALHO = 'S'
          AND TO_CHAR(AV.DATA , 'MM/YYYY') = '${MMYYYY_PAD}'
        ORDER BY 1
      `.trim();

      const rows = await obterReg(sql);

      const list: RetrabItem[] = (rows || []).map((r: any) => ({
        setor: String(r.SETOR ?? ""),
        atividade: String(r.ATIVIDADE ?? ""),
        hh: Number(r.HH ?? 0),
      }));

      setRetrRows(list);
    } catch (e: any) {
      console.error("[DashboardPage] Erro ao carregar detalhamento de retrabalho:", e);
      setRetrListErro(e?.message || "Falha ao carregar o detalhamento do retrabalho.");
    } finally {
      setRetrListLoading(false);
    }
  }

  // ================== Atividades por colaborador (sem filtro de mês por enquanto) ==================
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setBarLoading(true);
        setBarErro(null);

        const CODUSU_SUP = CODUSU_LOGADO;

        const sql = `
          SELECT 
            FUN.CODFUNC,
            FUN.NOMEFUNC,
            SUM(APO.QTD) AS QTD
          FROM AD_DETALCRONOGRAMAFUNC APO
          JOIN TFPFUN FUN ON FUN.CODFUNC = APO.CODFUNC
          WHERE FUN.USUVPJSUP = ${Number(CODUSU_SUP)}
          GROUP BY FUN.CODFUNC, FUN.NOMEFUNC
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const list: BarColab[] = (rows || [])
          .map((r: any) => {
            const qtdMin = Number(r.QTD ?? 0);
            const hh = Math.round((qtdMin / 60) * 10) / 10;
            return { codfunc: Number(r.CODFUNC ?? 0), name: String(r.NOMEFUNC ?? ""), hh };
          })
          .filter((x) => x.codfunc > 0)
          .sort((a, b) => b.hh - a.hh);

        setBarData(list);
      } catch (e: any) {
        console.error("[DashboardPage] Erro ao carregar gráfico de atividades:", e);
        if (!cancel)
          setBarErro(e?.message || "Falha ao carregar a representatividade por colaborador.");
      } finally {
        if (!cancel) setBarLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [CODUSU_LOGADO]);

  // ================== Pirâmide de senioridade (sem filtro de mês por enquanto) ==================
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setSeniorLoading(true);
        setSeniorErro(null);

        const CODUSU_SUP = CODUSU_LOGADO;

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
            WHERE FUN.USUVPJSUP = ${Number(CODUSU_SUP)}
              AND FUN.SITUACAO = '1'
            GROUP BY CAR.AD_NIVEL, DEP.AD_NIVELI, DEP.AD_NIVELII, DEP.AD_NIVELIII
          )
          GROUP BY NIVEL
          ORDER BY 2 ASC
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const planned = {
          I: rows?.length ? Number(rows[0]?.I ?? 0) : 0,
          II: rows?.length ? Number(rows[0]?.II ?? 0) : 0,
          III: rows?.length ? Number(rows[0]?.III ?? 0) : 0,
        };

        const atualMap: Record<"I" | "II" | "III", number> = { I: 0, II: 0, III: 0 };
        for (const r of rows || []) {
          const n = normalizeNivel(r?.NIVEL);
          if (!n) continue;
          atualMap[n] += Number(r?.QTD ?? 0);
        }

        const order: ("III" | "II" | "I")[] = ["III", "II", "I"];

        const list: SeniorCompareBar[] = order.map((n) => {
          const atual = atualMap[n];
          const previsto = planned[n];
          const diff = atual - previsto;
          const pct = previsto > 0 ? atual / previsto : null;
          return { nivel: n, label: nivelLabel(n), atual, previsto, diff, pct };
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
  }, [CODUSU_LOGADO]);

  // ================== Colaboradores por nível (clique na pirâmide) ==================
  async function abrirColaboradoresNivel(nivel: "I" | "II" | "III") {
    setSeniorNivelOpen(true);
    setSeniorNivelSel(nivel);

    // se já tiver carregado esse nível e quiser evitar nova consulta:
    // if (seniorNivelRows.length > 0 && seniorNivelSel === nivel) return;

    try {
      setSeniorNivelLoading(true);
      setSeniorNivelErro(null);
      setSeniorNivelRows([]);

      const CODUSU_SUP = Number(CODUSU_LOGADO);

      const sql = `
        SELECT 
          FUN.CODFUNC,
          FUN.NOMEFUNC,
          CAR.AD_NIVEL
        FROM TFPFUN FUN
        JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
        JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
        WHERE FUN.USUVPJSUP = ${Number(CODUSU_SUP)}
          AND FUN.SITUACAO = '1'
          AND CAR.AD_NIVEL = '${nivel}'
        ORDER BY FUN.NOMEFUNC
      `.trim();

      const rows = await obterReg(sql);

      const list: SeniorColab[] = (rows || []).map((r: any) => ({
        codfunc: Number(r.CODFUNC ?? 0),
        nomefunc: String(r.NOMEFUNC ?? ""),
        nivel: (normalizeNivel(r?.AD_NIVEL) || nivel) as "I" | "II" | "III",
      }));

      setSeniorNivelRows(list);
    } catch (e: any) {
      console.error("[DashboardPage] Erro ao carregar colaboradores por nível:", e);
      setSeniorNivelErro(e?.message || "Falha ao carregar os colaboradores do nível selecionado.");
    } finally {
      setSeniorNivelLoading(false);
    }
  }

  // ================== Derived ==================
  const seniorResumo = useMemo(() => {
    const totalAtual = seniorData.reduce((acc, x) => acc + (x.atual || 0), 0);
    const totalPrev = seniorData.reduce((acc, x) => acc + (x.previsto || 0), 0);
    const diff = totalAtual - totalPrev;
    const pct = totalPrev > 0 ? totalAtual / totalPrev : null;
    return { totalAtual, totalPrev, diff, pct };
  }, [seniorData]);

  const totalDetHH = useMemo(() => {
    return Math.round(detRows.reduce((acc, x) => acc + (Number(x.hh) || 0), 0) * 10) / 10;
  }, [detRows]);

  // Os KPIs sinalizam carregamento com <Skeleton> (prop `loading` do StatCard),
  // não mais com a string "…", que era indistinguível de um dado real.
  const faltantesValue = useMemo(() => {
    if (faltErro) return "—";
    return String(faltQtd ?? 0);
  }, [faltErro, faltQtd]);

  const retrValue = useMemo(() => {
    if (retrErro) return "—";
    return `${Math.round((Number(retrHH) || 0) * 10) / 10}`;
  }, [retrErro, retrHH]);

  const retrTotalModal = useMemo(() => {
    return Math.round(retrRows.reduce((acc, r) => acc + (Number(r.hh) || 0), 0) * 10) / 10;
  }, [retrRows]);

  const avancoValue = useMemo(() => {
    if (avancoErro) return "—";
    return `${Math.round((Number(avancoReal) || 0) * 10) / 10}%`;
  }, [avancoErro, avancoReal]);

  // força recarregar listas nos modais quando mudar filtro (opcional)
  useEffect(() => {
    setFaltRows([]);
    setRetrRows([]);
  }, [anoSel, mesSel]);

  return (
    // O scroll é do AppShell; a página só empilha seu conteúdo.
    <div className="space-y-6">
      <PageHeader
        title="Visão geral"
        description={`Indicadores de operação • ${MMYYYY_LABEL}`}
        actions={
          <>
            <Button variant="outline" onClick={irParaHoje}>
              <RefreshCw className="h-4 w-4" />
              Hoje
            </Button>
            <Button onClick={aplicarFiltros}>
              <Gauge className="h-4 w-4" />
              Aplicar
            </Button>
          </>
        }
      >
        <Field label="Mês" className="w-32">
          {(p) => (
            <Select
              {...p}
              value={fMes}
              onChange={(e) => setFMes(e.target.value)}
            >
              {Array.from({ length: 12 }).map((_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {pad2(i + 1)}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Ano" className="w-28">
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={fAno}
              onChange={(e) => setFAno(e.target.value)}
              placeholder="2026"
            />
          )}
        </Field>

        <p className="ml-auto max-w-sm text-2xs text-muted-foreground">
          Avanço, faltantes e retrabalho respeitam o mês/ano selecionados.
          Atividades e senioridade ainda são gerais.
        </p>
      </PageHeader>

      {/* Linha de KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Clock3}
          label="HE disponível × consumida"
          value={`${data.he.cons} / ${data.he.disp} h`}
          detail={
            <Badge variant="warning" className="text-2xs">
              simulado
            </Badge>
          }
        />

        <StatCard
          icon={Gauge}
          label="Avanço da linha"
          value={avancoValue}
          detail={MMYYYY_LABEL}
          loading={avancoLoading}
        />

        <StatCard
          icon={Factory}
          label="Materiais faltantes"
          value={faltantesValue}
          detail={MMYYYY_LABEL}
          loading={faltLoading}
          onClick={() => abrirFaltantes()}
        />

        <StatCard
          icon={Award}
          label="Retrabalho (HH)"
          value={retrValue}
          detail={MMYYYY_LABEL}
          loading={retrLoading}
          onClick={() => abrirRetrabalho()}
        />
      </div>

      {/* Gráfico de atividades realizadas por colaborador */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Atividades realizadas por colaborador</CardTitle>
          <p className="text-2xs text-muted-foreground">
            Horas apontadas no ERP • clique numa barra para ver o detalhamento
          </p>
        </CardHeader>
        <CardContent className="h-[280px] pt-4">
          <AsyncBoundary
            loading={barLoading}
            error={barErro}
            isEmpty={barData.length === 0}
            emptyTitle="Nenhum apontamento encontrado"
            emptyDescription="Não há horas apontadas para este supervisor no período."
            emptyIcon={Users}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                margin={{ left: 12, right: 12, top: 8, bottom: 24 }}
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid {...gridProps} />
                <XAxis
                  {...axisProps}
                  dataKey="name"
                  angle={-20}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  {...axisProps}
                  tickFormatter={(v) => `${v}h`}
                  width={40}
                />
                <Tooltip
                  {...tooltipProps}
                  formatter={(value: any) => [`${value} h`, "Horas apontadas"]}
                  labelFormatter={(label) => `Colaborador: ${label}`}
                />
                <Bar
                  dataKey="hh"
                  fill={seriesColor(0)}
                  radius={[6, 6, 0, 0]}
                  onClick={(data: any) => {
                    const row: BarColab | undefined = data?.payload;
                    if (!row?.codfunc) return;
                    carregarDetalhe(row.codfunc, row.name);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          </AsyncBoundary>
        </CardContent>
      </Card>

      {/* Cards auxiliares */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Assiduidade</CardTitle>
            <p className="text-2xs text-muted-foreground">
              <Badge variant="warning" className="text-2xs">
                simulado
              </Badge>
            </p>
          </CardHeader>
          <CardContent className="h-72">
            <SpeedometerGauge
              value={assValue}
              max={100}
              title="Índice de assiduidade"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-3 pb-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <CardTitle>Senioridade — real × previsto</CardTitle>
                <p className="mt-1 text-2xs text-muted-foreground">
                  Dep. {CODDEP_ALVO} • Supervisor {CODUSU_LOGADO} • clique num
                  nível para ver os colaboradores
                </p>
              </div>

              <Badge
                variant={seniorResumo.diff >= 0 ? "success" : "destructive"}
                className="whitespace-nowrap"
              >
                {seniorResumo.diff >= 0 ? "Excedente" : "Faltam"}{" "}
                {fmtInt(Math.abs(seniorResumo.diff))} • {fmtPct(seniorResumo.pct)}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="h-[220px] pt-2">
            <AsyncBoundary
              loading={seniorLoading}
              error={seniorErro}
              isEmpty={seniorData.length === 0}
              emptyTitle="Nenhum colaborador ativo"
              emptyDescription="Não há colaboradores para o filtro atual."
              emptyIcon={Users}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={seniorData}
                  layout="vertical"
                  margin={{ top: 8, bottom: 8, left: 12, right: 12 }}
                  barCategoryGap={10}
                >
                  <CartesianGrid {...gridProps} vertical horizontal={false} />
                  <XAxis {...axisProps} type="number" allowDecimals={false} />
                  <YAxis
                    {...axisProps}
                    type="category"
                    dataKey="label"
                    width={80}
                  />
                  <Legend {...legendProps} />
                  <Tooltip
                    {...tooltipProps}
                    formatter={(value: any, name: any, ctx: any) => {
                      const nivel = ctx?.payload?.nivel as
                        | "I"
                        | "II"
                        | "III"
                        | undefined;
                      const nLabel = nivel ? nivelLabel(nivel) : "";
                      if (name === "previsto")
                        return [value, `Previsto • ${nLabel}`];
                      if (name === "atual") return [value, `Atual • ${nLabel}`];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Nível: ${label}`}
                  />

                  {/* Clique em qualquer barra abre o modal do nível. */}
                  <Bar
                    dataKey="previsto"
                    name="Previsto"
                    fill={seriesColor(3)}
                    radius={[0, 6, 6, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(data: any) => {
                      const nivel = data?.payload?.nivel as
                        | "I"
                        | "II"
                        | "III"
                        | undefined;
                      if (!nivel) return;
                      abrirColaboradoresNivel(nivel);
                    }}
                  />
                  <Bar
                    dataKey="atual"
                    name="Atual"
                    fill={seriesColor(1)}
                    radius={[0, 6, 6, 0]}
                    style={{ cursor: "pointer" }}
                    onClick={(data: any) => {
                      const nivel = data?.payload?.nivel as
                        | "I"
                        | "II"
                        | "III"
                        | undefined;
                      if (!nivel) return;
                      abrirColaboradoresNivel(nivel);
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </AsyncBoundary>
          </CardContent>

          {!seniorLoading && !seniorErro && seniorData.length > 0 ? (
            <div className="grid gap-2 px-6 pb-4 pt-0 sm:grid-cols-3">
              {seniorData.map((x) => (
                <button
                  key={x.nivel}
                  type="button"
                  onClick={() => abrirColaboradoresNivel(x.nivel)}
                  className="rounded-lg border border-border p-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="text-2xs font-medium text-foreground">
                    {x.label}
                  </div>
                  <div className="tabular mt-1 text-2xs text-muted-foreground">
                    {fmtInt(x.atual)} / {fmtInt(x.previsto)}
                  </div>
                  <div
                    className={cn(
                      "tabular text-2xs font-medium",
                      x.diff >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {x.diff >= 0 ? "+" : "−"}
                    {fmtInt(Math.abs(x.diff))} • {fmtPct(x.pct)}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </Card>
      </div>

      {/* ===== Modais de detalhamento =====
          Os quatro eram ~300 linhas da mesma estrutura; agora é um <DataDialog>. */}

      <DataDialog
        open={detOpen}
        onOpenChange={setDetOpen}
        title="Detalhamento de atividades"
        description={
          detColab ? (
            <span>
              <b>{detColab.name}</b> • CODFUNC {detColab.codfunc}
            </span>
          ) : undefined
        }
        rows={detRows}
        loading={detLoading}
        error={detErro}
        summary={`Total HH: ${Math.round(totalDetHH * 10) / 10}`}
        emptyTitle="Nenhuma atividade encontrada"
        emptyDescription="Este colaborador não tem apontamentos no período."
        columns={[
          { header: "Atividade", span: 7, cell: (r: DetAtividade) => r.descrprod },
          { header: "Data execução", span: 3, muted: true, cell: (r: DetAtividade) => r.dtexecucao },
          {
            header: "HH",
            span: 2,
            align: "right",
            cell: (r: DetAtividade) => Math.round((Number(r.hh) || 0) * 10) / 10,
          },
        ]}
      />

      <DataDialog
        open={faltOpen}
        onOpenChange={setFaltOpen}
        size="xl"
        title="Materiais faltantes"
        description={
          <span>
            Supervisor <b>{CODUSU_LOGADO}</b> • {MMYYYY_LABEL}
          </span>
        }
        rows={faltRows}
        loading={faltListLoading}
        error={faltListErro}
        summary={`Total: ${faltRows.length}`}
        emptyTitle="Nenhum material faltante"
        emptyDescription="Não há pendências de material para o filtro atual."
        onRetry={() => {
          setFaltRows([]);
          abrirFaltantes();
        }}
        rowKey={(r: FaltaItem, i) => `${r.chassi}-${r.codprod}-${i}`}
        columns={[
          { header: "Chassi", span: 2, cell: (r: FaltaItem) => r.chassi },
          { header: "Cód. Prod", span: 2, cell: (r: FaltaItem) => r.codprod },
          { header: "Descrição", span: 5, cell: (r: FaltaItem) => r.descrprod },
          { header: "Necessidade", span: 2, muted: true, cell: (r: FaltaItem) => r.necessidade },
          { header: "Entrega", span: 1, align: "right", muted: true, cell: (r: FaltaItem) => r.dataEntrega },
        ]}
      />

      <DataDialog
        open={retrOpen}
        onOpenChange={setRetrOpen}
        size="xl"
        title="Retrabalho — detalhamento"
        description={
          <span>
            Supervisor <b>{CODUSU_LOGADO}</b> • {MMYYYY_LABEL}
          </span>
        }
        rows={retrRows}
        loading={retrListLoading}
        error={retrListErro}
        summary={`Total HH: ${Math.round(retrTotalModal * 10) / 10}`}
        emptyTitle="Nenhum retrabalho encontrado"
        emptyDescription="Não há registros de retrabalho no mês/ano selecionado."
        onRetry={() => {
          setRetrRows([]);
          abrirRetrabalho();
        }}
        rowKey={(r: RetrabItem, i) => `${r.setor}-${r.atividade}-${i}`}
        columns={[
          { header: "Setor", span: 3, cell: (r: RetrabItem) => r.setor },
          { header: "Atividade", span: 7, cell: (r: RetrabItem) => r.atividade },
          {
            header: "HH",
            span: 2,
            align: "right",
            muted: true,
            cell: (r: RetrabItem) => Math.round((Number(r.hh) || 0) * 10) / 10,
          },
        ]}
      />

      <DataDialog
        open={seniorNivelOpen}
        onOpenChange={(open) => {
          setSeniorNivelOpen(open);
          if (!open) setSeniorNivelErro(null);
        }}
        title="Colaboradores por nível"
        description={
          <span>
            Supervisor <b>{CODUSU_LOGADO}</b> • Nível{" "}
            <b>{seniorNivelSel ? nivelLabel(seniorNivelSel) : "—"}</b>
          </span>
        }
        rows={seniorNivelRows}
        loading={seniorNivelLoading}
        error={seniorNivelErro}
        summary={`Total: ${seniorNivelRows.length}`}
        emptyTitle="Nenhum colaborador encontrado"
        emptyDescription="Não há colaboradores para o nível selecionado."
        emptyIcon={Users}
        onRetry={
          seniorNivelSel
            ? () => abrirColaboradoresNivel(seniorNivelSel)
            : undefined
        }
        rowKey={(r: SeniorColab, i) => `${r.codfunc}-${i}`}
        columns={[
          { header: "CODFUNC", span: 3, cell: (r: SeniorColab) => r.codfunc },
          { header: "Nome", span: 7, cell: (r: SeniorColab) => r.nomefunc },
          { header: "Nível", span: 2, align: "right", muted: true, cell: (r: SeniorColab) => r.nivel },
        ]}
      />
    </div>
  );
}
