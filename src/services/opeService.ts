// src/services/opeService.ts
// Camada de dados do Detalhamento OPE: SQL de atividades (AD_COMPONENTECRONO/AD_APOAVANCO),
// SQL de ponto (AD_BATPONTO) e as derivações usadas pela tela.
// Diferenças em relação à cópia do painel-diretoria:
//  1. obterReg mora em lib/obterReg e não é genérico (import e chamadas sem <T>).
//  2. buildSqlAtivDetalhe passa a usar `apenasRetrabalho` na SQL — lá o
//     parâmetro é recebido e ignorado (ver comentário em getAtivDetalhe).
//  3. SQL_LINHA_DO_PONTO é exportado: o quadro de pessoas da Meta de Produção
//     (services/quadroService) usa a MESMA tradução departamento → linha.
import { obterReg } from '../lib/obterReg';

/* ── Helpers de data ───────────────────────────────────────── */
function oracleInicio(s: string) { return `TO_DATE('${s} 00:00:00', 'DD/MM/YYYY HH24:MI:SS')`; }
function oracleFim(s: string)    { return `TO_DATE('${s} 23:59:59', 'DD/MM/YYYY HH24:MI:SS')`; }
function oracleData(s: string)   { return `TO_DATE('${s}', 'DD/MM/YYYY')`; }

