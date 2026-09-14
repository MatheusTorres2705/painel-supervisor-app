// src/services/mnoService.ts
// Realizado de HH apontado por setor × galpão × modelo × mês (para a rotina MNO).
// Fonte: AD_COMPONENTECRONO.QTD/60 datado por AD_APOAVANCO.DATA; setor = TSIGRU.NOMEGRUPO.
// Neste projeto o obterReg mora em lib/obterReg e não é genérico; é a única
// diferença em relação à cópia do painel-diretoria.
import { obterReg } from '../lib/obterReg';

function pad2(n: number) { return String(n).padStart(2, '0'); }
function ultimoDia(mes: number, ano: number) {
  return String(new Date(ano, mes, 0).getDate()).padStart(2, '0');
}

export type RealizadoSetor = {
  setor: string; galpao: string; modelo: string;
  ano: number; mes: number; horas: number;
};

function buildRealizadoSql(ini: string, fim: string): string {
  return `
WITH TAB_APO AS (
  SELECT PLA.NOME AS GALPAO, G.DESCRGRUPOPROD AS MODELO, GRU.NOMEGRUPO AS SETOR, APO.*
  FROM AD_CRONOGRAMA CRO
  LEFT JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
  LEFT JOIN AD_APOAVANCO APO ON (APO.SEQ = DET.SEQ AND APO.CODUSU = DET.CODUSU)
  INNER JOIN TCSPRJ PRJ ON (PRJ.CODPROJ = CRO.CODPROJ)
  JOIN TCSPRJ PAI ON PAI.CODPROJ = PRJ.CODPROJPAI
  JOIN TGFGRU G ON G.CODGRUPOPROD = PAI.AD_CODGRUPOPROD
  INNER JOIN TPRPLP PLA ON PLA.CODPLP = G.AD_CODPLP
  INNER JOIN TSIUSU USU ON USU.CODUSU = APO.CODUSU
  INNER JOIN TSIGRU GRU ON GRU.CODGRUPO = USU.CODGRUPO
  WHERE APO.DATA BETWEEN '${ini}' AND '${fim}'
)
SELECT
  SETOR, GALPAO, MODELO,
  EXTRACT(YEAR FROM DATA)  AS ANO,
  EXTRACT(MONTH FROM DATA) AS MES,
  SUM(DURACAO) / 60 AS HORAS
FROM (
  SELECT APO.SETOR, APO.GALPAO, APO.MODELO, APO.DATA AS DATA, COMP.QTD AS DURACAO
  FROM AD_COMPONENTECRONO COMP
  LEFT JOIN TAB_APO APO
    ON APO.SEQ = COMP.SEQ AND APO.CODUSU = COMP.CODUSU AND APO.CODPRODSP = COMP.CODPRODSP
  WHERE COMP.RETRABALHO IS NULL AND APO.DATA IS NOT NULL
)
GROUP BY SETOR, GALPAO, MODELO, EXTRACT(YEAR FROM DATA), EXTRACT(MONTH FROM DATA)
`.trim();
}

function mapRow(r: unknown): RealizadoSetor {
  if (Array.isArray(r)) {
    return { setor: String(r[0] ?? ''), galpao: String(r[1] ?? ''), modelo: String(r[2] ?? ''), ano: Number(r[3] ?? 0), mes: Number(r[4] ?? 0), horas: Number(r[5] ?? 0) };
  }
  const o = r as Record<string, unknown>;
  return {
    setor:  String(o['SETOR']  ?? o['setor']  ?? ''),
    galpao: String(o['GALPAO'] ?? o['galpao'] ?? ''),
    modelo: String(o['MODELO'] ?? o['modelo'] ?? ''),
    ano:    Number(o['ANO']    ?? o['ano']    ?? 0),
    mes:    Number(o['MES']    ?? o['mes']    ?? 0),
    horas:  Number(o['HORAS']  ?? o['horas']  ?? 0),
  };
}

