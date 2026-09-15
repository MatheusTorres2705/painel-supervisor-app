// src/services/opsService.ts
// Avanço previsto × real por OP (cronograma do mês). A consulta morava na
// AtividadesPage; saiu com o texto idêntico para o Dashboard contar as mesmas
// OPs com a mesma regra de "baixo avanço". `sup` (opcional) restringe aos
// barcos em que o projeto pai tem o usuário como supervisor (AD_CODSUPERVISOR);
// sem ele o SQL é exatamente o de antes.
import { obterReg } from "@/lib/obterReg";
import { pad2 } from "@/lib/datetime";
import { txt, type ErpRow } from "@/lib/format";
import { sqlLinhaProduto } from "@/lib/linhasProduto";

export type StatusOP = "Baixo avanço" | "Em dia" | "Adiantado";

export type OpAvanco = {
  op: string;            // IDIPROC
  barco: string;         // BARCO (controle PA)
  linha: string;         // DESCRGRUPOPROD
  avancoPrev: number;    // AVANCO_PREV
  avancoReal: number;    // AVANCO_REAL
  codproj: number;
  identificacao: string;
  codparc: number | null;
  nomeparc: string | null;
};

/** Percentual de avanço limitado a 0–100 e arredondado (como a tela mostra). */
export const pctAvanco = (v: number) => {
  if (!v || isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v);
};

/** Regra da tela de Atividades: ±10 pp do previsto é "em dia". */
export function statusAvanco(prev: number, real: number): StatusOP {
  if (!prev && !real) return "Baixo avanço";
  if (real >= prev + 10) return "Adiantado";
  if (real >= prev - 10) return "Em dia";
  return "Baixo avanço";
}

/* ── Período do cronograma ─────────────────────────────────────── */

export type MesAno = { ano: number; mes: number };

export function lerChaveMes(k: string): MesAno {
  const [a, m] = k.split("-").map(Number);
  return { ano: a, mes: m };
}

