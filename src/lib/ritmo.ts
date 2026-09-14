// src/lib/ritmo.ts
// Ritmo diário e projeção de fechamento de mês.
//
// O que se compartilha aqui é A MATEMÁTICA E A GUARDA DE ZERO — não a
// convenção de qual dia conta. Essa escolha fica no chamador, porque depende
// da granularidade do dado:
//
//  · MNO tem realizado POR DIA, então exclui o dia corrente (`diasUteisDecorridos`):
//    um dia pela metade puxaria a média para baixo e a projeção pioraria toda manhã.
//  · Análise de Indiretos tem o custo apenas por MÊS (`SUM(...M08)` no pivô), então
//    não há como tirar o consumo de hoje do numerador. Excluir o dia só do
//    denominador inflaria o R$/h. Ali a convenção é inclusiva nos dois lados,
//    com o viés declarado: durante o dia a projeção subestima e converge ao fechar.
//
// Todas as funções devolvem `number | null` em vez de 0, Infinity ou NaN.
// Ausência de base não é desempenho zero: no dia 1º não há ritmo, e um "0"
// nessa célula seria lido como "não produziu".

/** Divisão segura. `null` quando não há base de cálculo. */
export function div(a: number, b: number): number | null {
  return b > 0 && Number.isFinite(a) && Number.isFinite(b) ? a / b : null;
}

/** Média por dia útil. `null` se nenhum dia decorreu. */
export function ritmoDiario(realizado: number, diasDecorridos: number): number | null {
  return div(realizado, diasDecorridos);
}

/**
 * Projeção de fechamento pelo ritmo observado.
 *
 * Em mês já fechado, `diasDecorridos === diasTotal`, o fator vira 1 e a
 * projeção é igual ao realizado — a coluna continua honesta o ano inteiro,
 * não só no mês corrente.
 */
export function projetarMes(realizado: number, diasDecorridos: number, diasTotal: number): number | null {
  const ritmo = ritmoDiario(realizado, diasDecorridos);
  return ritmo == null ? null : ritmo * diasTotal;
}

/** Percentual de atingimento. `null` sem meta — não existe % de zero. */
export function pctAtingimento(realizado: number, meta: number): number | null {
  const r = div(realizado, meta);
  return r == null ? null : r * 100;
}
