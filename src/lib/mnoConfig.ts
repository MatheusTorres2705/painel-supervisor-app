// src/lib/mnoConfig.ts
// Config estática da Meta de Produção (MNO) — FASE 1.
// Valores transcritos da planilha (HH padrão por barco por setor e meta de quantidade
// de barcos por modelo). Editável/persistido no Sankhya numa fase futura.

export type Galpao = 'Galpão 1' | 'Galpão 2' | 'Galpão 3';

export const MNO_SETORES = [
  'Acabamento', 'Componentes', 'Pintura', 'Laminação', 'Rebarba', 'Mecânica',
  'Elétrica (Montagem)', 'Elétrica (Chicotes)', 'Marcenaria (Pré)', 'Marcenaria (Montagem)',
  'Capotaria', 'Montagem', 'Expedição',
] as const;
export type Setor = (typeof MNO_SETORES)[number];

export type MnoModelo = { id: string; galpao: Galpao; metaQtd: number };

// Meta em quantidade de barcos por modelo (planilha "Meta em quantidade de barcos").
export const MNO_MODELOS: MnoModelo[] = [
  { id: '26-27', galpao: 'Galpão 1', metaQtd: 3 },
  { id: '28',    galpao: 'Galpão 1', metaQtd: 3.5 },
  { id: '29',    galpao: 'Galpão 1', metaQtd: 3.5 },
  { id: '31',    galpao: 'Galpão 1', metaQtd: 8 },
  { id: '34-35', galpao: 'Galpão 1', metaQtd: 5 },
  { id: '36-37', galpao: 'Galpão 2', metaQtd: 4 },
  { id: '41',    galpao: 'Galpão 2', metaQtd: 5 },
  { id: '44',    galpao: 'Galpão 2', metaQtd: 2 },
  { id: '50',    galpao: 'Galpão 3', metaQtd: 2 },
  { id: '62',    galpao: 'Galpão 3', metaQtd: 1 },
];

export const MNO_GALPOES: Galpao[] = ['Galpão 1', 'Galpão 2', 'Galpão 3'];

// HH padrão por barco por setor, por modelo (planilha "Quantidade de HH por barco").
// Ordem dos valores segue MNO_SETORES.
const HH: Record<string, number[]> = {
  //          Acab     Comp    Pint    Lam      Reb     Mec    EleM    EleC    MarcP   MarcM   Cap  Mont    Exp
  '26-27': [ 311.13,  62,     23.63,  396.85,  150.11, 29.83, 46.33,  27.41,  39.08,   9.5,   0,  127.16, 54.91 ],
  '28':    [ 178.28,  116,    14.5,   390.58,  184.15, 31.83, 47.5,   24.91,  40.25,   7,     0,  134,    55.25 ],
  '29':    [ 193.08,  116,    14.16,  436.08,  180.35, 31.83, 55,     32.16,  109.5,   24,    0,  158,    59.91 ],
  '31':    [ 120.66,  90,     21.33,  512.33,  181.5,  45.66, 55,     60.33,  133,     38.16, 0,  151.91, 59.91 ],
  '34-35': [ 258.5,   66.5,   19.19,  565.5,   227.06, 84.75, 87.08,  49.91,  159.25,  58.5,  0,  327,    119.75 ],
  '36-37': [ 324.33,  107.33, 23.63,  606.75,  150.33, 84.75, 86.41,  61.75,  141.38,  98.5,  0,  195.65, 106.5 ],
  '41':    [ 496,     130,    26.85,  1140.25, 179.16, 83,    165.16, 147.58, 337.5,   140.5, 0,  407.16, 19.58 ],
  '44':    [ 1908,    212.83, 47.53,  1926.43, 472.01, 11.16, 562.2,  202.91, 520.48,  537.95,0,  642.51, 68.5 ],
  '50':    [ 1741.6,  344.83, 44.35,  2539.8,  897.86, 21.33, 423.83, 231.91, 647.66,  522,   0,  692.61, 268.58 ],
  '62':    [ 3200,    2256,   1280,   6690,    606,    0,     1120,   160,    2482,    1920,  0,  2880,   400 ],
};

