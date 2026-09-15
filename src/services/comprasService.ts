// src/services/comprasService.ts
// Cópia PARCIAL de painel-diretoria/src/services/comprasService.ts — só a Lista
// de Faltas (SQL, tipo, mapeador e getListaFaltas), linha a linha igual.
//
// Diferenças:
//  · ficaram de fora Ruptura por comprador e Frete inbound, que este painel não usa;
//  · a consulta ganhou a coluna LINHA (no fim do SELECT, para não deslocar as
//    posições do mapeamento por array) e os LEFT JOIN do cronograma que levam a
//    ela — F.SEQ → AD_CRONOGRAMA → projeto → projeto pai, o mesmo caminho da
//    consulta de faltas do Dashboard. São joins 1:1 por chave: não multiplicam
//    linhas. A tela agrupa as faltas por linha e barco com isso;
//  · `obterReg` vem de lib/obterReg, que não é genérico — as chamadas perderam o `<unknown>`.
//
// Lista de faltas: itens com saldo negativo no mês, com pedido de compra e data
// de entrega quando existem. Fonte: CND_ONE_LISTA_FALTA.
import { obterReg } from '../lib/obterReg';
import { sqlLinhaProduto } from '../lib/linhasProduto';

/* ── Lista de faltas ─────────────────────────────────────────────────────── */
/* Movida da página sem alterar um byte (fora a coluna LINHA — ver o cabeçalho). A lista exclui kits (CODCONFKIT = 0), uma
   lista fixa de produtos ignorados e itens com troca de produto pendente. `mes`
   é **1-indexado** e entra na SQL nas duas grafias que existem na base ('3' e '03'). */
