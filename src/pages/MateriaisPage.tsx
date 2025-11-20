// src/pages/MateriaisPage.tsx
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/overlays/SideSheet";
import { Download, Calendar, X } from "lucide-react";

/* ==================== Tipos ==================== */
type StatusMat = "Pendente" | "Planejado" | "Entregue";

type ItemMaterial = {
  id: number;
  codigo: string;
  descricao: string;
  qtd: number;
  unidade: string;
  fornecedor?: string;
  dtPlanejada?: string; // YYYY-MM-DD
  dtEntrega?: string;   // se entregue
  status: StatusMat;    // Pendente/Planejado/Entregue
};

type Barco = {
  op: string;         // OP-0001
  modelo: string;     // NX 340
  linha: string;      // Montagem, Pintura ...
  dtIni: string;      // YYYY-MM-DD
  dtFim: string;      // YYYY-MM-DD
  materiais: ItemMaterial[];
};

/* ==================== Mock ==================== */
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const today = new Date();
const plus = (n: number) => {
  const x = new Date(today);
  x.setDate(x.getDate() + n);
  return x;
};

function mockMateriais(): Barco[] {
  return [
    {
      op: "OP-0001",
      modelo: "NX 340",
      linha: "Montagem",
      dtIni: toYMD(today),
      dtFim: toYMD(plus(12)),
      materiais: [
        { id: 101, codigo: "AL-001", descricao: "Alumínio Chapa 2mm", qtd: 12, unidade: "pc", fornecedor: "Metalbras", status: "Pendente" },
        { id: 102, codigo: "TC-114", descricao: "Tanque Combustível 300L", qtd: 1, unidade: "un", fornecedor: "NauticParts", status: "Planejado", dtPlanejada: toYMD(plus(-1)) },
        { id: 103, codigo: "EL-220", descricao: "Chicote Elétrico Console", qtd: 1, unidade: "un", fornecedor: "EletroMarine", status: "Planejado", dtPlanejada: toYMD(plus(2)) },
        { id: 104, codigo: "GC-090", descricao: "Gel Coat Branco", qtd: 5, unidade: "kg", fornecedor: "TintaSul", status: "Pendente" },
      ],
    },
    {
      op: "OP-0002",
      modelo: "NX 370",
      linha: "Elétrica",
      dtIni: toYMD(plus(1)),
      dtFim: toYMD(plus(15)),
      materiais: [
        { id: 201, codigo: "QE-500", descricao: "Quadro Elétrico 24V", qtd: 1, unidade: "un", fornecedor: "VoltMax", status: "Planejado", dtPlanejada: toYMD(plus(1)) },
        { id: 202, codigo: "CX-012", descricao: "Caixa de Bateria", qtd: 2, unidade: "un", fornecedor: "VoltMax", status: "Pendente" },
        { id: 203, codigo: "CB-300", descricao: "Cabos 16mm", qtd: 30, unidade: "m", fornecedor: "Elastik", status: "Entregue", dtEntrega: toYMD(plus(-2)) },
      ],
    },
    {
      op: "OP-0003",
      modelo: "NX 410",
      linha: "Pintura",
      dtIni: toYMD(plus(-2)),
      dtFim: toYMD(plus(9)),
      materiais: [
        { id: 301, codigo: "PR-010", descricao: "Primer Epóxi 4:1", qtd: 10, unidade: "kg", fornecedor: "TintaSul", status: "Planejado", dtPlanejada: toYMD(plus(-3)) },
        { id: 302, codigo: "LI-044", descricao: "Lixa d’água 1200", qtd: 50, unidade: "pc", fornecedor: "Abratex", status: "Pendente" },
        { id: 303, codigo: "PO-777", descricao: "Polidor Corte Rápido", qtd: 3, unidade: "lt", fornecedor: "PoliPro", status: "Planejado", dtPlanejada: toYMD(plus(4)) },
      ],
    },
  ];
}

