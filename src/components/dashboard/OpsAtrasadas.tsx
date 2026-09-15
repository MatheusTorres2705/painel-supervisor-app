// src/components/dashboard/OpsAtrasadas.tsx
// OPs mais distantes do previsto no mês. Clique abre a alocação da OP.
import { Link } from "react-router-dom";

import type { OpAvanco } from "@/services/opsService";
import { pctAvanco } from "@/services/opsService";
import { cn } from "@/lib/utils";

function Barra({ prev, real }: { prev: number; real: number }) {
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={`Previsto ${prev}%, real ${real}%`}>
      <div className="absolute inset-y-0 left-0 bg-muted-foreground/35" style={{ width: `${prev}%` }} />
      <div className={cn("absolute inset-y-0 left-0", real < prev - 10 ? "bg-destructive" : "bg-primary")} style={{ width: `${real}%` }} />
    </div>
  );
}

export function OpsAtrasadas({ ops }: { ops: OpAvanco[] }) {
  return (
    <ul className="divide-y divide-border">
      {ops.map((o) => {
        const prev = pctAvanco(o.avancoPrev);
        const real = pctAvanco(o.avancoReal);
        return (
          <li key={o.op}>
            <Link
              to={`/atividades/alocacao/${o.op}?op=${o.op}&codproj=${o.codproj}`}
              className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-3 rounded-md px-2 py-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_10rem_4.5rem]"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">
                  OP {o.op} · <span className="font-mono">{o.barco}</span>
                </span>
                <span className="block truncate text-2xs text-muted-foreground">{o.linha}{o.nomeparc ? ` · ${o.nomeparc}` : ""}</span>
              </span>
              <Barra prev={prev} real={real} />
              <span className="hidden text-right text-xs tabular sm:block">
                <b className={cn(real < prev - 10 ? "text-destructive" : "text-foreground")}>{real}%</b>
                <span className="text-muted-foreground"> / {prev}%</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
