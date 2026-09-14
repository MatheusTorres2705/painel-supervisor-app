// src/components/alocacao/BacklogDialog.tsx
// Demandas atrasadas (data da demanda antes de hoje), de qualquer período.
// Daqui o PCP remarca a data ou manda as linhas para a seleção do lote.
import * as React from "react";

import type { Demanda } from "@/services/alocacaoService";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { num, toBR } from "@/lib/format";
import { atrasoDias } from "./planejamento";

export function BacklogDialog({
  open,
  onOpenChange,
  demandas,
  hoje,
  diaSugerido,
  onDtPlan,
  onSelecionar,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  demandas: Demanda[];
  hoje: string;
  diaSugerido: string;
  onDtPlan: (chaves: string[], dia: string) => void;
  onSelecionar: (chaves: string[]) => void;
}) {
  const atrasadas = React.useMemo(
    () => demandas.filter((d) => atrasoDias(d, hoje) > 0).sort((a, b) => a.dtDemanda.localeCompare(b.dtDemanda)),
    [demandas, hoje]
  );
  const horas = atrasadas.reduce((s, d) => s + d.hhPrev, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Backlog — demandas atrasadas</DialogTitle>
          <DialogDescription>
            Demanda anterior a {toBR(hoje)} e ainda sem planejamento no ERP · {atrasadas.length} atividades · {num(horas, 1)} h
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55dvh] overflow-auto rounded-md border border-border scrollbar-slim">
          <table className="w-full min-w-[40rem] text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 font-medium">Atividade</th>
                <th className="px-3 py-2 font-medium">Setor</th>
                <th className="px-3 py-2 text-right font-medium">HH</th>
                <th className="px-3 py-2 font-medium">Demanda</th>
                <th className="px-3 py-2 font-medium">Planejada</th>
              </tr>
            </thead>
            <tbody>
              {atrasadas.map((d) => (
                <tr key={d.chave} className="border-t border-border/60">
                  <td className="max-w-[18rem] truncate px-3 py-1.5" title={d.nome}>{d.nome}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{d.setor}</td>
                  <td className="px-3 py-1.5 text-right tabular">{num(d.hhPrev, 1)} h</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular">
                    {toBR(d.dtDemanda)} <Badge variant="destructive" className="ml-1 text-2xs">{atrasoDias(d, hoje)} d</Badge>
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        value={d.dtPlan}
                        onChange={(e) => e.target.value && onDtPlan([d.chave], e.target.value)}
                        className="h-8 w-[8.5rem] px-2 text-xs"
                        aria-label={`Data planejada de ${d.nome}`}
                      />
                      <Button size="sm" variant="outline" className="h-8 px-2 text-2xs" onClick={() => onDtPlan([d.chave], diaSugerido)}>
                        {toBR(diaSugerido).slice(0, 5)}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!atrasadas.length && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhuma demanda atrasada.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            variant="outline"
            disabled={!atrasadas.length}
            onClick={() => onDtPlan(atrasadas.map((d) => d.chave), diaSugerido)}
          >
            Planejar todas para {toBR(diaSugerido)}
          </Button>
          <Button
            disabled={!atrasadas.length}
            onClick={() => {
              onSelecionar(atrasadas.map((d) => d.chave));
              onOpenChange(false);
            }}
          >
            Selecionar para alocar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
