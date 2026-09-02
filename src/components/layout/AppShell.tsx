// src/components/layout/AppShell.tsx
// Shell da aplicação: rail de navegação + topbar + área de conteúdo.
//
// Substitui o antigo Layout.tsx, que era um cartão flutuante de 1400px sem
// nenhuma navegação mobile e com o título derivado de uma cadeia de ternários.
// Aqui o shell é dono do scroll — as páginas não precisam mais de calc(100vh-N).
import * as React from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Menu, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/auth/AuthProvider";
import { navItems, pageTitle, type NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import logoWhite from "@/assets/nx_boats_white.svg";

/* ============================ Navegação ============================ */

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          // min-h-11 = 44px: alvo de toque para tablet no chão de fábrica.
          "relative flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-primary-foreground/10 font-medium text-primary-foreground"
            : "text-primary-foreground/70 hover:bg-primary-foreground/5 hover:text-primary-foreground"
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Indicador teal — a marca do item ativo. */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-accent transition-opacity",
              isActive ? "opacity-100" : "opacity-0"
            )}
          />
          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed ? <span className="truncate">{item.label}</span> : null}
        </>
      )}
    </NavLink>
  );
}

function SidebarContent({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { logout } = useAuth();

  return (
    <div className="flex h-full flex-col bg-primary text-primary-foreground">
      {/* Marca */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-5",
          collapsed && "justify-center px-0"
        )}
      >
        <img
          src={logoWhite}
          alt="NX Boats"
          className={cn("w-auto", collapsed ? "h-6" : "h-7")}
        />
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">
              Painel Supervisor
            </p>
            <p className="truncate text-2xs text-primary-foreground/60">
              Operações &amp; Planejamento
            </p>
          </div>
        ) : null}
      </div>

      <nav
        aria-label="Navegação principal"
        className="scrollbar-slim flex-1 space-y-1 overflow-y-auto px-2 pb-2"
      >
        {navItems.map((item) => (
          <NavItemLink
            key={item.path}
            item={item}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-primary-foreground/10 p-2">
        <button
          type="button"
          onClick={logout}
          title={collapsed ? "Sair" : undefined}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm text-primary-foreground/70 transition-colors",
            "hover:bg-primary-foreground/5 hover:text-primary-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {!collapsed ? <span>Sair</span> : null}
        </button>
      </div>
    </div>
  );
}

/* ========================= Busca global (⌘K) ========================= */

function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden p-0">
        <Command>
          <CommandInput placeholder="Buscar página…" />
          <CommandList>
            <CommandEmpty>Nenhum resultado.</CommandEmpty>
            <CommandGroup heading="Páginas">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.path}
                    value={`${item.label} ${item.hint ?? ""}`}
                    onSelect={() => go(item.path)}
                  >
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{item.label}</span>
                    {item.hint ? (
                      <span className="ml-2 truncate text-2xs text-muted-foreground">
                        {item.hint}
                      </span>
                    ) : null}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/* ============================== Shell ============================== */

function initials(name?: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")).toUpperCase();
}

export function AppShell() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  const title = pageTitle(pathname);

  // Fecha o drawer ao trocar de rota.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // ⌘K / Ctrl+K abre a busca.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Rail — colapsado em md, completo em lg. */}
      <aside className="hidden shrink-0 md:block md:w-16 lg:w-60">
        <div className="hidden h-full md:block lg:hidden">
          <SidebarContent collapsed />
        </div>
        <div className="hidden h-full lg:block">
          <SidebarContent collapsed={false} />
        </div>
      </aside>

      {/* Drawer mobile */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu de navegação"
            className="absolute inset-y-0 left-0 w-64 shadow-overlay animate-in slide-in-from-left"
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Fechar menu"
              className="absolute right-2 top-2 z-10 rounded-md p-2 text-primary-foreground/70 hover:bg-primary-foreground/10 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/60"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent collapsed={false} />
          </div>
        </div>
      ) : null}

      {/* Conteúdo */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card/80 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground md:text-lg">
            {title}
          </h1>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-2xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Buscar</span>
            <kbd className="ml-2 rounded border border-border bg-muted px-1.5 py-0.5 font-sans text-2xs">
              ⌘K
            </kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="sm:hidden"
            onClick={() => setSearchOpen(true)}
            aria-label="Buscar"
          >
            <Search className="h-5 w-5" />
          </Button>

          <div className="flex items-center gap-2 pl-1">
            <span className="hidden max-w-[12rem] truncate text-sm text-muted-foreground lg:block">
              {user?.name}
            </span>
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-2xs font-semibold text-primary-foreground"
              title={user?.name}
            >
              {initials(user?.name)}
            </span>
          </div>
        </header>

        <main className="scrollbar-slim flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}