function buildListaFaltasSql(ano: number, mes: number, sup: number | null = null): string {
  return `
SELECT
    VEN.APELIDO,
    PRO.CODPROD,
    PRO.DESCRPROD,
    PRO.AD_IMPORTADO,
    F.NROLOTE                               AS CHASSI,
    F.NECESSIDADE,
    F.SALDO_FINAL,
    F.DATAFIMPREV,


    PAR.CODPARC,
    PAR.NOMEPARC,
    NVL(CP.COMPRAPEND, 0)                   AS COMPRAPEND,
    TO_CHAR(MOT.DTPREVENT, 'DD/MM/YYYY')    AS DTENTRADAPED,
    TO_CHAR(DTP.DATA_ENTREGA, 'DD/MM/YYYY') AS DTENTREGAV,
    DTP.NUNOTAPED                           AS NROPEDCOMPRA,
    NULL                                    AS FOLLOW,
    NULL                                    AS MICROSETOR,
    GRU.NOMEGRUPO                           AS MACROSETOR,
    0                                       AS QTD_CONF,
    NULL                                    AS DTINCLUSAO,
    TO_CHAR(DET.DTINICIOPREV, 'DD/MM/YYYY') AS DTINICIOPREV,
    NULL                                    AS RESULT,
    ${sqlLinhaProduto('PAI', 'GRUL.DESCRGRUPOPROD')} AS LINHA
FROM CND_ONE_LISTA_FALTA F
JOIN  TGFPRO PRO
        ON PRO.CODPROD = F.CODPROD
LEFT JOIN AD_LISTADEFALTAMOT MOT
        ON MOT.CODPROD = F.CODPROD AND MOT.MES = F.MES AND MOT.CHASSI = F.NROLOTE
LEFT JOIN VW_NX_LISTAFALTA_DATAPREV DTP
        ON DTP.CODPROD = F.CODPROD AND DTP.NUNOTAFALT = F.NUNOTA AND DTP.IDIPROC = F.IDIPROC
LEFT JOIN (
    SELECT ITE.CODPROD, SUM(ITE.QTDNEG - ITE.QTDENTREGUE) AS COMPRAPEND
    FROM TGFCAB PEDI
    JOIN TGFITE ITE ON ITE.NUNOTA = PEDI.NUNOTA
    WHERE PEDI.TIPMOV = 'C'
      AND PEDI.STATUSNOTA IN ('A', 'P')
      AND PEDI.CODTIPOPER NOT IN (213, 212, 242, 220)
    GROUP BY ITE.CODPROD
) CP ON CP.CODPROD = F.CODPROD
LEFT JOIN TGFPAR PAR    ON PAR.CODPARC  = PRO.CODPARCFORN
LEFT JOIN TGFVEN VEN    ON VEN.CODVEND  = PAR.CODVEND

LEFT JOIN TGFCAB CAB    ON CAB.NUNOTA   = F.NUNOTA
LEFT JOIN TGFNAT NAT    ON NAT.CODNAT   = CAB.CODNAT
LEFT JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = F.SEQ AND DET.CODUSU = NAT.AD_SETOR
LEFT JOIN TSIUSU USU    ON USU.CODUSU   = DET.CODUSU
LEFT JOIN TSIGRU GRU    ON GRU.CODGRUPO = USU.CODGRUPO
LEFT JOIN AD_CRONOGRAMA CRO ON CRO.SEQ = F.SEQ
LEFT JOIN TCSPRJ PRJ    ON PRJ.CODPROJ  = CRO.CODPROJ
LEFT JOIN TCSPRJ PAI    ON PAI.CODPROJ  = PRJ.CODPROJPAI
LEFT JOIN TGFGRU GRUL   ON GRUL.CODGRUPOPROD = CRO.CODGRUPOPROD
WHERE F.SALDO_FINAL < 0
  AND F.ANO = TO_CHAR(${ano})
  AND F.MES IN (TO_CHAR(${mes}), LPAD(TO_CHAR(${mes}), 2, '0'))
  AND NOT F.DATAFIMPREV IS NULL${sup != null ? `
  AND PAI.AD_CODSUPERVISOR = ${Number(sup)}` : ''}
  AND NVL(PRO.CODCONFKIT, 0) = 0
  AND F.CODPROD NOT IN (
    21757, 1818, 19463, 2672, 5790, 2760, 4849, 18785, 16814, 20966, 1465,
    5642, 13357, 18784, 18731, 18210, 21118, 2555, 22308, 2580,
    10966, 21740, 1954, 328, 1414, 2680, 3038, 17775, 24491, 20123, 20081,
    9884, 18174, 19333, 1593, 1831, 14102, 19712, 5775, 21624, 14044,
    14037, 18211, 4772, 20346, 4967, 9587, 9588, 9589, 10190, 10191,
    14045, 18209, 21569, 21674, 4969, 21756, 13356, 13358, 13359, 13360,
    17867, 14038, 9858, 12256, 20968, 19533, 19534, 20122, 24386, 9532
  )
  /* ignora itens com troca de produto pendente (não realizada) */
  AND NOT EXISTS (
    SELECT 1
    FROM AD_TGFITETROCPROD TRC
    WHERE TRC.NUNOTA      = F.NUNOTA
      AND TRC.SEQUENCIA   = F.SEQUENCIA
      AND TRC.CODPRODORIG = F.CODPROD
      AND NVL(TRC.REALIZADO, 'N') = 'N'
  )

ORDER BY F.DATAFIMPREV, F.NROLOTE
`;
}

/* ── Tipos ───────────────────────────────────────────────────────────────── */

/** Uma linha = um item faltando para um chassi. `prod_kit` e `kit` vêm de uma
 *  versão anterior da consulta e hoje chegam sempre vazios — o tipo os mantém
 *  porque a tela ainda os referencia. */
export type FaltaDetalheRow = {
  prod_kit: string;
  kit: number | null;
  qtd_conf: number;
  dtinclusao: string;
  ad_importado: string;
  dtinicioprev: string;
  result: number | null;
  codparc: number;
  nomeparc: string;
  chassi: string;
  comprapend: number;
  dtentradaped: string;
  dtentregav: string;
  nropedcompra: number | null;
  follow: string;
  descrprod: string;
  apelido: string;
  microsetor: string;
  macrosetor: string;
  codprod: number;
  necessidade: number;
  saldo_final: number;
  datafimprev: string;
  /** "NX 500"…; vazio quando a falta não tem cronograma que leve a uma linha. */
  linha: string;
};

