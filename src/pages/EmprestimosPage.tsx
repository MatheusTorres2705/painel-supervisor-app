// src/pages/EmprestimosPage.tsx
// Empréstimo de colaborador entre departamentos: pedir, aprovar, acompanhar.
//
// Fluxo (decidido com o usuário):
//  · qualquer usuário do painel pede;
//  · aprova ou reprova o responsável do departamento de DESTINO
//    (TFPDEP.AD_CODUSURES) — o setor que passa a carregar as 8 h de ponto;
//  · aprovado, o OPE conta o ponto do colaborador no destino naqueles dias
//    (services/opeService, `sqlDepEfetivo`), e a Daily também.
//
// A tabela AD_EMPRESTFUN é criada à mão no Sankhya. Até ela existir, esta tela
// explica o que falta em vez de falhar — e o OPE segue a conta de antes.
import * as React from "react";
import { ArrowRight, Check, HandHelping, Plus, RefreshCw, X } from "lucide-react";

import { useAuth } from "@/auth/AuthProvider";
import { PageHeader } from "@/components/patterns/PageHeader";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { NovoEmprestimoDialog } from "@/components/emprestimo/NovoEmprestimoDialog";
import { mesInteiro, type IsoRange } from "@/lib/datetime";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { cn } from "@/lib/utils";
import { emprestimoDisponivel } from "@/services/opeService";
import {
  STATUS_EMPRESTIMO,
  cancelarEmprestimo,
  decidirEmprestimo,
  getColaboradoresEmprestimo,
  getDepartamentosEmprestimo,
  getEmprestimos,
  haSobreposicao,
  type ColabEmprestimo,
  type DepEmprestimo,
  type Emprestimo,
  type StatusEmprestimo,
} from "@/services/emprestimoService";

type Recorte = "aprovar" | "minhas" | "todos";
type Acao = { tipo: "A" | "R" | "C"; emp: Emprestimo };

const TOM_STATUS: Record<StatusEmprestimo, "warning" | "success" | "destructive" | "muted"> = {
  P: "warning",
  A: "success",
  R: "destructive",
  C: "muted",
};

const br = (ymd: string) => (ymd ? ymd.split("-").reverse().join("/") : "");
const diasEntre = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1;
};
const ondeTxt = (galpao: string, setor: string) => (galpao && setor ? `${galpao} · ${setor}` : "fora do OPE");

