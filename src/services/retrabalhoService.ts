// src/services/retrabalhoService.ts
// Retrabalho apontado (AD_COMPONENTECRONO FEITO/RETRABALHO = 'S') por mês da
// data do apontamento (AD_APOAVANCO.DATA). Veio das duas consultas do Dashboard
// antigo — o total e o detalhamento — unidas numa só: os JOINs são os mesmos,
// então a soma do detalhe continua batendo com o total.
import { obterReg } from "@/lib/obterReg";
import { txt, type ErpRow } from "@/lib/format";

export type RetrabalhoItem = { setor: string; atividade: string; hh: number };
export type RetrabalhoMes = { hh: number; itens: RetrabalhoItem[] };

/**
 * @param mes "MM/YYYY"
 * @param mesAnterior "MM/YYYY"
 * @param sup só barcos cujo projeto pai tem este supervisor (AD_CODSUPERVISOR); null = todos.
 */
export async function getRetrabalho(
  mes: string,
  mesAnterior: string,
  sup: number | null
): Promise<{ atual: RetrabalhoMes; anterior: RetrabalhoMes }> {
  const sql = `
        SELECT
          TO_CHAR(AV.DATA, 'MM/YYYY') AS MES,
          USU.NOMEUSU AS SETOR,
          PRO.DESCRPROD AS ATIVIDADE,
          Snk_Dividir(APO.QTD, 60) AS HH
        FROM AD_CRONOGRAMA CRO
        JOIN AD_COMPONENTECRONO APO ON CRO.SEQ = APO.SEQ
        JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ
        JOIN TCSPRJ PAI ON PAI.CODPROJ = PRJ.CODPROJPAI
        JOIN AD_APOAVANCO AV
          ON AV.SEQ = APO.SEQ
         AND AV.CODUSU = APO.CODUSU
         AND AV.CODPRODSP = APO.CODPRODSP
        JOIN TGFPRO PRO ON PRO.CODPROD = APO.CODPRODSP
        JOIN TSIUSU USU ON USU.CODUSU = APO.CODUSU
        WHERE ${sup != null ? `PAI.AD_CODSUPERVISOR = ${Number(sup)}` : "1 = 1"}
          AND APO.FEITO = 'S'
          AND APO.RETRABALHO = 'S'
          AND TO_CHAR(AV.DATA, 'MM/YYYY') IN ('${mes}', '${mesAnterior}')
  `.trim();

  const atual: RetrabalhoMes = { hh: 0, itens: [] };
  const anterior: RetrabalhoMes = { hh: 0, itens: [] };
  for (const r of (await obterReg(sql, { pageSize: 5000, maxPages: 5 })) as ErpRow[]) {
    const alvo = txt(r.MES) === mes ? atual : txt(r.MES) === mesAnterior ? anterior : null;
    if (!alvo) continue;
    const hh = Number(r.HH ?? 0) || 0;
    alvo.hh += hh;
    alvo.itens.push({ setor: txt(r.SETOR), atividade: txt(r.ATIVIDADE), hh });
  }
  return { atual, anterior };
}
