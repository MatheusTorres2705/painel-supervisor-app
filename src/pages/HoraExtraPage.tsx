// src/pages/HoraExtraPage.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { obterReg } from "@/lib/obterReg";
import { FROM_HORA_EXTRA, escopoSupervisor } from "@/services/horaExtraService";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import {
  mensagemErro,
  parseDatasetSaveResponse,
} from "@/lib/sankhyaRetorno";
import { exportCsv, int, toBR, txt, type ErpRow } from "@/lib/format";
import {
  duracaoMin,
  faixaHorario,
  formatDuracao,
  horaBR,
  mesAnterior,
  mesExtenso,
} from "@/lib/horas";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/patterns/PageHeader";
import { AsyncBoundary } from "@/components/patterns/AsyncBoundary";

import { HoraExtraResumo } from "@/components/hora-extra/HoraExtraResumo";
import { EventoCard } from "@/components/hora-extra/EventoCard";
import {
  RetornoDialog,
  type RetornoInfo,
} from "@/components/hora-extra/RetornoDialog";
import {
  NovoPlanejamentoDialog,
  type DepOpt,
  type FuncOpt,
} from "@/components/hora-extra/NovoPlanejamentoDialog";
import {
  agruparEventos,
  rowKey,
  type Evento,
  type HoraExtraRow,
} from "@/components/hora-extra/types";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type StatusFilter = "Todos" | "S" | "N";
type PeriodoTipo = "mes" | "custom";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function nowMonthInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function monthInputToMMYYYY(v: string) {
  if (!/^\d{4}-\d{2}$/.test(v)) return "";
  const [yyyy, mm] = v.split("-");
  return `${mm}/${yyyy}`;
}

/** "22:32" -> "2232", formato que o Sankhya espera na gravação. */
function timeToHHMM(t: string) {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return "";
  return t.replace(":", "");
}

function safeDigits(v: string) {
  return (v || "").replace(/[^\d]/g, "");
}

