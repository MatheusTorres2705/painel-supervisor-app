// src/components/patterns/SeloCalendario.tsx
// Avisa que a base de dias úteis está sem o calendário de feriados.
//
// Só aparece quando há o que avisar: um selo permanente dizendo "feriados
// descontados" viraria papel de parede em duas semanas e sumiria da percepção
// justamente quando precisasse alertar. Silêncio = está tudo certo.
import { CalendarOff } from "lucide-react";

import type { Calendario } from "@/lib/calendario";
import { Badge } from "@/components/ui/badge";

/**
 * @param carregando enquanto a consulta corre, nada é mostrado: ela é mais
 *   rápida que as do resto da tela, e um selo piscando a cada navegação seria
 *   pior do que o problema que ele denuncia.
 */
export function SeloCalendario({ cal, carregando }: { cal: Calendario; carregando?: boolean }) {
  if (cal.completo || carregando) return null;
  return (
    <Badge variant="warning" className="gap-1 text-2xs" title="Não foi possível ler os feriados do ERP. Os dias úteis estão contados como segunda a sexta, então as metas por dia ficam um pouco baixas.">
      <CalendarOff className="h-3 w-3" aria-hidden="true" />
      Feriados indisponíveis — base seg–sex
    </Badge>
  );
}
