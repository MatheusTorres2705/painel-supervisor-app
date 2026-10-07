// src/components/emprestimo/NovoEmprestimoDialog.tsx
// Pedido de empréstimo: quem, para onde, de quando a quando.
//
// A prévia mostra o que o OPE vai fazer — "sai de ACABAMENTO (Galpão 1) e
// conta em MONTAGEM (Galpão 2)" — e quem vai aprovar. Três coisas BLOQUEIAM o
// envio (destino sem responsável, origem = destino, período sobreposto a outro
// empréstimo).
//
// O destino só oferece departamentos que o OPE conta — com setor de produção
// (TFPDEP.AD_CODGRUPO) e galpão (AD_CODPLP). É o mesmo critério da SQL do ponto
// (JOIN DEP_SETOR + JOIN GALPAO): emprestar para fora dele tiraria o
// colaborador do OPE de casa sem contá-lo em lugar nenhum. A ORIGEM não tem
// esse filtro — a prévia usa a lista inteira e mostra "fora do OPE" se for o caso.
import * as React from "react";
import { ArrowRight, Check, ChevronsUpDown } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { cn } from "@/lib/utils";
import {
  haSobreposicao,
  solicitarEmprestimo,
  type ColabEmprestimo,
  type DepEmprestimo,
} from "@/services/emprestimoService";

/** "Galpão 1 · Acabamento", ou o aviso de que o departamento não entra no OPE. */
function onde(d: DepEmprestimo | undefined) {
  if (!d) return "";
  return d.setor && d.galpao ? `${d.galpao} · ${d.setor}` : "fora do OPE (sem setor de produção ou galpão)";
}

