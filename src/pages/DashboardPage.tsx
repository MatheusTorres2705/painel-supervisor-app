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
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "@/auth/AuthProvider";
import { obterReg } from "@/lib/obterReg";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

/* =================== Components =================== */
const Kpi: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  detail?: string;
  onClick?: () => void;
  clickable?: boolean;
}> = ({ icon, label, value, detail, onClick, clickable }) => (
  <Card
    className={[
      "hover:shadow-lg transition",
      clickable ? "cursor-pointer select-none" : "",
    ].join(" ")}
    onClick={onClick}
    role={clickable ? "button" : undefined}
    tabIndex={clickable ? 0 : undefined}
    onKeyDown={
      clickable
        ? (e) => {
            if (e.key === "Enter" || e.key === " ") onClick?.();
          }
        : undefined
    }
  >
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

/* =================== Types =================== */
type BarColab = {
  codfunc: number;
  name: string; // NOMEFUNC
  hh: number; // horas (QTD minutos / 60)
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
  diff: number; // atual - previsto
  pct: number | null; // atual/previsto
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
  hh: number; // horas
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

/* =================== Gauge (Velocímetro) =================== */
const SpeedometerGauge: React.FC<{
  value: number; // 0..max
  max?: number; // padrão 100
  title?: string;
}> = ({ value, max = 100, title }) => {
  const v = clamp(value, 0, max);
  const pct = max > 0 ? v / max : 0;

  const angle = 180 * (1 - pct);
  const rad = (Math.PI / 180) * angle;

  const cx = 100;
  const cy = 100;

  const rNeedle = 72;
  const x2 = cx + rNeedle * Math.cos(rad);
  const y2 = cy - rNeedle * Math.sin(rad);

  const data = [
    { name: "Crítica", value: 60, fill: "hsl(var(--muted))" },
    { name: "Ok", value: 25, fill: "hsl(var(--secondary))" },
    { name: "Excelente", value: 15, fill: "hsl(var(--primary))" },
  ];

  const status =
    pct >= 0.9 ? "Excelente" : pct >= 0.8 ? "Boa" : pct >= 0.7 ? "Atenção" : "Crítica";

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-1">
      {title ? <div className="text-sm text-muted-foreground">{title}</div> : null}

      <div className="relative w-full" style={{ height: 170 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              startAngle={180}
              endAngle={0}
              cx="50%"
              cy="60%"
              innerRadius="68%"
              outerRadius="92%"
              stroke="transparent"
              isAnimationActive={false}
            >
              {data.map((entry, idx) => (
                <Cell key={idx} fill={entry.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        <svg
          viewBox="0 0 200 140"
          className="absolute inset-0"
          style={{ pointerEvents: "none" }}
        >
          <line
            x1={cx}
            y1={cy}
            x2={x2}
            y2={y2}
            stroke="hsl(var(--foreground))"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={cx} cy={cy} r="6" fill="hsl(var(--foreground))" />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-end pb-7">
          <div className="text-3xl font-semibold">{Math.round(pct * 100)}%</div>
          <div className="text-xs text-muted-foreground mt-1">{status}</div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        Meta: 90% • Atual: {Math.round(pct * 100)}%
      </div>
    </div>
  );
};

export default function DashboardPage() {
  const { user } = useAuth();
  const data = mockKpis();

  // ===== Avanço da linha (REAL via ERP) =====
  const [avancoReal, setAvancoReal] = useState<number>(0);
  const [avancoLoading, setAvancoLoading] = useState<boolean>(true);
  const [avancoErro, setAvancoErro] = useState<string | null>(null);

  // ===== Gráfico de atividades por colaborador (real via ERP) =====
  const [barData, setBarData] = useState<BarColab[]>([]);
  const [barLoading, setBarLoading] = useState(true);
  const [barErro, setBarErro] = useState<string | null>(null);

  // ===== Modal de detalhamento (click no gráfico) =====
  const [detOpen, setDetOpen] = useState(false);
  const [detColab, setDetColab] = useState<{ codfunc: number; name: string } | null>(
    null
  );
  const [detLoading, setDetLoading] = useState(false);
  const [detErro, setDetErro] = useState<string | null>(null);
  const [detRows, setDetRows] = useState<DetAtividade[]>([]);

  // ===== Materiais faltantes (KPI + modal) =====
  const [faltQtd, setFaltQtd] = useState<number>(0);
  const [faltLoading, setFaltLoading] = useState<boolean>(true);
  const [faltErro, setFaltErro] = useState<string | null>(null);

  const [faltOpen, setFaltOpen] = useState(false);
  const [faltListLoading, setFaltListLoading] = useState(false);
  const [faltListErro, setFaltListErro] = useState<string | null>(null);
  const [faltRows, setFaltRows] = useState<FaltaItem[]>([]);

  // ===== Retrabalho (KPI + modal) =====
  const [retrHH, setRetrHH] = useState<number>(0);
  const [retrLoading, setRetrLoading] = useState<boolean>(true);
  const [retrErro, setRetrErro] = useState<string | null>(null);

  const [retrOpen, setRetrOpen] = useState(false);
  const [retrListLoading, setRetrListLoading] = useState(false);
  const [retrListErro, setRetrListErro] = useState<string | null>(null);
  const [retrRows, setRetrRows] = useState<RetrabItem[]>([]);

  // ===== Assiduidade (mock com velocímetro) =====
  const [assValue] = useState<number>(87); // mock por enquanto

  // ===== Pirâmide de senioridade (comparativo Real x Previsto) =====
  const [seniorData, setSeniorData] = useState<SeniorCompareBar[]>([]);
  const [seniorLoading, setSeniorLoading] = useState(true);
  const [seniorErro, setSeniorErro] = useState<string | null>(null);

  // (fixo por enquanto, conforme sua query)
  const CODDEP_ALVO = 101040600;

  // (fixo conforme sua consulta de faltantes)
  const ANO_FALTA = "2025";
  const MES_FALTA = "12";

  const CODUSU_LOGADO = (user as any)?.codusu ?? 134;

  const MES_ATUAL_LABEL = useMemo(() => {
    const d = new Date();
    return `${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
  }, []);

  // Ano/Mês do avanço (mês atual por padrão, no formato usado no seu WHERE)
  const ANO_AVANCO = useMemo(() => String(new Date().getFullYear()), []);
  const MES_AVANCO = useMemo(() => String(Number(pad2(new Date().getMonth() + 1))), []);

  // ======= Avanço: carregar KPI REAL =======
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
            WHERE CRO.ANO = '${ANO_AVANCO}'
              AND CRO.MES = '${MES_AVANCO}'
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
  }, [CODUSU_LOGADO, ANO_AVANCO, MES_AVANCO]);

  // --------- Detalhamento: carregar atividades do colaborador clicado ----------
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
        WHERE FUN.CODFUNC = ${Number(codfunc)}
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

  // --------- Materiais faltantes: carregar contagem ----------
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setFaltLoading(true);
        setFaltErro(null);

        const sql = `
          SELECT
            COUNT(*) AS QTD
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
            AND F.ANO IN ('${ANO_FALTA}')
            AND F.MES IN ('${MES_FALTA}')
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
  }, [CODUSU_LOGADO]);

  // --------- Materiais faltantes: abrir modal e carregar lista ----------
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
          AND F.ANO IN ('${ANO_FALTA}')
          AND F.MES IN ('${MES_FALTA}')
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

  // ======= Retrabalho: total (mês atual) =======
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setRetrLoading(true);
        setRetrErro(null);

        const sql = `
          SELECT 
            SUM(APO.QTD) / 60 AS QTD
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
            AND TO_CHAR(AV.DATA , 'MM/YYYY') = TO_CHAR(SYSDATE , 'MM/YYYY')
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
  }, [CODUSU_LOGADO]);

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
          AND TO_CHAR(AV.DATA , 'MM/YYYY') = TO_CHAR(SYSDATE , 'MM/YYYY')
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

  // ======= Atividades por colaborador =======
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
            return {
              codfunc: Number(r.CODFUNC ?? 0),
              name: String(r.NOMEFUNC ?? ""),
              hh,
            };
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

  // ======= Pirâmide de senioridade (Real x Previsto) =======
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
              AND FUN.CODDEP = ${Number(CODDEP_ALVO)}
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

  const faltantesValue = useMemo(() => {
    if (faltLoading) return "…";
    if (faltErro) return "—";
    return String(faltQtd ?? 0);
  }, [faltLoading, faltErro, faltQtd]);

  const retrValue = useMemo(() => {
    if (retrLoading) return "…";
    if (retrErro) return "—";
    return `${Math.round((Number(retrHH) || 0) * 10) / 10}`;
  }, [retrLoading, retrErro, retrHH]);

  const retrTotalModal = useMemo(() => {
    return Math.round(retrRows.reduce((acc, r) => acc + (Number(r.hh) || 0), 0) * 10) / 10;
  }, [retrRows]);

  const avancoValue = useMemo(() => {
    if (avancoLoading) return "…";
    if (avancoErro) return "—";
    return `${Math.round((Number(avancoReal) || 0) * 10) / 10}%`;
  }, [avancoLoading, avancoErro, avancoReal]);

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

        {/* ✅ Avanço REAL (ERP) */}
        <Kpi
          icon={<Gauge className="h-4 w-4" />}
          label="Avanço da linha (média)"
          value={avancoValue}
          detail={`${MES_AVANCO}/${ANO_AVANCO}`}
        />

        <Kpi
          icon={<Factory className="h-4 w-4" />}
          label="Materiais faltantes"
          value={faltantesValue}
          detail={`${MES_FALTA}/${ANO_FALTA}`}
          clickable
          onClick={() => abrirFaltantes()}
        />

        <Kpi
          icon={<Award className="h-4 w-4" />}
          label="Retrabalho (HH)"
          value={retrValue}
          detail={MES_ATUAL_LABEL}
          clickable
          onClick={() => abrirRetrabalho()}
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
                style={{ cursor: "pointer" }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-20}
                  textAnchor="end"
                  height={50}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickFormatter={(v) => `${v}h`} width={40} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(value: any) => [`${value} h`, "Horas apontadas"]}
                  labelFormatter={(label) => `Colaborador: ${label}`}
                />
                <Bar
                  dataKey="hh"
                  radius={[6, 6, 0, 0]}
                  onClick={(data: any) => {
                    const row: BarColab | undefined = data?.payload;
                    if (!row?.codfunc) return;
                    carregarDetalhe(row.codfunc, row.name);
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Cards auxiliares */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Assiduidade (mock) */}
        <Card className="hover:shadow-lg transition">
          <CardHeader className="pb-2">
            <CardTitle>Assiduidade (mock)</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <SpeedometerGauge value={assValue} max={100} title="Índice de assiduidade" />
          </CardContent>
        </Card>

        {/* Pirâmide de senioridade (Real x Previsto) */}
        <Card className="hover:shadow-lg transition">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Pirâmide de senioridade (Real × Previsto)</CardTitle>
              <div className="mt-1 text-xs text-muted-foreground">
                Dep.: {CODDEP_ALVO} • Supervisor: {CODUSU_LOGADO}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary">Atual: {fmtInt(seniorResumo.totalAtual)}</Badge>
              <Badge variant="secondary">Previsto: {fmtInt(seniorResumo.totalPrev)}</Badge>
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
                  <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11 }} />
                  <Legend />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      if (name === "previsto") return [value, "Previsto"];
                      if (name === "atual") return [value, "Atual"];
                      return [value, name];
                    }}
                    labelFormatter={(label) => `Nível: ${label}`}
                    contentStyle={{ fontSize: 12 }}
                    wrapperStyle={{ outline: "none" }}
                  />
                  <Bar dataKey="previsto" name="Previsto" radius={[0, 6, 6, 0]} />
                  <Bar dataKey="atual" name="Atual" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>

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

      {/* ===== Modal: Detalhamento de atividades do colaborador clicado ===== */}
      <Dialog open={detOpen} onOpenChange={setDetOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Detalhamento de atividades</DialogTitle>
            <DialogDescription>
              {detColab ? (
                <span>
                  Colaborador: <b>{detColab.name}</b> • CODFUNC: {detColab.codfunc}
                </span>
              ) : (
                "—"
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border">
            <div className="px-4 py-3 border-b text-sm flex items-center justify-between gap-3">
              <div className="text-black/70">
                {detLoading
                  ? "Carregando atividades…"
                  : detErro
                  ? "Erro ao carregar"
                  : `${detRows.length} atividade(s) encontrada(s)`}
              </div>

              {!detLoading && !detErro ? (
                <Badge variant="secondary">Total HH: {totalDetHH}</Badge>
              ) : null}
            </div>

            <ScrollArea className="h-[420px]">
              {detLoading ? (
                <div className="p-6 text-sm text-black/70">Carregando…</div>
              ) : detErro ? (
                <div className="p-6 text-sm text-red-600">{detErro}</div>
              ) : detRows.length === 0 ? (
                <div className="p-6 text-sm text-black/70">
                  Nenhuma atividade encontrada para este colaborador.
                </div>
              ) : (
                <div className="w-full">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-black/70 border-b">
                    <div className="col-span-7">Atividade</div>
                    <div className="col-span-3">Data execução</div>
                    <div className="col-span-2 text-right">HH</div>
                  </div>

                  {detRows.map((r, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-b last:border-b-0"
                    >
                      <div className="col-span-7">{r.descrprod}</div>
                      <div className="col-span-3 text-black/70">{r.dtexecucao}</div>
                      <div className="col-span-2 text-right">
                        {Math.round((Number(r.hh) || 0) * 10) / 10}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Modal: Lista de materiais faltantes ===== */}
      <Dialog open={faltOpen} onOpenChange={setFaltOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Materiais faltantes</DialogTitle>
            <DialogDescription>
              Supervisor: <b>{CODUSU_LOGADO}</b> • Período: {MES_FALTA}/{ANO_FALTA} •{" "}
              {faltListLoading ? "Carregando…" : `${faltRows.length} item(ns)`}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border">
            <div className="px-4 py-3 border-b text-sm flex items-center justify-between gap-3">
              <div className="text-black/70">
                {faltListLoading
                  ? "Carregando lista…"
                  : faltListErro
                  ? "Erro ao carregar"
                  : "Clique no KPI para recarregar (se necessário)."}
              </div>

              {!faltListLoading && !faltListErro ? (
                <Badge variant="secondary">Total: {faltRows.length}</Badge>
              ) : null}
            </div>

            <ScrollArea className="h-[520px]">
              {faltListLoading ? (
                <div className="p-6 text-sm text-black/70">Carregando…</div>
              ) : faltListErro ? (
                <div className="p-6 text-sm text-red-600">{faltListErro}</div>
              ) : faltRows.length === 0 ? (
                <div className="p-6 text-sm text-black/70">
                  Nenhum material faltante encontrado para o filtro atual.
                </div>
              ) : (
                <div className="w-full">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-black/70 border-b">
                    <div className="col-span-2">Chassi</div>
                    <div className="col-span-2">Cód. Prod</div>
                    <div className="col-span-5">Descrição</div>
                    <div className="col-span-2">Necessidade</div>
                    <div className="col-span-1 text-right">Entrega</div>
                  </div>

                  {faltRows.map((r, idx) => (
                    <div
                      key={`${r.chassi}-${r.codprod}-${idx}`}
                      className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-b last:border-b-0"
                    >
                      <div className="col-span-2">{r.chassi}</div>
                      <div className="col-span-2">{r.codprod}</div>
                      <div className="col-span-5">{r.descrprod}</div>
                      <div className="col-span-2 text-black/70">{r.necessidade}</div>
                      <div className="col-span-1 text-right text-black/70">
                        {r.dataEntrega}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex justify-end">
            <button
              className="text-sm underline text-black/80 hover:text-black"
              onClick={() => {
                setFaltRows([]);
                abrirFaltantes();
              }}
            >
              Recarregar lista
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== Modal: Detalhamento do retrabalho ===== */}
      <Dialog open={retrOpen} onOpenChange={setRetrOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Retrabalho — Detalhamento</DialogTitle>
            <DialogDescription>
              Supervisor: <b>{CODUSU_LOGADO}</b> • Período: {MES_ATUAL_LABEL} •{" "}
              {retrListLoading ? "Carregando…" : `${retrRows.length} item(ns)`}
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border">
            <div className="px-4 py-3 border-b text-sm flex items-center justify-between gap-3">
              <div className="text-black/70">
                {retrListLoading
                  ? "Carregando detalhamento…"
                  : retrListErro
                  ? "Erro ao carregar"
                  : "Clique no KPI para recarregar (se necessário)."}
              </div>

              {!retrListLoading && !retrListErro ? (
                <Badge variant="secondary">Total HH: {retrTotalModal}</Badge>
              ) : null}
            </div>

            <ScrollArea className="h-[520px]">
              {retrListLoading ? (
                <div className="p-6 text-sm text-black/70">Carregando…</div>
              ) : retrListErro ? (
                <div className="p-6 text-sm text-red-600">{retrListErro}</div>
              ) : retrRows.length === 0 ? (
                <div className="p-6 text-sm text-black/70">
                  Nenhum retrabalho encontrado para o mês atual.
                </div>
              ) : (
                <div className="w-full">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-black/70 border-b">
                    <div className="col-span-3">Setor</div>
                    <div className="col-span-7">Atividade</div>
                    <div className="col-span-2 text-right">HH</div>
                  </div>

                  {retrRows.map((r, idx) => (
                    <div
                      key={`${r.setor}-${r.atividade}-${idx}`}
                      className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-b last:border-b-0"
                    >
                      <div className="col-span-3">{r.setor}</div>
                      <div className="col-span-7">{r.atividade}</div>
                      <div className="col-span-2 text-right text-black/70">
                        {Math.round((Number(r.hh) || 0) * 10) / 10}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <div className="flex justify-end">
            <button
              className="text-sm underline text-black/80 hover:text-black"
              onClick={() => {
                setRetrRows([]);
                abrirRetrabalho();
              }}
            >
              Recarregar detalhamento
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
