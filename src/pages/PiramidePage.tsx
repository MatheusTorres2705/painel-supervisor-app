// src/pages/PiramidePage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { obterReg } from "@/lib/obterReg";

import {
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  Tooltip,
  LabelList,
} from "recharts";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as Dialog from "@radix-ui/react-dialog";

import {
  Search,
  Users,
  TrendingUp,
  Grid3X3,
  X,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Filter,
} from "lucide-react";

/** ===================== Types ===================== */
type Nivel = string;

type NineBoxCell =
  | "Baixo/Baixo"
  | "Baixo/Médio"
  | "Baixo/Alto"
  | "Médio/Baixo"
  | "Médio/Médio"
  | "Médio/Alto"
  | "Alto/Baixo"
  | "Alto/Médio"
  | "Alto/Alto";

type ResumoNivelRow = {
  NIVEL: string;
  QTD: number;
};

type ColaboradorRow = {
  CODFUNC: number;
  NOMEFUNC: string;
  AD_NIVEL: string;
};

type DeptoRow = {
  CODDEP: number;
  DESCRDEP: string;
};

/** ===================== LocalStorage helpers (9-box) ===================== */
function keyNineBox(codusuSup: number) {
  return `nx:piramide:${codusuSup}:ninebox:v1`;
}

function safeParse<T>(s: string | null, fallback: T): T {
  try {
    if (!s) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function loadNineBoxMap(codusuSup: number) {
  return safeParse<Record<number, NineBoxCell>>(
    localStorage.getItem(keyNineBox(codusuSup)),
    {}
  );
}

function saveNineBoxMap(codusuSup: number, map: Record<number, NineBoxCell>) {
  localStorage.setItem(keyNineBox(codusuSup), JSON.stringify(map));
}

/** ===================== Small helpers ===================== */
function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function toneEligible(e: boolean) {
  return e
    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
    : "bg-muted text-muted-foreground border-border";
}

function toneNineBox(cell?: NineBoxCell) {
  if (!cell) return "bg-muted text-muted-foreground border-border";
  if (cell === "Alto/Alto" || cell === "Alto/Médio")
    return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (cell.includes("Baixo/"))
    return "bg-amber-50 text-amber-800 border-amber-200";
  return "bg-sky-50 text-sky-800 border-sky-200";
}

/** mock elegível */
function isElegivelMock(rank: number) {
  return rank <= 3;
}

/** ===================== 9Box Dialog ===================== */
function NineBoxDialog({
  open,
  onOpenChange,
  codfunc,
  nome,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  codfunc: number | null;
  nome: string | null;
  current?: NineBoxCell;
  onSave: (cell: NineBoxCell) => void;
}) {
  const [selected, setSelected] = useState<NineBoxCell | null>(null);

  useEffect(() => {
    if (open) setSelected(current ?? null);
  }, [open, current]);

  const cells: NineBoxCell[] = [
    "Baixo/Baixo",
    "Baixo/Médio",
    "Baixo/Alto",
    "Médio/Baixo",
    "Médio/Médio",
    "Médio/Alto",
    "Alto/Baixo",
    "Alto/Médio",
    "Alto/Alto",
  ];

  if (!codfunc) return null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="
            fixed left-1/2 top-1/2 z-[60]
            w-[92vw] max-w-[720px]
            -translate-x-1/2 -translate-y-1/2
            rounded-2xl bg-white text-slate-900
            border border-slate-200 p-4 shadow-2xl outline-none
            max-h-[90vh] overflow-y-auto
          "
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
            <div>
              <Dialog.Title className="text-base font-semibold flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                9 Box • {codfunc} - {nome ?? ""}
              </Dialog.Title>
              <Dialog.Description className="text-xs text-slate-600 mt-1">
                Selecione a célula (Potencial x Performance) e salve.
              </Dialog.Description>
            </div>

            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {cells.map((c) => {
              const active = selected === c;
              return (
                <button
                  key={c}
                  onClick={() => setSelected(c)}
                  className={`rounded-xl border p-3 text-left transition ${
                    active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <div className="text-xs font-semibold">{c}</div>
                  <div
                    className={`mt-2 inline-flex rounded-md border px-2 py-1 text-[10px] ${
                      active ? "border-white/30" : "border-slate-200"
                    }`}
                  >
                    Potencial/Performance
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                if (!selected) return;
                onSave(selected);
                onOpenChange(false);
              }}
              disabled={!selected}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Salvar
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** ===================== Page ===================== */
export default function PiramidePage() {
  const CODUSU_SUP = Number(localStorage.getItem("auth:codusu") || 134);

  // ====== departamentos ======
  const [deptos, setDeptos] = useState<DeptoRow[]>([]);
  const [deptoLoading, setDeptoLoading] = useState(false);
  const [deptoErro, setDeptoErro] = useState<string | null>(null);

  // filtro selecionado (null = todos)
  const [coddepSel, setCoddepSel] = useState<number | null>(null);

  const [resumo, setResumo] = useState<ResumoNivelRow[]>([]);
  const [resumoLoading, setResumoLoading] = useState(false);
  const [resumoErro, setResumoErro] = useState<string | null>(null);

  const [nivelAtivo, setNivelAtivo] = useState<Nivel>("");
  const [colabs, setColabs] = useState<ColaboradorRow[]>([]);
  const [colabsLoading, setColabsLoading] = useState(false);
  const [colabsErro, setColabsErro] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  // 9-box state
  const [nineBoxOpen, setNineBoxOpen] = useState(false);
  const [nineBoxCodfunc, setNineBoxCodfunc] = useState<number | null>(null);
  const [nineBoxNome, setNineBoxNome] = useState<string | null>(null);

  const [nineBoxMap, setNineBoxMap] = useState<Record<number, NineBoxCell>>(() =>
    loadNineBoxMap(CODUSU_SUP || 134)
  );

  // ====== carregar departamentos do supervisor ======
  const carregarDeptos = async () => {
    if (!CODUSU_SUP) {
      setDeptoErro("CODUSU_SUP não encontrado (auth:codusu).");
      return;
    }
    setDeptoLoading(true);
    setDeptoErro(null);
    try {
      const sql = `
        SELECT DISTINCT 
          DEP.CODDEP , DEP.DESCRDEP
        FROM TFPFUN FUN 
        JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
        JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
        WHERE FUN.USUVPJSUP = ${Number(CODUSU_SUP)}
          AND FUN.SITUACAO = '1'
        ORDER BY DEP.DESCRDEP
      `.trim();

      const rows = await obterReg(sql);
      const list: DeptoRow[] = rows
        .map((r: any) => ({
          CODDEP: Number(r.CODDEP ?? 0),
          DESCRDEP: String(r.DESCRDEP ?? "").trim(),
        }))
        .filter((d) => d.CODDEP && d.DESCRDEP);

      setDeptos(list);

      // se tem só 1 depto, já seleciona (opcional)
      if (list.length === 1) setCoddepSel(list[0].CODDEP);
    } catch (e: any) {
      console.error("[Piramide] erro deptos:", e);
      setDeptoErro(e?.message || "Falha ao carregar departamentos do supervisor.");
      setDeptos([]);
    } finally {
      setDeptoLoading(false);
    }
  };

  // ====== carregar resumo (piramide) ======
  const carregarResumo = async () => {
    if (!CODUSU_SUP) {
      setResumoErro("CODUSU_SUP não encontrado (auth:codusu).");
      return;
    }

    setResumoLoading(true);
    setResumoErro(null);
    try {
      const filtroDep = coddepSel ? ` AND DEP.CODDEP = ${Number(coddepSel)} ` : "";

      const sql = `
        SELECT 
          SUM(QTD) AS QTD, 
          NIVEL
        FROM (
          SELECT 
            COUNT(*) AS QTD,
            CAR.AD_NIVEL AS NIVEL
          FROM TFPFUN FUN 
          JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
          JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
          WHERE FUN.USUVPJSUP = ${Number(CODUSU_SUP)}
            AND FUN.SITUACAO = '1'
            ${filtroDep}
          GROUP BY CAR.AD_NIVEL
        )
        GROUP BY NIVEL
        ORDER BY 1 DESC
      `.trim();

      const rows = await obterReg(sql);

      const list: ResumoNivelRow[] = rows
        .map((r: any) => ({
          NIVEL: String(r.NIVEL ?? "").trim(),
          QTD: Number(r.QTD ?? 0),
        }))
        .filter((x) => x.NIVEL);

      setResumo(list);

      // redefine nível ativo de acordo com a lista filtrada
      if (!list.length) {
        setNivelAtivo("");
        setColabs([]);
      } else {
        // se o nível atual não existe mais, pega o primeiro
        const allowed = new Set(list.map((x) => x.NIVEL));
        if (!nivelAtivo || !allowed.has(nivelAtivo)) {
          setNivelAtivo(list[0].NIVEL);
        }
      }
    } catch (e: any) {
      console.error("[Piramide] erro resumo:", e);
      setResumoErro(e?.message || "Falha ao carregar resumo da pirâmide.");
      setResumo([]);
      setNivelAtivo("");
      setColabs([]);
    } finally {
      setResumoLoading(false);
    }
  };

  // ====== carregar colaboradores por nível ======
  const carregarColabsNivel = async (nivel: string) => {
    if (!CODUSU_SUP) return;

    const allowed = new Set(resumo.map((x) => x.NIVEL));
    if (!allowed.has(nivel)) {
      setColabsErro("Nível inválido (não encontrado no resumo).");
      setColabs([]);
      return;
    }

    setColabsLoading(true);
    setColabsErro(null);
    try {
      const filtroDep = coddepSel ? ` AND DEP.CODDEP = ${Number(coddepSel)} ` : "";

      const sql = `
        SELECT 
          FUN.CODFUNC,
          FUN.NOMEFUNC,
          CAR.AD_NIVEL
        FROM TFPFUN FUN
        JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
        JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
        WHERE FUN.USUVPJSUP = ${Number(CODUSU_SUP)}
          AND FUN.SITUACAO = '1'
          ${filtroDep}
          AND CAR.AD_NIVEL = '${nivel}'
        ORDER BY FUN.NOMEFUNC
      `.trim();

      const rows = await obterReg(sql);

      const list: ColaboradorRow[] = rows
        .map((r: any) => ({
          CODFUNC: Number(r.CODFUNC ?? 0),
          NOMEFUNC: String(r.NOMEFUNC ?? ""),
          AD_NIVEL: String(r.AD_NIVEL ?? ""),
        }))
        .filter((c) => c.CODFUNC);

      setColabs(list);
    } catch (e: any) {
      console.error("[Piramide] erro colabs:", e);
      setColabsErro(e?.message || "Falha ao carregar colaboradores do nível.");
      setColabs([]);
    } finally {
      setColabsLoading(false);
    }
  };

  // ====== effects ======
  useEffect(() => {
    carregarDeptos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CODUSU_SUP]);

  useEffect(() => {
    carregarResumo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [CODUSU_SUP, coddepSel]);

  useEffect(() => {
    if (!nivelAtivo) return;
    if (!resumo.length) return;
    carregarColabsNivel(nivelAtivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nivelAtivo, resumo.length, coddepSel]);

  // ====== chart data ======
  const total = useMemo(() => resumo.reduce((s, r) => s + (r.QTD || 0), 0), [resumo]);

  const chartData = useMemo(() => {
    return resumo.map((r) => ({
      name: r.NIVEL,
      value: r.QTD,
      pct: `${pct(r.QTD, total)}%`,
    }));
  }, [resumo, total]);

  // ====== tabela ======
  const tabela = useMemo(() => {
    const q = query.trim().toLowerCase();
    return colabs
      .filter((c) => {
        if (!q) return true;
        return (
          String(c.CODFUNC).includes(q) ||
          c.NOMEFUNC.toLowerCase().includes(q) ||
          c.AD_NIVEL.toLowerCase().includes(q)
        );
      })
      .map((c, idx) => {
        const rank = idx + 1;
        const nine = nineBoxMap[c.CODFUNC];
        return {
          ...c,
          rank,
          elegivel: isElegivelMock(rank),
          nineBox: nine,
        };
      });
  }, [colabs, query, nineBoxMap]);

  const resumoNivel = useMemo(() => {
    const row = resumo.find((r) => r.NIVEL === nivelAtivo);
    const qtd = row?.QTD ?? 0;
    const elegiveis = tabela.filter((x) => x.elegivel).length;
    return { qtd, elegiveis };
  }, [resumo, nivelAtivo, tabela]);

  // ====== 9 box actions ======
  function abrirNineBox(codfunc: number, nome: string) {
    setNineBoxCodfunc(codfunc);
    setNineBoxNome(nome);
    setNineBoxOpen(true);
  }

  function salvarNineBox(cell: NineBoxCell) {
    if (!nineBoxCodfunc) return;
    setNineBoxMap((prev) => {
      const next = { ...prev, [nineBoxCodfunc]: cell };
      saveNineBoxMap(CODUSU_SUP, next);
      return next;
    });
  }

  const deptoLabel = useMemo(() => {
    if (!coddepSel) return "Todos os departamentos";
    const d = deptos.find((x) => x.CODDEP === coddepSel);
    return d ? d.DESCRDEP : `CODDEP ${coddepSel}`;
  }, [coddepSel, deptos]);

  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Pirâmide</h1>
        <p className="text-[12px] text-muted-foreground">
          Integrado com Sankhya via <b>obterReg</b> • Filtro por departamento:{" "}
          <b>{deptoLabel}</b>
        </p>
      </div>

      {(deptoErro || resumoErro || colabsErro) && (
        <div className="text-sm text-red-600">{deptoErro || resumoErro || colabsErro}</div>
      )}

      {/* Filtro Departamento */}
      <Card className="bg-card border">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Filter className="h-4 w-4" />
              Filtro
            </div>

            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl border bg-background p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold flex items-center gap-2">
                    <Building2 className="h-4 w-4" /> Departamento
                  </p>
                  {deptoLoading ? (
                    <span className="text-[11px] text-muted-foreground">Carregando…</span>
                  ) : (
                    <Badge variant="outline" className="text-[11px]">
                      {deptos.length} opção(ões)
                    </Badge>
                  )}
                </div>

                <select
                  className="
                    mt-2 w-full rounded-md
                    border border-slate-200 bg-white
                    px-3 py-2 text-sm
                    focus:outline-none focus:ring-2 focus:ring-slate-300
                  "
                  value={coddepSel ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setQuery("");
                    // "" = todos
                    setCoddepSel(v ? Number(v) : null);
                  }}
                >
                  <option value="">Todos</option>
                  {deptos.map((d) => (
                    <option key={d.CODDEP} value={d.CODDEP}>
                      {d.DESCRDEP}
                    </option>
                  ))}
                </select>

                <p className="mt-2 text-[11px] text-muted-foreground">
                  Ao escolher um departamento, filtramos por <b>DEP.CODDEP</b>.
                </p>
              </div>

              <div className="rounded-xl border bg-background p-3 flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold">Ações</p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Atualiza resumo + tabela do nível selecionado.
                  </p>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    carregarDeptos();
                    carregarResumo();
                    if (nivelAtivo) carregarColabsNivel(nivelAtivo);
                  }}
                  disabled={deptoLoading || resumoLoading || colabsLoading}
                  className="gap-2"
                >
                  {deptoLoading || resumoLoading || colabsLoading ? "Atualizando…" : "Atualizar"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="bg-card border">
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Total (ativos)</p>
              <p className="text-3xl font-semibold leading-none mt-1">
                {resumoLoading ? "…" : total}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">FUN.SITUACAO = '1'</p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
              <Users className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Nível selecionado</p>
              <p className="text-2xl font-semibold leading-none mt-2">{nivelAtivo || "-"}</p>
              <p className="text-[11px] text-muted-foreground mt-2">
                {resumoNivel.qtd} colaborador(es)
              </p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
              <TrendingUp className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>

        <Card className="bg-card border">
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <p className="text-[11px] text-muted-foreground">Elegíveis (mock)</p>
              <p className="text-3xl font-semibold leading-none mt-1">
                {colabsLoading ? "…" : resumoNivel.elegiveis}
              </p>
              <p className="text-[11px] text-muted-foreground mt-2">Regra: rank ≤ 3</p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
              <AlertTriangle className="h-4 w-4" />
            </span>
          </CardContent>
        </Card>
      </div>

      {/* Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        {/* Pirâmide */}
        <Card className="bg-card border xl:col-span-1">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">Distribuição por nível</p>
                <p className="text-[11px] text-muted-foreground">
                  Clique no nível para filtrar a tabela.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={carregarResumo}
                disabled={resumoLoading}
              >
                {resumoLoading ? "Atualizando…" : "Atualizar"}
              </Button>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <div className="h-[380px] rounded-xl border bg-background">
              <ResponsiveContainer width="100%" height="100%">
                <FunnelChart>
                  <Tooltip
                    formatter={(v: any, _n: any, props: any) => {
                      const pctLabel = props?.payload?.pct ?? "";
                      return [`${v} (${pctLabel})`, "Colaboradores"];
                    }}
                  />
                  <Funnel
                    dataKey="value"
                    data={chartData}
                    isAnimationActive={false}
                    onClick={(d: any) => {
                      const name = String(d?.name ?? "");
                      if (name) setNivelAtivo(name);
                    }}
                  >
                    <LabelList position="right" dataKey="name" fill="currentColor" fontSize={12} />
                    <LabelList position="inside" dataKey="pct" fill="white" fontSize={11} />
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {resumo.map((r) => {
                const active = r.NIVEL === nivelAtivo;
                return (
                  <button
                    key={r.NIVEL}
                    onClick={() => setNivelAtivo(r.NIVEL)}
                    className={`rounded-lg border px-3 py-2 text-xs transition ${
                      active
                        ? "bg-foreground text-background border-foreground"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {r.NIVEL} • <b className="ml-1">{r.QTD}</b>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Tabela */}
        <Card className="bg-card border xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">
                  Colaboradores • {nivelAtivo || "-"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Filtrado por departamento • 9-box salva no localStorage.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-full md:w-[320px]">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar (nome/cod)…"
                    className="h-9 pl-8"
                  />
                </div>

                <Badge variant="outline" className="text-[11px]">
                  {tabela.length} item(ns)
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {colabsLoading ? (
              <div className="py-10 text-sm text-muted-foreground">Carregando colaboradores…</div>
            ) : !tabela.length ? (
              <div className="py-10 text-sm text-muted-foreground">
                Nenhum colaborador encontrado.
              </div>
            ) : (
              <div className="rounded-xl border bg-background overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-muted-foreground border-b">
                  <div className="col-span-1">Rank</div>
                  <div className="col-span-5">Colaborador</div>
                  <div className="col-span-2">Nível</div>
                  <div className="col-span-2">Elegível</div>
                  <div className="col-span-2 text-right">Ações</div>
                </div>

                <div className="max-h-[520px] overflow-y-auto divide-y">
                  {tabela.map((c) => (
                    <div key={c.CODFUNC} className="grid grid-cols-12 gap-2 px-3 py-3 items-start">
                      <div className="col-span-1">
                        <Badge variant="outline" className="text-[11px]">
                          {c.rank}
                        </Badge>
                      </div>

                      <div className="col-span-5 min-w-0">
                        <div className="text-sm font-semibold leading-tight">
                          {c.CODFUNC} - {c.NOMEFUNC}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="outline" className={`text-[10px] ${toneNineBox(c.nineBox)}`}>
                            9 box: {c.nineBox ?? "—"}
                          </Badge>
                        </div>
                      </div>

                      <div className="col-span-2">
                        <Badge variant="outline" className="text-[11px]">
                          {c.AD_NIVEL}
                        </Badge>
                      </div>

                      <div className="col-span-2">
                        <Badge variant="outline" className={`text-[11px] ${toneEligible(c.elegivel)}`}>
                          {c.elegivel ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" /> Sim
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Não
                            </span>
                          )}
                        </Badge>
                      </div>

                      <div className="col-span-2 flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => abrirNineBox(c.CODFUNC, c.NOMEFUNC)}
                        >
                          <Grid3X3 className="h-4 w-4" />
                          9 box
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal 9Box */}
      <NineBoxDialog
        open={nineBoxOpen}
        onOpenChange={setNineBoxOpen}
        codfunc={nineBoxCodfunc}
        nome={nineBoxNome}
        current={nineBoxCodfunc ? nineBoxMap[nineBoxCodfunc] : undefined}
        onSave={salvarNineBox}
      />
    </div>
  );
}
