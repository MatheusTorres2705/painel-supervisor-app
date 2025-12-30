// src/pages/AlocacaoPage.tsx
// npm install jspdf jspdf-autotable

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  Download,
  Save,
  FileText,
  ChevronsUpDown,
  Check,
  ClipboardList,
} from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

/* =================== Tipos =================== */
type Etapa = "LAM" | "MON" | "PINT" | "ELE" | "ACB";

type Atividade = {
  id: number;
  nome: string;
  etapa: Etapa;
  hhPrev: number; // horas totais da atividade

  // ✅ NOVO: separa data da DEMANDA x data do PLANEJAMENTO
  dtDemanda: string; // YYYY-MM-DD (data prevista/demanda do cronograma)
  dtPlan: string; // YYYY-MM-DD (data do planejamento — DTPLANEJAMENTO)

  alocados: number[]; // lista de CODFUNC alocados

  // Campos ERP para salvar em AD_DETALCRONOGRAMAFUNC
  codusu: number; // CODUSU do cronograma (setor)
  setor: string; // NOMEUSU (setor)
  codprod: number;
  seq: number; // SEQ do cronograma
  tempoMin: number; // QTD original em minutos
};

type AtividadeERP = {
  seq: number;
  dt: string; // DTPLANEJAMENTO
  codprod: number;
  descrprod: string;
  qtd: number; // minutos (QTD)
  codusu: number;
  sequencia: number;
};

type Colab = {
  id: number;
  nome: string;
  cargo: string;
  codSetor: number; // ✅ CAR.AD_CODUSU (setor do colaborador)
  senior: "Júnior" | "Pleno" | "Sênior";
  atividadesERP: AtividadeERP[];
};

/* =================== Utils =================== */
function rangeDays(ini: string, fin: string): string[] {
  const res: string[] = [];
  const a = new Date(ini);
  const b = new Date(fin);
  for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    res.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }
  return res;
}

