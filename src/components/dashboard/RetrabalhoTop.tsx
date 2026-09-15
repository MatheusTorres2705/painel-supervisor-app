// src/components/dashboard/RetrabalhoTop.tsx
// Atividades com mais horas de retrabalho no mês.
import { num } from "@/lib/format";

export function RetrabalhoTop({ itens, total }: { itens: { atividade: string; setor: string; hh: number }[]; total: number }) {
  return (
    <ul className="divide-y divide-border">
      {itens.map((it, i) => (
        <li key={`${it.setor}-${it.atividade}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-2">
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground" title={it.atividade}>{it.atividade}</span>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full bg-destructive/70" style={{ width: `${total > 0 ? (it.hh / total) * 100 : 0}%` }} />
            </span>
          </span>
          <span className="text-right text-xs tabular">
            <b className="text-foreground">{num(it.hh, 1)} h</b>
            <span className="block truncate text-2xs text-muted-foreground">{it.setor}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
