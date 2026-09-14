// src/services/alocacaoService.ts
// Dados da Alocação de Recursos da OP. As consultas moravam dentro da página.
//
// O que mudou em relação à versão da página (e por quê):
//  · Colaboradores: eram os subordinados do supervisor logado CRUZADOS com
//    AD_SETORESCARGO — a interseção vinha vazia e a tela ficava sem ninguém para
//    alocar. Agora são todos os ativos cujo cargo pertence a um setor das
//    demandas da OP, de qualquer supervisor (decisão do PCP). Demitidos saem;
//    a pessoa não duplica quando o cargo está em vários setores; o fallback
//    para o usuário 134 sem login saiu.
//  · Planejamento ERP desta OP: sem o filtro de supervisor (mesmo motivo) e
//    com IN no lugar do LEFT JOIN TPRIPROC, que multiplica linhas quando o
//    projeto tem mais de uma ordem.
//  · Carga em outras OPs: nova. Sem ela a capacidade do colaborador parecia
//    livre mesmo com o dia tomado por outra OP.
//  · Gravação: mesmo payload de antes, agora conferindo o retorno do Sankhya
//    (parseDatasetSaveResponse) — antes um "status 0" passava como sucesso.
import { api } from "@/lib/api";
import { obterReg } from "@/lib/obterReg";
import { txt, type ErpRow } from "@/lib/format";
import { mensagemErro, parseDatasetSaveResponse } from "@/lib/sankhyaRetorno";

/* ── Tipos ───────────────────────────────────────────────────── */

export type Etapa = "LAM" | "MON" | "PINT" | "ELE" | "ACB";

/** Uma demanda da OP ainda não planejada no ERP (AD_COMPONENTECRONO sem AD_DETALCRONOGRAMAFUNC). */
export type Demanda = {
  /** `seq-codusu-codprod`: estável entre recargas (o `id` antigo era o índice da linha). */
  chave: string;
  nome: string;
  etapa: Etapa;
  /** Horas previstas (QTD em minutos ÷ 60, uma casa). */
  hhPrev: number;
  tempoMin: number;
  /** YYYY-MM-DD — DTINICIOPREV do cronograma. */
  dtDemanda: string;
  /** YYYY-MM-DD — data em que será planejada (DTPLANEJAMENTO). Começa igual à demanda. */
  dtPlan: string;
  dtPlanOriginal: string;
  /** CODFUNC alocados na tela (ainda não gravados). */
  alocados: number[];
  codusu: number;
  setor: string;
  codprod: number;
  seq: number;
};

/** Item já planejado no ERP (AD_DETALCRONOGRAMAFUNC) para esta OP. */
export type ItemErp = {
  seq: number;
  dt: string;
  codprod: number;
  descrprod: string;
  /** minutos */
  qtd: number;
  codusu: number;
  sequencia: number;
};

export type Colab = {
  id: number;
  nome: string;
  cargo: string;
  /** Setores (CODUSU) em que o cargo pode atuar — AD_SETORESCARGO. */
  codSetores: number[];
  supervisor: string;
  atividadesERP: ItemErp[];
};

/** Minutos planejados em OUTRAS OPs, por colaborador e dia: `codfunc` → `YYYY-MM-DD` → min. */
export type CargaExterna = Map<number, Map<string, number>>;

/* ── Consultas ───────────────────────────────────────────────── */

const inteiro = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const listaSql = (ns: number[]) => [...new Set(ns.map(Number).filter(Number.isFinite))].join(", ");
const dataOracleIso = (ymd: string) => {
  const [y, m, d] = ymd.split("-");
  return `TO_DATE('${d}/${m}/${y}', 'DD/MM/YYYY')`;
};

function etapaDoSetor(setor: string): Etapa {
  const nm = setor.toUpperCase();
  if (nm.includes("LAM")) return "LAM";
  if (nm.includes("PINT")) return "PINT";
  if (nm.includes("ELE")) return "ELE";
  if (nm.includes("ACAB")) return "ACB";
  return "MON";
}

