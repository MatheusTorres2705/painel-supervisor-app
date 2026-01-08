// src/components/Layout.tsx
import React from "react";
import type { PropsWithChildren } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Home, Users, ClipboardList, PackageSearch, CalendarDays, KanbanSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthProvider";

// Simple local Badge component to avoid dependency on a missing module.
// Keeps the same API used in this file: <Badge variant="outline" className="...">...</Badge>
type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { variant?: "outline" | "default" };
export const Badge: React.FC<BadgeProps> = ({ variant = "default", className = "", children, ...props }) => {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium";
  const variants: Record<string, string> = {
    outline: "border bg-transparent",
    default: "bg-secondary text-secondary-foreground",
  };
  const classes = `${base} ${variants[variant] ?? ""} ${className}`.trim();
  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
};

export const Layout: React.FC<PropsWithChildren> = ({ children }) => {
  const { pathname } = useLocation();
  const { user, logout } = useAuth();

  const Item: React.FC<{ to: string; icon: React.ReactNode; label: string }> = ({ to, icon, label }) => (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 w-full rounded-xl px-3 py-2 text-sm transition ${
          isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
        }`
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );

  const title =
    pathname.startsWith("/dashboard")
      ? "Dashboard"
      : pathname.startsWith("/equipe")
      ? "Equipe"
      : pathname.startsWith("/atividades/alocacao")
      ? "Alocação de Recursos"
      : pathname.startsWith("/atividades")
      ? "Planejamento de Atividades"
      : pathname.startsWith("/hora-extra")
      ? "Hora Extra"
      : pathname.startsWith("/materiais")
      ? "Planejamento de Materiais"
      : pathname.startsWith("/calendario")
      ? "Calendário de Entregas"
      : "Plano de Ação";

  return (
    <div className="h-[calc(100vh-2rem)] my-4 mx-auto max-w-[1400px] rounded-3xl border bg-card overflow-hidden shadow-sm">
      <div className="grid grid-cols-12 h-full">
        {/* Sidebar */}
        <aside className="col-span-12 md:col-span-3 lg:col-span-2 border-r p-3 bg-muted/40">
          <div className="px-2 py-3">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-2xl grid place-items-center bg-primary text-primary-foreground font-bold">NX</div>
              <div>
                <p className="font-semibold leading-tight">Painel Supervisor</p>
                <p className="text-xs text-muted-foreground">Operações & Planejamento</p>
              </div>
            </div>

            <div className="space-y-1">
              <Item to="/dashboard" icon={<Home className="h-4 w-4" />} label="Dashboard" />
              <Item to="/equipe" icon={<Users className="h-4 w-4" />} label="Equipe" />
              <Item to="/atividades" icon={<ClipboardList className="h-4 w-4" />} label="Atividades / OP" />
              <Item to="/materiais" icon={<PackageSearch className="h-4 w-4" />} label="Materiais" />
              <Item to="/calendario" icon={<CalendarDays className="h-4 w-4" />} label="Calendário" />
              <Item to="/hora-extra" icon={<KanbanSquare className="h-4 w-4" />} label="Hora Extra" />
              <Item to="/plano-acao" icon={<KanbanSquare className="h-4 w-4" />} label="Plano de Ação" />
            </div>
          </div>
        </aside>

        {/* Content */}
        <main className="col-span-12 md:col-span-9 lg:col-span-10 bg-background">
          {/* Topbar */}
          <div className="flex items-center justify-between px-5 py-3 border-b bg-background/60 backdrop-blur sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <h1 className="text-lg md:text-xl font-semibold tracking-tight">{title}</h1>
              <Badge variant="outline" className="hidden md:inline-flex">
                Linha A
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Input placeholder="Pesquisar…" className="hidden md:block w-64" />
              <span className="text-sm text-muted-foreground hidden md:block">{user?.name}</span>
              <Button variant="outline" size="sm" onClick={logout}>
                Sair
              </Button>
            </div>
          </div>

          <div className="p-5 space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
};
