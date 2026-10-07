// src/services/emprestimoService.ts
// Empréstimo de colaborador entre departamentos (AD_EMPRESTFUN).
//
// A produção empresta gente de um setor a outro por alguns dias. O pedido
// nasce PENDENTE; quem aprova é o responsável do departamento de DESTINO
// (TFPDEP.AD_CODUSURES). Aprovado, o OPE passa a contar o ponto da pessoa no
// setor e no galpão de destino naqueles dias — ver opeService
// (`sqlDepEfetivo`).
//
// Leitura pelo obterReg; gravação pelo DatasetSP.save, com o login de quem usa
// o painel (o Sankhya registra o autor e aplica a permissão dele na tabela).
// Uma linha por empréstimo, sem tabela filha: o DatasetSP não devolve a chave
// gerada, e com uma linha só o app nunca precisa dela depois de incluir.
import { api } from "@/lib/api";
import { obterReg } from "@/lib/obterReg";
import { int, txt, type ErpRow } from "@/lib/format";
import { parseDatasetSaveResponse } from "@/lib/sankhyaRetorno";
import { SQL_CTE_DEP_SETOR, SQL_CTE_GALPAO } from "@/services/opeService";

/**
 * Nome da instância no dicionário — é o que vai no `entity` do DatasetSP.
 * Tabelas do Construtor de Telas costumam ter instância com o mesmo nome; se
 * não for o caso, conferir com
 *   SELECT NOMETAB, NOMEINSTANCIA FROM TDDINS WHERE NOMETAB = 'AD_EMPRESTFUN'
 */
export const INSTANCIA_EMPRESTIMO = "AD_EMPRESTFUN";

export type StatusEmprestimo = "P" | "A" | "R" | "C";

export const STATUS_EMPRESTIMO: Record<StatusEmprestimo, string> = {
  P: "Pendente",
  A: "Aprovado",
  R: "Reprovado",
  C: "Cancelado",
};

export type Emprestimo = {
  codEmprest: number;
  codemp: number;
  codfunc: number;
  nomefunc: string;
  codDepOrig: number;
  depOrig: string;
  setorOrig: string;
  galpaoOrig: string;
  codDepDest: number;
  depDest: string;
  setorDest: string;
  galpaoDest: string;
  /** Responsável do destino HOJE — quem pode aprovar enquanto pendente. */
  codRespDest: number | null;
  nomeRespDest: string;
  /** "YYYY-MM-DD" */
  dtini: string;
  /** "YYYY-MM-DD", inclusive. */
  dtfim: string;
  motivo: string;
  status: StatusEmprestimo;
  codUsuSol: number;
  nomeSol: string;
  dhSolicit: string;
  codUsuDec: number | null;
  nomeDec: string;
  dhDec: string;
  obsDec: string;
  codUsuCanc: number | null;
  nomeCanc: string;
  dhCanc: string;
};

/** Colaborador que pode ser emprestado. A chave de TFPFUN é CODEMP + CODFUNC. */
export type ColabEmprestimo = { codemp: number; codfunc: number; nome: string; coddep: number; descrdep: string };

/** Departamento, com o que a prévia precisa mostrar. */
export type DepEmprestimo = {
  coddep: number;
  descrdep: string;
  /** TFPDEP.AD_CODUSURES — sem ele, ninguém poderia aprovar. */
  codResp: number | null;
  nomeResp: string;
  /** Setor de produção e galpão, pelo mesmo caminho do ponto no OPE. Vazios = fora do OPE. */
  setor: string;
  galpao: string;
};

const numOuNull = (v: unknown) => (v == null || v === "" ? null : Number(v));
const statusDe = (v: unknown): StatusEmprestimo => {
  const s = txt(v).toUpperCase();
  return s === "A" || s === "R" || s === "C" ? s : "P";
};
/** "YYYY-MM-DD" → TO_DATE do Oracle. Valida o formato antes de interpolar. */
const oracleIso = (ymd: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) throw new Error(`Data inválida: ${ymd}`);
  return `TO_DATE('${ymd}', 'YYYY-MM-DD')`;
};

/* ── Leitura ─────────────────────────────────────────────────── */

/**
 * Empréstimos que tocam o período, MAIS todo pendente (de qualquer data): o
 * pendente é fila de ação, não pode sumir só porque o período da tela mudou.
 */
