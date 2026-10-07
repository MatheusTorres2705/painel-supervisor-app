// src/services/opeService.ts
// Camada de dados do Detalhamento OPE: SQL de atividades (AD_COMPONENTECRONO/AD_APOAVANCO),
// SQL de ponto (AD_BATPONTO) e as derivações usadas pela tela.
//
// Cópia do painel-diretoria no commit a8973ac7 (setor pelo TSIGRU, galpão
// pelo TPRPLP, realocação de Componentes/Pintura/Mecânica/Elétrica Chicotes e
// a auditoria de quem não bateu ponto), mais o EMPRÉSTIMO DE COLABORADOR
// (AD_EMPRESTFUN), aplicado nos dois painéis pelo mesmo script para a SQL do
// ponto sair igual. Diferenças em relação à cópia:
//  1. obterReg mora em lib/obterReg e não é genérico (import e chamadas sem <T>).
//  2. buildSqlAtivDetalhe USA `apenasRetrabalho` na SQL — lá o parâmetro é
//     recebido e ignorado. A aba Perdas da auditoria depende dele.
//  3. Exportados para a Daily, que cruza o OPE com o avanço e o absenteísmo no
//     mesmo recorte e precisa da MESMA regra, não de uma cópia dela:
//      - `codPlpEfetivo` e `ehGalpaoDestino` — a realocação em TypeScript, da
//        mesma tabela `REALOCACAO_GALPAO` que monta o CASE da SQL (o avanço vem
//        do MNO, que não realoca);
//      - `SQL_CTE_GALPAO` e `SQL_CTE_DEP_SETOR` — o setor e o galpão do
//        colaborador, para o absenteísmo da Daily contar o mesmo universo do
//        ponto do OPE;
//      - `sqlCteEmprestimo` — os empréstimos aprovados da janela, pelo mesmo
//        filtro do ponto, para a falta num dia emprestado ir para o destino.
//  4. A expressão ANTIGA de linha do departamento (AD_DEPLINHA.CODPROJPAI) não
//     mora mais aqui: o Absenteísmo e o quadro de pessoas da Meta de Produção,
//     que continuam na base antiga, a importam de services/depLinhaLegado.
import { obterReg } from '../lib/obterReg';

/* ── Helpers de data ───────────────────────────────────────── */
function oracleInicio(s: string) { return `TO_DATE('${s} 00:00:00', 'DD/MM/YYYY HH24:MI:SS')`; }
function oracleFim(s: string)    { return `TO_DATE('${s} 23:59:59', 'DD/MM/YYYY HH24:MI:SS')`; }
function oracleData(s: string)   { return `TO_DATE('${s}', 'DD/MM/YYYY')`; }

