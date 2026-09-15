// src/components/dashboard/FaltasPorBarco.tsx
// Barcos com mais faltas de material (mesma regra e farol da Lista de Faltas).
import type { BarcoGrupo } from "@/lib/listaFaltas";
import { num } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FaltasPorBarco({ barcos }: { barcos: BarcoGrupo[] }) {
  return (
    <ul className="divide-y divide-border">
      {barcos.map((b) => {
        const w = (v: number) => `${b.itens > 0 ? (v / b.itens) * 100 : 0}%`;
        return (
          <li key={b.chave} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">
                <span className="font-mono">{b.chassi}</span> <span className="text-2xs font-normal text-muted-foreground">· {b.linha}</span>
              </span>
              <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {b.vermelho > 0 && <span className="h-full bg-destructive" style={{ width: w(b.vermelho) }} />}
                {b.amarelo > 0 && <span className="h-full bg-warning" style={{ width: w(b.amarelo) }} />}
                {b.verde > 0 && <span className="h-full bg-success" style={{ width: w(b.verde) }} />}
              </span>
            </span>
            <span className="text-right text-xs tabular">
              <b className="text-foreground">{num(b.itens)}</b> <span className="text-muted-foreground">{b.itens === 1 ? "item" : "itens"}</span>
              <span className={cn("block text-2xs", b.vermelho > 0 ? "text-destructive" : "text-muted-foreground")}>
                {b.vermelho > 0 ? `${num(b.vermelho)} sem pedido` : b.amarelo > 0 ? `${num(b.amarelo)} atrasado${b.amarelo === 1 ? "" : "s"}` : "no prazo"}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