/** Demandas da OP ainda não planejadas. SQL igual à da página. */
export async function getDemandas(idiproc: number): Promise<Demanda[]> {
  const sql = `
    SELECT
      DET.CODUSU AS CODSETOR,
      USU.NOMEUSU AS SETOR,
      COM.CODPROD AS CODIGO,
      PRO.DESCRPROD,
      COM.QTD AS TEMPO_MIN,
      TO_CHAR(DET.DTINICIOPREV, 'YYYY-MM-DD') AS DT,
      DET.SEQ AS SEQCRONO
    FROM AD_CRONOGRAMA CRO
    JOIN TPRIPROC PROC ON PROC.AD_CODPROJ = CRO.CODPROJ
    JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
    JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ
    JOIN TSIUSU USU ON USU.CODUSU = DET.CODUSU
    JOIN AD_COMPONENTECRONO COM ON COM.SEQ = DET.SEQ AND COM.CODUSU = DET.CODUSU
    JOIN TGFPRO PRO ON PRO.CODPROD = COM.CODPRODSP
    WHERE PROC.IDIPROC = ${Number(idiproc)}
          AND NVL(COM.FEITO,'N') = 'N'
          AND  not COM.CODPROD IN (SELECT CODPROD
            FROM AD_DETALCRONOGRAMAFUNC
            WHERE SEQ = DET.SEQ )
    ORDER BY DET.CODUSU, COM.CODPROD
  `.trim();

  const rows = (await obterReg(sql)) as ErpRow[];
  const vistos = new Map<string, number>();
  return rows.map((r) => {
    const setor = txt(r.SETOR);
    const tempoMin = inteiro(r.TEMPO_MIN);
    const dt = txt(r.DT);
    const codprod = inteiro(r.CODIGO);
    const seq = inteiro(r.SEQCRONO);
    const codusu = inteiro(r.CODSETOR);
    // A mesma combinação pode repetir (componentes iguais no SEQ); o sufixo mantém a chave única.
    const base = `${seq}-${codusu}-${codprod}`;
    const n = vistos.get(base) ?? 0;
    vistos.set(base, n + 1);
    return {
      chave: n ? `${base}#${n}` : base,
      nome: `${txt(r.CODIGO)} - ${txt(r.DESCRPROD)}`,
      etapa: etapaDoSetor(setor),
      hhPrev: Math.round((tempoMin / 60) * 10) / 10,
      tempoMin,
      dtDemanda: dt,
      dtPlan: dt,
      dtPlanOriginal: dt,
      alocados: [],
      codusu,
      setor,
      codprod,
      seq,
    };
  });
}

/**
 * Colaboradores ativos cujo cargo atua em algum setor da OP. Os setores são os
 * das demandas pendentes MAIS os do que já está gravado — numa OP toda
 * planejada não sobra demanda, e sem isso a lista viria vazia.
 */
