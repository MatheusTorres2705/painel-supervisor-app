// src/pages/PlanoAcaoPage.tsx
import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import * as Dialog from "@radix-ui/react-dialog";
import { DndContext } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { Plus, Download, X } from "lucide-react";

/* ===================== Tipos ===================== */
type StatusKey = "NAO_PLANEJADO" | "ANDAMENTO" | "FINALIZADO";
type Prioridade = "Alta" | "Média" | "Baixa";

type Plano = {
  id: number;
  titulo: string;
  responsavel?: string;
  prazo?: string; // YYYY-MM-DD
  prioridade: Prioridade;
  status: StatusKey;
  tags: string[];
  descricao?: string;
};

/* ===================== Mock ===================== */
const today = new Date();
const toYMD = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const addDays = (n: number) => {
  const x = new Date(today);
  x.setDate(x.getDate() + n);
  return toYMD(x);
};

function mockPlanos(): Plano[] {
  return [
    {
      id: 1,
      titulo: "Padronizar check-list de qualidade (laminação)",
      responsavel: "Ana Souza",
      prazo: addDays(2),
      prioridade: "Alta",
      status: "NAO_PLANEJADO",
      tags: ["Qualidade", "Laminação"],
    },
    {
      id: 2,
      titulo: "Revisar layout do posto de pintura",
      responsavel: "Diego Nunes",
      prazo: addDays(5),
      prioridade: "Média",
      status: "ANDAMENTO",
      tags: ["Pintura", "5S"],
    },
    {
      id: 3,
      titulo: "Treinar equipe em torqueamentos críticos",
      responsavel: "João Pedro",
      prazo: addDays(-1),
      prioridade: "Alta",
      status: "ANDAMENTO",
      tags: ["Montagem", "Segurança"],
    },
    {
      id: 4,
      titulo: "Atualizar matriz de competências",
      responsavel: "Carla Alves",
      prazo: addDays(10),
      prioridade: "Baixa",
      status: "FINALIZADO",
      tags: ["RH", "Treinamento"],
    },
  ];
}

/* ===================== Helpers ===================== */
const statusMeta: Record<
  StatusKey,
  { title: string; hint: string; badgeVariant: "default" | "secondary" | "outline" }
> = {
  NAO_PLANEJADO: {
    title: "Não planejados",
    hint: "Ideias, pendências e planos ainda sem start",
    badgeVariant: "outline",
  },
  ANDAMENTO: {
    title: "Em andamento",
    hint: "Planos com ações em execução",
    badgeVariant: "default",
  },
  FINALIZADO: {
    title: "Finalizado",
    hint: "Concluídos",
    badgeVariant: "secondary",
  },
};

const toBR = (ymd?: string) => (ymd ? ymd.split("-").reverse().join("/") : "—");
const isPast = (ymd?: string) => (ymd ? ymd < toYMD(today) : false);