function safeSqlLike(v: string) {
  return String(v || "").replace(/'/g, "''");
}

function ymdToBrDate(ymd: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Se no seu AD_BANCOHORAS o campo for DTUSU (e não DTUSO), troque aqui.
 */
const CAB_DATE_FIELD: "DTUSO" | "DTUSU" = "DTUSO";

/* FROM_HORA_EXTRA e escopoSupervisor: services/horaExtraService (o Dashboard usa os mesmos). */

/**
 * Filtros e indicadores ficam fixos no topo só em tela larga E alta. No tablet
 * e no celular os filtros quebram em várias linhas e os indicadores empilham:
 * fixos, ocupariam a tela inteira e não sobraria espaço para a grade.
 */
const MIDIA_CABECALHO_FIXO = "(min-width: 1280px) and (min-height: 720px)";

function useCabecalhoFixo() {
  const ref = useRef<HTMLDivElement>(null);
  const [ativo, setAtivo] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MIDIA_CABECALHO_FIXO).matches
  );
  const [preso, setPreso] = useState(false);
  const [altura, setAltura] = useState(0);

  useEffect(() => {
    const mq = window.matchMedia(MIDIA_CABECALHO_FIXO);
    const aoMudar = () => setAtivo(mq.matches);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  // Altura real do bloco fixo: a barra de seleção em lote gruda logo abaixo dele.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAltura(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // "Preso" = já grudou no topo; só então ganha borda e sombra.
  useEffect(() => {
    const el = ref.current;
    const raiz = el?.closest("main");
    if (!el || !raiz || !ativo) {
      setPreso(false);
      return;
    }
    const aoRolar = () =>
      setPreso(el.getBoundingClientRect().top <= raiz.getBoundingClientRect().top + 0.5);
    aoRolar();
    raiz.addEventListener("scroll", aoRolar, { passive: true });
    return () => raiz.removeEventListener("scroll", aoRolar);
  }, [ativo]);

  return { ref, ativo, preso, altura };
}

export default function HoraExtraPage() {
  const { user } = useAuth();
  const fixo = useCabecalhoFixo();
  const CODUSU_SUP = Number(user?.codusu || 0);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [rows, setRows] = useState<HoraExtraRow[]>([]);

  const [retornoOpen, setRetornoOpen] = useState(false);
  const [retornoInfo, setRetornoInfo] = useState<RetornoInfo | null>(null);

  /* ============================ Filtros ============================ */
  // Mês e intervalo eram dois filtros que se sobrepunham no SQL: escolher
  // setembro e datas de outubro devolvia vazio sem explicar. Agora são
  // modos mutuamente exclusivos.
  const [periodoTipo, setPeriodoTipo] = useState<PeriodoTipo>("mes");
  const [mesRef, setMesRef] = useState(nowMonthInput());
  const [dtIni, setDtIni] = useState("");
  const [dtFim, setDtFim] = useState("");

  const [coddep, setCoddep] = useState("");
  const [nomeFunc, setNomeFunc] = useState("");
  const [nomeBusca, setNomeBusca] = useState(""); // valor com debounce
  const [status, setStatus] = useState<StatusFilter>("Todos");

  // Antes, cada tecla digitada disparava um SELECT no Oracle.
  useEffect(() => {
    const t = window.setTimeout(() => setNomeBusca(nomeFunc.trim()), 400);
    return () => window.clearTimeout(t);
  }, [nomeFunc]);

  const mmYYYY = monthInputToMMYYYY(mesRef);

  /* ======================= Eventos e seleção ======================= */
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set());
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());

  /* ========================= Departamentos ========================= */
  const [deps, setDeps] = useState<DepOpt[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);

  /* ====================== Comparativo mês ant. ===================== */
  const [minutosMesAnterior, setMinutosMesAnterior] = useState<number | null>(null);
  const [comparativoLoading, setComparativoLoading] = useState(false);

  /* ======================= Aprovação em lote ======================= */
  const [aprovarOpen, setAprovarOpen] = useState(false);
  const [aprovarAlvo, setAprovarAlvo] = useState<HoraExtraRow[]>([]);
  const [processando, setProcessando] = useState(false);
  const [progresso, setProgresso] = useState({ total: 0, ok: 0, fail: 0 });

  /* ====================== Remover colaborador ====================== */
  const [removerAlvo, setRemoverAlvo] = useState<HoraExtraRow[]>([]);
  const [removerTurnoVazio, setRemoverTurnoVazio] = useState(true);
  const [removendo, setRemovendo] = useState(false);

  /* ========================= Editar evento ========================= */
  const [editarEvento, setEditarEvento] = useState<Evento | null>(null);
  const [editHrIni, setEditHrIni] = useState("");
  const [editHrFin, setEditHrFin] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  /* ======================= Novo planejamento ======================= */
  const [novoPlanOpen, setNovoPlanOpen] = useState(false);
  const [funcs, setFuncs] = useState<FuncOpt[]>([]);
  const [funcsLoading, setFuncsLoading] = useState(false);
  const [salvandoPlan, setSalvandoPlan] = useState(false);
  const [planProgresso, setPlanProgresso] = useState({ total: 0, ok: 0, fail: 0 });

  const mostrarRetorno = useCallback((info: RetornoInfo) => {
    setRetornoInfo(info);
    setRetornoOpen(true);
  }, []);

  /* ==================== Carregar lista principal ==================== */
  /**
   * Setor, situação e colaborador — tudo menos o período. Separado para o
   * comparativo com o mês anterior aplicar EXATAMENTE o mesmo recorte: antes ele
   * ignorava os filtros e, com um setor selecionado, comparava as horas daquele
   * setor com o mês anterior da fábrica inteira.
   */
  const recorteSql = useMemo(() => {
    const depDigits = safeDigits(coddep);
    const nome = safeSqlLike(nomeBusca);
    return [
      depDigits ? `AND HR.CODDEP = ${Number(depDigits)}` : "",
      status !== "Todos" ? `AND NVL(FUN.LIBERADO,'N') = '${status}'` : "",
      nome ? `AND UPPER(F.NOMEFUNC) LIKE '%' || UPPER('${nome}') || '%'` : "",
    ]
      .filter(Boolean)
      .join("\n          ");
  }, [coddep, nomeBusca, status]);

  const filtrosSql = useCallback(() => {
    const dtIniOk = /^\d{4}-\d{2}-\d{2}$/.test(dtIni);
    const dtFimOk = /^\d{4}-\d{2}-\d{2}$/.test(dtFim);

    const periodo =
      periodoTipo === "mes"
        ? `AND TO_CHAR(HR.DTUSO, 'MM/YYYY') = '${mmYYYY}'`
        : [
            dtIniOk ? `AND TRUNC(HR.DTUSO) >= TO_DATE('${dtIni}', 'YYYY-MM-DD')` : "",
            dtFimOk ? `AND TRUNC(HR.DTUSO) <= TO_DATE('${dtFim}', 'YYYY-MM-DD')` : "",
          ]
            .filter(Boolean)
            .join("\n          ");

    return [periodo, recorteSql].filter(Boolean).join("\n          ");
  }, [dtIni, dtFim, periodoTipo, mmYYYY, recorteSql]);

  const carregar = useCallback(async () => {
    if (!CODUSU_SUP) {
      setErro("CODUSU do usuário logado está ausente. Faça login novamente.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErro(null);

      // DESCRDEP entrou no SELECT para a tela mostrar o nome do setor
      // em vez do código numérico.
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
          DEP.DESCRDEP,
          NVL(FUN.LIBERADO,'N') AS LIBERADO,
          SUP.CODUSU AS CODIGO_SUPERVISOR,
          SUP.NOMEUSU AS NOME_SUPERVISOR,
          SOL.NOMEUSU AS NOME_SOLICITANTE
        ${FROM_HORA_EXTRA}
        LEFT JOIN TFPDEP DEP ON DEP.CODDEP = HR.CODDEP
        WHERE ${escopoSupervisor(CODUSU_SUP)}
          ${filtrosSql()}
        ORDER BY HR.DTUSO DESC, F.NOMEFUNC
      `.trim();

      const r = await obterReg(sql);

      const mapped: HoraExtraRow[] = r.map((x: ErpRow) => {
        const ymd = txt(x.DTUSO);
        return {
          codBancoHoras: Number(x.CODBANCOHORAS),
          codBcoHrFun: Number(x.CODBCOHRFUN),
          codfunc: Number(x.CODFUNC),
          nomefunc: String(x.NOMEFUNC ?? ""),

          dtuso: ymd,
          dtusoBR: ymdToBrDate(ymd) || ymd,

          hrini: String(x.HRINI ?? ""),
          hrfin: String(x.HRFIN ?? ""),
          coddep: Number(x.CODDEP ?? 0),
          descrdep: String(x.DESCRDEP ?? ""),
          liberado: (String(x.LIBERADO ?? "N").toUpperCase() === "S" ? "S" : "N") as
            | "S"
            | "N",

          codigoSupervisor: Number(x.CODIGO_SUPERVISOR ?? 0),
          nomeSupervisor: String(x.NOME_SUPERVISOR ?? ""),
          nomeSolicitante: String(x.NOME_SOLICITANTE ?? ""),
        };
      });

      setRows(mapped);
      setSelecionados(new Set());
    } catch (e: unknown) {
      console.error("[HoraExtraPage] carregar:", e);
      setErro(mensagemErro(e, "Falha ao carregar hora extra."));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [CODUSU_SUP, filtrosSql]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* =================== Comparativo com mês anterior =================== */
  useEffect(() => {
    if (!CODUSU_SUP || periodoTipo !== "mes") {
      setMinutosMesAnterior(null);
      return;
    }

    const anterior = monthInputToMMYYYY(mesAnterior(mesRef));
    if (!anterior) return;

    let cancelado = false;

    (async () => {
      try {
        setComparativoLoading(true);
        // Consulta enxuta: só o necessário para somar a duração — mas com os
        // mesmos JOINs, escopo e recorte da lista, para os dois meses contarem
        // o mesmo universo de registros.
        const sql = `
          SELECT HR.HRINI, HR.HRFIN
          ${FROM_HORA_EXTRA}
          WHERE ${escopoSupervisor(CODUSU_SUP)}
            AND TO_CHAR(HR.DTUSO, 'MM/YYYY') = '${anterior}'
            ${recorteSql}
        `.trim();

        const r = await obterReg(sql);
        if (cancelado) return;

        const total = r.reduce(
          (acc: number, x: ErpRow) => acc + (duracaoMin(x.HRINI, x.HRFIN) ?? 0),
          0
        );
        setMinutosMesAnterior(total);
      } catch {
        // Comparativo é acessório: falha em silêncio, o KPI só não mostra a variação.
        if (!cancelado) setMinutosMesAnterior(null);
      } finally {
        if (!cancelado) setComparativoLoading(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [CODUSU_SUP, mesRef, periodoTipo, recorteSql]);

  /* ======================== Setores (filtro) ======================== */
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        setDepsLoading(true);
        const r = await obterReg(
          `SELECT CODDEP, DESCRDEP FROM TFPDEP ORDER BY DESCRDEP`
        );
        if (cancelado) return;
        setDeps(
          r.map((x: ErpRow) => ({
            coddep: int(x.CODDEP),
            descrdep: txt(x.DESCRDEP),
          }))
        );
      } catch (e) {
        console.error("[HoraExtraPage] carregarDeps:", e);
      } finally {
        if (!cancelado) setDepsLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const eventos = useMemo(
    () => agruparEventos(rows, CODUSU_SUP),
    [rows, CODUSU_SUP]
  );

  // Um único evento no resultado já abre expandido.
  const jaAutoExpandiu = useRef(false);
  useEffect(() => {
    if (jaAutoExpandiu.current || eventos.length !== 1) return;
    jaAutoExpandiu.current = true;
    setExpandidos(new Set([eventos[0].codBancoHoras]));
  }, [eventos]);

  const pendentesElegiveis = useMemo(
    () =>
      rows.filter((r) => r.liberado === "N" && r.codigoSupervisor === CODUSU_SUP),
    [rows, CODUSU_SUP]
  );

  /* ============================= Ações ============================= */
  const toggleExpandir = (codBancoHoras: number) =>
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(codBancoHoras)) next.delete(codBancoHoras);
      else next.add(codBancoHoras);
      return next;
    });

  const toggleItem = (r: HoraExtraRow) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      const k = rowKey(r);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleTodosDoEvento = (evento: Evento, marcar: boolean) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      for (const item of evento.itensAprovaveis) {
        if (item.liberado !== "N") continue;
        if (marcar) next.add(rowKey(item));
        else next.delete(rowKey(item));
      }
      return next;
    });

  const selecionadosRows = useMemo(
    () => pendentesElegiveis.filter((r) => selecionados.has(rowKey(r))),
    [pendentesElegiveis, selecionados]
  );

  const abrirAprovacao = (itens: HoraExtraRow[]) => {
    if (!itens.length) return;
    setAprovarAlvo(itens);
    setAprovarOpen(true);
  };

  /** Grava LIBERADO em AD_BCOFUN para uma lista de registros. */
  const gravarLiberado = async (itens: HoraExtraRow[], valor: "S" | "N") => {
    const falhas: Array<{ nome: string; msg: string }> = [];
    let ok = 0;

    setProcessando(true);
    setProgresso({ total: itens.length, ok: 0, fail: 0 });

    for (const item of itens) {
      try {
        const resp = await api.post("/api/sankhya/dataset/save", {
          entity: "AD_BCOFUN",
          fields: ["LIBERADO"],
          values: { "0": valor },
          pk: {
            CODBCOHRFUN: item.codBcoHrFun,
            CODBANCOHORAS: item.codBancoHoras,
          },
        });

        const parsed = parseDatasetSaveResponse(resp.data);
        if (parsed.ok) ok++;
        else
          falhas.push({
            nome: item.nomefunc,
            msg: parsed.human || parsed.resumo || parsed.title,
          });
      } catch (e: unknown) {
        falhas.push({
          nome: item.nomefunc,
          msg: mensagemErro(e, "Falha na gravação."),
        });
      } finally {
        setProgresso({ total: itens.length, ok, fail: falhas.length });
      }
    }

    setProcessando(false);
    return { ok, falhas };
  };

  const confirmarAprovacao = async () => {
    const itens = aprovarAlvo;
    const { ok, falhas } = await gravarLiberado(itens, "S");

    setAprovarOpen(false);
    setAprovarAlvo([]);
    setSelecionados(new Set());
    await carregar();

    const acao = "aprovada(s)";
    if (falhas.length) {
      mostrarRetorno({
        title: "Concluído com falhas",
        resumo: `${ok} hora(s) extra ${acao}, ${falhas.length} com erro.`,
        human: falhas
          .slice(0, 10)
          .map((f) => `• ${f.nome}: ${f.msg}`)
          .join("\n"),
        variant: "warning",
      });
    } else {
      mostrarRetorno({
        title: "Hora extra liberada",
        resumo: `${ok} registro(s) ${acao} com sucesso.`,
        human: itens
          .slice(0, 10)
          .map((i) => `• ${i.nomefunc} — ${i.dtusoBR}`)
          .join("\n"),
        variant: "success",
      });
    }
  };

  const reverter = async (r: HoraExtraRow) => {
    const { ok, falhas } = await gravarLiberado([r], "N");
    await carregar();

    if (falhas.length) {
      mostrarRetorno({
        title: "Não foi possível reverter",
        resumo: "A aprovação continua registrada no ERP.",
        human: falhas.map((f) => `• ${f.nome}: ${f.msg}`).join("\n"),
        variant: "destructive",
      });
    } else if (ok) {
      mostrarRetorno({
        title: "Aprovação revertida",
        resumo: `${r.nomefunc} voltou para pendente.`,
        human: `${r.nomefunc} — ${r.dtusoBR} • ${faixaHorario(r.hrini, r.hrfin)}`,
        variant: "info",
      });
    }
  };

  /* ====================== Remover colaborador ====================== */
  const abrirRemocao = (itens: HoraExtraRow[]) => {
    if (!itens.length) return;
    // Só o supervisor do colaborador pode remover — mesma regra da aprovação.
    const permitidos = itens.filter((r) => r.codigoSupervisor === CODUSU_SUP);
    if (!permitidos.length) return;
    setRemoverAlvo(permitidos);
    setRemoverTurnoVazio(true);
  };

  /**
   * Turnos que perderiam o último colaborador nesta remoção.
   * O cabeçalho ficaria órfão: a consulta principal usa INNER JOIN em
   * AD_BCOFUN, então um turno sem ninguém some da tela e não há como limpá-lo.
   */
  const turnosQueFicamVazios = useMemo(() => {
    if (!removerAlvo.length) return [];
    const removidosPorEvento = new Map<number, number>();
    for (const r of removerAlvo) {
      removidosPorEvento.set(
        r.codBancoHoras,
        (removidosPorEvento.get(r.codBancoHoras) ?? 0) + 1
      );
    }
    return eventos.filter(
      (e) => (removidosPorEvento.get(e.codBancoHoras) ?? 0) >= e.itens.length
    );
  }, [removerAlvo, eventos]);

  const aprovadosNaRemocao = removerAlvo.filter((r) => r.liberado === "S").length;

  const confirmarRemocao = async () => {
    const itens = removerAlvo;
    const falhas: Array<{ nome: string; msg: string }> = [];
    let ok = 0;

    try {
      setRemovendo(true);
      setProgresso({ total: itens.length, ok: 0, fail: 0 });

      // Um por vez para conseguir atribuir a falha ao colaborador certo
      // (o endpoint aceita `pks[]` em lote, mas aí o erro vem sem dono).
      for (const item of itens) {
        try {
          const resp = await api.post("/api/sankhya/dataset/remove", {
            entity: "AD_BCOFUN",
            pks: [
              {
                CODBANCOHORAS: item.codBancoHoras,
                CODBCOHRFUN: item.codBcoHrFun,
              },
            ],
          });

          const parsed = parseDatasetSaveResponse(resp.data);
          if (parsed.ok) ok++;
          else
            falhas.push({
              nome: item.nomefunc,
              msg: parsed.human || parsed.resumo || parsed.title,
            });
        } catch (e: unknown) {
          falhas.push({
            nome: item.nomefunc,
            msg: mensagemErro(e, "Falha ao remover."),
          });
        } finally {
          setProgresso({ total: itens.length, ok, fail: falhas.length });
        }
      }

      // Limpa os cabeçalhos que ficaram sem ninguém, se o usuário pediu e
      // se todos os colaboradores daquele turno saíram de fato.
      const turnosRemovidos: string[] = [];
      if (removerTurnoVazio && !falhas.length) {
        for (const evento of turnosQueFicamVazios) {
          try {
            await api.post("/api/sankhya/dataset/remove", {
              entity: "AD_BANCOHORAS",
              pks: [{ CODBANCOHORAS: evento.codBancoHoras }],
            });
            turnosRemovidos.push(evento.dtusoBR);
          } catch (e: unknown) {
            falhas.push({
              nome: `Turno de ${evento.dtusoBR}`,
              msg: mensagemErro(e, "Falha ao remover o turno."),
            });
          }
        }
      }

      setRemoverAlvo([]);
      setSelecionados(new Set());
      await carregar();

      if (falhas.length) {
        mostrarRetorno({
          title: ok ? "Removido parcialmente" : "Não foi possível remover",
          resumo: `${ok} remoção(ões) concluída(s), ${falhas.length} com erro.`,
          human: falhas
            .slice(0, 10)
            .map((f) => `• ${f.nome}: ${f.msg}`)
            .join("\n"),
          variant: ok ? "warning" : "destructive",
        });
      } else {
        const parteColab =
          ok === 1 ? "1 colaborador removido" : `${ok} colaboradores removidos`;
        const parteTurno =
          turnosRemovidos.length === 0
            ? ""
            : turnosRemovidos.length === 1
              ? `. O turno de ${turnosRemovidos[0]}, que ficou vazio, também foi apagado`
              : `. Os ${turnosRemovidos.length} turnos que ficaram vazios também foram apagados`;

        mostrarRetorno({
          title: ok === 1 ? "Colaborador removido" : "Colaboradores removidos",
          resumo: `${parteColab} do ERP${parteTurno}.`,
          human: itens
            .slice(0, 10)
            .map((i) => `• ${i.nomefunc} — ${i.dtusoBR}`)
            .join("\n"),
          variant: "success",
        });
      }
    } finally {
      setRemovendo(false);
    }
  };

  /* ========================= Editar evento ========================= */
  const abrirEdicao = (evento: Evento) => {
    setEditarEvento(evento);
    setEditHrIni(horaBR(evento.hrini));
    setEditHrFin(horaBR(evento.hrfin));
  };

  const salvarEdicao = async () => {
    if (!editarEvento) return;

    const hrIni = timeToHHMM(editHrIni);
    const hrFin = timeToHHMM(editHrFin);

    if (!hrIni || !hrFin) {
      mostrarRetorno({
        title: "Horário inválido",
        resumo: "Informe início e fim no formato HH:mm.",
        human: `Início: ${editHrIni || "—"}\nFim: ${editHrFin || "—"}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setSalvandoEdicao(true);

      const resp = await api.post("/api/sankhya/dataset/save", {
        entity: "AD_BANCOHORAS",
        fields: ["HRINI", "HRFIN"],
        values: { "0": hrIni, "1": hrFin },
        pk: { CODBANCOHORAS: editarEvento.codBancoHoras },
      });

      const parsed = parseDatasetSaveResponse(resp.data);

      if (!parsed.ok) {
        mostrarRetorno({
          title: parsed.title,
          resumo: parsed.resumo,
          human: parsed.human,
          tech: parsed.tech,
          transactionId: parsed.transactionId,
          personalization: parsed.personalization,
          variant: "destructive",
        });
        return;
      }

      setEditarEvento(null);
      await carregar();

      mostrarRetorno({
        title: "Horário atualizado",
        resumo: `O turno passou a valer para os ${editarEvento.itens.length} colaborador(es) do evento.`,
        human: `${editarEvento.dtusoBR} • ${editHrIni} → ${editHrFin}`,
        variant: "success",
      });
    } catch (e: unknown) {
      mostrarRetorno({
        title: "Falha ao atualizar horário",
        resumo: "Não foi possível gravar a alteração.",
        human: mensagemErro(e, "Não foi possível gravar a alteração."),
        variant: "destructive",
      });
    } finally {
      setSalvandoEdicao(false);
    }
  };

  /* ======================= Novo planejamento ======================= */
  const carregarFuncs = async () => {
    try {
      setFuncsLoading(true);
      const r = await obterReg(
        `
        SELECT
          FUN.CODFUNC, FUN.NOMEFUNC, FUN.CODDEP,
          DEP.DESCRDEP, CAR.DESCRCARGO
        FROM TFPFUN FUN
        JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
        JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
        WHERE FUN.SITUACAO <> '0'
        ORDER BY FUN.NOMEFUNC
      `.trim()
      );

      // De-dup por CODFUNC.
      const mapa = new Map<number, FuncOpt>();
      for (const x of r as ErpRow[]) {
        const codfunc = int(x.CODFUNC);
        if (mapa.has(codfunc)) continue;
        mapa.set(codfunc, {
          codfunc,
          nomefunc: txt(x.NOMEFUNC),
          coddep: int(x.CODDEP),
          descrdep: txt(x.DESCRDEP),
          descrcargo: txt(x.DESCRCARGO),
        });
      }
      setFuncs(Array.from(mapa.values()));
    } catch (e) {
      console.error("[HoraExtraPage] carregarFuncs:", e);
      setFuncs([]);
    } finally {
      setFuncsLoading(false);
    }
  };

  const abrirNovoPlanejamento = async () => {
    setNovoPlanOpen(true);
    if (!funcs.length) await carregarFuncs();
  };

  /** Cria o cabeçalho, recupera o CODBANCOHORAS e insere os colaboradores. */
  const salvarPlanejamento = async (dados: {
    coddep: number;
    data: string;
    hrIni: string;
    hrFin: string;
    funcionarios: FuncOpt[];
  }) => {
    const dtBr = ymdToBrDate(dados.data);
    const hrIniHHMM = timeToHHMM(dados.hrIni);
    const hrFinHHMM = timeToHHMM(dados.hrFin);

    if (!dtBr || !hrIniHHMM || !hrFinHHMM) {
      mostrarRetorno({
        title: "Dados inválidos",
        resumo: "Verifique a data e os horários informados.",
        human: `Data: ${dados.data}\nInício: ${dados.hrIni}\nFim: ${dados.hrFin}`,
        variant: "destructive",
      });
      return;
    }

    try {
      setSalvandoPlan(true);
      setPlanProgresso({ total: dados.funcionarios.length, ok: 0, fail: 0 });

      // 1) Cabeçalho
      const respCab = await api.post("/api/sankhya/dataset/save", {
        entity: "AD_BANCOHORAS",
        fields: ["CODUSU", CAB_DATE_FIELD, "CODDEP", "HRINI", "HRFIN"],
        values: {
          "0": String(CODUSU_SUP),
          "1": dtBr,
          "2": String(dados.coddep),
          "3": hrIniHHMM,
          "4": hrFinHHMM,
        },
      });

      const parsedCab = parseDatasetSaveResponse(respCab.data);
      if (!parsedCab.ok) {
        mostrarRetorno({
          title: parsedCab.title,
          resumo: parsedCab.resumo,
          human: parsedCab.human,
          tech: parsedCab.tech,
          transactionId: parsedCab.transactionId,
          personalization: parsedCab.personalization,
          variant: "destructive",
        });
        return;
      }

      // 2) Recupera o código gerado
      const rMax = await obterReg(
        `SELECT MAX(CODBANCOHORAS) AS CODBANCOHORAS FROM AD_BANCOHORAS WHERE CODUSU = ${Number(
          CODUSU_SUP
        )}`
      );
      const codBancoHoras = Number(rMax?.[0]?.CODBANCOHORAS || 0);

      if (!codBancoHoras) {
        mostrarRetorno({
          title: "Turno criado, mas sem código",
          resumo: "O cabeçalho foi gravado, porém não foi possível recuperar o código para vincular os colaboradores.",
          human: "Abra o planejamento novamente e verifique se o turno aparece na lista antes de recriá-lo.",
          tech: `MAX(CODBANCOHORAS) retornou: ${JSON.stringify(rMax)?.slice(0, 600)}`,
          variant: "warning",
        });
        return;
      }

      // 3) Colaboradores
      const falhas: Array<{ nome: string; msg: string }> = [];
      let ok = 0;

      for (const f of dados.funcionarios) {
        try {
          const respFun = await api.post("/api/sankhya/dataset/save", {
            entity: "AD_BCOFUN",
            fields: ["CODBANCOHORAS", "CODEMP", "CODFUNC"],
            values: {
              "0": String(codBancoHoras),
              "1": "1",
              "2": String(f.codfunc),
            },
          });

          const parsedFun = parseDatasetSaveResponse(respFun.data);
          if (parsedFun.ok) ok++;
          else
            falhas.push({
              nome: f.nomefunc,
              msg: parsedFun.human || parsedFun.resumo || parsedFun.title,
            });
        } catch (e: unknown) {
          falhas.push({
            nome: f.nomefunc,
            msg: mensagemErro(e, "Falha ao vincular colaborador."),
          });
        } finally {
          setPlanProgresso({
            total: dados.funcionarios.length,
            ok,
            fail: falhas.length,
          });
        }
      }

      await carregar();

      if (falhas.length) {
        mostrarRetorno({
          title: "Planejamento salvo parcialmente",
          resumo: `Turno criado. ${ok} colaborador(es) vinculado(s), ${falhas.length} com erro.`,
          human: falhas
            .slice(0, 10)
            .map((f) => `• ${f.nome}: ${f.msg}`)
            .join("\n"),
          transactionId: parsedCab.transactionId,
          variant: "warning",
        });
      } else {
        setNovoPlanOpen(false);
        mostrarRetorno({
          title: "Planejamento salvo",
          resumo: `${ok} colaborador(es) em ${toBR(dados.data)}, ${dados.hrIni} → ${dados.hrFin}.`,
          human: `Total planejado: ${formatDuracao(
            (duracaoMin(dados.hrIni, dados.hrFin) ?? 0) * ok
          )}`,
          transactionId: parsedCab.transactionId,
          variant: "success",
        });
      }
    } catch (e: unknown) {
      console.error("[HoraExtraPage] salvarPlanejamento:", e);
      mostrarRetorno({
        title: "Falha ao salvar planejamento",
        resumo: "Não foi possível concluir a operação.",
        human: mensagemErro(e, "Não foi possível concluir a operação."),
        variant: "destructive",
      });
    } finally {
      setSalvandoPlan(false);
    }
  };

  /* ========================== Exportações ========================== */
  const periodoLabel =
    periodoTipo === "mes"
      ? mesExtenso(mesRef)
      : `${toBR(dtIni) || "início"} a ${toBR(dtFim) || "hoje"}`;

  const baixarCsv = () =>
    exportCsv(
      "hora_extra",
      [
        "periodo",
        "data",
        "colaborador",
        "matricula",
        "setor",
        "inicio",
        "fim",
        "duracao_horas",
        "situacao",
        "supervisor",
        "solicitante",
      ],
      rows.map((r) => [
        periodoLabel,
        r.dtusoBR,
        r.nomefunc,
        r.codfunc,
        r.descrdep || r.coddep,
        horaBR(r.hrini),
        horaBR(r.hrfin),
        ((duracaoMin(r.hrini, r.hrfin) ?? 0) / 60).toFixed(2).replace(".", ","),
        r.liberado === "S" ? "Aprovado" : "Pendente",
        r.nomeSupervisor,
        r.nomeSolicitante,
      ])
    );

  const baixarPdf = () => {
    const doc = new jsPDF({ orientation: "landscape" });

    doc.setFontSize(14);
    doc.text("Hora Extra", 14, 15);
    doc.setFontSize(9);
    doc.text(`Período: ${periodoLabel}`, 14, 21);

    const totalMin = rows.reduce(
      (acc, r) => acc + (duracaoMin(r.hrini, r.hrfin) ?? 0),
      0
    );
    const pendMin = rows
      .filter((r) => r.liberado === "N")
      .reduce((acc, r) => acc + (duracaoMin(r.hrini, r.hrfin) ?? 0), 0);

    doc.text(
      `Total: ${formatDuracao(totalMin)}  •  Pendente de aprovação: ${formatDuracao(
        pendMin
      )}  •  ${rows.length} registro(s)`,
      14,
      26
    );

    autoTable(doc, {
      startY: 32,
      head: [
        ["Data", "Colaborador", "Setor", "Início", "Fim", "Duração", "Situação", "Solicitante"],
      ],
      body: rows.map((r) => [
        r.dtusoBR,
        r.nomefunc,
        r.descrdep || String(r.coddep),
        horaBR(r.hrini),
        horaBR(r.hrfin),
        formatDuracao(duracaoMin(r.hrini, r.hrfin)),
        r.liberado === "S" ? "Aprovado" : "Pendente",
        r.nomeSolicitante,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [11, 61, 87], fontSize: 8 },
      margin: { left: 12, right: 12 },
    });

    doc.save(`hora_extra_${periodoLabel.replace(/[^\w]+/g, "_")}.pdf`);
  };

  const limparFiltros = () => {
    setPeriodoTipo("mes");
    setMesRef(nowMonthInput());
    setDtIni("");
    setDtFim("");
    setCoddep("");
    setNomeFunc("");
    setStatus("Todos");
  };

  const minutosLote = aprovarAlvo.reduce(
    (acc, r) => acc + (duracaoMin(r.hrini, r.hrfin) ?? 0),
    0
  );

  /* ============================== UI ============================== */
  return (
    <div className="space-y-6">
      <PageHeader
        title="Hora Extra"
        description={`Planejamento e aprovação • ${periodoLabel}`}
        actions={
          <>
            <Button variant="outline" onClick={carregar} disabled={loading}>
              <RefreshCw className={loading ? "animate-spin" : undefined} />
              Atualizar
            </Button>
            <Button variant="outline" onClick={baixarCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
            <Button variant="outline" onClick={baixarPdf} disabled={!rows.length}>
              <FileText className="h-4 w-4" />
              PDF
            </Button>
            <Button onClick={abrirNovoPlanejamento}>
              <Plus className="h-4 w-4" />
              Novo planejamento
            </Button>
          </>
        }
      />

      {/* Filtros + indicadores: fixos no topo enquanto a grade rola (tela larga). */}
      <div
        ref={fixo.ref}
        className={cn(
          "z-20 space-y-3",
          fixo.ativo && "sticky top-0 -mx-6 bg-background/95 px-6 py-3 backdrop-blur transition-shadow",
          fixo.preso && "border-b border-border shadow-card"
        )}
      >
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-3 shadow-xs">
        <Field label="Período" className="w-40">
          {(p) => (
            <Select
              {...p}
              value={periodoTipo}
              onChange={(e) => setPeriodoTipo(e.target.value as PeriodoTipo)}
            >
              <option value="mes">Por mês</option>
              <option value="custom">Intervalo</option>
            </Select>
          )}
        </Field>

        {periodoTipo === "mes" ? (
          <Field label="Mês" className="w-44">
            {(p) => (
              <Input
                {...p}
                type="month"
                value={mesRef}
                onChange={(e) => setMesRef(e.target.value)}
              />
            )}
          </Field>
        ) : (
          <>
            <Field label="De" className="w-40">
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={dtIni}
                  onChange={(e) => setDtIni(e.target.value)}
                />
              )}
            </Field>
            <Field label="Até" className="w-40">
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={dtFim}
                  onChange={(e) => setDtFim(e.target.value)}
                />
              )}
            </Field>
          </>
        )}

        {/* Antes era preciso digitar o código numérico do departamento. */}
        <Field label="Setor" className="w-52">
          {(p) => (
            <Select
              {...p}
              value={coddep}
              onChange={(e) => setCoddep(e.target.value)}
              disabled={depsLoading}
            >
              <option value="">Todos os setores</option>
              {deps.map((d) => (
                <option key={d.coddep} value={String(d.coddep)}>
                  {d.descrdep}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Situação" className="w-40">
          {(p) => (
            <Select
              {...p}
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              <option value="Todos">Todas</option>
              <option value="N">Pendentes</option>
              <option value="S">Aprovadas</option>
            </Select>
          )}
        </Field>

        <Field label="Colaborador" className="min-w-[200px] flex-1">
          {(p) => (
            <Input
              {...p}
              value={nomeFunc}
              onChange={(e) => setNomeFunc(e.target.value)}
              placeholder="Buscar pelo nome…"
            />
          )}
        </Field>

        <Button variant="ghost" onClick={limparFiltros} disabled={loading}>
          <X className="h-4 w-4" />
          Limpar
        </Button>
      </div>

      <HoraExtraResumo
        parte="indicadores"
        rows={rows}
        loading={loading}
        mesRef={mesRef}
        minutosMesAnterior={minutosMesAnterior}
        comparativoLoading={comparativoLoading}
        onVerPendentes={() => setStatus("N")}
      />
      </div>

      <HoraExtraResumo
        parte="graficos"
        rows={rows}
        loading={loading}
        mesRef={mesRef}
        minutosMesAnterior={minutosMesAnterior}
        comparativoLoading={comparativoLoading}
        onVerPendentes={() => setStatus("N")}
      />

      {/* Barra de ação em lote — aparece só quando há seleção. Gruda logo abaixo
          do bloco fixo (ou no topo, quando ele não está fixo). */}
      {selecionadosRows.length > 0 ? (
        <div
          className="sticky z-10 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent-subtle p-3 shadow-card"
          style={{ top: (fixo.ativo ? fixo.altura : 0) + 8 }}
        >
          <Badge variant="accent">{selecionadosRows.length} selecionado(s)</Badge>
          <span className="tabular text-2xs text-muted-foreground">
            {formatDuracao(
              selecionadosRows.reduce(
                (acc, r) => acc + (duracaoMin(r.hrini, r.hrfin) ?? 0),
                0
              )
            )}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelecionados(new Set())}
            >
              Limpar seleção
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => abrirRemocao(selecionadosRows)}
              className="text-destructive hover:bg-destructive-subtle"
            >
              <Trash2 className="h-4 w-4" />
              Remover
            </Button>
            <Button size="sm" onClick={() => abrirAprovacao(selecionadosRows)}>
              <CheckCircle2 className="h-4 w-4" />
              Aprovar selecionados
            </Button>
          </div>
        </div>
      ) : null}

      {/* Lista de eventos */}
      <AsyncBoundary
        loading={loading}
        error={erro}
        isEmpty={eventos.length === 0}
        emptyTitle="Nenhuma hora extra no período"
        emptyDescription="Ajuste os filtros ou crie um novo planejamento."
        onRetry={carregar}
        skeleton={
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        }
      >
        <div className="space-y-3">
          {eventos.map((evento) => (
            <EventoCard
              key={evento.codBancoHoras}
              evento={evento}
              codusuSup={CODUSU_SUP}
              expandido={expandidos.has(evento.codBancoHoras)}
              onToggleExpandir={() => toggleExpandir(evento.codBancoHoras)}
              selecionados={selecionados}
              onToggleItem={toggleItem}
              onToggleTodos={toggleTodosDoEvento}
              onAprovarSelecionados={abrirAprovacao}
              onReverter={reverter}
              onEditar={abrirEdicao}
              onRemover={abrirRemocao}
              ocupado={processando || salvandoEdicao || removendo}
            />
          ))}
        </div>
      </AsyncBoundary>

      {/* ===================== Confirmar aprovação ===================== */}
      <Dialog
        open={aprovarOpen}
        onOpenChange={(v) => (processando ? null : setAprovarOpen(v))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Aprovar {aprovarAlvo.length} hora(s) extra
            </DialogTitle>
            <DialogDescription>
              Total de {formatDuracao(minutosLote)} será liberado para pagamento.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 scrollbar-slim">
            {aprovarAlvo.slice(0, 40).map((r) => (
              <li
                key={rowKey(r)}
                className="flex items-center justify-between gap-3 text-2xs"
              >
                <span className="truncate text-foreground">{r.nomefunc}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {r.dtusoBR} • {formatDuracao(duracaoMin(r.hrini, r.hrfin))}
                </span>
              </li>
            ))}
            {aprovarAlvo.length > 40 ? (
              <li className="text-2xs text-muted-foreground">
                +{aprovarAlvo.length - 40} colaborador(es)
              </li>
            ) : null}
          </ul>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setAprovarOpen(false)}
              disabled={processando}
            >
              Cancelar
            </Button>
            <Button onClick={confirmarAprovacao} disabled={processando}>
              {processando ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Aprovando {progresso.ok}/{progresso.total}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmar aprovação
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================== Remover do turno ==================== */}
      <Dialog
        open={removerAlvo.length > 0}
        onOpenChange={(v) => (removendo || v ? null : setRemoverAlvo([]))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {removerAlvo.length === 1
                ? `Remover ${removerAlvo[0].nomefunc} do turno`
                : `Remover ${removerAlvo.length} colaboradores do turno`}
            </DialogTitle>
            <DialogDescription>
              {removerAlvo.length === 1 ? "O registro é excluído" : "Os registros são excluídos"}{" "}
              do ERP. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 scrollbar-slim">
            {removerAlvo.slice(0, 40).map((r) => (
              <li
                key={rowKey(r)}
                className="flex items-center justify-between gap-3 text-2xs"
              >
                <span className="truncate text-foreground">{r.nomefunc}</span>
                <span className="tabular flex shrink-0 items-center gap-1.5 text-muted-foreground">
                  {r.dtusoBR}
                  {r.liberado === "S" ? (
                    <Badge variant="success">aprovado</Badge>
                  ) : null}
                </span>
              </li>
            ))}
            {removerAlvo.length > 40 ? (
              <li className="text-2xs text-muted-foreground">
                +{removerAlvo.length - 40} colaborador(es)
              </li>
            ) : null}
          </ul>

          {aprovadosNaRemocao > 0 ? (
            <p className="rounded-lg border border-warning/25 bg-warning-subtle px-3 py-2 text-2xs text-foreground">
              {removerAlvo.length === 1
                ? "Esta hora extra já está aprovada."
                : aprovadosNaRemocao === 1
                  ? "Uma destas horas extras já está aprovada."
                  : `${aprovadosNaRemocao} destas horas extras já estão aprovadas.`}{" "}
              Remover apaga horas já liberadas para pagamento.
            </p>
          ) : null}

          {turnosQueFicamVazios.length > 0 ? (
            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={removerTurnoVazio}
                onChange={(e) => setRemoverTurnoVazio(e.target.checked)}
                disabled={removendo}
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-2xs text-foreground">
                Apagar também{" "}
                {turnosQueFicamVazios.length === 1
                  ? `o turno de ${turnosQueFicamVazios[0].dtusoBR}`
                  : `os ${turnosQueFicamVazios.length} turnos`}
                , que {turnosQueFicamVazios.length === 1 ? "ficará" : "ficarão"}{" "}
                sem nenhum colaborador.
                <span className="mt-1 block text-muted-foreground">
                  Um turno vazio deixa de aparecer nesta tela e não há como
                  removê-lo depois.
                </span>
              </span>
            </label>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRemoverAlvo([])}
              disabled={removendo}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={confirmarRemocao}
              disabled={removendo}
            >
              {removendo ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Removendo {progresso.ok}/{progresso.total}
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Remover
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======================= Editar horário ======================= */}
      <Dialog
        open={Boolean(editarEvento)}
        onOpenChange={(v) => (salvandoEdicao ? null : v ? null : setEditarEvento(null))}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar horário do turno</DialogTitle>
            <DialogDescription>
              A alteração vale para os {editarEvento?.itens.length ?? 0}{" "}
              colaborador(es) de {editarEvento?.dtusoBR}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Início" required>
              {(p) => (
                <Input
                  {...p}
                  type="time"
                  value={editHrIni}
                  onChange={(e) => setEditHrIni(e.target.value)}
                  disabled={salvandoEdicao}
                />
              )}
            </Field>
            <Field
              label="Fim"
              required
              hint={
                duracaoMin(editHrIni, editHrFin) != null
                  ? `Duração: ${formatDuracao(duracaoMin(editHrIni, editHrFin))}`
                  : undefined
              }
            >
              {(p) => (
                <Input
                  {...p}
                  type="time"
                  value={editHrFin}
                  onChange={(e) => setEditHrFin(e.target.value)}
                  disabled={salvandoEdicao}
                />
              )}
            </Field>
          </div>

          {editarEvento && editarEvento.aprovados > 0 ? (
            <p className="rounded-lg border border-warning/25 bg-warning-subtle px-3 py-2 text-2xs text-foreground">
              Este turno já tem {editarEvento.aprovados} aprovação(ões). Alterar o
              horário muda as horas já liberadas.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setEditarEvento(null)}
              disabled={salvandoEdicao}
            >
              Cancelar
            </Button>
            <Button onClick={salvarEdicao} disabled={salvandoEdicao}>
              {salvandoEdicao ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Salvando…
                </>
              ) : (
                "Salvar horário"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NovoPlanejamentoDialog
        open={novoPlanOpen}
        onOpenChange={setNovoPlanOpen}
        deps={deps}
        depsLoading={depsLoading}
        funcs={funcs}
        funcsLoading={funcsLoading}
        salvando={salvandoPlan}
        progresso={planProgresso}
        onSalvar={salvarPlanejamento}
      />

      <RetornoDialog
        open={retornoOpen}
        onOpenChange={setRetornoOpen}
        info={retornoInfo}
      />
    </div>
  );
}
