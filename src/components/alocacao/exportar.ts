// src/components/alocacao/exportar.ts
// CSV e PDF do planejamento por colaborador. Saíram da AlocacaoPage com o mesmo
// layout; o que mudou:
//  · a carga de outras OPs entra como linha "Outras OPs" por dia (antes o
//    colaborador parecia livre no papel);
//  · o PDF só gera página para quem tem atividade no período;
//  · o logo fictício ("SEU_LOGO_AQUI") saiu.
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { CargaExterna, Colab, Demanda } from "@/services/alocacaoService";
import { horasPorAlocado } from "./planejamento";

const toBR = (ymd: string) => {
  const [y, m, d] = (ymd || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : ymd || "-";
};
const hoje = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

type Linha = { data: string; atividade: string; origem: "Tela" | "ERP" | "Outras OPs"; horas: number };

function linhasDoColab(c: Colab, demandas: Demanda[], externa: CargaExterna, ini: string, fin: string): Linha[] {
  const dentro = (d: string) => !!d && d >= ini && d <= fin;
  const tela: Linha[] = demandas
    .filter((d) => d.alocados.includes(c.id) && dentro(d.dtPlan))
    .map((d) => ({ data: d.dtPlan, atividade: d.nome, origem: "Tela", horas: horasPorAlocado(d) }));
  const erp: Linha[] = c.atividadesERP
    .filter((p) => dentro(p.dt))
    .map((p) => ({ data: p.dt, atividade: `${p.codprod} - ${p.descrprod}`, origem: "ERP", horas: p.qtd / 60 }));
  const outras: Linha[] = [...(externa.get(c.id) ?? new Map<string, number>())]
    .filter(([dia]) => dentro(dia))
    .map(([dia, min]) => ({ data: dia, atividade: "Outras OPs (planejado no ERP)", origem: "Outras OPs", horas: min / 60 }));
  return [...tela, ...erp, ...outras].sort((a, b) => a.data.localeCompare(b.data) || a.origem.localeCompare(b.origem));
}

export type DadosExportacao = {
  opId: string;
  ini: string;
  fin: string;
  demandas: Demanda[];
  colabs: Colab[];
  externa: CargaExterna;
};

/** Devolve false quando não há nada para exportar. */
export function exportarCsv({ opId, ini, fin, demandas, colabs, externa }: DadosExportacao): boolean {
  const registros = colabs.flatMap((c) =>
    linhasDoColab(c, demandas, externa, ini, fin).map((l) => [
      c.id, c.nome, opId, toBR(l.data), l.atividade, l.horas.toFixed(1).replace(".", ","), l.origem,
    ])
  );
  if (!registros.length) return false;

  const header = ["codfunc", "nome", "op", "data", "atividade", "hh", "origem"];
  const csv = [header, ...registros]
    .map((r) =>
      r
        .map((v) => {
          const s = String(v ?? "");
          return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(";")
    )
    .join("\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `planejamento_OP_${opId}_${hoje()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
}

/** Uma página por colaborador com atividade no período. Devolve false se não houver ninguém. */
export function exportarPdf({ opId, ini, fin, demandas, colabs, externa }: DadosExportacao): boolean {
  const comAtividade = colabs
    .map((c) => ({ c, linhas: linhasDoColab(c, demandas, externa, ini, fin) }))
    .filter((x) => x.linhas.length);
  if (!comAtividade.length) return false;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  const cabecalho = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Planejamento de Atividades por Colaborador", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`OP: ${opId}`, pageWidth / 2, 21, { align: "center" });
    doc.text(`Período: ${toBR(ini)} a ${toBR(fin)}  •  Gerado em: ${toBR(hoje())}`, pageWidth / 2, 26, { align: "center" });
    doc.setDrawColor(220);
    doc.line(12, 30, pageWidth - 12, 30);
  };

  comAtividade.forEach(({ c, linhas }, idx) => {
    if (idx > 0) doc.addPage();
    cabecalho();
    let y = 38;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(c.nome, 14, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Cargo: ${c.cargo}  •  Setores: ${c.codSetores.join(", ") || "-"}`, 14, y + 5);

    const soma = (o: Linha["origem"]) => linhas.filter((l) => l.origem === o).reduce((s, l) => s + l.horas, 0);
    const hTela = soma("Tela");
    const hErp = soma("ERP");
    const hOutras = soma("Outras OPs");
    doc.text(
      `HH tela: ${hTela.toFixed(1)}h  •  HH ERP: ${hErp.toFixed(1)}h  •  Outras OPs: ${hOutras.toFixed(1)}h  •  Total: ${(hTela + hErp + hOutras).toFixed(1)}h`,
      pageWidth - 14,
      y,
      { align: "right" }
    );
    y += 10;

    autoTable(doc, {
      startY: y,
      head: [["Data", "Atividade", "Origem", "HH", "OP", "OK", "Obs"]],
      body: linhas.map((l) => [toBR(l.data), l.atividade, l.origem, `${l.horas.toFixed(1)}h`, l.origem === "Outras OPs" ? "-" : opId, "", ""]),
      styles: { fontSize: 8, cellPadding: 1.4, textColor: 20 },
      headStyles: { fillColor: [25, 40, 66], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      margin: { left: 12, right: 12 },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 86 },
        2: { cellWidth: 20 },
        3: { cellWidth: 12, halign: "right" },
        4: { cellWidth: 12 },
        5: { cellWidth: 10, halign: "center" },
        6: { cellWidth: 28 },
      },
      didDrawCell: (data) => {
        if (data.section === "body" && data.column.index === 5) {
          const { x, y: cy, height } = data.cell;
          const size = Math.min(4, height - 2);
          doc.setDrawColor(30);
          doc.rect(x + 3, cy + (height - size) / 2, size, size);
        }
      },
    });

    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40;
    const signY = Math.min(finalY + 14, 280);
    doc.setFontSize(10);
    doc.text("Assinatura do colaborador:", 14, signY);
    doc.line(60, signY, pageWidth - 14, signY);
    doc.setFontSize(9);
    doc.text("Observações do dia:", 14, signY + 10);
    doc.rect(14, signY + 12, pageWidth - 28, 22);
  });

  doc.save(`planejamento_OP_${opId}_${hoje()}.pdf`);
  return true;
}
