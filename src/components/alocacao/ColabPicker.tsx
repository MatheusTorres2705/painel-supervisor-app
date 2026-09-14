// src/components/alocacao/ColabPicker.tsx
// Seleção de colaboradores para uma demanda (ou para um lote). Diferente do
// multi-select anterior, mostra a FOLGA de cada um no dia planejado, e quem é
// do setor da demanda vem primeiro — os demais ficam recolhidos.
import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import type { Colab } from "@/services/alocacaoService";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ColabPicker({
  colabs,
  selecionados,
  onChange,
  setor,
  dia,
  horas,
  livreDe,
  vazio = "Sem alocação",
  className,
  align = "start",
}: {
  colabs: Colab[];
  selecionados: number[];
  onChange: (ids: number[]) => void;
  /** Setor (CODUSU) da demanda — quem atua nele aparece primeiro. */
  setor?: number;
  /** Dia em que a folga é calculada. */
  dia?: string;
  /** HH total a dividir entre os selecionados (para o aviso de estouro). */
  horas?: number;
  /** Folga do colaborador no dia, SEM contar a contribuição desta demanda. */
  livreDe?: (codfunc: number, dia: string) => number;
  vazio?: string;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [verOutros, setVerOutros] = React.useState(false);

  const porId = React.useMemo(() => new Map(colabs.map((c) => [c.id, c])), [colabs]);
  const k = busca.trim().toLowerCase();
  const casa = (c: Colab) => !k || `${c.id} ${c.nome} ${c.cargo}`.toLowerCase().includes(k);

  const doSetor = colabs.filter((c) => (setor == null || c.codSetores.includes(setor)) && casa(c));
  const outros = setor == null ? [] : colabs.filter((c) => !c.codSetores.includes(setor) && casa(c));

  // Cota se o colaborador entrar (ou continuar) na seleção.
  const cotaCom = (id: number) => {
    if (!horas) return 0;
    const n = selecionados.includes(id) ? selecionados.length : selecionados.length + 1;
    return horas / Math.max(1, n);
  };

  const alternar = (id: number) =>
    onChange(selecionados.includes(id) ? selecionados.filter((x) => x !== id) : [...selecionados, id]);

  const nomes = selecionados.map((id) => porId.get(id)?.nome ?? `#${id}`);
  const rotulo =
    selecionados.length === 0 ? vazio : selecionados.length === 1 ? nomes[0] : `${selecionados.length} colaboradores`;

  const item = (c: Colab) => {
    const sel = selecionados.includes(c.id);
    const livre = dia && livreDe ? livreDe(c.id, dia) : null;
    const cota = cotaCom(c.id);
    const estoura = livre != null && cota > 0 && cota > livre + 0.01;
    return (
      <button
        key={c.id}
        type="button"
        role="menuitemcheckbox"
        aria-checked={sel}
        onClick={() => alternar(c.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
          sel ? "bg-primary/10" : "hover:bg-muted"
        )}
      >
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
            sel ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"
          )}
        >
          {sel && <Check className="h-3 w-3" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{c.nome}</span>
          <span className="block truncate text-2xs text-muted-foreground">
            {c.cargo}
            {c.supervisor ? ` · ${c.supervisor}` : ""}
          </span>
        </span>
        {livre != null && (
          <span
            className={cn(
              "shrink-0 tabular text-2xs font-medium",
              livre <= 0 ? "text-destructive" : estoura ? "text-warning" : "text-success"
            )}
            title={estoura ? `Recebe ${num(cota, 1)} h e só tem ${num(Math.max(0, livre), 1)} h livres` : "Horas livres no dia"}
          >
            {livre <= 0 ? `cheio ${num(livre, 1)} h` : `livre ${num(livre, 1)} h`}
          </span>
        )}
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-1 rounded-md border border-input bg-card px-2 text-left text-xs shadow-xs",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            !selecionados.length && "text-muted-foreground",
            className
          )}
          title={nomes.join(", ") || undefined}
        >
          <span className="truncate">{rotulo}</span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-2" align={align}>
        <Input
          placeholder="Buscar colaborador…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="mb-2 h-8 text-xs"
          aria-label="Buscar colaborador"
        />
        {dia && (
          <p className="mb-1 px-1 text-2xs text-muted-foreground">
            Folga no dia {dia.split("-").reverse().join("/")}
            {horas ? ` · ${num(horas, 1)} h a dividir` : ""}
          </p>
        )}

        <div className="max-h-64 space-y-0.5 overflow-y-auto scrollbar-slim" role="menu">
          {setor != null && <p className="px-1 pt-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">Do setor</p>}
          {doSetor.map(item)}
          {!doSetor.length && (
            <p className="px-2 py-1 text-2xs text-muted-foreground">Ninguém do setor{k ? " para a busca" : ""}.</p>
          )}

          {outros.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setVerOutros((v) => !v)}
                className="mt-1 w-full rounded-md px-1 py-1 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                aria-expanded={verOutros}
              >
                {verOutros ? "▾" : "▸"} Outros setores ({outros.length})
              </button>
              {verOutros && outros.map(item)}
            </>
          )}
        </div>

        {selecionados.length > 0 && (
          <div className="mt-2 border-t border-border pt-2">
            <div className="flex flex-wrap gap-1">
              {selecionados.map((id) => (
                <span key={id} className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-2xs text-primary">
                  {porId.get(id)?.nome ?? `#${id}`}
                  <button
                    type="button"
                    onClick={() => onChange(selecionados.filter((x) => x !== id))}
                    className="rounded-full hover:bg-primary/20"
                    aria-label={`Remover ${porId.get(id)?.nome ?? id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" variant="ghost" className="h-7 px-2 text-2xs" onClick={() => onChange([])}>
                Limpar todos
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
