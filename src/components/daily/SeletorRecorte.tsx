// src/components/daily/SeletorRecorte.tsx
// O recorte da daily: um galpão e VÁRIOS setores (a daily de Montagem +
// Acabamento é uma reunião só). Os atalhos são os agrupamentos habituais.
import { Chip } from "@/components/ui/chip";
import { GALPOES_DAILY, GRUPOS_DAILY, SETORES_DAILY } from "@/lib/dailyConfig";
import { cn } from "@/lib/utils";

const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function SeletorRecorte({
  galpao,
  setores,
  onGalpao,
  onSetores,
  className,
}: {
  galpao: string;
  setores: string[];
  onGalpao: (id: string) => void;
  onSetores: (ids: string[]) => void;
  className?: string;
}) {
  const alternar = (id: string) =>
    onSetores(setores.includes(id) ? setores.filter((s) => s !== id) : [...setores, id]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Galpão">
        {GALPOES_DAILY.map((g) => (
          <Chip key={g.id} ativo={galpao === g.id} onClick={() => onGalpao(g.id)}>
            {g.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Setores">
        <Chip ativo={setores.length === 0} onClick={() => onSetores([])} title="Sem filtro: todos os setores somados">
          Todos os setores
        </Chip>
        {SETORES_DAILY.map((s) => (
          <Chip key={s.id} ativo={setores.includes(s.id)} onClick={() => alternar(s.id)} title="Os setores marcados somam">
            {s.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dailies">
        <span className="text-2xs uppercase tracking-wide text-muted-foreground">Dailies</span>
        {GRUPOS_DAILY.map((g) => (
          <Chip
            key={g.id}
            ativo={mesmoConjunto(setores, g.setores)}
            onClick={() => onSetores([...g.setores])}
            title={`Marca ${g.setores.length} setores de uma vez`}
          >
            {g.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}
