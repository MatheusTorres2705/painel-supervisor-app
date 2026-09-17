// src/pages/DailyPage.tsx
// Daily da Produção — o quadro que a produção percorre antes de começar o dia,
// por galpão e por setor (setores marcados somam: a daily de Montagem +
// Acabamento é uma reunião só).
//
// Estrutura desta primeira entrega:
//  · lib/dailyConfig  — quais indicadores, metas e agrupamentos;
//  · lib/dailyCalc    — a conta de cada série (dia a dia e acumulado do mês);
//  · services/dailyService — uma carga por janela, reusando as consultas das
//    telas de OPE, Meta de Produção, Absenteísmo e Hora Extra.
//
// Indicadores ainda sem fonte no ERP (OPAI, IPS, SAC, Perdas, Avaria, OTIF,
// barcos) aparecem com a meta e o selo "sem fonte", para o quadro ficar
// completo e a lacuna ficar visível — ligar cada um é acrescentar a série.
//
// Plano de ação: fora desta entrega, por decisão do usuário. A coluna existe
// marcada como próxima etapa.
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, RefreshCw } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { getDaily, type DadosDaily } from "@/services/dailyService";
import {
  INDICADORES_DAILY,
  farolDaily,
  metaDoDia,
  metaDoMes,
  labelSetor,
  GALPOES_DAILY,
} from "@/lib/dailyConfig";
import {
  diasUteisDoMes,
  diasUteisEntreIso,
  janelaDaSemana,
  semanaDe,
  serieAbsenteismo,
  serieAvanco,
  serieOpe,
  diaLocal,
  somarDias,
  totaisPorDia,
  type Recorte,
  type Serie,
} from "@/lib/dailyCalc";
import { GALPOES } from "@/lib/galpoes";
import { anosDoIntervalo } from "@/lib/calendario";
import { useCalendario } from "@/hooks/useCalendario";
import { MESES_LONGO, isoLocal, pad2 } from "@/lib/datetime";
import { toBR } from "@/lib/format";
import { PageHeader } from "@/components/patterns/PageHeader";
import { SeloCalendario } from "@/components/patterns/SeloCalendario";
import { StatCard } from "@/components/patterns/StatCard";
import { PresentationButton, PresentationShell } from "@/components/patterns/PresentationShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { QuadroDaily, type LinhaQuadro } from "@/components/daily/QuadroDaily";
import { SeletorRecorte } from "@/components/daily/SeletorRecorte";

/* ── Recorte lembrado no navegador ───────────────────────────── */
const CHAVE = "daily:recorte";
function lerRecorte(): Recorte {
  try {
    const raw = localStorage.getItem(CHAVE);
    if (!raw) return { galpao: "todos", setores: [] };
    const r = JSON.parse(raw) as Partial<Recorte>;
    return { galpao: typeof r.galpao === "string" ? r.galpao : "todos", setores: Array.isArray(r.setores) ? r.setores.map(String) : [] };
  } catch {
    return { galpao: "todos", setores: [] };
  }
}
function gravarRecorte(r: Recorte) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {
    /* armazenamento bloqueado: vale só nesta sessão */
  }
}

