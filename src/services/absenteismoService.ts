// src/services/absenteismoService.ts
// Consultas do Absenteísmo (view AD_VFALTA + TFPFUN). Saíram da AbsenteismoPage
// com o texto idêntico para o Dashboard calcular a assiduidade com a MESMA conta
// da tela — HH perdido ÷ HH disponível, com o escopo "meus colaboradores".
import { obterReg } from "@/lib/obterReg";
import { txt, type ErpRow } from "@/lib/format";
import { SQL_LINHA_DO_PONTO } from "@/services/opeService";

export const esc = (v: string) => v.replace(/'/g, "''");
export const oracleData = (d: string) => `TO_DATE('${d}','DD/MM/YYYY')`;

// Taxa de absenteísmo = HH perdido ÷ HH disponível × 100
export const taxaAbs = (hhFalta: number, hhDisp: number) => (hhDisp > 0 ? (hhFalta / hhDisp) * 100 : 0);
// Condição "colaborador disponível no dia D" (DTADM ≤ D e não demitido até D)
export const ATIVO_NO_DIA = (col: string) => `TRUNC(F.DTADM) <= ${col} AND (F.DTDEM IS NULL OR TRUNC(F.DTDEM) >= ${col})`;

/* ── Escopo "Apenas meus colaboradores" (só neste painel) ──────────
   `sup` = CODUSU do supervisor logado, ou null para a empresa toda.
   O casamento com AD_VFALTA é por CODFUNC, igual ao JOIN que já existia em
   FROM_BASE. */
export type Sup = number | null;
/** Para consultas que já têm TFPFUN com alias. */
export const escopoFun = (alias: string, sup: Sup) => (sup == null ? "" : ` AND ${alias}.USUVPJSUP = ${Number(sup)}`);
/** Para consultas só em AD_VFALTA. */
export const escopoFalta = (col: string, sup: Sup) =>
  sup == null ? "" : ` AND ${col} IN (SELECT CODFUNC FROM TFPFUN WHERE USUVPJSUP = ${Number(sup)})`;

/* ===================== SQL (view AD_VFALTA + TFPFUN) ===================== */
// Faltas mês a mês (efetivo/HH disponível vem de SQL_EFETIVO_MENSAL)
export const makeSqlMensal = (sup: Sup) => `
SELECT ANOREF, MESREF,
  COUNT(DISTINCT CODFUNC) AS FALTANTES,
  COUNT(*)                AS FALTAS,
  SUM(HH_PERDIDO)         AS HH_PERDIDO
FROM AD_VFALTA
WHERE 1 = 1${escopoFalta("CODFUNC", sup)}
GROUP BY ANOREF, MESREF
ORDER BY ANOREF, TO_NUMBER(MESREF)
`;

// Efetivo disponível por mês — dias úteis (seg–sex) × ativos no dia (DTADM/DTDEM)
export const makeSqlEfetivoMensal = (ini: string, fim: string, sup: Sup) => `
WITH DIAS AS (
  SELECT D FROM (
    SELECT ${oracleData(ini)} + LEVEL - 1 AS D
    FROM DUAL CONNECT BY LEVEL <= ${oracleData(fim)} - ${oracleData(ini)} + 1
  )
  WHERE TO_CHAR(D,'DY','NLS_DATE_LANGUAGE=ENGLISH') NOT IN ('SAT','SUN')
),
EFETIVO AS (
  SELECT D.D, COUNT(*) AS ATIVOS
  FROM DIAS D
  JOIN TFPFUN F ON ${ATIVO_NO_DIA("D.D")}${escopoFun("F", sup)}
  GROUP BY D.D
)
SELECT TO_CHAR(D,'YYYY') AS ANOREF, TO_CHAR(D,'MM') AS MESREF,
  COUNT(*)           AS DIAS_UTEIS,
  ROUND(AVG(ATIVOS)) AS EFETIVO_MEDIO,
  SUM(ATIVOS) * 8    AS HH_DISPONIVEL
FROM EFETIVO
GROUP BY TO_CHAR(D,'YYYY'), TO_CHAR(D,'MM')
ORDER BY 1, 2
`;

// Diário — faltas por dia + ativos no próprio dia (DTADM/DTDEM)
export const makeSqlDia = (ini: string, fim: string, sup: Sup) => `
SELECT g.DIA, g.FALTAS, g.HH_PERDIDO,
  (SELECT COUNT(*) FROM TFPFUN F WHERE ${ATIVO_NO_DIA("g.DT")}${escopoFun("F", sup)}) AS ATIVOS,
  ROUND(100 * g.FALTAS / NULLIF((SELECT COUNT(*) FROM TFPFUN F WHERE ${ATIVO_NO_DIA("g.DT")}${escopoFun("F", sup)}),0), 2) AS PCT_ABSENTEISMO
FROM (
  SELECT TRUNC(DTREF) AS DT, TO_CHAR(DTREF,'DD/MM/YYYY') AS DIA,
    COUNT(*) AS FALTAS, SUM(HH_PERDIDO) AS HH_PERDIDO
  FROM AD_VFALTA
  WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}${escopoFalta("CODFUNC", sup)}
  GROUP BY TRUNC(DTREF), TO_CHAR(DTREF,'DD/MM/YYYY')
) g
ORDER BY g.DT
`;

export const FROM_BASE = (ini: string, fim: string, sup: Sup) => `
FROM AD_VFALTA v
JOIN TFPFUN f ON f.CODFUNC = v.CODFUNC
WHERE TRUNC(v.DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}${escopoFun("f", sup)}`;
export const GERENTE_EXPR = `NVL(f.AD_GERENTE,'(sem gerente)')`;
export const SUPERVISOR_EXPR = `NVL(v.GESTOR,'(sem gestor)')`;
export const METRICAS = `COUNT(*) AS FALTAS, COUNT(DISTINCT v.CODFUNC) AS FALTANTES, SUM(v.HH_PERDIDO) AS HH_PERDIDO`;

// Nível 0 — por gerente
export const makeSqlGerentes = (ini: string, fim: string, sup: Sup) => `
SELECT ${GERENTE_EXPR} AS GERENTE, ${METRICAS}
${FROM_BASE(ini, fim, sup)}
GROUP BY ${GERENTE_EXPR}
ORDER BY FALTAS DESC
`;

// Nível 1 — supervisores de um gerente
export const makeSqlSupervisores = (ini: string, fim: string, gerente: string, sup: Sup) => `
SELECT ${SUPERVISOR_EXPR} AS SUPERVISOR, ${METRICAS}
${FROM_BASE(ini, fim, sup)}
  AND ${GERENTE_EXPR} = '${esc(gerente)}'
GROUP BY ${SUPERVISOR_EXPR}
ORDER BY FALTAS DESC
`;

// Nível 2 — colaboradores de gerente + supervisor
export const makeSqlFuncionarios = (ini: string, fim: string, gerente: string, supervisor: string, sup: Sup) => `
SELECT v.CODFUNC, v.NOMEFUNC, COUNT(*) AS FALTAS, SUM(v.HH_PERDIDO) AS HH_PERDIDO
${FROM_BASE(ini, fim, sup)}
  AND ${GERENTE_EXPR} = '${esc(gerente)}'
  AND ${SUPERVISOR_EXPR} = '${esc(supervisor)}'
GROUP BY v.CODFUNC, v.NOMEFUNC
ORDER BY FALTAS DESC
`;

// Nível 3 — dias da falta de um colaborador
export const makeSqlDiasColab = (ini: string, fim: string, codfunc: number) => `
SELECT TO_CHAR(DTREF,'DD/MM/YYYY') AS DIA, HH_PERDIDO
FROM AD_VFALTA
WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
  AND CODFUNC = ${Number(codfunc)}
ORDER BY DTREF
`;

// Análise do mês — colaboradores que mais faltaram (com gerente/supervisor)
export const makeSqlTopMes = (ini: string, fim: string, sup: Sup) => `
SELECT v.CODFUNC, v.NOMEFUNC, ${GERENTE_EXPR} AS GERENTE, ${SUPERVISOR_EXPR} AS SUPERVISOR,
  COUNT(*) AS FALTAS, SUM(v.HH_PERDIDO) AS HH_PERDIDO
${FROM_BASE(ini, fim, sup)}
GROUP BY v.CODFUNC, v.NOMEFUNC, ${GERENTE_EXPR}, ${SUPERVISOR_EXPR}
ORDER BY FALTAS DESC
`;
// Reincidência — faltas por colaborador por mês (janela do histórico)
export const makeSqlReincidencia = (ini: string, fim: string, sup: Sup) => `
SELECT CODFUNC, ANOREF, MESREF, COUNT(*) AS FALTAS
FROM AD_VFALTA
WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}${escopoFalta("CODFUNC", sup)}
GROUP BY CODFUNC, ANOREF, MESREF
`;


/* ── Usado pelo Dashboard ────────────────────────────────────── */

export type AssiduidadeMes = {
  faltas: number;
  faltantes: number;
  hhPerdido: number;
  hhDisponivel: number;
  efetivoMedio: number;
  diasUteis: number;
  /** % absenteísmo (HH perdido ÷ HH disponível), a mesma taxa da tela. `null` sem efetivo. */
  absenteismo: number | null;
  /** 100 − absenteísmo. */
  assiduidade: number | null;
};

const pad2 = (x: number) => String(x).padStart(2, "0");
const br = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const numero = (v: unknown) => (v == null || v === "" ? 0 : Number(v));

/**
 * Assiduidade do mês e do anterior com as consultas da tela de Absenteísmo:
 * faltas de `makeSqlMensal` (mês inteiro) ÷ efetivo de `makeSqlEfetivoMensal`
 * (dias úteis até hoje no mês corrente — igual à tela).
 */
export async function getAssiduidade(
  ano: number,
  mes: number,
  sup: Sup,
  hoje = new Date()
): Promise<{ atual: AssiduidadeMes; anterior: AssiduidadeMes }> {
  const iniAnterior = new Date(ano, mes - 2, 1);
  const fimMes = new Date(ano, mes, 0);
  const ate = fimMes < hoje ? fimMes : hoje;

  const [faltaRaw, efRaw] = await Promise.all([
    obterReg(makeSqlMensal(sup), { pageSize: 5000, maxPages: 5 }),
    ate >= iniAnterior
      ? obterReg(makeSqlEfetivoMensal(br(iniAnterior), br(ate), sup), { pageSize: 5000, maxPages: 5 })
      : Promise.resolve([]),
  ]);

  const doMes = (a: number, m: number): AssiduidadeMes => {
    const f = (faltaRaw as ErpRow[]).find((r) => numero(r.ANOREF) === a && numero(r.MESREF) === m);
    const e = (efRaw as ErpRow[]).find((r) => numero(r.ANOREF) === a && numero(r.MESREF) === m);
    const hhPerdido = numero(f?.HH_PERDIDO);
    const hhDisponivel = numero(e?.HH_DISPONIVEL);
    const absenteismo = hhDisponivel > 0 ? taxaAbs(hhPerdido, hhDisponivel) : null;
    return {
      faltas: numero(f?.FALTAS),
      faltantes: numero(f?.FALTANTES),
      hhPerdido,
      hhDisponivel,
      efetivoMedio: numero(e?.EFETIVO_MEDIO),
      diasUteis: numero(e?.DIAS_UTEIS),
      absenteismo,
      assiduidade: absenteismo == null ? null : 100 - absenteismo,
    };
  };

  return {
    atual: doMes(ano, mes),
    anterior: doMes(iniAnterior.getFullYear(), iniAnterior.getMonth() + 1),
  };
}

export type FaltaRecente = { codfunc: number; nome: string; dia: string; hhPerdido: number; gestor: string };

/** Faltas a partir de `desde` (YYYY-MM-DD), mais recentes primeiro. */
export async function getFaltasRecentes(desde: string, sup: Sup): Promise<FaltaRecente[]> {
  const [y, m, d] = desde.split("-");
  const sql = `
SELECT v.CODFUNC, v.NOMEFUNC, TO_CHAR(v.DTREF, 'YYYY-MM-DD') AS DIA, v.HH_PERDIDO, v.GESTOR
FROM AD_VFALTA v
WHERE TRUNC(v.DTREF) >= ${oracleData(`${d}/${m}/${y}`)}${escopoFalta("v.CODFUNC", sup)}
ORDER BY v.DTREF DESC, v.NOMEFUNC
`;
  return ((await obterReg(sql, { pageSize: 2000, maxPages: 2 })) as ErpRow[]).map((r) => ({
    codfunc: numero(r.CODFUNC),
    nome: txt(r.NOMEFUNC),
    dia: txt(r.DIA),
    hhPerdido: numero(r.HH_PERDIDO),
    gestor: txt(r.GESTOR),
  }));
}

/* ── Aba "Por setor produtivo" (só deste painel) ─────────────
   A view AD_VFALTA não conhece departamento: o setor vem do cadastro do
   colaborador pelo caminho do OPE — TFPFUN.CODDEP → AD_DEPLINHA.SETORMACRO.
   Duas consultas (quadro e faltas) agregadas no cliente, para o denominador
   incluir quem NÃO faltou, que a view não tem como mostrar.

   O serviço devolve as LINHAS CRUAS; quem agrupa (lib/absenteismoSetores) é que
   aplica o filtro de galpão — trocar de galpão não refaz consulta. */

/** Sem linha de produção: indiretos e administrativo entram aqui em vez de sumir. */
export const SEM_SETOR = "(sem setor produtivo)";

/** Uma pessoa × setor × linha de produção (a linha pode repetir a pessoa). */
export type QuadroSetorRow = { setor: string; chave: string; linha: string | null };
/** Uma pessoa × setor, com o que ela perdeu no mês. */
export type FaltaSetorRow = { setor: string; chave: string; codfunc: number; nome: string; faltas: number; hhPerdido: number };
export type DadosSetor = { quadro: QuadroSetorRow[]; faltas: FaltaSetorRow[]; ini: string; fim: string };

const chavePessoa = (r: ErpRow) => `${txt(r.CODEMP)}-${txt(r.CODFUNC)}`;

/**
 * Quadro e faltas do mês por setor produtivo.
 *
 * Ativo = admitido até o fim do período e não demitido antes do começo dele —
 * ou seja, ativo em ALGUM dia do mês. Quem entrou ou saiu no meio do mês pôde
 * faltar e precisa estar no denominador.
 *
 * A linha de produção usa a MESMA tradução do ponto no OPE (SQL_LINHA_DO_PONTO,
 * 480→500 e 600→620) que o quadro da Meta de Produção: cópias divergentes dessa
 * expressão já produziram número errado.
 *
 * @param mes mês 1-indexado.
 */
export async function getDadosAbsenteismoSetor(
  ano: number,
  mes: number,
  sup: Sup,
  hoje = new Date()
): Promise<DadosSetor> {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const fimMes = new Date(ano, mes, 0);
  const ate = fimMes < hoje ? fimMes : hoje;
  const ini = `01/${p2(mes)}/${ano}`;
  const fim = `${p2(ate.getDate())}/${p2(ate.getMonth() + 1)}/${ate.getFullYear()}`;

  // O LEFT JOIN mantém quem não tem linha de produção: o total da aba fecha com
  // o indicador "Colaboradores ativos" do topo da tela.
  const sqlQuadro = `
SELECT DISTINCT
  NVL(DEPL.SETORMACRO, '${SEM_SETOR}') AS SETOR,
  F.CODEMP,
  F.CODFUNC,
  CASE WHEN DEPL.CODPROJPAI IS NULL THEN NULL ELSE ${SQL_LINHA_DO_PONTO} END AS LINHA
FROM TFPFUN F
LEFT JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = F.CODDEP
WHERE TRUNC(F.DTADM) <= ${oracleData(fim)}
  AND (F.DTDEM IS NULL OR TRUNC(F.DTDEM) >= ${oracleData(ini)})${escopoFun("F", sup)}
`.trim();

  /* Sem a linha no GROUP BY: departamento com duas linhas multiplicaria as
     faltas. O galpão do faltante vem do quadro, pela chave da pessoa.
     O JOIN com TFPFUN é por CODFUNC, como o FROM_BASE da tela: a view não traz
     CODEMP. Se houver CODFUNC repetido entre empresas, a falta conta nas duas. */
  const sqlFaltas = `
SELECT
  NVL(DEPL.SETORMACRO, '${SEM_SETOR}') AS SETOR,
  F.CODEMP,
  V.CODFUNC,
  V.NOMEFUNC,
  COUNT(*)            AS FALTAS,
  SUM(V.HH_PERDIDO)   AS HH_PERDIDO
FROM AD_VFALTA V
JOIN TFPFUN F ON F.CODFUNC = V.CODFUNC
LEFT JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = F.CODDEP
WHERE TRUNC(V.DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}${escopoFun("F", sup)}
GROUP BY NVL(DEPL.SETORMACRO, '${SEM_SETOR}'), F.CODEMP, V.CODFUNC, V.NOMEFUNC
`.trim();

  const [quadroRaw, faltasRaw] = await Promise.all([
    obterReg(sqlQuadro, { pageSize: 5000, maxPages: 10 }),
    obterReg(sqlFaltas, { pageSize: 5000, maxPages: 10 }),
  ]);

  const quadro: QuadroSetorRow[] = (quadroRaw as ErpRow[]).map((r) => ({
    setor: txt(r.SETOR) || SEM_SETOR,
    chave: chavePessoa(r),
    linha: txt(r.LINHA) || null,
  }));
  const faltas: FaltaSetorRow[] = (faltasRaw as ErpRow[]).map((r) => ({
    setor: txt(r.SETOR) || SEM_SETOR,
    chave: chavePessoa(r),
    codfunc: numero(r.CODFUNC),
    nome: txt(r.NOMEFUNC),
    faltas: numero(r.FALTAS),
    hhPerdido: numero(r.HH_PERDIDO),
  }));
  return { quadro, faltas, ini, fim };
}
