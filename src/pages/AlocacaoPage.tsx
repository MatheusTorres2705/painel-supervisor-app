// src/pages/AlocacaoPage.tsx
// Alocação de Recursos da OP — planejamento das demandas por colaborador e dia.
//
// A página só guarda o estado e compõe as partes:
//  · dados e gravação ........ services/alocacaoService
//  · regras (carga, folga, distribuição, Gantt) ... components/alocacao/planejamento
//  · quadro, grade, lote, Gantt e diálogos ........ components/alocacao/*
//
// Pendência conhecida: o app usa BrowserRouter (sem useBlocker), então sair
// para outra rota do painel com alterações não salvas não pede confirmação —
// só fechar/recarregar a aba avisa (beforeunload).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ClipboardList, Download, FileText, RefreshCw, Save, Search, Settings2, Sparkles } from "lucide-react";

import {
  getCargaExterna,
  getColaboradores,
  getDemandas,
  salvarAlocacoes,
  trocarColaboradorErp,
  type CargaExterna,
  type Colab,
  type Demanda,
  type ItemErp,
  type ResultadoGravacao,
} from "@/services/alocacaoService";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { isoLocal } from "@/lib/datetime";
import { num, toBR } from "@/lib/format";
import { mensagemErro } from "@/lib/sankhyaRetorno";

import { AcaoLoteBar } from "@/components/alocacao/AcaoLoteBar";
import { AlocacaoResumo, type Resumo } from "@/components/alocacao/AlocacaoResumo";
import { BacklogDialog } from "@/components/alocacao/BacklogDialog";
import { CapacidadeDialog } from "@/components/alocacao/CapacidadeDialog";
import { ColabDetalheDialog } from "@/components/alocacao/ColabDetalheDialog";
import { DemandasTable } from "@/components/alocacao/DemandasTable";
import { DistribuicaoDialog } from "@/components/alocacao/DistribuicaoDialog";
import { FalhasGravacaoDialog } from "@/components/alocacao/FalhasGravacaoDialog";
import { GanttDia } from "@/components/alocacao/GanttDia";
import { QuadroCarga } from "@/components/alocacao/QuadroCarga";
import { exportarCsv, exportarPdf } from "@/components/alocacao/exportar";
import {
  MAX_DIAS_QUADRO,
  atrasoDias,
  capacidadeDoDia,
  celula,
  diasDoPeriodo,
  gravarCapacidade,
  horasPorAlocado,
  indexarCarga,
  lerCapacidade,
  ordenarDemandas,
  passaStatus,
  pendente,
  soDataAlterada,
  somarDias,
  sugerirDistribuicao,
  type OrdemDemandas,
  type StatusFiltro,
  type Sugestao,
} from "@/components/alocacao/planejamento";

const STATUS: { v: StatusFiltro; label: string }[] = [
  { v: "todas", label: "Todas" },
  { v: "sem", label: "Sem alocação" },
  { v: "alocadas", label: "Alocadas" },
  { v: "atrasadas", label: "Atrasadas" },
  { v: "pendentes", label: "Não salvas" },
];

