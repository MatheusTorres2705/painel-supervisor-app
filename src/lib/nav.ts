// src/lib/nav.ts
// Fonte única de verdade da navegação: alimenta a sidebar, o título da topbar
// e a busca global (⌘K). Antes isso era duas listas paralelas dentro do Layout.
import {
  CalendarDays,
  ClipboardList,
  Gauge,
  Grid3x3,
  Home,
  ListChecks,
  KanbanSquare,
  PackageSearch,
  PackageX,
  Target,
  Timer,
  UserX,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  /** Rota do NavLink. */
  path: string;
  /** Rótulo na sidebar. */
  label: string;
  icon: LucideIcon;
  /** Descrição curta usada na busca global. */
  hint?: string;
};

export const navItems: NavItem[] = [
  { path: "/dashboard", label: "Dashboard", icon: Home, hint: "Visão geral de indicadores" },
  { path: "/daily", label: "Daily da Produção", icon: ListChecks, hint: "Quadro de indicadores por galpão e setor" },
  { path: "/meta-producao", label: "Meta de Produção", icon: Target, hint: "Meta × realizado de HH da produção" },
  { path: "/ope", label: "OPE", icon: Gauge, hint: "Operacional de produção — atividades ÷ ponto" },
  { path: "/equipe", label: "Equipe", icon: Users, hint: "Colaboradores e desempenho" },
  { path: "/piramide", label: "Pirâmide", icon: Grid3x3, hint: "Competências e senioridade" },
  { path: "/atividades", label: "Atividades / OP", icon: ClipboardList, hint: "Planejamento de ordens de produção" },
  { path: "/materiais", label: "Materiais", icon: PackageSearch, hint: "Planejamento de materiais" },
  { path: "/lista-faltas", label: "Lista de Faltas", icon: PackageX, hint: "Materiais em falta por chassi — farol de pedido e entrega" },
  { path: "/calendario", label: "Calendário", icon: CalendarDays, hint: "Agenda de entregas" },
  { path: "/hora-extra", label: "Hora Extra", icon: Timer, hint: "Aprovação de horas extras" },
  { path: "/absenteismo", label: "Absenteísmo", icon: UserX, hint: "Faltas, HH perdido e reincidência" },
  { path: "/plano-acao", label: "Plano de Ação", icon: KanbanSquare, hint: "Quadro de ações" },
];

/**
 * Títulos de rotas que não aparecem na sidebar (detalhe/drill-down).
 * Mais específicas primeiro — `pageTitle` casa por prefixo.
 */
const extraTitles: { prefix: string; title: string }[] = [
  { prefix: "/atividades/alocacao", title: "Alocação de Recursos" },
  { prefix: "/equipe/", title: "Detalhe do Colaborador" },
];

/** Título exibido na topbar para um pathname. */
export function pageTitle(pathname: string): string {
  const extra = extraTitles.find((e) => pathname.startsWith(e.prefix));
  if (extra) return extra.title;

  const item = navItems.find(
    (i) => pathname === i.path || pathname.startsWith(`${i.path}/`)
  );
  return item?.label ?? "Painel Supervisor";
}
