// src/pages/AtividadesPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/overlays/SideSheet";

type StatusOP = "Baixo avanço" | "Em dia" | "Adiantado";

type OPPlanejamento = {
  op: string;            // IDIPROC
  barco: string;         // BARCO (controle PA)
  linha: string;         // DESCRGRUPOPROD
  avancoPrev: number;    // AVANCO_PREV
  avancoReal: number;    // AVANCO_REAL
  codproj: number;
  identificacao: string;
  codparc: number | null;
  nomeparc: string | null;

  // planejamento local (por enquanto só em memória)
  dtIniPlan?: string;    // YYYY-MM-DD
  dtFimPlan?: string;    // YYYY-MM-DD
};

const pct = (v: number) => {
  if (!v || isNaN(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return Math.round(v);
};

function statusFromAvanco(prev: number, real: number): StatusOP {
  if (!prev && !real) return "Baixo avanço";
  if (real >= prev + 10) return "Adiantado";
  if (real >= prev - 10) return "Em dia";
  return "Baixo avanço";
}

export default function AtividadesPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ops, setOps] = useState<OPPlanejamento[]>([]);

  // filtros
  const [q, setQ] = useState("");
  const [linhaFiltro, setLinhaFiltro] = useState<string>("Todas");
  const [statusFiltro, setStatusFiltro] = useState<"Todos" | StatusOP>("Todos");

  // sheet OP aberta
  const [openOp, setOpenOp] = useState<OPPlanejamento | null>(null);

  // ================== Carregar OPs da consulta ==================
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErro(null);

        const sql = `
          SELECT
            T.IDIPROC           AS OP,
            T.BARCO             AS BARCO,
            T.DESCRGRUPOPROD    AS LINHA,
            TRUNC(AVG(T.PREVISTO)) AS AVANCO_PREV,
            TRUNC(AVG(T.AVANCO))   AS AVANCO_REAL,
            T.CODPROJ,
            T.IDENTIFICACAO,
            T.CODPARC,
            T.NOMEPARC
          FROM (
            SELECT DISTINCT
              (SELECT DISTINCT MAX(DATA)
                 FROM AD_APOAVANCO AVO
                 JOIN AD_COMPONENTECRONO CRO2
                   ON CRO2.SEQ = AVO.SEQ
                  AND AVO.CODUSU = CRO2.CODUSU
                  AND AVO.CODPRODSP = CRO2.CODPRODSP
                WHERE AVO.SEQ = DET.SEQ
                  AND AVO.CODUSU = USU.CODUSU
                  AND RETRABALHO = 'S') AS DTRETRABALHO,
              Snk_Dividir(
                ONE_NUMEROSUPPROD_PREV_DATA(USU.CODUSU , DET.SEQ, SYSDATE),
                ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
              ) * 100 AS PREVISTO,
              NVL(LOT.CONTROLEPA , 'Ordem não Lancada') AS BARCO,
              GRU.NOMEGRUPO      AS MACROSETOR,
              USU.CODGRUPO       AS SETOR,
              USU.NOMEUSU,
              DET.CODUSU,
              CASE
                WHEN Snk_Dividir(
                       ONE_NUMEROSUPPROD_REA(USU.CODUSU , DET.SEQ),
                       ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
                     ) * 100 > 100
                THEN 100
                ELSE Snk_Dividir(
                       ONE_NUMEROSUPPROD_REA(USU.CODUSU , DET.SEQ),
                       ONE_NUMEROSUPPROD_PREV(USU.CODUSU , DET.SEQ)
                     ) * 100
              END AS AVANCO,
              DET.DTINICIOPREV,
              DET.DTFIMPREV,
              (SELECT MAX(DATA)
                 FROM AD_APOAVANCO
                WHERE CODUSU = USU.CODUSU
                  AND SEQ = DET.SEQ) AS ULTAPO,
              ONE_NUMEROSUPPROD_PREV(DET.CODUSU , DET.SEQ) as AvPrev,
              ONE_NUMEROSUPPROD_REA(DET.CODUSU , DET.SEQ)  as AvReal,
              DET.SEQ,
              PROC.IDIPROC,
              CASE 
                WHEN PAI.AD_CODGRUPOPROD IN (020100,020200,020300,020400,021000) THEN 'NX 260-290'
                WHEN PAI.AD_CODGRUPOPROD IN (020800,021400) THEN 'NX 340-350'
                WHEN PAI.AD_CODGRUPOPROD IN (020500,020600) THEN 'NX 360-370'
                WHEN PAI.AD_CODGRUPOPROD IN (020700,021300) THEN 'NX 410'
                WHEN PAI.AD_CODGRUPOPROD IN (021200) THEN 'NX 440'
                WHEN PAI.AD_CODGRUPOPROD IN (020900,021100) THEN 'NX 500'
                ELSE GRU2.DESCRGRUPOPROD
              END AS DESCRGRUPOPROD,
              PRJ.CODPROJ,
              PRJ.IDENTIFICACAO,
              PAR.CODPARC,
              PAR.NOMEPARC
            FROM AD_CRONOGRAMA CRO
            JOIN TGFGRU GRU2
              ON GRU2.CODGRUPOPROD = CRO.CODGRUPOPROD
            JOIN TPRIPROC PROC
              ON PROC.AD_CODPROJ = CRO.CODPROJ
             AND PROC.STATUSPROC <> 'C'
            JOIN TPRIPA LOT
              ON LOT.IDIPROC = PROC.IDIPROC
            JOIN AD_DETALCRONOGRAMA DET
              ON DET.SEQ = CRO.SEQ
            JOIN TSIUSU USU
              ON USU.CODUSU = DET.CODUSU
            JOIN TSIGRU GRU
              ON GRU.CODGRUPO = USU.CODGRUPO
            JOIN TCSPRJ PRJ
              ON CRO.CODPROJ = PRJ.CODPROJ
            JOIN TCSPRJ PAI
              ON PAI.CODPROJ = PRJ.CODPROJPAI
            LEFT JOIN TGFCAB CAB
              ON PRJ.CODPROJ = CAB.CODPROJ
             AND CAB.TIPMOV = 'P'
            LEFT JOIN TGFPAR PAR
              ON PAR.CODPARC = CAB.CODPARC
            WHERE CRO.ANO = '2025'
              AND CRO.MES = '11'
              AND PAI.AD_CODGRUPOPROD IN (020900,021100)
          ) T
          GROUP BY
            T.IDIPROC,
            T.BARCO,
            T.DESCRGRUPOPROD,
            T.CODPROJ,
            T.IDENTIFICACAO,
            T.CODPARC,
            T.NOMEPARC
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const mapped: OPPlanejamento[] = rows.map((r: any) => ({
          op: String(r.OP ?? ""),
          barco: String(r.BARCO ?? ""),
          linha: String(r.LINHA ?? ""),
          avancoPrev: Number(r.AVANCO_PREV ?? 0),
          avancoReal: Number(r.AVANCO_REAL ?? 0),
          codproj: Number(r.CODPROJ ?? 0),
          identificacao: String(r.IDENTIFICACAO ?? ""),
          codparc: r.CODPARC != null ? Number(r.CODPARC) : null,
          nomeparc: r.NOMEPARC != null ? String(r.NOMEPARC) : null,
        }));

        setOps(mapped);
      } catch (e: any) {
        console.error(e);
        setErro(e?.message || "Falha ao carregar OPs para planejamento.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, []);

  // =============== Lista filtrada ===============
  const list = useMemo(() => {
    return ops.filter((op) => {
      const k = q.trim().toLowerCase();
      if (k) {
        const hay =
          `${op.op} ${op.barco} ${op.linha} ${op.identificacao} ${op.nomeparc ?? ""}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }

      if (linhaFiltro !== "Todas" && op.linha !== linhaFiltro) return false;

      if (statusFiltro !== "Todos") {
        const st = statusFromAvanco(op.avancoPrev, op.avancoReal);
        if (st !== statusFiltro) return false;
      }

      return true;
    });
  }, [ops, q, linhaFiltro, statusFiltro]);

  // abrir/fechar sheet
  const abrirOP = (op: OPPlanejamento) => setOpenOp(op);
  const fecharOP = (open: boolean) => {
    if (!open) setOpenOp(null);
  };

  // set datas planejadas (só no estado, por enquanto)
  const setDatasPlanejamento = (opId: string, dtIni?: string, dtFim?: string) => {
    setOps((arr) =>
      arr.map((op) =>
        op.op !== opId ? op : { ...op, dtIniPlan: dtIni, dtFimPlan: dtFim }
      )
    );
    setOpenOp((current) =>
      current && current.op === opId
        ? { ...current, dtIniPlan: dtIni, dtFimPlan: dtFim }
        : current
    );
  };

  const irParaAlocacao = (op: OPPlanejamento) => {
    const qs = new URLSearchParams({
      op: op.op,
      codproj: String(op.codproj),
    }).toString();
    navigate(`/atividades/alocacao/${op.op}?${qs}`);
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Planejamento de OPs</h3>
            <span className="text-xs text-muted-foreground">
              Total de OPs: {ops.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-4">
            <Input
              placeholder="Buscar por OP, barco, linha, cliente…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="col-span-6 md:col-span-3">
            <label className="text-xs text-muted-foreground">Linha</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={linhaFiltro}
              onChange={(e) => setLinhaFiltro(e.target.value)}
            >
              <option value="Todas">Todas</option>
              <option value="NX 260-290">NX 260-290</option>
              <option value="NX 340-350">NX 340-350</option>
              <option value="NX 360-370">NX 360-370</option>
              <option value="NX 410">NX 410</option>
              <option value="NX 440">NX 440</option>
              <option value="NX 500">NX 500</option>
            </select>
          </div>

          <div className="col-span-6 md:col-span-3">
            <label className="text-xs text-muted-foreground">% Avanço Real</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={statusFiltro}
              onChange={(e) => setStatusFiltro(e.target.value as any)}
            >
              <option value="Todos">Todos</option>
              <option value="Baixo avanço">Baixo avanço</option>
              <option value="Em dia">Em dia</option>
              <option value="Adiantado">Adiantado</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Lista de OPs */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 px-4 py-3 text-xs text-muted-foreground bg-muted/30">
            <div className="col-span-2">OP</div>
            <div className="col-span-2">Barco</div>
            <div className="col-span-2">Linha</div>
            <div className="col-span-2">Cliente</div>
            <div className="col-span-2">Avanço</div>
            <div className="col-span-2" />
          </div>
          <div className="divide-y">
            {loading && (
              <div className="px-4 py-6 text-sm text-muted-foreground">
                Carregando OPs…
              </div>
            )}

            {erro && !loading && (
              <div className="px-4 py-6 text-sm text-red-600">{erro}</div>
            )}

            {!loading &&
              !erro &&
              list.map((op) => {
                const prev = pct(op.avancoPrev);
                const real = pct(op.avancoReal);
                const status = statusFromAvanco(prev, real);

                const badgeVariant =
                  status === "Adiantado"
                    ? "secondary"
                    : status === "Em dia"
                    ? "outline"
                    : "destructive";

                return (
                  <div
                    key={op.op}
                    className="grid grid-cols-12 items-center px-4 py-3 gap-2"
                  >
                    <div className="col-span-2 font-medium">{op.op}</div>
                    <div className="col-span-2">{op.barco}</div>
                    <div className="col-span-2">{op.linha}</div>
                    <div className="col-span-2 text-xs">
                      {op.nomeparc || "-"}
                      {op.codparc ? (
                        <span className="block text-[11px] text-muted-foreground">
                          Cod. {op.codparc}
                        </span>
                      ) : null}
                    </div>
                    <div className="col-span-2 flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Prev:</span>
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-2 bg-muted-foreground/60"
                            style={{ width: `${prev}%` }}
                          />
                        </div>
                        <span>{prev}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Real:</span>
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-2 bg-primary"
                            style={{ width: `${real}%` }}
                          />
                        </div>
                        <span>{real}%</span>
                      </div>
                      <div className="mt-1">
                        <Badge variant={badgeVariant as any} className="text-[11px]">
                          {status}
                        </Badge>
                      </div>
                    </div>
                    <div className="col-span-2 flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => abrirOP(op)}>
                        Planejar
                      </Button>
                      <Button size="sm" onClick={() => irParaAlocacao(op)}>
                        Alocação
                      </Button>
                    </div>
                  </div>
                );
              })}

            {!loading && !erro && list.length === 0 && (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                Nenhuma OP encontrada com os filtros atuais.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sheet de Planejamento da OP */}
      <Sheet open={!!openOp} onOpenChange={fecharOP}>
        {openOp && (
          <SheetContent side="right" size="lg" className="bg-white">
            <SheetHeader className="bg-white border-b">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle>
                    {openOp.op} • {openOp.barco}
                  </SheetTitle>
                  <p className="text-xs text-muted-foreground">
                    {openOp.linha} • Projeto {openOp.codproj} -{" "}
                    {openOp.identificacao}
                    {openOp.nomeparc
                      ? ` • Cliente: ${openOp.nomeparc} (${openOp.codparc ?? ""})`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-col items-end text-xs text-muted-foreground">
                  <span>Previsto: {pct(openOp.avancoPrev)}%</span>
                  <span>Real: {pct(openOp.avancoReal)}%</span>
                  <span>Status: {statusFromAvanco(openOp.avancoPrev, openOp.avancoReal)}</span>
                </div>
              </div>
            </SheetHeader>

            <div className="p-4 space-y-6 overflow-auto h-[calc(100%-64px)] bg-white">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold">Janela de Planejamento</h4>
                <p className="text-xs text-muted-foreground">
                  Defina o período planejado para esta OP. Depois podemos gravar
                  isso no Sankhya (AD_CRONOGRAMA / AD_DETALCRONOGRAMA).
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Início planejado
                    </label>
                    <Input
                      type="date"
                      value={openOp.dtIniPlan || ""}
                      onChange={(e) =>
                        setDatasPlanejamento(openOp.op, e.target.value || undefined, openOp.dtFimPlan)
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">
                      Fim planejado
                    </label>
                    <Input
                      type="date"
                      value={openOp.dtFimPlan || ""}
                      onChange={(e) =>
                        setDatasPlanejamento(openOp.op, openOp.dtIniPlan, e.target.value || undefined)
                      }
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="text-xs text-muted-foreground">
                  {openOp.dtIniPlan && openOp.dtFimPlan
                    ? `Planejado de ${openOp.dtIniPlan} até ${openOp.dtFimPlan}.`
                    : "Defina as datas para concluir o planejamento desta OP."}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpenOp(null)}>
                    Fechar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      // por enquanto só mocka; depois pluga em /api/sankhya/dataset/save
                      alert(
                        "Planejamento salvo em memória.\nDepois conectamos isso na tabela de cronograma do Sankhya."
                      );
                      setOpenOp(null);
                    }}
                  >
                    Salvar planejamento
                  </Button>
                </div>
              </div>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
