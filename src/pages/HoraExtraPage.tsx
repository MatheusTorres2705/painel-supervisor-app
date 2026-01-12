// src/pages/HoraExtraPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { obterReg } from "@/lib/obterReg";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { parseDatasetSaveResponse } from "@/lib/sankhyaRetorno";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import * as Dialog from "@radix-ui/react-dialog";

import {
  CheckCircle2,
  Download,
  Filter,
  RefreshCw,
  X,
  ArrowUpDown,
  FileText,
  Plus,
  ChevronsUpDown,
  Check,
  Users,
  ClipboardList,
  CalendarDays,
} from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type LiberadoFilter = "Todos" | "S" | "N";
type SortKey =
  | "funcionario"
  | "data"
  | "liberado"
  | "ini"
  | "fim"
  | "dep"
  | "codbancohoras";

type HoraExtraRow = {
  codBancoHoras: number;
  codBcoHrFun: number;
  codfunc: number;
  nomefunc: string;
  dtuso: string; // YYYY-MM-DD
  hrini: string;
  hrfin: string;
  coddep: number;
  liberado: "S" | "N";
};

type DepOpt = { coddep: number; descrdep: string };

type FuncOpt = {
  codfunc: number;
  nomefunc: string;
  coddep: number;
  descrdep: string;
  descrcargo: string;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function timeToHHMM(t: string) {
  // "22:32" -> "2232"
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return "";
  const [hh, mm] = t.split(":");
  return `${hh}${mm}`;
}

function monthInputToMMYYYY(v: string) {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return "";
  const [yyyy, mm] = v.split("-");
  return `${mm}/${yyyy}`;
}

function nowMonthInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function safeDigits(v: string) {
  return (v || "").replace(/[^\d]/g, "");
}

function safeSqlLike(v: string) {
  return String(v || "").replace(/'/g, "''");
}

function liberadoBadge(l: "S" | "N") {
  return l === "S"
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : "bg-amber-50 text-amber-800 border-amber-200";
}

const fotoUrl = (codfunc: number) =>
  `http://sankhya.nxboats.com.br:8180/mge/Funcionario@IMAGEM@CODEMP=1@CODFUNC=${codfunc}.dbimage`;

/**
 * Se no seu AD_BANCOHORAS o campo for DTUSU (e não DTUSO),
 * troque aqui para "DTUSU".
 */
const CAB_DATE_FIELD: "DTUSO" | "DTUSU" = "DTUSO";

function ymdToBrDate(ymd: string) {
  // "2026-01-12" -> "12/01/2026"
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export default function HoraExtraPage() {
  const { user } = useAuth();
  const CODUSU_SUP = Number((user as any)?.codusu || 0);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [rows, setRows] = useState<HoraExtraRow[]>([]);

  // ✅ Dialog retorno (sucesso/erro/regras)
  const [retornoOpen, setRetornoOpen] = useState(false);
  const [retornoInfo, setRetornoInfo] = useState<null | {
    title: string;
    resumo: string;
    human: string;
    tech?: string;
    transactionId?: string;
    personalization?: string;
  }>(null);

  // ================== filtros lista ==================
  const [mesRef, setMesRef] = useState<string>(nowMonthInput()); // YYYY-MM
  const [dtIni, setDtIni] = useState<string>(""); // YYYY-MM-DD
  const [dtFim, setDtFim] = useState<string>(""); // YYYY-MM-DD
  const [coddep, setCoddep] = useState<string>(""); // dígitos
  const [nomeFunc, setNomeFunc] = useState<string>(""); // filtro nome
  const [liberado, setLiberado] = useState<LiberadoFilter>("Todos");

  // ordenação
  const [sortKey, setSortKey] = useState<SortKey>("funcionario");
  const [sortAsc, setSortAsc] = useState(true);

  // modal aprovar
  const [aprovarOpen, setAprovarOpen] = useState(false);
  const [aprovarTarget, setAprovarTarget] = useState<HoraExtraRow | null>(null);
  const [aprovando, setAprovando] = useState(false);

  // ================== Novo planejamento ==================
  const [novoPlanOpen, setNovoPlanOpen] = useState(false);
  const [novoStep, setNovoStep] = useState<"cabecalho" | "detalhe">("cabecalho");

  const [planDeps, setPlanDeps] = useState<DepOpt[]>([]);
  const [planDepsLoading, setPlanDepsLoading] = useState(false);

  const [planCoddep, setPlanCoddep] = useState<number | null>(null);
  const [planDtUso, setPlanDtUso] = useState<string>(""); // YYYY-MM-DD
  const [planHrIni, setPlanHrIni] = useState<string>(""); // HH:mm
  const [planHrFin, setPlanHrFin] = useState<string>(""); // HH:mm

  const [funcs, setFuncs] = useState<FuncOpt[]>([]);
  const [funcsLoading, setFuncsLoading] = useState(false);
  const [funcQ, setFuncQ] = useState<string>("");
  const [selectedFunc, setSelectedFunc] = useState<Record<number, FuncOpt>>({});

  const [depPopoverOpen, setDepPopoverOpen] = useState(false);

  // ✅ salvar tudo (cabeçalho + funcionários)
  const [salvandoTudo, setSalvandoTudo] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ total: number; ok: number; fail: number }>({
    total: 0,
    ok: 0,
    fail: 0,
  });

  const mmYYYY = monthInputToMMYYYY(mesRef);

  // ================== Carregar lista principal ==================
  const carregar = async () => {
    if (!CODUSU_SUP) {
      setErro("CODUSU do usuário logado está ausente. Faça login novamente.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErro(null);

      const depDigits = safeDigits(coddep);
      const nome = safeSqlLike(nomeFunc.trim());
      const dtIniOk = dtIni && /^\d{4}-\d{2}-\d{2}$/.test(dtIni);
      const dtFimOk = dtFim && /^\d{4}-\d{2}-\d{2}$/.test(dtFim);

      const sql = `
        SELECT
          HR.CODBANCOHORAS,
          FUN.CODBCOHRFUN,
          F.CODFUNC,
          F.NOMEFUNC,
          TO_CHAR(HR.DTUSO, 'YYYY-MM-DD') AS DTUSO,
          HR.HRINI,
          HR.HRFIN,
          HR.CODDEP,
          NVL(FUN.LIBERADO,'N') AS LIBERADO
        FROM AD_BANCOHORAS HR
        JOIN AD_BCOFUN FUN ON FUN.CODBANCOHORAS = HR.CODBANCOHORAS
        JOIN TFPFUN F ON F.CODFUNC = FUN.CODFUNC
        WHERE F.USUVPJSUP = ${Number(CODUSU_SUP)}
          AND TO_CHAR(HR.DTUSO, 'MM/YYYY') = '${mmYYYY}'
          ${depDigits ? `AND HR.CODDEP = ${Number(depDigits)}` : ""}
          ${dtIniOk ? `AND TRUNC(HR.DTUSO) >= TO_DATE('${dtIni}', 'YYYY-MM-DD')` : ""}
          ${dtFimOk ? `AND TRUNC(HR.DTUSO) <= TO_DATE('${dtFim}', 'YYYY-MM-DD')` : ""}
          ${liberado !== "Todos" ? `AND NVL(FUN.LIBERADO,'N') = '${liberado}'` : ""}
          ${nome ? `AND UPPER(F.NOMEFUNC) LIKE '%' || UPPER('${nome}') || '%'` : ""}
        ORDER BY F.NOMEFUNC, HR.DTUSO DESC
      `.trim();

      const r = await obterReg(sql);

      const mapped: HoraExtraRow[] = r.map((x: any) => ({
        codBancoHoras: Number(x.CODBANCOHORAS),
        codBcoHrFun: Number(x.CODBCOHRFUN),
        codfunc: Number(x.CODFUNC),
        nomefunc: String(x.NOMEFUNC ?? ""),
        dtuso: String(x.DTUSO ?? ""),
        hrini: String(x.HRINI ?? ""),
        hrfin: String(x.HRFIN ?? ""),
        coddep: Number(x.CODDEP ?? 0),
        liberado: (String(x.LIBERADO ?? "N").toUpperCase() === "S" ? "S" : "N") as "S" | "N",
      }));

      setRows(mapped);
    } catch (e: any) {
      console.error("[HoraExtraPage] carregar:", e);
      setErro(e?.message || "Falha ao carregar hora extra.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesRef, dtIni, dtFim, coddep, nomeFunc, liberado, CODUSU_SUP]);

  const list = useMemo(() => {
    const data = [...rows];

    data.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case "codbancohoras":
          return (a.codBancoHoras - b.codBancoHoras) * dir;
        case "funcionario":
          return a.nomefunc.localeCompare(b.nomefunc) * dir;
        case "data":
          return a.dtuso.localeCompare(b.dtuso) * dir;
        case "liberado":
          return a.liberado.localeCompare(b.liberado) * dir;
        case "ini":
          return a.hrini.localeCompare(b.hrini) * dir;
        case "fim":
          return a.hrfin.localeCompare(b.hrfin) * dir;
        case "dep":
          return (a.coddep - b.coddep) * dir;
        default:
          return 0;
      }
    });

    return data;
  }, [rows, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((s) => !s);
    else {
      setSortKey(key);
      if (key === "data") setSortAsc(false);
      else setSortAsc(true);
    }
  };

  const resetFiltros = () => {
    setDtIni("");
    setDtFim("");
    setCoddep("");
    setNomeFunc("");
    setLiberado("Todos");
  };

  const exportCsv = () => {
    const header = [
      "mes_ref",
      "codbancohoras",
      "codbcohrfun",
      "codfunc",
      "nomefunc",
      "dtuso",
      "hrini",
      "hrfin",
      "coddep",
      "liberado",
    ];

    const body = list.map((r) => [
      mmYYYY,
      r.codBancoHoras,
      r.codBcoHrFun,
      r.codfunc,
      r.nomefunc,
      r.dtuso,
      r.hrini,
      r.hrfin,
      r.coddep,
      r.liberado,
    ]);

    const csv = [header, ...body]
      .map((row) =>
        row
          .map((v) => {
            const s = String(v ?? "");
            if (s.includes(",") || s.includes('"') || s.includes("\n"))
              return `"${s.replace(/"/g, '""')}"`;
            return s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hora_extra_${mmYYYY.replace("/", "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(12);
    doc.text(`Hora Extra — ${mmYYYY}`, 14, 14);

    doc.setFontSize(9);
    doc.text(
      `Supervisor CODUSU: ${CODUSU_SUP}  |  Filtros: dep=${safeDigits(coddep) || "todos"}  liberado=${liberado}  nome=${
        nomeFunc || "todos"
      }  dtIni=${dtIni || "-"}  dtFim=${dtFim || "-"}`,
      14,
      20
    );

    autoTable(doc, {
      startY: 26,
      head: [
        [
          "CODBANCOHORAS",
          "CODBCOHRFUN",
          "CODFUNC",
          "FUNCIONÁRIO",
          "DTUSO",
          "HRINI",
          "HRFIN",
          "CODDEP",
          "LIBERADO",
        ],
      ],
      body: list.map((r) => [
        r.codBancoHoras,
        r.codBcoHrFun,
        r.codfunc,
        r.nomefunc,
        r.dtuso,
        r.hrini,
        r.hrfin,
        r.coddep,
        r.liberado,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fontSize: 8 },
      margin: { left: 12, right: 12 },
    });

    doc.save(`hora_extra_${mmYYYY.replace("/", "-")}.pdf`);
  };

  const abrirAprovar = (r: HoraExtraRow) => {
    setAprovarTarget(r);
    setAprovarOpen(true);
  };

  const fecharAprovar = () => {
    setAprovarOpen(false);
    setAprovarTarget(null);
  };

  // ✅ APROVAR VIA dataset/save (mantido)
  const aprovar = async () => {
    if (!aprovarTarget) return;

    if (aprovarTarget.liberado === "S") {
      setRetornoInfo({
        title: "Já liberado",
        resumo: "Este registro já está com LIBERADO = S.",
        human: `Funcionário: ${aprovarTarget.nomefunc}\nData: ${aprovarTarget.dtuso}\nHorário: ${aprovarTarget.hrini} → ${aprovarTarget.hrfin}\nPK: CODBANCOHORAS ${aprovarTarget.codBancoHoras} • CODBCOHRFUN ${aprovarTarget.codBcoHrFun}`,
      });
      setRetornoOpen(true);
      fecharAprovar();
      return;
    }

    try {
      setAprovando(true);

      const payload = {
        entity: "AD_BCOFUN",
        fields: ["LIBERADO"],
        values: { "0": "S" },
        pk: {
          CODBCOHRFUN: aprovarTarget.codBcoHrFun,
          CODBANCOHORAS: aprovarTarget.codBancoHoras,
        },
      };

      const resp = await api.post("/api/sankhya/dataset/save", payload);
      const parsed = parseDatasetSaveResponse(resp.data);

      if (!parsed.ok) {
        setRetornoInfo({
          title: parsed.title,
          resumo: parsed.resumo,
          human: parsed.human,
          tech: parsed.tech,
          transactionId: parsed.transactionId,
          personalization: parsed.personalization,
        });
        setRetornoOpen(true);
        return;
      }

      setRows((prev) =>
        prev.map((x) =>
          x.codBancoHoras === aprovarTarget.codBancoHoras && x.codBcoHrFun === aprovarTarget.codBcoHrFun
            ? { ...x, liberado: "S" }
            : x
        )
      );

      fecharAprovar();
      await carregar();

      setRetornoInfo({
        title: "Hora extra liberada ✅",
        resumo: "LIBERADO = S gravado com sucesso no Sankhya.",
        human:
          `Funcionário: ${aprovarTarget.nomefunc}\n` +
          `Data: ${aprovarTarget.dtuso}\n` +
          `Horário: ${aprovarTarget.hrini} → ${aprovarTarget.hrfin}\n` +
          `Depto: ${aprovarTarget.coddep}\n` +
          `PK: CODBANCOHORAS ${aprovarTarget.codBancoHoras} • CODBCOHRFUN ${aprovarTarget.codBcoHrFun}`,
      });
      setRetornoOpen(true);
    } catch (e: any) {
      console.error("[HoraExtraPage] aprovar:", e);
      setRetornoInfo({
        title: "Falha ao aprovar",
        resumo: "Não foi possível concluir a operação.",
        human:
          e?.response?.data?.erro ||
          e?.response?.data?.detalhe?.statusMessage ||
          e?.message ||
          "Falha ao aprovar (dataset/save).",
      });
      setRetornoOpen(true);
    } finally {
      setAprovando(false);
    }
  };

  // ================== Novo planejamento: carregar combos/listas ==================
  const carregarPlanDeps = async () => {
    try {
      setPlanDepsLoading(true);
      const sql = `
        SELECT CODDEP, DESCRDEP
          FROM TFPDEP
         ORDER BY DESCRDEP
      `.trim();
      const r = await obterReg(sql);
      setPlanDeps(
        r.map((x: any) => ({
          coddep: Number(x.CODDEP),
          descrdep: String(x.DESCRDEP ?? ""),
        }))
      );
    } catch (e: any) {
      console.error("[HoraExtraPage] carregarPlanDeps:", e);
      setPlanDeps([]);
    } finally {
      setPlanDepsLoading(false);
    }
  };

  // ✅ De-dup por CODFUNC (evita “duplicando colaboradores”)
  const carregarFuncs = async () => {
    try {
      setFuncsLoading(true);
      const sql = `
        SELECT 
          FUN.CODFUNC,
          FUN.NOMEFUNC,
          FUN.CODDEP,
          DEP.DESCRDEP,
          CAR.DESCRCARGO
        FROM TFPFUN FUN
        JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
        JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
        WHERE FUN.SITUACAO <> '0'
        ORDER BY FUN.NOMEFUNC
      `.trim();

      const r = await obterReg(sql);

      const raw: FuncOpt[] = r.map((x: any) => ({
        codfunc: Number(x.CODFUNC),
        nomefunc: String(x.NOMEFUNC ?? ""),
        coddep: Number(x.CODDEP ?? 0),
        descrdep: String(x.DESCRDEP ?? ""),
        descrcargo: String(x.DESCRCARGO ?? ""),
      }));

      const map = new Map<number, FuncOpt>();
      for (const f of raw) if (!map.has(f.codfunc)) map.set(f.codfunc, f);

      setFuncs(Array.from(map.values()));
    } catch (e: any) {
      console.error("[HoraExtraPage] carregarFuncs:", e);
      setFuncs([]);
    } finally {
      setFuncsLoading(false);
    }
  };

  const resetNovoPlanejamento = () => {
    setNovoStep("cabecalho");
    setPlanCoddep(null);
    setPlanDtUso("");
    setPlanHrIni("");
    setPlanHrFin("");
    setFuncQ("");
    setSelectedFunc({});
    setSaveProgress({ total: 0, ok: 0, fail: 0 });
  };

  const abrirNovoPlanejamento = async () => {
    setNovoPlanOpen(true);
    resetNovoPlanejamento();
    await Promise.all([carregarPlanDeps(), carregarFuncs()]);
  };

  const depLabel = useMemo(() => {
    if (!planCoddep) return "";
    const d = planDeps.find((x) => x.coddep === planCoddep);
    return d ? `${d.coddep} - ${d.descrdep}` : String(planCoddep);
  }, [planCoddep, planDeps]);

  const funcsFiltrados = useMemo(() => {
    const k = funcQ.trim().toLowerCase();
    let data = [...funcs];

    if (planCoddep) {
      data = data.sort((a, b) => {
        const aIn = a.coddep === planCoddep ? 0 : 1;
        const bIn = b.coddep === planCoddep ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
        return a.nomefunc.localeCompare(b.nomefunc);
      });
    }

    if (!k) return data;

    return data.filter((f) => {
      return (
        String(f.codfunc).includes(k) ||
        f.nomefunc.toLowerCase().includes(k) ||
        f.descrdep.toLowerCase().includes(k) ||
        f.descrcargo.toLowerCase().includes(k)
      );
    });
  }, [funcs, funcQ, planCoddep]);

  const selectedList = useMemo(() => Object.values(selectedFunc), [selectedFunc]);

  const toggleSelectFunc = (f: FuncOpt) => {
    setSelectedFunc((prev) => {
      const next = { ...prev };
      if (next[f.codfunc]) delete next[f.codfunc];
      else next[f.codfunc] = f;
      return next;
    });
  };

  const canGoDetalhe = Boolean(planCoddep && planDtUso && planHrIni && planHrFin);

  // ✅ AÇÃO ÚNICA: cria cabeçalho -> busca CODBANCOHORAS -> insere funcionários
  const salvarPlanejamentoTudo = async () => {
    if (!CODUSU_SUP) {
      setRetornoInfo({
        title: "CODUSU ausente",
        resumo: "Não foi possível identificar o usuário logado.",
        human: "Faça login novamente para obter o CODUSU.",
      });
      setRetornoOpen(true);
      return;
    }

    if (!planCoddep || !planDtUso || !planHrIni || !planHrFin) {
      setRetornoInfo({
        title: "Preencha os campos",
        resumo: "Informe departamento, data e horários.",
        human:
          `CODDEP: ${planCoddep ?? "-"}\n` +
          `${CAB_DATE_FIELD}: ${planDtUso || "-"}\n` +
          `HRINI: ${planHrIni || "-"}\n` +
          `HRFIN: ${planHrFin || "-"}`,
      });
      setRetornoOpen(true);
      return;
    }

    if (!selectedList.length) {
      setRetornoInfo({
        title: "Selecione funcionários",
        resumo: "Você precisa selecionar ao menos 1 funcionário no detalhe.",
        human: "Vá na aba Funcionários e marque os colaboradores.",
      });
      setRetornoOpen(true);
      return;
    }

    const dtBr = ymdToBrDate(planDtUso);
    const hrIniHHMM = timeToHHMM(planHrIni);
    const hrFinHHMM = timeToHHMM(planHrFin);

    if (!dtBr) {
      setRetornoInfo({
        title: "Data inválida",
        resumo: "DTUSO/DTUSU inválida.",
        human: `Valor informado: ${planDtUso}`,
      });
      setRetornoOpen(true);
      return;
    }

    if (!hrIniHHMM || !hrFinHHMM) {
      setRetornoInfo({
        title: "Hora inválida",
        resumo: "HRINI/HRFIN inválidos.",
        human: `HRINI: ${planHrIni} (esperado HH:mm)\nHRFIN: ${planHrFin} (esperado HH:mm)`,
      });
      setRetornoOpen(true);
      return;
    }

    try {
      setSalvandoTudo(true);
      setSaveProgress({ total: selectedList.length, ok: 0, fail: 0 });

      // 1) INSERE CABEÇALHO
      const payloadCab = {
        entity: "AD_BANCOHORAS",
        fields: ["CODUSU", CAB_DATE_FIELD, "CODDEP", "HRINI", "HRFIN"],
        values: {
          "0": String(CODUSU_SUP),
          "1": dtBr, // "DD/MM/YYYY"
          "2": String(planCoddep),
          "3": hrIniHHMM, // "2232"
          "4": hrFinHHMM, // "2359"
        },
      };

      const respCab = await api.post("/api/sankhya/dataset/save", payloadCab);
      const parsedCab = parseDatasetSaveResponse(respCab.data);

      if (!parsedCab.ok) {
        setRetornoInfo({
          title: parsedCab.title,
          resumo: parsedCab.resumo,
          human: parsedCab.human,
          tech: parsedCab.tech,
          transactionId: parsedCab.transactionId,
          personalization: parsedCab.personalization,
        });
        setRetornoOpen(true);
        return;
      }

      // 2) BUSCA O CODIGO GERADO (conforme você pediu)
      const sqlMax = `
        SELECT MAX(CODBANCOHORAS) AS CODBANCOHORAS
          FROM AD_BANCOHORAS
         WHERE CODUSU = ${Number(CODUSU_SUP)}
      `.trim();

      const rMax = await obterReg(sqlMax);
      const codBancoHoras = Number(rMax?.[0]?.CODBANCOHORAS || 0);

      if (!codBancoHoras) {
        setRetornoInfo({
          title: "Cabeçalho criado, mas não encontrei o código",
          resumo: "A consulta MAX(CODBANCOHORAS) não retornou um valor válido.",
          human:
            `SQL executado:\n${sqlMax}\n\n` +
            `CODUSU: ${CODUSU_SUP}\n` +
            `Retorno bruto: ${JSON.stringify(rMax)?.slice(0, 1200)}`,
        });
        setRetornoOpen(true);
        return;
      }

      // 3) LOOP FUNCIONÁRIOS -> AD_BCOFUN
      const erros: Array<{ codfunc: number; nome: string; msg: string }> = [];
      let ok = 0;
      let fail = 0;

      for (const f of selectedList) {
        try {
          const payloadFun = {
            entity: "AD_BCOFUN",
            fields: ["CODBANCOHORAS", "CODEMP", "CODFUNC"],
            values: {
              "0": String(codBancoHoras),
              "1": "1",
              "2": String(f.codfunc),
            },
          };

          const respFun = await api.post("/api/sankhya/dataset/save", payloadFun);
          const parsedFun = parseDatasetSaveResponse(respFun.data);

          if (!parsedFun.ok) {
            fail++;
            erros.push({
              codfunc: f.codfunc,
              nome: f.nomefunc,
              msg: parsedFun.human || parsedFun.resumo || parsedFun.title,
            });
          } else {
            ok++;
          }
        } catch (e: any) {
          fail++;
          erros.push({
            codfunc: f.codfunc,
            nome: f.nomefunc,
            msg:
              e?.response?.data?.erro ||
              e?.response?.data?.detalhe?.statusMessage ||
              e?.message ||
              "Falha ao salvar funcionário (dataset/save).",
          });
        } finally {
          setSaveProgress((p) => ({ ...p, ok, fail }));
        }
      }

      // 4) RESULTADO
      if (erros.length) {
        setRetornoInfo({
          title: "Salvou parcialmente ⚠️",
          resumo: `Cabeçalho CODBANCOHORAS ${codBancoHoras} criado. Funcionários: ${ok} OK / ${fail} com erro.`,
          human:
            `CODBANCOHORAS: ${codBancoHoras}\n` +
            `OK: ${ok}\nERROS: ${fail}\n\n` +
            `--- ERROS (primeiros) ---\n` +
            erros
              .slice(0, 15)
              .map((x) => `• ${x.codfunc} - ${x.nome}\n  ${x.msg}`)
              .join("\n\n") +
            (erros.length > 15 ? `\n\n(+${erros.length - 15} erros...)` : ""),
          transactionId: parsedCab.transactionId,
        });
        setRetornoOpen(true);
      } else {
        setRetornoInfo({
          title: "Planejamento salvo ✅",
          resumo: `Cabeçalho + ${ok} funcionário(s) inseridos com sucesso.`,
          human:
            `CODBANCOHORAS: ${codBancoHoras}\n` +
            `CODUSU: ${CODUSU_SUP}\nCODDEP: ${planCoddep}\n${CAB_DATE_FIELD}: ${planDtUso}\n` +
            `HRINI: ${planHrIni} (${hrIniHHMM})\nHRFIN: ${planHrFin} (${hrFinHHMM})\n\n` +
            `Funcionários inseridos: ${ok}`,
          transactionId: parsedCab.transactionId,
        });
        setRetornoOpen(true);

        // fecha e reseta
        setNovoPlanOpen(false);
        resetNovoPlanejamento();
      }

      await carregar();
    } catch (e: any) {
      console.error("[HoraExtraPage] salvarPlanejamentoTudo:", e);
      setRetornoInfo({
        title: "Falha ao salvar planejamento",
        resumo: "Não foi possível concluir a ação (cabeçalho + funcionários).",
        human:
          e?.response?.data?.erro ||
          e?.response?.data?.detalhe?.statusMessage ||
          e?.message ||
          "Falha ao salvar planejamento.",
      });
      setRetornoOpen(true);
    } finally {
      setSalvandoTudo(false);
    }
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Filtros (lista) */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground">Mês</span>
          <Input type="month" value={mesRef} onChange={(e) => setMesRef(e.target.value)} className="h-9 w-[160px]" />
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground">Data (início)</span>
          <Input type="date" value={dtIni} onChange={(e) => setDtIni(e.target.value)} className="h-9 w-[160px]" />
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground">Data (fim)</span>
          <Input type="date" value={dtFim} onChange={(e) => setDtFim(e.target.value)} className="h-9 w-[160px]" />
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground">CODDEP</span>
          <Input value={coddep} onChange={(e) => setCoddep(e.target.value)} className="h-9 w-[120px]" placeholder="Ex: 12" />
        </div>

        <div className="flex flex-col">
          <span className="text-[11px] text-muted-foreground">Liberado</span>
          <select
            className="h-9 w-[160px] rounded-md border bg-background px-2 text-sm"
            value={liberado}
            onChange={(e) => setLiberado(e.target.value as LiberadoFilter)}
          >
            <option value="Todos">Todos</option>
            <option value="S">Somente liberados</option>
            <option value="N">Somente pendentes</option>
          </select>
        </div>

        <div className="flex flex-col flex-1 min-w-[240px]">
          <span className="text-[11px] text-muted-foreground">Funcionário</span>
          <Input value={nomeFunc} onChange={(e) => setNomeFunc(e.target.value)} className="h-9" placeholder="Filtrar pelo nome do funcionário…" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={carregar} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>

          <Button variant="outline" size="sm" className="gap-2" onClick={resetFiltros} disabled={loading}>
            <Filter className="h-4 w-4" />
            Limpar
          </Button>

          <Button variant="secondary" size="sm" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>

          <Button variant="secondary" size="sm" className="gap-2" onClick={exportPdf}>
            <FileText className="h-4 w-4" />
            PDF
          </Button>

          <Button variant="default" size="sm" className="gap-2" onClick={abrirNovoPlanejamento}>
            <Plus className="h-4 w-4" />
            Novo planejamento
          </Button>
        </div>
      </div>

      {/* Lista */}
      <Card className="flex-1 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Hora Extra — por funcionário e data</p>
              <p className="text-[11px] text-muted-foreground">
                Supervisor CODUSU: <span className="font-medium">{CODUSU_SUP || "-"}</span> • Mês:{" "}
                <span className="font-medium">{mmYYYY || "-"}</span>
              </p>
            </div>

            <Badge variant="outline" className="text-[11px]">
              {list.length} registro(s)
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {erro && <div className="px-4 pb-3 text-sm text-red-600">{erro}</div>}

          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("codbancohoras")}>
                    Cód <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-4 text-left inline-flex items-center gap-1" onClick={() => toggleSort("funcionario")}>
                    Funcionário <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("data")}>
                    Data <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-1 text-left inline-flex items-center gap-1" onClick={() => toggleSort("dep")}>
                    Depto <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-1 text-left inline-flex items-center gap-1" onClick={() => toggleSort("ini")}>
                    Início <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-1 text-left inline-flex items-center gap-1" onClick={() => toggleSort("fim")}>
                    Fim <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-1 text-right inline-flex items-center justify-end gap-1" onClick={() => toggleSort("liberado")}>
                    Lib. <ArrowUpDown className="h-3 w-3" />
                  </button>
                </div>
              </div>

              <div className="divide-y">
                {list.map((r) => (
                  <div
                    key={`${r.codBancoHoras}-${r.codBcoHrFun}`}
                    className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-muted/40 transition"
                  >
                    <div className="col-span-2">
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="text-[11px]">
                          {r.codBancoHoras}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">Cód: {r.codBcoHrFun}</span>
                      </div>
                    </div>

                    <div className="col-span-4 min-w-0">
                      <p className="text-sm font-medium truncate">{r.nomefunc}</p>
                      <p className="text-[11px] text-muted-foreground">CODFUNC {r.codfunc}</p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-sm font-medium">{r.dtuso}</p>
                      <p className="text-[11px] text-muted-foreground">DTUSO</p>
                    </div>

                    <div className="col-span-1">
                      <Badge variant="secondary" className="text-[11px]">
                        {r.coddep}
                      </Badge>
                    </div>

                    <div className="col-span-1">
                      <p className="text-sm font-medium">{r.hrini}</p>
                    </div>

                    <div className="col-span-1">
                      <p className="text-sm font-medium">{r.hrfin}</p>
                    </div>

                    <div className="col-span-1 text-right">
                      <Badge variant="outline" className={`text-[10px] ${liberadoBadge(r.liberado)}`}>
                        {r.liberado}
                      </Badge>
                    </div>

                    <div className="col-span-12 flex justify-end gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => abrirAprovar(r)}
                        disabled={r.liberado === "S"}
                        title={r.liberado === "S" ? "Já liberado" : "Aprovar e marcar LIBERADO = S"}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        {r.liberado === "S" ? "Liberado" : "Aprovar"}
                      </Button>
                    </div>
                  </div>
                ))}

                {!list.length && <div className="p-6 text-sm text-muted-foreground">Nenhum registro encontrado com os filtros atuais.</div>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Aprovar */}
      <Dialog.Root open={aprovarOpen} onOpenChange={(o) => (o ? setAprovarOpen(true) : fecharAprovar())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content
            className="
              fixed left-1/2 top-1/2 z-[60]
              w-[92vw] max-w-[560px]
              -translate-x-1/2 -translate-y-1/2
              rounded-2xl bg-white text-slate-900
              border border-slate-200 p-4 shadow-2xl outline-none
            "
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">Aprovar hora extra</Dialog.Title>
                <Dialog.Description className="text-xs text-slate-600">
                  Isso vai gravar <strong>LIBERADO = "S"</strong> em <code>AD_BCOFUN</code> via{" "}
                  <code>/api/sankhya/dataset/save</code>.
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar" disabled={aprovando}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Registro</p>
                <p className="font-medium">
                  #{aprovarTarget?.codBancoHoras} • PKFUN {aprovarTarget?.codBcoHrFun}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {aprovarTarget?.nomefunc} • {aprovarTarget?.dtuso} • {aprovarTarget?.hrini} → {aprovarTarget?.hrfin} • CODDEP{" "}
                  {aprovarTarget?.coddep} • Atual: <strong>{aprovarTarget?.liberado}</strong>
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={fecharAprovar} disabled={aprovando}>
                Cancelar
              </Button>
              <Button onClick={aprovar} disabled={aprovando || aprovarTarget?.liberado === "S"} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {aprovando ? "Aprovando..." : "Aprovar"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Novo Planejamento */}
      <Dialog.Root open={novoPlanOpen} onOpenChange={(o) => (o ? setNovoPlanOpen(true) : setNovoPlanOpen(false))}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content
            className="
              fixed left-1/2 top-1/2 z-[80]
              w-[94vw] max-w-[1100px]
              -translate-x-1/2 -translate-y-1/2
              rounded-2xl bg-white text-slate-900
              border border-slate-200 shadow-2xl outline-none
              max-h-[88vh] overflow-hidden
            "
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-2">
              <div>
                <Dialog.Title className="text-base font-semibold flex items-center gap-3">
                  <ClipboardList className="h-6 w-6" />
                  Novo planejamento de hora extra
                </Dialog.Title>
              </div>

              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setNovoPlanOpen(false)} disabled={salvandoTudo}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            {/* Stepper */}
            <div className="px-4 pt-3 flex items-center gap-2">
              <Button
                variant={novoStep === "cabecalho" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setNovoStep("cabecalho")}
                disabled={salvandoTudo}
              >
                <CalendarDays className="h-4 w-4" />
                Cabeçalho
              </Button>
              <Button
                variant={novoStep === "detalhe" ? "default" : "outline"}
                size="sm"
                className="gap-2"
                onClick={() => setNovoStep("detalhe")}
                disabled={!canGoDetalhe || salvandoTudo}
                title={!canGoDetalhe ? "Preencha CODDEP, data e horas para avançar" : ""}
              >
                <Users className="h-4 w-4" />
                Funcionários
              </Button>

              <div className="ml-auto flex items-center gap-2">
                <Badge variant="outline" className="text-[11px]">
                  Selecionados: {selectedList.length}
                </Badge>
                {salvandoTudo && (
                  <Badge variant="outline" className="text-[11px]">
                    Salvando: {saveProgress.ok}/{saveProgress.total} (falhas {saveProgress.fail})
                  </Badge>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="p-4 pt-3 h-[calc(88vh-160px)] overflow-y-auto">
              {novoStep === "cabecalho" ? (
                <div className="grid grid-cols-12 gap-4">
                  <Card className="col-span-12">
                    <CardHeader className="pb-2">
                      <p className="text-sm font-semibold">Cabeçalho (AD_BANCOHORAS)</p>
                      <p className="text-[11px] text-muted-foreground">Preencha os dados básicos da solicitação.</p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-10 gap-2">
                        <div className="col-span-10 md:col-span-4">
                          <span className="text-[11px] text-muted-foreground">Departamento (CODDEP)</span>

                          <Popover open={depPopoverOpen} onOpenChange={setDepPopoverOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                role="combobox"
                                className="w-full justify-between mt-1 h-9 px-3 font-normal"
                                disabled={planDepsLoading || salvandoTudo}
                              >
                                <span className="truncate">
                                  {planDepsLoading ? "Carregando departamentos..." : depLabel || "Selecione o departamento"}
                                </span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                              </Button>
                            </PopoverTrigger>

                            <PopoverContent
                              align="start"
                              sideOffset={8}
                              className="w-[500px] p-0 bg-white z-[120] shadow-2xl border border-slate-100"
                            >
                              <Command>
                                <CommandInput placeholder="Buscar por cód ou descrição." />
                                <CommandList className="max-h-[220px] overflow-y-auto">
                                  <CommandEmpty>Nenhum departamento encontrado.</CommandEmpty>
                                  <CommandGroup>
                                    {planDeps.map((d) => (
                                      <CommandItem
                                        key={d.coddep}
                                        value={`${d.coddep} - ${d.descrdep}`}
                                        onSelect={() => {
                                          setPlanCoddep(d.coddep);
                                          setDepPopoverOpen(false);
                                        }}
                                      >
                                        <Check className={`mr-2 h-4 w-4 ${planCoddep === d.coddep ? "opacity-100" : "opacity-0"}`} />
                                        <span className="text-sm">
                                          {d.coddep} - {d.descrdep}
                                        </span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>

                        <div className="col-span-10 md:col-span-3">
                          <span className="text-[11px] text-muted-foreground">{CAB_DATE_FIELD}</span>
                          <Input type="date" value={planDtUso} onChange={(e) => setPlanDtUso(e.target.value)} className="h-9 mt-1" disabled={salvandoTudo} />
                        </div>

                        <div className="col-span-5 md:col-span-1">
                          <span className="text-[11px] text-muted-foreground">HRINI</span>
                          <Input type="time" value={planHrIni} onChange={(e) => setPlanHrIni(e.target.value)} className="h-9 mt-1" disabled={salvandoTudo} />
                        </div>

                        <div className="col-span-5 md:col-span-2">
                          <span className="text-[11px] text-muted-foreground">HRFIN</span>
                          <Input type="time" value={planHrFin} onChange={(e) => setPlanHrFin(e.target.value)} className="h-9 mt-1" disabled={salvandoTudo} />
                        </div>

                        <div className="col-span-10 mt-2">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <p className="text-xs text-slate-600 font-medium">Resumo</p>
                            <p className="text-sm text-slate-800 mt-1">
                              Departamento: <strong>{planCoddep ?? "-"}</strong> • Data:{" "}
                              <strong>{planDtUso || "-"}</strong> • Hr Inicial: <strong>{planHrIni || "-"}</strong> • Hr Final:{" "}
                              <strong>{planHrFin || "-"}</strong>
                            </p>
                            <p className="text-[11px] text-slate-600 mt-1">
                              * Avance para selecionar os funcionários. Depois clique em <strong>Salvar planejamento</strong> (ação única).
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-4">
                  <Card className="col-span-12">
                    <CardHeader className="pb-2">
                      <p className="text-sm font-semibold">Detalhe (AD_BCOFUN) — Funcionários</p>
                      <p className="text-[11px] text-muted-foreground">Selecione os funcionários que farão parte da extra.</p>
                    </CardHeader>

                    <CardContent className="pt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={funcQ}
                          onChange={(e) => setFuncQ(e.target.value)}
                          className="h-9 w-[420px]"
                          placeholder="Buscar por nome, código, depto ou cargo..."
                          disabled={salvandoTudo}
                        />

                        <Badge variant="outline" className="text-[11px]">
                          CODDEP planejado: {planCoddep ?? "-"}
                        </Badge>

                        <div className="ml-auto flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedFunc({})} disabled={!selectedList.length || salvandoTudo}>
                            Limpar seleção
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 rounded-xl border overflow-hidden">
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-muted-foreground bg-slate-50 border-b">
                          <div className="col-span-1">Sel.</div>
                          <div className="col-span-5">Colaborador</div>
                          <div className="col-span-3">Departamento</div>
                          <div className="col-span-3">Cargo</div>
                        </div>

                        {funcsLoading ? (
                          <div className="px-3 py-6 text-sm text-muted-foreground">Carregando funcionários…</div>
                        ) : (
                          <div className="max-h-[52vh] overflow-y-auto divide-y">
                            {funcsFiltrados.map((f) => {
                              const checked = Boolean(selectedFunc[f.codfunc]);
                              const inDep = planCoddep ? f.coddep === planCoddep : false;

                              return (
                                <div key={f.codfunc} className="grid grid-cols-12 gap-2 px-3 py-2 items-center hover:bg-muted/40 transition">
                                  <div className="col-span-1">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleSelectFunc(f)}
                                      className="h-4 w-4 accent-black"
                                      aria-label={`Selecionar ${f.nomefunc}`}
                                      disabled={salvandoTudo}
                                    />
                                  </div>

                                  <div className="col-span-5 flex items-center gap-3 min-w-0">
                                    <Avatar className="h-9 w-9">
                                      <AvatarImage
                                        src={fotoUrl(f.codfunc)}
                                        alt={f.nomefunc}
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                          (e.currentTarget as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                      <AvatarFallback>
                                        {f.nomefunc
                                          .split(" ")
                                          .map((s) => s[0])
                                          .slice(0, 2)
                                          .join("")}
                                      </AvatarFallback>
                                    </Avatar>

                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{f.nomefunc}</p>
                                      <p className="text-[11px] text-muted-foreground">CODFUNC {f.codfunc}</p>
                                    </div>

                                    {planCoddep && (
                                      <Badge
                                        variant="outline"
                                        className={`ml-auto text-[10px] ${inDep ? "bg-emerald-50 text-emerald-800 border-emerald-200" : ""}`}
                                        title={inDep ? "Mesmo departamento do planejamento" : "Outro departamento"}
                                      >
                                        {inDep ? "OK DEP" : "OUTRO DEP"}
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="col-span-3">
                                    <p className="text-xs text-slate-700 truncate">{f.descrdep}</p>
                                    <p className="text-[11px] text-muted-foreground">CODDEP {f.coddep}</p>
                                  </div>

                                  <div className="col-span-3">
                                    <p className="text-xs text-slate-700 truncate">{f.descrcargo}</p>
                                  </div>
                                </div>
                              );
                            })}

                            {!funcsFiltrados.length && (
                              <div className="px-3 py-6 text-sm text-muted-foreground">Nenhum funcionário encontrado com o filtro atual.</div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-4 rounded-xl border border-slate-200 p-3">
                        <p className="text-xs text-slate-600 font-medium">Selecionados ({selectedList.length})</p>

                        {!selectedList.length ? (
                          <p className="text-sm text-slate-600 mt-2">Nenhum funcionário selecionado.</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {selectedList.slice(0, 30).map((s) => (
                              <Badge
                                key={s.codfunc}
                                variant="secondary"
                                className="text-[11px] cursor-pointer"
                                title={salvandoTudo ? "" : "Clique para remover"}
                                onClick={() => (salvandoTudo ? null : toggleSelectFunc(s))}
                              >
                                {s.codfunc} • {s.nomefunc}
                              </Badge>
                            ))}
                            {selectedList.length > 30 && (
                              <Badge variant="outline" className="text-[11px]">
                                +{selectedList.length - 30}…
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>

                      <p className="mt-3 text-xs text-muted-foreground">
                        * Ao clicar em <strong>Salvar planejamento</strong>, o sistema cria o cabeçalho, busca o CODBANCOHORAS e insere todos os funcionários.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-2 border-t border-slate-200 p-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (salvandoTudo) return;
                  if (novoStep === "detalhe") setNovoStep("cabecalho");
                  else setNovoPlanOpen(false);
                }}
                disabled={salvandoTudo}
              >
                {novoStep === "detalhe" ? "Voltar" : "Cancelar"}
              </Button>

              <div className="flex items-center gap-2">
                {novoStep === "cabecalho" ? (
                  <Button
                    onClick={() => setNovoStep("detalhe")}
                    disabled={!canGoDetalhe || salvandoTudo}
                    title={!canGoDetalhe ? "Preencha CODDEP, data e horas para avançar" : ""}
                    className="gap-2"
                  >
                    Próximo
                    <ArrowUpDown className="h-4 w-4 rotate-90" />
                  </Button>
                ) : (
                  <Button
                    onClick={salvarPlanejamentoTudo}
                    disabled={salvandoTudo || !canGoDetalhe || !selectedList.length}
                    className="gap-2"
                    title={!selectedList.length ? "Selecione ao menos 1 funcionário" : "Salvar cabeçalho + funcionários"}
                  >
                    <Plus className="h-4 w-4" />
                    {salvandoTudo ? `Salvando... (${saveProgress.ok}/${saveProgress.total})` : "Salvar planejamento"}
                  </Button>
                )}
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Dialog Retorno */}
      <Dialog.Root open={retornoOpen} onOpenChange={setRetornoOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content
            className="
              fixed left-1/2 top-1/2 z-[70]
              w-[92vw] max-w-[820px]
              -translate-x-1/2 -translate-y-1/2
              rounded-2xl bg-white text-slate-900
              border border-slate-200 p-4 shadow-2xl outline-none
              max-h-[85vh] overflow-y-auto
            "
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">{retornoInfo?.title || "Retorno"}</Dialog.Title>
                {retornoInfo?.transactionId ? (
                  <Dialog.Description className="text-xs text-slate-600">
                    TransactionId: <span className="font-mono">{retornoInfo.transactionId}</span>
                  </Dialog.Description>
                ) : (
                  <Dialog.Description className="text-xs text-slate-600">Mensagem formatada do processamento.</Dialog.Description>
                )}
              </div>

              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
                <p className="text-xs text-slate-500">Resumo</p>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{retornoInfo?.resumo || "-"}</pre>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Detalhes</p>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{retornoInfo?.human || "-"}</pre>

                {(retornoInfo?.tech || retornoInfo?.personalization) && (
                  <div className="mt-3 space-y-2">
                    {retornoInfo?.tech && (
                      <details className="rounded-lg border border-slate-200 p-2">
                        <summary className="cursor-pointer text-xs text-slate-600">Ver detalhes técnicos (ORA / stack)</summary>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{retornoInfo.tech}</pre>
                      </details>
                    )}

                    {retornoInfo?.personalization && (
                      <details className="rounded-lg border border-slate-200 p-2">
                        <summary className="cursor-pointer text-xs text-slate-600">Ver personalizationMessage (decodificado)</summary>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{retornoInfo.personalization}</pre>
                      </details>
                    )}
                  </div>
                )}

                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const text =
                        `${retornoInfo?.title || "Retorno"}\n\n${retornoInfo?.human || ""}\n\n` +
                        (retornoInfo?.tech ? `--- TÉCNICO ---\n${retornoInfo.tech}\n\n` : "") +
                        (retornoInfo?.transactionId ? `TransactionId: ${retornoInfo.transactionId}\n` : "");
                      navigator.clipboard?.writeText(text);
                    }}
                  >
                    Copiar
                  </Button>
                  <Button onClick={() => setRetornoOpen(false)}>Ok</Button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
