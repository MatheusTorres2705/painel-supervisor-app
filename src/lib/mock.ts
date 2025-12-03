// src/lib/mock.ts

/** ================== Tipos ================== */
export type Kpis = {
  he: { disp: number; cons: number };
  avancos: { op: string; pct: number }[];
  senioridade: { nivel: string; qtd: number }[];
  faltantes: { qtd: number; total: number };
  retrabalho: { pct: number };
  assid: { pct: number };
};

export type MembroEquipe = {
  id: number;
  nome: string;
  cargo: string;
  senior: "Júnior" | "Pleno" | "Sênior";
  tempo: string; // "2a 4m"
  hhProd: number;
  hhFalta: number;
  rank: number;
};

export type OP = {
  id: string;         // "OP-2301"
  produto: string;    // "NX 340"
  chassi: string;     // "340-119"
  andamento: number;  // 0..100
};

export type AtividadePeriodo = {
  id: number;
  atividade: string;
  etapa: string;  // "LAM" | "ELE" | ...
  hh: number;     // horas previstas
  dt: string;     // YYYY-MM-DD
};

export type OperadorCapacidade = {
  nome: string;
  hh: number;     // horas já alocadas no período/dia
};

export type MateriaisItem = {
  nome: string;
  op: string;
  planejado?: string; // data planejada
  status: "pendente" | "atrasado" | "futuro";
};

export type CalendarioReq = {
  id: string;
  data: string; // YYYY-MM-DD
  titulo: string;
  op: string;
};

export type PlanoAcaoCard = {
  id: string;
  titulo: string;
  responsavel: string;
  prazo: string; // YYYY-MM-DD
  status: "nao_planejado" | "andamento" | "finalizado";
};

/** ================== Mocks ================== */

export const mockKpis = (): Kpis => ({
  he: { disp: 0, cons: 0 },
  avancos: [{ op: "OP-2301", pct: 0 }],
  senioridade: [
    { nivel: "Júnior", qtd: 8 },
    { nivel: "Pleno", qtd: 5 },
    { nivel: "Sênior", qtd: 3 },
  ],
  faltantes: { qtd: 0, total: 0 },
  retrabalho: { pct: 0 },
  assid: { pct: 0 },
});

export const mockEquipe = (): MembroEquipe[] => [
  { id: 1, nome: "Ana Souza",   cargo: "Montadora", senior: "Pleno",  tempo: "2a 4m", hhProd: 128, hhFalta: 4, rank: 1 },
  { id: 2, nome: "Carlos Lima", cargo: "Pintor",    senior: "Sênior", tempo: "5a 1m", hhProd: 142, hhFalta: 0, rank: 2 },
  { id: 3, nome: "Bruno Alves", cargo: "Elétrica",  senior: "Júnior", tempo: "11m",  hhProd: 101, hhFalta: 6, rank: 3 },
  { id: 4, nome: "Julia Prado", cargo: "Acabamento",senior: "Pleno",  tempo: "3a 2m", hhProd: 116, hhFalta: 2, rank: 4 },
];

export const mockOps = (): OP[] => [
  { id: "OP-2301", produto: "NX 340", chassi: "340-119", andamento: 72 },
  { id: "OP-2279", produto: "NX 290", chassi: "290-332", andamento: 48 },
  { id: "OP-2310", produto: "NX 370", chassi: "370-044", andamento: 15 },
];

export const mockAtividadesPeriodo = (): AtividadePeriodo[] => [
  { id: 1, atividade: "Laminação casco",      etapa: "LAM",  hh: 10, dt: "2025-11-12" },
  { id: 2, atividade: "Instalação elétrica",  etapa: "ELE",  hh:  6, dt: "2025-11-13" },
  { id: 3, atividade: "Acabamento interno",   etapa: "ACB",  hh:  8, dt: "2025-11-14" },
  { id: 4, atividade: "Teste estanqueidade",  etapa: "QUAL", hh:  4, dt: "2025-11-15" },
];

export const mockOperadoresCapacidade = (): { takt: number; list: OperadorCapacidade[] } => ({
  takt: 8,
  list: [
    { nome: "Operador 1", hh: 5.5 },
    { nome: "Operador 2", hh: 6.2 },
    { nome: "Operador 3", hh: 6.0 },
    { nome: "Operador 4", hh: 7.1 },
    { nome: "Operador 5", hh: 6.9 },
    { nome: "Operador 6", hh: 9.0 },
  ],
});

/** ===== Materiais (pendente/atrasado/futuro) ===== */
export const mockMateriais = (): MateriaisItem[] => [
  { nome: "Gel coat — 20kg",    op: "OP 340-119", status: "pendente" },
  { nome: "Cabo elétrico 10mm", op: "OP 340-119", status: "pendente" },
  { nome: "Resina epóxi",       op: "OP 340-119", status: "pendente" },
  { nome: "Espuma acústica",    op: "OP 290-332", status: "atrasado", planejado: "2025-11-05" },
  { nome: "Kit parafusos inox", op: "OP 290-332", status: "atrasado", planejado: "2025-11-06" },
  { nome: "Teak sintético",     op: "OP 370-044", status: "futuro",   planejado: "2025-11-22" },
  { nome: "Conector NMEA",      op: "OP 370-044", status: "futuro",   planejado: "2025-11-24" },
];

/** ===== Calendário de entregas (requisições) ===== */
export const mockCalendario = (): CalendarioReq[] => [
  { id: "REQ-1001", data: "2025-11-12", titulo: "REQ Materiais OP 340-119", op: "OP-2301" },
  { id: "REQ-1002", data: "2025-11-13", titulo: "REQ Materiais OP 290-332", op: "OP-2279" },
  { id: "REQ-1003", data: "2025-11-22", titulo: "REQ Materiais OP 370-044", op: "OP-2310" },
];

/** ===== Plano de Ação (Kanban) ===== */
export const mockPlanoAcao = (): PlanoAcaoCard[] => [
  { id: "K-1", titulo: "Padronizar checklist setor 1.1", responsavel: "Equipe Qualidade", prazo: "2025-11-24", status: "nao_planejado" },
  { id: "K-2", titulo: "Padronizar checklist setor 1.2", responsavel: "Equipe Qualidade", prazo: "2025-11-28", status: "nao_planejado" },
  { id: "K-3", titulo: "Revisão do POP de laminação",   responsavel: "Eng. Produção",     prazo: "2025-11-18", status: "andamento" },
  { id: "K-4", titulo: "Auditoria 5S setor pintura",    responsavel: "Qualidade",         prazo: "2025-11-20", status: "andamento" },
  { id: "K-5", titulo: "Treinamento EPI concluído",      responsavel: "RH + Segurança",    prazo: "2025-11-05", status: "finalizado" },
];

/** ===== Utilidades simples para mock ===== */
export const groupPlanoAcao = () => {
  const items = mockPlanoAcao();
  return {
    nao_planejados: items.filter(i => i.status === "nao_planejado"),
    andamento:      items.filter(i => i.status === "andamento"),
    finalizado:     items.filter(i => i.status === "finalizado"),
  };
};