function parseDDMMYYYY(s: string): number {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/* ── Grupos de linha usados nas consultas ──────────────────── */
/* Nome ↔ conteúdo estavam invertidos aqui (e o uso também, o que cancelava o
   erro na tela mas enganava quem reusasse). Agora batem com os Sets
   LINHAS_MENORES / LINHAS_MAIORES da página.
   'NX62' foi removido: tem 4 caracteres e nunca casa com SUBSTR(...,1,5). */
export const LINHAS_MENORES_ARR = ['NX260','NX270','NX280','NX290','NX310','NX340','NX350','NX360','NX370'];
export const LINHAS_MAIORES_ARR = ['NX410','NX440','NX500','NX620'];
export const SETORES_SQL        = ['ACAB','MONT','MARC','ELET','LAM','REB'];

/* ── Classificação por SETORMACRO ──────────────────────────── */
export type DeptKey = 'Acab' | 'Mont' | 'Marc' | 'Ele' | 'Lam' | 'Reb';
const DEPT_KEYS: DeptKey[] = ['Acab','Mont','Marc','Ele','Lam','Reb'];
const DEPT_LABELS: Record<DeptKey, string> = {
  Acab: 'Acabamento', Mont: 'Montagem', Marc: 'Marcenaria',
  Ele: 'Elétrica', Lam: 'Laminação', Reb: 'Rebarba',
};
const SETORMACRO_MAP: Record<string, DeptKey> = {
  ACAB: 'Acab', MONT: 'Mont', MARC: 'Marc', ELET: 'Ele', LAM: 'Lam', REB: 'Reb',
};
export function classifyDept(setorMacro: string): DeptKey | null {
  return SETORMACRO_MAP[setorMacro] ?? null;
}

/* ── Tipos de linha bruta ──────────────────────────────────── */
export type RawAtivRow  = { linha: string; data: string; setorMacro: string; horas: number; qtdAtiv: number; horasRetrabalho: number; qtdRetrabalho: number };
export type RawPontoRow = { linha: string; data: string; setorMacro: string; qtdPonto: number; horasPonto: number; horasExtras: number };
export type DailyPoint  = { data: string; ope: number };
export type AggRow      = { label: string; horas: number; horasReg: number; horasExtras: number; qtdAtiv: number; qtdPonto: number; horasRetrabalho: number; qtdRetrabalho: number };

/* ── Agregação ─────────────────────────────────────────────── */
export function agregar(ativos: RawAtivRow[], pontos: RawPontoRow[], filtroLinha: (l: string) => boolean): AggRow[] {
  const acc: Record<DeptKey, { horas: number; qtdAtiv: number; horasPonto: number; horasExtras: number; qtdPonto: number; horasRetrabalho: number; qtdRetrabalho: number }> = {
    Acab: {horas:0,qtdAtiv:0,horasPonto:0,horasExtras:0,qtdPonto:0,horasRetrabalho:0,qtdRetrabalho:0},
    Mont: {horas:0,qtdAtiv:0,horasPonto:0,horasExtras:0,qtdPonto:0,horasRetrabalho:0,qtdRetrabalho:0},
    Marc: {horas:0,qtdAtiv:0,horasPonto:0,horasExtras:0,qtdPonto:0,horasRetrabalho:0,qtdRetrabalho:0},
    Ele:  {horas:0,qtdAtiv:0,horasPonto:0,horasExtras:0,qtdPonto:0,horasRetrabalho:0,qtdRetrabalho:0},
    Lam:  {horas:0,qtdAtiv:0,horasPonto:0,horasExtras:0,qtdPonto:0,horasRetrabalho:0,qtdRetrabalho:0},
    Reb:  {horas:0,qtdAtiv:0,horasPonto:0,horasExtras:0,qtdPonto:0,horasRetrabalho:0,qtdRetrabalho:0},
  };
  for (const r of ativos) {
    if (!filtroLinha(r.linha)) continue;
    const key = classifyDept(r.setorMacro);
    if (!key) continue;
    acc[key].horas           += r.horas;
    acc[key].qtdAtiv         += r.qtdAtiv;
    acc[key].horasRetrabalho += r.horasRetrabalho;
    acc[key].qtdRetrabalho   += r.qtdRetrabalho;
  }
  for (const p of pontos) {
    if (!filtroLinha(p.linha)) continue;
    const key = classifyDept(p.setorMacro);
    if (!key) continue;
    acc[key].horasPonto  += p.horasPonto;
    acc[key].horasExtras += p.horasExtras;
    acc[key].qtdPonto    += p.qtdPonto;
  }
  return DEPT_KEYS.map(k => ({
    label:           DEPT_LABELS[k],
    horas:           acc[k].horas,
    horasReg:        acc[k].horasPonto,
    horasExtras:     acc[k].horasExtras,
    qtdAtiv:         acc[k].qtdAtiv,
    qtdPonto:        acc[k].qtdPonto,
    horasRetrabalho: acc[k].horasRetrabalho,
    qtdRetrabalho:   acc[k].qtdRetrabalho,
  }));
}

/** `grupos` vem da página (Galpão 1/2/3), que é dona dos Sets de linha. */
export function agregarOpe(
  ativos: RawAtivRow[],
  pontos: RawPontoRow[],
  grupos: { label: string; fn: (l: string) => boolean }[],
): AggRow[] {
  return grupos.map(({ label, fn }) => {
    const subAtiv  = ativos.filter(r => fn(r.linha));
    const subPonto = pontos.filter(r => fn(r.linha));
    return {
      label,
      horas:           subAtiv.reduce((s, r)  => s + r.horas,           0),
      horasReg:        subPonto.reduce((s, r) => s + r.horasPonto,      0),
      horasExtras:     subPonto.reduce((s, r) => s + r.horasExtras,     0),
      qtdAtiv:         subAtiv.reduce((s, r)  => s + r.qtdAtiv,         0),
      qtdPonto:        subPonto.reduce((s, r) => s + r.qtdPonto,        0),
      horasRetrabalho: subAtiv.reduce((s, r)  => s + r.horasRetrabalho, 0),
      qtdRetrabalho:   subAtiv.reduce((s, r)  => s + r.qtdRetrabalho,   0),
    };
  });
}

/* ── Série diária de OPE ───────────────────────────────────── */
export function buildDailySeries(
  ativos: RawAtivRow[],
  pontos: RawPontoRow[],
  filtroAtiv:  (r: RawAtivRow)  => boolean,
  filtroPonto: (r: RawPontoRow) => boolean,
): DailyPoint[] {
  const dates = new Set<string>();
  ativos.filter(filtroAtiv).forEach(r => dates.add(r.data));
  pontos.filter(filtroPonto).forEach(r => dates.add(r.data));
  return Array.from(dates)
    .sort((a, b) => parseDDMMYYYY(a) - parseDDMMYYYY(b))
    .map(data => {
      const ha = ativos.filter(r => filtroAtiv(r)  && r.data === data).reduce((s, r) => s + r.horas,      0);
      const hp = pontos.filter(r => filtroPonto(r) && r.data === data).reduce((s, r) => s + r.horasPonto, 0);
      return { data, ope: hp > 0 ? parseFloat((ha / hp * 100).toFixed(1)) : 0 }; // ds-ignore arredondamento de cálculo
    });
}

/* ── SQL Atividades ────────────────────────────────────────── */
function buildSqlAtividades(ini: string, fim: string, linhasArr: string[], setor: string): string {
  const linhasIn = linhasArr.map(l => `'${l}'`).join(',');
  return `
WITH
TAB_APO AS (
  SELECT APO.*
  FROM AD_CRONOGRAMA CRO
    LEFT JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
    LEFT JOIN AD_APOAVANCO APO ON (APO.SEQ = DET.SEQ AND APO.CODUSU = DET.CODUSU)
    LEFT JOIN TGFPRO PRO ON APO.CODPRODSP = PRO.CODPROD
    INNER JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ
    INNER JOIN TSIUSU USU ON USU.CODUSU = APO.CODUSU
  WHERE APO.DATA BETWEEN ${oracleInicio(ini)} AND ${oracleFim(fim)}
    AND SUBSTR(PRJ.IDENTIFICACAO, 1, 5) IN (${linhasIn})
),
TAB_DEP AS (
  SELECT DISTINCT
    DEP.AD_CODUSU, DEP.CODDEP, DEP.DESCRDEP, DEPL.CODPROJPAI
  FROM TFPDEP DEP
    LEFT JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = DEP.CODDEP
  WHERE DEP.AD_CODUSU IS NOT NULL
),
TAB_BASE AS (
  SELECT
    COMP.SEQ                        AS COD_SEQUENCIAL,
    PRJ.CODPROJPAI,
    TAB_DEP.CODDEP,
    TAB_DEP.DESCRDEP,
    SUBSTR(PRJ.IDENTIFICACAO, 1, 5) AS LINHA,
    PRJ.IDENTIFICACAO               AS CHASSI,
    COMP.CODUSU                     AS COD_SETOR,
    USU.NOMEUSU                     AS SETOR,
    COMP.CODPRODSP                  AS COD_ATIVIDADE,
    PRO.DESCRPROD                   AS ATIVIDADE,
    COMP.QTD                        AS DURACAO,
    COMP.FEITO                      AS STATUS,
    APO.DATA                        AS DATA_EXECUCAO,
    COMP.RETRABALHO,
    ROW_NUMBER() OVER (
      PARTITION BY
        COMP.SEQ, PRJ.CODPROJPAI, SUBSTR(PRJ.IDENTIFICACAO, 1, 5), PRJ.IDENTIFICACAO,
        COMP.CODUSU, USU.NOMEUSU, COMP.CODPRODSP, PRO.DESCRPROD, COMP.QTD, COMP.FEITO, APO.DATA,
        COMP.RETRABALHO
      ORDER BY
        (SELECT COUNT(*) FROM AD_DEPLINHA X WHERE X.CODDEP = TAB_DEP.CODDEP) ASC,
        TAB_DEP.CODDEP ASC
    ) AS RN
  FROM AD_COMPONENTECRONO COMP
    LEFT JOIN TAB_APO APO
      ON APO.SEQ = COMP.SEQ AND APO.CODUSU = COMP.CODUSU AND APO.CODPRODSP = COMP.CODPRODSP
    LEFT JOIN TGFPRO PRO        ON PRO.CODPROD  = COMP.CODPRODSP
    LEFT JOIN TSIUSU USU        ON USU.CODUSU   = COMP.CODUSU
    LEFT JOIN AD_CRONOGRAMA CRO ON CRO.SEQ      = COMP.SEQ
    LEFT JOIN TCSPRJ PRJ        ON PRJ.CODPROJ  = CRO.CODPROJ
    LEFT JOIN TAB_DEP
      ON TAB_DEP.AD_CODUSU  = COMP.CODUSU
     AND TAB_DEP.CODPROJPAI = PRJ.CODPROJPAI
  WHERE APO.DATA IS NOT NULL
),
SETOR_MACRO AS (
  SELECT DISTINCT DEP.AD_CODUSU, DEPL.SETORMACRO
  FROM TFPDEP DEP
    JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = DEP.CODDEP
  WHERE DEP.AD_CODUSU IS NOT NULL
    AND DEPL.SETORMACRO IS NOT NULL
)
SELECT
  TB.LINHA,
  TO_CHAR(TB.DATA_EXECUCAO, 'DD/MM/YYYY') AS DATA,
  SM.SETORMACRO,
  COUNT(CASE WHEN TB.RETRABALHO IS NULL     THEN 1 END)                                    AS QTD_REGISTROS,
  ROUND(SUM(CASE WHEN TB.RETRABALHO IS NULL     THEN TB.DURACAO ELSE 0 END) / 60, 2)      AS HORAS,
  COUNT(CASE WHEN TB.RETRABALHO IS NOT NULL THEN 1 END)                                    AS QTD_RETRABALHO,
  ROUND(SUM(CASE WHEN TB.RETRABALHO IS NOT NULL THEN TB.DURACAO ELSE 0 END) / 60, 2)      AS HORAS_RETRABALHO
FROM TAB_BASE TB
  JOIN SETOR_MACRO SM ON SM.AD_CODUSU = TB.COD_SETOR
WHERE TB.RN = 1
  AND SM.SETORMACRO = '${setor}'
GROUP BY TB.LINHA, TB.DATA_EXECUCAO, SM.SETORMACRO
ORDER BY TB.LINHA, TB.DATA_EXECUCAO, SM.SETORMACRO
`.trim();
}

/**
 * A linha do PONTO sai do departamento do funcionário, não do barco.
 *
 * Os dois lados do OPE nomeiam a linha por caminhos diferentes: a atividade
 * pega `SUBSTR(TCSPRJ.IDENTIFICACAO,1,5)` — o chassi, que já vem "NX620" — e o
 * ponto deriva de `AD_DEPLINHA.CODPROJPAI`, o projeto-pai do departamento. Os
 * dois códigos NÃO coincidem, e onde divergem é preciso traduzir, senão a hora
 * apontada entra no numerador sem a hora paga correspondente no denominador e
 * o OPE da linha passa de 100%.
 *
 * As duas traduções conhecidas:
 *   480 → 500  (já existia)
 *   600 → 620  a linha NX620 tem CODPROJPAI 1060000000. Confirmado pelos 16
 *              departamentos apontados nele, todos chamados "620": ACABAMENTO
 *              620, ELETRICA 620, LAMINAÇÃO 620, MONTAGEM 620, REBARBA 500-620.
 *              Sem esta linha, 106 funcionários e ~17.100 h/mês de ponto do
 *              Galpão 3 ficavam fora da conta enquanto as atividades dos
 *              barcos NX620 entravam.
 *
 * Uma expressão só, usada pelo agregado e pelo detalhe: quando divergiam, o
 * popup podia listar gente que a tabela não contou.
 */
export const SQL_LINHA_DO_PONTO = `'NX' || CASE SUBSTR(DEPL.CODPROJPAI, 3, 3)
                                      WHEN '480' THEN '500'
                                      WHEN '600' THEN '620'
                                      ELSE SUBSTR(DEPL.CODPROJPAI, 3, 3)
                                 END`;

/* ── SQL Ponto ───────────────────────────────────────────────
   HORAS_EXTRAS anda junto com as horas de ponto de proposito: assim o card da
   pagina herda exatamente os mesmos filtros (escopo, setor, maturacao) que
   "Horas de ponto", sem uma segunda consulta que possa divergir do recorte.
   O MAX() na subconsulta e so para escolher o unico valor de HE daquele
   funcionario naquele dia — a HE ja vem agregada por (CODFUNC, dia).        */
function buildSqlPonto(ini: string, fim: string, linhasArr: string[], setor: string): string {
  const linhasIn = linhasArr.map(l => `'${l}'`).join(',');
  return `
SELECT LINHA, DATA, SETORMACRO,
  COUNT(*)          AS QTD_REGISTROS,
  COUNT(*) * 8      AS HORAS_PONTO,
  SUM(HE_HORAS)     AS HORAS_EXTRAS
FROM (
  SELECT
    PON.CODFUNC,
    TO_CHAR(PON.DTPONTO, 'DD/MM/YYYY') AS DATA,
    MIN(${SQL_LINHA_DO_PONTO}) AS LINHA,
    DEPL.SETORMACRO,
    MAX(NVL(HE.HORAS, 0)) AS HE_HORAS
  FROM AD_BATPONTO PON
    JOIN TFPEQP EQ        ON EQ.CODEQP   = PON.CODEQP
    JOIN TFPFUN FUN       ON FUN.CODFUNC = PON.CODFUNC
    JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = FUN.CODDEP
    LEFT JOIN (
      SELECT CODFUNC, TRUNC(DTREF) AS DT, SUM(VALORMIN) / 60 AS HORAS
      FROM AD_VAPUPONTO
      WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
      GROUP BY CODFUNC, TRUNC(DTREF)
    ) HE ON HE.CODFUNC = PON.CODFUNC AND HE.DT = TRUNC(PON.DTPONTO)
  WHERE PON.DTPONTO BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
    AND EQ.AD_USADO     = '1'
    AND DEPL.SETORMACRO = '${setor}'
    AND DEPL.SETORMACRO IS NOT NULL
    AND DEPL.CODPROJPAI IS NOT NULL
  GROUP BY PON.CODFUNC, PON.DTPONTO, DEPL.SETORMACRO
)
WHERE LINHA IN (${linhasIn})
GROUP BY LINHA, DATA, SETORMACRO
ORDER BY LINHA, DATA, SETORMACRO
`.trim();
}

/* ── SQL Ponto Detalhe ───────────────────────────────────────
   A hora extra vem de AD_VAPUPONTO por LEFT JOIN, agregada por (CODFUNC, dia)
   — mesma granularidade do DISTINCT daqui, entao nao cria nem duplica linha.
   DTREF e o dia trabalhado, alinhado com DTPONTO. E so exibicao: o card do OPE
   continua contando 8h por registro de ponto, sem somar a hora extra.        */
function buildSqlPontoDetalhe(ini: string, fim: string, linhasArr: string[], setor: string | null): string {
  const linhasIn = linhasArr.map(l => `'${l}'`).join(',');
  const linhaExpr = SQL_LINHA_DO_PONTO;
  return `
SELECT DISTINCT
  FUN.CODFUNC                           AS CODIGO,
  FUN.NOMEFUNC                          AS NOME,
  DEP.DESCRDEP                          AS DEPARTAMENTO_PROD,
  TO_CHAR(PON.DTPONTO, 'DD/MM/YYYY')   AS DATA,
  NVL(HE.HORAS, 0)                      AS HE_HORAS
FROM AD_BATPONTO PON
JOIN TFPEQP EQ        ON EQ.CODEQP   = PON.CODEQP
JOIN TFPFUN FUN       ON FUN.CODFUNC = PON.CODFUNC
JOIN TFPDEP DEP       ON DEP.CODDEP  = FUN.CODDEP
JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = FUN.CODDEP
LEFT JOIN (
  SELECT CODFUNC, TRUNC(DTREF) AS DT, SUM(VALORMIN) / 60 AS HORAS
  FROM AD_VAPUPONTO
  WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
  GROUP BY CODFUNC, TRUNC(DTREF)
) HE ON HE.CODFUNC = PON.CODFUNC AND HE.DT = TRUNC(PON.DTPONTO)
WHERE PON.DTPONTO BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
  AND EQ.AD_USADO        = '1'
  AND DEPL.CODPROJPAI IS NOT NULL
  AND DEPL.SETORMACRO IS NOT NULL
  AND ${linhaExpr} IN (${linhasIn})
${setor ? `  AND DEPL.SETORMACRO = '${setor}'` : ''}
ORDER BY NOME, DATA
`.trim();
}

export type PontoDetalheRow = { codigo: string; nome: string; departamento: string; data: string; heHoras: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPontoDetalhe(r: Record<string, any>): PontoDetalheRow {
  return {
    codigo:       String(r['CODIGO']            ?? r['codigo']            ?? ''),
    nome:         String(r['NOME']              ?? r['nome']              ?? ''),
    departamento: String(r['DEPARTAMENTO_PROD'] ?? r['departamento_prod'] ?? ''),
    data:         String(r['DATA']              ?? r['data']              ?? ''),
    heHoras:      Number(r['HE_HORAS']          ?? r['he_horas']          ?? 0) || 0,
  };
}

/* ── SQL Atividades Detalhe (atividade × barco × dia, com horas) ─
   Reaproveita a mesma TAB_BASE de buildSqlAtividades — inclusive o RN = 1, que
   remove o fan-out de departamento — para que a soma de HORAS aqui feche com o
   valor da coluna Atividades do card clicado. Só as atividades sem RETRABALHO
   entram, que é o que a coluna Atividades soma (retrabalho vira Perdas).     */
function buildSqlAtivDetalhe(ini: string, fim: string, linhasArr: string[], setor: string | null, apenasRetrabalho = false): string {
  const linhasIn = linhasArr.map(l => `'${l}'`).join(',');
  return `
WITH
TAB_APO AS (
  SELECT APO.*
  FROM AD_CRONOGRAMA CRO
    LEFT JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
    LEFT JOIN AD_APOAVANCO APO ON (APO.SEQ = DET.SEQ AND APO.CODUSU = DET.CODUSU)
    LEFT JOIN TGFPRO PRO ON APO.CODPRODSP = PRO.CODPROD
    INNER JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ
    INNER JOIN TSIUSU USU ON USU.CODUSU = APO.CODUSU
  WHERE APO.DATA BETWEEN ${oracleInicio(ini)} AND ${oracleFim(fim)}
    AND SUBSTR(PRJ.IDENTIFICACAO, 1, 5) IN (${linhasIn})
),
TAB_DEP AS (
  SELECT DISTINCT
    DEP.AD_CODUSU, DEP.CODDEP, DEP.DESCRDEP, DEPL.CODPROJPAI
  FROM TFPDEP DEP
    LEFT JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = DEP.CODDEP
  WHERE DEP.AD_CODUSU IS NOT NULL
),
TAB_BASE AS (
  SELECT
    SUBSTR(PRJ.IDENTIFICACAO, 1, 5) AS LINHA,
    PRJ.IDENTIFICACAO               AS PROJETO,
    COMP.CODUSU                     AS COD_SETOR,
    USU.NOMEUSU                     AS SETOR,
    COMP.CODPRODSP                  AS COD_ATIVIDADE,
    PRO.DESCRPROD                   AS ATIVIDADE,
    COMP.QTD                        AS DURACAO,
    APO.DATA                        AS DATA_EXECUCAO,
    COMP.RETRABALHO,
    ROW_NUMBER() OVER (
      PARTITION BY
        COMP.SEQ, PRJ.CODPROJPAI, SUBSTR(PRJ.IDENTIFICACAO, 1, 5), PRJ.IDENTIFICACAO,
        COMP.CODUSU, USU.NOMEUSU, COMP.CODPRODSP, PRO.DESCRPROD, COMP.QTD, COMP.FEITO, APO.DATA,
        COMP.RETRABALHO
      ORDER BY
        (SELECT COUNT(*) FROM AD_DEPLINHA X WHERE X.CODDEP = TAB_DEP.CODDEP) ASC,
        TAB_DEP.CODDEP ASC
    ) AS RN
  FROM AD_COMPONENTECRONO COMP
    LEFT JOIN TAB_APO APO
      ON APO.SEQ = COMP.SEQ AND APO.CODUSU = COMP.CODUSU AND APO.CODPRODSP = COMP.CODPRODSP
    LEFT JOIN TGFPRO PRO        ON PRO.CODPROD  = COMP.CODPRODSP
    LEFT JOIN TSIUSU USU        ON USU.CODUSU   = COMP.CODUSU
    LEFT JOIN AD_CRONOGRAMA CRO ON CRO.SEQ      = COMP.SEQ
    LEFT JOIN TCSPRJ PRJ        ON PRJ.CODPROJ  = CRO.CODPROJ
    LEFT JOIN TAB_DEP
      ON TAB_DEP.AD_CODUSU  = COMP.CODUSU
     AND TAB_DEP.CODPROJPAI = PRJ.CODPROJPAI
  WHERE APO.DATA IS NOT NULL
),
SETOR_MACRO AS (
  SELECT DISTINCT DEP.AD_CODUSU, DEPL.SETORMACRO
  FROM TFPDEP DEP
    JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = DEP.CODDEP
  WHERE DEP.AD_CODUSU IS NOT NULL
    AND DEPL.SETORMACRO IS NOT NULL
)
SELECT SETORMACRO, COD_SETOR, SETOR, LINHA, PROJETO, COD_ATIVIDADE, ATIVIDADE, DATA, HORAS
FROM (
  SELECT
    SM.SETORMACRO,
    TB.COD_SETOR,
    TB.SETOR,
    TB.LINHA,
    TB.PROJETO,
    TB.COD_ATIVIDADE,
    TB.ATIVIDADE,
    TO_CHAR(TRUNC(TB.DATA_EXECUCAO), 'DD/MM/YYYY') AS DATA,
    TRUNC(TB.DATA_EXECUCAO)                        AS DT_ORD,
    ROUND(SUM(TB.DURACAO) / 60, 2)                 AS HORAS
  FROM TAB_BASE TB
    JOIN SETOR_MACRO SM ON SM.AD_CODUSU = TB.COD_SETOR
  WHERE TB.RN = 1
    AND TB.RETRABALHO IS ${apenasRetrabalho ? 'NOT NULL' : 'NULL'}${setor ? `\n    AND SM.SETORMACRO = '${setor}'` : ''}
  GROUP BY SM.SETORMACRO, TB.COD_SETOR, TB.SETOR, TB.LINHA, TB.PROJETO,
           TB.COD_ATIVIDADE, TB.ATIVIDADE, TRUNC(TB.DATA_EXECUCAO)
)
ORDER BY SETORMACRO, SETOR, PROJETO, ATIVIDADE, DT_ORD
`.trim();
}

export type AtivDetalheRow = {
  setorMacro: string; codSetor: string; setor: string; linha: string; projeto: string;
  codAtividade: string; atividade: string; data: string; horas: number;
};

/* Ordem das colunas do SELECT acima — usada quando o backend devolve a linha
   como array posicional em vez de objeto (os dois formatos ocorrem). */
const ATIV_DETALHE_COLS = [
  'SETORMACRO', 'COD_SETOR', 'SETOR', 'LINHA', 'PROJETO',
  'COD_ATIVIDADE', 'ATIVIDADE', 'DATA', 'HORAS',
] as const;

function mapAtivDetalhe(r: unknown): AtivDetalheRow {
  const o: Record<string, unknown> = Array.isArray(r)
    ? Object.fromEntries(ATIV_DETALHE_COLS.map((c, i) => [c, r[i]]))
    : (r as Record<string, unknown>);
  const get = (k: string) => o[k] ?? o[k.toLowerCase()];
  return {
    setorMacro:   String(get('SETORMACRO')    ?? ''),
    codSetor:     String(get('COD_SETOR')     ?? ''),
    setor:        String(get('SETOR')         ?? ''),
    linha:        String(get('LINHA')         ?? ''),
    projeto:      String(get('PROJETO')       ?? ''),
    codAtividade: String(get('COD_ATIVIDADE') ?? ''),
    atividade:    String(get('ATIVIDADE')     ?? ''),
    data:         String(get('DATA')          ?? ''),
    horas:        Number(get('HORAS')         ?? 0),
  };
}

/* ── Mapeadores ────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAtiv(r: Record<string, any>): RawAtivRow {
  return {
    linha:           String(r['LINHA']            ?? r['linha']            ?? ''),
    data:            String(r['DATA']             ?? r['data']             ?? ''),
    setorMacro:      String(r['SETORMACRO']       ?? r['setormacro']       ?? ''),
    horas:           Number(r['HORAS']            ?? r['horas']            ?? 0),
    qtdAtiv:         Number(r['QTD_REGISTROS']    ?? r['qtd_registros']    ?? 0),
    horasRetrabalho: Number(r['HORAS_RETRABALHO'] ?? r['horas_retrabalho'] ?? 0),
    qtdRetrabalho:   Number(r['QTD_RETRABALHO']   ?? r['qtd_retrabalho']   ?? 0),
  };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPonto(r: Record<string, any>): RawPontoRow {
  return {
    linha:      String(r['LINHA']         ?? r['linha']         ?? ''),
    data:       String(r['DATA']          ?? r['data']          ?? ''),
    setorMacro: String(r['SETORMACRO']    ?? r['setormacro']    ?? ''),
    qtdPonto:   Number(r['QTD_REGISTROS'] ?? r['qtd_registros'] ?? 0),
    horasPonto: Number(r['HORAS_PONTO']   ?? r['horas_ponto']   ?? 0),
    horasExtras: Number(r['HORAS_EXTRAS'] ?? r['horas_extras']  ?? 0) || 0,
  };
}

/* ── API pública ───────────────────────────────────────────── */

/**
 * Carga única da tela: 24 consultas — 2 grupos de linha × 6 setores × 2 fontes
 * (atividades e ponto).
 *
 * A ordem importa: `flatMap` empilha os pares [atividades, ponto] do mesmo
 * recorte, e o `for (i += 2)` desintercala os índices pares/ímpares.
 */
export async function getOpeDados(
  ini: string,
  fim: string,
): Promise<{ ativos: RawAtivRow[]; pontos: RawPontoRow[] }> {
  const queries = [LINHAS_MENORES_ARR, LINHAS_MAIORES_ARR].flatMap(linhas =>
    SETORES_SQL.flatMap(setor => [
      obterReg(buildSqlAtividades(ini, fim, linhas, setor)),
      obterReg(buildSqlPonto(ini, fim, linhas, setor)),
    ])
  );
  const results = await Promise.all(queries);
  const ativos: RawAtivRow[]  = [];
  const pontos: RawPontoRow[] = [];
  for (let i = 0; i < results.length; i += 2) {
    results[i].forEach(r => ativos.push(mapAtiv(r)));
    results[i + 1].forEach(r => pontos.push(mapPonto(r)));
  }
  return { ativos, pontos };
}

/** Funcionários que bateram ponto no recorte — alimenta o popup de detalhe. */
export async function getPontoDetalhe(
  ini: string,
  fim: string,
  linhasArr: string[],
  setor: string | null,
): Promise<PontoDetalheRow[]> {
  const rows = await obterReg(buildSqlPontoDetalhe(ini, fim, linhasArr, setor));
  return rows.map(mapPontoDetalhe);
}

/**
 * Atividades apontadas no recorte, uma linha por atividade × barco × dia.
 *
 * É o "de onde vem" da coluna Atividades da tabela: a soma de `horas` daqui
 * fecha com o valor do card, porque a SQL parte da mesma TAB_BASE (com o mesmo
 * `RN = 1`) e exclui retrabalho, que na tela vira Perdas.
 */
/**
 * @param apenasRetrabalho Inverte o filtro: traz o que foi apontado COMO
 *   retrabalho, em vez do que foi produção.
 *
 * Os dois lados vêm da mesma tabela e se distinguem só por
 * `COMP.RETRABALHO IS NULL`. O OPE usa as atividades produtivas — retrabalho
 * fica fora do numerador; o indicador "Apontamento de Perdas" é justamente o
 * outro lado, e pedir o detalhe dele sem inverter o filtro devolvia a
 * produção do mês: em set/2026, 21.295 h onde o indicador dizia 3.717 h.
 */
export async function getAtivDetalhe(
  ini: string,
  fim: string,
  linhasArr: string[],
  setor: string | null,
  apenasRetrabalho = false,
): Promise<AtivDetalheRow[]> {
  const rows = await obterReg(buildSqlAtivDetalhe(ini, fim, linhasArr, setor, apenasRetrabalho));
  return rows.map(mapAtivDetalhe);
}

/**
 * Totais de um conjunto de setores agregados.
 *
 * Extraído da tela do OPE para que a home mostre exatamente o mesmo número —
 * dois `reduce` escritos em lugares diferentes divergem no dia em que alguém
 * mudar a regra de um só.
 *
 * PENDÊNCIAS não entra no OPE: é hora de ponto sem apontamento nenhum. E
 * PERDAS (retrabalho) também não — uma hora retrabalhada não conta como
 * atividade, mas também não é descontada. O OPE mede quanto da hora paga virou
 * atividade produtiva apontada.
 */
export type TotaisOpe = {
  ponto: number; ativ: number; perdas: number; pend: number;
  /** Hora extra dos mesmos registros de ponto — informativa, fora do OPE. */
  horasExtras: number;
  /** `null` quando não há ponto no período — ausência não é zero. */
  opePct: number | null;
};

export function totaisOpe(setores: AggRow[]): TotaisOpe {
  const ponto  = setores.reduce((s, l) => s + l.horasReg, 0);
  const ativ   = setores.reduce((s, l) => s + l.horas, 0);
  const perdas = setores.reduce((s, l) => s + l.horasRetrabalho, 0);
  const horasExtras = setores.reduce((s, l) => s + l.horasExtras, 0);
  return { ponto, ativ, perdas, horasExtras, pend: ponto - ativ - perdas, opePct: ponto > 0 ? (ativ / ponto) * 100 : null };
}
