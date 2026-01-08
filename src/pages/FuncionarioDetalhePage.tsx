// src/pages/FuncionarioDetalhePage.tsx
// ✅ PDF: npm install jspdf jspdf-autotable

import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";
import { api } from "@/lib/api";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";

import * as Dialog from "@radix-ui/react-dialog";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import {
  ArrowLeft,
  Flag,
  Handshake,
  BriefcaseBusiness,
  Target,
  CheckSquare,
  MessageCircle,
  Plus,
  X,
  RefreshCw,
  Save,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  SlidersHorizontal,
  Search,
  FileDown,
  Sparkles,
} from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type TabKey =
  | "metas"
  | "combinados"
  | "funcoes"
  | "pdi"
  | "checkin"
  | "anotacoes";

type MembroBasico = {
  codfunc: number;
  nome: string;
  cargo: string;
  depto: string;
  senior: string;
};

type MetaItem = {
  id: number;
  titulo: string;
  peso: number;
  status: "Dentro do esperado" | "Abaixo do esperado" | "Acima do esperado";
  atingimento: number; // 0-100
};

type AvalCriterio = {
  codigo: number;
  descr: string;
  pontuacao: number; // 1..5
  percentual: number; // 0..100
};

type Criterio = {
  cod: number;
  descr: string;
};

interface LocationState {
  membro?: MembroBasico;
}

/**
 * URL da foto a partir do CODFUNC
 */
const fotoUrl = (codfunc: number) =>
  `http://sankhya.nxboats.com.br:8180/mge/Funcionario@IMAGEM@CODEMP=1@CODFUNC=${codfunc}.dbimage`;

const NOTE_OPTIONS = [
  { value: 1, label: "1 - Muito abaixo expectativa" },
  { value: 2, label: "2 - Abaixo da expectativa" },
  { value: 3, label: "3 - Dentro da expectativa" },
  { value: 4, label: "4 - Acima da expectativa" },
  { value: 5, label: "5 - Excelente/ Exemplar" },
] as const;

function notaLabel(n: number) {
  const found = NOTE_OPTIONS.find((o) => o.value === n);
  return found?.label ?? `${n}`;
}

/** ========= Recharts: quebra de linha ========= */
function wrapWordsToLines(text: string, maxCharsPerLine: number) {
  const words = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (test.length <= maxCharsPerLine) {
      line = test;
    } else {
      if (line) lines.push(line);
      if (w.length > maxCharsPerLine) {
        const chunks = w.match(new RegExp(`.{1,${maxCharsPerLine}}`, "g")) || [
          w,
        ];
        lines.push(...chunks.slice(0, -1));
        line = chunks[chunks.length - 1] || "";
      } else {
        line = w;
      }
    }
  }
  if (line) lines.push(line);
  return lines;
}

const WrappedXAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const value = String(payload?.value ?? "");
  const lines = wrapWordsToLines(value, 14);

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={0}
        y={0}
        dy={10}
        textAnchor="middle"
        fontSize={10}
        fill="currentColor"
      >
        {lines.slice(0, 3).map((ln, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 12}>
            {ln}
          </tspan>
        ))}
      </text>
    </g>
  );
};

/** ✅ tick para YAxis (gráfico horizontal, mais legível) */
const WrappedYAxisTick = (props: any) => {
  const { x, y, payload } = props;
  const value = String(payload?.value ?? "");
  const lines = wrapWordsToLines(value, 26);

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={4} textAnchor="end" fontSize={11} fill="currentColor">
        {lines.slice(0, 2).map((ln, i) => (
          <tspan key={i} x={0} dy={i === 0 ? 0 : 12}>
            {ln}
          </tspan>
        ))}
      </text>
    </g>
  );
};

