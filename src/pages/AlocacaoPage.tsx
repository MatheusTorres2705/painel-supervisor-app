// src/pages/AlocacaoPage.tsx
// npm install jspdf jspdf-autotable

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";
import { api } from "@/lib/api";
import { useAuth } from "@/auth/AuthProvider";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Download, Save, FileText, ArrowLeft } from "lucide-react";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

/* =================== Tipos =================== */
type Etapa = "LAM" | "MON" | "PINT" | "ELE" | "ACB";

type Atividade = {
  id: number;
  nome: string;
  etapa: Etapa;
  hhPrev: number; // horas
  dt: string; // YYYY-MM-DD
  alocadoPara?: number; // CODFUNC

  // Campos ERP para salvar em AD_DETALCRONOGRAMAFUNC
  codusu: number; // CODUSU do cronograma
  codprod: number;
  seq: number; // SEQ do cronograma
  tempoMin: number; // QTD original em minutos
};

type AtividadeERP = {
  seq: number;
  dt: string;
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
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")}`
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

// deduz etapa das atividades do ERP, usando o cargo do colaborador
function etapaFromCargo(cargo: string): Etapa {
  const up = (cargo || "").toUpperCase();
  if (up.includes("LAM")) return "LAM";
  if (up.includes("PINT")) return "PINT";
  if (up.includes("ELE")) return "ELE";
  if (up.includes("ACAB")) return "ACB";
  return "MON"; // padrão
}

/**
 * Monta os blocos do Gantt considerando:
 * - atividades da TELA (Atividade, com hhPrev)
 * - atividades já planejadas no ERP (atividadesERP, com qtd em minutos)
 * Filtrando pela data do planejamento.
 */
function buildBlocksForColab(
  atividadesTela: Atividade[],
  colab: Colab,
  dataPlanejamento: string
): GanttBlock[] {
  const tarefas: {
    atividadeId: number;
    label: string;
    etapa: Etapa;
    hh: number;
  }[] = [];

  // 1) Atividades alocadas na TELA para a data do planejamento
  atividadesTela
    .filter(
      (a) =>
        a.alocadoPara === colab.id &&
        (!!dataPlanejamento ? a.dt === dataPlanejamento : true)
    )
    .forEach((a) => {
      tarefas.push({
        atividadeId: a.id,
        label: a.nome,
        etapa: a.etapa,
        hh: a.hhPrev,
      });
    });

  // 2) Atividades já planejadas no ERP (AD_DETALCRONOGRAMAFUNC) nessa data
  const etapaErp = etapaFromCargo(colab.cargo);
  (colab.atividadesERP || []).forEach((p, idx) => {
    if (dataPlanejamento && p.dt !== dataPlanejamento) return;
    const hh = Math.max(0.5, Math.round((p.qtd / 60) * 10) / 10); // minutos -> horas
    tarefas.push({
      atividadeId: 100000 + colab.id * 1000 + idx, // id virtual único
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
    const dur = Math.max(0.5, Math.min(t.hh, HORA_FIM - cursor));
    const start = cursor;
    const end = Math.min(HORA_FIM, start + dur);

    blocks.push({
      atividadeId: t.atividadeId,
      label: t.label,
      start,
      end,
      etapa: t.etapa,
    });

    cursor = end;
  }

  return blocks;
}

/* ====== Logo em base64 para o PDF (troque pela sua) ====== */
const LOGO_BASE64 = "data:image/png;base64,SEU_LOGO_AQUI"; // troque pelo base64 da logo

/* =================== Página =================== */
export default function AlocacaoPage() {
  const { opId } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // disparador de recarga
  const [reloadToken, setReloadToken] = useState(0);

  // período datas
  const today = new Date();
  const defIni =
    sp.get("ini") ||
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(today.getDate()).padStart(2, "0")}`;
  const defFin =
    sp.get("fin") ||
    (() => {
      const t = new Date(today);
      t.setDate(t.getDate() + 5);
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(t.getDate()).padStart(2, "0")}`;
    })();

  const [ini, setIni] = useState(defIni);
  const [fin, setFin] = useState(defFin);
  const dias = useMemo(() => rangeDays(ini, fin), [ini, fin]);

  // Data do planejamento (dirige Gantt, salvar e PDF)
  const [dataPlanejamento, setDataPlanejamento] = useState(defIni);

  const [colabs, setColabs] = useState<Colab[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);

  const [q, setQ] = useState("");
  const [etapa, setEtapa] = useState<"Todas" | Etapa>("Todas");

  const preNome = sp.get("colabNome");

  const [habOpen, setHabOpen] = useState(false);
  const [habColab, setHabColab] = useState<Colab | null>(null);

  // estado para troca de funcionário por atividade ERP (seq-sequencia -> novo codfunc)
  const [novoDestinoPorSeq, setNovoDestinoPorSeq] = useState<
    Record<string, number | "">
  >({});
  const [loadingSeq, setLoadingSeq] = useState<string | null>(null);

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

        const CODUSU_SUP = (user as any)?.codusu ?? 673;

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
          const dt = String(r.DT || ini);
          const codprod = Number(r.CODIGO ?? 0);
          const seq = Number(r.SEQCRONO ?? 0);
          const codusu = Number(r.CODSETOR ?? 0);

          return {
            id: idx + 1,
            nome: `${r.CODIGO ?? ""} - ${r.DESCRPROD ?? ""}`,
            etapa,
            hhPrev,
            dt,
            codprod,
            seq,
            tempoMin,
            codusu,
          };
        });

        // 2) Colaboradores vinculados ao supervisor
        const CODUSU_SUP_QRY = CODUSU_SUP;
        const sqlColabs = `
          SELECT DISTINCT
            FUN.CODFUNC,
            FUN.NOMEFUNC
          FROM TFPFUN FUN
          LEFT JOIN AD_DETALCRONOGRAMAFUNC F ON FUN.CODFUNC = F.CODFUNC
          WHERE FUN.USUVPJSUP = ${CODUSU_SUP_QRY}
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
          WHERE FUN.USUVPJSUP = ${CODUSU_SUP_QRY}
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
            cargo: "Colaborador",
            senior: "Pleno",
            atividadesERP: planejadasPorFunc[codfunc] || [],
          };
        });

        if (cancel) return;
        setAtividades(mappedAtv);
        setColabs(mappedColabs);

        // se o modal estiver aberto, sincroniza o habColab com os dados recarregados
        setHabColab((prev) =>
          prev ? mappedColabs.find((c) => c.id === prev.id) || prev : null
        );
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

  const atividadesFiltradas = useMemo(
    () =>
      atividades.filter((a) => {
        if (a.dt < ini || a.dt > fin) return false;
        if (etapa !== "Todas" && a.etapa !== etapa) return false;
        if (q.trim()) {
          const k = q.trim().toLowerCase();
          if (!(`${a.nome} ${a.etapa}`.toLowerCase().includes(k))) return false;
        }
        return true;
      }),
    [atividades, ini, fin, etapa, q]
  );

  const totalHH = atividades.reduce((s, a) => s + a.hhPrev, 0);
  const totalHHAloc = atividades
    .filter((a) => a.alocadoPara)
    .reduce((s, a) => s + a.hhPrev, 0);

  const resumoColabTela = (id: number) => {
    const minhas = atividades.filter((a) => a.alocadoPara === id);
    const hh = minhas.reduce((s, a) => s + a.hhPrev, 0);
    return { qtd: minhas.length, hh };
  };

  /* =========== Distribuição auto simples (mock) =========== */
  const distribuirAuto = () => {
    if (!colabs.length) return;
    const semDono = atividades
      .filter((a) => !a.alocadoPara && a.dt >= ini && a.dt <= fin)
      .sort((a, b) =>
        a.dt === b.dt ? b.hhPrev - a.hhPrev : a.dt.localeCompare(b.dt)
      );
    if (!semDono.length) return;

    const updates: Record<number, number> = {};
    let idxColab = 0;

    for (const a of semDono) {
      const c = colabs[idxColab];
      updates[a.id] = c.id;
      idxColab = (idxColab + 1) % colabs.length;
    }

    setAtividades((arr) =>
      arr.map((x) =>
        updates[x.id] ? { ...x, alocadoPara: updates[x.id] } : x
      )
    );
  };

  /* ===== Exportar planejamento por funcionário (CSV) ===== */
  const exportPlanejamentoCsv = () => {
    const registros = atividades.filter((a) => a.alocadoPara);
    if (!registros.length) {
      alert("Nenhuma atividade alocada para exportar.");
      return;
    }

    const header = ["codfunc", "nome", "op", "data", "atividade", "hh"];

    const rows = registros.map((a) => {
      const col = a.alocadoPara ? colabById[a.alocadoPara] : undefined;
      return [
        a.alocadoPara ?? "",
        col?.nome ?? "",
        opId ?? "",
        toBR(a.dt),
        a.nome,
        a.hhPrev.toString().replace(".", ","),
      ];
    });

    const csv =
      [header, ...rows]
        .map((r) =>
          r
            .map((v) => {
              const s = String(v ?? "");
              if (s.includes(";") || s.includes('"') || s.includes("\n")) {
                return `"${s.replace(/"/g, '""')}"`;
              }
              return s;
            })
            .join(";")
        )
        .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `planejamento_OP_${opId}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ===== Exportar PDF (Tela + ERP) ===== */
  const exportPlanejamentoPdf = () => {
    if (!colabs.length) {
      alert("Nenhum colaborador para exportar.");
      return;
    }

    // verifica se existe pelo menos uma atividade (tela ou ERP) na data do planejamento
    const hasAny = colabs.some((c) => {
      const telaAtvs = atividades.filter(
        (a) =>
          a.alocadoPara === c.id &&
          (!!dataPlanejamento ? a.dt === dataPlanejamento : true)
      );
      const erpAtvs = (c.atividadesERP || []).filter((p) =>
        dataPlanejamento ? p.dt === dataPlanejamento : true
      );
      return telaAtvs.length > 0 || erpAtvs.length > 0;
    });

    if (!hasAny) {
      alert(
        "Nenhuma atividade (tela ou ERP) na data de planejamento selecionada para exportar."
      );
      return;
    }

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    let cursorY = 15;

    // Cabeçalho
    try {
      if (LOGO_BASE64 && LOGO_BASE64 !== "data:image/png;base64,SEU_LOGO_AQUI") {
        doc.addImage(LOGO_BASE64, "PNG", 10, 8, 30, 10);
      }
    } catch {
      // ignora problema na logo
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Planejamento de Atividades por Colaborador", pageWidth / 2, 15, {
      align: "center",
    });

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const hojeStr = toBR(new Date().toISOString().slice(0, 10));
    doc.text(`OP: ${opId ?? ""}`, pageWidth / 2, 21, { align: "center" });
    doc.text(
      `Data do planejamento: ${toBR(
        dataPlanejamento
      )}  •  Gerado em: ${hojeStr}`,
      pageWidth / 2,
      26,
      { align: "center" }
    );

    cursorY = 32;

    // Para cada colaborador, junta tela + ERP na data do planejamento
    colabs.forEach((colab) => {
      // atividades da tela (alocadas) na data do planejamento
      const telaAtvs = atividades
        .filter(
          (a) =>
            a.alocadoPara === colab.id &&
            (!!dataPlanejamento ? a.dt === dataPlanejamento : true)
        )
        .sort((a, b) => a.dt.localeCompare(b.dt));

      // atividades ERP desse colaborador na data do planejamento
      const erpAtvs = (colab.atividadesERP || [])
        .filter((p) =>
          dataPlanejamento ? p.dt === dataPlanejamento : true
        )
        .sort((a, b) => a.dt.localeCompare(b.dt));

      if (!telaAtvs.length && !erpAtvs.length) {
        return; // pula colaborador sem nada na data
      }

      if (cursorY > 260) {
        doc.addPage();
        cursorY = 15;
      }

      // Título por colaborador
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(colab.nome, 14, cursorY);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      // resumo HH (tela + ERP) na data
      const hhTela = telaAtvs.reduce((s, a) => s + a.hhPrev, 0);
      const hhErp = erpAtvs.reduce((s, p) => s + p.qtd / 60, 0);
      const hhTotal = hhTela + hhErp;

      doc.text(
        `HH tela: ${hhTela.toFixed(
          1
        )}h   •   HH ERP: ${hhErp.toFixed(
          1
        )}h   •   Total: ${hhTotal.toFixed(1)}h`,
        pageWidth - 14,
        cursorY,
        { align: "right" }
      );

      cursorY += 4;

      // Monta corpo da tabela: tela + ERP
      type BodyRow = [string, string, string, string, string, string, string];

      const body: BodyRow[] = [];

      // Linhas da TELA
      telaAtvs.forEach((a) => {
        body.push([
          toBR(a.dt), // Data
          a.nome, // Atividade
          "Tela", // Origem
          a.etapa, // Etapa
          `${a.hhPrev.toFixed(1)}h`, // HH
          opId ?? "", // OP
          "", // OK (checkbox desenhado depois)
        ]);
      });

      // Linhas do ERP
      const etapaErp = etapaFromCargo(colab.cargo);
      erpAtvs.forEach((p) => {
        const hh = p.qtd / 60;
        body.push([
          toBR(p.dt), // Data
          `${p.codprod} - ${p.descrprod}`, // Atividade
          "ERP", // Origem
          etapaErp, // Etapa
          `${hh.toFixed(1)}h`, // HH
          opId ?? "", // OP
          "", // OK
        ]);
      });

      autoTable(doc, {
        startY: cursorY,
        head: [["Data", "Atividade", "Origem", "Etapa", "HH", "OP", "OK"]],
        body,
        styles: {
          fontSize: 8,
          cellPadding: 1.5,
        },
        headStyles: {
          fillColor: [25, 40, 66],
          textColor: 255,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: { left: 12, right: 12 },

        // desenha o "checkbox" na coluna OK (índice 6)
        didDrawCell: (data: any) => {
          if (data.section === "body" && data.column.index === 6) {
            const { x, y, height } = data.cell;
            const size = Math.min(4, height - 2); // ~4mm
            const offsetY = y + (height - size) / 2;
            doc.rect(x + 2, offsetY, size, size);
          }
        },
      });

      cursorY = (doc as any).lastAutoTable.finalY + 8;

      // espaço para assinatura do colaborador
      if (cursorY > 250) {
        doc.addPage();
        cursorY = 30;
      }
      doc.setFontSize(9);
      doc.text(
        "Assinatura do colaborador: ________________________________",
        14,
        cursorY
      );
      cursorY += 10;
    });

    doc.save(
      `planejamento_OP_${opId}_${new Date().toISOString().slice(0, 10)}.pdf`
    );
  };

  /* ===== Botão Salvar planejamento (real) ===== */
  const salvarPlanejamento = async () => {
    const registros = atividades.filter(
      (a) => a.alocadoPara && a.codprod && a.seq
    );

    if (!registros.length) {
      alert("Nenhuma atividade alocada para salvar.");
      return;
    }

    if (!opId) {
      alert("OP não informada.");
      return;
    }

    if (!dataPlanejamento) {
      alert("Informe a data do planejamento.");
      return;
    }

    try {
      setSaving(true);

      const dtPlanejamentoSankhya = toSankhyaDate(dataPlanejamento);

      for (const a of registros) {
        try {
          await api.post("/api/sankhya/dataset/save", {
            entity: "AD_DETALCRONOGRAMAFUNC",
            fields: ["SEQ", "CODFUNC", "CODUSU", "CODPROD", "DTPLANEJAMENTO", "QTD"],
            values: {
              "0": String(a.seq),
              "1": String(a.alocadoPara),
              "2": String(a.codusu), // CODUSU responsável pelo planejamento
              "3": String(a.codprod),
              // usa a data do planejamento para DTPLANEJAMENTO
              "4": dtPlanejamentoSankhya, // DD/MM/YYYY
              "5": Math.round(a.hhPrev * 60), // grava em minutos
            },
          });
        } catch (err: any) {
          console.error(
            "[salvarPlanejamento] Erro em uma atividade:",
            a,
            err?.response?.data || err
          );
          throw new Error(
            `Erro ao salvar atividade ${a.nome} para o colaborador ${a.alocadoPara}.`
          );
        }
      }

      alert("Planejamento salvo com sucesso no ERP (usando a data do planejamento).");

      // RECARREGA dados (atividades e planejamento ERP)
      setReloadToken((k) => k + 1);
    } catch (e: any) {
      console.error("[salvarPlanejamento] Falha:", e);
      alert(
        `Erro ao salvar o planejamento.\n${
          e?.message || "Veja o console para mais detalhes."
        }`
      );
    } finally {
      setSaving(false);
    }
  };

  /* ===== handlers modal habilidades / troca ===== */
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

  // Troca CODFUNC atividade por atividade no ERP (mantendo a data original do item)
  const handleTrocarFuncionarioErpItem = async (item: AtividadeERP) => {
    if (!habColab || !opId) {
      alert("Colaborador ou OP inválidos.");
      return;
    }

    const itemKey = `${item.seq}-${item.sequencia}`;
    const novoDestino = novoDestinoPorSeq[itemKey];
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
      setLoadingSeq(itemKey);

      const sankhyaDate = toSankhyaDate(item.dt);

      // Atualiza CODFUNC no ERP usando dataset/save
      await api.post("/api/sankhya/dataset/save", {
        entity: "AD_DETALCRONOGRAMAFUNC",
        fields: ["SEQ", "CODFUNC", "CODPROD", "DTPLANEJAMENTO", "QTD"],
        values: {
          "0": String(item.seq),
          "1": String(novoDestino),
          "2": String(item.codprod),
          "3": sankhyaDate,
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
        const copy: Record<string, number | ""> = { ...prev };
        delete copy[itemKey];
        return copy;
      });

      // RECARREGA dados para refletir o novo colaborador
      setReloadToken((k) => k + 1);
    } catch (e) {
      console.error("[handleTrocarFuncionarioErpItem] Erro:", e);
      alert(
        "Erro ao trocar o colaborador dessa atividade no ERP. Veja o console para mais detalhes."
      );
    } finally {
      setLoadingSeq(null);
    }
  };

  /* =================== Render =================== */
  return (
    // Scroll geral
    <div className="h-[calc(100vh-140px)] overflow-y-auto space-y-4 pr-1">
      {/* Header / filtros */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="px-2"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Voltar
              </Button>
              <div>
                <h3 className="text-lg font-semibold">
                  Alocação de Recursos — OP {opId}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {preNome && (
                    <Badge variant="secondary">
                      Colaborador focado: {preNome}
                    </Badge>
                  )}
                  <span>
                    Atividades: {atividades.length} • HH total:{" "}
                    {totalHH.toFixed(1)}h • HH alocado:{" "}
                    {totalHHAloc.toFixed(1)}h
                  </span>
                  <span>• Colaboradores: {colabs.length}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={exportPlanejamentoCsv}
                disabled={!atividades.length || !colabs.length}
              >
                <Download className="h-4 w-4" />
                CSV
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={exportPlanejamentoPdf}
                disabled={!atividades.length || !colabs.length}
              >
                <FileText className="h-4 w-4" />
                PDF
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={distribuirAuto}
                disabled={!atividades.length || !colabs.length}
              >
                Distribuir (auto)
              </Button>
              <Button
                size="sm"
                className="gap-1"
                onClick={salvarPlanejamento}
                disabled={saving || !atividades.length || !colabs.length}
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-3">
            <Input
              placeholder="Buscar atividade…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Etapa</label>
            <select
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-xs"
              value={etapa}
              onChange={(e) => setEtapa(e.target.value as any)}
            >
              <option>Todas</option>
              <option>LAM</option>
              <option>MON</option>
              <option>PINT</option>
              <option>ELE</option>
              <option>ACB</option>
            </select>
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Início</label>
            <Input
              type="date"
              value={ini}
              onChange={(e) => setIni(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="col-span-6 md:col-span-2">
            <label className="text-xs text-muted-foreground">Fim</label>
            <Input
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className="text-xs"
            />
          </div>
          {/* Data do planejamento */}
          <div className="col-span-6 md:col-span-3">
            <label className="text-xs text-muted-foreground">
              Data do planejamento (Gantt / Salvar / PDF)
            </label>
            <Input
              type="date"
              value={dataPlanejamento}
              onChange={(e) => setDataPlanejamento(e.target.value)}
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
              Atividades da OP (grade) — {toBR(ini)} a {toBR(fin)}
            </h4>
            <Badge variant="outline" className="text-[11px]">
              {atividadesFiltradas.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[880px]">
              <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-1.5 border-b bg-muted/40">
                <div className="col-span-5">Atividade</div>
                <div className="col-span-1">Etapa</div>
                <div className="col-span-1 text-right">HH</div>
                <div className="col-span-2">Data</div>
                <div className="col-span-2">Alocado para</div>
                <div className="col-span-1 text-right">Ação</div>
              </div>
              <div className="max-h-[280px] overflow-y-auto divide-y">
                {loading && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Carregando dados…
                  </div>
                )}
                {!loading &&
                  atividadesFiltradas.map((a) => (
                    <div
                      key={a.id}
                      className="grid grid-cols-12 items-center px-3 py-1.5 gap-2 bg-card text-xs"
                    >
                      <div className="col-span-5 truncate" title={a.nome}>
                        {a.nome}
                      </div>
                      <div className="col-span-1">
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0"
                        >
                          {a.codusu} - {a.etapa}
                        </Badge>
                      </div>
                      <div className="col-span-1 text-right">
                        {a.hhPrev}h
                      </div>
                      <div className="col-span-2">{toBR(a.dt)}</div>
                      <div className="col-span-2">
                        <select
                          className="w-full rounded-md border bg-background px-1.5 py-1 text-[11px]"
                          value={a.alocadoPara ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAtividades((arr) =>
                              arr.map((x) =>
                                x.id === a.id
                                  ? {
                                      ...x,
                                      alocadoPara: v ? Number(v) : undefined,
                                    }
                                  : x
                              )
                            );
                          }}
                        >
                          <option value="">Sem alocação</option>
                          {colabs.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-1 text-right">
                        {a.alocadoPara && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[10px] px-1.5 h-7"
                            onClick={() =>
                              setAtividades((arr) =>
                                arr.map((x) =>
                                  x.id === a.id
                                    ? { ...x, alocadoPara: undefined }
                                    : x
                                )
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

      {/* Grade de colaboradores (AGORA filtrada pela dataPlanejamento) */}
      <Card>
        <CardHeader className="py-3">
          <h4 className="text-sm font-semibold">
            Colaboradores (grade) — {toBR(dataPlanejamento)}
          </h4>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-12 text-[11px] text-muted-foreground px-3 py-1.5 border-b bg-muted/40">
                <div className="col-span-4">Colaborador</div>
                <div className="col-span-2 text-right">Atv tela (dia)</div>
                <div className="col-span-2 text-right">HH tela (dia)</div>
                <div className="col-span-2 text-right">Atv ERP (dia)</div>
                <div className="col-span-2 text-right">Qtd ERP (min dia)</div>
              </div>
              <div className="max-h-[220px] overflow-y-auto divide-y">
                {colabs.map((c) => {
                  // TELA na data do planejamento
                  const telaDia = atividades.filter(
                    (a) =>
                      a.alocadoPara === c.id &&
                      (!!dataPlanejamento ? a.dt === dataPlanejamento : true)
                  );
                  const qtdTelaDia = telaDia.length;
                  const hhTelaDia = telaDia.reduce(
                    (s, a) => s + a.hhPrev,
                    0
                  );

                  // ERP na data do planejamento
                  const erpDia = (c.atividadesERP || []).filter((p) =>
                    dataPlanejamento ? p.dt === dataPlanejamento : true
                  );
                  const qtdErpDia = erpDia.length;
                  const qtdErpMinDia = erpDia.reduce(
                    (s, p) => s + p.qtd,
                    0
                  );

                  return (
                    <div
                      key={c.id}
                      className="grid grid-cols-12 items-center px-3 py-1.5 gap-2 text-xs"
                    >
                      <div className="col-span-4 flex items-center gap-2 min-w-0">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback>{initials(c.nome)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium truncate">{c.nome}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {c.cargo}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-2 text-right">
                        {qtdTelaDia}
                      </div>
                      <div className="col-span-2 text-right">
                        {hhTelaDia.toFixed(1)}h
                      </div>
                      <div className="col-span-2 text-right">
                        {qtdErpDia}
                      </div>
                      <div className="col-span-2 text-right">
                        {qtdErpMinDia}
                      </div>
                    </div>
                  );
                })}
                {!loading && !colabs.length && (
                  <div className="px-3 py-4 text-xs text-muted-foreground">
                    Nenhum colaborador retornado para o supervisor logado.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gantt por horas */}
      <Card>
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">
              Gantt de carga diária (07h — 17h) — {toBR(dataPlanejamento)}
            </h4>
            <span className="text-[11px] text-muted-foreground">
              Considera apenas a data de planejamento selecionada. Clique em uma
              barra para detalhar as atividades do colaborador e trocar
              funcionário no ERP atividade por atividade.
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="overflow-x-auto">
            <div className="min-w-[880px] space-y-1">
              {/* cabeçalho horas */}
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

              {/* linhas de colaboradores */}
              <div className="max-h-[260px] overflow-y-auto space-y-1 pr-1">
                {colabs.map((c) => {
                  const blocks = buildBlocksForColab(
                    atividades,
                    c,
                    dataPlanejamento
                  );
                  const tela = resumoColabTela(c.id);
                  const hhErp = (c.atividadesERP || []).reduce(
                    (s, p) => s + p.qtd / 60,
                    0
                  );
                  const hhTotal = tela.hh + hhErp;

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
                          <p className="text-[11px] font-medium truncate">
                            {c.nome}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {hhTotal.toFixed(1)}h alocadas (tela + ERP)
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
                          {/* grades de horas */}
                          <div
                            className="absolute inset-0 grid pointer-events-none"
                            style={{
                              gridTemplateColumns: `repeat(${TOTAL_HORAS}, minmax(0, 1fr))`,
                            }}
                          >
                            {hourTicks.map((h) => (
                              <div
                                key={h}
                                className="border-l border-white/40 last:border-r"
                              />
                            ))}
                          </div>

                          {/* barras coloridas (tela + ERP) */}
                          {blocks.map((b) => {
                            const left =
                              ((b.start - HORA_INI) / TOTAL_HORAS) * 100;
                            const width =
                              ((b.end - b.start) / TOTAL_HORAS) * 100;

                            return (
                              <div
                                key={b.atividadeId}
                                className={`absolute top-[2px] bottom-[2px] rounded-[3px] ${
                                  etapaColor[b.etapa]
                                } cursor-pointer hover:opacity-90 shadow-sm`}
                                style={{
                                  left: `${left}%`,
                                  width: `${width}%`,
                                }}
                                title={`${b.label} (${b.start.toFixed(
                                  1
                                )}h - ${b.end.toFixed(1)}h)`}
                                onClick={() => openHab(c)}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loading && !colabs.length && (
                  <div className="text-[11px] text-muted-foreground px-1 py-2">
                    Sem colaboradores para exibir o Gantt.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Modal Habilidades / Atividades / Planejamento ERP com troca por atividade */}
      <Dialog.Root open={habOpen} onOpenChange={setHabOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-4 shadow-2xl outline-none">
            <div className="flex items-start justify-between gap-4 border-b pb-3">
              <div>
                <Dialog.Title className="text-base font-semibold">
                  {habColab?.nome} • {habColab?.cargo}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground">
                  Habilidades e atividades na data de planejamento (
                  {toBR(dataPlanejamento)})
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Fechar"
                  onClick={closeHab}
                >
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>

            <div className="mt-4 space-y-6">
              {/* Habilidades */}
              <section>
                <h4 className="text-sm font-medium mb-2">Habilidades</h4>
                <div className="flex flex-wrap gap-2">
                  {(habilidadesPorCargo[habColab?.cargo ?? "Colaborador"] || [
                    "Operação geral",
                  ]).map((h, i) => (
                    <Badge key={i} variant="outline">
                      {h}
                    </Badge>
                  ))}
                </div>
              </section>

              {/* Atividades da tela */}
              <section>
                <h4 className="text-sm font-medium mb-2">
                  Atividades alocadas (tela) na data
                </h4>
                <div className="rounded-2xl border divide-y">
                  <div className="grid grid-cols-12 text-xs text-muted-foreground px-3 py-2">
                    <div className="col-span-6">Atividade</div>
                    <div className="col-span-2">Etapa</div>
                    <div className="col-span-2">Data</div>
                    <div className="col-span-2 text-right">HH</div>
                  </div>
                  {habColab
                    ? atividades
                        .filter(
                          (a) =>
                            a.alocadoPara === habColab.id &&
                            (!!dataPlanejamento
                              ? a.dt === dataPlanejamento
                              : true)
                        )
                        .map((a) => (
                          <div
                            key={a.id}
                            className="grid grid-cols-12 items-center px-3 py-2 gap-2 text-xs"
                          >
                            <div className="col-span-6">{a.nome}</div>
                            <div className="col-span-2">
                              <Badge variant="outline">{a.etapa}</Badge>
                            </div>
                            <div className="col-span-2">{toBR(a.dt)}</div>
                            <div className="col-span-2 text-right">
                              {a.hhPrev}h
                            </div>
                          </div>
                        ))
                    : null}
                  {habColab &&
                    atividades.filter(
                      (a) =>
                        a.alocadoPara === habColab.id &&
                        (!!dataPlanejamento
                          ? a.dt === dataPlanejamento
                          : true)
                    ).length === 0 && (
                      <div className="px-3 py-6 text-xs text-muted-foreground">
                        Nenhuma atividade alocada na tela nesta data.
                      </div>
                    )}
                </div>
              </section>

              {/* Planejamento ERP com troca por atividade */}
              <section>
                <h4 className="text-sm font-medium mb-2">
                  Planejamento ERP (AD_DETALCRONOGRAMAFUNC) na data
                </h4>
                <div className="rounded-2xl border divide-y">
                  <div className="grid grid-cols-12 text-xs text-muted-foreground px-3 py-2">
                    <div className="col-span-4">Atividade</div>
                    <div className="col-span-2">Data</div>
                    <div className="col-span-2 text-right">Qtd (min)</div>
                    <div className="col-span-3">Novo colaborador</div>
                    <div className="col-span-1 text-right">Ação</div>
                  </div>
                  {habColab &&
                  habColab.atividadesERP.filter((p) =>
                    dataPlanejamento ? p.dt === dataPlanejamento : true
                  ).length > 0 ? (
                    habColab.atividadesERP
                      .filter((p) =>
                        dataPlanejamento ? p.dt === dataPlanejamento : true
                      )
                      .map((p, i) => {
                        const itemKey = `${p.seq}-${p.sequencia}`;
                        return (
                          <div
                            key={`${habColab.id}-${p.seq}-${p.sequencia}-${p.codprod}-${p.dt}-${i}`}
                            className="grid grid-cols-12 items-center px-3 py-2 gap-2 text-xs"
                          >
                            <div className="col-span-4">
                              {p.codprod} - {p.descrprod}
                            </div>
                            <div className="col-span-2">{toBR(p.dt)}</div>
                            <div className="col-span-2 text-right">
                              {p.qtd}
                            </div>
                            <div className="col-span-3">
                              <select
                                className="w-full rounded-md border bg-background px-2 py-1 text-[11px]"
                                value={novoDestinoPorSeq[itemKey] ?? ""}
                                onChange={(e) =>
                                  setNovoDestinoPorSeq((prev) => ({
                                    ...prev,
                                    [itemKey]: e.target.value
                                      ? Number(e.target.value)
                                      : "",
                                  }))
                                }
                              >
                                <option value="">Selecione…</option>
                                {colabs
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
                                disabled={loadingSeq === itemKey}
                                onClick={() => handleTrocarFuncionarioErpItem(p)}
                              >
                                {loadingSeq === itemKey ? "..." : "Trocar"}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="px-3 py-6 text-xs text-muted-foreground">
                      Nenhuma atividade planejada no ERP nesta data para esta OP.
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
