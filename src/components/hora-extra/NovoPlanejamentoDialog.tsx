// src/components/hora-extra/NovoPlanejamentoDialog.tsx
// Assistente de duas etapas: cabeçalho (AD_BANCOHORAS) + colaboradores (AD_BCOFUN).
// Extraído da página; a lógica de gravação continua em HoraExtraPage.
import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Users, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/EmptyState";
import { cn } from "@/lib/utils";
import { duracaoMin, formatDuracao } from "@/lib/horas";
import { toBR } from "@/lib/format";
import { fotoUrl } from "@/lib/fotoFuncionario";

export type DepOpt = { coddep: number; descrdep: string };

export type FuncOpt = {
  codfunc: number;
  nomefunc: string;
  coddep: number;
  descrdep: string;
  descrcargo: string;
};

function Passo({
  n,
  label,
  ativo,
  concluido,
  onClick,
  disabled,
}: {
  n: number;
  label: string;
  ativo: boolean;
  concluido: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={ativo ? "step" : undefined}
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-40",
        ativo
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted"
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 place-items-center rounded-full text-2xs",
          ativo
            ? "bg-primary-foreground/20"
            : concluido
              ? "bg-success text-success-foreground"
              : "bg-muted-foreground/20"
        )}
      >
        {concluido && !ativo ? <Check className="h-3 w-3" /> : n}
      </span>
      {label}
    </button>
  );
}

