// src/pages/MateriaisPage.tsx
import React, { useEffect, useMemo, useState } from "react";
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
import { Calendar, Save, X, RefreshCw } from "lucide-react";

import { obterReg } from "@/lib/obterReg";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";
import { cn } from "@/lib/utils";

/* ==================== Tipos ==================== */
type SetorRow = { codNat: number; setor: string };

type ChassiRow = {
  codNat: number;
  setor: string;
  nunota: number;
  dtNeg: string; // YYYY-MM-DD
  chassi: string;
  dataFimPrev?: string; // YYYY-MM-DD
  idIproc: number;
};

type MaterialStatus = "Pendente" | "Planejado" | "Entregue";

type MaterialRow = {
  codNat: number;
  setor: string;
  nunota: number;
  sequencia: number;
  dtNeg: string; // YYYY-MM-DD
  chassi: string;
  idIproc: number;
  codProd: number;
  descrProd: string;

  adDiaReq?: string; // YYYY-MM-DD (data desejada)
  adDtEntrega?: string; // YYYY-MM-DD (entregue)
};

type MaterialUI = MaterialRow & {
  status: MaterialStatus;
  // campo editável na tela
  dtDesejada?: string; // YYYY-MM-DD
  _origDtDesejada?: string; // para detectar alteração
};

/* ==================== Utils ==================== */
const toBR = (ymd?: string) => (!ymd ? "-" : ymd.split("-").reverse().join("/"));
const todayYMD = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

