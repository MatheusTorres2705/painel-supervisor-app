// src/components/alocacao/ColabDetalheDialog.tsx
// Detalhe de um colaborador: carga por dia do período (tela / ERP / outras OPs),
// o que está na tela e o que já está gravado nesta OP, com troca de colaborador.
// A seção "Habilidades" saiu: era uma lista fixa por cargo, não vinha do ERP.
import * as React from "react";

import type { Colab, Demanda, ItemErp } from "@/services/alocacaoService";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { num, toBR } from "@/lib/format";
import { toneSurface } from "@/lib/tone";
import { cn } from "@/lib/utils";
import { celula, horasPorAlocado, type Escala, type IndiceCarga } from "./planejamento";

const TH = "px-3 py-2 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground";

export function ColabDetalheDialog({
  colab,
  onFechar,
  dias,
  ix,
  cfg,
  demandas,
  colabs,
  onTrocar,
}: {
  colab: Colab | null;
  onFechar: () => void;
  dias: string[];
  ix: IndiceCarga;
  cfg: Escala;
  demandas: Demanda[];
  colabs: Colab[];
  onTrocar: (item: ItemErp, de: Colab, para: number) => Promise<void>;
}) {
  const [destino, setDestino] = React.useState<Record<string, number | "">>({});
  const [trocando, setTrocando] = React.useState<string | null>(null);
  React.useEffect(() => setDestino({}), [colab?.id]);

  const c = colab;
  const naTela = c ? demandas.filter((d) => d.alocados.includes(c.id)).sort((a, b) => a.dtPlan.localeCompare(b.dtPlan)) : [];
  const erp = c ? [...c.atividadesERP].sort((a, b) => a.dt.localeCompare(b.dt)) : [];

  return (
    <Dialog open={!!c} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {c && (
          <>
            <DialogHeader>
              <DialogTitle>{c.nome}</DialogTitle>
              <DialogDescription>
                {c.cargo} · setores {c.codSetores.join(", ") || "—"}{c.supervisor ? ` · supervisor ${c.supervisor}` : ""}
              </DialogDescription>
            </DialogHeader>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Carga no período</h4>
              <div className="overflow-x-auto rounded-md border border-border scrollbar-slim">
                <table className="w-full min-w-[30rem] text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className={TH}>Dia</th>
                      <th className={cn(TH, "text-right")}>Tela</th>
                      <th className={cn(TH, "text-right")}>Esta OP (ERP)</th>
                      <th className={cn(TH, "text-right")}>Outras OPs</th>
                      <th className={cn(TH, "text-right")}>Total / cap.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dias.map((d) => {
                      const x = celula(ix, c.id, d, cfg);
                      return (
                        <tr key={d} className="border-t border-border/60">
                          <td className="px-3 py-1.5 tabular">{toBR(d)}</td>
                          <td className="px-3 py-1.5 text-right tabular">{x.tela ? num(x.tela, 1) : "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular">{x.erp ? num(x.erp, 1) : "—"}</td>
                          <td className="px-3 py-1.5 text-right tabular">{x.externa ? num(x.externa, 1) : "—"}</td>
                          <td className="px-3 py-1.5 text-right">
                            <span className={cn("rounded-sm border px-1.5 py-0.5 tabular", toneSurface[x.tom])}>
                              {num(x.total, 1)} / {num(x.capacidade, 1)} h
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Na tela, não salvas ({naTela.length})</h4>
              <div className="overflow-x-auto rounded-md border border-border scrollbar-slim">
                <table className="w-full min-w-[30rem] text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className={TH}>Atividade</th>
                      <th className={TH}>Planejada</th>
                      <th className={cn(TH, "text-right")}>HH dele</th>
                    </tr>
                  </thead>
                  <tbody>
                    {naTela.map((d) => (
                      <tr key={d.chave} className="border-t border-border/60">
                        <td className="max-w-[20rem] truncate px-3 py-1.5" title={d.nome}>{d.nome}</td>
                        <td className="px-3 py-1.5 tabular">{toBR(d.dtPlan)}</td>
                        <td className="px-3 py-1.5 text-right tabular">
                          {num(horasPorAlocado(d), 1)} h{d.alocados.length > 1 ? ` (÷${d.alocados.length})` : ""}
                        </td>
                      </tr>
                    ))}
                    {!naTela.length && <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Nada alocado na tela.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold">Gravado nesta OP (AD_DETALCRONOGRAMAFUNC)</h4>
              <div className="overflow-x-auto rounded-md border border-border scrollbar-slim">
                <table className="w-full min-w-[36rem] text-xs">
                  <thead className="bg-muted">
                    <tr>
                      <th className={TH}>Atividade</th>
                      <th className={TH}>Data</th>
                      <th className={cn(TH, "text-right")}>HH</th>
                      <th className={TH}>Trocar para</th>
                      <th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {erp.map((p) => {
                      const k = `${p.seq}-${p.codusu}-${p.sequencia}`;
                      const candidatos = colabs.filter((o) => o.id !== c.id && (!p.codusu || o.codSetores.includes(p.codusu)));
                      const alvo = destino[k] ?? "";
                      return (
                        <tr key={k} className="border-t border-border/60">
                          <td className="max-w-[16rem] truncate px-3 py-1.5" title={`${p.codprod} - ${p.descrprod}`}>{p.codprod} - {p.descrprod}</td>
                          <td className="px-3 py-1.5 tabular">{toBR(p.dt)}</td>
                          <td className="px-3 py-1.5 text-right tabular">{num(p.qtd / 60, 1)} h</td>
                          <td className="px-3 py-1.5">
                            <Select
                              className="h-8 text-xs"
                              value={alvo}
                              onChange={(e) => setDestino((m) => ({ ...m, [k]: e.target.value ? Number(e.target.value) : "" }))}
                              aria-label="Novo colaborador"
                            >
                              <option value="">Selecione…</option>
                              {candidatos.map((o) => {
                                const livre = celula(ix, o.id, p.dt, cfg).livre;
                                return (
                                  <option key={o.id} value={o.id}>
                                    {o.nome} — {livre > 0 ? `livre ${num(livre, 1)} h` : "cheio"}
                                  </option>
                                );
                              })}
                            </Select>
                          </td>
                          <td className="px-3 py-1.5 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!alvo || trocando === k}
                              onClick={async () => {
                                if (!alvo) return;
                                setTrocando(k);
                                try {
                                  await onTrocar(p, c, alvo);
                                } finally {
                                  setTrocando(null);
                                }
                              }}
                            >
                              {trocando === k ? "Trocando…" : "Trocar"}
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!erp.length && <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nada gravado nesta OP.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
