// src/components/alocacao/CapacidadeDialog.tsx
// Capacidade diária usada no quadro, na folga do seletor, na distribuição e no
// Gantt. Não há jornada do colaborador nos dados — o PCP ajusta aqui e a tela
// lembra no navegador.
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { CAPACIDADE_PADRAO, normalizarCapacidade, type CapacidadeCfg } from "./planejamento";

export function CapacidadeDialog({
  open,
  onOpenChange,
  cfg,
  onSalvar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cfg: CapacidadeCfg;
  onSalvar: (cfg: CapacidadeCfg) => void;
}) {
  const [rascunho, setRascunho] = React.useState(cfg);
  React.useEffect(() => {
    if (open) setRascunho(cfg);
  }, [open, cfg]);

  const set = <K extends keyof CapacidadeCfg>(k: K, v: CapacidadeCfg[K]) => setRascunho((r) => ({ ...r, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Capacidade diária</DialogTitle>
          <DialogDescription>
            Vale para todos os colaboradores. Feriados do calendário do ERP zeram o dia e somem do quadro — salvo se você marcar abaixo. Fica salvo neste navegador.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Horas seg–sex">
            {(p) => <Input {...p} type="number" min={0} max={16} step={0.5} value={rascunho.horasSemana} onChange={(e) => set("horasSemana", Number(e.target.value))} />}
          </Field>
          <Field label="Horas sábado">
            {(p) => <Input {...p} type="number" min={0} max={16} step={0.5} value={rascunho.horasSabado} onChange={(e) => set("horasSabado", Number(e.target.value))} />}
          </Field>
          <Field label="Início da jornada">
            {(p) => <Input {...p} type="time" value={rascunho.inicio} onChange={(e) => set("inicio", e.target.value)} />}
          </Field>
          <Field label="Início do almoço">
            {(p) => <Input {...p} type="time" value={rascunho.almocoInicio} onChange={(e) => set("almocoInicio", e.target.value)} />}
          </Field>
          <Field label="Almoço (min)" hint="0 = sem intervalo">
            {(p) => <Input {...p} type="number" min={0} max={180} step={5} value={rascunho.almocoMin} onChange={(e) => set("almocoMin", Number(e.target.value))} />}
          </Field>
        </div>

        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            checked={rascunho.trabalharFeriado}
            onChange={(e) => set("trabalharFeriado", e.target.checked)}
          />
          <span>
            Trabalhar em feriado
            <span className="block text-xs text-muted-foreground">
              Por padrão o feriado tem 0 h e some do quadro. Marque quando a fábrica convocar — o dia volta com as horas normais.
            </span>
          </span>
        </label>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setRascunho(CAPACIDADE_PADRAO)}>Restaurar padrão</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                onSalvar(normalizarCapacidade(rascunho));
                onOpenChange(false);
              }}
            >
              Aplicar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
