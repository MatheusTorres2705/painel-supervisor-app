// src/pages/AtividadesPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { mesAnoKey, monthYearLabel } from "@/lib/datetime";
import { mensagemErro } from "@/lib/sankhyaRetorno";
import { ORDEM_LINHAS } from "@/lib/linhasProduto";
import {
  getOpsAvanco,
  lerChaveMes,
  mesesEntre,
  pctAvanco as pct,
  statusAvanco as statusFromAvanco,
  type OpAvanco,
  type StatusOP,
} from "@/services/opsService";
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

type OPPlanejamento = OpAvanco & {
  // planejamento local (por enquanto só em memória)
  dtIniPlan?: string;    // YYYY-MM-DD
  dtFimPlan?: string;    // YYYY-MM-DD
};

/* Período do cronograma: meses "YYYY-MM" que viram pares ano × mês na consulta
   (services/opsService). Antes os meses eram fixos no SQL e a linha fixa em NX 500. */

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

        const mapped: OPPlanejamento[] = await getOpsAvanco(periodo.ini, periodo.fim);
        if (cancel) return;

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