export async function getEmprestimos(ini: string, fim: string): Promise<Emprestimo[]> {
  const sql = `
WITH
${SQL_CTE_GALPAO},
${SQL_CTE_DEP_SETOR}
SELECT
  E.CODEMPREST, E.CODEMP, E.CODFUNC, FUN.NOMEFUNC,
  E.CODDEPORIG, DOR.DESCRDEP AS DEP_ORIG, SOR.SETORMACRO AS SETOR_ORIG, GOR.GALPAO AS GALPAO_ORIG,
  E.CODDEPDEST, DDS.DESCRDEP AS DEP_DEST, SDS.SETORMACRO AS SETOR_DEST, GDS.GALPAO AS GALPAO_DEST,
  DDS.AD_CODUSURES AS COD_RESP_DEST, URS.NOMEUSU AS NOME_RESP_DEST,
  TO_CHAR(E.DTINI, 'YYYY-MM-DD') AS DTINI,
  TO_CHAR(E.DTFIM, 'YYYY-MM-DD') AS DTFIM,
  E.MOTIVO, E.STATUS,
  E.CODUSUSOL, USO.NOMEUSU AS NOME_SOL, TO_CHAR(E.DHSOLICIT, 'DD/MM/YYYY HH24:MI') AS DHSOLICIT,
  E.CODUSUDEC, UDE.NOMEUSU AS NOME_DEC, TO_CHAR(E.DHDEC, 'DD/MM/YYYY HH24:MI') AS DHDEC, E.OBSDEC,
  E.CODUSUCANC, UCA.NOMEUSU AS NOME_CANC, TO_CHAR(E.DHCANC, 'DD/MM/YYYY HH24:MI') AS DHCANC
FROM AD_EMPRESTFUN E
  LEFT JOIN TFPFUN FUN    ON FUN.CODEMP  = E.CODEMP AND FUN.CODFUNC = E.CODFUNC
  LEFT JOIN TFPDEP DOR    ON DOR.CODDEP  = E.CODDEPORIG
  LEFT JOIN DEP_SETOR SOR ON SOR.CODDEP  = E.CODDEPORIG
  LEFT JOIN GALPAO GOR    ON GOR.CODPLP  = SOR.CODPLP
  LEFT JOIN TFPDEP DDS    ON DDS.CODDEP  = E.CODDEPDEST
  LEFT JOIN DEP_SETOR SDS ON SDS.CODDEP  = E.CODDEPDEST
  LEFT JOIN GALPAO GDS    ON GDS.CODPLP  = SDS.CODPLP
  LEFT JOIN TSIUSU URS    ON URS.CODUSU  = DDS.AD_CODUSURES
  LEFT JOIN TSIUSU USO    ON USO.CODUSU  = E.CODUSUSOL
  LEFT JOIN TSIUSU UDE    ON UDE.CODUSU  = E.CODUSUDEC
  LEFT JOIN TSIUSU UCA    ON UCA.CODUSU  = E.CODUSUCANC
WHERE (TRUNC(E.DTINI) <= ${oracleIso(fim)} AND TRUNC(E.DTFIM) >= ${oracleIso(ini)})
   OR E.STATUS = 'P'
ORDER BY E.DHSOLICIT DESC
`.trim();

  return ((await obterReg(sql)) as ErpRow[]).map((r) => ({
    codEmprest: int(r.CODEMPREST),
    codemp: int(r.CODEMP),
    codfunc: int(r.CODFUNC),
    nomefunc: txt(r.NOMEFUNC),
    codDepOrig: int(r.CODDEPORIG),
    depOrig: txt(r.DEP_ORIG),
    setorOrig: txt(r.SETOR_ORIG),
    galpaoOrig: txt(r.GALPAO_ORIG),
    codDepDest: int(r.CODDEPDEST),
    depDest: txt(r.DEP_DEST),
    setorDest: txt(r.SETOR_DEST),
    galpaoDest: txt(r.GALPAO_DEST),
    codRespDest: numOuNull(r.COD_RESP_DEST),
    nomeRespDest: txt(r.NOME_RESP_DEST),
    dtini: txt(r.DTINI),
    dtfim: txt(r.DTFIM),
    motivo: txt(r.MOTIVO),
    status: statusDe(r.STATUS),
    codUsuSol: int(r.CODUSUSOL),
    nomeSol: txt(r.NOME_SOL),
    dhSolicit: txt(r.DHSOLICIT),
    codUsuDec: numOuNull(r.CODUSUDEC),
    nomeDec: txt(r.NOME_DEC),
    dhDec: txt(r.DHDEC),
    obsDec: txt(r.OBSDEC),
    codUsuCanc: numOuNull(r.CODUSUCANC),
    nomeCanc: txt(r.NOME_CANC),
    dhCanc: txt(r.DHCANC),
  }));
}

/** Colaboradores ativos — o mesmo critério da Hora Extra (SITUACAO <> '0'). */
export async function getColaboradoresEmprestimo(): Promise<ColabEmprestimo[]> {
  const rows = (await obterReg(`
SELECT FUN.CODEMP, FUN.CODFUNC, FUN.NOMEFUNC, FUN.CODDEP, DEP.DESCRDEP
FROM TFPFUN FUN
  JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
WHERE FUN.SITUACAO <> '0'
ORDER BY FUN.NOMEFUNC
`.trim())) as ErpRow[];
  return rows.map((r) => ({
    codemp: int(r.CODEMP),
    codfunc: int(r.CODFUNC),
    nome: txt(r.NOMEFUNC),
    coddep: int(r.CODDEP),
    descrdep: txt(r.DESCRDEP),
  }));
}

/**
 * Departamentos ativos, com o responsável e o setor/galpão do OPE. Serve à
 * prévia do pedido: destino sem responsável bloqueia; destino fora da produção
 * só avisa (o empréstimo vale, mas não muda o OPE).
 */
