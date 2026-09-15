// src/services/horaExtraService.ts
// Base das consultas de hora extra (AD_BANCOHORAS × AD_BCOFUN). A base e o
// escopo moravam na HoraExtraPage; saíram para cá sem mudança para o Dashboard
// contar exatamente o mesmo universo que a tela de aprovação.
import { obterReg } from "@/lib/obterReg";
import { duracaoMin } from "@/lib/horas";
import { txt, type ErpRow } from "@/lib/format";

/**
 * Base comum da lista e do comparativo. Os INNER JOIN com TSIUSU também filtram
 * (colaborador sem supervisor cadastrado não aparece): por isso as duas
 * consultas precisam dos mesmos JOINs, senão contam universos diferentes.
 */
export const FROM_HORA_EXTRA = `
        FROM AD_BANCOHORAS HR
        JOIN AD_BCOFUN FUN ON FUN.CODBANCOHORAS = HR.CODBANCOHORAS
        JOIN TFPFUN F ON F.CODFUNC = FUN.CODFUNC
        JOIN TSIUSU SUP ON SUP.CODUSU = F.USUVPJSUP
        JOIN TSIUSU SOL ON SOL.CODUSU = HR.CODUSU`;

/** Eventos em que o usuário é supervisor do colaborador ou quem solicitou. */
export const escopoSupervisor = (codusu: number) =>
  `(F.USUVPJSUP = ${Number(codusu)} OR HR.CODUSU = ${Number(codusu)})`;

export type ResumoHoraExtraMes = {
  pendentesMin: number;
  pendentesQtd: number;
  aprovadosMin: number;
  totalMin: number;
  colaboradores: number;
};

const vazio = (): ResumoHoraExtraMes => ({ pendentesMin: 0, pendentesQtd: 0, aprovadosMin: 0, totalMin: 0, colaboradores: 0 });

/**
 * Totais de dois meses ("MM/YYYY") numa consulta. Mesma conta do `resumir` da
 * tela de Hora Extra: duração HRINI→HRFIN, pendente = LIBERADO diferente de 'S'.
 * `sup` null = empresa toda.
 */
export async function getResumoHoraExtra(
  mes: string,
  mesAnterior: string,
  sup: number | null
): Promise<{ atual: ResumoHoraExtraMes; anterior: ResumoHoraExtraMes }> {
  const sql = `
        SELECT
          TO_CHAR(HR.DTUSO, 'MM/YYYY') AS MES,
          F.CODFUNC,
          HR.HRINI,
          HR.HRFIN,
          NVL(FUN.LIBERADO,'N') AS LIBERADO
        ${FROM_HORA_EXTRA}
        WHERE ${sup != null ? escopoSupervisor(sup) : "1 = 1"}
          AND TO_CHAR(HR.DTUSO, 'MM/YYYY') IN ('${mes}', '${mesAnterior}')
  `.trim();

  const atual = vazio();
  const anterior = vazio();
  const funcs = new Set<number>();
  for (const r of (await obterReg(sql)) as ErpRow[]) {
    const alvo = txt(r.MES) === mes ? atual : txt(r.MES) === mesAnterior ? anterior : null;
    if (!alvo) continue;
    const min = duracaoMin(r.HRINI, r.HRFIN) ?? 0;
    alvo.totalMin += min;
    if (txt(r.LIBERADO) === "S") alvo.aprovadosMin += min;
    else {
      alvo.pendentesMin += min;
      alvo.pendentesQtd++;
    }
    if (alvo === atual) funcs.add(Number(r.CODFUNC));
  }
  atual.colaboradores = funcs.size;
  return { atual, anterior };
}
