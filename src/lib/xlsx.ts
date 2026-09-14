// src/lib/xlsx.ts
// Gerador de .xlsx sem dependências externas.
// Monta um pacote OOXML (ZIP com método "store", sem compressão) e dispara o download.
// Suporta células de texto (inlineStr) e numéricas; primeira linha em negrito (cabeçalho).

export type CellValue = string | number | null | undefined;

/* ---------- CRC32 (necessário para o ZIP) ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/* ---------- ZIP (armazenamento, sem compressão) ---------- */
function buildZip(files: { name: string; content: string }[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (u: Uint8Array) => { chunks.push(u); offset += u.length; };

  const central: { nameBytes: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const data = enc.encode(f.content);
    const crc = crc32(data);
    const entryOffset = offset;

    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true); // assinatura
    dv.setUint16(4, 20, true);         // versão necessária
    dv.setUint16(6, 0, true);          // flags
    dv.setUint16(8, 0, true);          // compressão = store
    dv.setUint16(10, 0, true);         // hora
    dv.setUint16(12, 0, true);         // data
    dv.setUint32(14, crc, true);
    dv.setUint32(18, data.length, true); // tamanho comprimido
    dv.setUint32(22, data.length, true); // tamanho original
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);           // extra
    local.set(nameBytes, 30);

    push(local);
    push(data);
    central.push({ nameBytes, crc, size: data.length, offset: entryOffset });
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const e of central) {
    const h = new Uint8Array(46 + e.nameBytes.length);
    const dv = new DataView(h.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);   // versão criada por
    dv.setUint16(6, 20, true);   // versão necessária
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, e.crc, true);
    dv.setUint32(20, e.size, true);
    dv.setUint32(24, e.size, true);
    dv.setUint16(28, e.nameBytes.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, e.offset, true);
    h.set(e.nameBytes, 46);
    push(h);
    cdSize += h.length;
  }

  const eocd = new Uint8Array(22);
  const dv = new DataView(eocd.buffer);
  dv.setUint32(0, 0x06054b50, true);
  dv.setUint16(4, 0, true);
  dv.setUint16(6, 0, true);
  dv.setUint16(8, central.length, true);
  dv.setUint16(10, central.length, true);
  dv.setUint32(12, cdSize, true);
  dv.setUint32(16, cdStart, true);
  dv.setUint16(20, 0, true);
  push(eocd);

  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/* ---------- Helpers OOXML ---------- */
// Remove caracteres de controle inválidos em XML 1.0 (mantém tab, LF e CR).
// Casar caracteres de controle é o objetivo da expressão: são os inválidos em XML.
// eslint-disable-next-line no-control-regex
const XML_INVALID = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F]", "g");
function escXml(v: string): string {
  return v
    .replace(XML_INVALID, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function colLetter(idx: number): string {
  let s = "";
  let n = idx + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function cellXml(ref: string, value: CellValue, header: boolean): string {
  const styleAttr = header ? ' s="1"' : "";
  if (value == null || value === "") return `<c r="${ref}"${styleAttr}/>`;
  if (typeof value === "number" && Number.isFinite(value))
    return `<c r="${ref}"${styleAttr} t="n"><v>${value}</v></c>`;
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escXml(String(value))}</t></is></c>`;
}

function triggerDownload(bytes: Uint8Array, filename: string) {
  // Cópia do painel-diretoria. Única diferença: a anotação abaixo, exigida pelo
  // TypeScript 5.9 deste projeto — `buildZip` sempre cria `new Uint8Array(n)`,
  // então o buffer é um ArrayBuffer comum; nada muda em execução.
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------- API pública ---------- */
export function exportXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: CellValue[][],
) {
  const safeSheet = (sheetName || "Planilha").replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Planilha";
  const allRows: CellValue[][] = [headers, ...rows];
  const nCols = headers.length;
  const dimension = `A1:${colLetter(Math.max(0, nCols - 1))}${allRows.length}`;

  const sheetRows = allRows
    .map((row, r) => {
      const cells = row
        .map((val, c) => cellXml(`${colLetter(c)}${r + 1}`, val, r === 0))
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");

  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetData>${sheetRows}</sheetData>` +
    `</worksheet>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;

  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escXml(safeSheet)}" sheetId="1" r:id="rId1"/></sheets>` +
    `</workbook>`;

  const workbookRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const styles =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border/></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
    `</styleSheet>`;

  const zip = buildZip([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rels },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/styles.xml", content: styles },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);

  triggerDownload(zip, filename);
}