export async function getDepartamentosEmprestimo(): Promise<DepEmprestimo[]> {
  const rows = (await obterReg(`
WITH
${SQL_CTE_GALPAO},
${SQL_CTE_DEP_SETOR}
SELECT D.CODDEP, D.DESCRDEP, D.AD_CODUSURES, U.NOMEUSU AS NOME_RESP, DSE.SETORMACRO, GL.GALPAO
FROM TFPDEP D
  LEFT JOIN TSIUSU U       ON U.CODUSU    = D.AD_CODUSURES
  LEFT JOIN DEP_SETOR DSE  ON DSE.CODDEP  = D.CODDEP
  LEFT JOIN GALPAO GL      ON GL.CODPLP   = DSE.CODPLP
WHERE D.ATIVO = 'S'
ORDER BY D.DESCRDEP
`.trim())) as ErpRow[];
  return rows.map((r) => ({
    coddep: int(r.CODDEP),
    descrdep: txt(r.DESCRDEP),
    codResp: numOuNull(r.AD_CODUSURES),
    nomeResp: txt(r.NOME_RESP),
    setor: txt(r.SETORMACRO),
    galpao: txt(r.GALPAO),
  }));
}

/**
 * Outro empréstimo do mesmo colaborador cobrindo algum dia do período?
 *
 * @param status quais contam como conflito: ao PEDIR, pendente e aprovado (dois
 *   pedidos pendentes para o mesmo dia virariam corrida na aprovação); ao
 *   APROVAR, só aprovado.
 */
export async function haSobreposicao(
  codemp: number,
  codfunc: number,
  dtini: string,
  dtfim: string,
  status: StatusEmprestimo[],
  ignorar?: number
): Promise<boolean> {
  const rows = (await obterReg(`
SELECT COUNT(*) AS QTD
FROM AD_EMPRESTFUN
WHERE CODEMP  = ${Number(codemp)}
  AND CODFUNC = ${Number(codfunc)}
  AND STATUS IN (${status.map((s) => `'${s}'`).join(", ")})
  AND TRUNC(DTINI) <= ${oracleIso(dtfim)}
  AND TRUNC(DTFIM) >= ${oracleIso(dtini)}${ignorar != null ? `\n  AND CODEMPREST <> ${Number(ignorar)}` : ""}
`.trim())) as ErpRow[];
  return int(rows[0]?.QTD) > 0;
}

/* ── Gravação ────────────────────────────────────────────────── */

export type ResultadoGravacao = ReturnType<typeof parseDatasetSaveResponse>;

const pad2 = (n: number) => String(n).padStart(2, "0");
/** "YYYY-MM-DD" → "DD/MM/YYYY", o formato de data do DatasetSP. */
const dataBr = (ymd: string) => ymd.split("-").reverse().join("/");
/** Agora, como data-hora do DatasetSP: "DD/MM/YYYY HH:MM:SS". */
const agoraBr = () => {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

async function salvar(fields: string[], valores: string[], pk?: Record<string, number>): Promise<ResultadoGravacao> {
  const resp = await api.post("/api/sankhya/dataset/save", {
    entity: INSTANCIA_EMPRESTIMO,
    fields,
    values: Object.fromEntries(valores.map((v, i) => [String(i), v])),
    ...(pk ? { pk } : {}),
  });
  return parseDatasetSaveResponse(resp.data);
}

export type NovoEmprestimo = {
  codemp: number;
  codfunc: number;
  codDepOrig: number;
  codDepDest: number;
  /** "YYYY-MM-DD" */
  dtini: string;
  /** "YYYY-MM-DD", inclusive. */
  dtfim: string;
  motivo: string;
};

/** Grava o pedido como PENDENTE. */
export function solicitarEmprestimo(e: NovoEmprestimo, codusu: number): Promise<ResultadoGravacao> {
  return salvar(
    ["CODEMP", "CODFUNC", "CODDEPORIG", "CODDEPDEST", "DTINI", "DTFIM", "MOTIVO", "STATUS", "CODUSUSOL", "DHSOLICIT"],
    [
      String(e.codemp),
      String(e.codfunc),
      String(e.codDepOrig),
      String(e.codDepDest),
      dataBr(e.dtini),
      dataBr(e.dtfim),
      e.motivo.trim(),
      "P",
      String(codusu),
      agoraBr(),
    ]
  );
}

/**
 * Aprova ou reprova. O trigger TRG_AD_EMPRESTFUN_APROVA (se criado) recusa
 * quem não for o responsável do destino e grava quem decidiu — o app manda os
 * mesmos valores, para funcionar também sem o trigger.
 */
export function decidirEmprestimo(codEmprest: number, decisao: "A" | "R", codusu: number, obs: string): Promise<ResultadoGravacao> {
  return salvar(["STATUS", "CODUSUDEC", "DHDEC", "OBSDEC"], [decisao, String(codusu), agoraBr(), obs.trim()], { CODEMPREST: codEmprest });
}

export function cancelarEmprestimo(codEmprest: number, codusu: number): Promise<ResultadoGravacao> {
  return salvar(["STATUS", "CODUSUCANC", "DHCANC"], ["C", String(codusu), agoraBr()], { CODEMPREST: codEmprest });
}
