// src/services/feriadosService.ts
// Feriados do ERP, pela função do próprio Sankhya.
//
// `FERIADO(P_DATMOV, P_CODUSU)` devolve 1 para feriado e já resolve país, UF,
// cidade, feriado nacional e o caso do recorrente (inclusive o 29/02). É a
// autoridade do ERP: reimplementar essa regra no cliente seria manter uma
// segunda verdade sobre TSIFER.
//
// CODUSU = 0 de propósito: sem usuário a função pula a resolução por parceiro e
// cai na cidade da EMPRESA 1 — a fábrica. Assim todo supervisor vê a mesma
// meta, independentemente do cadastro dele.
import { obterReg } from "@/lib/obterReg";
import { txt, type ErpRow } from "@/lib/format";

/**
 * A faixa vira uma coluna de datas (CONNECT BY) e a função filtra.
 *
 * Só os feriados voltam — ~15 linhas por ano, não os 365 dias. A consulta é
 * interpolada como INLINE VIEW pelo backend, então não pode terminar com `;`.
 */
function sqlFeriados(ano: number): string {
  const ini = `TO_DATE('01/01/${ano}', 'DD/MM/YYYY')`;
  const fim = `TO_DATE('31/12/${ano}', 'DD/MM/YYYY')`;
  return `
SELECT TO_CHAR(D, 'YYYY-MM-DD') AS DIA
FROM (
  SELECT ${ini} + LEVEL - 1 AS D
  FROM DUAL
  CONNECT BY LEVEL <= ${fim} - ${ini} + 1
)
WHERE FERIADO(D, 0) = 1
`.trim();
}

/**
 * Feriados de um ano, como "YYYY-MM-DD".
 *
 * Um ano por chamada: a função é avaliada uma vez por dia da faixa (~365
 * chamadas PL/SQL, cada uma com alguns SELECT pequenos), então uma faixa larga
 * numa consulta só seria um tiro longo sem necessidade — quem precisa de dois
 * anos pede dois, e o cache do hook guarda cada um.
 */
export async function getFeriadosDoAno(ano: number): Promise<string[]> {
  const rows = (await obterReg(sqlFeriados(ano))) as ErpRow[];
  return rows.map((r) => txt(r.DIA)).filter(Boolean);
}
