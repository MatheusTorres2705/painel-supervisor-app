// src/components/daily/SeletorRecorte.tsx
// O recorte da daily: um galpão e VÁRIOS setores (a daily de Montagem +
// Acabamento é uma reunião só). Os atalhos são os agrupamentos habituais.
//
// Setores (TSIGRU) e galpões (TPRPLP) chegam por prop: vêm do banco, as mesmas
// listas que a tela do OPE usa.
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/ui/chip";
import type { AtalhoDaily } from "@/lib/dailyConfig";
import type { GalpaoOpe, GrupoProducao } from "@/services/opeService";
import { cn } from "@/lib/utils";

const mesmoConjunto = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function SeletorRecorte({
  galpao,
  setores,
  galpoes,
  grupos,
  atalhos,
  carregando,
  onGalpao,
  onSetores,
  className,
}: {
  /** CODPLP ou "todos". */
  galpao: string;
  /** CODGRUPO marcados; vazio = todos. */
  setores: string[];
  galpoes: GalpaoOpe[];
  /** Os setores que o galpão escolhido comporta. */
  grupos: GrupoProducao[];
  atalhos: AtalhoDaily[];
  carregando?: boolean;
  onGalpao: (codPlp: string) => void;
  onSetores: (codGrupos: string[]) => void;
  className?: string;
}) {
  const alternar = (id: string) =>
    onSetores(setores.includes(id) ? setores.filter((s) => s !== id) : [...setores, id]);

  if (carregando && galpoes.length === 0) {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true" aria-label="Carregando setores e galpões">
        <Skeleton className="h-9 w-full max-w-xl" />
        <Skeleton className="h-9 w-full max-w-3xl" />
      </div>
    );
  }

  /* Atalho só aparece se todos os setores dele cabem no galpão escolhido —
     "Montagem + Acabamento" não faz sentido no galpão de Componentes. */
  const noGalpao = new Set(grupos.map((g) => g.codGrupo));
  const atalhosVisiveis = atalhos.filter((a) => a.setores.every((s) => noGalpao.has(s)));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Galpão">
        <Chip ativo={galpao === "todos"} onClick={() => onGalpao("todos")}>
          Todos os galpões
        </Chip>
        {galpoes.map((g) => (
          <Chip key={g.codPlp} ativo={galpao === g.codPlp} onClick={() => onGalpao(g.codPlp)}>
            {g.nome}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Setores">
        <Chip ativo={setores.length === 0} onClick={() => onSetores([])} title="Sem filtro: todos os setores somados">
          Todos os setores
        </Chip>
        {grupos.map((s) => (
          <Chip key={s.codGrupo} ativo={setores.includes(s.codGrupo)} onClick={() => alternar(s.codGrupo)} title="Os setores marcados somam">
            {s.nome}
          </Chip>
        ))}
      </div>

      {atalhosVisiveis.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Dailies">
          <span className="text-2xs uppercase tracking-wide text-muted-foreground">Dailies</span>
          {atalhosVisiveis.map((a) => (
            <Chip
              key={a.id}
              ativo={mesmoConjunto(setores, a.setores)}
              onClick={() => onSetores([...a.setores])}
              title={`Marca ${a.setores.length} setores de uma vez`}
            >
              {a.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
