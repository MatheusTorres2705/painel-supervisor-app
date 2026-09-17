// src/pages/DashboardPage.tsx
// Central do supervisor — abre o dia com o que precisa de ação, os indicadores do
// mês e um atalho para cada rotina.
//
// Cada número vem da MESMA consulta e da mesma conta da tela de origem (as
// consultas foram extraídas para services/ sem mudar o SQL), para o Dashboard
// nunca discordar da tela que o supervisor abre ao clicar:
//   hora extra ...... horaExtraService   (tela Hora Extra)
//   assiduidade ..... absenteismoService (tela Absenteísmo)
//   OPs ............. opsService         (tela Atividades / OP)
//   materiais ....... comprasService + lib/listaFaltas (tela Lista de Faltas)
//   retrabalho ...... retrabalhoService
//   meta / OPE ...... mnoService+mnoCalc / opeService (sempre da fábrica)
//
// O que saiu do Dashboard antigo e por quê:
//  · "HE disponível × consumida" e "Assiduidade" eram valores fixos (simulados);
//  · "Atividades por colaborador" somava o PLANEJADO de todo o histórico e o
//    detalhe listava todos os colaboradores (filtro comentado no SQL);
//  · "Senioridade" tem tela própria (Pirâmide) e usava um departamento fixo;
//  · materiais faltantes usavam outra lista de produtos ignorados que a Lista de
//    Faltas — os números não batiam.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  Award,
  CalendarCheck,
  ClipboardList,
  Factory,
  Gauge,
  PackageX,
  RefreshCw,
  Target,
  Timer,
  UserX,
  Wrench,
} from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { getResumoHoraExtra } from "@/services/horaExtraService";
import { getAssiduidade, getFaltasRecentes } from "@/services/absenteismoService";
import { getOpsAvanco, pctAvanco, statusAvanco } from "@/services/opsService";
import { getListaFaltas } from "@/services/comprasService";
import { getRetrabalho } from "@/services/retrabalhoService";
import { getRealizadoDiaSetor, getRealizadoSetorMes } from "@/services/mnoService";
import { LINHAS_MAIORES_ARR, LINHAS_MENORES_ARR, agregar, getOpeDados, totaisOpe } from "@/services/opeService";
import { resumoMno } from "@/lib/mnoCalc";
import { farolOpe } from "@/lib/opeConfig";
import { agruparPorLinhaEBarco, porGravidade } from "@/lib/listaFaltas";
import { MESES_LONGO, dataOracle, isDiaUtil, isoLocal, pad2, ultimoDia } from "@/lib/datetime";
import { useCalendario } from "@/hooks/useCalendario";
import { num, toBR } from "@/lib/format";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import type { Tone } from "@/lib/tone";

import { PageHeader } from "@/components/patterns/PageHeader";
import { StatCard } from "@/components/patterns/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Select } from "@/components/ui/select";
import { AcaoCard } from "@/components/dashboard/AcaoCard";
import { BlocoDashboard } from "@/components/dashboard/BlocoDashboard";
import { EquipeFaltas } from "@/components/dashboard/EquipeFaltas";
import { FaltasPorBarco } from "@/components/dashboard/FaltasPorBarco";
import { OpsAtrasadas } from "@/components/dashboard/OpsAtrasadas";
import { RetrabalhoTop } from "@/components/dashboard/RetrabalhoTop";
import { OpeAuditoriaDialog } from "@/components/ope/OpeAuditoriaDialog";

/* ── Escopo "Meus / Todos" ───────────────────────────────────── */
const CHAVE_ESCOPO = "dashboard:escopo";
type Escopo = "meus" | "todos";
function lerEscopo(): Escopo {
  try {
    return localStorage.getItem(CHAVE_ESCOPO) === "todos" ? "todos" : "meus";
  } catch {
    return "meus";
  }
}
function gravarEscopo(e: Escopo) {
  try {
    localStorage.setItem(CHAVE_ESCOPO, e);
  } catch {
    /* armazenamento bloqueado: só não lembra */
  }
}

/* ── Carga de um bloco ───────────────────────────────────────── */
type Consulta<T> = { dados: T | null; loading: boolean; erro: string | null };

