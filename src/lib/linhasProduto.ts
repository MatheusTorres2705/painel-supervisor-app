// src/lib/linhasProduto.ts
// Linha de produto (NX 260-290 … NX 500) a partir do projeto pai do cronograma.
//
// O CASE estava copiado dentro das consultas de Atividades e do Dashboard; a
// Lista de Faltas passou a precisar dele também. Uma expressão só, para as
// telas não darem nomes diferentes à mesma linha.

/** Ordem de exibição das linhas; as mesmas etiquetas do CASE abaixo. */
export const ORDEM_LINHAS = ["NX 260-290", "NX 340-350", "NX 360-370", "NX 410", "NX 440", "NX 500"];

/** Rótulo para falta/OP sem cronograma que leve a uma linha. */
export const SEM_LINHA = "Sem linha";

/**
 * Expressão SQL da linha.
 * @param pai alias do TCSPRJ pai (o que tem AD_CODGRUPOPROD).
 * @param fallback expressão usada quando o grupo não é de uma linha conhecida
 *   (em geral a descrição do grupo de produto do cronograma).
 */
export function sqlLinhaProduto(pai: string, fallback: string): string {
  return `CASE
                WHEN ${pai}.AD_CODGRUPOPROD IN (020100,020200,020300,020400,021000) THEN 'NX 260-290'
                WHEN ${pai}.AD_CODGRUPOPROD IN (020800,021400) THEN 'NX 340-350'
                WHEN ${pai}.AD_CODGRUPOPROD IN (020500,020600) THEN 'NX 360-370'
                WHEN ${pai}.AD_CODGRUPOPROD IN (020700,021300) THEN 'NX 410'
                WHEN ${pai}.AD_CODGRUPOPROD IN (021200) THEN 'NX 440'
                WHEN ${pai}.AD_CODGRUPOPROD IN (020900,021100) THEN 'NX 500'
                ELSE ${fallback}
              END`;
}

/** Ordena rótulos de linha: as conhecidas na ordem acima, depois as outras, "Sem linha" por último. */
export function compararLinhas(a: string, b: string): number {
  const rank = (l: string) => {
    if (l === SEM_LINHA) return ORDEM_LINHAS.length + 1;
    const i = ORDEM_LINHAS.indexOf(l);
    return i === -1 ? ORDEM_LINHAS.length : i;
  };
  return rank(a) - rank(b) || a.localeCompare(b, "pt-BR");
}
