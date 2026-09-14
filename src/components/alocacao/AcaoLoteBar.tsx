// src/components/alocacao/AcaoLoteBar.tsx
// Ações sobre as demandas selecionadas: data, colaboradores, limpar, distribuir.
// Fica presa ao pé da tela enquanto houver seleção.
import * as React from "react";
import { CalendarCheck, Eraser, Sparkles, X } from "lucide-react";

import type { Colab } from "@/services/alocacaoService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { num } from "@/lib/format";
import { ColabPicker } from "./ColabPicker";

export function AcaoLoteBar({
  quantidade,
  horas,
  diaSugerido,
  setor,
  colabs,
  livreDe,
  onAplicarData,
  onAlocar,
  onLimpar,
  onDistribuir,
  onCancelar,
}: {
  quantidade: number;
  horas: number;
  /** Data inicial do campo (a do Gantt ou a primeira selecionada). */
  diaSugerido: string;
  /** Setor comum às selecionadas, se houver um só. */
  setor?: number;
  colabs: Colab[];
  livreDe: (codfunc: number, dia: string) => number;
  onAplicarData: (dia: string) => void;
  onAlocar: (ids: number[]) => void;
  onLimpar: () => void;
  onDistribuir: () => void;
  onCancelar: () => void;
}) {
  const [dia, setDia] = React.useState(diaSugerido);
  const [ids, setIds] = React.useState<number[]>([]);
  React.useEffect(() => setDia(diaSugerido), [diaSugerido]);

  return (
    <div
      role="region"
      aria-label="Ações nas demandas selecionadas"
      className="sticky bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-card/95 p-3 shadow-overlay backdrop-blur"
    >
      <div className="mr-1 text-sm">
        <b className="tabular">{quantidade}</b> {quantidade === 1 ? "selecionada" : "selecionadas"}
        <span className="text-muted-foreground"> · {num(horas, 1)} h</span>
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={dia}
          onChange={(e) => setDia(e.target.value)}
          className="h-8 w-[8.5rem] px-2 text-xs"
          aria-label="Data planejada para as selecionadas"
        />
        <Button size="sm" variant="outline" onClick={() => dia && onAplicarData(dia)} disabled={!dia}>
          <CalendarCheck className="h-3.5 w-3.5" /> Aplicar data
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="w-52">
          <ColabPicker
            colabs={colabs}
            selecionados={ids}
            onChange={setIds}
            setor={setor}
            dia={dia}
            horas={horas}
            livreDe={livreDe}
            vazio="Escolher colaboradores…"
          />
        </div>
        <Button
          size="sm"
          onClick={() => {
            onAlocar(ids);
            setIds([]);
          }}
          disabled={!ids.length}
          title="Substitui os colaboradores das selecionadas"
        >
          Alocar
        </Button>
      </div>

      <Button size="sm" variant="outline" onClick={onDistribuir} title="Sugere colaborador e dia pela folga de cada um">
        <Sparkles className="h-3.5 w-3.5" /> Distribuir
      </Button>
      <Button size="sm" variant="ghost" onClick={onLimpar}>
        <Eraser className="h-3.5 w-3.5" /> Limpar alocação
      </Button>
      <Button size="icon-sm" variant="ghost" className="ml-auto" onClick={onCancelar} aria-label="Desfazer seleção">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