function toSankhyaDate(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`; // DD/MM/YYYY
}

const toBR = (ymd: string) => {
  if (!ymd) return "-";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
};

const initials = (n: string) =>
  n
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

/** Gantt em horas */
const HORA_INI = 7;
const HORA_FIM = 17;
const TOTAL_HORAS = HORA_FIM - HORA_INI;
const hourTicks = Array.from({ length: TOTAL_HORAS }, (_, i) => HORA_INI + i);

/* Habilidades (visual) */
const habilidadesPorCargo: Record<string, string[]> = {
  Colaborador: ["Operação geral", "Trabalho em equipe"],
  Montadora: ["Montagem de painéis", "Fixação estrutural", "Leitura de desenho"],
  Montagem: ["Montagem geral", "Ajustes finos", "Selagem"],
  Elétrica: ["Passagem de chicotes", "Crimpagem", "Teste elétrico"],
  Pintura: ["Preparação/Lixa", "Primer/Gel Coat", "Acabamento/Polimento"],
  Acabamento: ["Instalação de teca", "Estofaria", "Ajustes de portas"],
};

/* ===== Gantt helpers ===== */
type GanttBlock = {
  atividadeId: number;
  label: string;
  start: number;
  end: number;
  etapa: Etapa;
};

const etapaColor: Record<Etapa, string> = {
  LAM: "bg-emerald-500",
  MON: "bg-sky-500",
  PINT: "bg-fuchsia-500",
  ELE: "bg-amber-500",
  ACB: "bg-slate-500",
};

const etapaBadgeStyles: Record<Etapa, string> = {
  LAM: "bg-emerald-100 text-emerald-800 border-emerald-200",
  MON: "bg-sky-100 text-sky-800 border-sky-200",
  PINT: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  ELE: "bg-amber-100 text-amber-800 border-amber-200",
  ACB: "bg-slate-100 text-slate-800 border-slate-200",
};

// deduz etapa das atividades do ERP, usando o cargo do colaborador
function etapaFromCargo(cargo: string): Etapa {
  const up = (cargo || "").toUpperCase();
  if (up.includes("LAM")) return "LAM";
  if (up.includes("PINT")) return "PINT";
  if (up.includes("ELE")) return "ELE";
  if (up.includes("ACAB")) return "ACB";
  return "MON"; // padrão
}

// ✅ Agora o Gantt é por DIA DE PLANEJAMENTO (dtPlan / DTPLANEJAMENTO)
function buildBlocksForColab(
  atividadesTela: Atividade[],
  colab: Colab,
  diaPlanejamento: string
): GanttBlock[] {
  const tarefas: { atividadeId: number; label: string; etapa: Etapa; hh: number }[] = [];

  // 1) Atividades alocadas na TELA (somente do dia selecionado)
  atividadesTela
    .filter((a) => a.dtPlan === diaPlanejamento)
    .filter((a) => a.alocados.includes(colab.id))
    .forEach((a) => {
      const qtdColabs = a.alocados.length || 1;
      const hhShare = a.hhPrev / qtdColabs;
      const hh = Math.max(0.25, Math.round(hhShare * 10) / 10);
      tarefas.push({ atividadeId: a.id, label: a.nome, etapa: a.etapa, hh });
    });

  // 2) Atividades já planejadas no ERP (somente do dia selecionado)
  const etapaErp = etapaFromCargo(colab.cargo);
  (colab.atividadesERP || [])
    .filter((p) => p.dt === diaPlanejamento)
    .forEach((p, idx) => {
      const hh = Math.max(0.5, Math.round((p.qtd / 60) * 10) / 10);
      tarefas.push({
        atividadeId: 100000 + colab.id * 1000 + idx,
        label: `${p.codprod} - ${p.descrprod} (ERP)`,
        etapa: etapaErp,
        hh,
      });
    });

  // 3) Distribuir sequencialmente das 07 às 17
  let cursor = HORA_INI;
  const blocks: GanttBlock[] = [];

  for (const t of tarefas) {
    if (cursor >= HORA_FIM) break;
    const dur = Math.max(0.25, Math.min(t.hh, HORA_FIM - cursor));
    const start = cursor;
    const end = Math.min(HORA_FIM, start + dur);

    blocks.push({ atividadeId: t.atividadeId, label: t.label, start, end, etapa: t.etapa });
    cursor = end;
  }

  return blocks;
}

/* ====== Logo em base64 para o PDF (troque pela sua) ====== */
const LOGO_BASE64 = "data:image/png;base64,SEU_LOGO_AQUI";

/* ====== Componente de seleção multi-colaborador ====== */
type ColabMultiSelectProps = {
  atividade: Atividade;
  colabs: Colab[];
  onChange: (alocados: number[]) => void;
  setorAlocarLabel?: string;
};

const ColabMultiSelect: React.FC<ColabMultiSelectProps> = ({
  atividade,
  colabs,
  onChange,
  setorAlocarLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtrados = useMemo(() => {
    const k = search.trim().toLowerCase();
    if (!k) return colabs;
    return colabs.filter((c) => `${c.id} ${c.nome}`.toLowerCase().includes(k));
  }, [colabs, search]);

  const selecionados = useMemo(
    () =>
      atividade.alocados
        .map((id) => colabs.find((c) => c.id === id))
        .filter(Boolean) as Colab[],
    [atividade.alocados, colabs]
  );

  const toggleColab = (id: number) => {
    const jaTem = atividade.alocados.includes(id);
    if (jaTem) onChange(atividade.alocados.filter((x) => x !== id));
    else onChange([...atividade.alocados, id]);
  };

  const nSel = atividade.alocados.length;
  let label = "Sem alocação";
  if (nSel === 1 && selecionados[0]) label = `${selecionados[0].id} - ${selecionados[0].nome}`;
  else if (nSel > 1) label = `${nSel} colaboradores selecionados`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex w-full items-center justify-between rounded-md border bg-background px-1.5 py-1 text-[11px]",
            !nSel && "text-muted-foreground"
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 h-3 w-3 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-80 p-2">
        {setorAlocarLabel ? (
          <div className="mb-2 text-[11px] text-muted-foreground">
            Filtrado por:{" "}
            <span className="font-medium text-foreground">{setorAlocarLabel}</span>
          </div>
        ) : null}

        <div className="mb-2">
          <Input
            placeholder="Buscar colaborador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-xs"
          />
        </div>

        <div className="max-h-44 overflow-y-auto space-y-1">
          {filtrados.map((c) => {
            const selected = atividade.alocados.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleColab(c.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs text-left",
                  selected ? "bg-primary/10" : "hover:bg-muted"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded border text-[10px]",
                    selected ? "bg-primary text-primary-foreground" : "bg-background"
                  )}
                >
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">
                  {c.id} - {c.nome}
                </span>
              </button>
            );
          })}

          {!filtrados.length && (
            <div className="px-2 py-1 text-[11px] text-muted-foreground">
              Nenhum colaborador encontrado (verifique o filtro de setor).
            </div>
          )}
        </div>

        {selecionados.length > 0 && (
          <div className="mt-2 border-t pt-2">
            <div className="mb-1 text-[11px] font-medium">Selecionados ({selecionados.length})</div>
            <div className="flex flex-wrap gap-1">
              {selecionados.map((c) => (
                <span
                  key={c.id}
                  className="flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-[2px] text-[10px]"
                >
                  {c.id} - {c.nome}
                  <button
                    type="button"
                    onClick={() => onChange(atividade.alocados.filter((x) => x !== c.id))}
                    className="inline-flex items-center justify-center rounded-full hover:bg-primary/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => onChange([])}
              >
                Limpar todos
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

/* =================== Página =================== */
export default function AlocacaoPage() {
  const { opId } = useParams();
  const [sp] = useSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // período datas (para ANALISAR DEMANDAS)
  const today = new Date();
  const defIni =
    sp.get("ini") ||
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
      today.getDate()
    ).padStart(2, "0")}`;
  const defFin =
    sp.get("fin") ||
    (() => {
      const t = new Date(today);
      t.setDate(t.getDate() + 5);
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(
        t.getDate()
      ).padStart(2, "0")}`;
    })();

  const [ini, setIni] = useState(defIni);
  const [fin, setFin] = useState(defFin);
  const dias = useMemo(() => rangeDays(ini, fin), [ini, fin]); // (se quiser usar em dropdown depois)

  // ✅ NOVO: dia que você está “montando” o planejamento (controla Gantt + ajuda no preenchimento)
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [diaPlanejamento, setDiaPlanejamento] = useState<string>(sp.get("plan") || todayStr);

  const [colabs, setColabs] = useState<Colab[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);

  const [q, setQ] = useState("");
  const [filtroSetor, setFiltroSetor] = useState<string>("Todos");

  // ✅ setor para alocar (AGORA também filtra grades e gantt)
  const [setorAlocar, setSetorAlocar] = useState<string>("Todos");

  const preNome = sp.get("colabNome");

  const [habOpen, setHabOpen] = useState(false);
  const [habColab, setHabColab] = useState<Colab | null>(null);

  // estado para troca de funcionário por atividade ERP (seq -> novo codfunc)
  const [novoDestinoPorSeq, setNovoDestinoPorSeq] = useState<Record<number, number | "">>({});
  const [loadingSeq, setLoadingSeq] = useState<number | null>(null);

  // para forçar reload após salvar/mudar coisa no ERP
  const [reloadToken, setReloadToken] = useState(0);

  // ✅ Backlog (modal)
  const [backlogOpen, setBacklogOpen] = useState(false);

  /* ========= Carregar dados do ERP ========= */
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErro(null);

        if (!opId) {
          setErro("OP não informada na rota.");
          return;
        }

        const idiproc = Number(opId);
        if (!Number.isFinite(idiproc)) {
          setErro(`ID de OP inválido: ${opId}`);
          return;
        }

        const CODUSU_SUP = (user as any)?.codusu ?? 134;

        // 1) Atividades da OP (sem aplicação)
        const sqlAtv = `
          SELECT
            DET.CODUSU AS CODSETOR,
            USU.NOMEUSU AS SETOR,
            COM.CODPROD AS CODIGO,
            PRO.DESCRPROD,
            COM.QTD AS TEMPO_MIN,
            TO_CHAR(DET.DTINICIOPREV, 'YYYY-MM-DD') AS DT,
            DET.SEQ AS SEQCRONO
          FROM AD_CRONOGRAMA CRO
          JOIN TPRIPROC PROC ON PROC.AD_CODPROJ = CRO.CODPROJ
          JOIN AD_DETALCRONOGRAMA DET ON DET.SEQ = CRO.SEQ
          JOIN TCSPRJ PRJ ON PRJ.CODPROJ = CRO.CODPROJ
          JOIN TSIUSU USU ON USU.CODUSU = DET.CODUSU
          JOIN AD_COMPONENTECRONO COM ON COM.SEQ = DET.SEQ AND COM.CODUSU = DET.CODUSU
          JOIN TGFPRO PRO ON PRO.CODPROD = COM.CODPRODSP
          WHERE PROC.IDIPROC = ${idiproc}
                AND NVL(COM.FEITO,'N') = 'N'
                AND  not COM.CODPROD IN (SELECT CODPROD
                  FROM AD_DETALCRONOGRAMAFUNC
                  WHERE SEQ = DET.SEQ )
          ORDER BY DET.CODUSU, COM.CODPROD
        `.trim();

        const rowsAtv = await obterReg(sqlAtv);

        const mappedAtv: Atividade[] = rowsAtv.map((r: any, idx: number) => {
          const setorNome = String(r.SETOR ?? "");
          const nm = setorNome.toUpperCase();
          let etapa: Etapa = "MON";
          if (nm.includes("LAM")) etapa = "LAM";
          else if (nm.includes("PINT")) etapa = "PINT";
          else if (nm.includes("ELE")) etapa = "ELE";
          else if (nm.includes("ACAB")) etapa = "ACB";

          const tempoMin = Number(r.TEMPO_MIN ?? 0);
          const hhPrev = Math.round((tempoMin / 60) * 10) / 10;

          // ✅ Demanda = DTINICIOPREV; Planejamento inicia igual à demanda (você pode mudar na tela)
          const dtDemanda = String(r.DT || ini);
          const dtPlan = String(r.DT || ini);

          const codprod = Number(r.CODIGO ?? 0);
          const seq = Number(r.SEQCRONO ?? 0);
          const codusu = Number(r.CODSETOR ?? 0);

          return {
            id: idx + 1,
            nome: `${r.CODIGO ?? ""} - ${r.DESCRPROD ?? ""}`,
            etapa,
            hhPrev,
            dtDemanda,
            dtPlan,
            codprod,
            seq,
            tempoMin,
            codusu,
            setor: setorNome,
            alocados: [],
          };
        });

        // 2) Colaboradores
        const sqlColabs = `
          SELECT DISTINCT
            FUN.CODFUNC,
            FUN.NOMEFUNC,
            CAR.DESCRCARGO,
            CAR.AD_CODUSU
          FROM TFPFUN FUN
          LEFT JOIN AD_DETALCRONOGRAMAFUNC F ON FUN.CODFUNC = F.CODFUNC
          JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
          WHERE FUN.USUVPJSUP = ${CODUSU_SUP}
          ORDER BY FUN.NOMEFUNC
        `.trim();

        const rowsColabs = await obterReg(sqlColabs);

        // 3) Planejamento ERP existente para a OP
        const sqlPlan = `
          SELECT 
            FUN.CODFUNC,
            F.SEQ,
            F.CODUSU , 
            TO_CHAR(F.DTPLANEJAMENTO, 'YYYY-MM-DD') AS DT,
            F.CODPROD,
            PRO.DESCRPROD,
            F.QTD,
            F.SEQUENCIA
          FROM TFPFUN FUN
          LEFT JOIN AD_DETALCRONOGRAMAFUNC F ON FUN.CODFUNC = F.CODFUNC
          LEFT JOIN TGFPRO PRO ON PRO.CODPROD = F.CODPROD
          LEFT JOIN AD_CRONOGRAMA CRO ON CRO.SEQ = F.SEQ
          LEFT JOIN TPRIPROC PROC ON PROC.AD_CODPROJ = CRO.CODPROJ
          WHERE FUN.USUVPJSUP = ${CODUSU_SUP}
            AND PROC.IDIPROC = ${idiproc}
            AND F.CODPROD IS NOT NULL
        `.trim();

        const rowsPlan = await obterReg(sqlPlan);

        const planejadasPorFunc: Record<number, AtividadeERP[]> = {};
        rowsPlan.forEach((r: any) => {
          const cod = Number(r.CODFUNC);
          if (!Number.isFinite(cod)) return;
          if (!planejadasPorFunc[cod]) planejadasPorFunc[cod] = [];
          planejadasPorFunc[cod].push({
            seq: Number(r.SEQ ?? 0),
            dt: String(r.DT || ""),
            codprod: Number(r.CODPROD ?? 0),
            descrprod: String(r.DESCRPROD ?? ""),
            qtd: Number(r.QTD ?? 0),
            codusu: Number(r.CODUSU ?? 0),
            sequencia: Number(r.SEQUENCIA ?? 0),
          });
        });

        const mappedColabs: Colab[] = rowsColabs.map((r: any) => {
          const codfunc = Number(r.CODFUNC);
          return {
            id: codfunc,
            nome: String(r.NOMEFUNC ?? ""),
            cargo: String(r.DESCRCARGO ?? "Colaborador"),
            codSetor: Number(r.AD_CODUSU ?? 0),
            senior: "Pleno",
            atividadesERP: planejadasPorFunc[codfunc] || [],
          };
        });

        if (cancel) return;
        setAtividades(mappedAtv);
        setColabs(mappedColabs);
      } catch (e: any) {
        console.error("[AlocacaoPage] Erro ao buscar dados ERP:", e);
        if (!cancel) setErro(e?.message || "Falha ao carregar dados da OP.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [opId, ini, user, reloadToken]);

  /* ========= Derivados / filtros ========= */
  const colabById = useMemo(() => {
    const m: Record<number, Colab> = {};
    colabs.forEach((c) => (m[c.id] = c));
    return m;
  }, [colabs]);

  const setoresDisponiveis = useMemo(() => {
    const map = new Map<number, string>();
    atividades.forEach((a) => {
      if (a.codusu) {
        if (!map.has(a.codusu)) map.set(a.codusu, a.setor || String(a.codusu));
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [atividades]);

  const setorAlocarLabel = useMemo(() => {
    if (setorAlocar === "Todos") return "";
    const cod = Number(setorAlocar);
    const found = setoresDisponiveis.find(([c]) => c === cod);
    if (!found) return String(setorAlocar);
    return `${found[0]} - ${found[1]}`;
  }, [setorAlocar, setoresDisponiveis]);

  // ✅ lista filtrada (agora é a base de TUDO que exibe colaborador)
  const colabsVisiveis = useMemo(() => {
    if (setorAlocar === "Todos") return colabs;
    return colabs.filter((c) => String(c.codSetor) === String(setorAlocar));
  }, [colabs, setorAlocar]);

  // ✅ lista filtrada para usar no “Alocar para”
  const colabsParaAlocar = colabsVisiveis;

  // ✅ Filtra por período de DEMANDA (para você “analisar as demandas”)
  const atividadesFiltradas = useMemo(
    () =>
      atividades.filter((a) => {
        if (a.dtDemanda < ini || a.dtDemanda > fin) return false;

        if (filtroSetor !== "Todos" && String(a.codusu) !== filtroSetor) return false;

        if (q.trim()) {
          const k = q.trim().toLowerCase();
          if (!`${a.nome} ${a.setor} ${a.codusu}`.toLowerCase().includes(k)) return false;
        }
        return true;
      }),
    [atividades, ini, fin, filtroSetor, q]
  );

  // ✅ Backlog = demandas atrasadas (dtDemanda < hoje) e ainda “não feitas”
  const backlogAtividades = useMemo(() => {
    return atividades
      .filter((a) => a.dtDemanda && a.dtDemanda < todayStr) // atrasadas
      .sort((a, b) => a.dtDemanda.localeCompare(b.dtDemanda));
  }, [atividades, todayStr]);

  const totalHH = atividades.reduce((s, a) => s + a.hhPrev, 0);
  const totalHHAloc = atividades.reduce((s, a) => s + (a.alocados.length ? a.hhPrev : 0), 0);

  // Resumo geral (no período, independente do dia do Gantt)
  const resumoColabTela = (id: number) => {
    let qtd = 0;
    let hh = 0;
    atividades.forEach((a) => {
      if (a.alocados.includes(id)) {
        qtd += 1;
        const share = a.alocados.length ? a.hhPrev / a.alocados.length : a.hhPrev;
        hh += share;
      }
    });
    return { qtd, hh };
  };

  // ✅ Resumo por DIA DE PLANEJAMENTO (usado no Gantt)
  const resumoColabTelaDia = (id: number, dia: string) => {
    let qtd = 0;
    let hh = 0;
    atividades.forEach((a) => {
      if (a.dtPlan !== dia) return;
      if (a.alocados.includes(id)) {
        qtd += 1;
        const share = a.alocados.length ? a.hhPrev / a.alocados.length : a.hhPrev;
        hh += share;
      }
    });
    return { qtd, hh };
  };

  /* =========== Distribuição auto simples (mock) =========== */
  const distribuirAuto = () => {
    if (!colabsVisiveis.length) return;

    const semDono = atividades
      .filter((a) => !a.alocados.length && a.dtDemanda >= ini && a.dtDemanda <= fin)
      .sort((a, b) =>
        a.dtDemanda === b.dtDemanda ? b.hhPrev - a.hhPrev : a.dtDemanda.localeCompare(b.dtDemanda)
      );
    if (!semDono.length) return;

    const updates: Record<number, number> = {};
    let idxColab = 0;

    for (const a of semDono) {
      const c = colabsVisiveis[idxColab];
      updates[a.id] = c.id;
      idxColab = (idxColab + 1) % colabsVisiveis.length;
    }

    setAtividades((arr) =>
      arr.map((x) => (updates[x.id] ? { ...x, alocados: [updates[x.id]] } : x))
    );
  };

  // ✅ Atalho: aplicar o “diaPlanejamento” como dtPlan em lote
  const aplicarDiaPlanejamentoEmLote = () => {
    setAtividades((arr) =>
      arr.map((a) => {
        // aplica apenas nas atividades visíveis (filtros) e que ainda não foram mexidas (opcional)
        if (a.dtDemanda < ini || a.dtDemanda > fin) return a;
        return { ...a, dtPlan: diaPlanejamento };
      })
    );
  };

  /* ===== Exportar planejamento por funcionário (CSV) ===== */
  const exportPlanejamentoCsv = () => {
    const registrosTela = atividades.flatMap((a) => {
      if (!a.alocados.length) return [];
      const share = a.alocados.length ? a.hhPrev / a.alocados.length : a.hhPrev;
      return a.alocados.map((codfunc) => {
        const col = colabById[codfunc];
        return {
          codfunc,
          nome: col?.nome ?? "",
          op: opId ?? "",
          data: toBR(a.dtPlan), // ✅ agora exporta a data do planejamento
          atividade: a.nome,
          hh: share.toFixed(1).replace(".", ","),
          origem: "Tela" as const,
        };
      });
    });

    const registrosErp: {
      codfunc: number;
      nome: string;
      op: string;
      data: string;
      atividade: string;
      hh: string;
      origem: "ERP";
    }[] = [];

    colabsVisiveis.forEach((c) => {
      (c.atividadesERP || []).forEach((p) => {
        const hh = (p.qtd || 0) / 60;
        registrosErp.push({
          codfunc: c.id,
          nome: c.nome,
          op: opId ?? "",
          data: toBR(p.dt),
          atividade: `${p.codprod} - ${p.descrprod}`,
          hh: hh.toFixed(1).replace(".", ","),
          origem: "ERP",
        });
      });
    });

    const registros = [...registrosTela, ...registrosErp];

    if (!registros.length) {
      alert("Nenhuma atividade (tela ou ERP) para exportar.");
      return;
    }

    const header = ["codfunc", "nome", "op", "data", "atividade", "hh", "origem"];
    const rows = registros.map((r) => [r.codfunc, r.nome, r.op, r.data, r.atividade, r.hh, r.origem]);

    const csv =
      [header, ...rows]
        .map((r) =>
          r
            .map((v) => {
              const s = String(v ?? "");
              if (s.includes(";") || s.includes('"') || s.includes("\n"))
                return `"${s.replace(/"/g, '""')}"`;
              return s;
            })
            .join(";")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planejamento_OP_${opId}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ===== Exportar PDF (✅ 1 página por colaborador) ===== */
  const exportPlanejamentoPdf = () => {
    const lista = colabsVisiveis.length ? colabsVisiveis : colabs;

    if (!lista.length) {
      alert("Nenhum colaborador para exportar.");
      return;
    }

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    const drawHeader = () => {
      // Logo
      try {
        if (LOGO_BASE64 && LOGO_BASE64 !== "data:image/png;base64,SEU_LOGO_AQUI") {
          doc.addImage(LOGO_BASE64, "PNG", 10, 8, 30, 10);
        }
      } catch {}

      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("Planejamento de Atividades por Colaborador", pageWidth / 2, 15, {
        align: "center",
      });

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      const hojeStr = toBR(new Date().toISOString().slice(0, 10));
      doc.text(`OP: ${opId ?? ""}`, pageWidth / 2, 21, { align: "center" });
      doc.text(
        `Demandas: ${toBR(ini)} a ${toBR(fin)}  •  Gerado em: ${hojeStr}`,
        pageWidth / 2,
        26,
        { align: "center" }
      );

      // linha separadora
      doc.setDrawColor(220);
      doc.line(12, 30, pageWidth - 12, 30);
    };

    lista.forEach((colab, idx) => {
      // ✅ uma página por colaborador
      if (idx > 0) doc.addPage();
      drawHeader();

      let cursorY = 38;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${colab.nome}`, 14, cursorY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`Cargo: ${colab.cargo}  •  Setor: ${colab.codSetor || "-"}`, 14, cursorY + 5);

      // ✅ atividades por DATA DE PLANEJAMENTO (dtPlan)
      const telaAtvs = atividades
        .filter((a) => a.alocados.includes(colab.id) && a.dtPlan >= ini && a.dtPlan <= fin)
        .sort((a, b) => a.dtPlan.localeCompare(b.dtPlan));

      const erpAtvs = (colab.atividadesERP || [])
        .filter((p) => !p.dt || (p.dt >= ini && p.dt <= fin))
        .sort((a, b) => a.dt.localeCompare(b.dt));

      const hhTela = telaAtvs.reduce((s, a) => {
        const share = a.alocados.length ? a.hhPrev / a.alocados.length : a.hhPrev;
        return s + share;
      }, 0);

      const hhErp = erpAtvs.reduce((s, p) => s + p.qtd / 60, 0);
      const hhTotal = hhTela + hhErp;

      doc.setFontSize(9);
      doc.text(
        `HH tela: ${hhTela.toFixed(1)}h   •   HH ERP: ${hhErp.toFixed(1)}h   •   Total: ${hhTotal.toFixed(1)}h`,
        pageWidth - 14,
        cursorY,
        {
          align: "right",
        }
      );

      cursorY += 10;

      type BodyRow = [string, string, string, string, string, string, string, string]; // + Obs
      const body: BodyRow[] = [];

      telaAtvs.forEach((a) => {
        const share = a.alocados.length ? a.hhPrev / a.alocados.length : a.hhPrev;
        body.push([
          toBR(a.dtPlan),
          a.nome,
          "Tela",
          a.etapa,
          `${share.toFixed(1)}h`,
          opId ?? "",
          "",
          "",
        ]);
      });

      const etapaErp = etapaFromCargo(colab.cargo);
      erpAtvs.forEach((p) => {
        const hh = p.qtd / 60;
        body.push([
          toBR(p.dt),
          `${p.codprod} - ${p.descrprod}`,
          "ERP",
          etapaErp,
          `${hh.toFixed(1)}h`,
          opId ?? "",
          "",
          "",
        ]);
      });

      if (!body.length) {
        body.push(["", "Sem atividades no período", "", "", "", opId ?? "", "", ""]);
      }

      autoTable(doc, {
        startY: cursorY,
        head: [["Data", "Atividade", "Origem", "Etapa", "HH", "OP", "OK", "Obs"]],
        body,
        styles: { fontSize: 8, cellPadding: 1.4, textColor: 20 },
        headStyles: { fillColor: [25, 40, 66], textColor: 255 },
        alternateRowStyles: { fillColor: [245, 245, 245] },
        margin: { left: 12, right: 12 },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 78 },
          2: { cellWidth: 14 },
          3: { cellWidth: 14 },
          4: { cellWidth: 12, halign: "right" },
          5: { cellWidth: 12 },
          6: { cellWidth: 10, halign: "center" },
          7: { cellWidth: 30 }, // Obs
        },
        didDrawCell: (data: any) => {
          // desenha quadradinho na coluna OK
          if (data.section === "body" && data.column.index === 6) {
            const { x, y, height } = data.cell;
            const size = Math.min(4, height - 2);
            const offsetY = y + (height - size) / 2;
            doc.setDrawColor(30);
            doc.rect(x + 3, offsetY, size, size);
          }
        },
      });

      const finalY = (doc as any).lastAutoTable?.finalY ?? cursorY + 40;
      const signY = Math.min(finalY + 14, 280);

      doc.setFontSize(10);
      doc.text("Assinatura do colaborador:", 14, signY);
      doc.line(60, signY, pageWidth - 14, signY);

      doc.setFontSize(9);
      doc.text("Observações do dia:", 14, signY + 10);
      doc.rect(14, signY + 12, pageWidth - 28, 22); // caixa grande para escrever
    });

    doc.save(`planejamento_OP_${opId}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  /* ===== Botão Salvar planejamento (ERP) ===== */
  const salvarPlanejamento = async () => {
    const registros = atividades.filter((a) => a.alocados.length && a.codprod && a.seq);

    if (!registros.length) {
      alert("Nenhuma atividade alocada para salvar.");
      return;
    }
    if (!opId) {
      alert("OP não informada.");
      return;
    }

    try {
      setSaving(true);

      for (const a of registros) {
        const qtdColabs = a.alocados.length || 1;
        const minutosPorColab = Math.round((a.hhPrev * 60) / qtdColabs);

        // ✅ DTPLANEJAMENTO agora vem do dtPlan (se vazio, cai no diaPlanejamento)
        const dtSalvar = a.dtPlan || diaPlanejamento;

        for (const codfunc of a.alocados) {
          await api.post("/api/sankhya/dataset/save", {
            entity: "AD_DETALCRONOGRAMAFUNC",
            fields: ["SEQ", "CODFUNC", "CODUSU", "CODPROD", "DTPLANEJAMENTO", "QTD"],
            values: {
              "0": String(a.seq),
              "1": String(codfunc),
              "2": String(a.codusu),
              "3": String(a.codprod),
              "4": toSankhyaDate(dtSalvar),
              "5": minutosPorColab,
            },
          });
        }
      }

      alert("Planejamento salvo com sucesso no ERP.");
      setReloadToken((x) => x + 1);
    } catch (e: any) {
      console.error("[salvarPlanejamento] Falha:", e);
      alert(`Erro ao salvar o planejamento.\n${e?.message || "Veja o console."}`);
    } finally {
      setSaving(false);
    }
  };

  /* ===== handlers modal habilidades / troca ERP ===== */
  const openHab = (c: Colab) => {
    setHabColab(c);
    setNovoDestinoPorSeq({});
    setHabOpen(true);
  };
  const closeHab = () => {
    setHabOpen(false);
    setHabColab(null);
    setNovoDestinoPorSeq({});
    setLoadingSeq(null);
  };

  const handleTrocarFuncionarioErpItem = async (item: AtividadeERP) => {
    if (!habColab || !opId) {
      alert("Colaborador ou OP inválidos.");
      return;
    }

    const novoDestino = novoDestinoPorSeq[item.seq];
    if (!novoDestino) {
      alert("Selecione o novo colaborador para essa atividade.");
      return;
    }

    if (novoDestino === habColab.id) {
      alert("O colaborador destino precisa ser diferente do atual.");
      return;
    }

    if (
      !window.confirm(
        `Confirmar troca desta atividade (SEQ ${item.seq}, PROD ${item.codprod}, ${toBR(
          item.dt
        )}) de ${habColab.nome} para o colaborador ${novoDestino}?`
      )
    ) {
      return;
    }

    try {
      setLoadingSeq(item.seq);

      await api.post("/api/sankhya/dataset/save", {
        entity: "AD_DETALCRONOGRAMAFUNC",
        fields: ["SEQ", "CODFUNC", "CODPROD", "DTPLANEJAMENTO", "QTD"],
        values: {
          "0": String(item.seq),
          "1": String(novoDestino),
          "2": String(item.codprod),
          "3": toSankhyaDate(item.dt),
          "4": String(item.qtd),
        },
        pk: {
          SEQ: String(item.seq),
          CODUSU: String(item.codusu),
          SEQUENCIA: String(item.sequencia),
        },
      });

      alert("Atividade atualizada no ERP com sucesso (CODFUNC alterado).");

      setNovoDestinoPorSeq((prev) => {
        const copy = { ...prev };
        delete copy[item.seq];
        return copy;
      });

      setReloadToken((x) => x + 1);
    } catch (e) {
      console.error("[handleTrocarFuncionarioErpItem] Erro:", e);
      alert("Erro ao trocar o colaborador dessa atividade no ERP.");
    } finally {
      setLoadingSeq(null);
    }
  };

  /* =================== Render =================== */
  return (
    <div className="h-[calc(100vh-140px)] overflow-y-auto space-y-4 pr-1">
      {/* Header / filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Alocação de Recursos — OP {opId}</h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {preNome && <Badge variant="secondary">Colaborador focado: {preNome}</Badge>}
                <span>
                  Atividades: {atividades.length} • HH total: {totalHH.toFixed(1)}h • HH alocado:{" "}
                  {totalHHAloc.toFixed(1)}h
                </span>
                <span>
                  • Colaboradores (visíveis): {colabsVisiveis.length}
                  {setorAlocar !== "Todos" ? ` • Setor: ${setorAlocarLabel}` : ""}
                </span>
                <span className="font-medium">
                  • Dia do planejamento (Gantt): {toBR(diaPlanejamento)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* ✅ Backlog */}
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => setBacklogOpen(true)}
                disabled={loading || !atividades.length}
              >
                <ClipboardList className="h-4 w-4" />
                Backlog
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={exportPlanejamentoCsv}
                disabled={!atividades.length || !(colabsVisiveis.length || colabs.length)}
              >
                <Download className="h-4 w-4" />
                CSV
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={exportPlanejamentoPdf}
                disabled={!atividades.length || !(colabsVisiveis.length || colabs.length)}
              >
                <FileText className="h-4 w-4" />
                PDF
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={distribuirAuto}
                disabled={!atividades.length || !colabsVisiveis.length}
              >
                Distribuir (auto)
              </Button>

              <Button
                size="sm"
                className="gap-1"
                onClick={salvarPlanejamento}
                disabled={saving || !atividades.length || !colabsVisiveis.length}
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* ✅ filtros + NOVO campo de dia de planejamento */}
        <CardContent className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-2">
            <label className="text-xs text-muted-foreground">Atividade</label>
            <Input
              placeholder="Buscar atividade…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Setor</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"
              value={filtroSetor}
              onChange={(e) => setFiltroSetor(e.target.value)}
            >
              <option value="Todos">Todos os setores</option>
              {setoresDisponiveis.map(([codusu, nome]) => (
                <option key={codusu} value={String(codusu)}>
                  {codusu} - {nome}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Setor para alocar (agora também filtra Colaboradores + Gantt) */}
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Setor para alocar</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"
              value={setorAlocar}
              onChange={(e) => setSetorAlocar(e.target.value)}
            >
              <option value="Todos">Todos</option>
              {setoresDisponiveis.map(([codusu, nome]) => (
                <option key={codusu} value={String(codusu)}>
                  {codusu} - {nome}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ NOVO: Dia do planejamento (para montar vários dias) */}
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Dia do planejamento (Gantt)</label>
            <Input
              type="date"
              value={diaPlanejamento}
              onChange={(e) => setDiaPlanejamento(e.target.value)}
              className="text-xs"
            />
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-[11px]"
                onClick={aplicarDiaPlanejamentoEmLote}
                disabled={!atividades.length}
              >
                Aplicar em lote (dtPlan)
              </Button>
            </div>
          </div>

          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Início (demandas)</label>
            <Input
              type="date"
              value={ini}
              onChange={(e) => setIni(e.target.value)}
              className="text-xs"
            />
          </div>

          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Fim (demandas)</label>
            <Input
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className="text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {erro && <div className="text-sm text-red-600">{erro}</div>}

      {/* Grade de atividades */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              Demandas da OP (grade) — {toBR(ini)} a {toBR(fin)}
            </h4>
            <Badge variant="outline" className="text-[11px]">
              {atividadesFiltradas.length}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[980px]">
              <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-1.5 border-b bg-muted/40">
                <div className="col-span-4">Atividade</div>
                <div className="col-span-2">Setor</div>
                <div className="col-span-1 text-right">HH</div>
                <div className="col-span-2">Demanda</div>
                <div className="col-span-1">Planej.</div>
                <div className="col-span-1">Alocar</div>
                <div className="col-span-1 text-right">Ação</div>
              </div>

              <div className="max-h-[280px] overflow-y-auto divide-y">
                {loading && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">Carregando dados…</div>
                )}

                {!loading &&
                  atividadesFiltradas.map((a) => (
                    <div
                      key={a.id}
                      className="grid grid-cols-12 items-center px-3 py-1.5 gap-2 bg-card text-xs"
                    >
                      <div className="col-span-4 truncate" title={a.nome}>
                        {a.nome}
                      </div>

                      <div className="col-span-2">
                        <Badge className={cn("text-[10px] px-1 py-0", etapaBadgeStyles[a.etapa])}>
                          {a.codusu} - {a.setor}
                        </Badge>
                      </div>

                      <div className="col-span-1 text-right">{a.hhPrev}h</div>

                      {/* Demanda */}
                      <div className="col-span-2">{toBR(a.dtDemanda)}</div>

                      {/* ✅ Planejamento editável (DTPLANEJAMENTO) */}
                      <div className="col-span-1">
                        <Input
                          type="date"
                          value={a.dtPlan}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAtividades((arr) =>
                              arr.map((x) => (x.id === a.id ? { ...x, dtPlan: v } : x))
                            );
                          }}
                          className="h-7 px-1 text-[11px]"
                        />
                      </div>

                      <div className="col-span-1">
                        <ColabMultiSelect
                          atividade={a}
                          colabs={colabsParaAlocar}
                          setorAlocarLabel={setorAlocarLabel}
                          onChange={(alocados) =>
                            setAtividades((arr) =>
                              arr.map((x) => (x.id === a.id ? { ...x, alocados } : x))
                            )
                          }
                        />
                      </div>

                      <div className="col-span-1 text-right">
                        {a.alocados.length > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[10px] px-1.5 h-7"
                            onClick={() =>
                              setAtividades((arr) =>
                                arr.map((x) => (x.id === a.id ? { ...x, alocados: [] } : x))
                              )
                            }
                          >
                            Limpar
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}

                {!loading && atividadesFiltradas.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Nenhuma atividade encontrada com os filtros atuais.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ✅ Grade de colaboradores (AGORA FILTRADA pelo “Setor para alocar”) */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Colaboradores (grade)</h4>
            {setorAlocar !== "Todos" ? (
              <Badge variant="secondary" className="text-[11px]">
                Filtrado: {setorAlocarLabel}
              </Badge>
            ) : null}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-1.5 border-b bg-muted/40">
                <div className="col-span-4">Colaborador</div>
                <div className="col-span-2 text-right">Atv tela</div>
                <div className="col-span-2 text-right">HH tela</div>
                <div className="col-span-2 text-right">Atv ERP</div>
                <div className="col-span-2 text-right">Qtd ERP</div>
              </div>

              <div className="max-h-[220px] overflow-y-auto divide-y">
                {colabsVisiveis.map((c) => {
                  const tela = resumoColabTela(c.id);
                  const qERP = c.atividadesERP.length;
                  const qtdERP = c.atividadesERP.reduce((s, p) => s + p.qtd, 0);

                  return (
                    <div key={c.id} className="grid grid-cols-12 items-center px-3 py-1.5 gap-2 text-xs">
                      <div className="col-span-4 flex items-center gap-2 min-w-0">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{initials(c.nome)}</AvatarFallback>
                        </Avatar>

                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.nome}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {c.cargo} • Setor: {c.codSetor || "-"}
                          </p>
                        </div>
                      </div>

                      <div className="col-span-2 text-right">{tela.qtd}</div>
                      <div className="col-span-2 text-right">{tela.hh.toFixed(1)}h</div>
                      <div className="col-span-2 text-right">{qERP}</div>
                      <div className="col-span-2 text-right">{qtdERP}</div>
                    </div>
                  );
                })}

                {!loading && !colabsVisiveis.length && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Nenhum colaborador para o filtro atual.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ✅ Gantt por horas (AGORA POR DIA DE PLANEJAMENTO) */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              Gantt — {toBR(diaPlanejamento)} (07h — 17h)
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Clique em “Detalhes” para trocar colaborador no ERP.
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          <div className="overflow-x-auto">
            <div className="min-w-[880px] space-y-1">
              <div
                className="grid items-center text-[11px] text-muted-foreground"
                style={{ gridTemplateColumns: "220px 1fr" }}
              >
                <div />
                <div
                  className="grid gap-[1px]"
                  style={{
                    gridTemplateColumns: `repeat(${TOTAL_HORAS}, minmax(0, 1fr))`,
                  }}
                >
                  {hourTicks.map((h) => (
                    <div key={h} className="text-center">
                      {h}h
                    </div>
                  ))}
                </div>
              </div>

              <div className="max-h-[260px] overflow-y-auto space-y-1 pr-1">
                {colabsVisiveis.map((c) => {
                  const blocks = buildBlocksForColab(atividades, c, diaPlanejamento);

                  const telaDia = resumoColabTelaDia(c.id, diaPlanejamento);
                  const hhErpDia = (c.atividadesERP || [])
                    .filter((p) => p.dt === diaPlanejamento)
                    .reduce((s, p) => s + p.qtd / 60, 0);

                  const hhTotalDia = telaDia.hh + hhErpDia;

                  return (
                    <div
                      key={c.id}
                      className="grid items-center gap-2"
                      style={{ gridTemplateColumns: "220px 1fr" }}
                    >
                      <div className="flex items-center gap-2 pr-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{initials(c.nome)}</AvatarFallback>
                        </Avatar>

                        <div className="min-w-0">
                          <p className="text-[11px] font-medium truncate">{c.nome}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {hhTotalDia.toFixed(1)}h no dia (tela + ERP)
                          </p>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="ml-auto text-[10px] px-2 py-1 h-7"
                          onClick={() => openHab(c)}
                        >
                          Detalhes
                        </Button>
                      </div>

                      <div>
                        <div className="relative h-5 rounded-md bg-muted overflow-hidden">
                          <div
                            className="absolute inset-0 grid pointer-events-none"
                            style={{
                              gridTemplateColumns: `repeat(${TOTAL_HORAS}, minmax(0, 1fr))`,
                            }}
                          >
                            {hourTicks.map((h) => (
                              <div key={h} className="border-l border-white/40 last:border-r" />
                            ))}
                          </div>

                          {blocks.map((b) => {
                            const left = ((b.start - HORA_INI) / TOTAL_HORAS) * 100;
                            const width = ((b.end - b.start) / TOTAL_HORAS) * 100;

                            return (
                              <div
                                key={b.atividadeId}
                                className={cn(
                                  "absolute top-[2px] bottom-[2px] rounded-[3px] cursor-pointer hover:opacity-90 shadow-sm",
                                  etapaColor[b.etapa]
                                )}
                                style={{ left: `${left}%`, width: `${width}%` }}
                                title={`${b.label} (${b.start.toFixed(1)}h - ${b.end.toFixed(
                                  1
                                )}h)`}
                                onClick={() => openHab(c)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!loading && !colabsVisiveis.length && (
                  <div className="text-[11px] text-muted-foreground px-1 py-2">
                    Sem colaboradores para exibir o Gantt (verifique o filtro “Setor para alocar”).
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ✅ Modal Backlog (demandas atrasadas) */}
      <Dialog.Root open={backlogOpen} onOpenChange={setBacklogOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content
            className="
              fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[980px]
              -translate-x-1/2 -translate-y-1/2
              rounded-2xl bg-white
              border border-gray-200
              p-4 shadow-2xl outline-none
              max-h-[90vh] overflow-y-auto
            "
          >
            <div className="flex items-start justify-between gap-4 border-b pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">
                  Backlog — Demandas atrasadas
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  Atrasadas: DT demanda &lt; {toBR(todayStr)} • Total: {backlogAtividades.length}
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="mt-3 rounded-2xl border overflow-hidden">
              <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-2 border-b bg-muted/40">
                <div className="col-span-5">Atividade</div>
                <div className="col-span-2">Setor</div>
                <div className="col-span-1 text-right">HH</div>
                <div className="col-span-2">Demanda</div>
                <div className="col-span-2">Planejamento</div>
              </div>

              <div className="max-h-[60vh] overflow-y-auto divide-y">
                {backlogAtividades.map((a) => (
                  <div key={`b-${a.id}`} className="grid grid-cols-12 items-center px-3 py-2 gap-2 text-xs">
                    <div className="col-span-5 truncate" title={a.nome}>
                      {a.nome}
                    </div>

                    <div className="col-span-2">
                      <Badge className={cn("text-[10px] px-1 py-0", etapaBadgeStyles[a.etapa])}>
                        {a.codusu} - {a.setor}
                      </Badge>
                    </div>

                    <div className="col-span-1 text-right">{a.hhPrev}h</div>

                    <div className="col-span-2">
                      <span className="text-red-600 font-medium">{toBR(a.dtDemanda)}</span>
                    </div>

                    <div className="col-span-2 flex gap-2">
                      <Input
                        type="date"
                        value={a.dtPlan}
                        onChange={(e) => {
                          const v = e.target.value;
                          setAtividades((arr) =>
                            arr.map((x) => (x.id === a.id ? { ...x, dtPlan: v } : x))
                          );
                        }}
                        className="h-7 px-1 text-[11px]"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() =>
                          setAtividades((arr) =>
                            arr.map((x) =>
                              x.id === a.id ? { ...x, dtPlan: diaPlanejamento } : x
                            )
                          )
                        }
                      >
                        = Dia
                      </Button>
                    </div>
                  </div>
                ))}

                {!loading && backlogAtividades.length === 0 && (
                  <div className="px-3 py-6 text-xs text-muted-foreground">
                    Nenhuma atividade atrasada encontrada.
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline">Fechar</Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Modal Habilidades / Atividades / Planejamento ERP */}
      <Dialog.Root open={habOpen} onOpenChange={setHabOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
          <Dialog.Content
            className="
              fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[720px]
              -translate-x-1/2 -translate-y-1/2
              rounded-2xl bg-white dark:bg-white
              border border-gray-200
              p-4 shadow-2xl outline-none
              max-h-[90vh] overflow-y-auto
            "
          >
            <div className="flex items-start justify-between gap-4 border-b pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">
                  {habColab?.nome} • {habColab?.cargo}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  Habilidades e atividades no período (demandas {toBR(ini)} — {toBR(fin)})
                </Dialog.Description>
              </div>

              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Fechar" onClick={closeHab}>
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-6">
              <section>
                <h4 className="text-sm font-medium mb-2">Habilidades</h4>
                <div className="flex flex-wrap gap-2">
                  {(habilidadesPorCargo[habColab?.cargo ?? "Colaborador"] || ["Operação geral"]).map(
                    (h, i) => (
                      <Badge key={i} variant="outline">
                        {h}
                      </Badge>
                    )
                  )}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-medium mb-2">Atividades alocadas (tela)</h4>
                <div className="rounded-2xl border divide-y">
                  <div className="grid grid-cols-12 text-xs text-muted-foreground px-3 py-2">
                    <div className="col-span-6">Atividade</div>
                    <div className="col-span-2">Etapa</div>
                    <div className="col-span-2">Planej.</div>
                    <div className="col-span-2 text-right">HH</div>
                  </div>

                  {habColab
                    ? atividades
                        .filter((a) => a.alocados.includes(habColab.id) && a.dtPlan >= ini && a.dtPlan <= fin)
                        .map((a) => {
                          const share = a.alocados.length ? a.hhPrev / a.alocados.length : a.hhPrev;
                          return (
                            <div key={a.id} className="grid grid-cols-12 items-center px-3 py-2 gap-2 text-xs">
                              <div className="col-span-6">{a.nome}</div>
                              <div className="col-span-2">
                                <Badge className={cn("text-[10px] px-1 py-0", etapaBadgeStyles[a.etapa])}>
                                  {a.etapa}
                                </Badge>
                              </div>
                              <div className="col-span-2">{toBR(a.dtPlan)}</div>
                              <div className="col-span-2 text-right">{share.toFixed(1)}h</div>
                            </div>
                          );
                        })
                    : null}

                  {habColab &&
                    atividades.filter((a) => a.alocados.includes(habColab.id) && a.dtPlan >= ini && a.dtPlan <= fin)
                      .length === 0 && (
                      <div className="px-3 py-6 text-xs text-muted-foreground">
                        Nenhuma atividade alocada na tela neste período.
                      </div>
                    )}
                </div>
              </section>

              <section>
                <h4 className="text-sm font-medium mb-2">
                  Planejamento ERP (AD_DETALCRONOGRAMAFUNC)
                </h4>
                <div className="rounded-2xl border divide-y">
                  <div className="grid grid-cols-12 text-xs text-muted-foreground px-3 py-2">
                    <div className="col-span-4">Atividade</div>
                    <div className="col-span-2">Data</div>
                    <div className="col-span-2 text-right">Qtd (min)</div>
                    <div className="col-span-3">Novo colaborador</div>
                    <div className="col-span-1 text-right">Ação</div>
                  </div>

                  {habColab && habColab.atividadesERP.length > 0 ? (
                    habColab.atividadesERP.map((p, i) => (
                      <div
                        key={`${habColab.id}-${p.seq}-${p.codprod}-${p.dt}-${i}`}
                        className="grid grid-cols-12 items-center px-3 py-2 gap-2 text-xs"
                      >
                        <div className="col-span-4">
                          {p.codprod} - {p.descrprod}
                        </div>
                        <div className="col-span-2">{toBR(p.dt)}</div>
                        <div className="col-span-2 text-right">{p.qtd}</div>
                        <div className="col-span-3">
                          <select
                            className="w-full rounded-md border bg-background px-2 py-1 text-[11px]"
                            value={novoDestinoPorSeq[p.seq] ?? ""}
                            onChange={(e) =>
                              setNovoDestinoPorSeq((prev) => ({
                                ...prev,
                                [p.seq]: e.target.value ? Number(e.target.value) : "",
                              }))
                            }
                          >
                            <option value="">Selecione…</option>
                            {/* ✅ respeita o filtro de setor também */}
                            {colabsParaAlocar
                              .filter((c) => c.id !== habColab.id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.id} - {c.nome}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="col-span-1 text-right">
                          <Button
                            size="sm"
                            className="text-[10px] px-2 h-7"
                            variant="outline"
                            disabled={loadingSeq === p.seq}
                            onClick={() => handleTrocarFuncionarioErpItem(p)}
                          >
                            {loadingSeq === p.seq ? "..." : "Trocar"}
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-3 py-6 text-xs text-muted-foreground">
                      Nenhuma atividade planejada no ERP para esta OP.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="outline" onClick={closeHab}>
                  Fechar
                </Button>
              </Dialog.Close>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
