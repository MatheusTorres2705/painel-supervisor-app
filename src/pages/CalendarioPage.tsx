// src/pages/CalendarioPage.tsx
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

/* =================== Tipos =================== */
type StatusReq = "Planejada" | "Atrasada" | "Entregue Parcial" | "Concluída";

type ItemReq = {
  cod: string;
  desc: string;
  qtd: number;
  un: string;
};

type Requisicao = {
  id: string;            // RQ-0001
  dataPlan: string;      // YYYY-MM-DD
  fornecedor: string;
  status: StatusReq;
  obs?: string;
  itens: ItemReq[];
};

/* =================== Mock =================== */
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
const toBR = (ymd: string) => ymd.split("-").reverse().join("/");

const today = new Date();

function genMockRequisicoes(baseMonth: Date): Requisicao[] {
  const y = baseMonth.getFullYear();
  const m = baseMonth.getMonth() + 1;
  const d = (n: number) => `${y}-${String(m).padStart(2, "0")}-${String(n).padStart(2, "0")}`;

  return [
    {
      id: "RQ-0001",
      dataPlan: d(3),
      fornecedor: "VoltMax",
      status: "Planejada",
      itens: [
        { cod: "QE-500", desc: "Quadro Elétrico 24V", qtd: 1, un: "un" },
        { cod: "CB-300", desc: "Cabo 16mm", qtd: 25, un: "m" },
      ],
    },
    {
      id: "RQ-0002",
      dataPlan: d(3),
      fornecedor: "TintaSul",
      status: "Atrasada",
      itens: [
        { cod: "PR-010", desc: "Primer Epóxi 4:1", qtd: 8, un: "kg" },
        { cod: "LI-044", desc: "Lixa d’água 1200", qtd: 40, un: "pc" },
      ],
    },
    {
      id: "RQ-0003",
      dataPlan: d(8),
      fornecedor: "NauticParts",
      status: "Entregue Parcial",
      itens: [{ cod: "TC-114", desc: "Tanque Combustível 300L", qtd: 1, un: "un" }],
    },
    {
      id: "RQ-0004",
      dataPlan: d(15),
      fornecedor: "Metalbras",
      status: "Planejada",
      itens: [{ cod: "AL-001", desc: "Alumínio Chapa 2mm", qtd: 10, un: "pc" }],
    },
    {
      id: "RQ-0005",
      dataPlan: d(22),
      fornecedor: "Abratex",
      status: "Concluída",
      itens: [{ cod: "LI-080", desc: "Lixa 800", qtd: 50, un: "pc" }],
    },
    {
      id: "RQ-0006",
      dataPlan: d(28),
      fornecedor: "EletroMarine",
      status: "Planejada",
      itens: [{ cod: "CH-220", desc: "Chicote Elétrico Console", qtd: 1, un: "un" }],
    },
  ];
}

/* =================== Helpers Calendário =================== */
const monthName = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function getGridDays(current: Date) {
  // grade começando no domingo até sábado (6 linhas máximo)
  const start = startOfMonth(current);
  const end = endOfMonth(current);
  const startIdx = start.getDay(); // 0..6 (0=dom)
  const daysInMonth = end.getDate();

  const grid: (Date | null)[] = [];
  // vazios antes
  for (let i = 0; i < startIdx; i++) grid.push(null);
  // dias do mês
  for (let d = 1; d <= daysInMonth; d++) {
    grid.push(new Date(current.getFullYear(), current.getMonth(), d));
  }
  // completa até múltiplo de 7
  while (grid.length % 7 !== 0) grid.push(null);
  return grid;
}

/* =================== Cores Status =================== */
function statusBadgeVariant(s: StatusReq): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "Planejada":
      return "default";
    case "Atrasada":
      return "destructive";
    case "Entregue Parcial":
      return "secondary";
    case "Concluída":
      return "outline";
    default:
      return "default";
  }
}