function toSankhyaDate(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`; // DD/MM/YYYY
}

function statusFromRow(r: MaterialRow): MaterialStatus {
  if (r.adDtEntrega) return "Entregue";
  if (r.adDiaReq) return "Planejado";
  return "Pendente";
}

const badgeStatus = (s: MaterialStatus) => {
  if (s === "Entregue") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (s === "Planejado") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-amber-100 text-amber-900 border-amber-200";
};

/* ==================== Página ==================== */
export default function MateriaisPage() {
  const { user } = useAuth();

  const [loadingSetores, setLoadingSetores] = useState(false);
  const [loadingChassis, setLoadingChassis] = useState(false);
  const [loadingMats, setLoadingMats] = useState(false);
  const [saving, setSaving] = useState(false);

  const [erro, setErro] = useState<string | null>(null);

  const [setores, setSetores] = useState<SetorRow[]>([]);
  const [chassis, setChassis] = useState<ChassiRow[]>([]);
  const [materiais, setMateriais] = useState<MaterialUI[]>([]);

  const [qSetor, setQSetor] = useState("");
  const [qChassi, setQChassi] = useState("");
  const [qProd, setQProd] = useState("");
  const [fStatus, setFStatus] = useState<"Todos" | MaterialStatus>("Todos");

  const [selSetor, setSelSetor] = useState<SetorRow | null>(null);
  const [selChassi, setSelChassi] = useState<ChassiRow | null>(null);

  // Sheet (materiais do chassi)
  const [openSheet, setOpenSheet] = useState(false);

  // bulk date
  const [bulkDate, setBulkDate] = useState<string>("");
  const [bulkScope, setBulkScope] = useState<"Filtrados" | "Todos">("Filtrados");

  const CODUSU_LOGADO = (user as any)?.codusu ?? 134;

  const reloadSetores = async () => {
    try {
      setErro(null);
      setLoadingSetores(true);

      const sql = `
        SELECT DISTINCT
          CAB.CODNAT AS CODIGOSETOR,
          NAT.DESCRNAT AS SETOR
        FROM TGFCAB CAB
        JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA
        JOIN TGFNAT NAT ON NAT.CODNAT = CAB.CODNAT
        WHERE CAB.CODTIPOPER = 450
          AND CAB.PENDENTE = 'S'
        ORDER BY 2
      `.trim();

      const rows = await obterReg(sql);

      const mapped: SetorRow[] = (rows || []).map((r: any) => ({
        codNat: Number(r.CODIGOSETOR ?? 0),
        setor: String(r.SETOR ?? ""),
      }));

      setSetores(mapped);

      // se o setor atual não existe mais, limpa
      if (selSetor && !mapped.some((s) => s.codNat === selSetor.codNat)) {
        setSelSetor(null);
        setChassis([]);
        setSelChassi(null);
        setMateriais([]);
        setOpenSheet(false);
      }
    } catch (e: any) {
      console.error("[MateriaisPage] setores:", e);
      setErro(e?.message || "Falha ao carregar setores.");
    } finally {
      setLoadingSetores(false);
    }
  };

  const loadChassisBySetor = async (codNat: number) => {
    try {
      setErro(null);
      setLoadingChassis(true);
      setChassis([]);
      setSelChassi(null);
      setMateriais([]);
      setOpenSheet(false);

      const sql = `
        SELECT DISTINCT  
          CAB.CODNAT,
          NAT.DESCRNAT AS DESCRNAT,
          MAX(CAB.NUNOTA) AS NUNOTA,
          MAX(TO_CHAR(CAB.DTNEG,'YYYY-MM-DD')) AS DTNEG,
          IP.NROLOTE AS CHASSI,
          MAX(TO_CHAR(CRO.DATAFIMPREV,'YYYY-MM-DD')) AS DATAFIMPREV,
          CAB.IDIPROC
        FROM TGFCAB CAB
        JOIN TGFITE ITE ON ITE.NUNOTA = CAB.NUNOTA
        JOIN TGFNAT NAT ON NAT.CODNAT = CAB.CODNAT
        JOIN TPRIPROC PROC ON PROC.IDIPROC = CAB.IDIPROC
        JOIN TCSPRJ PRJ ON PRJ.CODPROJ = PROC.AD_CODPROJ
        JOIN TCSPRJ PAI ON PRJ.CODPROjPAI = PAI.CODPROj
        JOIN AD_CRONOGRAMA CRO ON CRO.CODPROJ = PRJ.CODPROJ
        JOIN TPRIPA IP ON IP.IDIPROC = CAB.IDIPROC
        WHERE CAB.CODTIPOPER = 450
          AND CAB.PENDENTE = 'S'
          AND CAB.CODNAT = ${Number(codNat)}
          AND PAI.AD_CODSUPERVISOR = ${Number(CODUSU_LOGADO)}
          AND NOT PROC.STATUSPROC IN ('C','F')
        GROUP BY CAB.CODNAT, NAT.DESCRNAT, CAB.IDIPROC, IP.NROLOTE
        ORDER BY IP.NROLOTE
      `.trim();

      const rows = await obterReg(sql);

      const mapped: ChassiRow[] = (rows || []).map((r: any) => ({
        codNat: Number(r.CODNAT ?? 0),
        setor: String(r.DESCRNAT ?? ""),
        nunota: Number(r.NUNOTA ?? 0),
        dtNeg: String(r.DTNEG ?? ""),
        chassi: String(r.CHASSI ?? ""),
        dataFimPrev: String(r.DATAFIMPREV ?? ""),
        idIproc: Number(r.IDIPROC ?? 0),
      }));

      setChassis(mapped);
    } catch (e: any) {
      console.error("[MateriaisPage] chassis:", e);
      setErro(e?.message || "Falha ao carregar chassis do setor.");
    } finally {
      setLoadingChassis(false);
    }
  };

  const loadMateriais = async (codNat: number, idIproc: number) => {
    try {
      setErro(null);
      setLoadingMats(true);
      setMateriais([]);
      setQProd("");
      setFStatus("Todos");
      setBulkDate("");
      setBulkScope("Filtrados");

      // OBS: formatamos datas para YYYY-MM-DD (melhor para input date)
      const sql = `
        SELECT DISTINCT  
          CODNAT,
          TO_CHAR(AD_DIAREQ,'YYYY-MM-DD') AS AD_DIAREQ,
          DESCRNAT,
          NUNOTA,
          SEQUENCIA,
           DTNEG,
          CHASSI,
          IDIPROC,
          CODPROD,
          DESCRPROD,
          TO_CHAR(AD_DTENTREGA,'YYYY-MM-DD') AS AD_DTENTREGA
        FROM LISTAPLANEJAMENTOFILTRADOS
        WHERE CODNAT = ${Number(codNat)}
          AND IDIPROC = ${Number(idIproc)}
        ORDER BY DESCRPROD
      `.trim();

      const rows = await obterReg(sql);

      const mapped: MaterialUI[] = (rows || []).map((r: any, idx: number) => {
        const row: MaterialRow = {
          codNat: Number(r.CODNAT ?? 0),
          setor: String(r.DESCRNAT ?? ""),
          nunota: Number(r.NUNOTA ?? 0),
          sequencia: Number(r.SEQUENCIA ?? 0),
          dtNeg: String(r.DTNEG ?? ""),
          chassi: String(r.CHASSI ?? ""),
          idIproc: Number(r.IDIPROC ?? 0),
          codProd: Number(r.CODPROD ?? 0),
          descrProd: String(r.DESCRPROD ?? ""),
          adDiaReq: String(r.AD_DIAREQ ?? "") || undefined,
          adDtEntrega: String(r.AD_DTENTREGA ?? "") || undefined,
        };

        const st = statusFromRow(row);
        const dtDesejada = row.adDiaReq;

        return {
          ...row,
          status: st,
          dtDesejada,
          _origDtDesejada: dtDesejada,
          // id local (se precisar)
          // @ts-ignore
          __idx: idx + 1,
        };
      });

      setMateriais(mapped);
    } catch (e: any) {
      console.error("[MateriaisPage] materiais:", e);
      setErro(e?.message || "Falha ao carregar materiais do chassi.");
    } finally {
      setLoadingMats(false);
    }
  };

  useEffect(() => {
    reloadSetores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ==================== Filtros ==================== */
  const setoresFiltrados = useMemo(() => {
    const k = qSetor.trim().toLowerCase();
    if (!k) return setores;
    return setores.filter((s) => `${s.codNat} ${s.setor}`.toLowerCase().includes(k));
  }, [setores, qSetor]);

  const chassisFiltrados = useMemo(() => {
    const k = qChassi.trim().toLowerCase();
    if (!k) return chassis;
    return chassis.filter((c) =>
      `${c.chassi} ${c.nunota} ${c.idIproc} ${c.dtNeg}`.toLowerCase().includes(k)
    );
  }, [chassis, qChassi]);

  const materiaisFiltrados = useMemo(() => {
    const k = qProd.trim().toLowerCase();
    return materiais.filter((m) => {
      if (fStatus !== "Todos" && m.status !== fStatus) return false;
      if (k) {
        const hay = `${m.codProd} ${m.descrProd}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }
      return true;
    });
  }, [materiais, qProd, fStatus]);

  const counts = useMemo(() => {
    let pend = 0,
      plan = 0,
      entr = 0;
    materiais.forEach((m) => {
      if (m.status === "Pendente") pend++;
      else if (m.status === "Planejado") plan++;
      else entr++;
    });
    return { pend, plan, entr, total: materiais.length };
  }, [materiais]);

  const dirtyCount = useMemo(() => {
    return materiais.filter((m) => (m.dtDesejada || "") !== (m._origDtDesejada || "")).length;
  }, [materiais]);

  /* ==================== Ações ==================== */
  const onPickSetor = async (s: SetorRow) => {
    setSelSetor(s);
    await loadChassisBySetor(s.codNat);
  };

  const onPickChassi = async (c: ChassiRow) => {
    setSelChassi(c);
    setOpenSheet(true);
    await loadMateriais(c.codNat, c.idIproc);
  };

  const setDtItem = (nunota: number, sequencia: number, ymd?: string) => {
    setMateriais((arr) =>
      arr.map((m) => {
        if (m.nunota !== nunota || m.sequencia !== sequencia) return m;

        const dtDesejada = ymd || undefined;
        // status só muda se NÃO for entregue
        const status: MaterialStatus =
          m.adDtEntrega ? "Entregue" : dtDesejada ? "Planejado" : "Pendente";

        return { ...m, dtDesejada, status };
      })
    );
  };

  const applyBulkDate = () => {
    const ymd = bulkDate || "";
    const target = bulkScope === "Todos" ? materiais : materiaisFiltrados;

    if (!target.length) return;

    setMateriais((arr) =>
      arr.map((m) => {
        const hit = target.some((t) => t.nunota === m.nunota && t.sequencia === m.sequencia);
        if (!hit) return m;

        if (m.status === "Entregue") return m; // não mexe em entregue
        const dtDesejada = ymd ? ymd : undefined;
        const status: MaterialStatus = dtDesejada ? "Planejado" : "Pendente";
        return { ...m, dtDesejada, status };
      })
    );
  };

  const quickToday = () => setBulkDate(todayYMD());
  const quickTomorrow = () => setBulkDate(addDays(1));

  const salvarNoErp = async () => {
    if (!selChassi) {
      alert("Selecione um chassi.");
      return;
    }

    const changes = materiais.filter((m) => (m.dtDesejada || "") !== (m._origDtDesejada || ""));
    if (!changes.length) {
      alert("Nenhuma alteração de data para salvar.");
      return;
    }

    // ⚠️ Pressuposto: o campo AD_DIAREQ está no item (TGFITE) e a PK é NUNOTA + SEQUENCIA.
    // Se no seu Sankhya esse campo estiver em outra tabela (ex: TGFCAB ou tabela AD),
    // me diga que eu ajusto a entity/PK.
    try {
      setSaving(true);

      for (const m of changes) {
        await api.post("/api/sankhya/dataset/save", {
          entity: "TGFITE",
          fields: ["NUNOTA", "SEQUENCIA", "AD_DIAREQ"],
          values: {
            "0": String(m.nunota),
            "1": String(m.sequencia),
            "2": m.dtDesejada ? toSankhyaDate(m.dtDesejada) : "",
          },
          pk: {
            NUNOTA: String(m.nunota),
            SEQUENCIA: String(m.sequencia),
          },
        });
      }

      // marca como salvo
      setMateriais((arr) =>
        arr.map((m) => ({
          ...m,
          _origDtDesejada: m.dtDesejada,
        }))
      );

      alert("Datas atualizadas no ERP com sucesso.");
    } catch (e: any) {
      console.error("[salvarNoErp] erro:", e);
      alert(`Erro ao salvar no ERP.\n${e?.message || "Veja o console."}`);
    } finally {
      setSaving(false);
    }
  };

  /* ==================== Render ==================== */
  return (
    <div className="space-y-4">
      {/* Topo */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Materiais — Planejamento por Setor</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Usuário: {CODUSU_LOGADO || "-"}</span>
                <span>• Setor: {selSetor ? `${selSetor.codNat} - ${selSetor.setor}` : "—"}</span>
                <span>• Chassi: {selChassi ? `${selChassi.chassi} (IDIPROC ${selChassi.idIproc})` : "—"}</span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={reloadSetores}
              disabled={loadingSetores}
            >
              <RefreshCw className={cn("h-4 w-4", loadingSetores && "animate-spin")} />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {erro && <div className="text-sm text-red-600">{erro}</div>}
          {!CODUSU_LOGADO && (
            <div className="text-xs text-amber-700">
              Atenção: não encontrei CODUSU do usuário logado. A consulta de chassis usa o supervisor (PAI.AD_CODSUPERVISOR).
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2 grades: Setores + Chassis */}
      <div className="grid grid-cols-12 gap-4">
        {/* Setores */}
        <Card className="col-span-12 lg:col-span-4">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">1) Setores pendentes</h4>
              <Badge variant="outline" className="text-[11px]">
                {setoresFiltrados.length}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input
              placeholder="Buscar setor…"
              value={qSetor}
              onChange={(e) => setQSetor(e.target.value)}
              className="h-8 text-sm"
            />

            <div className="rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-2 border-b bg-muted/40">
                <div className="col-span-3">Código</div>
                <div className="col-span-9">Setor</div>
              </div>

              <div className="max-h-[420px] overflow-y-auto divide-y">
                {loadingSetores && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">Carregando setores…</div>
                )}

                {!loadingSetores &&
                  setoresFiltrados.map((s) => {
                    const active = selSetor?.codNat === s.codNat;
                    return (
                      <button
                        key={s.codNat}
                        type="button"
                        onClick={() => onPickSetor(s)}
                        className={cn(
                          "w-full text-left grid grid-cols-12 items-center px-3 py-2 text-sm hover:bg-muted",
                          active && "bg-primary/10"
                        )}
                      >
                        <div className="col-span-3 font-medium">{s.codNat}</div>
                        <div className="col-span-9 truncate">{s.setor}</div>
                      </button>
                    );
                  })}

                {!loadingSetores && setoresFiltrados.length === 0 && (
                  <div className="px-3 py-6 text-xs text-muted-foreground">Nenhum setor encontrado.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Chassis */}
        <Card className="col-span-12 lg:col-span-8">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">2) Chassis / Ordens de Produção</h4>
              <Badge variant="outline" className="text-[11px]">
                {chassisFiltrados.length}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>
                {selSetor
                  ? `Setor selecionado: ${selSetor.codNat} - ${selSetor.setor}`
                  : "Selecione um setor para carregar os chassis."}
              </span>
            </div>
          </CardHeader>

          <CardContent className="space-y-2">
            <Input
              placeholder="Buscar chassi, NUNOTA, IDIPROC…"
              value={qChassi}
              onChange={(e) => setQChassi(e.target.value)}
              className="h-8 text-sm"
              disabled={!selSetor}
            />

            <div className="rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-2 border-b bg-muted/40">
                <div className="col-span-3">Chassi</div>
                <div className="col-span-2">NUNOTA</div>
                <div className="col-span-2">DTNEG</div>
                <div className="col-span-3">FIM PREV</div>
                <div className="col-span-2 text-right">Ação</div>
              </div>

              <div className="max-h-[420px] overflow-y-auto divide-y">
                {loadingChassis && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">Carregando chassis…</div>
                )}

                {!loadingChassis &&
                  chassisFiltrados.map((c) => {
                    const active = selChassi?.idIproc === c.idIproc;
                    return (
                      <div
                        key={`${c.idIproc}-${c.chassi}`}
                        className={cn(
                          "grid grid-cols-12 items-center px-3 py-2 gap-2 text-sm",
                          active && "bg-primary/10"
                        )}
                      >
                        <div className="col-span-3 font-medium truncate">{c.chassi}</div>
                        <div className="col-span-2">{c.nunota}</div>
                        <div className="col-span-2">{toBR(c.dtNeg)}</div>
                        <div className="col-span-3">{toBR(c.dataFimPrev)}</div>
                        <div className="col-span-2 text-right">
                          <Button size="sm" className="h-8" onClick={() => onPickChassi(c)}>
                            Abrir materiais
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                {!loadingChassis && selSetor && chassisFiltrados.length === 0 && (
                  <div className="px-3 py-6 text-xs text-muted-foreground">
                    Nenhum chassi encontrado para o setor selecionado.
                  </div>
                )}

                {!selSetor && (
                  <div className="px-3 py-6 text-xs text-muted-foreground">
                    Selecione um setor à esquerda para listar os chassis.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sheet: Materiais do chassi */}
      <Sheet
        open={openSheet}
        onOpenChange={(open) => {
          setOpenSheet(open);
          if (!open) {
            setSelChassi(null);
            setMateriais([]);
          }
        }}
      >
        <SheetContent side="right" size="xl" className="bg-white">
          <SheetHeader className="bg-white border-b">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SheetTitle>
                  3) Materiais — {selChassi ? `Chassi ${selChassi.chassi}` : "—"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  {selSetor ? `${selSetor.codNat} - ${selSetor.setor}` : "—"} •{" "}
                  {selChassi ? `IDIPROC ${selChassi.idIproc} • NUNOTA ${selChassi.nunota}` : "—"}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <Badge className={cn("text-[11px] px-2", "bg-amber-100 text-amber-900 border-amber-200")}>
                    Pendentes: {counts.pend}
                  </Badge>
                  <Badge className={cn("text-[11px] px-2", "bg-sky-100 text-sky-800 border-sky-200")}>
                    Planejados: {counts.plan}
                  </Badge>
                  <Badge className={cn("text-[11px] px-2", "bg-emerald-100 text-emerald-800 border-emerald-200")}>
                    Entregues: {counts.entr}
                  </Badge>
                  <Badge variant="outline" className="text-[11px]">
                    Total: {counts.total}
                  </Badge>
                  {dirtyCount > 0 && (
                    <Badge variant="destructive" className="text-[11px]">
                      Alterações: {dirtyCount}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => {
                    if (selChassi) loadMateriais(selChassi.codNat, selChassi.idIproc);
                  }}
                  disabled={loadingMats || !selChassi}
                >
                  <RefreshCw className={cn("h-4 w-4", loadingMats && "animate-spin")} />
                  Recarregar
                </Button>

                <Button
                  size="sm"
                  className="gap-2"
                  onClick={salvarNoErp}
                  disabled={saving || loadingMats || dirtyCount === 0}
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Salvando…" : "Salvar ERP"}
                </Button>

                <Button variant="ghost" size="icon" onClick={() => setOpenSheet(false)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="p-4 space-y-3 bg-white h-[calc(100%-64px)] overflow-auto">
            {/* Filtros + Bulk */}
            <Card>
              <CardContent className="p-3 space-y-3">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-12 lg:col-span-6">
                    <label className="text-xs text-muted-foreground">Buscar produto</label>
                    <Input
                      placeholder="CODPROD ou DESCRPROD…"
                      value={qProd}
                      onChange={(e) => setQProd(e.target.value)}
                      className="h-8 text-sm"
                      disabled={loadingMats}
                    />
                  </div>

                  <div className="col-span-12 lg:col-span-3">
                    <label className="text-xs text-muted-foreground">Status</label>
                    <select
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={fStatus}
                      onChange={(e) => setFStatus(e.target.value as any)}
                      disabled={loadingMats}
                    >
                      <option value="Todos">Todos</option>
                      <option value="Pendente">Pendente</option>
                      <option value="Planejado">Planejado</option>
                      <option value="Entregue">Entregue</option>
                    </select>
                  </div>

                  <div className="col-span-12 lg:col-span-3">
                    <label className="text-xs text-muted-foreground">Aplicar data</label>
                    <div className="mt-1 flex items-center gap-2">
                      <Input
                        type="date"
                        value={bulkDate}
                        onChange={(e) => setBulkDate(e.target.value)}
                        className="h-8"
                        disabled={loadingMats}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={quickToday}
                        disabled={loadingMats}
                        title="Hoje"
                      >
                        Hoje
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={quickTomorrow}
                        disabled={loadingMats}
                        title="Amanhã"
                      >
                        +1
                      </Button>
                    </div>
                  </div>

                  <div className="col-span-12 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>Aplicar em:</span>
                      <select
                        className="rounded-md border bg-background px-2 py-1 text-xs"
                        value={bulkScope}
                        onChange={(e) => setBulkScope(e.target.value as any)}
                        disabled={loadingMats}
                      >
                        <option value="Filtrados">Filtrados</option>
                        <option value="Todos">Todos</option>
                      </select>
                      <span>• Itens filtrados: {materiaisFiltrados.length}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={applyBulkDate}
                        disabled={loadingMats || (!bulkDate && bulkDate !== "")}
                        className="gap-2"
                        title="Aplica a data escolhida (ou limpa se estiver vazio)"
                      >
                        Aplicar data
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Lista materiais */}
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Materiais disponíveis para agendamento</h4>
                  <Badge variant="outline" className="text-[11px]">
                    {materiaisFiltrados.length}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <div className="min-w-[980px]">
                    <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-2 border-b bg-muted/40">
                      <div className="col-span-1">Seq</div>
                      <div className="col-span-2">CODPROD</div>
                      <div className="col-span-4">Produto</div>
                      <div className="col-span-2">Status</div>
                      <div className="col-span-2">Dia desejado</div>
                      <div className="col-span-1 text-right">Ação</div>
                    </div>

                    <div className="max-h-[520px] overflow-y-auto divide-y">
                      {loadingMats && (
                        <div className="px-3 py-6 text-xs text-muted-foreground">Carregando materiais…</div>
                      )}

                      {!loadingMats &&
                        materiaisFiltrados.map((m) => {
                          const changed = (m.dtDesejada || "") !== (m._origDtDesejada || "");
                          const disabled = m.status === "Entregue";

                          return (
                            <div
                              key={`${m.nunota}-${m.sequencia}-${m.codProd}`}
                              className={cn(
                                "grid grid-cols-12 items-center px-3 py-2 gap-2 text-sm",
                                changed && "bg-primary/5"
                              )}
                            >
                              <div className="col-span-1 text-xs text-muted-foreground">{m.sequencia}</div>

                              <div className="col-span-2 font-medium">{m.codProd}</div>

                              <div className="col-span-4">
                                <div className="font-medium truncate" title={m.descrProd}>
                                  {m.descrProd}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  NUNOTA {m.nunota} • DTNEG {toBR(m.dtNeg)}
                                  {m.adDtEntrega ? ` • Entregue em ${toBR(m.adDtEntrega)}` : ""}
                                </div>
                              </div>

                              <div className="col-span-2">
                                <Badge className={cn("text-[11px] px-2", badgeStatus(m.status))}>
                                  {m.status}
                                </Badge>
                              </div>

                              <div className="col-span-2 flex items-center gap-2">
                                <Input
                                  type="date"
                                  value={m.dtDesejada || ""}
                                  onChange={(e) => setDtItem(m.nunota, m.sequencia, e.target.value || "")}
                                  className="h-8"
                                  disabled={disabled}
                                />
                              </div>

                              <div className="col-span-1 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 px-2"
                                  onClick={() => setDtItem(m.nunota, m.sequencia, "")}
                                  disabled={disabled}
                                  title="Limpar data"
                                >
                                  Limpar
                                </Button>
                              </div>
                            </div>
                          );
                        })}

                      {!loadingMats && materiaisFiltrados.length === 0 && (
                        <div className="px-3 py-8 text-xs text-muted-foreground">
                          Nenhum material com os filtros atuais.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Rodapé */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Dica: você pode aplicar uma data em lote e depois ajustar item a item.
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    // desfaz alterações locais (volta para _orig)
                    setMateriais((arr) =>
                      arr.map((m) => ({
                        ...m,
                        dtDesejada: m._origDtDesejada,
                        status: statusFromRow({
                          ...m,
                          adDiaReq: m._origDtDesejada,
                          // adDtEntrega mantém
                        }),
                      }))
                    );
                  }}
                  disabled={dirtyCount === 0 || saving || loadingMats}
                >
                  Desfazer
                </Button>

                <Button onClick={salvarNoErp} disabled={saving || loadingMats || dirtyCount === 0} className="gap-2">
                  <Save className="h-4 w-4" />
                  {saving ? "Salvando…" : "Salvar ERP"}
                </Button>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
