// src/lib/datetime.ts
// Calendário do painel. Substitui as 15 declarações de MESES espalhadas
// (que tinham 4 convenções incompatíveis: 0-based, 1-based, toLocaleString e
// abreviada) e os helpers de dia útil duplicados em 4 páginas.
//
// Convenção única: arrays 1-indexados (posição 0 = ""), porque o mês do
// domínio (Oracle, MES/ANO) é 1..12 — indexar por mês direto evita o ±1.

/** Nomes curtos, 1-indexado: MESES_CURTO[8] === "Ago". */
export const MESES_CURTO = [
  "", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

/** Nomes por extenso, 1-indexado: MESES_LONGO[8] === "Agosto". */
export const MESES_LONGO = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** Rótulo do mês. `mes` é 1..12; fora da faixa devolve "". */
export function monthLabel(mes: number, estilo: "short" | "long" = "short"): string {
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) return "";
  return (estilo === "long" ? MESES_LONGO : MESES_CURTO)[mes];
}

/** "Ago/26" — rótulo compacto de eixo e cabeçalho de coluna. */
export function monthYearLabel(mes: number, ano: number): string {
  const m = monthLabel(mes);
  return m ? `${m}/${String(ano).slice(2)}` : String(ano);
}

/** Chave estável para Map/objeto: "2026-08". */
export function mesAnoKey(ano: number, mes: number): string {
  return `${ano}-${pad2(mes)}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Último dia do mês (1..12). */
export function ultimoDia(mes: number, ano: number): number {
  return new Date(ano, mes, 0).getDate();
}

/**
 * Dia útil = segunda a sexta, descontados os feriados de `feriados`.
 *
 * O calendário é um parâmetro OBRIGATÓRIO, não opcional: a fábrica não produz
 * em feriado, e a meta diária sai de uma divisão por esta contagem. Um
 * parâmetro opcional deixaria um call site esquecido devolver um número
 * silenciosamente otimista; assim o TypeScript cobra a decisão, e quem
 * realmente quer ignorar feriados escreve `SEM_FERIADOS` (lib/calendario).
 *
 * O `Set` vem cru, e não o objeto `Calendario`, para este módulo não importar
 * `lib/calendario` — é ele que importa `isoLocal` daqui.
 */
export function isDiaUtil(d: Date, feriados: ReadonlySet<string>): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !feriados.has(isoLocal(d));
}

/** Dias úteis do mês, opcionalmente até `ateDia` (inclusive). */
export function diasUteisNoMes(ano: number, mes: number, feriados: ReadonlySet<string>, ateDia?: number): number {
  const fim = ateDia ?? ultimoDia(mes, ano);
  let n = 0;
  for (let d = 1; d <= fim; d++) if (isDiaUtil(new Date(ano, mes - 1, d), feriados)) n++;
  return n;
}

/** Dias úteis entre duas datas, inclusive nas pontas. `fim < ini` → 0. */
export function diasUteisEntre(ini: Date, fim: Date, feriados: ReadonlySet<string>): number {
  let n = 0;
  const cur = inicioDoDia(ini);
  const ate = inicioDoDia(fim);
  while (cur <= ate) {
    if (isDiaUtil(cur, feriados)) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

/** Meia-noite local do dia de `d` — para comparar datas sem a hora atrapalhar. */
export function inicioDoDia(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * "yyyy-mm-dd" — o valor que `<input type="date">` espera.
 *
 * Montado a partir dos getters LOCAIS de propósito: `toISOString()` converte
 * para UTC e, no Brasil (UTC−3), devolveria o dia anterior a toda tarde.
 */
export function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "DD/MM/YYYY" — formato que as consultas Oracle esperam. */
export function dataOracle(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/* `diasUteisDecorridos` e `diaDeHoje` viviam aqui sem nenhum chamador. Saíram
   junto com a mudança do calendário: propagar o parâmetro de feriados por
   código morto só espalharia ruído. O ritmo da Meta de Produção faz a própria
   conta de "até ontem" em lib/mnoCalc. */

/** Faixa do mês no formato que o Oracle espera: DD/MM/YYYY. */
export function rangeMes(ano: number, mes: number): { ini: string; fim: string } {
  return {
    ini: `01/${pad2(mes)}/${ano}`,
    fim: `${pad2(ultimoDia(mes, ano))}/${pad2(mes)}/${ano}`,
  };
}

/* ── Intervalo de datas ───────────────────────────────────────────────────── */

/** Intervalo em "yyyy-mm-dd" — o mesmo formato do `<input type="date">`. */
export type IsoRange = { ini: string; fim: string };

/** O mês inteiro como intervalo ISO — estado inicial típico de um filtro. */
export function mesInteiro(ano: number, mes: number): IsoRange {
  return {
    ini: isoLocal(new Date(ano, mes - 1, 1)),
    fim: isoLocal(new Date(ano, mes - 1, ultimoDia(mes, ano))),
  };
}

/**
 * "Agosto/2026" quando o intervalo cobre um mês cheio; senão
 * "01/08/2026 – 14/08/2026" (ou uma data só, se início e fim coincidem).
 *
 * O caso do mês cheio existe porque é o padrão da tela: mostrar
 * "01/08/2026 – 31/08/2026" no título obrigaria a ler seis números para
 * concluir "agosto".
 */
export function rangeLabel(r: IsoRange): string {
  const a = parseData(r.ini), b = parseData(r.fim);
  if (!a || !b) return "";
  const mesCheio =
    a.getDate() === 1 &&
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
    b.getDate() === ultimoDia(b.getMonth() + 1, b.getFullYear());
  if (mesCheio) return `${MESES_LONGO[a.getMonth() + 1]}/${a.getFullYear()}`;
  if (a.getTime() === b.getTime()) return dataOracle(a);
  return `${dataOracle(a)} – ${dataOracle(b)}`;
}

/** Lista de anos para seletores: [atual, atual-1, …] incluindo `extra`. */
export function anosSelecionaveis(extra?: number, quantos = 2): number[] {
  const atual = new Date().getFullYear();
  const base = Array.from({ length: quantos }, (_, i) => atual - i);
  return Array.from(new Set(extra != null ? [...base, extra] : base)).sort((a, b) => b - a);
}

/**
 * Aceita Date, timestamp, ISO ou "DD/MM/YYYY". Devolve null se não parsear.
 *
 * Cuidado com fuso: `new Date("2026-08-13")` (ISO **sem hora**) é interpretado
 * como meia-noite UTC, e no Brasil (UTC−3) `.getDate()` devolve 12 — a data
 * apareceria um dia atrás. Por isso datas puras (sem "T") são montadas como
 * data LOCAL. Strings com hora seguem o parse nativo, que já é correto.
 */
export function parseData(v: Date | string | number | null | undefined): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();

  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));

  // ISO date-only (YYYY-MM-DD, com ou sem sufixo não-horário) → data local.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})(?!T)/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
