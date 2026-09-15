// src/components/dashboard/EquipeFaltas.tsx
// Quem faltou hoje e no último dia útil (AD_VFALTA).
import type { FaltaRecente } from "@/services/absenteismoService";
import { num, toBR } from "@/lib/format";

export function EquipeFaltas({ grupos }: { grupos: { rotulo: string; dia: string; faltas: FaltaRecente[] }[] }) {
  return (
    <div className="space-y-3 px-2 py-1">
      {grupos.map((g) => (
        <section key={g.dia}>
          <h4 className="mb-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            {g.rotulo} · {toBR(g.dia)} · {num(g.faltas.length)} {g.faltas.length === 1 ? "falta" : "faltas"}
          </h4>
          {g.faltas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma falta registrada.</p>
          ) : (
            <ul className="divide-y divide-border">
              {g.faltas.map((f, i) => (
                <li key={`${f.codfunc}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{f.nome || `#${f.codfunc}`}</span>
                    {f.gestor && <span className="block truncate text-2xs text-muted-foreground">{f.gestor}</span>}
                  </span>
                  <span className="shrink-0 text-xs tabular text-muted-foreground">{num(f.hhPerdido, 1)} h</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