/* ===================== Página ===================== */
export default function PlanoAcaoPage() {
  const [items, setItems] = useState<Plano[]>(mockPlanos());

  // Filtros topo
  const [q, setQ] = useState("");
  const [prio, setPrio] = useState<"Todas" | Prioridade>("Todas");
  const [resp, setResp] = useState<string>("Todos");

  const responsaveis = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.responsavel && set.add(i.responsavel));
    return ["Todos", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (q.trim()) {
        const k = q.toLowerCase();
        const hay = `${p.titulo} ${p.responsavel ?? ""} ${p.tags.join(" ")} ${p.prioridade}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      if (prio !== "Todas" && p.prioridade !== prio) return false;
      if (resp !== "Todos" && p.responsavel !== resp) return false;
      return true;
    });
  }, [items, q, prio, resp]);

  // Colunas derivadas
  const col = (s: StatusKey) => filtered.filter((p) => p.status === s);

  // DnD handler simples (drop por coluna)
  const onDragEnd = (e: DragEndEvent) => {
    const id = Number(String(e.active.id).replace("plano-", ""));
    const overId = e.over?.id as string | undefined; // "col-NAO_PLANEJADO"
    if (!overId || !overId.startsWith("col-")) return;
    const newStatus = overId.replace("col-", "") as StatusKey;
    setItems((arr) => arr.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
  };

  // Criar novo plano (Dialog)
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Plano>>({
    titulo: "",
    responsavel: "",
    prazo: "",
    prioridade: "Média",
    status: "NAO_PLANEJADO",
    tags: [],
    descricao: "",
  });

  const addTag = (t: string) => {
    const v = t.trim();
    if (!v) return;
    setForm((f) => ({ ...f, tags: [...(f.tags || []), v] }));
  };

  const removeTag = (t: string) =>
    setForm((f) => ({ ...f, tags: (f.tags || []).filter((x) => x !== t) }));

  const salvarNovo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.titulo?.trim()) return;
    const novo: Plano = {
      id: Math.max(0, ...items.map((i) => i.id)) + 1,
      titulo: form.titulo!.trim(),
      responsavel: form.responsavel?.trim() || undefined,
      prazo: form.prazo || undefined,
      prioridade: (form.prioridade as Prioridade) || "Média",
      status: (form.status as StatusKey) || "NAO_PLANEJADO",
      tags: form.tags || [],
      descricao: form.descricao?.trim() || undefined,
    };
    setItems((arr) => [novo, ...arr]);
    setOpen(false);
    setForm({
      titulo: "",
      responsavel: "",
      prazo: "",
      prioridade: "Média",
      status: "NAO_PLANEJADO",
      tags: [],
      descricao: "",
    });
  };

  // Export CSV do conjunto filtrado atual
  const exportCsv = () => {
    const header = ["id", "titulo", "responsavel", "prazo", "prioridade", "status", "tags"];
    const rows = filtered.map((p) => [
      p.id,
      p.titulo,
      p.responsavel ?? "",
      p.prazo ?? "",
      p.prioridade,
      p.status,
      p.tags.join("|"),
    ]);
    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plano_acao.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Topo: filtros e ações */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Plano de Ação (Kanban)</h3>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2" onClick={exportCsv}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              <Dialog.Root open={open} onOpenChange={setOpen}>
                <Dialog.Trigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Novo plano
                  </Button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
                  <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-2xl outline-none">
                    <div className="flex items-start justify-between border-b pb-3">
                      <Dialog.Title className="text-base font-semibold">Novo plano de ação</Dialog.Title>
                      <Dialog.Close asChild>
                        <Button variant="ghost" size="icon" aria-label="Fechar">
                          <X className="h-4 w-4" />
                        </Button>
                      </Dialog.Close>
                    </div>

                    <form className="mt-4 space-y-3" onSubmit={salvarNovo}>
                      <div>
                        <label className="text-xs text-muted-foreground">Título</label>
                        <Input
                          value={form.titulo ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 md:col-span-6">
                          <label className="text-xs text-muted-foreground">Responsável</label>
                          <Input
                            value={form.responsavel ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, responsavel: e.target.value }))}
                            placeholder="Nome do responsável"
                          />
                        </div>
                        <div className="col-span-6 md:col-span-3">
                          <label className="text-xs text-muted-foreground">Prazo</label>
                          <Input
                            type="date"
                            value={form.prazo ?? ""}
                            onChange={(e) => setForm((f) => ({ ...f, prazo: e.target.value }))}
                          />
                        </div>
                        <div className="col-span-6 md:col-span-3">
                          <label className="text-xs text-muted-foreground">Prioridade</label>
                          <select
                            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={form.prioridade}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, prioridade: e.target.value as Prioridade }))
                            }
                          >
                            <option>Alta</option>
                            <option>Média</option>
                            <option>Baixa</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-2">
                        <div className="col-span-12 md:col-span-6">
                          <label className="text-xs text-muted-foreground">Status</label>
                          <select
                            className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={form.status}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, status: e.target.value as StatusKey }))
                            }
                          >
                            <option value="NAO_PLANEJADO">Não planejados</option>
                            <option value="ANDAMENTO">Em andamento</option>
                            <option value="FINALIZADO">Finalizado</option>
                          </select>
                        </div>
                        <div className="col-span-12 md:col-span-6">
                          <label className="text-xs text-muted-foreground">Adicionar tag</label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="Digite e Enter"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const target = e.target as HTMLInputElement;
                                  addTag(target.value);
                                  target.value = "";
                                }
                              }}
                            />
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(form.tags || []).map((t) => (
                              <Badge key={t} variant="outline" className="group">
                                {t}
                                <button
                                  type="button"
                                  className="ml-1 text-xs opacity-60 group-hover:opacity-100"
                                  onClick={() => removeTag(t)}
                                  title="Remover"
                                >
                                  ×
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div>
                        <label className="text-xs text-muted-foreground">Descrição</label>
                        <textarea
                          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[90px]"
                          value={form.descricao ?? ""}
                          onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                        />
                      </div>

                      <div className="flex justify-end gap-2 pt-2">
                        <Dialog.Close asChild>
                          <Button type="button" variant="outline">
                            Cancelar
                          </Button>
                        </Dialog.Close>
                        <Button type="submit">Salvar</Button>
                      </div>
                    </form>
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-4">
            <Input placeholder="Buscar por título, tag, responsável…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Prioridade</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={prio}
              onChange={(e) => setPrio(e.target.value as any)}
            >
              <option>Todas</option>
              <option>Alta</option>
              <option>Média</option>
              <option>Baixa</option>
            </select>
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Responsável</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={resp}
              onChange={(e) => setResp(e.target.value)}
            >
              {responsaveis.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Kanban */}
      <DndContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["NAO_PLANEJADO", "ANDAMENTO", "FINALIZADO"] as StatusKey[]).map((s) => {
            const list = col(s);
            const meta = statusMeta[s];
            return (
              <div
                key={s}
                id={`col-${s}`}
                className="rounded-2xl border bg-card p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const id = Number(e.dataTransfer.getData("text/plain"));
                  setItems((arr) => arr.map((p) => (p.id === id ? { ...p, status: s } : p)));
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="font-semibold">{meta.title}</h4>
                    <p className="text-xs text-muted-foreground">{meta.hint}</p>
                  </div>
                  <Badge variant={meta.badgeVariant}>{list.length}</Badge>
                </div>

                <div className="space-y-3 min-h-[200px]">
                  {list.map((p) => (
                    <PlanoCard
                      key={p.id}
                      plano={p}
                      onDragStart={(id) => {
                        const dt = (event as unknown as DragEvent).dataTransfer;
                        dt?.setData("text/plain", String(id));
                      }}
                      onUpdate={(patch) =>
                        setItems((arr) => arr.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))
                      }
                    />
                  ))}
                  {list.length === 0 && (
                    <div className="text-sm text-muted-foreground px-2 py-6 border rounded-2xl">
                      Sem itens aqui.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}

/* ===================== Card ===================== */
function PlanoCard({
  plano,
  onDragStart,
  onUpdate,
}: {
  plano: Plano;
  onDragStart: (id: number) => void;
  onUpdate: (patch: Partial<Plano>) => void;
}) {
  const vencido = isPast(plano.prazo) && plano.status !== "FINALIZADO";

  return (
    <Card
      draggable
      onDragStart={() => onDragStart(plano.id)}
      className={`shadow-sm hover:shadow-md transition ${vencido ? "ring-1 ring-red-500/40" : ""}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <input
            className="font-medium bg-transparent outline-none w-full"
            value={plano.titulo}
            onChange={(e) => onUpdate({ titulo: e.target.value })}
          />
          <Badge variant={plano.prioridade === "Alta" ? "destructive" : plano.prioridade === "Média" ? "default" : "secondary"}>
            {plano.prioridade}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {plano.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-7">
            <label className="text-[10px] text-muted-foreground">Responsável</label>
            <Input
              value={plano.responsavel ?? ""}
              onChange={(e) => onUpdate({ responsavel: e.target.value || undefined })}
              placeholder="Nome"
            />
          </div>
          <div className="col-span-5">
            <label className="text-[10px] text-muted-foreground">Prazo</label>
            <Input
              type="date"
              value={plano.prazo ?? ""}
              onChange={(e) => onUpdate({ prazo: e.target.value || undefined })}
            />
            {vencido && <p className="mt-1 text-[10px] text-red-600">Prazo vencido ({toBR(plano.prazo)})</p>}
          </div>
        </div>

        {plano.descricao !== undefined && (
          <div>
            <label className="text-[10px] text-muted-foreground">Descrição</label>
            <textarea
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[70px]"
              value={plano.descricao}
              onChange={(e) => onUpdate({ descricao: e.target.value })}
            />
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="text-[11px] text-muted-foreground">
            {plano.prazo ? `Prazo: ${toBR(plano.prazo)}` : "Sem prazo"}
          </div>
          <div className="flex items-center gap-2">
            {/* Alterar status rápido */}
            <select
              className="rounded-md border bg-background px-2 py-1 text-xs"
              value={plano.status}
              onChange={(e) => onUpdate({ status: e.target.value as StatusKey })}
            >
              <option value="NAO_PLANEJADO">Não planejado</option>
              <option value="ANDAMENTO">Em andamento</option>
              <option value="FINALIZADO">Finalizado</option>
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
