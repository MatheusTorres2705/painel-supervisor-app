// src/pages/AtividadesPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";
import { mesAnoKey, monthYearLabel, pad2 } from "@/lib/datetime";
import { txt, type ErpRow } from "@/lib/format";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
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

/** Ordem de exibição das linhas; as mesmas etiquetas do CASE da consulta. */
const ORDEM_LINHAS = ["NX 260-290", "NX 340-350", "NX 360-370", "NX 410", "NX 440", "NX 500"];

/* ── Período do cronograma ───────────────────────────────────────
   O cronograma é mensal (AD_CRONOGRAMA.ANO / MES). O período é escolhido
   em meses, "YYYY-MM", e vira pares ano × mês na consulta.

   Antes os meses eram fixos no SQL (ANO 2026, meses 11,12,1..6) e a linha
   fixa em NX 500 — sobra de uma troca manual de datas. A tela mostrava
   poucas OPs e nunca o mês corrente. */

type MesAno = { ano: number; mes: number };

function lerChaveMes(k: string): MesAno {
  const [a, m] = k.split("-").map(Number);
  return { ano: a, mes: m };
}

function mesesEntre(ini: MesAno, fim: MesAno): MesAno[] {
  const out: MesAno[] = [];
  let { ano, mes } = ini;
  while (ano < fim.ano || (ano === fim.ano && mes <= fim.mes)) {
    out.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return out;
}

/**
 * Filtro de ano × mês do cronograma. O mês vai com e sem zero à esquerda
 * ('9' e '09'): o SQL antigo misturava os dois formatos e o Dashboard usa
 * sem zero, então não dá para confiar em um só.
 */
function sqlMesesCronograma(ini: string, fim: string): string {
  const porAno = new Map<number, Set<string>>();
  for (const { ano, mes } of mesesEntre(lerChaveMes(ini), lerChaveMes(fim))) {
    const s = porAno.get(ano) ?? new Set<string>();
    s.add(`'${mes}'`);
    s.add(`'${pad2(mes)}'`);
    porAno.set(ano, s);
  }
  const partes = [...porAno].map(
    ([ano, meses]) => `(CRO.ANO = '${ano}' AND CRO.MES IN (${[...meses].join(", ")}))`
  );
  return partes.length ? `(${partes.join(" OR ")})` : "1 = 0";
}

/** Do janeiro do ano passado ao dezembro do ano que vem. */
function opcoesMes(hoje = new Date()): { value: string; label: string }[] {
  const a = hoje.getFullYear();
  return mesesEntre({ ano: a - 1, mes: 1 }, { ano: a + 1, mes: 12 }).map((m) => ({
    value: mesAnoKey(m.ano, m.mes),
    label: monthYearLabel(m.mes, m.ano),
  }));
}

export default function AtividadesPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ops, setOps] = useState<OPPlanejamento[]>([]);

  // período (padrão: mês atual)
  const mesesDisponiveis = useMemo(() => opcoesMes(), []);
  const mesAtual = useMemo(() => {
    const d = new Date();
    return mesAnoKey(d.getFullYear(), d.getMonth() + 1);
  }, []);
  const [mesIni, setMesIni] = useState(mesAtual);
  const [mesFim, setMesFim] = useState(mesAtual);
  // "YYYY-MM" ordena como texto; aceita De depois de Até sem consulta vazia.
  const periodo = mesIni <= mesFim ? { ini: mesIni, fim: mesFim } : { ini: mesFim, fim: mesIni };
  const qtdMeses = mesesEntre(lerChaveMes(periodo.ini), lerChaveMes(periodo.fim)).length;

  // filtros
  const [q, setQ] = useState("");
  const [linhaFiltro, setLinhaFiltro] = useState<string>("Todas");
  const [chassiFiltro, setChassiFiltro] = useState<string>("Todos");
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
            WHERE ${sqlMesesCronograma(periodo.ini, periodo.fim)}
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

        const mapped: OPPlanejamento[] = rows.map((r: ErpRow) => ({
          op: txt(r.OP),
          barco: txt(r.BARCO),
          linha: txt(r.LINHA),
          avancoPrev: Number(r.AVANCO_PREV ?? 0),
          avancoReal: Number(r.AVANCO_REAL ?? 0),
          codproj: Number(r.CODPROJ ?? 0),
          identificacao: txt(r.IDENTIFICACAO),
          codparc: r.CODPARC != null ? Number(r.CODPARC) : null,
          nomeparc: r.NOMEPARC != null ? String(r.NOMEPARC) : null,
        }));

        setOps(mapped);
        // Mantém o chassi escolhido só se ele ainda existe no período novo.
        setChassiFiltro((c) => (mapped.some((o) => o.barco === c) ? c : "Todos"));
      } catch (e: unknown) {
        console.error(e);
        if (!cancel) {
          setOps([]);
          setErro(mensagemErro(e, "Falha ao carregar OPs para planejamento."));
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [periodo.ini, periodo.fim]);

  // =============== Opções dos filtros (a partir do que veio) ===============
  const linhas = useMemo(() => {
    const presentes = new Set(ops.map((o) => o.linha).filter(Boolean));
    const conhecidas = ORDEM_LINHAS.filter((l) => presentes.has(l));
    const outras = [...presentes]
      .filter((l) => !ORDEM_LINHAS.includes(l))
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    return [...conhecidas, ...outras];
  }, [ops]);

  // Chassis em cascata: com uma linha escolhida, só os chassis dela.
  const chassis = useMemo(() => {
    const set = new Set(
      ops
        .filter((o) => linhaFiltro === "Todas" || o.linha === linhaFiltro)
        .map((o) => o.barco)
        .filter(Boolean)
    );
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [ops, linhaFiltro]);

  // Defesa para o render antes do reset: um chassi fora da lista não filtra nada escondido.
  const chassiAtivo = chassiFiltro !== "Todos" && chassis.includes(chassiFiltro) ? chassiFiltro : "Todos";

  // =============== Lista filtrada ===============
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return ops.filter((op) => {
      if (k) {
        const hay =
          `${op.op} ${op.barco} ${op.linha} ${op.identificacao} ${op.nomeparc ?? ""}`.toLowerCase();
        if (!hay.includes(k)) return false;
      }

      if (linhaFiltro !== "Todas" && op.linha !== linhaFiltro) return false;
      if (chassiAtivo !== "Todos" && op.barco !== chassiAtivo) return false;

      if (statusFiltro !== "Todos") {
        const st = statusFromAvanco(pct(op.avancoPrev), pct(op.avancoReal));
        if (st !== statusFiltro) return false;
      }

      return true;
    });
  }, [ops, q, linhaFiltro, chassiAtivo, statusFiltro]);

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
            <span className="text-xs text-muted-foreground tabular">
              {loading
                ? "Carregando…"
                : list.length === ops.length
                ? `Total de OPs: ${ops.length}`
                : `${list.length} de ${ops.length} OPs`}
            </span>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-12 gap-3">
          <Field label="De" className="col-span-6 sm:col-span-3 lg:col-span-2">
            {(p) => (
              <Select {...p} value={mesIni} onChange={(e) => setMesIni(e.target.value)}>
                {mesesDisponiveis.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field
            label="Até"
            className="col-span-6 sm:col-span-3 lg:col-span-2"
            hint={qtdMeses > 3 ? "Períodos longos deixam a consulta lenta." : undefined}
          >
            {(p) => (
              <Select {...p} value={mesFim} onChange={(e) => setMesFim(e.target.value)}>
                {mesesDisponiveis.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Linha" className="col-span-6 sm:col-span-3 lg:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={linhaFiltro}
                onChange={(e) => {
                  setLinhaFiltro(e.target.value);
                  setChassiFiltro("Todos"); // o chassi depende da linha
                }}
              >
                <option value="Todas">Todas</option>
                {linhas.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="Chassi" className="col-span-6 sm:col-span-3 lg:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={chassiAtivo}
                onChange={(e) => setChassiFiltro(e.target.value)}
                disabled={!chassis.length}
              >
                <option value="Todos">Todos</option>
                {chassis.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label="% Avanço real" className="col-span-6 sm:col-span-4 lg:col-span-2">
            {(p) => (
              <Select
                {...p}
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value as "Todos" | StatusOP)}
              >
                <option value="Todos">Todos</option>
                <option value="Baixo avanço">Baixo avanço</option>
                <option value="Em dia">Em dia</option>
                <option value="Adiantado">Adiantado</option>
              </Select>
            )}
          </Field>

          <Field label="Buscar" className="col-span-6 sm:col-span-8 lg:col-span-2">
            {(p) => (
              <Input
                {...p}
                placeholder="OP, chassi, cliente…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            )}
          </Field>
        </CardContent>
      </Card>

      {/* Lista de OPs */}
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-12 px-4 py-3 text-xs text-muted-foreground bg-muted/30">
            <div className="col-span-2">OP</div>
            <div className="col-span-2">Chassi</div>
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
                        <span className="block text-2xs text-muted-foreground">
                          Cod. {op.codparc}
                        </span>
                      ) : null}
                    </div>
                    <div className="col-span-2 flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-2xs text-muted-foreground">
                        <span>Prev:</span>
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-2 bg-muted-foreground/60"
                            style={{ width: `${prev}%` }}
                          />
                        </div>
                        <span>{prev}%</span>
                      </div>
                      <div className="flex items-center gap-2 text-2xs text-muted-foreground">
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
                        <Badge variant={badgeVariant as any} className="text-2xs">
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
          <SheetContent side="right" size="lg" className="bg-card">
            <SheetHeader className="bg-card border-b">
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

            <div className="p-4 space-y-6 overflow-auto h-[calc(100%-64px)] bg-card">
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