export default function EmprestimosPage() {
  const { user } = useAuth();
  const codusu = Number(user?.codusu ?? 0);
  const { success, error: toastErro } = useToast();

  const [disponivel, setDisponivel] = React.useState<boolean | null>(null);
  const [range, setRange] = React.useState<IsoRange>(() => {
    const d = new Date();
    return mesInteiro(d.getFullYear(), d.getMonth() + 1);
  });
  const [lista, setLista] = React.useState<Emprestimo[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [tick, setTick] = React.useState(0);
  const [recorte, setRecorte] = React.useState<Recorte>("todos");

  const [novoAberto, setNovoAberto] = React.useState(false);
  const [colabs, setColabs] = React.useState<ColabEmprestimo[]>([]);
  const [deps, setDeps] = React.useState<DepEmprestimo[]>([]);
  const [cadastrosLoading, setCadastrosLoading] = React.useState(false);

  const [acao, setAcao] = React.useState<Acao | null>(null);
  const [obs, setObs] = React.useState("");
  const [gravando, setGravando] = React.useState(false);
  const [erroAcao, setErroAcao] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    emprestimoDisponivel().then((ok) => vivo && setDisponivel(ok));
    return () => {
      vivo = false;
    };
  }, []);

  React.useEffect(() => {
    if (!disponivel) {
      setLoading(disponivel === null);
      return;
    }
    let vivo = true;
    setLoading(true);
    setErro(null);
    getEmprestimos(range.ini, range.fim)
      .then((l) => vivo && setLista(l))
      .catch((e: unknown) => vivo && setErro(mensagemErro(e, "Falha ao carregar os empréstimos.")))
      .finally(() => vivo && setLoading(false));
    return () => {
      vivo = false;
    };
  }, [disponivel, range, tick]);

  const recarregar = React.useCallback(() => setTick((t) => t + 1), []);

  /* Os cadastros só carregam quando alguém vai pedir — a lista não precisa deles. */
  const abrirNovo = async () => {
    setNovoAberto(true);
    if (colabs.length && deps.length) return;
    setCadastrosLoading(true);
    try {
      const [c, d] = await Promise.all([getColaboradoresEmprestimo(), getDepartamentosEmprestimo()]);
      setColabs(c);
      setDeps(d);
    } catch (e: unknown) {
      toastErro("Falha ao carregar colaboradores e departamentos", mensagemErro(e));
      setNovoAberto(false);
    } finally {
      setCadastrosLoading(false);
    }
  };

  const paraMim = (e: Emprestimo) => e.status === "P" && e.codRespDest === codusu;
  const podeCancelar = (e: Emprestimo) =>
    (e.status === "P" && e.codUsuSol === codusu) || (e.status === "A" && (e.codUsuSol === codusu || e.codUsuDec === codusu));

  const qtdAprovar = lista.filter(paraMim).length;
  const qtdMinhas = lista.filter((e) => e.codUsuSol === codusu).length;
  const visiveis =
    recorte === "aprovar" ? lista.filter(paraMim) : recorte === "minhas" ? lista.filter((e) => e.codUsuSol === codusu) : lista;

  const abrirAcao = (a: Acao) => {
    setAcao(a);
    setObs("");
    setErroAcao(null);
  };

  const confirmar = async () => {
    if (!acao) return;
    const { tipo, emp } = acao;
    if (tipo === "R" && !obs.trim()) {
      setErroAcao("Diga por que está reprovando — quem pediu vai ler.");
      return;
    }
    setGravando(true);
    setErroAcao(null);
    try {
      /* Ao aprovar, confere de novo: outro empréstimo pode ter sido aprovado
         para o mesmo colaborador depois que este foi pedido. */
      if (tipo === "A" && (await haSobreposicao(emp.codemp, emp.codfunc, emp.dtini, emp.dtfim, ["A"], emp.codEmprest))) {
        setErroAcao(`${emp.nomefunc} já tem outro empréstimo aprovado cobrindo parte desse período. Cancele o outro ou reprove este.`);
        return;
      }
      const r = tipo === "C" ? await cancelarEmprestimo(emp.codEmprest, codusu) : await decidirEmprestimo(emp.codEmprest, tipo, codusu, obs);
      if (!r.ok) {
        setErroAcao([r.title, r.human || r.resumo].filter(Boolean).join(" — "));
        return;
      }
      success(tipo === "A" ? "Empréstimo aprovado" : tipo === "R" ? "Empréstimo reprovado" : "Empréstimo cancelado", emp.nomefunc);
      setAcao(null);
      recarregar();
    } catch (e: unknown) {
      setErroAcao(mensagemErro(e, "Não foi possível gravar."));
    } finally {
      setGravando(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Empréstimo de colaborador"
        description="Quem empresta pede; o responsável do departamento de destino aprova. Aprovado, o ponto conta no destino nesses dias — no OPE e na Daily."
        actions={
          <>
            <DateRangePicker value={range} onChange={setRange} title="Período" />
            <Button variant="ghost" size="icon-sm" onClick={recarregar} aria-label="Atualizar" disabled={!disponivel}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={abrirNovo} disabled={!disponivel}>
              <Plus className="h-4 w-4" /> Emprestar colaborador
            </Button>
          </>
        }
      />

      {disponivel === false && (
        <Alert variant="info" title="A estrutura ainda não foi criada no Sankhya">
          Esta tela e o efeito no OPE dependem da tabela <span className="font-mono">AD_EMPRESTFUN</span> (Construtor de
          Telas), com os campos <span className="font-mono">CODEMPREST, CODEMP, CODFUNC, CODDEPORIG, CODDEPDEST, DTINI, DTFIM,
          MOTIVO, STATUS, CODUSUSOL, DHSOLICIT, CODUSUDEC, DHDEC, OBSDEC, CODUSUCANC, DHCANC</span>. Assim que ela existir,
          a tela libera sozinha. Até lá o OPE segue a conta de sempre, sem empréstimos.
        </Alert>
      )}

      {disponivel && (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Quais empréstimos">
            <Chip ativo={recorte === "aprovar"} onClick={() => setRecorte("aprovar")} title="Pendentes cujo destino é um departamento que você responde">
              Para eu aprovar
              <Badge variant={recorte === "aprovar" ? "secondary" : qtdAprovar ? "warning" : "muted"} className="ml-1.5">{qtdAprovar}</Badge>
            </Chip>
            <Chip ativo={recorte === "minhas"} onClick={() => setRecorte("minhas")} title="Os que você pediu">
              Minhas solicitações
              <Badge variant={recorte === "minhas" ? "secondary" : "muted"} className="ml-1.5">{qtdMinhas}</Badge>
            </Chip>
            <Chip ativo={recorte === "todos"} onClick={() => setRecorte("todos")} title="Tudo que toca o período, mais os pendentes de qualquer data">
              Todos no período
              <Badge variant={recorte === "todos" ? "secondary" : "muted"} className="ml-1.5">{lista.length}</Badge>
            </Chip>
          </div>

          {erro && <Alert variant="destructive" title="Não foi possível carregar">{erro}</Alert>}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto scrollbar-slim">
              <table className="w-full min-w-[52rem] text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    {["Colaborador", "De → Para", "Período", "Situação", "Pedido por", ""].map((h) => (
                      <th key={h} className="px-3 py-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="px-3 py-3"><Skeleton className="h-6" /></td></tr>
                    ))
                  ) : visiveis.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        <HandHelping className="mx-auto mb-2 h-6 w-6 opacity-50" aria-hidden="true" />
                        {recorte === "aprovar" ? "Nada esperando a sua aprovação." : recorte === "minhas" ? "Você não pediu nenhum empréstimo neste período." : "Nenhum empréstimo neste período."}
                      </td>
                    </tr>
                  ) : (
                    visiveis.map((e) => {
                      const dias = diasEntre(e.dtini, e.dtfim);
                      return (
                        <tr key={e.codEmprest} className={cn("align-top hover:bg-muted/40", paraMim(e) && "bg-warning-subtle/40")}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-foreground">{e.nomefunc || `#${e.codfunc}`}</p>
                            <p className="text-2xs tabular text-muted-foreground">#{e.codfunc}</p>
                            {e.motivo && <p className="mt-1 max-w-[16rem] text-2xs text-muted-foreground" title={e.motivo}>“{e.motivo}”</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-start gap-2">
                              <span>
                                <span className="block">{e.depOrig}</span>
                                <span className="block text-2xs text-muted-foreground">{ondeTxt(e.galpaoOrig, e.setorOrig)}</span>
                              </span>
                              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span>
                                <span className="block">{e.depDest}</span>
                                <span className="block text-2xs text-muted-foreground">{ondeTxt(e.galpaoDest, e.setorDest)}</span>
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 tabular">
                            {e.dtini === e.dtfim ? br(e.dtini) : `${br(e.dtini)} a ${br(e.dtfim)}`}
                            <span className="block text-2xs text-muted-foreground">{dias} {dias === 1 ? "dia" : "dias"}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={TOM_STATUS[e.status]}>{STATUS_EMPRESTIMO[e.status]}</Badge>
                            <p className="mt-1 text-2xs text-muted-foreground">
                              {e.status === "P"
                                ? `aguarda ${e.nomeRespDest || "responsável do destino"}`
                                : e.status === "C"
                                ? `por ${e.nomeCanc || "—"} · ${e.dhCanc}`
                                : `por ${e.nomeDec || "—"} · ${e.dhDec}`}
                            </p>
                            {e.status === "R" && e.obsDec && <p className="mt-0.5 max-w-[14rem] text-2xs text-destructive" title={e.obsDec}>{e.obsDec}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <p>{e.codUsuSol === codusu ? "você" : e.nomeSol}</p>
                            <p className="text-2xs tabular text-muted-foreground">{e.dhSolicit}</p>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-right">
                            {paraMim(e) && (
                              <>
                                <Button size="sm" onClick={() => abrirAcao({ tipo: "A", emp: e })}>
                                  <Check className="h-4 w-4" /> Aprovar
                                </Button>
                                <Button size="sm" variant="outline" className="ml-1.5" onClick={() => abrirAcao({ tipo: "R", emp: e })}>
                                  Reprovar
                                </Button>
                              </>
                            )}
                            {podeCancelar(e) && (
                              <Button size="sm" variant="ghost" className="ml-1.5" onClick={() => abrirAcao({ tipo: "C", emp: e })}>
                                <X className="h-4 w-4" /> Cancelar
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <NovoEmprestimoDialog
        open={novoAberto}
        onOpenChange={setNovoAberto}
        colabs={colabs}
        deps={deps}
        carregando={cadastrosLoading}
        codusu={codusu}
        onSalvo={() => {
          success("Pedido enviado", "Aguarda a aprovação do responsável do destino.");
          recarregar();
        }}
      />

      <Dialog open={!!acao} onOpenChange={(v) => !v && !gravando && setAcao(null)}>
        <DialogContent className="max-w-md">
          {acao && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {acao.tipo === "A" ? "Aprovar empréstimo" : acao.tipo === "R" ? "Reprovar empréstimo" : "Cancelar empréstimo"}
                </DialogTitle>
                <DialogDescription>
                  {acao.emp.nomefunc}: {acao.emp.depOrig} → {acao.emp.depDest}, {br(acao.emp.dtini)}
                  {acao.emp.dtini !== acao.emp.dtfim ? ` a ${br(acao.emp.dtfim)}` : ""}.
                </DialogDescription>
              </DialogHeader>
              {acao.tipo === "A" && (
                <p className="text-sm text-muted-foreground">
                  Aprovado, o ponto de {acao.emp.nomefunc} passa a contar em <b className="text-foreground">{ondeTxt(acao.emp.galpaoDest, acao.emp.setorDest)}</b> nesses
                  dias — no OPE e na Daily.
                </p>
              )}
              {acao.tipo === "C" && acao.emp.status === "A" && (
                <Alert variant="warning" title="Este empréstimo já está valendo">
                  Cancelar devolve o ponto desses dias ao departamento de casa e muda o OPE já calculado do período.
                </Alert>
              )}
              {acao.tipo === "R" && (
                <Field label="Justificativa" required>
                  {(p) => (
                    <textarea
                      {...p}
                      value={obs}
                      maxLength={400}
                      rows={3}
                      onChange={(ev) => setObs(ev.target.value)}
                      className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    />
                  )}
                </Field>
              )}
              {erroAcao && <Alert variant="destructive">{erroAcao}</Alert>}
              <DialogFooter>
                <Button variant="outline" onClick={() => setAcao(null)} disabled={gravando}>
                  Voltar
                </Button>
                <Button variant={acao.tipo === "A" ? "default" : "destructive"} onClick={confirmar} disabled={gravando}>
                  {gravando ? "Gravando…" : acao.tipo === "A" ? "Aprovar" : acao.tipo === "R" ? "Reprovar" : "Cancelar empréstimo"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
