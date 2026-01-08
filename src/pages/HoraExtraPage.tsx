// src/pages/HoraExtraPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { obterReg } from "@/lib/obterReg";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import * as Dialog from "@radix-ui/react-dialog";

import {
  CheckCircle2,
  Download,
  Filter,
  Plus,
  RefreshCw,
  X,
  ArrowUpDown,
} from "lucide-react";

type SortKey = "cod" | "usuario" | "depto" | "qtd" | "ini" | "fim";

type HoraExtraRow = {
  codBancoHoras: number;
  codusu: number;
  nomeusu: string;
  hrini: string;
  hrfin: string;
  coddep: number;
  qtdFuncionario: number;
};

type Dep = { coddep: number; descrdep: string };

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthInputToMMYYYY(v: string) {
  // input type="month" => "YYYY-MM"
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return "";
  const [yyyy, mm] = v.split("-");
  return `${mm}/${yyyy}`;
}

function nowMonthInput() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function safeDigits(v: string) {
  return (v || "").replace(/[^\d]/g, "");
}

export default function HoraExtraPage() {
  const { user } = useAuth();

  const CODUSU_SUP = (user as any)?.codusu ?? 134;

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [rows, setRows] = useState<HoraExtraRow[]>([]);

  // filtros
  const [mesRef, setMesRef] = useState<string>(nowMonthInput()); // YYYY-MM
  const [coddep, setCoddep] = useState<string>(""); // texto (filtra por coddep)
  const [q, setQ] = useState<string>("");

  // deps (opcional)
  const [deps, setDeps] = useState<Dep[]>([]);
  const [depsLoading, setDepsLoading] = useState(false);

  // ordenação
  const [sortKey, setSortKey] = useState<SortKey>("cod");
  const [sortAsc, setSortAsc] = useState(true);

  // aprovar
  const [aprovarOpen, setAprovarOpen] = useState(false);
  const [aprovarTarget, setAprovarTarget] = useState<HoraExtraRow | null>(null);
  const [aprovando, setAprovando] = useState(false);

  const carregarDeps = async () => {
    try {
      setDepsLoading(true);
      const sql = `
        SELECT CODDEP, DESCRDEP
        FROM TFPDEP
        ORDER BY DESCRDEP
      `.trim();
      const r = await obterReg(sql);
      setDeps(
        r.map((x: any) => ({
          coddep: Number(x.CODDEP),
          descrdep: String(x.DESCRDEP ?? ""),
        }))
      );
    } catch (e: any) {
      console.error("[HoraExtraPage] deps:", e);
      setDeps([]);
    } finally {
      setDepsLoading(false);
    }
  };

  const carregar = async () => {
    try {
      setLoading(true);
      setErro(null);

      const mmYYYY = monthInputToMMYYYY(mesRef);
      const depDigits = safeDigits(coddep);

      // ✅ sua query (mantive igual) + filtro de CODDEP opcional
      const sql = `
        SELECT 
          HR.CODBANCOHORAS , 
          HR.CODUSU , 
          USU.NOMEUSU , 
          HR.HRINI , 
          HR.HRFIN , 
          HR.CODDEP,
          COUNT(FUN.CODFUNC) AS QTD_FUNCIONARIO
        FROM AD_BANCOHORAS HR
        JOIN TSIUSU USU ON USU.CODUSU = HR.CODUSU 
        JOIN AD_BCOFUN FUN ON FUN.CODBANCOHORAS = HR.CODBANCOHORAS
        WHERE HR.CODUSU = ${Number(CODUSU_SUP)}
          AND TO_CHAR(HR.DTUSO, 'MM/YYYY') = '${mmYYYY}'
          ${depDigits ? `AND HR.CODDEP = ${Number(depDigits)}` : ""}
        GROUP BY 
          HR.CODBANCOHORAS , 
          HR.CODUSU , 
          USU.NOMEUSU , 
          HR.HRINI , 
          HR.HRFIN , 
          HR.CODDEP
        ORDER BY HR.CODBANCOHORAS DESC
      `.trim();

      const r = await obterReg(sql);

      const mapped: HoraExtraRow[] = r.map((x: any) => ({
        codBancoHoras: Number(x.CODBANCOHORAS),
        codusu: Number(x.CODUSU),
        nomeusu: String(x.NOMEUSU ?? ""),
        hrini: String(x.HRINI ?? ""),
        hrfin: String(x.HRFIN ?? ""),
        coddep: Number(x.CODDEP ?? 0),
        qtdFuncionario: Number(x.QTD_FUNCIONARIO ?? 0),
      }));

      setRows(mapped);
    } catch (e: any) {
      console.error("[HoraExtraPage] carregar:", e);
      setErro(e?.message || "Falha ao carregar banco de horas.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    carregarDeps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesRef, coddep, CODUSU_SUP]);

  const depLabel = useMemo(() => {
    const d = deps.find((x) => x.coddep === Number(safeDigits(coddep)));
    return d ? `${d.coddep} - ${d.descrdep}` : "";
  }, [coddep, deps]);

  const list = useMemo(() => {
    let data = [...rows];

    if (q.trim()) {
      const k = q.trim().toLowerCase();
      data = data.filter((x) => {
        return (
          String(x.codBancoHoras).includes(k) ||
          String(x.codusu).includes(k) ||
          String(x.coddep).includes(k) ||
          x.nomeusu.toLowerCase().includes(k)
        );
      });
    }

    data.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;

      switch (sortKey) {
        case "cod":
          return (a.codBancoHoras - b.codBancoHoras) * dir;
        case "usuario":
          return a.nomeusu.localeCompare(b.nomeusu) * dir;
        case "depto":
          return (a.coddep - b.coddep) * dir;
        case "qtd":
          return (a.qtdFuncionario - b.qtdFuncionario) * dir;
        case "ini":
          return a.hrini.localeCompare(b.hrini) * dir;
        case "fim":
          return a.hrfin.localeCompare(b.hrfin) * dir;
        default:
          return 0;
      }
    });

    return data;
  }, [rows, q, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((s) => !s);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const exportCsv = () => {
    const mmYYYY = monthInputToMMYYYY(mesRef);

    const header = [
      "mes_ref",
      "codbancohoras",
      "codusu",
      "nomeusu",
      "hrini",
      "hrfin",
      "coddep",
      "qtd_funcionario",
    ];

    const body = list.map((r) => [
      mmYYYY,
      r.codBancoHoras,
      r.codusu,
      r.nomeusu,
      r.hrini,
      r.hrfin,
      r.coddep,
      r.qtdFuncionario,
    ]);

    const csv = [header, ...body]
      .map((row) =>
        row
          .map((v) => {
            const s = String(v ?? "");
            if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
            return s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hora_extra_${mmYYYY.replace("/", "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const abrirAprovar = (r: HoraExtraRow) => {
    setAprovarTarget(r);
    setAprovarOpen(true);
  };

  const fecharAprovar = () => {
    setAprovarOpen(false);
    setAprovarTarget(null);
  };

  const aprovar = async () => {
    if (!aprovarTarget) return;

    try {
      setAprovando(true);

      // ✅ endpoint dedicado para aprovar (implemente no backend)
      await api.post("/api/banco-horas/aprovar", {
        codBancoHoras: aprovarTarget.codBancoHoras,
      });

      alert("Solicitação aprovada com sucesso.");
      fecharAprovar();
      await carregar();
    } catch (e: any) {
      console.error("[HoraExtraPage] aprovar:", e);
      alert(
        e?.response?.data?.erro ||
          e?.message ||
          "Falha ao aprovar a solicitação. Verifique o backend (/api/banco-horas/aprovar)."
      );
    } finally {
      setAprovando(false);
    }
  };

  const mmYYYY = monthInputToMMYYYY(mesRef);

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Topbar / Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[11px]">
            Banco de Horas • {mmYYYY}
          </Badge>

          <Input
            type="month"
            value={mesRef}
            onChange={(e) => setMesRef(e.target.value)}
            className="h-9 w-[160px]"
          />

          <Input
            value={coddep}
            onChange={(e) => setCoddep(e.target.value)}
            className="h-9 w-[160px]"
            placeholder={depsLoading ? "Depto..." : depLabel ? depLabel : "Filtrar CODDEP"}
            title="Filtrar por CODDEP (opcional)"
          />
        </div>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-[320px]"
          placeholder="Buscar por código, usuário, depto…"
        />

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={carregar} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </Button>

          <Button variant="secondary" size="sm" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>

          <Button variant="outline" size="sm" className="gap-2" disabled title="Vamos criar em um segundo momento">
            <Plus className="h-4 w-4" />
            Nova solicitação
          </Button>

          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </Button>
        </div>
      </div>

      {/* Lista */}
      <Card className="flex-1 overflow-hidden">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Solicitações de hora extra</p>
              <p className="text-[11px] text-muted-foreground">
                Supervisor (CODUSU): <span className="font-medium">{CODUSU_SUP}</span> • Mês:{" "}
                <span className="font-medium">{mmYYYY}</span>
              </p>
            </div>
            <Badge variant="outline" className="text-[11px]">
              {list.length} registro(s)
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {erro && <div className="px-4 pb-3 text-sm text-red-600">{erro}</div>}

          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
              {/* Header sticky */}
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("cod")}>
                    Cód <ArrowUpDown className="h-3 w-3" />
                  </button>
                  <button className="col-span-3 text-left inline-flex items-center gap-1" onClick={() => toggleSort("usuario")}>
                    Supervisor <ArrowUpDown className="h-3 w-3" />
                  </button>
                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("depto")}>
                    Depto <ArrowUpDown className="h-3 w-3" />
                  </button>
                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("ini")}>
                    Início <ArrowUpDown className="h-3 w-3" />
                  </button>
                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("fim")}>
                    Fim <ArrowUpDown className="h-3 w-3" />
                  </button>
                  <button className="col-span-1 text-right inline-flex items-center justify-end gap-1" onClick={() => toggleSort("qtd")}>
                    Qtd <ArrowUpDown className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Linhas */}
              <div className="divide-y">
                {list.map((r) => (
                  <div key={r.codBancoHoras} className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-muted/40 transition">
                    {/* cód */}
                    <div className="col-span-2">
                      <Badge variant="outline" className="text-[11px]">
                        #{r.codBancoHoras}
                      </Badge>
                    </div>

                    {/* supervisor */}
                    <div className="col-span-3 min-w-0">
                      <p className="text-sm font-medium truncate">{r.nomeusu}</p>
                      <p className="text-[11px] text-muted-foreground">CODUSU {r.codusu}</p>
                    </div>

                    {/* depto */}
                    <div className="col-span-2">
                      <Badge variant="secondary" className="text-[11px]">
                        CODDEP {r.coddep}
                      </Badge>
                    </div>

                    {/* inicio / fim */}
                    <div className="col-span-2">
                      <p className="text-sm font-medium">{r.hrini}</p>
                      <p className="text-[11px] text-muted-foreground">HRINI</p>
                    </div>

                    <div className="col-span-2">
                      <p className="text-sm font-medium">{r.hrfin}</p>
                      <p className="text-[11px] text-muted-foreground">HRFIN</p>
                    </div>

                    {/* qtd + ação */}
                    <div className="col-span-1 text-right">
                      <p className="text-sm font-semibold">{r.qtdFuncionario}</p>
                      <p className="text-[11px] text-muted-foreground">func.</p>
                    </div>

                    <div className="col-span-12 flex justify-end gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={() => abrirAprovar(r)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Aprovar
                      </Button>
                    </div>
                  </div>
                ))}

                {!list.length && (
                  <div className="p-6 text-sm text-muted-foreground">
                    Nenhuma solicitação encontrada para os filtros atuais.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Aprovar */}
      <Dialog.Root open={aprovarOpen} onOpenChange={(o) => (o ? setAprovarOpen(true) : fecharAprovar())}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
          <Dialog.Content
            className="
              fixed left-1/2 top-1/2 z-[60]
              w-[92vw] max-w-[520px]
              -translate-x-1/2 -translate-y-1/2
              rounded-2xl bg-white text-slate-900
              border border-slate-200 p-4 shadow-2xl outline-none
            "
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">Aprovar solicitação</Dialog.Title>
                <Dialog.Description className="text-xs text-slate-600">
                  Confirme a aprovação desta hora extra.
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar" disabled={aprovando}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Solicitação</p>
                <p className="font-medium">
                  #{aprovarTarget?.codBancoHoras} • {aprovarTarget?.nomeusu}
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  {mmYYYY} • CODDEP {aprovarTarget?.coddep} • {aprovarTarget?.hrini} → {aprovarTarget?.hrfin} •{" "}
                  {aprovarTarget?.qtdFuncionario} funcionário(s)
                </p>
              </div>

              <p className="text-xs text-slate-600">
                * A ação chama <code>/api/banco-horas/aprovar</code>. Se você quiser,
                eu adapto para gravar direto via <code>/api/sankhya/dataset/save</code> quando você me
                passar os campos de aprovação da tabela <code>AD_BANCOHORAS</code>.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={fecharAprovar} disabled={aprovando}>
                Cancelar
              </Button>
              <Button onClick={aprovar} disabled={aprovando} className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {aprovando ? "Aprovando..." : "Aprovar"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
