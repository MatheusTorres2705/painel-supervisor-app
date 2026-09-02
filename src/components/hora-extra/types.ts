// src/components/hora-extra/types.ts
import { duracaoMin } from "@/lib/horas";

/** Uma linha de AD_BCOFUN (um colaborador dentro de um evento). */
export type HoraExtraRow = {
  codBancoHoras: number;
  codBcoHrFun: number;
  codfunc: number;
  nomefunc: string;

  dtuso: string; // YYYY-MM-DD
  dtusoBR: string; // DD/MM/YYYY

  hrini: string;
  hrfin: string;
  coddep: number;
  descrdep: string;
  liberado: "S" | "N";

  codigoSupervisor: number;
  nomeSupervisor: string;
  nomeSolicitante: string;
};

/**
 * Um cabeçalho de AD_BANCOHORAS com seus colaboradores.
 * A tela antiga achatava isso: 20 pessoas numa noite viravam 20 linhas
 * idênticas, e 20 aprovações separadas.
 */
export type Evento = {
  codBancoHoras: number;
  dtuso: string;
  dtusoBR: string;
  hrini: string;
  hrfin: string;
  coddep: number;
  descrdep: string;
  nomeSolicitante: string;

  itens: HoraExtraRow[];

  /** Duração do turno, em minutos — igual para todos do evento. */
  minutosPorPessoa: number;
  /** minutosPorPessoa × nº de pessoas. */
  totalMinutos: number;
  pendentes: number;
  aprovados: number;
  /** O usuário logado é supervisor de pelo menos um colaborador do evento. */
  itensAprovaveis: HoraExtraRow[];
};

export type Chave = `${number}`;

/** Identidade de uma linha, usada em seleção e em listas. */
export const rowKey = (r: HoraExtraRow) => `${r.codBancoHoras}-${r.codBcoHrFun}`;

/** Agrupa as linhas por cabeçalho, ordenando por data desc e depois por horário. */
export function agruparEventos(
  rows: HoraExtraRow[],
  codusuSup: number
): Evento[] {
  const mapa = new Map<number, HoraExtraRow[]>();
  for (const r of rows) {
    const atual = mapa.get(r.codBancoHoras);
    if (atual) atual.push(r);
    else mapa.set(r.codBancoHoras, [r]);
  }

  const eventos: Evento[] = [];

  for (const [codBancoHoras, itens] of mapa) {
    const base = itens[0];
    const minutosPorPessoa = duracaoMin(base.hrini, base.hrfin) ?? 0;

    itens.sort((a, b) => a.nomefunc.localeCompare(b.nomefunc, "pt-BR"));

    eventos.push({
      codBancoHoras,
      dtuso: base.dtuso,
      dtusoBR: base.dtusoBR,
      hrini: base.hrini,
      hrfin: base.hrfin,
      coddep: base.coddep,
      descrdep: base.descrdep,
      nomeSolicitante: base.nomeSolicitante,

      itens,
      minutosPorPessoa,
      totalMinutos: minutosPorPessoa * itens.length,
      pendentes: itens.filter((x) => x.liberado === "N").length,
      aprovados: itens.filter((x) => x.liberado === "S").length,
      itensAprovaveis: itens.filter((x) => x.codigoSupervisor === codusuSup),
    });
  }

  eventos.sort((a, b) => {
    const d = b.dtuso.localeCompare(a.dtuso);
    if (d !== 0) return d;
    return a.hrini.localeCompare(b.hrini);
  });

  return eventos;
}

/** Totais do período, para os indicadores do topo. */
export type Resumo = {
  totalMinutos: number;
  pendentesMinutos: number;
  aprovadosMinutos: number;
  pendentesQtd: number;
  colaboradores: number;
  eventos: number;
};

export function resumir(rows: HoraExtraRow[]): Resumo {
  let totalMinutos = 0;
  let pendentesMinutos = 0;
  let aprovadosMinutos = 0;
  let pendentesQtd = 0;

  const funcs = new Set<number>();
  const eventos = new Set<number>();

  for (const r of rows) {
    const min = duracaoMin(r.hrini, r.hrfin) ?? 0;
    totalMinutos += min;
    if (r.liberado === "S") {
      aprovadosMinutos += min;
    } else {
      pendentesMinutos += min;
      pendentesQtd++;
    }
    funcs.add(r.codfunc);
    eventos.add(r.codBancoHoras);
  }

  return {
    totalMinutos,
    pendentesMinutos,
    aprovadosMinutos,
    pendentesQtd,
    colaboradores: funcs.size,
    eventos: eventos.size,
  };
}

/** Horas por departamento, ordenado do maior para o menor. */
export function porDepartamento(rows: HoraExtraRow[]) {
  const mapa = new Map<number, { coddep: number; descrdep: string; minutos: number }>();

  for (const r of rows) {
    const min = duracaoMin(r.hrini, r.hrfin) ?? 0;
    const atual = mapa.get(r.coddep);
    if (atual) atual.minutos += min;
    else
      mapa.set(r.coddep, {
        coddep: r.coddep,
        descrdep: r.descrdep || `Depto ${r.coddep}`,
        minutos: min,
      });
  }

  return Array.from(mapa.values()).sort((a, b) => b.minutos - a.minutos);
}

/** Colaboradores com mais horas acumuladas — sinal de sobrecarga. */
export function porColaborador(rows: HoraExtraRow[]) {
  const mapa = new Map<
    number,
    { codfunc: number; nomefunc: string; minutos: number; ocorrencias: number }
  >();

  for (const r of rows) {
    const min = duracaoMin(r.hrini, r.hrfin) ?? 0;
    const atual = mapa.get(r.codfunc);
    if (atual) {
      atual.minutos += min;
      atual.ocorrencias++;
    } else {
      mapa.set(r.codfunc, {
        codfunc: r.codfunc,
        nomefunc: r.nomefunc,
        minutos: min,
        ocorrencias: 1,
      });
    }
  }

  return Array.from(mapa.values()).sort((a, b) => b.minutos - a.minutos);
}