/* ==================== Utils ==================== */
const isPast = (ymd?: string) => (ymd ? ymd < toYMD(today) : false);
const isFutureOrToday = (ymd?: string) => (ymd ? ymd >= toYMD(today) : false);
const toBR = (ymd?: string) => (!ymd ? "" : ymd.split("-").reverse().join("/"));

/* ==================== Página ==================== */
export default function MateriaisPage() {
  const [barcos, setBarcos] = useState<Barco[]>(mockMateriais());

  // Filtros lista principal
  const [q, setQ] = useState("");
  const [linha, setLinha] = useState<"Todas" | "Montagem" | "Elétrica" | "Pintura">("Todas");
  const [ini, setIni] = useState<string>("");
  const [fin, setFin] = useState<string>("");

  const lista = useMemo(() => {
    return barcos.filter((b) => {
      const k = q.trim().toLowerCase();
      if (k) {
        const hay = `${b.op} ${b.modelo} ${b.linha}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      if (linha !== "Todas" && b.linha !== linha) return false;
      if (ini && b.dtFim < ini) return false;
      if (fin && b.dtIni > fin) return false;
      return true;
    });
  }, [barcos, q, linha, ini, fin]);

  // Sheet do barco selecionado
  const [sel, setSel] = useState<Barco | null>(null);
  const closeSheet = (open: boolean) => { if (!open) setSel(null); };

  // Derivados por coluna
  const pendentes = useMemo(() => (sel
    ? sel.materiais.filter((m) => m.status !== "Entregue" && !m.dtPlanejada)
    : []), [sel]);
  const planejadosAtrasados = useMemo(() => (sel
    ? sel.materiais.filter((m) => m.status !== "Entregue" && m.dtPlanejada && isPast(m.dtPlanejada))
    : []), [sel]);
  const entregaFutura = useMemo(() => (sel
    ? sel.materiais.filter((m) => m.status !== "Entregue" && m.dtPlanejada && isFutureOrToday(m.dtPlanejada))
    : []), [sel]);

  // Alterar data planejada
  const setDt = (id: number, ymd?: string) => {
    if (!sel) return;
    setBarcos((arr) =>
      arr.map((b) =>
        b.op !== sel.op
          ? b
          : {
              ...b,
              materiais: b.materiais.map((m) =>
                m.id === id ? { ...m, dtPlanejada: ymd, status: ymd ? "Planejado" : "Pendente" } : m
              ),
            }
      )
    );
  };

  // Ações rápidas
  const setHoje = (id: number) => setDt(id, toYMD(today));
  const setAmanha = (id: number) => setDt(id, toYMD(plus(1)));
  const limpar = (id: number) => setDt(id, undefined);

  // Exportar CSV do detalhe
  const exportCsv = () => {
    if (!sel) return;
    const header = ["op","modelo","id","codigo","descricao","qtd","un","fornecedor","status","dt_planejada","dt_entrega","coluna"];
    const rows = sel.materiais
      .filter((m) => m.status !== "Entregue")
      .map((m) => {
        const col =
          !m.dtPlanejada ? "Pendentes"
          : isPast(m.dtPlanejada) ? "Planejados atrasados"
          : "Entrega futura";
        return [
          sel.op,
          sel.modelo,
          m.id,
          m.codigo,
          m.descricao,
          m.qtd,
          m.unidade,
          m.fornecedor ?? "",
          m.status,
          m.dtPlanejada ?? "",
          m.dtEntrega ?? "",
          col,
        ];
      });
    const csv = [header, ...rows].map(r => r.map(v => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planejamento_materiais_${sel.op}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Filtros topo */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold">Planejamento de Materiais</h3>
        </CardHeader>
        <CardContent className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-3">
            <Input placeholder="Buscar OP, modelo ou linha…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Linha</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={linha}
              onChange={(e) => setLinha(e.target.value as any)}
            >
              <option>Todas</option>
              <option>Montagem</option>
              <option>Elétrica</option>
              <option>Pintura</option>
            </select>
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Início</label>
            <Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Fim</label>
            <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-3 flex items-end">
            <Button variant="outline" className="gap-2" onClick={() => window.alert("Calendário virá em tela dedicada.")}>
              <Calendar className="h-4 w-4" />
              Calendário de Entrega (breve)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Lista de barcos */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 px-4 py-3 text-xs text-muted-foreground">
            <div className="col-span-2">OP</div>
            <div className="col-span-3">Modelo</div>
            <div className="col-span-2">Linha</div>
            <div className="col-span-3">Período</div>
            <div className="col-span-2 text-right">Pendentes</div>
          </div>

          <div className="divide-y">
            {lista.map((b) => {
              const pend = b.materiais.filter((m) => m.status !== "Entregue" && !m.dtPlanejada).length;
              const atras = b.materiais.filter((m) => m.status !== "Entregue" && m.dtPlanejada && isPast(m.dtPlanejada)).length;
              const fut = b.materiais.filter((m) => m.status !== "Entregue" && m.dtPlanejada && isFutureOrToday(m.dtPlanejada)).length;

              return (
                <div key={b.op} className="grid grid-cols-12 items-center gap-2 px-4 py-3">
                  <div className="col-span-2 font-medium">{b.op}</div>
                  <div className="col-span-3 flex items-center gap-2">
                    {b.modelo}
                    <div className="flex items-center gap-1">
                      {pend > 0 && <Badge variant="default">Pend {pend}</Badge>}
                      {atras > 0 && <Badge variant="destructive">Atr {atras}</Badge>}
                      {fut > 0 && <Badge variant="secondary">Fut {fut}</Badge>}
                    </div>
                  </div>
                  <div className="col-span-2">{b.linha}</div>
                  <div className="col-span-3">{toBR(b.dtIni)} — {toBR(b.dtFim)}</div>
                  <div className="col-span-2 text-right">
                    <Button size="sm" onClick={() => setSel(b)}>Abrir</Button>
                  </div>
                </div>
              );
            })}
            {lista.length === 0 && (
              <div className="px-4 py-8 text-sm text-muted-foreground">Nenhuma OP encontrada com os filtros atuais.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sheet Detalhe do Barco */}
      <Sheet open={!!sel} onOpenChange={closeSheet}>
        {sel && (
          <SheetContent side="right" size="xl" className="bg-white">
            <SheetHeader className="bg-white border-b">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle>{sel.op} • {sel.modelo}</SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {sel.linha} • Período: {toBR(sel.dtIni)} — {toBR(sel.dtFim)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={exportCsv}>
                    <Download className="h-4 w-4" /> Exportar CSV
                  </Button>
                  <Button size="sm" onClick={() => setSel(null)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <div className="p-4 space-y-4 bg-white h-[calc(100%-64px)] overflow-auto">
              <div className="grid grid-cols-12 gap-4">
                {/* Coluna 1: Pendentes */}
                <div className="col-span-12 xl:col-span-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">1. Pendentes de agendamento</h4>
                    <Badge variant="outline">{pendentes.length}</Badge>
                  </div>
                  <div className="rounded-2xl border">
                    <div className="grid grid-cols-12 text-xs text-muted-foreground px-3 py-2">
                      <div className="col-span-6">Material</div>
                      <div className="col-span-2 text-right">Qtde</div>
                      <div className="col-span-4">Agendar</div>
                    </div>
                    <div className="divide-y">
                      {pendentes.map((m) => (
                        <div key={m.id} className="grid grid-cols-12 items-center px-3 py-2 gap-2">
                          <div className="col-span-6">
                            <p className="font-medium leading-tight">{m.codigo} • {m.descricao}</p>
                            <p className="text-xs text-muted-foreground">{m.fornecedor ?? "—"}</p>
                          </div>
                          <div className="col-span-2 text-right">{m.qtd} {m.unidade}</div>
                          <div className="col-span-4 flex items-center gap-2">
                            <Input type="date" value={m.dtPlanejada || ""} onChange={(e) => setDt(m.id, e.target.value || undefined)} />
                            <Button variant="outline" size="sm" onClick={() => setHoje(m.id)}>Hoje</Button>
                            <Button variant="outline" size="sm" onClick={() => setAmanha(m.id)}>Amanhã</Button>
                          </div>
                        </div>
                      ))}
                      {pendentes.length === 0 && (
                        <div className="px-3 py-6 text-sm text-muted-foreground">Sem pendências para este barco.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coluna 2: Planejados atrasados */}
                <div className="col-span-12 xl:col-span-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">2. Materiais planejados atrasados</h4>
                    <Badge variant="destructive">{planejadosAtrasados.length}</Badge>
                  </div>
                  <div className="rounded-2xl border">
                    <div className="grid grid-cols-12 text-xs text-muted-foreground px-3 py-2">
                      <div className="col-span-6">Material</div>
                      <div className="col-span-2 text-right">Qtde</div>
                      <div className="col-span-4">Planejado para</div>
                    </div>
                    <div className="divide-y">
                      {planejadosAtrasados.map((m) => (
                        <div key={m.id} className="grid grid-cols-12 items-center px-3 py-2 gap-2">
                          <div className="col-span-6">
                            <p className="font-medium leading-tight">{m.codigo} • {m.descricao}</p>
                            <p className="text-xs text-muted-foreground">{m.fornecedor ?? "—"}</p>
                          </div>
                          <div className="col-span-2 text-right">{m.qtd} {m.unidade}</div>
                          <div className="col-span-4 flex items-center gap-2">
                            <Input type="date" value={m.dtPlanejada || ""} onChange={(e) => setDt(m.id, e.target.value || undefined)} />
                            <Button variant="outline" size="sm" onClick={() => setHoje(m.id)}>Hoje</Button>
                            <Button variant="outline" size="sm" onClick={() => setAmanha(m.id)}>Amanhã</Button>
                            <Button variant="ghost" size="icon" aria-label="Limpar" title="Limpar data" onClick={() => limpar(m.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {planejadosAtrasados.length === 0 && (
                        <div className="px-3 py-6 text-sm text-muted-foreground">Nenhum material atrasado.</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Coluna 3: Entrega futura */}
                <div className="col-span-12 xl:col-span-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">3. Entrega futura</h4>
                    <Badge variant="secondary">{entregaFutura.length}</Badge>
                  </div>
                  <div className="rounded-2xl border">
                    <div className="grid grid-cols-12 text-xs text-muted-foreground px-3 py-2">
                      <div className="col-span-6">Material</div>
                      <div className="col-span-2 text-right">Qtde</div>
                      <div className="col-span-4">Planejado para</div>
                    </div>
                    <div className="divide-y">
                      {entregaFutura.map((m) => (
                        <div key={m.id} className="grid grid-cols-12 items-center px-3 py-2 gap-2">
                          <div className="col-span-6">
                            <p className="font-medium leading-tight">{m.codigo} • {m.descricao}</p>
                            <p className="text-xs text-muted-foreground">{m.fornecedor ?? "—"}</p>
                          </div>
                          <div className="col-span-2 text-right">{m.qtd} {m.unidade}</div>
                          <div className="col-span-4 flex items-center gap-2">
                            <Input type="date" value={m.dtPlanejada || ""} onChange={(e) => setDt(m.id, e.target.value || undefined)} />
                            <Button variant="outline" size="sm" onClick={() => setHoje(m.id)}>Hoje</Button>
                            <Button variant="outline" size="sm" onClick={() => setAmanha(m.id)}>Amanhã</Button>
                            <Button variant="ghost" size="icon" aria-label="Limpar" title="Limpar data" onClick={() => limpar(m.id)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {entregaFutura.length === 0 && (
                        <div className="px-3 py-6 text-sm text-muted-foreground">Sem entregas futuras planejadas.</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Resumo e ações */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Total: {pendentes.length} pendentes • {planejadosAtrasados.length} atrasados • {entregaFutura.length} futuros
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => window.alert("Mock: alterações mantidas em memória.")}>
                    Salvar planejamento
                  </Button>
                  <Button onClick={() => setSel(null)}>Concluir</Button>
                </div>
              </div>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