/* ── Mapeadores ──────────────────────────────────────────────────────────── */
/** Ordem das colunas do SELECT, usada quando o backend devolve linhas como array. */
const COLS_FALTA = [
  'APELIDO', 'CODPROD', 'DESCRPROD', 'AD_IMPORTADO', 'CHASSI', 'NECESSIDADE',
  'SALDO_FINAL', 'DATAFIMPREV', 'CODPARC', 'NOMEPARC', 'COMPRAPEND', 'DTENTRADAPED',
  'DTENTREGAV', 'NROPEDCOMPRA', 'FOLLOW', 'MICROSETOR', 'MACROSETOR', 'QTD_CONF',
  'DTINCLUSAO', 'DTINICIOPREV', 'RESULT', 'LINHA',
] as const;

const n = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
const s = (v: unknown) => (v == null ? '' : String(v));

/** Aceita linha em objeto (chave em qualquer caixa) ou array na ordem do SELECT. */
function getter(r: unknown, cols: readonly string[]) {
  const o: Record<string, unknown> = Array.isArray(r)
    ? Object.fromEntries(cols.map((c, i) => [c, r[i]]))
    : (r as Record<string, unknown>);
  return (k: string) => o[k] ?? o[k.toUpperCase()] ?? o[k.toLowerCase()];
}

function mapFaltaDetalhe(r: unknown): FaltaDetalheRow {
  const get = getter(r, COLS_FALTA);
  const kitRaw = get('KIT');
  const nropedRaw = get('NROPEDCOMPRA');
  const resultRaw = get('RESULT');
  return {
    prod_kit:     s(get('PROD_KIT')),
    kit:          kitRaw != null && kitRaw !== '' ? n(kitRaw) : null,
    qtd_conf:     n(get('QTD_CONF')),
    dtinclusao:   s(get('DTINCLUSAO')),
    ad_importado: s(get('AD_IMPORTADO')),
    dtinicioprev: s(get('DTINICIOPREV')),
    result:       resultRaw != null && resultRaw !== '' ? n(resultRaw) : null,
    codparc:      n(get('CODPARC')),
    nomeparc:     s(get('NOMEPARC')),
    chassi:       s(get('CHASSI')) || s(get('NROLOTE')),
    comprapend:   n(get('COMPRAPEND')),
    dtentradaped: s(get('DTENTRADAPED')),
    dtentregav:   s(get('DTENTREGAV')),
    nropedcompra: nropedRaw != null && nropedRaw !== '' ? n(nropedRaw) : null,
    follow:       s(get('FOLLOW')),
    descrprod:    s(get('DESCRPROD')),
    apelido:      s(get('APELIDO')),
    microsetor:   s(get('MICROSETOR')),
    macrosetor:   s(get('MACROSETOR')),
    codprod:      n(get('CODPROD')),
    // 2 casas: a necessidade vem do Oracle com ruído de ponto flutuante
    necessidade:  Number(n(get('NECESSIDADE')).toFixed(2)),
    saldo_final:  n(get('SALDO_FINAL')),
    datafimprev:  s(get('DATAFIMPREV')),
    linha:        s(get('LINHA')),
  };
}

/* ── API pública ─────────────────────────────────────────────────────────── */

/**
 * Itens em falta do mês, um por par produto × chassi.
 *
 * @param ano ano com 4 dígitos.
 * @param mes mês **1-indexado** (1 = janeiro).
 * @param sup só barcos cujo projeto pai tem este supervisor (AD_CODSUPERVISOR) —
 *   usado pelo Dashboard; sem ele o SQL é o da diretoria.
 */
export async function getListaFaltas(ano: number, mes: number, sup: number | null = null): Promise<FaltaDetalheRow[]> {
  const rows = await obterReg(buildListaFaltasSql(ano, mes, sup), { pageSize: 5000, maxPages: 10 });
  return rows.map(mapFaltaDetalhe);
}
