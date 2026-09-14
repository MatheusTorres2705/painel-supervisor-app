// src/components/patterns/PresentationShell.tsx
// Modo apresentação (TV / painel de parede). Portado do painel-diretoria.
//
// Escala: sem `zoom` (ele cria um novo espaço de coordenadas e desloca todo
// `position: fixed` descendente — diálogos, popovers). Em vez disso a fonte do
// <html> é ajustada enquanto a apresentação está no ar: todo espaçamento e
// tipografia do Tailwind é `rem`, e `rem` é relativo à raiz — então cresce tudo
// junto, e `fixed`, `vh` e o ResponsiveContainer do recharts continuam corretos.
//
// Diferença em relação ao original: sem alternância de tema escuro, porque este
// projeto ainda só tem tokens claros (ver docs/ROADMAP-UI.md, item 8).
import * as React from "react";
import { Maximize2, Minimize2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

const CHAVE_ESCALA = "nx-apresentacao-escala";
const ESCALA_MIN = 0.85;
const ESCALA_MAX = 1.8;
const PASSO = 0.05;

function lerEscala(padrao: number): number {
  try {
    const v = Number(window.localStorage.getItem(CHAVE_ESCALA));
    return Number.isFinite(v) && v >= ESCALA_MIN && v <= ESCALA_MAX ? v : padrao;
  } catch {
    return padrao;
  }
}

/** Botão que entra no modo apresentação. */
export function PresentationButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" onClick={onClick} aria-label="Modo apresentação">
      <Maximize2 className="h-4 w-4" />
      <span className="hidden sm:inline">Apresentação</span>
    </Button>
  );
}

export function PresentationShell({
  active,
  onExit,
  title,
  subtitle,
  icon,
  onRefresh,
  refreshMs = 5 * 60 * 1000,
  status,
  actions,
  children,
}: {
  active: boolean;
  onExit: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  /** Recarrega os dados periodicamente enquanto a tela fica na TV. */
  onRefresh?: () => void;
  refreshMs?: number;
  /** Texto curto à direita (ex.: "atualizando…"). */
  status?: React.ReactNode;
  /** Filtros que precisam continuar acessíveis durante a apresentação. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [escala, setEscala] = React.useState(() => lerEscala(1.3));
  const [relogio, setRelogio] = React.useState(() => new Date());

  // Callbacks em ref: os intervalos não devem reiniciar a cada render.
  const refreshRef = React.useRef(onRefresh);
  const exitRef = React.useRef(onExit);
  React.useEffect(() => {
    refreshRef.current = onRefresh;
    exitRef.current = onExit;
  }, [onRefresh, onExit]);

  React.useEffect(() => {
    if (!active) return;

    document.documentElement.requestFullscreen?.().catch(() => {
      /* o navegador pode negar */
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitRef.current();
      if (e.key === "+" || e.key === "=")
        setEscala((s) => Math.min(ESCALA_MAX, +(s + PASSO).toFixed(2)));
      if (e.key === "-")
        setEscala((s) => Math.max(ESCALA_MIN, +(s - PASSO).toFixed(2)));
    };
    window.addEventListener("keydown", onKey);

    // Sair do tela cheia pelo navegador (F11/Esc nativo) também encerra o modo.
    const onFullscreen = () => {
      if (!document.fullscreenElement) exitRef.current();
    };
    document.addEventListener("fullscreenchange", onFullscreen);

    const idRelogio = window.setInterval(() => setRelogio(new Date()), 1000);
    const idRefresh =
      refreshMs > 0
        ? window.setInterval(() => refreshRef.current?.(), refreshMs)
        : undefined;

    // Mantém a TV acordada enquanto a apresentação está no ar.
    let wakeLock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    nav.wakeLock
      ?.request("screen")
      .then((l) => {
        wakeLock = l;
      })
      .catch(() => {
        /* sem suporte */
      });

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.clearInterval(idRelogio);
      if (idRefresh) window.clearInterval(idRefresh);
      wakeLock?.release().catch(() => {
        /* já liberado */
      });
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {
          /* noop */
        });
      }
    };
  }, [active, refreshMs]);

  // Escala na raiz, restaurada ao sair.
  React.useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const anterior = root.style.fontSize;
    root.style.fontSize = `${escala * 100}%`;
    try {
      window.localStorage.setItem(CHAVE_ESCALA, String(escala));
    } catch {
      /* armazenamento indisponível */
    }
    return () => {
      root.style.fontSize = anterior;
    };
  }, [active, escala]);

  if (!active) return <>{children}</>;

  const hora = relogio.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    // z-40: acima do shell (topbar z-30), abaixo dos diálogos (z-50),
    // para que o detalhamento continue abrindo durante a apresentação.
    <div className="fixed inset-0 z-40 overflow-auto bg-background p-6 text-foreground scrollbar-slim">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? (
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {status ? (
            <span className="text-sm text-muted-foreground">{status}</span>
          ) : null}
          <span className="tabular mx-1 text-xl font-semibold text-muted-foreground">
            {hora}
          </span>
          {onRefresh ? (
            <Button variant="outline" size="icon" onClick={onRefresh} aria-label="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
          ) : null}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEscala((s) => Math.max(ESCALA_MIN, +(s - PASSO).toFixed(2)))}
            aria-label="Diminuir tamanho"
            title="Diminuir (−)"
            className="font-bold"
          >
            A−
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setEscala((s) => Math.min(ESCALA_MAX, +(s + PASSO).toFixed(2)))}
            aria-label="Aumentar tamanho"
            title="Aumentar (+)"
            className="font-bold"
          >
            A+
          </Button>
          <Button variant="outline" onClick={onExit}>
            <Minimize2 className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      {children}
    </div>
  );
}
