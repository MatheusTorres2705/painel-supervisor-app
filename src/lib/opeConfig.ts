// src/lib/opeConfig.ts
// Parâmetros de negócio da OPE num lugar só, no padrão de `mnoConfig.ts`.
// Mudar a meta é editar uma linha aqui — não caçar número espalhado por JSX.

/**
 * Meta de OPE da fábrica, em %. Definida pela diretoria.
 *
 * OPE = horas de atividade ÷ horas de ponto × 100. Note que o retrabalho
 * (coluna "Perdas") NÃO entra no numerador: uma hora retrabalhada não conta
 * como atividade, mas também não é descontada do total. Ou seja, o OPE mede
 * quanto da hora paga virou atividade produtiva apontada.
 */
export const META_OPE = 70;

/**
 * Piso do âmbar: 80% da meta. Abaixo disso é vermelho.
 * Derivado, não digitado, para acompanhar a meta automaticamente.
 */
export const OPE_ATENCAO = Math.round(META_OPE * 0.8);

/**
 * Acima disto o número deixa de ser desempenho e vira sinal de problema no
 * dado: apontar mais hora do que se bateu ponto é impossível na prática.
 *
 * Três causas conhecidas, nenhuma confirmada até aqui — por isso a tela
 * SINALIZA para verificação em vez de afirmar a causa ou "corrigir" o valor:
 *
 *  1. O denominador conta 8h fixas por colaborador/dia (`COUNT(*) * 8` em
 *     `buildSqlPonto`). Quem trabalha 10h aponta 10h e entra com 8h.
 *  2. Numerador e denominador atribuem setor por caminhos diferentes: o ponto
 *     usa o setor de LOTAÇÃO do funcionário; a atividade, o setor de quem
 *     APONTOU. Trabalho feito fora do setor de origem infla um e deprime outro
 *     (soma zero entre setores, mas distorce a leitura por setor).
 *  3. As duas SQLs usam janelas diferentes no último dia — atividades até
 *     23:59:59, ponto até a meia-noite. Se DTPONTO tiver hora, o último dia
 *     entra no numerador e some do denominador.
 */
export const OPE_ANOMALIA = 100;

export type OpeFarol = 'ok' | 'warn' | 'bad' | 'anomalia';

/**
 * Classifica um OPE contra a meta. Devolve `null` quando não há base de
 * cálculo (ponto zero) — ausência não é zero e não deve virar vermelho.
 */
export function farolOpe(opePct: number | null | undefined): OpeFarol | null {
  if (opePct == null || !Number.isFinite(opePct)) return null;
  if (opePct > OPE_ANOMALIA) return 'anomalia';
  if (opePct >= META_OPE) return 'ok';
  if (opePct >= OPE_ATENCAO) return 'warn';
  return 'bad';
}

/** Classe de cor para o valor, já resolvida. `anomalia` usa o tom de atenção. */
// Única diferença em relação ao painel-diretoria: lá as classes são
// text-ok/text-warn/text-bad, tokens que não existem neste projeto.
export const OPE_FAROL_CLS: Record<OpeFarol, string> = {
  ok: 'text-success',
  warn: 'text-warning',
  bad: 'text-destructive',
  anomalia: 'text-warning',
};

/** Texto do `title`, para o número não ficar sem explicação na tela. */
export function opeTitulo(farol: OpeFarol | null): string | undefined {
  switch (farol) {
    case 'ok':   return `Na meta (≥ ${META_OPE}%)`;
    case 'warn': return `Abaixo da meta de ${META_OPE}%`;
    case 'bad':  return `Bem abaixo da meta (< ${OPE_ATENCAO}%)`;
    case 'anomalia':
      return 'Acima de 100%: há mais hora apontada do que hora de ponto. ' +
             'Verificar — o ponto conta 8h fixas por dia (hora extra não entra), ' +
             'e atividade e ponto atribuem setor por caminhos diferentes.';
    default: return undefined;
  }
}