export default function DailyPage() {
  const { user } = useAuth();
  const codusu = user?.codusu != null && Number.isFinite(Number(user.codusu)) ? Number(user.codusu) : null;

  const hoje = useMemo(() => isoLocal(new Date()), []);
  const [dia, setDia] = useState(hoje);
  const [recorte, setRecorte] = useState<Recorte>(lerRecorte);
  const [dados, setDados] = useState<DadosDaily | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [apresentando, setApresentando] = useState(false);

  const dias = useMemo(() => semanaDe(dia), [dia]);
  const janela = useMemo(() => janelaDaSemana(dias), [dias]);
  /* O acumulado do mês vai até hoje (ou até o fim da semana, se ela já passou):
     somar dias no futuro faria o mês parecer pior do que é. */
  const mesFim = janela.fim < hoje ? janela.fim : hoje;
  const mesData = useMemo(() => new Date(Number(janela.mesIni.slice(0, 4)), Number(janela.mesIni.slice(5, 7)) - 1, 1), [janela.mesIni]);
  const mm = `${pad2(mesData.getMonth() + 1)}/${mesData.getFullYear()}`;
  const mesAnt = new Date(mesData.getFullYear(), mesData.getMonth() - 1, 1);
  const mmAnt = `${pad2(mesAnt.getMonth() + 1)}/${mesAnt.getFullYear()}`;
  const rotuloMes = `${MESES_LONGO[mesData.getMonth() + 1]}`;

  /* Atualização funcional: dois cliques antes de um novo render (galpão e setor
     em sequência rápida) perderiam o primeiro se partissem do `recorte` do
     fechamento. */
  const trocarRecorte = (mudar: (r: Recorte) => Recorte) =>
    setRecorte((atual) => {
      const novo = mudar(atual);
      gravarRecorte(novo);
      return novo;
    });

  /* Uma carga por janela: trocar galpão ou setor só reagrupa. */
  useEffect(() => {
    let vivo = true;
    setLoading(true);
    getDaily(janela.ini, janela.fim, mm, mmAnt, codusu)
      .then((d) => vivo && setDados(d))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [janela.ini, janela.fim, mm, mmAnt, codusu, tick]);

  const atualizar = useCallback(() => setTick((t) => t + 1), []);

  /* ── Séries ────────────────────────────────────────────────── */
  const linhasGalpao = useMemo(() => {
    if (recorte.galpao === "todos") return null;
    return GALPOES.find((g) => g.id === recorte.galpao)?.linhas.slice() ?? null;
  }, [recorte.galpao]);

  const anosCal = useMemo(() => anosDoIntervalo(diaLocal(janela.mesIni), diaLocal(janela.fim)), [janela.mesIni, janela.fim]);
  const cal = useCalendario(anosCal);

  const diasUteisMes = useMemo(() => diasUteisEntreIso(janela.mesIni, mesFim, cal.feriados), [janela.mesIni, mesFim, cal.feriados]);
  const { total: duTotal, decorridos: duDecorridos } = useMemo(
    () => diasUteisDoMes(janela.mesIni, mesFim, cal.feriados),
    [janela.mesIni, mesFim, cal.feriados]
  );

  const series = useMemo(() => {
    const out: Record<string, Serie> = {};
    if (dados?.ope.dados) {
      const totais = totaisPorDia(dados.ope.dados.ativos, dados.ope.dados.pontos, linhasGalpao, recorte.setores);
      const { ope, retrabalho } = serieOpe(totais, dias, janela.mesIni, mesFim);
      out.ope = ope;
      out.retrabalho = retrabalho;
    }
    if (dados?.avanco.dados) out.avanco = serieAvanco(dados.avanco.dados, recorte, dias, janela.mesIni, mesFim);
    if (dados?.absenteismo.dados) out.absenteismo = serieAbsenteismo(dados.absenteismo.dados, recorte, dias, diasUteisMes, mesFim);
    if (dados?.horaExtra.dados) {
      out.horaextra = { porDia: Object.fromEntries(dias.map((d) => [d, null])), mes: dados.horaExtra.dados.aprovadosMin / 60 };
    }
    return out;
  }, [dados, linhasGalpao, recorte, dias, janela.mesIni, mesFim, diasUteisMes]);

  const erroDe = (id: string) =>
    id === "ope" || id === "retrabalho" ? dados?.ope.erro : id === "avanco" ? dados?.avanco.erro : id === "absenteismo" ? dados?.absenteismo.erro : id === "horaextra" ? dados?.horaExtra.erro : null;

  const linhas: LinhaQuadro[] = useMemo(
    () =>
      INDICADORES_DAILY.map((ind) => {
        const metaDia = metaDoDia(ind, recorte.galpao, recorte.setores, duTotal);
        return {
          ind,
          serie: series[ind.id] ?? null,
          metaDia,
          metaMes: metaDoMes(ind, metaDia, duDecorridos),
          erro: erroDe(ind.id) ?? null,
        };
      }),
    // `series` já depende de tudo o que muda os números; `duTotal`/`duDecorridos`
    // já carregam o calendário, mas `cal.feriados` fica explícito para a memo não
    // congelar no valor sem feriado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, recorte, duTotal, duDecorridos, dados, cal.feriados]
  );

  /* Fora da meta no dia de hoje (ou no último dia da semana escolhida). */
  const diaFoco = dias.includes(hoje) ? hoje : dias[dias.length - 1];
  const foraDaMeta = linhas.filter((l) => {
    if (cal.feriados.has(diaFoco)) return false; // dia parado não tem meta a furar
    const v = l.serie?.porDia[diaFoco] ?? null;
    return v != null && farolDaily(v, l.metaDia, l.ind.melhor) === "danger";
  });
  const comFonte = linhas.filter((l) => l.ind.fonte === "pronta").length;
  const semFonte = INDICADORES_DAILY.length - comFonte;

  const rotuloRecorte = `${GALPOES_DAILY.find((g) => g.id === recorte.galpao)?.label ?? ""} · ${recorte.setores.length ? recorte.setores.map(labelSetor).join(" + ") : "todos os setores"}`;

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="icon-sm" variant="outline" onClick={() => setDia(somarDias(dia, -7))} aria-label="Semana anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Input type="date" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} className="h-9 w-[9.5rem] px-2 text-xs" aria-label="Dia da daily" />
      <Button size="icon-sm" variant="outline" onClick={() => setDia(somarDias(dia, 7))} aria-label="Próxima semana">
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setDia(hoje)} disabled={dia === hoje}>
        Hoje
      </Button>
    </div>
  );

  const quadro = (
    <Card className="overflow-hidden">
      <QuadroDaily linhas={linhas} dias={dias} rotuloMes={rotuloMes} loading={loading} feriados={cal.feriados} />
    </Card>
  );

  return (
    <PresentationShell
      active={apresentando}
      onExit={() => setApresentando(false)}
      title="Daily da Produção"
      subtitle={rotuloRecorte}
      icon={<ClipboardList className="h-6 w-6" />}
      onRefresh={atualizar}
      status={loading ? "atualizando…" : undefined}
      actions={<SeletorRecorte galpao={recorte.galpao} setores={recorte.setores} onGalpao={(g) => trocarRecorte((r) => ({ ...r, galpao: g }))} onSetores={(s) => trocarRecorte((r) => ({ ...r, setores: s }))} />}
    >
      <div className="space-y-6">
        {!apresentando && (
          <PageHeader
            title="Daily da Produção"
            description={`Semana de ${toBR(dias[0])} a ${toBR(dias[dias.length - 1])} · ${rotuloRecorte}`}
            actions={
              <>
                {filtros}
                <Button variant="ghost" size="icon-sm" onClick={atualizar} aria-label="Atualizar">
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <SeloCalendario cal={cal} carregando={cal.carregando} />
                <PresentationButton onClick={() => setApresentando(true)} />
              </>
            }
          >
            <SeletorRecorte
              galpao={recorte.galpao}
              setores={recorte.setores}
              onGalpao={(g) => trocarRecorte((r) => ({ ...r, galpao: g }))}
              onSetores={(s) => trocarRecorte((r) => ({ ...r, setores: s }))}
            />
          </PageHeader>
        )}

        {!apresentando && (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              icon={CalendarDays}
              label={`Fora da meta em ${toBR(diaFoco).slice(0, 5)}`}
              value={String(foraDaMeta.length)}
              detail={foraDaMeta.length ? foraDaMeta.map((l) => l.ind.nome).join(", ") : "nenhum indicador fora da meta"}
              tone={foraDaMeta.length ? "danger" : "success"}
              loading={loading}
            />
            <StatCard icon={ClipboardList} label="Indicadores no quadro" value={String(INDICADORES_DAILY.length)} detail={`${comFonte} com dados · ${semFonte} a mapear`} />
            <StatCard icon={CalendarDays} label="Dias úteis do mês" value={`${duDecorridos}/${duTotal}`} detail={cal.completo ? "decorridos até hoje, sem feriados — base das metas de horas" : "decorridos até hoje — feriados NÃO descontados"} />
            <StatCard icon={ClipboardList} label="Plano de ação" value="—" detail="registro das ações entra na próxima etapa" />
          </div>
        )}

        {dados && (dados.ope.erro || dados.avanco.erro || dados.absenteismo.erro || dados.horaExtra.erro) && (
          <Alert variant="warning" title="Parte do quadro não carregou">
            {[dados.ope.erro, dados.avanco.erro, dados.absenteismo.erro, dados.horaExtra.erro].filter(Boolean).join(" · ")} Os demais indicadores continuam válidos.
          </Alert>
        )}

        {quadro}
      </div>
    </PresentationShell>
  );
}