function parseDDMMYYYY(s: string): number {
  const [d, m, y] = s.split('/').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/* ── Setores de produção ───────────────────────────────────
   O setor é um grupo de usuário do TSIGRU marcado como setor de produção
   (AD_SETORPRODUCAO = 'S') e ativo (ATIVO = 'S'). A lista NÃO é fixa no
   código: vem do banco, e a tela agrupa pelo NOMEGRUPO de cada grupo. Grupo
   novo marcado como produção aparece sozinho; grupo desativado some.

   Os dois lados do OPE chegam ao grupo por caminhos diferentes:
     Ponto       — departamento do funcionário: TFPDEP.AD_CODGRUPO
                   (substitui AD_DEPSETOR → TSIUSU → TSIGRU)
     Atividades  — grupo do usuário-setor que apontou: TSIUSU.CODGRUPO
   A linha (modelo) do ponto continua vindo de AD_DEPMODELO — ver
   `SQL_LINHA_DO_PONTO`.

   O filtro é o mesmo nos dois lados e na lista de grupos: se divergisse, um
   setor poderia ter hora de ponto sem linha na tabela, ou o contrário.

   Mexer aqui muda o OPE publicado. */
const SQL_FILTRO_GRUPO_PROD = `G.AD_SETORPRODUCAO = 'S' AND G.ATIVO = 'S'`;

export type GrupoProducao = { codGrupo: string; nome: string };

/** CODGRUPO seguro para interpolar no SQL: sempre inteiro. */
function sqlCodGrupo(cod: string): number {
  const n = Number(cod);
  if (!Number.isInteger(n)) throw new Error(`CODGRUPO inválido: ${cod}`);
  return n;
}

let gruposCache: Promise<GrupoProducao[]> | null = null;

/**
 * Setores de produção ativos, na ordem de exibição (por nome).
 *
 * Cacheado na sessão: o cadastro muda raramente e a carga do OPE pede a lista
 * toda vez. Se a consulta falhar, o cache é descartado para a próxima tentativa.
 */
export function getGruposProducao(): Promise<GrupoProducao[]> {
  if (!gruposCache) {
    gruposCache = obterReg(`
SELECT G.CODGRUPO, G.NOMEGRUPO
FROM TSIGRU G
WHERE ${SQL_FILTRO_GRUPO_PROD}
ORDER BY G.NOMEGRUPO
`.trim())
      .then(rows => rows.map(r => {
        const o: Record<string, unknown> = Array.isArray(r)
          ? { CODGRUPO: r[0], NOMEGRUPO: r[1] }
          : (r as Record<string, unknown>);
        return {
          codGrupo: String(o['CODGRUPO']  ?? o['codgrupo']  ?? ''),
          nome:     String(o['NOMEGRUPO'] ?? o['nomegrupo'] ?? '').trim(),
        };
      }))
      .catch(e => { gruposCache = null; throw e; });
  }
  return gruposCache;
}

/* Atividades: grupo do usuário-setor que apontou. Uma linha por CODUSU — o
   join não multiplica horas. Usuário fora dos grupos de produção fica de fora. */
const SQL_CTE_SETOR_MACRO = `SETOR_MACRO AS (
  SELECT U.CODUSU, G.CODGRUPO, TRIM(G.NOMEGRUPO) AS SETORMACRO
  FROM TSIUSU U
    JOIN TSIGRU G ON G.CODGRUPO = U.CODGRUPO
  WHERE ${SQL_FILTRO_GRUPO_PROD}
)`;

/* ── Realocação de galpão por setor ──────────────────────────
   Exceção de cadastro: COMPONENTES, PINTURA, MECANICA e ELÉTRICA (CHICOTES)
   trabalham em galpões próprios,
   mas os departamentos (AD_CODPLP) e os modelos dos barcos (TGFGRU.AD_CODPLP)
   os deixam nos galpões 2, 3 e 4. Aqui o que é desses setores nesses galpões
   é levado para o galpão certo.

   Vale para os dois lados do OPE (ponto e atividades) e para os detalhes,
   porque é aplicado no SQL, no próprio código do galpão — a tela só enxerga
   o galpão já corrigido. */
const REALOCACAO_GALPAO: readonly { codGrupo: number; de: readonly number[]; para: number }[] = [
  { codGrupo: 31, de: [2, 3, 4], para: 5 },   // COMPONENTES → GALPAO COMPONENTE
  { codGrupo: 24, de: [2, 3, 4], para: 7 },   // PINTURA     → GALPAO PINTURA
  { codGrupo: 33, de: [2, 3, 4], para: 6 },   // MECANICA    → GALPAO MECANICA
  { codGrupo: 30, de: [2, 3, 4], para: 6 },   // ELÉTRICA (CHICOTES) → GALPAO MECANICA
];

/**
 * Setores que fazem sentido num galpão, para a TELA (não muda nenhuma conta).
 *
 * Galpão que é destino de realocação (5, 6, 7) mostra só os setores levados para
 * ele; galpão de origem (2, 3, 4) deixa de mostrar esses setores. Os demais
 * mostram todos. `null` (Geral) mostra todos.
 */
export function gruposDoGalpao(codPlp: string | null, grupos: GrupoProducao[]): GrupoProducao[] {
  if (codPlp == null) return grupos;
  const plp = Number(codPlp);
  const destino = REALOCACAO_GALPAO.filter(r => r.para === plp).map(r => r.codGrupo);
  if (destino.length) return grupos.filter(g => destino.includes(Number(g.codGrupo)));
  const saem = REALOCACAO_GALPAO.filter(r => r.de.includes(plp)).map(r => r.codGrupo);
  return grupos.filter(g => !saem.includes(Number(g.codGrupo)));
}

/**
 * A mesma realocação, em TypeScript, para dado que chega SEM ela.
 *
 * O avanço da Daily vem do realizado do MNO, que não realoca: sem isto, o
 * Galpão Componente mostraria as horas de Componentes no OPE e zero no avanço.
 * Sai da mesma `REALOCACAO_GALPAO` do CASE abaixo — mudar uma muda a outra.
 */
export function codPlpEfetivo(codPlp: string, codGrupo: string): string {
  const plp = Number(codPlp);
  const grupo = Number(codGrupo);
  const r = REALOCACAO_GALPAO.find(x => x.codGrupo === grupo && x.de.includes(plp));
  return r ? String(r.para) : codPlp;
}

/** O galpão recebe um setor inteiro por realocação (5, 6, 7)? */
export function ehGalpaoDestino(codPlp: string | null): boolean {
  return codPlp != null && REALOCACAO_GALPAO.some(r => r.para === Number(codPlp));
}

/** Código do galpão já com a realocação por setor aplicada. */
function sqlCodPlpEfetivo(codPlp: string, codGrupo: string): string {
  const casos = REALOCACAO_GALPAO
    .map(r => `WHEN ${codGrupo} = ${r.codGrupo} AND ${codPlp} IN (${r.de.join(', ')}) THEN ${r.para}`)
    .join(' ');
  return `CASE ${casos} ELSE ${codPlp} END`;
}

/* Ponto: o setor do departamento é TFPDEP.AD_CODGRUPO. É um campo só por
   departamento, então cada colaborador conta 8h em um setor só — o MIN que
   existia para AD_DEPSETOR (que admitia vários usuários por departamento) não
   é mais necessário. Departamento sem AD_CODGRUPO, ou ligado a grupo que não é
   de produção, fica fora do ponto. */
export const SQL_CTE_DEP_SETOR = `DEP_SETOR AS (
  SELECT D.CODDEP, ${sqlCodPlpEfetivo('D.AD_CODPLP', 'G.CODGRUPO')} AS CODPLP, G.CODGRUPO, TRIM(G.NOMEGRUPO) AS SETORMACRO
  FROM TFPDEP D
    JOIN TSIGRU G ON G.CODGRUPO = D.AD_CODGRUPO
  WHERE ${SQL_FILTRO_GRUPO_PROD}
)`;

/* ── Galpões ────────────────────────────────────────────────
   Galpão = linha de produção do TPRPLP da empresa 1, exceto o CODPLP 1. A
   lista vem do banco e a tela mostra o NOME de cada um — não há mais lotação
   de linha → galpão fixa no código.

   Os dois lados do OPE chegam ao galpão por caminhos diferentes:
     Ponto       — departamento do funcionário: TFPDEP.AD_CODPLP
     Atividades  — o barco não tem departamento; o galpão sai do modelo dele:
                   projeto-pai (TCSPRJ.AD_CODGRUPOPROD) → TGFGRU.AD_CODPLP,
                   o mesmo caminho do realizado do MNO.

   Só entra no OPE o que cai num galpão da lista: departamento sem AD_CODPLP
   (ou com o CODPLP 1) fica fora do ponto, e barco cujo modelo não tem galpão
   fica fora das atividades. A linha (NX260…) continua em cada registro, mas
   agora só serve para o filtro de maturação e para o detalhe. */
const SQL_FILTRO_GALPAO = `PLA.CODEMP = 1 AND PLA.CODPLP <> 1`;

export const SQL_CTE_GALPAO = `GALPAO AS (
  SELECT PLA.CODPLP, TRIM(PLA.NOME) AS GALPAO
  FROM TPRPLP PLA
  WHERE ${SQL_FILTRO_GALPAO}
)`;

export type GalpaoOpe = { codPlp: string; nome: string };

function sqlCodPlp(cod: string): number {
  const n = Number(cod);
  if (!Number.isInteger(n)) throw new Error(`CODPLP inválido: ${cod}`);
  return n;
}

function sqlListaTexto(xs: readonly string[]): string {
  return xs.map(x => `'${x.replace(/'/g, "''")}'`).join(',');
}

let galpoesCache: Promise<GalpaoOpe[]> | null = null;

/** Galpões na ordem do CODPLP. Cacheado na sessão, como os setores. */
export function getGalpoes(): Promise<GalpaoOpe[]> {
  if (!galpoesCache) {
    galpoesCache = obterReg(`
SELECT PLA.CODPLP, PLA.NOME
FROM TPRPLP PLA
WHERE ${SQL_FILTRO_GALPAO}
ORDER BY PLA.CODPLP
`.trim())
      .then(rows => rows.map(r => {
        const o: Record<string, unknown> = Array.isArray(r)
          ? { CODPLP: r[0], NOME: r[1] }
          : (r as Record<string, unknown>);
        return {
          codPlp: String(o['CODPLP'] ?? o['codplp'] ?? ''),
          nome:   String(o['NOME']   ?? o['nome']   ?? '').trim(),
        };
      }))
      .catch(e => { galpoesCache = null; throw e; });
  }
  return galpoesCache;
}

/**
 * Recorte de um detalhe: galpão, setor e linhas a tirar (maturação).
 * Campo ausente/nulo = sem filtro.
 */
export type RecorteOpe = {
  codPlp?: string | null;
  setor?: string | null;
  excluirLinhas?: readonly string[];
};

/* ── Tipos de linha bruta ──────────────────────────────────── */
export type RawAtivRow  = { linha: string; data: string; codPlp: string; galpao: string; codGrupo: string; setorMacro: string; horas: number; qtdAtiv: number; horasRetrabalho: number; qtdRetrabalho: number };
export type RawPontoRow = { linha: string; data: string; codPlp: string; galpao: string; codGrupo: string; setorMacro: string; qtdPonto: number; horasPonto: number; horasExtras: number };
export type DailyPoint  = { data: string; ope: number };
/** `codGrupo` só existe na agregação por setor (`agregar`); a por galpão não tem. */
export type AggRow      = { label: string; codGrupo?: string; horas: number; horasReg: number; horasExtras: number; qtdAtiv: number; qtdPonto: number; horasRetrabalho: number; qtdRetrabalho: number };

/* ── Agregação ─────────────────────────────────────────────── */
type Acc = { horas: number; qtdAtiv: number; horasPonto: number; horasExtras: number; qtdPonto: number; horasRetrabalho: number; qtdRetrabalho: number };
const accVazio = (): Acc => ({ horas: 0, qtdAtiv: 0, horasPonto: 0, horasExtras: 0, qtdPonto: 0, horasRetrabalho: 0, qtdRetrabalho: 0 });

/**
 * Soma por setor (grupo de produção do TSIGRU).
 *
 * `grupos` fixa as linhas e a ordem: todo setor aparece, mesmo zerado, e as
 * tabelas de galpões diferentes ficam alinhadas. Sem `grupos` (quem só quer o
 * total), os setores saem dos próprios dados. Um código presente nos dados e
 * ausente de `grupos` entra no fim, em vez de sumir da conta.
 */
export function agregar(
  ativos: RawAtivRow[],
  pontos: RawPontoRow[],
  /** Recorte do escopo (galpão, maturação). Recebe o registro inteiro. */
  filtro: (r: { linha: string; codPlp: string }) => boolean,
  grupos?: GrupoProducao[],
): AggRow[] {
  const nomes = new Map<string, string>();
  for (const g of grupos ?? []) nomes.set(g.codGrupo, g.nome);
  const acc = new Map<string, Acc>();
  const de = (cod: string, nome: string): Acc => {
    if (!nomes.has(cod)) nomes.set(cod, nome || cod);
    let a = acc.get(cod);
    if (!a) { a = accVazio(); acc.set(cod, a); }
    return a;
  };
  for (const r of ativos) {
    if (!filtro(r) || !r.codGrupo) continue;
    const a = de(r.codGrupo, r.setorMacro);
    a.horas           += r.horas;
    a.qtdAtiv         += r.qtdAtiv;
    a.horasRetrabalho += r.horasRetrabalho;
    a.qtdRetrabalho   += r.qtdRetrabalho;
  }
  for (const p of pontos) {
    if (!filtro(p) || !p.codGrupo) continue;
    const a = de(p.codGrupo, p.setorMacro);
    a.horasPonto  += p.horasPonto;
    a.horasExtras += p.horasExtras;
    a.qtdPonto    += p.qtdPonto;
  }
  const ordem  = (grupos ?? []).map(g => g.codGrupo);
  const extras = [...nomes.keys()]
    .filter(c => !ordem.includes(c))
    .sort((x, y) => (nomes.get(x) ?? '').localeCompare(nomes.get(y) ?? '', 'pt-BR'));
  return [...ordem, ...extras].map(cod => {
    const a = acc.get(cod) ?? accVazio();
    return {
      label:           nomes.get(cod) ?? cod,
      codGrupo:        cod,
      horas:           a.horas,
      horasReg:        a.horasPonto,
      horasExtras:     a.horasExtras,
      qtdAtiv:         a.qtdAtiv,
      qtdPonto:        a.qtdPonto,
      horasRetrabalho: a.horasRetrabalho,
      qtdRetrabalho:   a.qtdRetrabalho,
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

/* ── Base das atividades ───────────────────────────────────
   Uma só TAB_BASE para o agregado e para o detalhe — inclusive o RN = 1, que
   remove apontamentos repetidos —, para que a soma do detalhe feche com o card.
   O galpão vem do modelo do barco (ver "Galpões" acima). */
function sqlBaseAtividades(ini: string, fim: string): string {
  return `TAB_APO AS (
  SELECT APO.*
  FROM AD_CRONOGRAMA CRO
    LEFT JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
    LEFT JOIN AD_APOAVANCO APO ON (APO.SEQ = DET.SEQ AND APO.CODUSU = DET.CODUSU)
    INNER JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ
    INNER JOIN TSIUSU USU ON USU.CODUSU = APO.CODUSU
  WHERE APO.DATA BETWEEN ${oracleInicio(ini)} AND ${oracleFim(fim)}
),
TAB_BASE AS (
  SELECT
    SUBSTR(PRJ.IDENTIFICACAO, 1, 5) AS LINHA,
    PRJ.IDENTIFICACAO               AS PROJETO,
    GP.AD_CODPLP                    AS CODPLP,
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
      ORDER BY NULL
    ) AS RN
  FROM AD_COMPONENTECRONO COMP
    LEFT JOIN TAB_APO APO
      ON APO.SEQ = COMP.SEQ AND APO.CODUSU = COMP.CODUSU AND APO.CODPRODSP = COMP.CODPRODSP
    LEFT JOIN TGFPRO PRO        ON PRO.CODPROD      = COMP.CODPRODSP
    LEFT JOIN TSIUSU USU        ON USU.CODUSU       = COMP.CODUSU
    LEFT JOIN AD_CRONOGRAMA CRO ON CRO.SEQ          = COMP.SEQ
    LEFT JOIN TCSPRJ PRJ        ON PRJ.CODPROJ      = CRO.CODPROJ
    LEFT JOIN TCSPRJ PAI        ON PAI.CODPROJ      = PRJ.CODPROJPAI
    LEFT JOIN TGFGRU GP         ON GP.CODGRUPOPROD  = PAI.AD_CODGRUPOPROD
  WHERE APO.DATA IS NOT NULL
)`;
}

/* Filtros opcionais do recorte, sobre TAB_BASE (TB), SETOR_MACRO (SM) e GALPAO (GL). */
function sqlFiltrosAtiv(r: RecorteOpe): string {
  const f: string[] = [];
  if (r.setor)  f.push(`AND SM.CODGRUPO = ${sqlCodGrupo(r.setor)}`);
  if (r.codPlp) f.push(`AND GL.CODPLP = ${sqlCodPlp(r.codPlp)}`);
  if (r.excluirLinhas?.length) f.push(`AND NVL(TB.LINHA, '-') NOT IN (${sqlListaTexto(r.excluirLinhas)})`);
  return f.map(x => `    ${x}`).join('\n');
}

/* ── SQL Atividades ────────────────────────────────────────── */
function buildSqlAtividades(ini: string, fim: string, codGrupo: string): string {
  return `
WITH
${SQL_CTE_GALPAO},
${sqlBaseAtividades(ini, fim)},
${SQL_CTE_SETOR_MACRO}
SELECT
  TB.LINHA,
  TO_CHAR(TRUNC(TB.DATA_EXECUCAO), 'DD/MM/YYYY') AS DATA,
  GL.CODPLP,
  GL.GALPAO,
  SM.CODGRUPO,
  SM.SETORMACRO,
  COUNT(CASE WHEN TB.RETRABALHO IS NULL     THEN 1 END)                                    AS QTD_REGISTROS,
  ROUND(SUM(CASE WHEN TB.RETRABALHO IS NULL     THEN TB.DURACAO ELSE 0 END) / 60, 2)      AS HORAS,
  COUNT(CASE WHEN TB.RETRABALHO IS NOT NULL THEN 1 END)                                    AS QTD_RETRABALHO,
  ROUND(SUM(CASE WHEN TB.RETRABALHO IS NOT NULL THEN TB.DURACAO ELSE 0 END) / 60, 2)      AS HORAS_RETRABALHO
FROM TAB_BASE TB
  JOIN SETOR_MACRO SM ON SM.CODUSU = TB.COD_SETOR
  JOIN GALPAO GL      ON GL.CODPLP = ${sqlCodPlpEfetivo('TB.CODPLP', 'SM.CODGRUPO')}
WHERE TB.RN = 1
  AND SM.CODGRUPO = ${sqlCodGrupo(codGrupo)}
GROUP BY TB.LINHA, TRUNC(TB.DATA_EXECUCAO), GL.CODPLP, GL.GALPAO, SM.CODGRUPO, SM.SETORMACRO
ORDER BY TRUNC(TB.DATA_EXECUCAO), GL.CODPLP, TB.LINHA
`.trim();
}

/**
 * A linha do PONTO sai do departamento do funcionário, não do barco.
 *
 * Os dois lados do OPE nomeiam a linha por caminhos diferentes: a atividade
 * pega `SUBSTR(TCSPRJ.IDENTIFICACAO,1,5)` — o chassi, que já vem "NX620" — e o
 * ponto deriva de `AD_DEPMODELO.CODPROJ` (antes `AD_DEPLINHA.CODPROJPAI`), o
 * projeto-pai (modelo) ligado ao departamento. Os
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
const SQL_LINHA_DO_PONTO = `'NX' || CASE SUBSTR(DM.CODPROJ, 3, 3)
                                      WHEN '480' THEN '500'
                                      WHEN '600' THEN '620'
                                      ELSE SUBSTR(DM.CODPROJ, 3, 3)
                                 END`;

/* Linha de cada departamento, pelo AD_DEPMODELO. Uma por departamento (MIN),
   para o join não multiplicar registros de ponto. Departamento sem modelo fica
   com linha nula — continua no OPE (o galpão vem do AD_CODPLP), só não é
   alcançado pelo filtro de maturação. */
const SQL_CTE_DEP_LINHA = `DEP_LINHA AS (
  SELECT DM.CODDEP, MIN(${SQL_LINHA_DO_PONTO}) AS LINHA
  FROM AD_DEPMODELO DM
  GROUP BY DM.CODDEP
)`;

/* A hora extra vem de AD_VAPUPONTO agregada por (CODFUNC, dia) — mesma
   granularidade do ponto, então o join não cria nem duplica registro. */
function sqlHoraExtra(ini: string, fim: string): string {
  return `(
      SELECT CODFUNC, TRUNC(DTREF) AS DT, SUM(VALORMIN) / 60 AS HORAS
      FROM AD_VAPUPONTO
      WHERE TRUNC(DTREF) BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
      GROUP BY CODFUNC, TRUNC(DTREF)
    )`;
}

/* ── Empréstimo de colaborador ───────────────────────────────
   A produção empresta gente de um setor a outro por alguns dias. As
   ATIVIDADES do emprestado já caem no setor que o recebeu (vêm do grupo de
   quem apontou); o PONTO, não — sai do departamento de casa. Sem considerar o
   empréstimo, o setor que recebe ganha atividade sem a hora paga (OPE inflado)
   e o que cede fica com a hora paga sem atividade (OPE derrubado).

   AD_EMPRESTFUN guarda o empréstimo (colaborador, departamento de destino,
   período, STATUS). Nos dias de um empréstimo APROVADO, o ponto conta no
   departamento de destino — com o setor, o galpão e a linha dele.

   A tabela é criada à mão no Sankhya. Até ela existir, a SQL do OPE fica
   exatamente a de antes: `emprestimoDisponivel` confere o dicionário uma vez
   por sessão. Sem isso, publicar o painel antes de criar a tabela derrubaria
   o OPE inteiro com ORA-00942. */
const COLUNAS_EMPRESTIMO = ['CODEMPREST', 'CODEMP', 'CODFUNC', 'CODDEPDEST', 'DTINI', 'DTFIM', 'STATUS'] as const;

let emprestimoCache: Promise<boolean> | null = null;

/**
 * A AD_EMPRESTFUN existe, com as colunas que a conta usa?
 *
 * Confere coluna a coluna (e não só a tabela): uma tabela criada com um nome
 * de campo diferente quebraria a SQL do OPE com ORA-00904. Falha da própria
 * consulta = "não disponível" nesta carga, e o cache é descartado para tentar
 * de novo na próxima.
 */
export function emprestimoDisponivel(): Promise<boolean> {
  if (!emprestimoCache) {
    emprestimoCache = obterReg(`
SELECT COUNT(DISTINCT COLUMN_NAME) AS QTD
FROM ALL_TAB_COLUMNS
WHERE TABLE_NAME = 'AD_EMPRESTFUN'
  AND COLUMN_NAME IN (${COLUNAS_EMPRESTIMO.map(c => `'${c}'`).join(', ')})
`.trim())
      .then(rows => Number(rows[0]?.['QTD'] ?? rows[0]?.['qtd'] ?? 0) === COLUNAS_EMPRESTIMO.length)
      .catch(() => { emprestimoCache = null; return false; });
  }
  return emprestimoCache;
}

/* Empréstimos APROVADOS que tocam a janela. Pequena: a busca por dia, abaixo,
   roda contra ela e não contra a tabela inteira. */
export function sqlCteEmprestimo(ini: string, fim: string): string {
  return `EMP_APROV AS (
  SELECT E.CODEMPREST, E.CODEMP, E.CODFUNC, E.CODDEPDEST,
         TRUNC(E.DTINI) AS DTINI, TRUNC(E.DTFIM) AS DTFIM
  FROM AD_EMPRESTFUN E
  WHERE E.STATUS = 'A'
    AND TRUNC(E.DTINI) <= ${oracleData(fim)}
    AND TRUNC(E.DTFIM) >= ${oracleData(ini)}
)`;
}

/**
 * Departamento que conta para o colaborador `fun` no dia `dia`: o destino do
 * empréstimo aprovado que cobre o dia, ou o de casa.
 *
 * Subconsulta escalar, e não JOIN: devolve SEMPRE um departamento. Se dois
 * empréstimos aprovados cobrirem o mesmo dia (o app impede, mas o banco não),
 * vale o mais recente — com JOIN, o ponto do dia contaria em dobro.
 */
function sqlDepEfetivo(fun: string, dia: string, comEmprestimo: boolean): string {
  if (!comEmprestimo) return `${fun}.CODDEP`;
  return `NVL((SELECT MAX(E.CODDEPDEST) KEEP (DENSE_RANK LAST ORDER BY E.CODEMPREST)
           FROM EMP_APROV E
          WHERE E.CODEMP  = ${fun}.CODEMP
            AND E.CODFUNC = ${fun}.CODFUNC
            AND ${dia} BETWEEN E.DTINI AND E.DTFIM), ${fun}.CODDEP)`;
}

/* ── SQL Ponto ───────────────────────────────────────────────
   HORAS_EXTRAS anda junto com as horas de ponto de proposito: assim o card da
   pagina herda exatamente os mesmos filtros (escopo, setor, maturacao) que
   "Horas de ponto", sem uma segunda consulta que possa divergir do recorte.
   O MAX() na subconsulta e so para escolher o unico valor de HE daquele
   funcionario naquele dia.                                                  */
function buildSqlPonto(ini: string, fim: string, codGrupo: string, comEmprestimo = false): string {
  /* A batida entra pelo departamento EFETIVO do dia (o de casa, ou o destino
     de um empréstimo aprovado), calculado numa visão antes dos joins. Sem
     empréstimo, CODDEP_EF é o próprio FUN.CODDEP e a conta é a de antes. */
  return `
WITH
${SQL_CTE_GALPAO},
${SQL_CTE_DEP_SETOR},
${SQL_CTE_DEP_LINHA}${comEmprestimo ? `,\n${sqlCteEmprestimo(ini, fim)}` : ''}
SELECT LINHA, DATA, CODPLP, GALPAO, CODGRUPO, SETORMACRO,
  COUNT(*)          AS QTD_REGISTROS,
  COUNT(*) * 8      AS HORAS_PONTO,
  SUM(HE_HORAS)     AS HORAS_EXTRAS
FROM (
  SELECT
    PB.CODFUNC,
    TO_CHAR(PB.DTPONTO, 'DD/MM/YYYY') AS DATA,
    DL.LINHA,
    GL.CODPLP,
    GL.GALPAO,
    DSE.CODGRUPO,
    DSE.SETORMACRO,
    MAX(NVL(HE.HORAS, 0)) AS HE_HORAS
  FROM (
    SELECT PON.CODFUNC, PON.DTPONTO,
           ${sqlDepEfetivo('FUN', 'TRUNC(PON.DTPONTO)', comEmprestimo)} AS CODDEP_EF
    FROM AD_BATPONTO PON
      JOIN TFPEQP EQ  ON EQ.CODEQP   = PON.CODEQP
      JOIN TFPFUN FUN ON FUN.CODFUNC = PON.CODFUNC
    WHERE PON.DTPONTO BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
      AND EQ.AD_USADO = '1'
  ) PB
    JOIN DEP_SETOR DSE     ON DSE.CODDEP = PB.CODDEP_EF
    JOIN GALPAO GL         ON GL.CODPLP  = DSE.CODPLP
    LEFT JOIN DEP_LINHA DL ON DL.CODDEP  = PB.CODDEP_EF
    LEFT JOIN ${sqlHoraExtra(ini, fim)} HE ON HE.CODFUNC = PB.CODFUNC AND HE.DT = TRUNC(PB.DTPONTO)
  WHERE DSE.CODGRUPO = ${sqlCodGrupo(codGrupo)}
  GROUP BY PB.CODFUNC, PB.DTPONTO, DL.LINHA, GL.CODPLP, GL.GALPAO, DSE.CODGRUPO, DSE.SETORMACRO
)
GROUP BY LINHA, DATA, CODPLP, GALPAO, CODGRUPO, SETORMACRO
ORDER BY DATA, CODPLP, LINHA
`.trim();
}

/* ── SQL Ponto Detalhe ───────────────────────────────────────
   Duas partes, empilhadas por UNION ALL:

   PONTO      — quem bateu ponto no recorte. Mesmos joins do agregado: quem
                aparece aqui é quem a tabela contou (8h por registro). A hora
                extra é só exibição.
   SEM_PONTO  — AUDITORIA, fora de qualquer conta. Colaborador do mesmo
                recorte que estava admitido e não demitido no dia (mesma regra
                da tela de Absenteísmo) e não tem batida válida. Só entram dias
                de segunda a sexta em que alguém bateu ponto na fábrica — assim
                fim de semana e feriado não viram falta de todo mundo.
                Não distingue férias/afastamento: é "sem batida", não falta
                justificada ou injustificada.

   O recorte (setor, galpão, maturação) vale para o departamento EFETIVO de
   CADA DIA: com empréstimo, a mesma pessoa pode estar no recorte num dia e
   fora dele no seguinte. Por isso as duas partes trabalham por pessoa × dia.
   CAND só poupa o banco de cruzar a fábrica inteira com os dias: são as
   pessoas que moram no recorte ou que têm empréstimo aprovado na janela.

   EMPRESTADO_DE traz o departamento de casa quando o dia é de empréstimo — a
   auditoria mostra por que alguém de fora aparece no setor.               */
function buildSqlPontoDetalhe(ini: string, fim: string, r: RecorteOpe, comEmprestimo = false): string {
  const f: string[] = [];
  if (r.setor)  f.push(`AND DSE.CODGRUPO = ${sqlCodGrupo(r.setor)}`);
  if (r.codPlp) f.push(`AND GL.CODPLP = ${sqlCodPlp(r.codPlp)}`);
  if (r.excluirLinhas?.length) f.push(`AND NVL(DL.LINHA, '-') NOT IN (${sqlListaTexto(r.excluirLinhas)})`);
  const filtros = f.map(x => `    ${x}`).join('\n');
  /* Do departamento ao setor, galpão e linha — o mesmo caminho em todo lugar. */
  const recorteDe = (dep: string) => `
    JOIN DEP_SETOR DSE     ON DSE.CODDEP = ${dep}
    JOIN GALPAO GL         ON GL.CODPLP  = DSE.CODPLP
    LEFT JOIN DEP_LINHA DL ON DL.CODDEP  = ${dep}`;
  return `
WITH
${SQL_CTE_GALPAO},
${SQL_CTE_DEP_SETOR},
${SQL_CTE_DEP_LINHA},${comEmprestimo ? `\n${sqlCteEmprestimo(ini, fim)},` : ''}
CAND AS (
  SELECT DISTINCT FUN.CODFUNC
  FROM TFPFUN FUN${recorteDe('FUN.CODDEP')}
  WHERE 1 = 1
${filtros}${comEmprestimo ? `
  UNION
  SELECT E.CODFUNC FROM EMP_APROV E` : ''}
),
PRESENCA AS (
  SELECT DISTINCT PON.CODFUNC, TRUNC(PON.DTPONTO) AS DIA
  FROM AD_BATPONTO PON
    JOIN TFPEQP EQ ON EQ.CODEQP = PON.CODEQP
  WHERE PON.DTPONTO BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
    AND EQ.AD_USADO = '1'
),
DIAS_UTEIS AS (
  SELECT DISTINCT DIA
  FROM PRESENCA
  WHERE TO_CHAR(DIA, 'DY', 'NLS_DATE_LANGUAGE=ENGLISH') NOT IN ('SAT', 'SUN')
),
HE AS ${sqlHoraExtra(ini, fim)},
PONTO_DIA AS (
  SELECT DISTINCT PON.CODFUNC, PON.DTPONTO, FUN.NOMEFUNC, FUN.CODDEP AS CODDEP_CASA,
         ${sqlDepEfetivo('FUN', 'TRUNC(PON.DTPONTO)', comEmprestimo)} AS CODDEP_EF
  FROM AD_BATPONTO PON
    JOIN TFPEQP EQ  ON EQ.CODEQP   = PON.CODEQP
    JOIN TFPFUN FUN ON FUN.CODFUNC = PON.CODFUNC
    JOIN CAND C     ON C.CODFUNC   = PON.CODFUNC
  WHERE PON.DTPONTO BETWEEN ${oracleData(ini)} AND ${oracleData(fim)}
    AND EQ.AD_USADO = '1'
),
SEM_DIA AS (
  SELECT FUN.CODFUNC, FUN.NOMEFUNC, FUN.CODDEP AS CODDEP_CASA, D.DIA,
         ${sqlDepEfetivo('FUN', 'D.DIA', comEmprestimo)} AS CODDEP_EF
  FROM TFPFUN FUN
    JOIN CAND C ON C.CODFUNC = FUN.CODFUNC
    CROSS JOIN DIAS_UTEIS D
  WHERE TRUNC(FUN.DTADM) <= D.DIA
    AND (FUN.DTDEM IS NULL OR TRUNC(FUN.DTDEM) >= D.DIA)
    AND NOT EXISTS (SELECT 1 FROM PRESENCA P WHERE P.CODFUNC = FUN.CODFUNC AND P.DIA = D.DIA)
)
SELECT CODIGO, NOME, DEPARTAMENTO_PROD, GALPAO, DATA, HE_HORAS, SITUACAO, EMPRESTADO_DE
FROM (
  SELECT DISTINCT
    X.CODFUNC                            AS CODIGO,
    X.NOMEFUNC                           AS NOME,
    DEP.DESCRDEP                         AS DEPARTAMENTO_PROD,
    GL.GALPAO                            AS GALPAO,
    TO_CHAR(X.DTPONTO, 'DD/MM/YYYY')     AS DATA,
    TRUNC(X.DTPONTO)                     AS DT_ORD,
    NVL(HE.HORAS, 0)                     AS HE_HORAS,
    'PONTO'                              AS SITUACAO,
    CASA.DESCRDEP                        AS EMPRESTADO_DE
  FROM PONTO_DIA X
    JOIN TFPDEP DEP ON DEP.CODDEP = X.CODDEP_EF${recorteDe('X.CODDEP_EF')}
    LEFT JOIN TFPDEP CASA ON CASA.CODDEP = X.CODDEP_CASA AND X.CODDEP_CASA <> X.CODDEP_EF
    LEFT JOIN HE ON HE.CODFUNC = X.CODFUNC AND HE.DT = TRUNC(X.DTPONTO)
  WHERE 1 = 1
${filtros}
  UNION ALL
  SELECT
    S.CODFUNC,
    S.NOMEFUNC,
    DEP.DESCRDEP,
    GL.GALPAO,
    TO_CHAR(S.DIA, 'DD/MM/YYYY'),
    S.DIA,
    0,
    'SEM_PONTO',
    CASA.DESCRDEP
  FROM SEM_DIA S
    JOIN TFPDEP DEP ON DEP.CODDEP = S.CODDEP_EF${recorteDe('S.CODDEP_EF')}
    LEFT JOIN TFPDEP CASA ON CASA.CODDEP = S.CODDEP_CASA AND S.CODDEP_CASA <> S.CODDEP_EF
  WHERE 1 = 1
${filtros}
)
ORDER BY NOME, DT_ORD
`.trim();
}

/**
 * `semPonto` = linha de auditoria: não bateu ponto no dia, fora da contagem.
 * `emprestadoDe` = departamento de casa, quando o dia era de empréstimo (o
 * `departamento` então é o de destino, onde a hora contou); vazio no resto.
 */
export type PontoDetalheRow = { codigo: string; nome: string; departamento: string; galpao: string; data: string; heHoras: number; semPonto: boolean; emprestadoDe: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapPontoDetalhe(r: Record<string, any>): PontoDetalheRow {
  return {
    codigo:       String(r['CODIGO']            ?? r['codigo']            ?? ''),
    nome:         String(r['NOME']              ?? r['nome']              ?? ''),
    departamento: String(r['DEPARTAMENTO_PROD'] ?? r['departamento_prod'] ?? ''),
    galpao:       String(r['GALPAO']            ?? r['galpao']            ?? ''),
    data:         String(r['DATA']              ?? r['data']              ?? ''),
    heHoras:      Number(r['HE_HORAS']          ?? r['he_horas']          ?? 0) || 0,
    semPonto:     String(r['SITUACAO']          ?? r['situacao']          ?? '') === 'SEM_PONTO',
    emprestadoDe: String(r['EMPRESTADO_DE']     ?? r['emprestado_de']     ?? ''),
  };
}

/* ── SQL Atividades Detalhe (atividade × barco × dia, com horas) ─
   Parte da mesma TAB_BASE do agregado — inclusive o RN = 1 — para que a soma
   de HORAS aqui feche com a coluna Atividades do card clicado. Por padrão só
   entram as atividades sem RETRABALHO, que é o que a coluna Atividades soma;
   com `apenasRetrabalho` o filtro inverte e a soma fecha com a coluna Perdas. */
function buildSqlAtivDetalhe(ini: string, fim: string, r: RecorteOpe, apenasRetrabalho = false): string {
  return `
WITH
${SQL_CTE_GALPAO},
${sqlBaseAtividades(ini, fim)},
${SQL_CTE_SETOR_MACRO}
SELECT SETORMACRO, COD_SETOR, SETOR, LINHA, PROJETO, COD_ATIVIDADE, ATIVIDADE, DATA, HORAS, GALPAO
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
    ROUND(SUM(TB.DURACAO) / 60, 2)                 AS HORAS,
    GL.GALPAO
  FROM TAB_BASE TB
    JOIN SETOR_MACRO SM ON SM.CODUSU = TB.COD_SETOR
    JOIN GALPAO GL      ON GL.CODPLP = ${sqlCodPlpEfetivo('TB.CODPLP', 'SM.CODGRUPO')}
  WHERE TB.RN = 1
    AND TB.RETRABALHO IS ${apenasRetrabalho ? 'NOT NULL' : 'NULL'}
${sqlFiltrosAtiv(r)}
  GROUP BY SM.SETORMACRO, TB.COD_SETOR, TB.SETOR, TB.LINHA, TB.PROJETO,
           TB.COD_ATIVIDADE, TB.ATIVIDADE, TRUNC(TB.DATA_EXECUCAO), GL.GALPAO
)
ORDER BY SETORMACRO, SETOR, PROJETO, ATIVIDADE, DT_ORD
`.trim();
}

export type AtivDetalheRow = {
  setorMacro: string; codSetor: string; setor: string; linha: string; projeto: string;
  codAtividade: string; atividade: string; data: string; horas: number; galpao: string;
};

/* Ordem das colunas do SELECT acima — usada quando o backend devolve a linha
   como array posicional em vez de objeto (os dois formatos ocorrem). */
const ATIV_DETALHE_COLS = [
  'SETORMACRO', 'COD_SETOR', 'SETOR', 'LINHA', 'PROJETO',
  'COD_ATIVIDADE', 'ATIVIDADE', 'DATA', 'HORAS', 'GALPAO',
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
    galpao:       String(get('GALPAO')        ?? ''),
  };
}

/* ── Mapeadores ────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapAtiv(r: Record<string, any>): RawAtivRow {
  return {
    linha:           String(r['LINHA']            ?? r['linha']            ?? ''),
    data:            String(r['DATA']             ?? r['data']             ?? ''),
    codPlp:          String(r['CODPLP']           ?? r['codplp']           ?? ''),
    galpao:          String(r['GALPAO']           ?? r['galpao']           ?? ''),
    codGrupo:        String(r['CODGRUPO']         ?? r['codgrupo']         ?? ''),
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
    codPlp:     String(r['CODPLP']        ?? r['codplp']        ?? ''),
    galpao:     String(r['GALPAO']        ?? r['galpao']        ?? ''),
    codGrupo:   String(r['CODGRUPO']      ?? r['codgrupo']      ?? ''),
    setorMacro: String(r['SETORMACRO']    ?? r['setormacro']    ?? ''),
    qtdPonto:   Number(r['QTD_REGISTROS'] ?? r['qtd_registros'] ?? 0),
    horasPonto: Number(r['HORAS_PONTO']   ?? r['horas_ponto']   ?? 0),
    horasExtras: Number(r['HORAS_EXTRAS'] ?? r['horas_extras']  ?? 0) || 0,
  };
}

/* ── API pública ───────────────────────────────────────────── */

/**
 * Carga única da tela: listas de setores e de galpões (cacheadas) e, por
 * setor, duas consultas — atividades e ponto. Cada registro já vem com o
 * galpão; a tela recorta por ele, não pela linha.
 *
 * A ordem importa: `flatMap` empilha os pares [atividades, ponto] do mesmo
 * setor, e o `for (i += 2)` desintercala os índices pares/ímpares.
 */
export async function getOpeDados(
  ini: string,
  fim: string,
): Promise<{
  ativos: RawAtivRow[];
  pontos: RawPontoRow[];
  grupos: GrupoProducao[];
  galpoes: GalpaoOpe[];
  /** Preenchido quando a conta com empréstimo falhou e o ponto saiu SEM empréstimos. */
  avisoEmprestimo: string | null;
}> {
  const [grupos, galpoes, comEmprestimo] = await Promise.all([getGruposProducao(), getGalpoes(), emprestimoDisponivel()]);
  const consultarPonto = (comEmp: boolean) =>
    Promise.all(grupos.map(g => obterReg(buildSqlPonto(ini, fim, g.codGrupo, comEmp))));
  /* Rede de segurança: se a SQL do ponto COM empréstimo falhar no banco, o
     ponto é refeito sem empréstimo e a tela recebe o aviso. Assim um erro na
     parte nova nunca derruba o OPE inteiro — o pior caso é a conta de antes. */
  let avisoEmprestimo: string | null = null;
  const [resAtiv, resPonto] = await Promise.all([
    Promise.all(grupos.map(g => obterReg(buildSqlAtividades(ini, fim, g.codGrupo)))),
    consultarPonto(comEmprestimo).catch((e: unknown) => {
      if (!comEmprestimo) throw e;
      avisoEmprestimo = `Os empréstimos de colaborador ficaram fora desta conta: a consulta falhou (${e instanceof Error ? e.message : String(e)}). O ponto abaixo é o de sempre, cada um no seu departamento.`;
      return consultarPonto(false);
    }),
  ]);
  const ativos: RawAtivRow[]  = [];
  const pontos: RawPontoRow[] = [];
  resAtiv.forEach(rows => rows.forEach(r => ativos.push(mapAtiv(r))));
  resPonto.forEach(rows => rows.forEach(r => pontos.push(mapPonto(r))));
  return { ativos, pontos, grupos, galpoes, avisoEmprestimo };
}

/** Funcionários que bateram ponto no recorte — alimenta o popup de detalhe. */
export async function getPontoDetalhe(
  ini: string,
  fim: string,
  recorte: RecorteOpe,
): Promise<PontoDetalheRow[]> {
  const comEmprestimo = await emprestimoDisponivel();
  try {
    const rows = await obterReg(buildSqlPontoDetalhe(ini, fim, recorte, comEmprestimo));
    return rows.map(mapPontoDetalhe);
  } catch (e) {
    /* Mesma rede de segurança do agregado: sem empréstimo, a lista ainda sai. */
    if (!comEmprestimo) throw e;
    console.warn('[opeService] detalhe de ponto com empréstimo falhou; refeito sem:', e);
    const rows = await obterReg(buildSqlPontoDetalhe(ini, fim, recorte, false));
    return rows.map(mapPontoDetalhe);
  }
}

/**
 * Atividades apontadas no recorte, uma linha por atividade × barco × dia.
 *
 * É o "de onde vem" da coluna Atividades da tabela: a soma de `horas` daqui
 * fecha com o valor do card, porque a SQL parte da mesma TAB_BASE (com o mesmo
 * `RN = 1`) e exclui retrabalho, que na tela vira Perdas.
 *
 * @param apenasRetrabalho Inverte o filtro: traz o que foi apontado COMO
 *   retrabalho, e a soma fecha com a coluna Perdas. (Na diretoria o parâmetro
 *   ainda é ignorado pela SQL; aqui ele vale.)
 */
export async function getAtivDetalhe(
  ini: string,
  fim: string,
  recorte: RecorteOpe,
  apenasRetrabalho = false,
): Promise<AtivDetalheRow[]> {
  const rows = await obterReg(buildSqlAtivDetalhe(ini, fim, recorte, apenasRetrabalho));
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