const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function NovoEmprestimoDialog({
  open,
  onOpenChange,
  colabs,
  deps,
  carregando,
  codusu,
  onSalvo,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  colabs: ColabEmprestimo[];
  deps: DepEmprestimo[];
  carregando: boolean;
  codusu: number;
  onSalvo: () => void;
}) {
  const [chaveColab, setChaveColab] = React.useState<string>("");
  const [codDepDest, setCodDepDest] = React.useState<number | null>(null);
  const [dtini, setDtini] = React.useState(hojeIso);
  const [dtfim, setDtfim] = React.useState(hojeIso);
  const [motivo, setMotivo] = React.useState("");
  const [colabAberto, setColabAberto] = React.useState(false);
  const [depAberto, setDepAberto] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  // Cada abertura começa limpa: um pedido não herda o rascunho do anterior.
  React.useEffect(() => {
    if (!open) return;
    setChaveColab("");
    setCodDepDest(null);
    setDtini(hojeIso());
    setDtfim(hojeIso());
    setMotivo("");
    setErro(null);
  }, [open]);

  const colab = colabs.find((c) => `${c.codemp}-${c.codfunc}` === chaveColab);
  const depPorCod = React.useMemo(() => new Map(deps.map((d) => [d.coddep, d])), [deps]);
  /** Só os departamentos que entram no OPE podem receber o colaborador. */
  const destinos = React.useMemo(() => deps.filter((d) => d.setor && d.galpao), [deps]);
  const origem = colab ? depPorCod.get(colab.coddep) : undefined;
  const destino = codDepDest != null ? depPorCod.get(codDepDest) : undefined;

  /* O que impede o envio — em ordem, a primeira que valer é a mostrada. */
  const bloqueio = !colab
    ? "Escolha o colaborador."
    : !destino
    ? "Escolha o departamento de destino."
    : destino.coddep === colab.coddep
    ? "O destino é o próprio departamento do colaborador."
    : destino.codResp == null
    ? `${destino.descrdep} não tem responsável cadastrado (TFPDEP.AD_CODUSURES) — ninguém poderia aprovar. Peça o cadastro ao RH antes.`
    : !dtini || !dtfim
    ? "Informe o período."
    : dtfim < dtini
    ? "A data final é anterior à inicial."
    : null;

  const enviar = async () => {
    if (bloqueio || !colab || !destino) return;
    setEnviando(true);
    setErro(null);
    try {
      if (await haSobreposicao(colab.codemp, colab.codfunc, dtini, dtfim, ["P", "A"])) {
        setErro(`${colab.nome} já tem um empréstimo pendente ou aprovado que cobre parte desse período. Cancele ou ajuste o outro antes.`);
        return;
      }
      const r = await solicitarEmprestimo(
        { codemp: colab.codemp, codfunc: colab.codfunc, codDepOrig: colab.coddep, codDepDest: destino.coddep, dtini, dtfim, motivo },
        codusu
      );
      if (!r.ok) {
        setErro([r.title, r.human || r.resumo].filter(Boolean).join(" — "));
        return;
      }
      onSalvo();
      onOpenChange(false);
    } catch (e: unknown) {
      setErro(mensagemErro(e, "Não foi possível gravar o pedido."));
    } finally {
      setEnviando(false);
    }
  };

  const desabilitado = carregando || enviando;

  return (
    <Dialog open={open} onOpenChange={(v) => !enviando && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Emprestar colaborador</DialogTitle>
          <DialogDescription>
            Nasce pendente. Quem aprova é o responsável do departamento de destino; aprovado, o ponto do colaborador
            conta no destino nesses dias.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Colaborador" required>
            {(p) => (
              <Popover open={colabAberto} onOpenChange={setColabAberto}>
                <PopoverTrigger asChild>
                  <Button {...p} type="button" variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={desabilitado}>
                    <span className="truncate">{carregando ? "Carregando colaboradores…" : colab ? `${colab.nome} · ${colab.descrdep}` : "Selecione o colaborador"}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar por nome, matrícula ou departamento…" />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty>Nenhum colaborador encontrado.</CommandEmpty>
                      <CommandGroup>
                        {colabs.map((c) => {
                          const chave = `${c.codemp}-${c.codfunc}`;
                          return (
                            <CommandItem
                              key={chave}
                              value={`${c.codfunc} ${c.nome} ${c.descrdep}`}
                              onSelect={() => {
                                setChaveColab(chave);
                                setColabAberto(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", chaveColab === chave ? "opacity-100" : "opacity-0")} />
                              <span className="min-w-0">
                                <span className="block truncate text-sm">{c.nome}</span>
                                <span className="block truncate text-2xs text-muted-foreground">#{c.codfunc} · {c.descrdep}</span>
                              </span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </Field>

          <Field label="Departamento de destino" required hint="Só departamentos do OPE — com setor de produção e galpão cadastrados">
            {(p) => (
              <Popover open={depAberto} onOpenChange={setDepAberto}>
                <PopoverTrigger asChild>
                  <Button {...p} type="button" variant="outline" role="combobox" className="w-full justify-between font-normal" disabled={desabilitado}>
                    <span className="truncate">{carregando ? "Carregando departamentos…" : destino ? destino.descrdep : "Selecione o destino"}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" sideOffset={8} className="w-[--radix-popover-trigger-width] p-0">
                  <Command>
                    <CommandInput placeholder="Buscar departamento do OPE…" />
                    <CommandList className="max-h-[260px]">
                      <CommandEmpty>Nenhum departamento do OPE encontrado.</CommandEmpty>
                      <CommandGroup>
                        {destinos.map((d) => (
                          <CommandItem
                            key={d.coddep}
                            value={`${d.coddep} ${d.descrdep} ${d.setor} ${d.galpao}`}
                            onSelect={() => {
                              setCodDepDest(d.coddep);
                              setDepAberto(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", codDepDest === d.coddep ? "opacity-100" : "opacity-0")} />
                            <span className="min-w-0">
                              <span className="block truncate text-sm">{d.descrdep}</span>
                              <span className="block truncate text-2xs text-muted-foreground">
                                {onde(d)}
                                {d.nomeResp ? ` · aprova ${d.nomeResp}` : " · sem responsável"}
                              </span>
                            </span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Primeiro dia" required>
              {(p) => <Input {...p} type="date" value={dtini} onChange={(e) => setDtini(e.target.value)} disabled={desabilitado} />}
            </Field>
            <Field label="Último dia" required hint="Inclusive">
              {(p) => <Input {...p} type="date" value={dtfim} min={dtini} onChange={(e) => setDtfim(e.target.value)} disabled={desabilitado} />}
            </Field>
          </div>

          <Field label="Motivo" hint="Opcional — ajuda quem vai aprovar">
            {(p) => (
              <textarea
                {...p}
                value={motivo}
                maxLength={400}
                rows={2}
                onChange={(e) => setMotivo(e.target.value)}
                disabled={desabilitado}
                className="flex w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                placeholder="Ex.: reforço na montagem para entregar o casco 290-118"
              />
            )}
          </Field>

          {/* Prévia: o que o OPE vai fazer com esse pedido, se aprovado. */}
          {colab && destino && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0">
                  <span className="block font-medium">{origem?.descrdep ?? colab.descrdep}</span>
                  <span className="block text-2xs text-muted-foreground">{onde(origem)}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium">{destino.descrdep}</span>
                  <span className="block text-2xs text-muted-foreground">{onde(destino)}</span>
                </span>
              </div>
              {destino.nomeResp && <p className="mt-2 text-2xs text-muted-foreground">Quem aprova: <b className="text-foreground">{destino.nomeResp}</b></p>}
            </div>
          )}

          {bloqueio && colab && destino && <Alert variant="warning">{bloqueio}</Alert>}
          {erro && <Alert variant="destructive" title="Pedido não gravado">{erro}</Alert>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={!!bloqueio || desabilitado}>
            {enviando ? "Enviando…" : "Enviar para aprovação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