export async function getColaboradores(setoresDemandas: number[], idiproc: number): Promise<Colab[]> {
  const sqlColabs = (lista: string) => `
    SELECT
      FUN.CODFUNC,
      FUN.NOMEFUNC,
      CAR.DESCRCARGO,
      SE.CODUSU AS CODSETOR,
      SUP.NOMEUSU AS SUPERVISOR
    FROM TFPFUN FUN
    JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
    JOIN AD_SETORESCARGO SE ON SE.CODCARGO = CAR.CODCARGO
    LEFT JOIN TSIUSU SUP ON SUP.CODUSU = FUN.USUVPJSUP
    WHERE SE.CODUSU IN (${lista})
      AND TRUNC(FUN.DTADM) <= TRUNC(SYSDATE)
      AND (FUN.DTDEM IS NULL OR TRUNC(FUN.DTDEM) >= TRUNC(SYSDATE))
    ORDER BY FUN.NOMEFUNC
  `.trim();

  // Planejamento ERP desta OP, de qualquer colaborador.
  const sqlPlan = `
    SELECT
      F.CODFUNC,
      F.SEQ,
      F.CODUSU,
      TO_CHAR(F.DTPLANEJAMENTO, 'YYYY-MM-DD') AS DT,
      F.CODPROD,
      PRO.DESCRPROD,
      F.QTD,
      F.SEQUENCIA
    FROM AD_DETALCRONOGRAMAFUNC F
    LEFT JOIN TGFPRO PRO ON PRO.CODPROD = F.CODPROD
    WHERE F.CODPROD IS NOT NULL
      AND F.SEQ IN (
        SELECT CRO.SEQ
        FROM AD_CRONOGRAMA CRO
        JOIN TPRIPROC P ON P.AD_CODPROJ = CRO.CODPROJ
        WHERE P.IDIPROC = ${Number(idiproc)}
      )
  `.trim();

  const rowsPlan = (await obterReg(sqlPlan)) as ErpRow[];
  const lista = listaSql([...setoresDemandas, ...rowsPlan.map((r) => inteiro(r.CODUSU))].filter(Boolean));
  if (!lista) return [];
  const rowsColabs = await obterReg(sqlColabs(lista));

  const planPorFunc = new Map<number, ItemErp[]>();
  for (const r of rowsPlan) {
    const cod = inteiro(r.CODFUNC);
    if (!cod) continue;
    const arr = planPorFunc.get(cod) ?? [];
    arr.push({
      seq: inteiro(r.SEQ),
      dt: txt(r.DT),
      codprod: inteiro(r.CODPROD),
      descrprod: txt(r.DESCRPROD),
      qtd: inteiro(r.QTD),
      codusu: inteiro(r.CODUSU),
      sequencia: inteiro(r.SEQUENCIA),
    });
    planPorFunc.set(cod, arr);
  }

  const porFunc = new Map<number, Colab>();
  for (const r of rowsColabs as ErpRow[]) {
    const id = inteiro(r.CODFUNC);
    if (!id) continue;
    const setor = inteiro(r.CODSETOR);
    const atual = porFunc.get(id);
    if (atual) {
      if (setor && !atual.codSetores.includes(setor)) atual.codSetores.push(setor);
      continue;
    }
    porFunc.set(id, {
      id,
      nome: txt(r.NOMEFUNC),
      cargo: txt(r.DESCRCARGO) || "Colaborador",
      codSetores: setor ? [setor] : [],
      supervisor: txt(r.SUPERVISOR),
      atividadesERP: planPorFunc.get(id) ?? [],
    });
  }
  return [...porFunc.values()];
}

/** Minutos planejados em outras OPs, por colaborador × dia, no período. */
export async function getCargaExterna(
  codfuncs: number[],
  idiproc: number,
  ini: string,
  fim: string
): Promise<CargaExterna> {
  const mapa: CargaExterna = new Map();
  const lista = listaSql(codfuncs);
  if (!lista || !ini || !fim) return mapa;

  const sql = `
    SELECT
      F.CODFUNC,
      TO_CHAR(F.DTPLANEJAMENTO, 'YYYY-MM-DD') AS DT,
      SUM(F.QTD) AS MINUTOS
    FROM AD_DETALCRONOGRAMAFUNC F
    WHERE F.CODFUNC IN (${lista})
      AND TRUNC(F.DTPLANEJAMENTO) BETWEEN ${dataOracleIso(ini)} AND ${dataOracleIso(fim)}
      AND F.SEQ NOT IN (
        SELECT CRO.SEQ
        FROM AD_CRONOGRAMA CRO
        JOIN TPRIPROC P ON P.AD_CODPROJ = CRO.CODPROJ
        WHERE P.IDIPROC = ${Number(idiproc)}
      )
    GROUP BY F.CODFUNC, TO_CHAR(F.DTPLANEJAMENTO, 'YYYY-MM-DD')
  `.trim();

  for (const r of (await obterReg(sql)) as ErpRow[]) {
    const cod = inteiro(r.CODFUNC);
    const dt = txt(r.DT);
    if (!cod || !dt) continue;
    const dias = mapa.get(cod) ?? new Map<string, number>();
    dias.set(dt, (dias.get(dt) ?? 0) + inteiro(r.MINUTOS));
    mapa.set(cod, dias);
  }
  return mapa;
}