/**
 * Busca independente por bloco: cada um tem seu loading/erro, e uma resposta
 * atrasada de um filtro antigo é descartada (`cancelado`).
 */
function useConsulta<T>(carregar: () => Promise<T>, deps: unknown[]): Consulta<T> & { recarregar: () => void } {
  const [estado, setEstado] = useState<Consulta<T>>({ dados: null, loading: true, erro: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelado = false;
    setEstado((e) => ({ ...e, loading: true, erro: null }));
    carregar()
      .then((dados) => !cancelado && setEstado({ dados, loading: false, erro: null }))
      .catch((e: unknown) => !cancelado && setEstado({ dados: null, loading: false, erro: mensagemErro(e, "Falha ao carregar.") }));
    return () => {
      cancelado = true;
    };
    // `carregar` muda a cada render; as dependências reais vêm em `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const recarregar = useCallback(() => setTick((t) => t + 1), []);
  return { ...estado, recarregar };
}

/* ── Utilitários de data ─────────────────────────────────────── */
const DIAS_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** Último dia útil (seg–sex, sem feriado) antes de `d`. */
function diaUtilAnterior(d: Date, feriados: ReadonlySet<string>): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  /* Teto de 30 dias: um calendário torto (ou um ano inteiro marcado como
     feriado) não pode virar laço infinito na home. */
  for (let i = 0; i < 30 && !isDiaUtil(x, feriados); i++) x.setDate(x.getDate() - 1);
  return x;
}

const horas = (min: number) => min / 60;
const h1 = (v: number) => `${num(v, 1)} h`;

/** Delta formatado para o StatCard; `null` quando não há base de comparação. */
function delta(atual: number, anterior: number | null | undefined, sufixo: string, casas = 1) {
  if (anterior == null) return undefined;
  const d = atual - anterior;
  if (Math.abs(d) < 10 ** -casas / 2) return undefined;
  return { value: `${d > 0 ? "+" : "−"}${num(Math.abs(d), casas)}${sufixo} vs mês ant.`, direction: d > 0 ? ("up" as const) : ("down" as const) };
}

export default function DashboardPage() {
  const { user } = useAuth();
  const codusu = user?.codusu != null && Number.isFinite(Number(user.codusu)) ? Number(user.codusu) : null;
  const primeiroNome = (user?.name || "").trim().split(/\s+/)[0] || "";

  const hoje = useMemo(() => new Date(), []);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [escopo, setEscopo] = useState<Escopo>(lerEscopo);
  const [atualizacao, setAtualizacao] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState(() => new Date());
  const [auditarOpe, setAuditarOpe] = useState(false);

  // Sem usuário identificado não há como recortar: vale a empresa toda.
  const sup = escopo === "meus" && codusu != null ? codusu : null;
  const trocarEscopo = (e: Escopo) => {
    setEscopo(e);
    gravarEscopo(e);
  };
  const atualizar = () => {
    setAtualizacao((x) => x + 1);
    setAtualizadoEm(new Date());
  };

  const mm = `${pad2(mes)}/${ano}`;
  const anterior = new Date(ano, mes - 2, 1);
  const mmAnt = `${pad2(anterior.getMonth() + 1)}/${anterior.getFullYear()}`;
  const mesKey = `${ano}-${pad2(mes)}`;
  const rotuloMes = `${MESES_LONGO[mes]} de ${ano}`;
  const iniMes = `01/${pad2(mes)}/${ano}`;
  const fimMesDate = new Date(ano, mes - 1, ultimoDia(mes, ano));
  const fimMes = dataOracle(fimMesDate);
  const mesFuturo = new Date(ano, mes - 1, 1) > hoje;
  const ateHoje = dataOracle(fimMesDate < hoje ? fimMesDate : hoje);

  const anosCal = useMemo(() => [...new Set([ano, hoje.getFullYear()])], [ano, hoje]);
  const cal = useCalendario(anosCal);
  const diaAnt = useMemo(() => diaUtilAnterior(hoje, cal.feriados), [hoje, cal.feriados]);
  const hojeIso = isoLocal(hoje);
  const diaAntIso = isoLocal(diaAnt);

  /* ── Consultas ─────────────────────────────────────────────── */
  const he = useConsulta(() => getResumoHoraExtra(mm, mmAnt, sup), [mm, mmAnt, sup, atualizacao]);
  const assid = useConsulta(() => getAssiduidade(ano, mes, sup), [ano, mes, sup, atualizacao]);
  const faltas = useConsulta(() => getFaltasRecentes(diaAntIso, sup), [diaAntIso, sup, atualizacao]);
  const ops = useConsulta(() => getOpsAvanco(mesKey, mesKey, sup), [mesKey, sup, atualizacao]);
  const materiais = useConsulta(() => getListaFaltas(ano, mes, sup), [ano, mes, sup, atualizacao]);
  const retrab = useConsulta(() => getRetrabalho(mm, mmAnt, sup), [mm, mmAnt, sup, atualizacao]);
  // Meta e OPE: visão da fábrica; não dependem do escopo.
  /* As linhas vêm do ERP; o resumo é conta de cliente. Separados de propósito:
     quando o calendário de feriados chega, só a conta refaz — sem uma segunda
     ida ao banco pelas mesmas linhas. */
  const mnoRows = useConsulta(
    async () => {
      const [mesRows, diaRows] = await Promise.all([getRealizadoSetorMes(iniMes, fimMes), getRealizadoDiaSetor(iniMes, fimMes)]);
      return { mesRows, diaRows };
    },
    [iniMes, fimMes, atualizacao]
  );
  const mno = useMemo(
    () => ({
      ...mnoRows,
      dados: mnoRows.dados ? resumoMno(mnoRows.dados.mesRows, mnoRows.dados.diaRows, ano, mes, cal.feriados) : null,
    }),
    [mnoRows, ano, mes, cal.feriados]
  );
  const ope = useConsulta(
    async () => {
      if (mesFuturo) return null;
      const { ativos, pontos } = await getOpeDados(iniMes, ateHoje);
      return totaisOpe(agregar(ativos, pontos, () => true));
    },
    [iniMes, ateHoje, mesFuturo, atualizacao]
  );

  /* ── Derivados ─────────────────────────────────────────────── */
  const opsResumo = useMemo(() => {
    const lista = ops.dados ?? [];
    const baixo = lista.filter((o) => statusAvanco(pctAvanco(o.avancoPrev), pctAvanco(o.avancoReal)) === "Baixo avanço");
    const media = (f: (o: (typeof lista)[number]) => number) => (lista.length ? lista.reduce((s, o) => s + f(o), 0) / lista.length : 0);
    const piores = [...lista]
      .sort((a, b) => pctAvanco(b.avancoPrev) - pctAvanco(b.avancoReal) - (pctAvanco(a.avancoPrev) - pctAvanco(a.avancoReal)))
      .filter((o) => pctAvanco(o.avancoPrev) > pctAvanco(o.avancoReal))
      .slice(0, 6);
    return { total: lista.length, baixo: baixo.length, prev: media((o) => pctAvanco(o.avancoPrev)), real: media((o) => pctAvanco(o.avancoReal)), piores };
  }, [ops.dados]);

  const matResumo = useMemo(() => {
    const barcos = agruparPorLinhaEBarco(materiais.dados ?? []).flatMap((g) => g.barcos).sort(porGravidade);
    const semPedido = barcos.filter((b) => b.vermelho > 0);
    return {
      barcos,
      itens: barcos.reduce((s, b) => s + b.itens, 0),
      barcosSemPedido: semPedido.length,
      itensSemPedido: semPedido.reduce((s, b) => s + b.vermelho, 0),
    };
  }, [materiais.dados]);

  const faltasGrupos = useMemo(() => {
    const rows = faltas.dados ?? [];
    return [
      { rotulo: "Hoje", dia: hojeIso, faltas: rows.filter((f) => f.dia === hojeIso) },
      { rotulo: "Último dia útil", dia: diaAntIso, faltas: rows.filter((f) => f.dia === diaAntIso) },
    ];
  }, [faltas.dados, hojeIso, diaAntIso]);
  const pessoasHoje = new Set(faltasGrupos[0].faltas.map((f) => f.codfunc)).size;
  const pessoasAnt = new Set(faltasGrupos[1].faltas.map((f) => f.codfunc)).size;

  const retrabTop = useMemo(() => {
    const m = new Map<string, { atividade: string; setor: string; hh: number }>();
    for (const it of retrab.dados?.atual.itens ?? []) {
      const k = `${it.setor}|${it.atividade}`;
      const e = m.get(k) ?? { atividade: it.atividade, setor: it.setor, hh: 0 };
      e.hh += it.hh;
      m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.hh - a.hh).slice(0, 5);
  }, [retrab.dados]);

  const farol = farolOpe(ope.dados?.opePct ?? null);
  const tomOpe: Tone | undefined = farol === "ok" ? "success" : farol === "warn" || farol === "anomalia" ? "warning" : farol === "bad" ? "danger" : undefined;
  const tomMeta: Tone | undefined =
    mno.dados?.atingProjetado != null
      ? mno.dados.atingProjetado >= 100 ? "success" : mno.dados.atingProjetado >= 90 ? "warning" : "danger"
      : undefined;

  const anos = Array.from(new Set([hoje.getFullYear() + 1, hoje.getFullYear(), hoje.getFullYear() - 1, ano])).sort((a, b) => b - a);
  const semEscopo = sup == null;
  const escopoTexto = semEscopo ? "empresa toda" : "sua equipe e seus barcos";
  const selo = <Badge variant="muted" className="text-2xs">fábrica</Badge>;

  const hePend = he.dados?.atual;
  const assidAtual = assid.dados?.atual;
  const assidAnt = assid.dados?.anterior;

  return (
    <div className="space-y-6">
      <PageHeader
        title={primeiroNome ? `Olá, ${primeiroNome.charAt(0).toUpperCase()}${primeiroNome.slice(1).toLowerCase()}` : "Visão geral"}
        description={`${DIAS_SEMANA[hoje.getDay()]}, ${toBR(hojeIso)} · indicadores de ${rotuloMes} · ${escopoTexto}`}
        actions={
          <>
            {codusu != null && (
              <div className="flex items-center gap-1.5" role="group" aria-label="Escopo dos dados">
                <Chip ativo={escopo === "meus"} onClick={() => trocarEscopo("meus")}>Meus</Chip>
                <Chip ativo={escopo === "todos"} onClick={() => trocarEscopo("todos")}>Todos</Chip>
              </div>
            )}
            <div className="w-36">
              <Select value={mes} onChange={(e) => setMes(Number(e.target.value))} aria-label="Mês">
                {MESES_LONGO.slice(1).map((nome, i) => (
                  <option key={i + 1} value={i + 1}>{nome}</option>
                ))}
              </Select>
            </div>
            <div className="w-24">
              <Select value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
                {anos.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={atualizar} title={`Atualizado às ${atualizadoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </Button>
          </>
        }
      />

      {/* Precisa de ação */}
      <section aria-labelledby="titulo-acao" className="space-y-3">
        <h3 id="titulo-acao" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Precisa de ação</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AcaoCard
            icon={Timer}
            titulo="Hora extra aguardando aprovação"
            valor={`${num(hePend?.pendentesQtd ?? 0)} ${hePend?.pendentesQtd === 1 ? "lançamento" : "lançamentos"}`}
            detalhe={`${h1(horas(hePend?.pendentesMin ?? 0))} em ${rotuloMes}`}
            tom="warning"
            emDia={!!hePend && hePend.pendentesQtd === 0}
            para="/hora-extra"
            rotuloLink="Aprovar horas"
            loading={he.loading}
            erro={he.erro}
          />
          <AcaoCard
            icon={UserX}
            titulo="Faltas de hoje"
            valor={`${num(pessoasHoje)} ${pessoasHoje === 1 ? "pessoa" : "pessoas"}`}
            detalhe={`${num(pessoasAnt)} no último dia útil (${toBR(diaAntIso).slice(0, 5)})`}
            tom="danger"
            emDia={!faltas.loading && !faltas.erro && pessoasHoje === 0 && pessoasAnt === 0}
            para="/absenteismo"
            rotuloLink="Ver absenteísmo"
            loading={faltas.loading}
            erro={faltas.erro}
          />
          <AcaoCard
            icon={PackageX}
            titulo="Barcos com item sem pedido"
            valor={`${num(matResumo.barcosSemPedido)} ${matResumo.barcosSemPedido === 1 ? "barco" : "barcos"}`}
            detalhe={`${num(matResumo.itensSemPedido)} itens sem ordem de compra · ${num(matResumo.itens)} faltas no mês`}
            tom="danger"
            emDia={!materiais.loading && !materiais.erro && matResumo.barcosSemPedido === 0}
            para="/lista-faltas"
            rotuloLink="Abrir lista de faltas"
            loading={materiais.loading}
            erro={materiais.erro}
          />
          <AcaoCard
            icon={AlarmClock}
            titulo="OPs abaixo do previsto"
            valor={`${num(opsResumo.baixo)} ${opsResumo.baixo === 1 ? "OP" : "OPs"}`}
            detalhe={`de ${num(opsResumo.total)} no cronograma de ${MESES_LONGO[mes].toLowerCase()} · mais de 10 pp atrás`}
            tom="warning"
            emDia={!ops.loading && !ops.erro && opsResumo.baixo === 0}
            para="/atividades"
            rotuloLink="Ver atividades"
            loading={ops.loading}
            erro={ops.erro}
          />
        </div>
      </section>

      {/* Indicadores do mês */}
      <section aria-labelledby="titulo-mes" className="space-y-3">
        <h3 id="titulo-mes" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Indicadores de {rotuloMes}</h3>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            icon={CalendarCheck}
            label="Assiduidade"
            value={assidAtual?.assiduidade != null ? `${num(assidAtual.assiduidade, 1)}%` : "—"}
            detail={assidAtual ? `${num(assidAtual.faltas)} faltas · ${h1(assidAtual.hhPerdido)} perdidas` : undefined}
            delta={assidAtual?.assiduidade != null ? delta(assidAtual.assiduidade, assidAnt?.assiduidade, " pp") : undefined}
            deltaTone={assidAtual?.assiduidade != null && assidAnt?.assiduidade != null && assidAtual.assiduidade < assidAnt.assiduidade ? "danger" : "success"}
            loading={assid.loading}
          />
          <StatCard
            icon={Timer}
            label="Hora extra aprovada"
            value={hePend ? h1(horas(hePend.aprovadosMin)) : "—"}
            detail={hePend ? `${h1(horas(hePend.pendentesMin))} pendentes · ${num(hePend.colaboradores)} colaboradores` : he.erro ? "não foi possível carregar" : undefined}
            delta={hePend ? delta(horas(hePend.aprovadosMin), he.dados ? horas(he.dados.anterior.aprovadosMin) : null, " h") : undefined}
            deltaTone={hePend && he.dados && hePend.aprovadosMin > he.dados.anterior.aprovadosMin ? "warning" : "success"}
            loading={he.loading}
          />
          <StatCard
            icon={Gauge}
            label="Avanço das OPs"
            value={opsResumo.total ? `${num(opsResumo.real)}%` : "—"}
            detail={opsResumo.total ? `previsto ${num(opsResumo.prev)}% · média de ${num(opsResumo.total)} OPs` : ops.erro ? "não foi possível carregar" : "sem OPs no cronograma"}
            tone={opsResumo.total && opsResumo.real < opsResumo.prev - 10 ? "danger" : undefined}
            loading={ops.loading}
          />
          <StatCard
            icon={Wrench}
            label="Retrabalho"
            value={retrab.dados ? h1(retrab.dados.atual.hh) : "—"}
            detail={retrab.dados ? `${num(retrab.dados.atual.itens.length)} apontamentos` : retrab.erro ? "não foi possível carregar" : undefined}
            delta={retrab.dados ? delta(retrab.dados.atual.hh, retrab.dados.anterior.hh, " h") : undefined}
            deltaTone={retrab.dados && retrab.dados.atual.hh > retrab.dados.anterior.hh ? "danger" : "success"}
            loading={retrab.loading}
          />
          <StatCard
            icon={Target}
            label="Meta de produção"
            value={mno.dados?.atingimento != null ? `${num(mno.dados.atingimento)}%` : "—"}
            detail={
              <span className="flex flex-wrap items-center gap-1">
                {selo}
                {mno.dados?.atingProjetado != null ? `projeção ${num(mno.dados.atingProjetado)}%` : mno.erro ? "não foi possível carregar" : "sem projeção"}
              </span>
            }
            tone={tomMeta}
            loading={mno.loading}
          />
          <StatCard
            icon={Factory}
            label="OPE"
            value={ope.dados?.opePct != null ? `${num(ope.dados.opePct)}%` : "—"}
            detail={
              <span className="flex flex-wrap items-center gap-1">
                {selo}
                {mesFuturo
                  ? "mês ainda não começou"
                  : ope.erro
                  ? "não foi possível carregar"
                  : ope.dados?.opePct == null
                  ? "sem ponto registrado"
                  : `${h1(ope.dados.ativ)} de ${h1(ope.dados.ponto)} · clique para auditar`}
              </span>
            }
            tone={tomOpe}
            loading={ope.loading}
            onClick={ope.dados?.opePct != null ? () => setAuditarOpe(true) : undefined}
          />
        </div>
      </section>

      {/* Detalhes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <BlocoDashboard
          titulo="OPs mais atrasadas"
          subtitulo={`Real × previsto no cronograma de ${MESES_LONGO[mes].toLowerCase()} · clique para alocar`}
          para="/atividades"
          loading={ops.loading}
          erro={ops.erro}
          onRetry={ops.recarregar}
          vazio={opsResumo.piores.length === 0}
          vazioTitulo={opsResumo.total ? "Nenhuma OP atrás do previsto" : "Nenhuma OP no cronograma do mês"}
          vazioDescricao={!opsResumo.total && !semEscopo ? "Só aparecem barcos em que você é o supervisor do projeto (AD_CODSUPERVISOR)." : undefined}
          vazioIcone={ClipboardList}
        >
          <OpsAtrasadas ops={opsResumo.piores} />
        </BlocoDashboard>

        <BlocoDashboard
          titulo="Faltas de material por barco"
          subtitulo={`Mesma regra da Lista de Faltas · ${num(matResumo.barcos.length)} barcos com falta`}
          para="/lista-faltas"
          loading={materiais.loading}
          erro={materiais.erro}
          onRetry={materiais.recarregar}
          vazio={matResumo.barcos.length === 0}
          vazioTitulo="Nenhuma falta de material no mês"
          vazioIcone={PackageX}
        >
          <FaltasPorBarco barcos={matResumo.barcos.slice(0, 6)} />
        </BlocoDashboard>

        <BlocoDashboard
          titulo="Faltas da equipe"
          subtitulo="Registradas em AD_VFALTA"
          para="/absenteismo"
          rotuloLink="Absenteísmo"
          loading={faltas.loading}
          erro={faltas.erro}
          onRetry={faltas.recarregar}
          vazio={false}
          vazioTitulo=""
        >
          <EquipeFaltas grupos={faltasGrupos} />
        </BlocoDashboard>

        <BlocoDashboard
          titulo="Onde houve retrabalho"
          subtitulo={retrab.dados ? `${h1(retrab.dados.atual.hh)} em ${rotuloMes}` : undefined}
          para="/ope"
          rotuloLink="Ver OPE"
          loading={retrab.loading}
          erro={retrab.erro}
          onRetry={retrab.recarregar}
          vazio={retrabTop.length === 0}
          vazioTitulo="Nenhum retrabalho apontado no mês"
          vazioIcone={Award}
        >
          <RetrabalhoTop itens={retrabTop} total={retrab.dados?.atual.hh ?? 0} />
        </BlocoDashboard>
      </div>

      {auditarOpe && ope.dados && (
        <OpeAuditoriaDialog
          titulo={`fábrica · ${rotuloMes}`}
          ini={iniMes}
          fim={ateHoje}
          // O mesmo universo de linhas que getOpeDados consulta para o card.
          linhas={[...LINHAS_MENORES_ARR, ...LINHAS_MAIORES_ARR]}
          setor={null}
          abaInicial="ponto"
          totais={{ ponto: ope.dados.ponto, ativ: ope.dados.ativ, perdas: ope.dados.perdas, opePct: ope.dados.opePct }}
          onClose={() => setAuditarOpe(false)}
        />
      )}
    </div>
  );
}