function clampPct(v: any) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function toneFromPercent(pct: number) {
  if (pct >= 90)
    return {
      label: "Excelente",
      cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  if (pct >= 80)
    return {
      label: "Dentro do esperado",
      cls: "bg-sky-50 text-sky-800 border-sky-200",
    };
  if (pct > 0)
    return {
      label: "Atenção",
      cls: "bg-amber-50 text-amber-800 border-amber-200",
    };
  return {
    label: "Sem dados",
    cls: "bg-muted text-muted-foreground border-border",
  };
}

export default function FuncionarioDetalhePage() {
  const { codfunc } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const [tab, setTab] = useState<TabKey>("metas");
  const [membro, setMembro] = useState<MembroBasico | null>(
    state.membro || null
  );
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Metas
  const [metas, setMetas] = useState<MetaItem[]>([]);
  const [metasLoading, setMetasLoading] = useState(false);
  const [metasErro, setMetasErro] = useState<string | null>(null);

  // ===================== CHECK-INS =====================
  const anoAtual = String(new Date().getFullYear());
  const [checkinAno, setCheckinAno] = useState<string>(anoAtual);

  const [aval, setAval] = useState<AvalCriterio[]>([]);
  const [avalLoading, setAvalLoading] = useState(false);
  const [avalErro, setAvalErro] = useState<string | null>(null);

  const [novoOpen, setNovoOpen] = useState(false);
  const [criterios, setCriterios] = useState<Criterio[]>([]);
  const [criteriosLoading, setCriteriosLoading] = useState(false);
  const [criteriosErro, setCriteriosErro] = useState<string | null>(null);

  const [notas, setNotas] = useState<Record<number, number>>({});
  const [salvandoAvaliacao, setSalvandoAvaliacao] = useState(false);

  // ✅ filtros/visual (checkin)
  const [criterioQuery, setCriterioQuery] = useState("");
  const [onlyLow, setOnlyLow] = useState(false);
  const [chartMode, setChartMode] = useState<"top" | "all">("top");

  const cod = Number(codfunc);

  // ---------- Carrega dados básicos do colaborador ----------
  useEffect(() => {
    if (!cod || membro) return;

    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        setErro(null);

        const sql = `
          SELECT 
              FUN.CODFUNC, 
              FUN.NOMEFUNC,
              DEP.DESCRDEP,
              CAR.DESCRCARGO,
              NVL(CAR.AD_NIVEL, 'I') AS SENHORIDADE
          FROM TFPFUN FUN
          JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
          JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
          WHERE FUN.CODFUNC = ${cod}
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        if (!rows.length) {
          setErro("Funcionário não encontrado.");
          return;
        }

        const r = rows[0];
        const senioridade =
          String(r.SENHORIDADE || "").toUpperCase().startsWith("S")
            ? "Sênior"
            : String(r.SENHORIDADE || "").toUpperCase().startsWith("P")
            ? "Pleno"
            : "Júnior";

        setMembro({
          codfunc: Number(r.CODFUNC),
          nome: String(r.NOMEFUNC ?? ""),
          cargo: String(r.DESCRCARGO ?? ""),
          depto: String(r.DESCRDEP ?? ""),
          senior: senioridade,
        });
      } catch (e: any) {
        console.error("[FuncionarioDetalhePage] erro:", e);
        setErro(e?.message || "Falha ao carregar dados do colaborador.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [cod, membro]);

  // ---------- Carrega metas ----------
  useEffect(() => {
    if (!cod) return;

    let cancel = false;

    (async () => {
      try {
        setMetasLoading(true);
        setMetasErro(null);

        const sql = `
          SELECT
              1 AS ID,
              'Avanco de Atividades' AS TITULO,
              10 AS PESO,
              CASE 
                  WHEN Snk_Dividir(SUM(APO.QTD), 8400) * 100 < 80 
                      THEN 'Abaixo do esperado'
                  ELSE 'Dentro do esperado'
              END AS STATUS,
              Snk_Dividir(SUM(APO.QTD), 8400) * 100 AS atingimento
          FROM TFPFUN FUN 
          LEFT JOIN AD_DETALCRONOGRAMAFUNC APO ON FUN.CODFUNC = APO.CODFUNC
          WHERE FUN.CODFUNC = ${cod}
          GROUP BY FUN.NOMEFUNC

          UNION ALL
          SELECT
            2 AS ID,
            'Assiduidade e Pontualidade' AS TITULO,
            10 AS PESO,
            'Dentro do esperado' AS STATUS,
            0 AS atingimento
          FROM DUAL

          UNION ALL
          SELECT
            3 AS ID,
            'Apontamento de Qualidade' AS TITULO,
            10 AS PESO,
            'Dentro do esperado' AS STATUS,
            0 AS atingimento
          FROM DUAL

          UNION ALL
          SELECT 
            4 AS ID,
            'Avaliação Comportamental' AS TITULO,
            10 AS PESO ,
            'Dentro do esperado' AS STATUS,
            (AVG(AV.PONTUACAO) / 5) * 100 AS atingimento
          FROM AD_TFPFUNAC AV
          WHERE AV.CODFUNC = ${cod}
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const list: MetaItem[] = rows.map((r: any) => {
          const atingRaw = Number(r.ATINGIMENTO ?? 0);
          const atingimento = Math.max(0, Math.min(100, Math.round(atingRaw)));

          const statusStr = String(r.STATUS ?? "Dentro do esperado");
          let status: MetaItem["status"] = "Dentro do esperado";
          if (statusStr.toLowerCase().includes("abaixo"))
            status = "Abaixo do esperado";
          else if (statusStr.toLowerCase().includes("acima"))
            status = "Acima do esperado";

          return {
            id: Number(r.ID),
            titulo: String(r.TITULO ?? ""),
            peso: Number(r.PESO ?? 0),
            status,
            atingimento,
          };
        });

        setMetas(list);
      } catch (e: any) {
        console.error("[FuncionarioDetalhePage] erro metas:", e);
        setMetasErro(e?.message || "Falha ao carregar as metas do colaborador.");
        setMetas([]);
      } finally {
        if (!cancel) setMetasLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [cod]);

  // ---------- Avaliação por ano ----------
  const carregarAvaliacaoAno = async (ano: string) => {
    if (!cod) return;

    try {
      setAvalLoading(true);
      setAvalErro(null);

      // ✅ Assumindo DTREF como DATE (padrão mais comum). Filtra pelo ano informado.
      const sql = `
        SELECT 
          CODIGO,
          DESCRICAO AS DESCR_AVALIACAO,
          PONTUACAO,
          (PONTUACAO / 5) * 100 AS PERCENTUAL_ATING
        FROM AD_TFPFUNAC AV
        WHERE AV.CODFUNC = ${cod}
         -- AND TO_CHAR(AV.DTREF, 'YYYY') = '${ano}'
        ORDER BY CODIGO
      `.trim();

      const rows = await obterReg(sql);

      const list: AvalCriterio[] = rows.map((r: any) => ({
        codigo: Number(r.CODIGO ?? 0),
        descr: String(r.DESCR_AVALIACAO ?? ""),
        pontuacao: Number(r.PONTUACAO ?? 0),
        percentual: clampPct(r.PERCENTUAL_ATING),
      }));

      setAval(list);
    } catch (e: any) {
      console.error("[Check-ins] erro ao carregar avaliação:", e);
      setAvalErro(e?.message || "Falha ao carregar a avaliação comportamental.");
      setAval([]);
    } finally {
      setAvalLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== "checkin") return;
    carregarAvaliacaoAno(checkinAno);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, checkinAno, cod]);

  // ---------- Critérios ----------
  const carregarCriterios = async () => {
    try {
      setCriteriosLoading(true);
      setCriteriosErro(null);

      const sql = `
        SELECT
          CODCHL AS COD_CRITERIO,
          DESCRCHL AS DESCRI_CRITERIO
        FROM AD_TEOCADCHL
        ORDER BY 1
      `.trim();

      const rows = await obterReg(sql);

      const list: Criterio[] = rows.map((r: any) => ({
        cod: Number(r.COD_CRITERIO ?? 0),
        descr: String(r.DESCRI_CRITERIO ?? ""),
      }));

      setCriterios(list);
    } catch (e: any) {
      console.error("[Check-ins] erro ao carregar critérios:", e);
      setCriteriosErro(
        e?.message || "Falha ao carregar os critérios de avaliação."
      );
      setCriterios([]);
    } finally {
      setCriteriosLoading(false);
    }
  };

  const abrirNovaAvaliacao = async () => {
    setNovoOpen(true);
    if (!criterios.length) await carregarCriterios();
    setNotas({});
  };

  const fecharNovaAvaliacao = () => {
    setNovoOpen(false);
    setNotas({});
  };

  const mediaNotaAtual = useMemo(() => {
    if (!aval.length) return 0;
    const sum = aval.reduce((s, a) => s + (a.pontuacao || 0), 0);
    return sum / aval.length;
  }, [aval]);

  const percentualMedioAtual = useMemo(() => {
    if (!aval.length) return 0;
    return clampPct((mediaNotaAtual / 5) * 100);
  }, [mediaNotaAtual, aval.length]);

  // ✅ contagem abaixo do esperado (ex.: < 80%)
  const qtdAbaixo = useMemo(() => {
    return aval.filter((a) => clampPct(a.percentual) < 80).length;
  }, [aval]);

  // ✅ top/bottom 3
  const top3 = useMemo(() => {
    return [...aval]
      .map((a) => ({ ...a, percentual: clampPct(a.percentual) }))
      .sort((a, b) => b.percentual - a.percentual)
      .slice(0, 3);
  }, [aval]);

  const bottom3 = useMemo(() => {
    return [...aval]
      .map((a) => ({ ...a, percentual: clampPct(a.percentual) }))
      .sort((a, b) => a.percentual - b.percentual)
      .slice(0, 3);
  }, [aval]);

  // ✅ lista filtrada/ordenada (pior -> melhor)
  const avalFiltrada = useMemo(() => {
    let list = [...aval].map((a) => ({
      ...a,
      percentual: clampPct(a.percentual),
    }));

    const q = criterioQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          String(a.codigo).includes(q) ||
          String(a.descr).toLowerCase().includes(q)
      );
    }

    if (onlyLow) {
      list = list.filter((a) => a.percentual < 80);
    }

    list.sort((a, b) => a.percentual - b.percentual);
    return list;
  }, [aval, criterioQuery, onlyLow]);

  // ✅ dados do gráfico: top 12 ou todos (melhor p/ leitura)
  const chartData = useMemo(() => {
    const base = [...avalFiltrada].sort((a, b) => b.percentual - a.percentual);
    const slice = chartMode === "top" ? base.slice(0, 12) : base;
    return slice.map((a) => ({
      criterio: a.descr,
      percentual: a.percentual,
      nota: a.pontuacao,
      codigo: a.codigo,
    }));
  }, [avalFiltrada, chartMode]);

  const chartHeight = useMemo(() => {
    return Math.max(320, chartData.length * 34);
  }, [chartData.length]);

  // ✅ plano de ação (itens abaixo de 80)
  const planoAcao = useMemo(() => {
    const lows = aval
      .map((a) => ({ ...a, percentual: clampPct(a.percentual) }))
      .filter((a) => a.percentual > 0 && a.percentual < 80)
      .sort((a, b) => a.percentual - b.percentual);

    return lows.map((a) => ({
      ...a,
      sugestao:
        a.pontuacao <= 2
          ? "Treinamento + acompanhamento semanal"
          : "Reforço de alinhamento + check-in quinzenal",
    }));
  }, [aval]);

  // =========================================================
  // PDF (Avaliação comportamental)
  // =========================================================
  const imprimirAvaliacaoPDF = () => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

      const title = "Avaliação Comportamental";
      const sub = `DTREF ${checkinAno}`;
      const nome = membro?.nome ? `${membro.codfunc} - ${membro.nome}` : `CODFUNC ${cod}`;
      const depto = membro?.depto ? `• ${membro.depto}` : "";
      const cargo = membro?.cargo ? `• ${membro.cargo}` : "";

      const tone = toneFromPercent(percentualMedioAtual);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(title, 40, 48);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(sub, 40, 68);

      doc.setFontSize(11);
      doc.text(nome, 40, 92);
      doc.setFontSize(10);
      doc.text(`${depto} ${cargo}`.trim(), 40, 110);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`Média: ${aval.length ? mediaNotaAtual.toFixed(1) : "-"} / 5`, 40, 140);
      doc.text(`Atingimento médio: ${aval.length ? `${percentualMedioAtual}%` : "-"}`, 40, 160);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Status: ${tone.label}`, 40, 178);
      doc.text(`Critérios abaixo (<80%): ${aval.length ? String(qtdAbaixo) : "-"}`, 40, 196);

      // Tabela principal
      const rows = aval
        .map((a) => ({
          codigo: a.codigo,
          criterio: a.descr,
          nota: a.pontuacao,
          pct: clampPct(a.percentual),
          label: notaLabel(a.pontuacao),
        }))
        .sort((a, b) => a.codigo - b.codigo);

      autoTable(doc, {
        startY: 220,
        head: [["Cód", "Critério", "Nota", "%", "Legenda"]],
        body: rows.map((r) => [
          String(r.codigo),
          r.criterio,
          `${r.nota}/5`,
          `${r.pct}%`,
          r.label,
        ]),
        styles: { font: "helvetica", fontSize: 9, cellPadding: 6, valign: "top" },
        headStyles: { fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 42 },
          2: { cellWidth: 54, halign: "right" },
          3: { cellWidth: 44, halign: "right" },
          4: { cellWidth: 160 },
        },
      });

      // Plano de ação (se houver)
      if (planoAcao.length) {
        const lastY = (doc as any).lastAutoTable?.finalY ?? 220;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.text("Plano de ação sugerido (critérios abaixo de 80%)", 40, lastY + 34);

        autoTable(doc, {
          startY: lastY + 50,
          head: [["Cód", "Critério", "Nota", "%", "Sugestão"]],
          body: planoAcao.map((p) => [
            String(p.codigo),
            p.descr,
            `${p.pontuacao}/5`,
            `${p.percentual}%`,
            p.sugestao,
          ]),
          styles: { font: "helvetica", fontSize: 9, cellPadding: 6, valign: "top" },
          headStyles: { fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: 42 },
            2: { cellWidth: 54, halign: "right" },
            3: { cellWidth: 44, halign: "right" },
          },
        });
      }

      const file = `avaliacao_comportamental_${cod}_${checkinAno}.pdf`;
      doc.save(file);
    } catch (e) {
      console.error("Erro ao gerar PDF:", e);
      alert("Falha ao gerar PDF. Veja o console para detalhes.");
    }
  };

  // =========================================================
  // SALVAR NO SANKHYA (AD_TFPFUNAC) via /api/sankhya/dataset/save
  // =========================================================
  const salvarNovaAvaliacao = async () => {
    if (!cod) return;

    if (!criterios.length) {
      alert("Nenhum critério carregado.");
      return;
    }

    const faltando = criterios.filter((c) => !notas[c.cod]);
    if (faltando.length) {
      alert(
        `Preencha a nota de todos os critérios.\nFaltando: ${faltando
          .slice(0, 4)
          .map((x) => x.cod)
          .join(", ")}${faltando.length > 4 ? "..." : ""}`
      );
      return;
    }

    try {
      setSalvandoAvaliacao(true);

      for (const c of criterios) {
        const pontuacao = notas[c.cod];

        // ✅ Recomendo DTREF como data do ano (01/01/AAAA). Se seu endpoint aceitar Date, use isso.
        // Aqui mantive string "01/01/AAAA" para evitar problemas de parse.
        const dtref = `01/01/${checkinAno}`;

        await api.post("/api/sankhya/dataset/save", {
          entity: "AD_TFPFUNAC",
          fields: ["CODEMP", "CODFUNC", "CODIGO", "DTREF", "PONTUACAO", "DESCRICAO"],
          values: {
            "0": "1",
            "1": String(cod),
            "2": String(c.cod),
            "3": String(dtref),
            "4": String(pontuacao),
            "5": String(c.descr),
          },
        });
      }

      alert("Avaliação salva com sucesso no Sankhya.");
      fecharNovaAvaliacao();
      await carregarAvaliacaoAno(checkinAno);
    } catch (e: any) {
      console.error("[Check-ins] erro ao salvar avaliação:", e);
      alert(
        e?.response?.data?.erro ||
          e?.message ||
          "Falha ao salvar a avaliação no Sankhya. Veja o console para detalhes."
      );
    } finally {
      setSalvandoAvaliacao(false);
    }
  };

  if (!codfunc) {
    return (
      <div className="p-4 text-sm text-red-500">
        Código de funcionário não informado na rota.
      </div>
    );
  }

  const metasResumo = useMemo(() => {
    if (!metas.length) return { total: 0, concluidas: 0, abaixo: 0 };

    const total = metas.length;
    const concluidas = metas.filter((m) => m.atingimento >= 100).length;
    const abaixo = metas.filter(
      (m) => m.atingimento < 100 && m.status === "Abaixo do esperado"
    ).length;

    return { total, concluidas, abaixo };
  }, [metas]);

  // ✅ Atingimento médio por colaborador (média ponderada por PESO)
  const atingimentoMetas = useMemo(() => {
    if (!metas.length) return 0;

    const somaPesos = metas.reduce((s, m) => s + (Number(m.peso) || 0), 0);
    const valor =
      somaPesos > 0
        ? metas.reduce((s, m) => s + (m.atingimento * (Number(m.peso) || 0)), 0) /
          somaPesos
        : metas.reduce((s, m) => s + (m.atingimento || 0), 0) / metas.length;

    return Math.max(0, Math.min(100, Math.round(valor)));
  }, [metas]);

  const statusAtingimento = useMemo(() => {
    if (!metas.length) return { label: "Sem dados", tone: "muted" as const };
    if (atingimentoMetas < 80) return { label: "Abaixo do esperado", tone: "warn" as const };
    if (atingimentoMetas < 100) return { label: "Dentro do esperado", tone: "ok" as const };
    return { label: "Meta atingida", tone: "good" as const };
  }, [atingimentoMetas, metas.length]);

  const badgeToneClass =
    statusAtingimento.tone === "warn"
      ? "bg-amber-50 text-amber-800 border-amber-200"
      : statusAtingimento.tone === "good"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : statusAtingimento.tone === "ok"
      ? "bg-sky-50 text-sky-800 border-sky-200"
      : "bg-muted text-muted-foreground border-border";

  const tabs = [
    { key: "metas", label: "Metas", icon: Flag },
    { key: "combinados", label: "Combinados", icon: Handshake },
    { key: "funcoes", label: "Funções / Papéis", icon: BriefcaseBusiness },
    { key: "pdi", label: "PDI", icon: Target },
    { key: "checkin", label: "Avaliação Comportamental", icon: CheckSquare },
     { key: "pdi", label: "Extrato do Ponto", icon: CheckSquare },
    { key: "anotacoes", label: "Anotações", icon: MessageCircle },
  ] as const;

  const currentTabConfig = tabs.find((t) => t.key === tab) ?? tabs[0];

  return (
    <div className="h-[calc(100vh-80px)] w-full bg-background text-foreground flex rounded-xl border overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/40 flex flex-col">
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground hover:bg-muted"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Detalhes do colaborador
          </span>
        </div>

        <div className="px-4 pb-4">
          <Card className="bg-card border shadow-sm">
            <CardContent className="p-3 flex flex-col items-center gap-2">
              <Avatar className="h-20 w-20 border border-border">
                {membro && (
                  <AvatarImage
                    src={fotoUrl(membro.codfunc)}
                    alt={membro.nome}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <AvatarFallback className="text-lg">
                  {membro?.nome
                    ?.split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("") ?? "NX"}
                </AvatarFallback>
              </Avatar>

              <div className="text-center space-y-1">
                <p className="font-semibold leading-tight text-sm">
                  {membro?.codfunc + " - " + membro?.nome ||
                    (loading ? "Carregando..." : "Não informado")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {membro?.cargo || "Função não informada"}
                </p>
                {membro && (
                  <Badge variant="outline" className="text-[10px]">
                    {membro.senior} • {membro.depto}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <nav className="px-3 space-y-1 text-sm">
          {tabs.map((item) => {
            const active = tab === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key as TabKey)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 transition text-left border border-transparent ${
                  active
                    ? "bg-background text-foreground shadow-sm border-border"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
                    active ? "bg-foreground text-background" : "bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-4 pb-4">
          <p className="text-[10px] text-muted-foreground">
            Supervisor de Produção • NX Boats
          </p>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="flex flex-col gap-1">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
                <currentTabConfig.icon className="h-4 w-4" />
              </span>
              <h1 className="text-base font-semibold">
                {tab === "metas" && "Metas do colaborador"}
                {tab === "combinados" && "Combinados"}
                {tab === "funcoes" && "Funções / Papéis"}
                {tab === "pdi" && "Plano de Desenvolvimento Individual"}
                {tab === "checkin" && "Avaliação comportamental"}
                {tab === "anotacoes" && "Anotações"}
              </h1>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {membro?.nome ? `Você está visualizando ${membro.nome}.` : ""}
            </p>
          </div>

          {tab === "checkin" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => carregarAvaliacaoAno(checkinAno)}
                disabled={avalLoading}
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={imprimirAvaliacaoPDF}
                disabled={avalLoading || !aval.length}
              >
                <FileDown className="h-4 w-4" />
                Imprimir PDF
              </Button>

              <Button size="sm" className="gap-2" onClick={abrirNovaAvaliacao}>
                <Plus className="h-4 w-4" />
                Nova avaliação
              </Button>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {erro && <div className="text-sm text-red-600">{erro}</div>}

          {/* ======================= METAS ======================= */}
          {tab === "metas" && (
            <>
              {/* ✅ Resumo bonito/clean */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {/* Atingimento geral */}
                <Card className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">
                          Atingimento geral (média)
                        </p>
                        <div className="mt-1 flex items-end gap-2">
                          <p className="text-3xl font-semibold leading-none">
                            {metas.length ? `${atingimentoMetas}%` : "-"}
                          </p>
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${badgeToneClass}`}
                          >
                            {statusAtingimento.label}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          Ponderado pelo peso das metas
                        </p>
                      </div>

                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <TrendingUp className="h-4 w-4 text-foreground" />
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Progresso</span>
                        <span className="font-medium">
                          {metas.length ? `${atingimentoMetas}%` : "-"}
                        </span>
                      </div>
                      <Progress
                        value={metas.length ? atingimentoMetas : 0}
                        className="h-2 mt-1"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Total */}
                <Card className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Total de metas
                        </p>
                        <p className="mt-1 text-3xl font-semibold leading-none">
                          {metasResumo.total}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Metas apresentadas no período
                        </p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <Target className="h-4 w-4 text-foreground" />
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Concluídas */}
                <Card className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Concluídas
                        </p>
                        <p className="mt-1 text-3xl font-semibold leading-none">
                          {metasResumo.concluidas}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Atingimento ≥ 100%
                        </p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <CheckCircle2 className="h-4 w-4 text-foreground" />
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Abaixo */}
                <Card className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">
                          Abaixo do esperado
                        </p>
                        <p className="mt-1 text-3xl font-semibold leading-none">
                          {metasResumo.abaixo}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Metas com status de atenção
                        </p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <AlertTriangle className="h-4 w-4 text-foreground" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-3 mt-1">
                {metasLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Carregando metas do colaborador…
                  </div>
                ) : metasErro ? (
                  <div className="text-sm text-red-600">{metasErro}</div>
                ) : metas.length === 0 ? (
                  <Card className="bg-card border">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Nenhuma meta encontrada para este colaborador.
                    </CardContent>
                  </Card>
                ) : (
                  metas.map((m) => (
                    <Card key={m.id} className="bg-card border text-foreground">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">{m.titulo}</p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Peso:{" "}
                              <span className="font-medium">{m.peso}</span>
                            </p>
                          </div>
                          <Badge
                            className={`text-[10px] border ${
                              m.status === "Abaixo do esperado"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : m.status === "Acima do esperado"
                                ? "bg-sky-50 text-sky-800 border-sky-200"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            }`}
                            variant="outline"
                          >
                            {m.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span>Atingimento acumulado</span>
                          <span className="font-medium">{m.atingimento}%</span>
                        </div>
                        <Progress value={m.atingimento} className="h-2" />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {m.status}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}

          {/* ======================= CHECK-INS ======================= */}
          {tab === "checkin" && (
            <>
              {/* ✅ KPI GRID (clean + rápido) */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {/* Referência */}
                <Card className="bg-card border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Referência (DTREF)</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Input
                            value={checkinAno}
                            onChange={(e) => setCheckinAno(e.target.value)}
                            className="h-9 w-28 text-sm"
                            placeholder="YYYY"
                          />
                          <Badge variant="outline" className="text-[10px]">
                            Ano
                          </Badge>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Clique em “Atualizar”.
                        </p>
                      </div>

                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <CheckSquare className="h-4 w-4" />
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Nota média */}
                <Card className="bg-card border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-muted-foreground">Nota média</p>
                        <div className="mt-1 flex items-end gap-2">
                          <p className="text-3xl font-semibold leading-none">
                            {aval.length ? mediaNotaAtual.toFixed(1) : "-"}
                          </p>
                          <span className="text-[11px] text-muted-foreground">/ 5</span>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Base: {aval.length} critério(s)
                        </p>
                      </div>

                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <TrendingUp className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Conversão</span>
                        <span className="font-medium">
                          {aval.length ? `${percentualMedioAtual}%` : "-"}
                        </span>
                      </div>
                      <Progress value={aval.length ? percentualMedioAtual : 0} className="h-2 mt-1" />
                    </div>
                  </CardContent>
                </Card>

                {/* Status geral */}
                <Card className="bg-card border">
                  <CardContent className="p-4">
                    {(() => {
                      const tone = toneFromPercent(percentualMedioAtual);
                      return (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] text-muted-foreground">Status geral</p>
                            <div className="mt-1 flex items-end gap-2">
                              <p className="text-3xl font-semibold leading-none">
                                {aval.length ? `${percentualMedioAtual}%` : "-"}
                              </p>
                              <Badge variant="outline" className={`text-[10px] ${tone.cls}`}>
                                {tone.label}
                              </Badge>
                            </div>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                              Visão consolidada do período
                            </p>
                          </div>

                          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                            <SlidersHorizontal className="h-4 w-4" />
                          </span>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Abaixo do esperado */}
                <Card className="bg-card border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] text-muted-foreground">Abaixo (&lt; 80%)</p>
                        <p className="mt-1 text-3xl font-semibold leading-none">
                          {aval.length ? qtdAbaixo : "-"}
                        </p>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Total: {aval.length}
                        </p>
                      </div>

                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">Proporção</span>
                        <span className="font-medium">
                          {aval.length ? `${Math.round((qtdAbaixo / aval.length) * 100)}%` : "-"}
                        </span>
                      </div>
                      <Progress
                        value={aval.length ? Math.round((qtdAbaixo / aval.length) * 100) : 0}
                        className="h-2 mt-1"
                      />
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* ✅ Top/Bottom + Plano de ação (grade) */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                {/* Top 3 */}
                <Card className="bg-card border">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Top 3 (melhores)</p>
                        <p className="text-[11px] text-muted-foreground">
                          Destaques do período
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {top3.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {!avalLoading && !top3.length ? (
                      <div className="py-4 text-sm text-muted-foreground">Sem dados.</div>
                    ) : (
                      <div className="space-y-2">
                        {top3.map((t) => {
                          const tone = toneFromPercent(t.percentual);
                          return (
                            <div key={t.codigo} className="rounded-xl border bg-background p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">
                                      {t.codigo}
                                    </Badge>
                                    <Badge variant="outline" className={`text-[10px] ${tone.cls}`}>
                                      {t.percentual}%
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-xs leading-snug whitespace-normal break-words">
                                    {t.descr}
                                  </p>
                                </div>
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                                  <CheckCircle2 className="h-4 w-4" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Bottom 3 */}
                <Card className="bg-card border">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Bottom 3 (piores)</p>
                        <p className="text-[11px] text-muted-foreground">
                          Pontos prioritários
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {bottom3.length}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {!avalLoading && !bottom3.length ? (
                      <div className="py-4 text-sm text-muted-foreground">Sem dados.</div>
                    ) : (
                      <div className="space-y-2">
                        {bottom3.map((t) => {
                          const tone = toneFromPercent(t.percentual);
                          return (
                            <div key={t.codigo} className="rounded-xl border bg-background p-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-[10px]">
                                      {t.codigo}
                                    </Badge>
                                    <Badge variant="outline" className={`text-[10px] ${tone.cls}`}>
                                      {t.percentual}%
                                    </Badge>
                                  </div>
                                  <p className="mt-1 text-xs leading-snug whitespace-normal break-words">
                                    {t.descr}
                                  </p>
                                </div>
                                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                                  <AlertTriangle className="h-4 w-4" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Plano de ação */}
                <Card className="bg-card border">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Plano de ação sugerido</p>
                        <p className="text-[11px] text-muted-foreground">
                          Recomendação automática (abaixo de 80%)
                        </p>
                      </div>
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <Sparkles className="h-4 w-4" />
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {!avalLoading && !planoAcao.length ? (
                      <div className="py-4 text-sm text-muted-foreground">
                        Nenhum critério abaixo de 80% 🎉
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {planoAcao.slice(0, 6).map((p) => (
                          <div key={p.codigo} className="rounded-xl border bg-background p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px]">
                                    {p.codigo}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] ${toneFromPercent(p.percentual).cls}`}
                                  >
                                    {p.percentual}%
                                  </Badge>
                                </div>
                                <p className="mt-1 text-xs leading-snug whitespace-normal break-words">
                                  {p.descr}
                                </p>
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                  Sugestão: <span className="font-medium text-foreground">{p.sugestao}</span>
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                        {planoAcao.length > 6 ? (
                          <p className="text-[11px] text-muted-foreground">
                            +{planoAcao.length - 6} itens no PDF
                          </p>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* ✅ Controles (busca + toggles) */}
              <Card className="bg-card border">
                <CardContent className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        Avaliação comportamental • {checkinAno}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Use filtros para focar nos pontos críticos. O gráfico horizontal melhora a leitura.
                      </p>

                      {avalErro ? <p className="mt-2 text-sm text-red-600">{avalErro}</p> : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={criterioQuery}
                          onChange={(e) => setCriterioQuery(e.target.value)}
                          placeholder="Buscar critério (código ou texto)…"
                          className="h-9 w-[290px] pl-8"
                        />
                      </div>

                      <Button
                        variant={onlyLow ? "default" : "outline"}
                        size="sm"
                        className="gap-2"
                        onClick={() => setOnlyLow((s) => !s)}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        {onlyLow ? "Somente abaixo" : "Todos"}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={() => setChartMode((m) => (m === "top" ? "all" : "top"))}
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                        {chartMode === "top" ? "Top 12 no gráfico" : "Todos no gráfico"}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={imprimirAvaliacaoPDF}
                        disabled={avalLoading || !aval.length}
                      >
                        <FileDown className="h-4 w-4" />
                        PDF
                      </Button>
                    </div>
                  </div>

                  {avalLoading ? (
                    <div className="mt-3 text-sm text-muted-foreground">Carregando avaliação…</div>
                  ) : !aval.length ? (
                    <div className="mt-3 text-sm text-muted-foreground">
                      Nenhuma avaliação encontrada para o período informado.
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              {/* ✅ Conteúdo: Gráfico + Lista */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                {/* GRÁFICO (HORIZONTAL) */}
                <Card className="bg-card border xl:col-span-2">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Gráfico por critério</p>
                        <p className="text-[11px] text-muted-foreground">
                          Percentual de atingimento por critério (nota / 5).
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {chartData.length} item(ns)
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {avalLoading ? (
                      <div className="h-[320px] grid place-items-center text-sm text-muted-foreground">
                        Carregando…
                      </div>
                    ) : !chartData.length ? (
                      <div className="h-[320px] grid place-items-center text-sm text-muted-foreground">
                        Nenhum item para exibir com os filtros atuais.
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-background max-h-[440px] overflow-y-auto">
                        <div style={{ height: chartHeight }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={chartData}
                              layout="vertical"
                              margin={{ left: 175, right: 16, top: 12, bottom: 12 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                type="number"
                                domain={[0, 100]}
                                tickFormatter={(v) => `${v}%`}
                                tick={{ fontSize: 11 }}
                              />
                              <YAxis
                                type="category"
                                dataKey="criterio"
                                width={170}
                                tick={<WrappedYAxisTick />}
                              />
                              <Tooltip
                                formatter={(value: any, _name: any, props: any) => {
                                  const nota = props?.payload?.nota ?? "-";
                                  const codigo = props?.payload?.codigo ?? "";
                                  return [`${value}% (nota ${nota}/5)`, `Atingimento • cód ${codigo}`];
                                }}
                                labelFormatter={(label) => `Critério: ${label}`}
                              />
                              <Bar
                                dataKey="percentual"
                                fill="hsl(var(--primary))"
                                radius={[6, 6, 6, 6]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* LISTA (COM PROGRESS E STATUS) */}
                <Card className="bg-card border">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold">Lista de critérios</p>
                        <p className="text-[11px] text-muted-foreground">
                          Ordenado do pior para o melhor (priorização).
                        </p>
                      </div>
                      <Badge variant="outline" className="text-[11px]">
                        {avalFiltrada.length}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0">
                    {!avalLoading && !avalFiltrada.length ? (
                      <div className="py-6 text-sm text-muted-foreground">
                        Nenhum critério com os filtros atuais.
                      </div>
                    ) : (
                      <div className="rounded-xl border bg-background">
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-muted-foreground border-b">
                          <div className="col-span-2">Cód</div>
                          <div className="col-span-7">Critério</div>
                          <div className="col-span-3 text-right">Nota / %</div>
                        </div>

                        <div className="max-h-[440px] overflow-y-auto divide-y">
                          {avalLoading ? (
                            <div className="px-3 py-6 text-sm text-muted-foreground">
                              Carregando…
                            </div>
                          ) : (
                            avalFiltrada.map((a) => {
                              const tone = toneFromPercent(a.percentual);
                              return (
                                <div key={`${a.codigo}-${a.descr}`} className="px-3 py-2">
                                  <div className="grid grid-cols-12 gap-2 items-start">
                                    <div className="col-span-2">
                                      <Badge variant="outline" className="text-[10px]">
                                        {a.codigo}
                                      </Badge>
                                    </div>

                                    <div className="col-span-7 whitespace-normal break-words leading-snug text-xs">
                                      {a.descr}

                                      <div className="mt-2">
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                          <span>{tone.label}</span>
                                          <span className="font-medium text-foreground">
                                            {a.percentual}%
                                          </span>
                                        </div>
                                        <Progress value={a.percentual} className="h-1.5 mt-1" />
                                      </div>
                                    </div>

                                    <div className="col-span-3 text-right">
                                      <Badge variant="outline" className={`text-[10px] ${tone.cls}`}>
                                        {a.pontuacao}/5 • {a.percentual}%
                                      </Badge>
                                      <div className="text-[10px] text-muted-foreground mt-1">
                                        {notaLabel(a.pontuacao)}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Modal Nova avaliação (mantido) */}
              <Dialog.Root
                open={novoOpen}
                onOpenChange={(o) => (o ? setNovoOpen(true) : fecharNovaAvaliacao())}
              >
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />

                  <Dialog.Content
                    className="
                      fixed left-1/2 top-1/2
                      z-[60]
                      w-[92vw] max-w-[980px]
                      -translate-x-1/2 -translate-y-1/2
                      rounded-2xl
                      bg-white
                      text-slate-900
                      opacity-100
                      border border-slate-200
                      p-4 shadow-2xl outline-none
                      max-h-[90vh] overflow-y-auto
                    "
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                      <div>
                        <Dialog.Title className="text-base font-semibold">
                          Nova avaliação comportamental
                        </Dialog.Title>
                        <Dialog.Description className="text-xs text-slate-600">
                          Selecione uma nota de <strong>1 a 5</strong> para cada
                          critério • DTREF = <strong>{checkinAno}</strong>
                        </Dialog.Description>
                      </div>

                      <Dialog.Close asChild>
                        <Button variant="ghost" size="icon" aria-label="Fechar">
                          <X className="h-4 w-4" />
                        </Button>
                      </Dialog.Close>
                    </div>

                    <div className="mt-4">
                      {criteriosLoading ? (
                        <div className="py-6 text-sm text-slate-600">
                          Carregando critérios…
                        </div>
                      ) : criteriosErro ? (
                        <div className="py-6 text-sm text-red-600">
                          {criteriosErro}
                        </div>
                      ) : !criterios.length ? (
                        <div className="py-6 text-sm text-slate-600">
                          Nenhum critério.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {criterios.map((c) => {
                            const v = notas[c.cod] ?? "";
                            return (
                              <div
                                key={c.cod}
                                className="rounded-xl border border-slate-200 bg-white p-3"
                              >
                                <p className="text-sm font-semibold whitespace-normal break-words">
                                  {c.cod} - {c.descr}
                                </p>

                                <select
                                  className="
                                    mt-3 w-full rounded-md
                                    border border-slate-200
                                    bg-white text-slate-900
                                    px-3 py-2 text-xs
                                    focus:outline-none focus:ring-2 focus:ring-slate-300
                                  "
                                  value={v}
                                  onChange={(e) => {
                                    const val = e.target.value
                                      ? Number(e.target.value)
                                      : 0;
                                    setNotas((prev) => {
                                      const next = { ...prev };
                                      if (!val) delete next[c.cod];
                                      else next[c.cod] = val;
                                      return next;
                                    });
                                  }}
                                >
                                  <option value="">Selecione…</option>
                                  {NOTE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
                      <Button variant="outline" onClick={fecharNovaAvaliacao}>
                        Cancelar
                      </Button>
                      <Button
                        onClick={salvarNovaAvaliacao}
                        disabled={salvandoAvaliacao || !criterios.length}
                        className="gap-2"
                      >
                        <Save className="h-4 w-4" />
                        {salvandoAvaliacao ? "Salvando..." : "Salvar avaliação"}
                      </Button>
                    </div>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </>
          )}

          {/* Outras abas */}
          {tab !== "metas" && tab !== "checkin" && (
            <Card className="bg-card border-dashed text-foreground">
              <CardContent className="p-6">
                <p className="text-sm text-muted-foreground">Em construção…</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
