// src/pages/CalendarioPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, X, RefreshCw, CalendarDays } from "lucide-react";

import { obterReg } from "@/lib/obterReg";
import { cn } from "@/lib/utils";

/* =================== Tipos =================== */
type ViewMode = "mes" | "semana" | "dia";

type AgendaItem = {
  codNat: number;
  descrNat: string;
  nunota: number;
  sequencia: number;
  pendente: string; // 'S'|'N'
  chassi: string;
  idiproc: number;
  codprod: number;
  descrprod: string;
  dtEntrega: string; // YYYY-MM-DD
};

type DayKey = string; // YYYY-MM-DD

/* =================== Utils =================== */
const pad2 = (n: number) => String(n).padStart(2, "0");

const toYMD = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const toBR = (ymd: string) => ymd.split("-").reverse().join("/");

const monthName = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

// ✅ semana começa na segunda (weekStartsOn=1). Se quiser domingo, troque para 0.
function startOfWeek(d: Date, weekStartsOn: 0 | 1 = 1) {
  const x = new Date(d);
  const day = x.getDay(); // 0=dom..6=sab
  const diff = (day - weekStartsOn + 7) % 7;
  x.setDate(x.getDate() - diff);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfWeek(d: Date, weekStartsOn: 0 | 1 = 1) {
  const s = startOfWeek(d, weekStartsOn);
  return addDays(s, 6);
}

function getGridDaysMonth(current: Date) {
  const start = startOfMonth(current);
  const end = endOfMonth(current);
  const startIdx = start.getDay(); // 0..6 (0=dom)
  const daysInMonth = end.getDate();

  const grid: (Date | null)[] = [];
  for (let i = 0; i < startIdx; i++) grid.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(new Date(current.getFullYear(), current.getMonth(), d));
  }
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

function titleForRange(view: ViewMode, anchor: Date) {
  if (view === "mes") return monthName(anchor);
  if (view === "semana") {
    const s = startOfWeek(anchor, 1);
    const e = endOfWeek(anchor, 1);
    return `Semana • ${toBR(toYMD(s))} — ${toBR(toYMD(e))}`;
  }
  return `Dia • ${toBR(toYMD(anchor))}`;
}

/* =================== Página =================== */
export default function CalendarioPage() {
  const today = new Date();

  // ✅ "anchor" é a data base da visão atual (mês/semana/dia)
  const [anchor, setAnchor] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [view, setView] = useState<ViewMode>("mes");

  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [setor, setSetor] = useState<string>("Todos"); // CODNAT
  const [data, setData] = useState<AgendaItem[]>([]);

  // selecionado (dia) — útil para lista do dia e para mudar visão
  const [selDay, setSelDay] = useState<DayKey | null>(null);

  // Dialog
  const [open, setOpen] = useState(false);
  const [item, setItem] = useState<AgendaItem | null>(null);
  const openDialog = (it: AgendaItem) => {
    setItem(it);
    setOpen(true);
  };

  // Range da query conforme visão (sempre buscamos o range inteiro)
  const range = useMemo(() => {
    if (view === "mes") {
      const s = startOfMonth(anchor);
      const e = endOfMonth(anchor);
      return { start: s, end: e };
    }
    if (view === "semana") {
      const s = startOfWeek(anchor, 1);
      const e = endOfWeek(anchor, 1);
      return { start: s, end: e };
    }
    // dia
    return { start: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()), end: new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate()) };
  }, [view, anchor]);

  const loadRange = async () => {
    try {
      setErro(null);
      setLoading(true);

      const ini = toYMD(range.start);
      const fimExclusive = toYMD(addDays(range.end, 1));

      const sql = `
        SELECT DISTINCT  
          CAB.CODNAT,
          NAT.DESCRNAT,
          ITE.NUNOTA,
          ITE.SEQUENCIA , 
          CAB.PENDENTE,
          PRJ.IDENTIFICACAO AS CHASSI,
          CAB.IDIPROC,
          ITE.CODPROD AS CODPROD,
          PRO.DESCRPROD,
          TO_CHAR(ITE.AD_DTENTREGA,'YYYY-MM-DD') AS DTENTREGA
        FROM TGFCAB CAB
        JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA
        JOIN TGFNAT NAT ON NAT.CODNAT = CAB.CODNAT
        JOIN TPRIPROC PROC ON PROC.IDIPROC = CAB.IDIPROC
        JOIN TCSPRJ PRJ ON PRJ.CODPROJ = PROC.AD_CODPROJ
        JOIN TGFPRO PRO ON PRO.CODPROD = ITE.CODPROD
        WHERE CAB.CODTIPOPER = 450
          AND NOT PROC.STATUSPROC IN ('C', 'F')
          AND ITE.AD_CODPRODKIT IS NULL
          AND ITE.AD_DTENTREGA >= TO_DATE('${ini}','YYYY-MM-DD')
          AND ITE.AD_DTENTREGA <  TO_DATE('${fimExclusive}','YYYY-MM-DD')
      `.trim();

      const rows = await obterReg(sql);

      const mapped: AgendaItem[] = (rows || []).map((r: any) => ({
        codNat: Number(r.CODNAT ?? 0),
        descrNat: String(r.DESCRNAT ?? ""),
        nunota: Number(r.NUNOTA ?? 0),
        sequencia: Number(r.SEQUENCIA ?? 0),
        pendente: String(r.PENDENTE ?? ""),
        chassi: String(r.CHASSI ?? ""),
        idiproc: Number(r.IDIPROC ?? 0),
        codprod: Number(r.CODPROD ?? 0),
        descrprod: String(r.DESCRPROD ?? ""),
        dtEntrega: String(r.DTENTREGA ?? ""),
      }));

      setData(mapped);

      // se não tem dia selecionado e estamos em visão dia, fixa no anchor
      if (view === "dia") {
        const ymd = toYMD(anchor);
        setSelDay(ymd);
      }

      // se selDay ficou fora do range atual, limpa
      if (selDay) {
        const sd = new Date(selDay);
        if (sd < range.start || sd > range.end) setSelDay(null);
      }
    } catch (e: any) {
      console.error("[CalendarioPage] loadRange:", e);
      setErro(e?.message || "Falha ao carregar agendamentos.");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor]);

  // Setores disponíveis
  const setoresDisponiveis = useMemo(() => {
    const m = new Map<number, string>();
    data.forEach((x) => {
      if (!m.has(x.codNat)) m.set(x.codNat, x.descrNat || String(x.codNat));
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [data]);

  // filtros
  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return data.filter((x) => {
      if (setor !== "Todos" && String(x.codNat) !== String(setor)) return false;
      if (k) {
        const hay = `${x.chassi} ${x.descrprod} ${x.codprod} ${x.nunota} ${x.sequencia} ${x.descrNat} ${x.codNat}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }, [data, q, setor]);

  // agrupa por data (YYYY-MM-DD)
  const byDate = useMemo(() => {
    const map: Record<DayKey, AgendaItem[]> = {};
    for (const x of filtered) {
      if (!x.dtEntrega) continue;
      (map[x.dtEntrega] ||= []).push(x);
    }
    Object.keys(map).forEach((k) => {
      map[k].sort((a, b) => {
        const c = (a.chassi || "").localeCompare(b.chassi || "", "pt-BR");
        if (c !== 0) return c;
        return (a.descrprod || "").localeCompare(b.descrprod || "", "pt-BR");
      });
    });
    return map;
  }, [filtered]);

  // ======= Views =======
  const monthGrid = useMemo(() => getGridDaysMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), [anchor]);

  const weekDays = useMemo(() => {
    const s = startOfWeek(anchor, 1);
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [anchor]);

  const dayKey = useMemo(() => toYMD(anchor), [anchor]);

  const dayList = useMemo(() => {
    const key = selDay || (view === "dia" ? dayKey : null);
    return key ? (byDate[key] || []) : [];
  }, [byDate, selDay, view, dayKey]);

  const weekHeader = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]; // como começamos na segunda

  // Navegação conforme visão
  const goPrev = () => {
    if (view === "mes") setAnchor((d) => addMonths(new Date(d.getFullYear(), d.getMonth(), 1), -1));
    else if (view === "semana") setAnchor((d) => addDays(d, -7));
    else setAnchor((d) => addDays(d, -1));
  };
  const goNext = () => {
    if (view === "mes") setAnchor((d) => addMonths(new Date(d.getFullYear(), d.getMonth(), 1), 1));
    else if (view === "semana") setAnchor((d) => addDays(d, 7));
    else setAnchor((d) => addDays(d, 1));
  };
  const goToday = () => {
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    setAnchor(t);
    setSelDay(toYMD(t));
  };

  // Export CSV do dia selecionado
  const exportCsv = () => {
    const key = selDay || (view === "dia" ? dayKey : null);
    if (!key) return;

    const list = byDate[key] || [];
    if (!list.length) return;

    const header = ["data", "codnat", "setor", "chassi", "idiproc", "nunota", "sequencia", "codprod", "descrprod", "pendente"];
    const rows = list.map((x) => [
      key,
      x.codNat,
      x.descrNat,
      x.chassi,
      x.idiproc,
      x.nunota,
      x.sequencia,
      x.codprod,
      x.descrprod,
      x.pendente,
    ]);

    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agendamentos_${key}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Header geral */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* navegação */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <h3 className="text-lg font-semibold capitalize">
                {titleForRange(view, anchor)}
              </h3>

              <Button variant="outline" size="icon" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>

              <Button variant="outline" size="sm" className="ml-2 gap-2" onClick={goToday}>
                <CalendarDays className="h-4 w-4" />
                Hoje
              </Button>

              <Button variant="outline" size="sm" className="gap-2" onClick={loadRange} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                Atualizar
              </Button>

              {loading && <Badge variant="secondary">Carregando…</Badge>}
            </div>

            {/* view switch + filtros */}
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <div className="inline-flex rounded-md border bg-background p-1">
                <button
                  type="button"
                  onClick={() => setView("mes")}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md transition",
                    view === "mes" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  Mês
                </button>
                <button
                  type="button"
                  onClick={() => setView("semana")}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md transition",
                    view === "semana" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  Semana
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView("dia");
                    const k = selDay || toYMD(anchor);
                    setSelDay(k);
                    setAnchor(new Date(k));
                  }}
                  className={cn(
                    "px-3 py-1.5 text-sm rounded-md transition",
                    view === "dia" ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  )}
                >
                  Dia
                </button>
              </div>

              <div className="w-full md:w-72">
                <Input
                  placeholder="Buscar por chassi, produto, NUNOTA…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>

              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
              >
                <option value="Todos">Todos os setores</option>
                {setoresDisponiveis.map(([cod, nome]) => (
                  <option key={cod} value={String(cod)}>
                    {cod} - {nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {erro && <div className="mt-2 text-sm text-red-600">{erro}</div>}

          <div className="mt-2 text-xs text-muted-foreground">
            Cards: <b>Chassi</b> e <b>Produto</b>. Clique no card para detalhar.
          </div>
        </CardHeader>
      </Card>

      {/* =================== VIEW: MÊS =================== */}
      {view === "mes" && (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground px-1 mb-2">
              {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((w) => (
                <div key={w} className="text-center">{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {monthGrid.map((d, idx) => {
                if (!d) return <div key={idx} className="h-32 rounded-xl border border-dashed" />;

                const ymd = toYMD(d);
                const list = byDate[ymd] || [];
                const count = list.length;

                const isToday =
                  d.getFullYear() === today.getFullYear() &&
                  d.getMonth() === today.getMonth() &&
                  d.getDate() === today.getDate();

                return (
                  <button
                    type="button"
                    key={ymd}
                    onClick={() => {
                      setSelDay(ymd);
                      // se quiser, no clique do mês já muda para dia:
                      // setView("dia"); setAnchor(new Date(ymd));
                    }}
                    className={cn(
                      "h-32 w-full rounded-xl border text-left p-2 hover:shadow-sm transition",
                      selDay === ymd && "ring-2 ring-primary",
                      isToday && "border-primary"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn("text-xs", isToday && "font-semibold")}>{d.getDate()}</span>
                      {count > 0 && <Badge variant="secondary">{count}</Badge>}
                    </div>

                    <div className="mt-2 space-y-1">
                      {list.slice(0, 3).map((x) => (
                        <div
                          key={`${x.nunota}-${x.sequencia}-${x.codprod}`}
                          className="rounded-lg border px-2 py-1 text-[11px] hover:bg-muted cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDialog(x);
                          }}
                          title={`Chassi: ${x.chassi}\nProduto: ${x.descrprod}`}
                        >
                          <div className="truncate">
                            <span className="font-medium">Chassi:</span> {x.chassi}
                          </div>
                          <div className="truncate text-muted-foreground">
                            <span className="font-medium">Produto:</span> {x.descrprod}
                          </div>
                        </div>
                      ))}
                      {count > 3 && (
                        <div className="text-[11px] text-muted-foreground">+{count - 3} mais…</div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* =================== VIEW: SEMANA =================== */}
      {view === "semana" && (
        <Card>
          <CardContent className="p-3">
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((d, i) => {
                const ymd = toYMD(d);
                const list = byDate[ymd] || [];
                const isToday =
                  d.getFullYear() === today.getFullYear() &&
                  d.getMonth() === today.getMonth() &&
                  d.getDate() === today.getDate();

                return (
                  <div key={ymd} className={cn("rounded-2xl border p-2", isToday && "border-primary")}>
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold">
                        {weekHeader[i]} • {pad2(d.getDate())}/{pad2(d.getMonth() + 1)}
                      </div>
                      {list.length > 0 && <Badge variant="secondary">{list.length}</Badge>}
                    </div>

                    <div className="mt-2 space-y-2 max-h-[320px] overflow-auto pr-1">
                      {list.length ? (
                        list.map((x) => (
                          <button
                            key={`${x.nunota}-${x.sequencia}-${x.codprod}`}
                            type="button"
                            className="w-full text-left rounded-xl border px-2 py-2 hover:bg-muted transition"
                            onClick={() => {
                              setSelDay(ymd);
                              openDialog(x);
                            }}
                            title={`Chassi: ${x.chassi}\nProduto: ${x.descrprod}`}
                          >
                            <div className="text-[11px] font-medium truncate">
                              Chassi: {x.chassi}
                            </div>
                            <div className="text-[11px] text-muted-foreground truncate">
                              Produto: {x.descrprod}
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="text-xs text-muted-foreground py-6 text-center">
                          Sem agendamentos
                        </div>
                      )}
                    </div>

                    <div className="mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setSelDay(ymd);
                          setView("dia");
                          setAnchor(new Date(ymd));
                        }}
                      >
                        Abrir dia
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* =================== VIEW: DIA =================== */}
      {view === "dia" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold">
                Agendamentos do dia {toBR(selDay || dayKey)}
              </h4>

              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={exportCsv}
                disabled={dayList.length === 0}
              >
                <Download className="h-4 w-4" />
                CSV do dia
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {dayList.length ? (
              <div className="divide-y">
                <div className="grid grid-cols-12 px-4 py-2 text-xs text-muted-foreground">
                  <div className="col-span-3">Chassi</div>
                  <div className="col-span-5">Produto</div>
                  <div className="col-span-2">Setor</div>
                  <div className="col-span-2 text-right">Ação</div>
                </div>

                {dayList.map((x) => (
                  <div
                    key={`${x.nunota}-${x.sequencia}-${x.codprod}`}
                    className="grid grid-cols-12 items-center px-4 py-2 gap-2"
                  >
                    <div className="col-span-3 font-medium truncate">{x.chassi}</div>
                    <div className="col-span-5 truncate">{x.descrprod}</div>
                    <div className="col-span-2 truncate text-xs text-muted-foreground">
                      {x.codNat} - {x.descrNat}
                    </div>
                    <div className="col-span-2 text-right">
                      <Button size="sm" onClick={() => openDialog(x)}>
                        Detalhar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-10 text-sm text-muted-foreground text-center">
                Sem agendamentos para este dia.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog detalhe */}
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[780px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-2xl outline-none">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">Detalhe do agendamento</Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  {item ? `Data: ${toBR(item.dtEntrega)}` : ""}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            {item ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-2xl border p-3">
                  <div className="text-sm">
                    <div className="font-medium whitespace-pre-line">
                      {`Chassi: ${item.chassi}\nProduto: ${item.descrprod}`}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      CODPROD: {item.codprod} • NUNOTA: {item.nunota} • SEQ: {item.sequencia} • IDIPROC: {item.idiproc}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Setor: {item.codNat} - {item.descrNat} • Pendente: {item.pendente}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <Dialog.Close asChild>
                <Button variant="outline">Fechar</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
