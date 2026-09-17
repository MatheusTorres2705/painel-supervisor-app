// src/lib/calendario.ts
// O calendário de feriados do painel, como VALOR — puro, sem React e sem rede.
//
// Por que um `Set` de strings e não um objeto rico: `lib/datetime` precisa
// consultar feriado e NÃO pode importar este módulo (ele importa `isoLocal`
// daqui de baixo, e o ciclo se fecharia). Passando um `ReadonlySet<string>`
// cru, a dependência anda em uma direção só.
//
// Quem carrega os feriados é `services/feriadosService`; quem os leva até a
// tela é o hook `hooks/useCalendario`.
import { isoLocal } from "@/lib/datetime";

/** Feriados no formato "YYYY-MM-DD" — o mesmo de `isoLocal`. */
export type Feriados = ReadonlySet<string>;

/**
 * Ausência explícita de calendário: quem recebe isto conta só segunda a sexta.
 *
 * Existe para o parâmetro de feriados poder ser OBRIGATÓRIO nas funções de dia
 * útil. Um parâmetro opcional deixaria um call site esquecido degradar em
 * silêncio; assim, ignorar feriado é uma decisão escrita no código — e
 * `grep SEM_FERIADOS` lista todas elas.
 */
export const SEM_FERIADOS: Feriados = new Set<string>();

/**
 * O que a tela segura: os feriados, quais anos já vieram do ERP e se a carga
 * deu certo. `completo: false` é o gatilho do selo "sem feriados".
 */
export type Calendario = {
  feriados: Feriados;
  /** Anos cujo calendário já foi carregado com sucesso. */
  anos: ReadonlySet<number>;
  /** `false` = a consulta falhou ou ainda não chegou; as contas caem para seg–sex. */
  completo: boolean;
};

/** Calendário vazio — estado inicial e resultado de uma carga que falhou. */
export const CALENDARIO_VAZIO: Calendario = {
  feriados: SEM_FERIADOS,
  anos: new Set<number>(),
  completo: false,
};

/** `true` se a data cai em feriado. Aceita "YYYY-MM-DD" ou `Date`. */
export function ehFeriado(feriados: Feriados, dia: string | Date): boolean {
  return feriados.has(typeof dia === "string" ? dia : isoLocal(dia));
}

/** Os anos tocados por um intervalo — o que o hook precisa garantir carregado. */
export function anosDoIntervalo(ini: Date, fim: Date): number[] {
  const a = ini.getFullYear();
  const b = fim.getFullYear();
  if (b < a) return [a];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}