export async function getRealizadoSetorMes(iniDate: string, fimDate: string): Promise<RealizadoSetor[]> {
  return (await obterReg(buildRealizadoSql(iniDate, fimDate))).map(mapRow);
}

// ── Realizado por DIA × setor (para o acompanhamento diário / projeção) ────────
export type RealizadoDia = { ano: number; mes: number; dia: number; setor: string; galpao: string; horas: number };

// Os joins do galpao (projeto pai -> grupo de produto -> linha de producao) sao LEFT
// de proposito: o total diario nao pode mudar por causa de apontamento sem galpao.
function buildRealizadoDiaSql(ini: string, fim: string): string {
  return `
WITH TAB_APO AS (
  SELECT GRU.NOMEGRUPO AS SETOR, PLA.NOME AS GALPAO, APO.*
  FROM AD_CRONOGRAMA CRO
  LEFT JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
  LEFT JOIN AD_APOAVANCO APO ON (APO.SEQ = DET.SEQ AND APO.CODUSU = DET.CODUSU)
  LEFT JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ
  LEFT JOIN TCSPRJ PAI ON PAI.CODPROJ = PRJ.CODPROJPAI
  LEFT JOIN TGFGRU G ON G.CODGRUPOPROD = PAI.AD_CODGRUPOPROD
  LEFT JOIN TPRPLP PLA ON PLA.CODPLP = G.AD_CODPLP
  INNER JOIN TSIUSU USU ON USU.CODUSU = APO.CODUSU
  INNER JOIN TSIGRU GRU ON GRU.CODGRUPO = USU.CODGRUPO
  WHERE APO.DATA BETWEEN '${ini}' AND '${fim}'
)
SELECT
  EXTRACT(YEAR FROM DATA)  AS ANO,
  EXTRACT(MONTH FROM DATA) AS MES,
  EXTRACT(DAY FROM DATA)   AS DIA,
  SETOR,
  GALPAO,
  SUM(DURACAO) / 60 AS HORAS
FROM (
  SELECT APO.SETOR, APO.GALPAO, APO.DATA AS DATA, COMP.QTD AS DURACAO
  FROM AD_COMPONENTECRONO COMP
  LEFT JOIN TAB_APO APO
    ON APO.SEQ = COMP.SEQ AND APO.CODUSU = COMP.CODUSU AND APO.CODPRODSP = COMP.CODPRODSP
  WHERE COMP.RETRABALHO IS NULL AND APO.DATA IS NOT NULL
)
GROUP BY EXTRACT(YEAR FROM DATA), EXTRACT(MONTH FROM DATA), EXTRACT(DAY FROM DATA), SETOR, GALPAO
`.trim();
}

export async function getRealizadoDiaSetor(iniDate: string, fimDate: string): Promise<RealizadoDia[]> {
  const rows = await obterReg(buildRealizadoDiaSql(iniDate, fimDate));
  return rows.map((r) => {
    if (Array.isArray(r)) {
      return { ano: Number(r[0] ?? 0), mes: Number(r[1] ?? 0), dia: Number(r[2] ?? 0), setor: String(r[3] ?? ''), galpao: String(r[4] ?? ''), horas: Number(r[5] ?? 0) };
    }
    const o = r as Record<string, unknown>;
    return {
      ano:    Number(o['ANO']    ?? o['ano']    ?? 0),
      mes:    Number(o['MES']    ?? o['mes']    ?? 0),
      dia:    Number(o['DIA']    ?? o['dia']    ?? 0),
      setor:  String(o['SETOR']  ?? o['setor']  ?? ''),
      galpao: String(o['GALPAO'] ?? o['galpao'] ?? ''),
      horas:  Number(o['HORAS']  ?? o['horas']  ?? 0),
    };
  });
}

// Janela de 12 meses até o fim do mês informado (para o gráfico de histórico).
export function janela12Meses(mes: number, ano: number): { iniDate: string; fimDate: string } {
  return {
    iniDate: `01/01/${ano - 1}`,
    fimDate: `${ultimoDia(mes, ano)}/${pad2(mes)}/${ano}`,
  };
}