export default function AlocacaoPage() {
  const { opId } = useParams();
  const [sp] = useSearchParams();
  const codproj = sp.get("codproj");
  const { toast, success, error: toastErro } = useToast();

  const hoje = useMemo(() => isoLocal(new Date()), []);
  const [ini, setIni] = useState(sp.get("ini") || hoje);
  const [fin, setFin] = useState(sp.get("fin") || somarDias(hoje, 5));
  const periodo = ini <= fin ? { ini, fin } : { ini: fin, fin: ini };
  const [diaGantt, setDiaGantt] = useState(sp.get("plan") || hoje);
  const [cfg, setCfg] = useState(lerCapacidade);

  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [colabs, setColabs] = useState<Colab[]>([]);
  const [externa, setExterna] = useState<CargaExterna>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingExterna, setLoadingExterna] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [erroExterna, setErroExterna] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  /** Alterações a devolver à tela depois de recarregar (as que não gravaram). */
  const reaplicar = useRef<Map<string, { alocados: number[]; dtPlan: string }>>(new Map());

  const [setorSel, setSetorSel] = useState("todos");
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<StatusFiltro>("todas");
  const [ordem, setOrdem] = useState<OrdemDemandas>({ col: "demanda", dir: "asc" });
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  const [backlogOpen, setBacklogOpen] = useState(false);
  const [capOpen, setCapOpen] = useState(false);
  const [colabDetalheId, setColabDetalheId] = useState<number | null>(null);
  const [sugestao, setSugestao] = useState<Sugestao | null>(null);
  const [salvando, setSalvando] = useState<{ feitos: number; total: number } | null>(null);
  const [falhas, setFalhas] = useState<ResultadoGravacao | null>(null);

  /* ── Carga da OP ─────────────────────────────────────────── */
  useEffect(() => {
    let cancel = false;
    (async () => {
      const idiproc = Number(opId);
      if (!opId || !Number.isFinite(idiproc)) {
        setErro(`OP inválida: ${opId ?? "(não informada)"}`);
        setLoading(false);
        return;
      }
      setLoading(true);
      setErro(null);
      try {
        const dem = await getDemandas(idiproc);
        const cols = await getColaboradores([...new Set(dem.map((d) => d.codusu).filter(Boolean))], idiproc);
        if (cancel) return;
        const volta = reaplicar.current;
        reaplicar.current = new Map();
        setDemandas(volta.size ? dem.map((d) => (volta.has(d.chave) ? { ...d, ...volta.get(d.chave)! } : d)) : dem);
        setColabs(cols);
      } catch (e: unknown) {
        if (!cancel) setErro(mensagemErro(e, "Falha ao carregar os dados da OP."));
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [opId, reload]);

  /* Outras OPs: do menor entre início e hoje até 14 dias depois do fim — cobre
     a distribuição e o Gantt nos dias vizinhos sem refazer a consulta a cada clique. */
  const faixaExterna = useMemo(
    () => ({ ini: periodo.ini < hoje ? periodo.ini : hoje, fin: somarDias(periodo.fin, 14) }),
    [periodo.ini, periodo.fin, hoje]
  );
  const idsColabs = useMemo(() => colabs.map((c) => c.id).join(","), [colabs]);
  useEffect(() => {
    if (!idsColabs) {
      setExterna(new Map());
      return;
    }
    let cancel = false;
    setLoadingExterna(true);
    setErroExterna(null);
    // Espera o PCP terminar de digitar a data antes de consultar.
    const t = window.setTimeout(async () => {
      try {
        const m = await getCargaExterna(idsColabs.split(",").map(Number), Number(opId), faixaExterna.ini, faixaExterna.fin);
        if (!cancel) setExterna(m);
      } catch (e: unknown) {
        if (!cancel) {
          setExterna(new Map());
          setErroExterna(mensagemErro(e, "Falha ao carregar a carga de outras OPs."));
        }
      } finally {
        if (!cancel) setLoadingExterna(false);
      }
    }, 400);
    return () => {
      cancel = true;
      window.clearTimeout(t);
    };
  }, [idsColabs, opId, faixaExterna.ini, faixaExterna.fin, reload]);

  /* ── Alterações não salvas ───────────────────────────────── */
  const qtdPendentes = useMemo(() => demandas.filter(pendente).length, [demandas]);
  const temAlteracao = useMemo(() => demandas.some((d) => pendente(d) || soDataAlterada(d)), [demandas]);
  useEffect(() => {
    if (!temAlteracao) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [temAlteracao]);

  /* ── Derivados ───────────────────────────────────────────── */
  const setores = useMemo(() => {
    const m = new Map<number, string>();
    demandas.forEach((d) => d.codusu && !m.has(d.codusu) && m.set(d.codusu, d.setor || String(d.codusu)));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [demandas]);
  const setorNum = setorSel === "todos" ? null : Number(setorSel);
  const setoresVisiveis = setorNum == null ? setores : setores.filter(([c]) => c === setorNum);

  const colabsVisiveis = useMemo(
    () => (setorNum == null ? colabs : colabs.filter((c) => c.codSetores.includes(setorNum))),
    [colabs, setorNum]
  );
  const colabDetalhe = colabs.find((c) => c.id === colabDetalheId) ?? null;

  const ix = useMemo(() => indexarCarga(demandas, colabs, externa), [demandas, colabs, externa]);
  const dias = useMemo(() => diasDoPeriodo(periodo.ini, periodo.fin, cfg), [periodo.ini, periodo.fin, cfg]);
  const quadroTruncado = dias.length >= MAX_DIAS_QUADRO && dias[dias.length - 1] < periodo.fin;

  /** Folga no dia; se `excluir` já conta nesse dia para o colaborador, devolve a parte dele. */
  const livreDe = useCallback(
    (cod: number, dia: string, excluir?: Demanda) => {
      let livre = celula(ix, cod, dia, cfg).livre;
      if (excluir && excluir.dtPlan === dia && excluir.alocados.includes(cod)) livre += horasPorAlocado(excluir);
      return livre;
    },
    [ix, cfg]
  );

  const noPeriodo = useCallback((d: Demanda) => d.dtDemanda >= periodo.ini && d.dtDemanda <= periodo.fin, [periodo.ini, periodo.fin]);
  const doSetor = useCallback((d: Demanda) => setorNum == null || d.codusu === setorNum, [setorNum]);

  const visiveis = useMemo(() => {
    const k = busca.trim().toLowerCase();
    // Atrasadas e não salvas ignoram o período: a atrasada é, por definição,
    // anterior a hoje (e o período começa em hoje), e a pendência pode ter
    // vindo do backlog.
    const ignoraPeriodo = status === "atrasadas" || status === "pendentes";
    return ordenarDemandas(
      demandas.filter(
        (d) =>
          doSetor(d) &&
          (ignoraPeriodo || noPeriodo(d)) &&
          passaStatus(d, status, hoje) &&
          (!k || `${d.nome} ${d.setor} ${d.codusu}`.toLowerCase().includes(k))
      ),
      ordem
    );
  }, [demandas, doSetor, noPeriodo, status, hoje, busca, ordem]);

  const resumo: Resumo = useMemo(() => {
    const base = demandas.filter((d) => doSetor(d) && noPeriodo(d));
    const atrasadas = demandas.filter((d) => doSetor(d) && atrasoDias(d, hoje) > 0);
    let capacidade = 0;
    let carga = 0;
    for (const c of colabsVisiveis) {
      for (const d of dias) {
        const x = celula(ix, c.id, d, cfg);
        capacidade += x.capacidade;
        carga += x.total;
      }
    }
    return {
      demandas: base.length,
      horas: base.reduce((s, d) => s + d.hhPrev, 0),
      alocadas: base.filter((d) => d.alocados.length).length,
      horasAlocadas: base.filter((d) => d.alocados.length).reduce((s, d) => s + d.hhPrev, 0),
      atrasadas: atrasadas.length,
      horasAtrasadas: atrasadas.reduce((s, d) => s + d.hhPrev, 0),
      pessoas: colabsVisiveis.length,
      dias: dias.length,
      capacidade,
      carga,
    };
  }, [demandas, doSetor, noPeriodo, hoje, colabsVisiveis, dias, ix, cfg]);

  /** Colaborador × dia acima da capacidade por causa do que está na tela. */
  const sobrecargas = useMemo(() => {
    const out: { nome: string; dia: string; total: number; cap: number }[] = [];
    const nome = new Map(colabs.map((c) => [c.id, c.nome]));
    for (const [cod, porDia] of ix) {
      for (const [dia, p] of porDia) {
        if (p.tela <= 0) continue;
        const cap = capacidadeDoDia(cfg, dia);
        const total = p.tela + p.erp + p.externa;
        if (total > cap + 0.01) out.push({ nome: nome.get(cod) ?? `#${cod}`, dia, total, cap });
      }
    }
    return out.sort((a, b) => a.dia.localeCompare(b.dia) || b.total - b.cap - (a.total - a.cap));
  }, [ix, colabs, cfg]);

  /* ── Edição ──────────────────────────────────────────────── */
  const alterar = (chaves: Iterable<string>, patch: (d: Demanda) => Partial<Demanda>) => {
    const alvo = new Set(chaves);
    setDemandas((arr) => arr.map((d) => (alvo.has(d.chave) ? { ...d, ...patch(d) } : d)));
  };

  const selecionar = (chaves: string[], marcar: boolean) =>
    setSelecionadas((prev) => {
      const next = new Set(prev);
      chaves.forEach((c) => (marcar ? next.add(c) : next.delete(c)));
      return next;
    });

  const selecionadasDem = useMemo(() => demandas.filter((d) => selecionadas.has(d.chave)), [demandas, selecionadas]);
  const setorComumSel = useMemo(() => {
    const s = new Set(selecionadasDem.map((d) => d.codusu));
    return s.size === 1 ? [...s][0] : undefined;
  }, [selecionadasDem]);

  const abrirDistribuicao = (alvo: Demanda[]) => {
    setSugestao(sugerirDistribuicao(alvo, colabs, ix, cfg, hoje, periodo.fin));
  };

  const aplicarDistribuicao = () => {
    if (!sugestao) return;
    const porChave = new Map(sugestao.propostas.map((p) => [p.chave, p]));
    alterar(porChave.keys(), (d) => ({ alocados: porChave.get(d.chave)!.alocados, dtPlan: porChave.get(d.chave)!.dtPlan }));
    success(`${sugestao.propostas.length} demandas distribuídas`, "Revise no quadro e salve para gravar no ERP.");
    setSugestao(null);
  };

  /* ── Gravação ────────────────────────────────────────────── */
  const salvar = async () => {
    const itens = demandas.filter(pendente);
    if (!itens.length) return;
    setSalvando({ feitos: 0, total: itens.reduce((s, d) => s + d.alocados.length, 0) });
    try {
      const r = await salvarAlocacoes(itens, (feitos, total) => setSalvando({ feitos, total }));
      const falhou = new Set(r.falhas.map((f) => f.chave));
      const volta = new Map<string, { alocados: number[]; dtPlan: string }>();
      itens.filter((d) => falhou.has(d.chave)).forEach((d) => volta.set(d.chave, { alocados: d.alocados, dtPlan: d.dtPlan }));
      demandas.filter(soDataAlterada).forEach((d) => volta.set(d.chave, { alocados: [], dtPlan: d.dtPlan }));
      reaplicar.current = volta;

      if (r.falhas.length) setFalhas(r);
      else success(`${r.gravados} ${r.gravados === 1 ? "registro gravado" : "registros gravados"} no ERP`);
      setSelecionadas(new Set());
      setReload((x) => x + 1);
    } catch (e: unknown) {
      toastErro("Falha ao salvar", mensagemErro(e));
    } finally {
      setSalvando(null);
    }
  };

  /** Recarrega do ERP sem perder o que está na tela e ainda não foi gravado. */
  const recarregarMantendoAlteracoes = () => {
    const volta = new Map<string, { alocados: number[]; dtPlan: string }>();
    demandas.filter((d) => pendente(d) || soDataAlterada(d)).forEach((d) => volta.set(d.chave, { alocados: d.alocados, dtPlan: d.dtPlan }));
    reaplicar.current = volta;
    setReload((x) => x + 1);
  };

  const trocar = async (item: ItemErp, de: Colab, para: number) => {
    const destino = colabs.find((c) => c.id === para);
    if (!window.confirm(`Trocar "${item.codprod} - ${item.descrprod}" (${toBR(item.dt)}) de ${de.nome} para ${destino?.nome ?? para}?`)) return;
    try {
      await trocarColaboradorErp(item, para);
      success("Colaborador trocado no ERP");
      // Antes a troca recarregava a tela e apagava as alocações ainda não salvas.
      recarregarMantendoAlteracoes();
    } catch (e: unknown) {
      toastErro("Não foi possível trocar", mensagemErro(e));
    }
  };

  const recarregar = () => {
    if (temAlteracao && !window.confirm("Recarregar descarta as alterações não salvas. Continuar?")) return;
    reaplicar.current = new Map();
    setSelecionadas(new Set());
    setReload((x) => x + 1);
  };

  const exportar = (tipo: "csv" | "pdf") => {
    const dados = { opId: opId ?? "", ini: periodo.ini, fin: periodo.fin, demandas, colabs: colabsVisiveis, externa };
    const ok = tipo === "csv" ? exportarCsv(dados) : exportarPdf(dados);
    if (!ok) toast({ title: "Nada para exportar", description: "Nenhum colaborador com atividade no período.", variant: "info" });
  };

  const horasSel = selecionadasDem.reduce((s, d) => s + d.hhPrev, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Alocação — OP ${opId ?? ""}`}
        description={`${codproj ? `Projeto ${codproj} · ` : ""}planeje as demandas por colaborador e dia dentro da capacidade`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setBacklogOpen(true)} disabled={loading}>
              <ClipboardList className="h-4 w-4" /> Backlog
              {resumo.atrasadas > 0 && <Badge variant="destructive" className="ml-1">{resumo.atrasadas}</Badge>}
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportar("csv")} disabled={loading}>
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportar("pdf")} disabled={loading}>
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCapOpen(true)} title="Capacidade diária">
              <Settings2 className="h-4 w-4" /> Capacidade
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={recarregar} disabled={loading} aria-label="Recarregar dados da OP">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={salvar} disabled={!!salvando || !qtdPendentes}>
              <Save className="h-4 w-4" />
              {salvando ? `Salvando ${salvando.feitos}/${salvando.total}` : `Salvar${qtdPendentes ? ` (${qtdPendentes})` : ""}`}
            </Button>
          </>
        }
      >
        <Field label="Início" className="w-[9.5rem]">
          {(p) => <Input {...p} type="date" value={ini} onChange={(e) => e.target.value && setIni(e.target.value)} />}
        </Field>
        <Field label="Fim" className="w-[9.5rem]">
          {(p) => <Input {...p} type="date" value={fin} onChange={(e) => e.target.value && setFin(e.target.value)} />}
        </Field>
        <Field label="Setor" className="w-full sm:w-56">
          {(p) => (
            <Select {...p} value={setorSel} onChange={(e) => setSetorSel(e.target.value)}>
              <option value="todos">Todos os setores</option>
              {setores.map(([cod, nome]) => (
                <option key={cod} value={String(cod)}>{cod} · {nome}</option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Buscar" className="w-full sm:w-56">
          {(p) => (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input {...p} className="pl-9" placeholder="Atividade ou setor…" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5" role="group" aria-label="Status da demanda">
          {STATUS.map((s) => (
            <Chip key={s.v} ativo={status === s.v} onClick={() => setStatus(s.v)}>
              {s.label}
              {s.v === "pendentes" && qtdPendentes > 0 ? ` (${qtdPendentes})` : ""}
            </Chip>
          ))}
        </div>
      </PageHeader>

      {erro && <Alert variant="destructive" title="Falha ao carregar">{erro}</Alert>}
      {erroExterna && (
        <Alert variant="warning" title="Carga de outras OPs indisponível">
          {erroExterna} O quadro está considerando só esta OP.
        </Alert>
      )}
      {!loading && !erro && demandas.length > 0 && colabs.length === 0 && (
        <Alert variant="warning" title="Nenhum colaborador para alocar">
          Não há colaborador ativo cujo cargo esteja ligado aos setores das demandas em AD_SETORESCARGO ({setores.map(([c]) => c).join(", ")}).
        </Alert>
      )}

      <AlocacaoResumo r={resumo} loading={loading} onBacklog={() => setBacklogOpen(true)} />

      {sobrecargas.length > 0 && (
        <Alert variant="warning" title={`${sobrecargas.length} ${sobrecargas.length === 1 ? "colaborador-dia acima" : "colaboradores-dia acima"} da capacidade`}>
          {sobrecargas.slice(0, 4).map((s) => `${s.nome} em ${toBR(s.dia)} (${num(s.total, 1)}/${num(s.cap, 1)} h)`).join(" · ")}
          {sobrecargas.length > 4 && ` · e mais ${sobrecargas.length - 4}`}
        </Alert>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pb-2 pt-4">
          <h3 className="text-base font-semibold">Carga × capacidade — {toBR(periodo.ini)} a {toBR(periodo.fin)}</h3>
          {loadingExterna && <span className="text-2xs text-muted-foreground">atualizando outras OPs…</span>}
        </div>
        <QuadroCarga
          dias={dias}
          colabs={colabsVisiveis}
          setores={setoresVisiveis}
          demandas={demandas}
          ix={ix}
          cfg={cfg}
          diaAtivo={diaGantt}
          onDia={setDiaGantt}
          onColab={setColabDetalheId}
          carregando={loading}
          truncado={quadroTruncado}
        />
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-base font-semibold">Demandas da OP</h3>
            <p className="text-2xs text-muted-foreground">
              {loading ? "Carregando…" : `${num(visiveis.length)} de ${num(demandas.length)} · marque para agir em lote`}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => abrirDistribuicao(visiveis)}
            disabled={loading || !visiveis.some((d) => !d.alocados.length)}
            title="Sugere colaborador e dia para as demandas visíveis sem alocação"
          >
            <Sparkles className="h-4 w-4" /> Distribuir sem alocação
          </Button>
        </div>
        <DemandasTable
          rows={visiveis}
          loading={loading}
          ordem={ordem}
          onOrdem={setOrdem}
          selecionadas={selecionadas}
          onSelecionar={selecionar}
          colabs={colabs}
          hoje={hoje}
          livreDe={livreDe}
          onDtPlan={(chave, dia) => alterar([chave], () => ({ dtPlan: dia }))}
          onAlocados={(chave, ids) => alterar([chave], () => ({ alocados: ids }))}
        />
      </Card>

      <Card className="overflow-hidden pt-4">
        <h3 className="px-4 pb-3 text-base font-semibold">Gantt do dia</h3>
        {(diaGantt < faixaExterna.ini || diaGantt > faixaExterna.fin) && (
          <p className="px-4 pb-2 text-2xs text-warning">Carga de outras OPs não carregada para este dia (fora do período consultado).</p>
        )}
        <GanttDia
          dia={diaGantt}
          onDia={setDiaGantt}
          colabs={colabsVisiveis}
          demandas={demandas}
          externa={externa}
          cfg={cfg}
          setores={setores}
          onColab={setColabDetalheId}
        />
      </Card>

      {selecionadas.size > 0 && (
        <AcaoLoteBar
          quantidade={selecionadas.size}
          horas={horasSel}
          diaSugerido={diaGantt}
          setor={setorComumSel}
          colabs={colabs}
          livreDe={livreDe}
          onAplicarData={(dia) => alterar(selecionadas, () => ({ dtPlan: dia }))}
          onAlocar={(ids) => alterar(selecionadas, () => ({ alocados: ids }))}
          onLimpar={() => alterar(selecionadas, () => ({ alocados: [] }))}
          onDistribuir={() => abrirDistribuicao(selecionadasDem)}
          onCancelar={() => setSelecionadas(new Set())}
        />
      )}

      <BacklogDialog
        open={backlogOpen}
        onOpenChange={setBacklogOpen}
        demandas={demandas.filter(doSetor)}
        hoje={hoje}
        diaSugerido={diaGantt < hoje ? hoje : diaGantt}
        onDtPlan={(chaves, dia) => alterar(chaves, () => ({ dtPlan: dia }))}
        onSelecionar={(chaves) => {
          selecionar(chaves, true);
          setStatus("atrasadas");
        }}
      />
      <CapacidadeDialog
        open={capOpen}
        onOpenChange={setCapOpen}
        cfg={cfg}
        onSalvar={(c) => {
          setCfg(c);
          gravarCapacidade(c);
        }}
      />
      <DistribuicaoDialog sugestao={sugestao} colabs={colabs} onAplicar={aplicarDistribuicao} onFechar={() => setSugestao(null)} />
      <ColabDetalheDialog
        colab={colabDetalhe}
        onFechar={() => setColabDetalheId(null)}
        dias={dias}
        ix={ix}
        cfg={cfg}
        demandas={demandas}
        colabs={colabs}
        onTrocar={trocar}
      />
      <FalhasGravacaoDialog resultado={falhas} colabs={colabs} onFechar={() => setFalhas(null)} />
    </div>
  );
}
