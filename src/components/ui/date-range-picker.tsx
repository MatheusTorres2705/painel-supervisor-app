// src/components/ui/date-range-picker.tsx
// Botão de período + diálogo de início e fim.
// Portado do painel-diretoria (components/ui/period-picker.tsx) para o design
// system deste projeto; o comportamento é o mesmo.
import * as React from "react";
import { CalendarRange } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  isoLocal,
  mesInteiro,
  parseData,
  rangeLabel,
  type IsoRange,
} from "@/lib/datetime";

function presets(hoje: Date): { label: string; range: IsoRange }[] {
  const a = hoje.getFullYear();
  const m = hoje.getMonth() + 1;
  const antMes = m === 1 ? 12 : m - 1;
  const antAno = m === 1 ? a - 1 : a;
  const trintaDias = new Date(hoje);
  trintaDias.setDate(trintaDias.getDate() - 29);
  return [
    { label: "Mês atual", range: mesInteiro(a, m) },
    { label: "Mês anterior", range: mesInteiro(antAno, antMes) },
    { label: "Últimos 30 dias", range: { ini: isoLocal(trintaDias), fim: isoLocal(hoje) } },
  ];
}

/**
 * O `onChange` só dispara em "Aplicar": mexer nas datas uma de cada vez
 * dispararia duas consultas, e a intermediária pode ser um intervalo que o
 * usuário nunca pediu (trocar o início antes do fim inverte a faixa).
 */
export function DateRangePicker({
  value,
  onChange,
  title = "Período",
  className,
}: {
  value: IsoRange;
  onChange: (r: IsoRange) => void;
  title?: string;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  // Reabrir sempre parte do período em vigor, não do rascunho abandonado.
  React.useEffect(() => {
    if (aberto) setDraft(value);
  }, [aberto, value]);

  const aplicar = () => {
    const a = parseData(draft.ini);
    const b = parseData(draft.fim);
    if (!a || !b) return setAberto(false);
    onChange(a <= b ? draft : { ini: draft.fim, fim: draft.ini });
    setAberto(false);
  };

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setAberto(true)}
        className={cn("max-w-full", className)}
        aria-label={`${title}: ${rangeLabel(value)}`}
      >
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        <span className="truncate">{rangeLabel(value)}</span>
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Todos os números da tela passam a considerar este intervalo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {presets(new Date()).map((p) => (
                <Button
                  key={p.label}
                  variant="secondary"
                  size="sm"
                  onClick={() => setDraft(p.range)}
                >
                  {p.label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Início">
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={draft.ini}
                    max={draft.fim}
                    onChange={(e) => {
                      const ini = e.target.value;
                      if (ini) setDraft((d) => ({ ...d, ini }));
                    }}
                  />
                )}
              </Field>
              <Field label="Fim">
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    value={draft.fim}
                    min={draft.ini}
                    onChange={(e) => {
                      const fim = e.target.value;
                      if (fim) setDraft((d) => ({ ...d, fim }));
                    }}
                  />
                )}
              </Field>
            </div>

            <p className="text-2xs text-muted-foreground">{rangeLabel(draft)}</p>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={aplicar}>Aplicar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