// MNO_HH_PADRAO[modelo][setor] = HH padrão por barco.
export const MNO_HH_PADRAO: Record<string, Record<Setor, number>> = Object.fromEntries(
  Object.entries(HH).map(([modelo, arr]) => [
    modelo,
    Object.fromEntries(MNO_SETORES.map((s, i) => [s, arr[i] ?? 0])) as Record<Setor, number>,
  ]),
);

// Normaliza rótulo de setor para casar o TSIGRU.NOMEGRUPO do banco com MNO_SETORES.
export function normSetor(s: string): string {
  return (s ?? '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

// Aliases explícitos: normalizado(do banco) -> rótulo MNO. Ajustar após validar os nomes reais.
export const SETOR_ALIASES: Record<string, Setor> = {
  // ex.: 'ELETRICAMONT': 'Elétrica (Montagem)',
};

const NORM_TO_SETOR: Record<string, Setor> = (() => {
  const m: Record<string, Setor> = {};
  for (const s of MNO_SETORES) m[normSetor(s)] = s;
  for (const [k, v] of Object.entries(SETOR_ALIASES)) m[normSetor(k)] = v;
  return m;
})();

// Resolve o setor do banco para um rótulo MNO (ou null se não mapeado).
export function resolveSetor(nomeBanco: string): Setor | null {
  return NORM_TO_SETOR[normSetor(nomeBanco)] ?? null;
}

// Normaliza o nome de galpão do banco (TPRPLP.NOME) para 'Galpão 1|2|3'.
export function resolveGalpao(nomeBanco: string): Galpao | null {
  const digit = (nomeBanco ?? '').match(/(\d)/)?.[1];
  if (digit === '1') return 'Galpão 1';
  if (digit === '2') return 'Galpão 2';
  if (digit === '3') return 'Galpão 3';
  return null;
}

// ── Derivados da meta (estáticos) ─────────────────────────────────────────────
// Meta HH por setor por modelo = HH padrão × meta qtd.
export function metaHHModeloSetor(modelo: string, setor: Setor): number {
  const m = MNO_MODELOS.find(x => x.id === modelo);
  const hh = MNO_HH_PADRAO[modelo]?.[setor] ?? 0;
  return hh * (m?.metaQtd ?? 0);
}

// Meta HH por setor (total fábrica).
export const META_HH_POR_SETOR: Record<Setor, number> = Object.fromEntries(
  MNO_SETORES.map(s => [s, MNO_MODELOS.reduce((acc, m) => acc + metaHHModeloSetor(m.id, s), 0)]),
) as Record<Setor, number>;

// Meta HH por galpão por setor.
export const META_HH_GALPAO_SETOR: Record<Galpao, Record<Setor, number>> = Object.fromEntries(
  MNO_GALPOES.map(g => [
    g,
    Object.fromEntries(MNO_SETORES.map(s => [
      s,
      MNO_MODELOS.filter(m => m.galpao === g).reduce((acc, m) => acc + metaHHModeloSetor(m.id, s), 0),
    ])) as Record<Setor, number>,
  ]),
) as Record<Galpao, Record<Setor, number>>;

export const META_HH_POR_GALPAO: Record<Galpao, number> = Object.fromEntries(
  MNO_GALPOES.map(g => [g, MNO_SETORES.reduce((acc, s) => acc + META_HH_GALPAO_SETOR[g][s], 0)]),
) as Record<Galpao, number>;

export const META_HH_TOTAL = MNO_GALPOES.reduce((acc, g) => acc + META_HH_POR_GALPAO[g], 0);
export const META_QTD_TOTAL = MNO_MODELOS.reduce((acc, m) => acc + m.metaQtd, 0);