/* =================== Página =================== */
export default function CalendarioPage() {
  const [current, setCurrent] = useState<Date>(new Date(today.getFullYear(), today.getMonth(), 1));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"Todos" | StatusReq>("Todos");

  // Dados mock do mês atual
  const [data] = useState<Requisicao[]>(() => genMockRequisicoes(current));

  // Derivados
  const grid = useMemo(() => getGridDays(current), [current]);

  const filtered = useMemo(() => {
    return data.filter((r) => {
      // filtra por mês corrente
      const d = new Date(r.dataPlan);
      if (d.getMonth() !== current.getMonth() || d.getFullYear() !== current.getFullYear())
        return false;
      // busca
      if (q.trim()) {
        const k = q.trim().toLowerCase();
        const hay = `${r.id} ${r.fornecedor} ${r.status} ${r.itens.map(i => `${i.cod} ${i.desc}`).join(" ")}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      // status
      if (status !== "Todos" && r.status !== status) return false;
      return true;
    });
  }, [data, current, q, status]);

  // Agrupa por data (YYYY-MM-DD)
  const byDate = useMemo(() => {
    const map: Record<string, Requisicao[]> = {};
    for (const r of filtered) {
      (map[r.dataPlan] ||= []).push(r);
    }
    return map;
  }, [filtered]);

  // Dia selecionado na grade
  const [selDay, setSelDay] = useState<string | null>(null);

  // Dialog de requisição
  const [openReq, setOpenReq] = useState(false);
  const [req, setReq] = useState<Requisicao | null>(null);
  const openReqDialog = (r: Requisicao) => {
    setReq(r);
    setOpenReq(true);
  };

  // Export do dia
  const exportCsv = () => {
    if (!selDay) return;
    const list = byDate[selDay] || [];
    const header = ["id", "data", "fornecedor", "status", "cod", "desc", "qtd", "un"];
    const rows: (string | number)[][] = [];
    for (const r of list) {
      for (const i of r.itens) {
        rows.push([r.id, r.dataPlan, r.fornecedor, r.status, i.cod, i.desc, i.qtd, i.un]);
      }
    }
    const csv = [header, ...rows]
      .map(r => r.map(v => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendario_${selDay}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // Cabeçalho da semana (Dom..Sáb)
  const week = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="space-y-4">
      {/* Filtros topo */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrent((d) => addMonths(d, -1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h3 className="text-lg font-semibold capitalize">{monthName(current)}</h3>
              <Button variant="outline" size="icon" onClick={() => setCurrent((d) => addMonths(d, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-end gap-2">
              <div className="w-56">
                <Input
                  placeholder="Buscar por ID, fornecedor ou item…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="Todos">Todos status</option>
                <option value="Planejada">Planejada</option>
                <option value="Atrasada">Atrasada</option>
                <option value="Entregue Parcial">Entregue Parcial</option>
                <option value="Concluída">Concluída</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Clique em um dia para ver as requisições planejadas. Clique em uma requisição para abrir os produtos.
        </CardContent>
      </Card>

      {/* Grade do calendário */}
      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground px-1 mb-2">
            {week.map((w) => (
              <div key={w} className="text-center">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {grid.map((d, idx) => {
              if (!d) {
                return <div key={idx} className="h-28 rounded-xl border border-dashed" />;
              }
              const ymd = toYMD(d);
              const count = (byDate[ymd]?.length ?? 0);
              const isToday =
                d.getFullYear() === today.getFullYear() &&
                d.getMonth() === today.getMonth() &&
                d.getDate() === today.getDate();

              return (
                <button
                  type="button"
                  key={ymd}
                  onClick={() => setSelDay(ymd)}
                  className={`h-28 w-full rounded-xl border text-left p-2 hover:shadow-sm transition ${
                    selDay === ymd ? "ring-2 ring-primary" : ""
                  } ${isToday ? "border-primary" : ""}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${isToday ? "font-semibold" : ""}`}>
                      {d.getDate()}
                    </span>
                    {count > 0 && (
                      <Badge variant="secondary">{count}</Badge>
                    )}
                  </div>

                  {/* Preview das primeiras 2 requisições */}
                  <div className="mt-2 space-y-1">
                    {(byDate[ymd] || []).slice(0, 2).map((r) => (
                      <div
                        key={r.id}
                        className="truncate rounded-lg border px-2 py-1 text-[11px] hover:bg-muted cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          openReqDialog(r);
                        }}
                        title={`${r.id} • ${r.fornecedor} • ${r.status}`}
                      >
                        <span className="font-medium">{r.id}</span>{" "}
                        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                        <div className="truncate text-muted-foreground">{r.fornecedor}</div>
                      </div>
                    ))}
                    {count > 2 && (
                      <div className="text-[11px] text-muted-foreground">
                        +{count - 2} mais…
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Painel do dia selecionado */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">
              {selDay ? `Requisições de ${toBR(selDay)}` : "Selecione um dia no calendário"}
            </h4>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={exportCsv}
                disabled={!selDay || !(byDate[selDay]?.length)}
                title="Exportar CSV do dia selecionado"
              >
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {selDay && (byDate[selDay]?.length ?? 0) > 0 ? (
            <div className="divide-y">
              <div className="grid grid-cols-12 px-4 py-2 text-xs text-muted-foreground">
                <div className="col-span-2">ID</div>
                <div className="col-span-4">Fornecedor</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-4 text-right">Produtos</div>
              </div>
              {byDate[selDay].map((r) => (
                <div key={r.id} className="grid grid-cols-12 items-center px-4 py-2 gap-2">
                  <div className="col-span-2 font-medium">{r.id}</div>
                  <div className="col-span-4">{r.fornecedor}</div>
                  <div className="col-span-2">
                    <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
                  </div>
                  <div className="col-span-4 text-right">
                    <Button size="sm" onClick={() => openReqDialog(r)}>
                      Ver produtos
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-sm text-muted-foreground">
              {selDay ? "Sem requisições para este dia." : "—"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de produtos da requisição */}
      <Dialog.Root open={openReq} onOpenChange={setOpenReq}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-2xl outline-none">
            <div className="flex items-start justify-between border-b pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">
                  {req?.id} • {req?.fornecedor}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  Planejada para {req ? toBR(req.dataPlan) : ""} • Status: {req?.status}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="mt-4 rounded-2xl border">
              <div className="grid grid-cols-12 px-3 py-2 text-xs text-muted-foreground">
                <div className="col-span-3">Código</div>
                <div className="col-span-6">Descrição</div>
                <div className="col-span-3 text-right">Qtd</div>
              </div>
              <div className="divide-y">
                {req?.itens.map((i) => (
                  <div key={i.cod} className="grid grid-cols-12 items-center px-3 py-2 gap-2">
                    <div className="col-span-3 font-medium">{i.cod}</div>
                    <div className="col-span-6">{i.desc}</div>
                    <div className="col-span-3 text-right">
                      {i.qtd} {i.un}
                    </div>
                  </div>
                ))}
                {(!req || req.itens.length === 0) && (
                  <div className="px-3 py-6 text-sm text-muted-foreground">Sem itens.</div>
                )}
              </div>
            </div>

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