/* ── Gravação ────────────────────────────────────────────────── */

const toSankhyaDate = (ymd: string) => {
  const [y, m, d] = (ymd || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd;
};

export type FalhaGravacao = {
  chave: string;
  atividade: string;
  codfunc: number;
  mensagem: string;
};

export type ResultadoGravacao = {
  gravados: number;
  total: number;
  falhas: FalhaGravacao[];
  /** Demandas em que parte dos colaboradores gravou e parte falhou. */
  parciais: string[];
};

/**
 * Grava as alocações em AD_DETALCRONOGRAMAFUNC, um registro por colaborador.
 * Payload idêntico ao da versão anterior da página. Não para no primeiro erro.
 */
export async function salvarAlocacoes(
  demandas: Demanda[],
  onProgresso?: (feitos: number, total: number) => void
): Promise<ResultadoGravacao> {
  const itens = demandas.filter((d) => d.alocados.length && d.codprod && d.seq);
  const total = itens.reduce((s, d) => s + d.alocados.length, 0);
  const falhas: FalhaGravacao[] = [];
  const parciais: string[] = [];
  let feitos = 0;
  let gravados = 0;

  for (const d of itens) {
    const minutosPorColab = Math.round((d.hhPrev * 60) / (d.alocados.length || 1));
    let okNesta = 0;
    let falhaNesta = 0;

    for (const codfunc of d.alocados) {
      try {
        const resp = await api.post("/api/sankhya/dataset/save", {
          entity: "AD_DETALCRONOGRAMAFUNC",
          fields: ["SEQ", "CODFUNC", "CODUSU", "CODPROD", "DTPLANEJAMENTO", "QTD"],
          values: {
            "0": String(d.seq),
            "1": String(codfunc),
            "2": String(d.codusu),
            "3": String(d.codprod),
            "4": toSankhyaDate(d.dtPlan),
            "5": minutosPorColab,
          },
        });
        const parsed = parseDatasetSaveResponse(resp.data);
        if (parsed.ok) {
          gravados++;
          okNesta++;
        } else {
          falhaNesta++;
          falhas.push({ chave: d.chave, atividade: d.nome, codfunc, mensagem: parsed.resumo || parsed.human || parsed.title });
        }
      } catch (e: unknown) {
        falhaNesta++;
        falhas.push({ chave: d.chave, atividade: d.nome, codfunc, mensagem: mensagemErro(e, "Falha na gravação.") });
      } finally {
        feitos++;
        onProgresso?.(feitos, total);
      }
    }
    if (okNesta && falhaNesta) parciais.push(d.nome);
  }

  return { gravados, total, falhas, parciais };
}

/** Troca o colaborador de um item já planejado no ERP. Payload igual ao da página. */
export async function trocarColaboradorErp(item: ItemErp, novoCodfunc: number): Promise<void> {
  const resp = await api.post("/api/sankhya/dataset/save", {
    entity: "AD_DETALCRONOGRAMAFUNC",
    fields: ["SEQ", "CODFUNC", "CODPROD", "DTPLANEJAMENTO", "QTD"],
    values: {
      "0": String(item.seq),
      "1": String(novoCodfunc),
      "2": String(item.codprod),
      "3": toSankhyaDate(item.dt),
      "4": String(item.qtd),
    },
    pk: {
      SEQ: String(item.seq),
      CODUSU: String(item.codusu),
      SEQUENCIA: String(item.sequencia),
    },
  });
  const parsed = parseDatasetSaveResponse(resp.data);
  if (!parsed.ok) throw new Error(parsed.resumo || parsed.human || parsed.title);
}
