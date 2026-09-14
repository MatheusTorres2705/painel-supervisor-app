// src/services/quadroService.ts
// Quadro de pessoas por setor, para a coluna "Pessoas" da Meta de Produção.
//
// Por que pelo cadastro, e não por quem apontou: o CODUSU do apontamento é o
// usuário da EQUIPE (TFPDEP.AD_CODUSU liga o departamento a ele) — contar
// apontadores daria ~1 "pessoa" por departamento.
//
// O setor da pessoa sai do mesmo lugar que o setor do realizado em
// mnoService (TSIGRU.NOMEGRUPO do usuário da equipe), então `resolveSetor`
// casa os dois sem regra nova:
//   TFPFUN.CODDEP → TFPDEP.AD_CODUSU → TSIUSU.CODGRUPO → TSIGRU.NOMEGRUPO
import { obterReg } from "../lib/obterReg";
import { SQL_LINHA_DO_PONTO } from "./opeService";

/** Uma pessoa × uma linha atendida pelo departamento dela. */
export type QuadroPessoa = {
  /** `CODEMP-CODFUNC`: o TFPFUN tem chave composta por empresa. */
  chave: string;
  /** TSIGRU.NOMEGRUPO, cru — o mapeamento para os setores da meta é da página. */
  setor: string;
  /** "NX260"…; `null` quando o departamento não tem linha em AD_DEPLINHA. */
  linha: string | null;
};

/**
 * Ativo na data = admitido até ela e não demitido antes dela. Mesmo critério
 * do Absenteísmo do painel-diretoria: permite olhar um mês passado com o
 * quadro daquela época, o que o flag SITUACAO (situação de hoje) não permite.
 *
 * A linha usa a MESMA tradução do ponto no OPE (SQL_LINHA_DO_PONTO,
 * 480→500 e 600→620): cópias divergentes dessa expressão já produziram OPE
 * acima de 100%.
 *
 * Departamentos sem AD_CODUSU (indiretos, administrativo) ficam de fora pelo
 * JOIN, como no realizado.
 */
function buildSql(dataRef: string): string {
  const data = `TO_DATE('${dataRef}', 'DD/MM/YYYY')`;
  return `
SELECT DISTINCT
  F.CODEMP,
  F.CODFUNC,
  GRU.NOMEGRUPO AS SETOR,
  CASE WHEN DEPL.CODPROJPAI IS NULL THEN NULL ELSE ${SQL_LINHA_DO_PONTO} END AS LINHA
FROM TFPFUN F
JOIN TFPDEP DEP  ON DEP.CODDEP   = F.CODDEP
JOIN TSIUSU USU  ON USU.CODUSU   = DEP.AD_CODUSU
JOIN TSIGRU GRU  ON GRU.CODGRUPO = USU.CODGRUPO
LEFT JOIN AD_DEPLINHA DEPL ON DEPL.CODDEP = DEP.CODDEP
WHERE TRUNC(F.DTADM) <= ${data}
  AND (F.DTDEM IS NULL OR TRUNC(F.DTDEM) >= ${data})
`.trim();
}

const COLUNAS = ["CODEMP", "CODFUNC", "SETOR", "LINHA"] as const;

/* O backend devolve a linha como objeto ou como array posicional (os dois
   formatos ocorrem — ver mapRow em mnoService). */
function mapRow(r: unknown): QuadroPessoa {
  const o: Record<string, unknown> = Array.isArray(r)
    ? Object.fromEntries(COLUNAS.map((c, i) => [c, r[i]]))
    : (r as Record<string, unknown>);
  const get = (k: string) => o[k] ?? o[k.toLowerCase()];
  const linha = get("LINHA");
  return {
    chave: `${String(get("CODEMP") ?? "")}-${String(get("CODFUNC") ?? "")}`,
    setor: String(get("SETOR") ?? ""),
    linha: linha == null || linha === "" ? null : String(linha),
  };
}

/** @param dataRef "DD/MM/YYYY" — data em que o funcionário precisa estar ativo. */
export async function getQuadroSetor(dataRef: string): Promise<QuadroPessoa[]> {
  return (await obterReg(buildSql(dataRef))).map(mapRow);
}
