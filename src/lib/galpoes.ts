// src/lib/galpoes.ts
//
// Qual linha de produto roda em qual galpão.
//
// Saiu da `OpeDetalhamentoModal`, onde vivia, quando o desdobramento passou a
// precisar da mesma informação para agrupar as horas do OPE. Duplicar a
// lotação em duas telas é como ela já errou uma vez: antes de a tela de OPE
// ser refeita, a mesma informação morava em quatro constantes
// (`LINHAS_MENORES`, `LINHAS_MAIORES`, `LINHAS_GALP2`, `LINHAS_GALP3`) mais
// dois arrays paralelos, e chegou a produzir uma inversão entre nome e
// conteúdo — registrada em comentário no código da época.
//
// Mudar a lotação de uma linha é editar uma lista só, aqui.

export type Galpao = {
  id: string;
  label: string;
  linhas: readonly string[];
};

export const GALPOES: readonly Galpao[] = [
  { id: "g1", label: "Galpão 1", linhas: ["NX260", "NX270", "NX280", "NX290", "NX310", "NX340", "NX350"] },
  { id: "g2", label: "Galpão 2", linhas: ["NX360", "NX370", "NX410", "NX440"] },
  { id: "g3", label: "Galpão 3", linhas: ["NX500", "NX620"] },
] as const;

/** Todas as linhas cadastradas, na ordem dos galpões. */
export const TODAS_LINHAS: readonly string[] = GALPOES.flatMap(g => g.linhas);

const POR_LINHA: ReadonlyMap<string, Galpao> = new Map(
  GALPOES.flatMap(g => g.linhas.map(l => [l, g] as const)),
);

/**
 * O galpão de uma linha.
 *
 * `null` para linha que não está em galpão nenhum — e isso acontece: a
 * consulta pode trazer um código novo antes de alguém cadastrá-lo aqui. Quem
 * agrupa precisa decidir o que fazer com o caso, em vez de receber um galpão
 * errado por omissão.
 */
export function galpaoDaLinha(linha: string | null | undefined): Galpao | null {
  if (!linha) return null;
  return POR_LINHA.get(linha) ?? null;
}

/** Rótulo do galpão, ou um marcador explícito quando a linha não é conhecida. */
export function rotuloGalpao(linha: string | null | undefined): string {
  return galpaoDaLinha(linha)?.label ?? "(sem galpão)";
}

/** "NX260 – NX350": a faixa vem da lista, nunca digitada à parte. */
export function faixaDe(linhas: readonly string[]): string {
  if (linhas.length === 0) return "";
  return linhas.length === 1 ? linhas[0] : `${linhas[0]} – ${linhas[linhas.length - 1]}`;
}