export function NovoPlanejamentoDialog({
  open,
  onOpenChange,
  deps,
  depsLoading,
  funcs,
  funcsLoading,
  salvando,
  progresso,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  deps: DepOpt[];
  depsLoading: boolean;
  funcs: FuncOpt[];
  funcsLoading: boolean;
  salvando: boolean;
  progresso: { total: number; ok: number; fail: number };
  onSalvar: (dados: {
    coddep: number;
    data: string;
    hrIni: string;
    hrFin: string;
    funcionarios: FuncOpt[];
  }) => void;
}) {
  const [passo, setPasso] = React.useState<1 | 2>(1);
  const [coddep, setCoddep] = React.useState<number | null>(null);
  const [data, setData] = React.useState("");
  const [hrIni, setHrIni] = React.useState("");
  const [hrFin, setHrFin] = React.useState("");
  const [busca, setBusca] = React.useState("");
  const [selecionados, setSelecionados] = React.useState<Record<number, FuncOpt>>({});
  const [depAberto, setDepAberto] = React.useState(false);

  // Reinicia sempre que o assistente abre.
  React.useEffect(() => {
    if (!open) return;
    setPasso(1);
    setCoddep(null);
    setData("");
    setHrIni("");
    setHrFin("");
    setBusca("");
    setSelecionados({});
  }, [open]);

  const depLabel = React.useMemo(() => {
    if (!coddep) return "";
    const d = deps.find((x) => x.coddep === coddep);
    return d ? `${d.descrdep}` : String(coddep);
  }, [coddep, deps]);

  const cabecalhoOk = Boolean(coddep && data && hrIni && hrFin);
  const lista = React.useMemo(() => Object.values(selecionados), [selecionados]);
  const duracao = duracaoMin(hrIni, hrFin);

  const funcsFiltrados = React.useMemo(() => {
    const k = busca.trim().toLowerCase();
    const dados = [...funcs];

    // Colaboradores do setor planejado sobem para o topo.
    if (coddep) {
      dados.sort((a, b) => {
        const aIn = a.coddep === coddep ? 0 : 1;
        const bIn = b.coddep === coddep ? 0 : 1;
        if (aIn !== bIn) return aIn - bIn;
        return a.nomefunc.localeCompare(b.nomefunc, "pt-BR");
      });
    }

    if (!k) return dados;
    return dados.filter(
      (f) =>
        String(f.codfunc).includes(k) ||
        f.nomefunc.toLowerCase().includes(k) ||
        f.descrdep.toLowerCase().includes(k) ||
        f.descrcargo.toLowerCase().includes(k)
    );
  }, [funcs, busca, coddep]);

  const toggle = (f: FuncOpt) =>
    setSelecionados((prev) => {
      const next = { ...prev };
      if (next[f.codfunc]) delete next[f.codfunc];
      else next[f.codfunc] = f;
      return next;
    });

  const marcarSetorInteiro = () => {
    if (!coddep) return;
    setSelecionados((prev) => {
      const next = { ...prev };
      for (const f of funcs) if (f.coddep === coddep) next[f.codfunc] = f;
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (salvando ? null : onOpenChange(v))}>
      <DialogContent className="flex max-h-[90vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b border-border p-4">
          <DialogTitle>Novo planejamento de hora extra</DialogTitle>
          <DialogDescription>
            Defina o turno e escolha quem vai participar.
          </DialogDescription>

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Passo
              n={1}
              label="Turno"
              ativo={passo === 1}
              concluido={cabecalhoOk}
              onClick={() => setPasso(1)}
              disabled={salvando}
            />
            <span className="text-muted-foreground" aria-hidden="true">
              ›
            </span>
            <Passo
              n={2}
              label="Colaboradores"
              ativo={passo === 2}
              concluido={lista.length > 0}
              onClick={() => setPasso(2)}
              disabled={!cabecalhoOk || salvando}
            />

            {lista.length > 0 ? (
              <Badge variant="accent" className="ml-auto">
                {lista.length} selecionado(s)
                {duracao ? ` • ${formatDuracao(duracao * lista.length)}` : ""}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {passo === 1 ? (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Setor" required className="sm:col-span-2">
                  {(p) => (
                    <Popover open={depAberto} onOpenChange={setDepAberto}>
                      <PopoverTrigger asChild>
                        <Button
                          {...p}
                          type="button"
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                          disabled={depsLoading || salvando}
                        >
                          <span className="truncate">
                            {depsLoading
                              ? "Carregando setores…"
                              : depLabel || "Selecione o setor"}
                          </span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent
                        align="start"
                        sideOffset={8}
                        className="w-[--radix-popover-trigger-width] p-0"
                      >
                        <Command>
                          <CommandInput placeholder="Buscar setor…" />
                          <CommandList className="max-h-[240px]">
                            <CommandEmpty>Nenhum setor encontrado.</CommandEmpty>
                            <CommandGroup>
                              {deps.map((d) => (
                                <CommandItem
                                  key={d.coddep}
                                  value={`${d.coddep} ${d.descrdep}`}
                                  onSelect={() => {
                                    setCoddep(d.coddep);
                                    setDepAberto(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      coddep === d.coddep ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="truncate text-sm">{d.descrdep}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </Field>

                <Field label="Data" required className="sm:col-span-2">
                  {(p) => (
                    <Input
                      {...p}
                      type="date"
                      value={data}
                      onChange={(e) => setData(e.target.value)}
                      disabled={salvando}
                    />
                  )}
                </Field>

                <Field label="Início" required>
                  {(p) => (
                    <Input
                      {...p}
                      type="time"
                      value={hrIni}
                      onChange={(e) => setHrIni(e.target.value)}
                      disabled={salvando}
                    />
                  )}
                </Field>

                <Field
                  label="Fim"
                  required
                  hint={
                    duracao != null && duracao > 0
                      ? `Duração: ${formatDuracao(duracao)}${
                          hrFin < hrIni ? " (vira o dia)" : ""
                        }`
                      : undefined
                  }
                >
                  {(p) => (
                    <Input
                      {...p}
                      type="time"
                      value={hrFin}
                      onChange={(e) => setHrFin(e.target.value)}
                      disabled={salvando}
                    />
                  )}
                </Field>
              </div>

              {cabecalhoOk ? (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    Resumo do turno
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    <strong>{depLabel}</strong> • {toBR(data)} • {hrIni} → {hrFin}{" "}
                    <span className="text-muted-foreground">
                      ({formatDuracao(duracao)} por pessoa)
                    </span>
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Buscar colaborador" className="min-w-[240px] flex-1">
                  {(p) => (
                    <Input
                      {...p}
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      placeholder="Nome, matrícula, setor ou cargo…"
                      disabled={salvando}
                    />
                  )}
                </Field>

                <Button
                  variant="outline"
                  onClick={marcarSetorInteiro}
                  disabled={!coddep || salvando}
                >
                  <Users className="h-4 w-4" />
                  Marcar setor
                </Button>

                <Button
                  variant="ghost"
                  onClick={() => setSelecionados({})}
                  disabled={!lista.length || salvando}
                >
                  Limpar
                </Button>
              </div>

              {lista.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
                  {lista.slice(0, 30).map((s) => (
                    <button
                      key={s.codfunc}
                      type="button"
                      onClick={() => (salvando ? null : toggle(s))}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
                      aria-label={`Remover ${s.nomefunc}`}
                    >
                      <Badge variant="secondary" className="gap-1">
                        {s.nomefunc}
                        <X className="h-3 w-3" aria-hidden="true" />
                      </Badge>
                    </button>
                  ))}
                  {lista.length > 30 ? (
                    <Badge variant="muted">+{lista.length - 30}</Badge>
                  ) : null}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-lg border border-border">
                {funcsLoading ? (
                  <div className="space-y-2 p-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : funcsFiltrados.length === 0 ? (
                  <EmptyState
                    title="Nenhum colaborador encontrado"
                    description="Ajuste a busca para localizar quem você procura."
                  />
                ) : (
                  <ul className="max-h-[42vh] divide-y divide-border overflow-y-auto scrollbar-slim">
                    {funcsFiltrados.map((f) => {
                      const marcado = Boolean(selecionados[f.codfunc]);
                      const doSetor = coddep ? f.coddep === coddep : false;

                      return (
                        <li key={f.codfunc}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40",
                              marcado && "bg-accent-subtle/50"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={marcado}
                              onChange={() => toggle(f)}
                              disabled={salvando}
                              className="h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />

                            <Avatar className="h-8 w-8 shrink-0">
                              <AvatarImage
                                src={fotoUrl(f.codfunc)}
                                alt=""
                                referrerPolicy="no-referrer"
                              />
                              <AvatarFallback className="text-2xs">
                                {f.nomefunc
                                  .split(" ")
                                  .map((s) => s[0])
                                  .slice(0, 2)
                                  .join("")}
                              </AvatarFallback>
                            </Avatar>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground">
                                {f.nomefunc}
                              </p>
                              <p className="truncate text-2xs text-muted-foreground">
                                {f.descrcargo} • {f.descrdep}
                              </p>
                            </div>

                            {doSetor ? (
                              <Badge variant="accent" className="shrink-0">
                                do setor
                              </Badge>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border p-4">
          <Button
            variant="outline"
            onClick={() => (passo === 2 ? setPasso(1) : onOpenChange(false))}
            disabled={salvando}
          >
            {passo === 2 ? "Voltar" : "Cancelar"}
          </Button>

          {passo === 1 ? (
            <Button onClick={() => setPasso(2)} disabled={!cabecalhoOk}>
              Escolher colaboradores
            </Button>
          ) : (
            <Button
              onClick={() =>
                onSalvar({
                  coddep: coddep!,
                  data,
                  hrIni,
                  hrFin,
                  funcionarios: lista,
                })
              }
              disabled={salvando || !cabecalhoOk || !lista.length}
            >
              {salvando ? (
                <>
                  <Loader2 className="animate-spin" aria-hidden="true" />
                  Salvando {progresso.ok}/{progresso.total}
                  {progresso.fail ? ` • ${progresso.fail} falha(s)` : ""}
                </>
              ) : (
                `Salvar planejamento (${lista.length})`
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