export function mesesEntre(ini: MesAno, fim: MesAno): MesAno[] {
  const out: MesAno[] = [];
  let { ano, mes } = ini;
  while (ano < fim.ano || (ano === fim.ano && mes <= fim.mes)) {
    out.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return out;
}

/**
 * Filtro de ano × mês do cronograma. O mês vai com e sem zero à esquerda
 * ('9' e '09'): o SQL antigo misturava os dois formatos e o Dashboard usa
 * sem zero, então não dá para confiar em um só.
 */
export function sqlMesesCronograma(ini: string, fim: string): string {
  const porAno = new Map<number, Set<string>>();
  for (const { ano, mes } of mesesEntre(lerChaveMes(ini), lerChaveMes(fim))) {
    const s = porAno.get(ano) ?? new Set<string>();
    s.add(`'${mes}'`);
    s.add(`'${pad2(mes)}'`);
    porAno.set(ano, s);
  }
  const partes = [...porAno].map(
    ([ano, meses]) => `(CRO.ANO = '${ano}' AND CRO.MES IN (${[...meses].join(", ")}))`
  );
  return partes.length ? `(${partes.join(" OR ")})` : "1 = 0";
}

/** OPs do período ("YYYY-MM" a "YYYY-MM") com avanço previsto e real. */
export async function getOpsAvanco(ini: string, fim: string, sup: number | null = null): Promise<OpAvanco[]> {
  const sql = `
          SELECT
            T.IDIPROC           AS OP,
            T.BARCO             AS BARCO,
            T.DESCRGRUPOPROD    AS LINHA,
            TRUNC(AVG(T.PREVISTO)) AS AVANCO_PREV,
            TRUNC(AVG(T.AVANCO))   AS AVANCO_REAL,
            T.CODPROJ,
            T.IDENTIFICACAO,
            T.CODPARC,
            T.NOMEPARC
          FROM (
            SELECT DISTINCT
              (SELECT DISTINCT MAX(DATA)
                 FROM AD_APOAVANCO AVO
                 JOIN AD_COMPONENTECRONO CRO2
                   ON CRO2.SEQ = AVO.SEQ
                  AND AVO.CODUSU = CRO2.CODUSU
                  AND AVO.CODPRODSP = CRO2.CODPRODSP
                WHERE AVO.SEQ = DET.SEQ
                  AND AVO.CODUSU = USU.CODUSU
                  AND RETRABALHO = 'S') AS DTRETRABALHO,
              Snk_Dividir(
                ONE_NUMEROSUPPROD_PREV_DATA(USU.CODUSU , DET.SEQ, SYSDATE),
                ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
              ) * 100 AS PREVISTO,
              NVL(LOT.CONTROLEPA , 'Ordem não Lancada') AS BARCO,
              GRU.NOMEGRUPO      AS MACROSETOR,
              USU.CODGRUPO       AS SETOR,
              USU.NOMEUSU,
              DET.CODUSU,
              CASE
                WHEN Snk_Dividir(
                       ONE_NUMEROSUPPROD_REA(USU.CODUSU , DET.SEQ),
                       ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
                     ) * 100 > 100
                THEN 100
                ELSE Snk_Dividir(
                       ONE_NUMEROSUPPROD_REA(USU.CODUSU , DET.SEQ),
                       ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
                     ) * 100
              END AS AVANCO,
              DET.DTINICIOPREV,
              DET.DTFIMPREV,
              (SELECT MAX(DATA)
                 FROM AD_APOAVANCO
                WHERE CODUSU = USU.CODUSU
                  AND SEQ = DET.SEQ) AS ULTAPO,
              ONE_NUMEROSUPPROD_PREV(DET.CODUSU , DET.SEQ) as AvPrev,
              ONE_NUMEROSUPPROD_REA(DET.CODUSU , DET.SEQ)  as AvReal,
              DET.SEQ,
              PROC.IDIPROC,
              ${sqlLinhaProduto("PAI", "GRU2.DESCRGRUPOPROD")} AS DESCRGRUPOPROD,
              PRJ.CODPROJ,
              PRJ.IDENTIFICACAO,
              PAR.CODPARC,
              PAR.NOMEPARC
            FROM AD_CRONOGRAMA CRO
            JOIN TGFGRU GRU2
              ON GRU2.CODGRUPOPROD = CRO.CODGRUPOPROD
            JOIN TPRIPROC PROC
              ON PROC.AD_CODPROJ = CRO.CODPROJ
             AND PROC.STATUSPROC <> 'C'
            JOIN TPRIPA LOT
              ON LOT.IDIPROC = PROC.IDIPROC
            JOIN AD_DETALCRONOGRAMA DET
              ON DET.SEQ = CRO.SEQ
            JOIN TSIUSU USU
              ON USU.CODUSU = DET.CODUSU
            JOIN TSIGRU GRU
              ON GRU.CODGRUPO = USU.CODGRUPO
            JOIN TCSPRJ PRJ
              ON CRO.CODPROJ = PRJ.CODPROJ
            JOIN TCSPRJ PAI
              ON PAI.CODPROJ = PRJ.CODPROJPAI
            LEFT JOIN TGFCAB CAB
              ON PRJ.CODPROJ = CAB.CODPROJ
             AND CAB.TIPMOV = 'P'
            LEFT JOIN TGFPAR PAR
              ON PAR.CODPARC = CAB.CODPARC
            WHERE ${sqlMesesCronograma(ini, fim)}${sup != null ? `
              AND PAI.AD_CODSUPERVISOR = ${Number(sup)}` : ""}
          ) T
          GROUP BY
            T.IDIPROC,
            T.BARCO,
            T.DESCRGRUPOPROD,
            T.CODPROJ,
            T.IDENTIFICACAO,
            T.CODPARC,
            T.NOMEPARC
        `.trim();

  const rows = await obterReg(sql);
  return rows.map((r: ErpRow) => ({
    op: txt(r.OP),
    barco: txt(r.BARCO),
    linha: txt(r.LINHA),
    avancoPrev: Number(r.AVANCO_PREV ?? 0),
    avancoReal: Number(r.AVANCO_REAL ?? 0),
    codproj: Number(r.CODPROJ ?? 0),
    identificacao: txt(r.IDENTIFICACAO),
    codparc: r.CODPARC != null ? Number(r.CODPARC) : null,
    nomeparc: r.NOMEPARC != null ? String(r.NOMEPARC) : null,
  }));
}
