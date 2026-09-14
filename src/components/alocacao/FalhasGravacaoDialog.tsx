// src/components/alocacao/FalhasGravacaoDialog.tsx
// Resultado de uma gravação com falhas: o que não entrou e por quê.
import type { Colab } from "@/services/alocacaoService";
import type { ResultadoGravacao } from "@/services/alocacaoService";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function FalhasGravacaoDialog({
  resultado,
  colabs,
  onFechar,
}: {
  resultado: ResultadoGravacao | null;
  colabs: Colab[];
  onFechar: () => void;
}) {
  const nome = new Map(colabs.map((c) => [c.id, c.nome]));
  const r = resultado;
  return (
    <Dialog open={!!r} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gravação com falhas</DialogTitle>
          <DialogDescription>
            {r ? `${r.gravados} de ${r.total} registros gravados. As alocações que falharam continuam na tela, marcadas como não salvas.` : ""}
          </DialogDescription>
        </DialogHeader>

        {r && r.parciais.length > 0 && (
          <Alert variant="warning" title="Gravadas só em parte">
            Estas atividades gravaram para alguns colaboradores e falharam para outros. Como a atividade já tem planejamento
            no ERP, ela sai da lista de demandas — complete pelo detalhe do colaborador: {r.parciais.join("; ")}.
          </Alert>
        )}

        {r && (
          <div className="max-h-[50dvh] overflow-auto rounded-md border border-border scrollbar-slim">
            <table className="w-full min-w-[34rem] text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left text-2xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Atividade</th>
                  <th className="px-3 py-2 font-medium">Colaborador</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {r.falhas.map((f, i) => (
                  <tr key={i} className="border-t border-border/60 align-top">
                    <td className="max-w-[14rem] px-3 py-1.5">{f.atividade}</td>
                    <td className="px-3 py-1.5">{nome.get(f.codfunc) ?? `#${f.codfunc}`}</td>
                    <td className="whitespace-pre-line px-3 py-1.5 text-destructive">{f.mensagem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onFechar}>Entendi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
