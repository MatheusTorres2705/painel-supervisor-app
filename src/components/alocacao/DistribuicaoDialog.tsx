// src/components/alocacao/DistribuicaoDialog.tsx
// Prévia da distribuição automática. Nada muda até o PCP aplicar.
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { Colab } from "@/services/alocacaoService";
import { num, toBR } from "@/lib/format";
import type { Sugestao } from "./planejamento";

export function DistribuicaoDialog({
  sugestao,
  colabs,
  onAplicar,
  onFechar,
}: {
  sugestao: Sugestao | null;
  colabs: Colab[];
  onAplicar: () => void;
  onFechar: () => void;
}) {
  const nome = new Map(colabs.map((c) => [c.id, c.nome]));
  const s = sugestao;

  return (
    <Dialog open={!!s} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Distribuição sugerida</DialogTitle>
          <DialogDescription>
            Demanda mais antiga primeiro; cada uma vai para quem é do setor e tem mais folga no dia. Se ninguém tem folga,
            procura os próximos dias do período. Atividade maior que a folga de uma pessoa é dividida entre várias.
          </DialogDescription>
        </DialogHeader>

        {s && (
          <>
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="success">{s.propostas.length} alocadas</Badge>
              <Badge variant="warning">{s.movidas} com data movida</Badge>
              <Badge variant="destructive">{s.semCapacidade.length} sem folga no período</Badge>
              {s.semCandidato.length > 0 && <Badge variant="muted">{s.semCandidato.length} sem colaborador do setor</Badge>}
            </div>

            <div className="max-h-[50dvh] overflow-auto rounded-md border border-border scrollbar-slim">
              <table className="w-full min-w-[36rem] text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Atividade</th>
                    <th className="px-3 py-2 font-medium">Planejada</th>
                    <th className="px-3 py-2 font-medium">Colaboradores</th>
                  </tr>
                </thead>
                <tbody>
                  {s.propostas.map((p) => (
                    <tr key={p.chave} className="border-t border-border/60">
                      <td className="max-w-[18rem] truncate px-3 py-1.5" title={p.nome}>{p.nome}</td>
                      <td className="whitespace-nowrap px-3 py-1.5 tabular">
                        {toBR(p.dtPlan)}
                        {p.dtPlan !== p.dtPlanAntes && <span className="ml-1 text-warning">(era {toBR(p.dtPlanAntes)})</span>}
                      </td>
                      <td className="px-3 py-1.5">{p.alocados.map((id) => nome.get(id) ?? `#${id}`).join(", ")}</td>
                    </tr>
                  ))}
                  {[...s.semCapacidade, ...s.semCandidato].map((d) => (
                    <tr key={d.chave} className="border-t border-border/60 bg-destructive-subtle/40">
                      <td className="max-w-[18rem] truncate px-3 py-1.5" title={d.nome}>{d.nome}</td>
                      <td className="px-3 py-1.5 tabular">{toBR(d.dtPlan)}</td>
                      <td className="px-3 py-1.5 text-destructive">
                        {s.semCandidato.includes(d) ? "ninguém do setor" : `sem folga para ${num(d.hhPrev, 1)} h`}
                      </td>
                    </tr>
                  ))}
                  {!s.propostas.length && !s.semCapacidade.length && !s.semCandidato.length && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">Nenhuma demanda sem alocação no recorte.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button onClick={onAplicar} disabled={!s?.propostas.length}>
            Aplicar {s?.propostas.length ?? 0}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
