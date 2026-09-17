// src/services/dailyService.ts
// Carga da daily: uma janela (1º do mês até o fim da semana) por vez, com as
// consultas que as outras telas já usam. Trocar galpão ou setor NÃO refaz
// consulta — o recorte é aplicado em lib/dailyCalc sobre o que já veio.
//
// Cada bloco é independente: se o OPE falhar, o avanço e o absenteísmo seguem.
import { getDadosSetorPeriodo, type DadosSetorPeriodo } from "@/services/absenteismoService";
import { getOpeDados, type RawAtivRow, type RawPontoRow } from "@/services/opeService";
import { getRealizadoDiaSetor, type RealizadoDia } from "@/services/mnoService";
import { getResumoHoraExtra, type ResumoHoraExtraMes } from "@/services/horaExtraService";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { paraOracle } from "@/lib/dailyCalc";

export type BlocoDaily<T> = { dados: T | null; erro: string | null };

export type DadosDaily = {
  ope: BlocoDaily<{ ativos: RawAtivRow[]; pontos: RawPontoRow[] }>;
  avanco: BlocoDaily<RealizadoDia[]>;
  absenteismo: BlocoDaily<DadosSetorPeriodo>;
  horaExtra: BlocoDaily<ResumoHoraExtraMes>;
};

const bloco = async <T,>(fn: () => Promise<T>, oQue: string): Promise<BlocoDaily<T>> => {
  try {
    return { dados: await fn(), erro: null };
  } catch (e: unknown) {
    return { dados: null, erro: mensagemErro(e, `Falha ao carregar ${oQue}.`) };
  }
};

/**
 * @param ini,fim "YYYY-MM-DD" — a janela cobre as colunas dos dias e o mês.
 * @param mm "MM/YYYY" do mês da semana; `mmAnt` só para a hora extra comparar.
 * @param supHoraExtra escopo do supervisor SÓ para a hora extra: ela não separa
 *   por setor nem galpão. O resto do quadro é do recorte (galpão × setores) e
 *   por isso vai sem filtro de supervisor.
 */
export async function getDaily(
  ini: string,
  fim: string,
  mm: string,
  mmAnt: string,
  supHoraExtra: number | null
): Promise<DadosDaily> {
  const [ope, avanco, absenteismo, horaExtra] = await Promise.all([
    bloco(() => getOpeDados(paraOracle(ini), paraOracle(fim)), "o OPE"),
    bloco(() => getRealizadoDiaSetor(paraOracle(ini), paraOracle(fim)), "o avanço"),
    bloco(() => getDadosSetorPeriodo(paraOracle(ini), paraOracle(fim), null), "o absenteísmo"),
    bloco(async () => (await getResumoHoraExtra(mm, mmAnt, supHoraExtra)).atual, "a hora extra"),
  ]);
  return { ope, avanco, absenteismo, horaExtra };
}
