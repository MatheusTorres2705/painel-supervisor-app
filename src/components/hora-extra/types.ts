// src/components/hora-extra/types.ts
import { duracaoMin } from "@/lib/horas";

/** Rótulo de quem não tem supervisor no cadastro do ERP. */
export const SEM_LIDER = "sem líder";

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

  /** `null` quando o colaborador não tem supervisor no cadastro (TFPFUN.USUVPJSUP). */
  codigoSupervisor: number | null;
  nomeSupervisor: string;
  codigoSolicitante: number;
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
  codigoSolicitante: number;
  nomeSolicitante: string;
  /** O usuário logado foi quem lançou esta programação. */
  souSolicitante: boolean;

  itens: HoraExtraRow[];

  /** Duração do turno, em minutos — igual para todos do evento. */
  minutosPorPessoa: number;
  /** minutosPorPessoa × nº de pessoas. */
  totalMinutos: number;
  pendentes: number;
  aprovados: number;
  /**
    * O que o usuário logado pode aprovar: os colaboradores da equipe dele e,
    * quando a programação é dele, também os que não têm líder cadastrado —
    * senão não sobra ninguém para liberar a hora desses.
    */
  itensAprovaveis: HoraExtraRow[];
  /** Colaboradores de outro líder: é com eles que o solicitante vai cobrar. */
  itensDeOutroLider: HoraExtraRow[];
  /** Líderes que ainda devem aprovação neste evento, para a tela nomear quem cobrar. */
  lideresPendentes: string[];
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

    const souSolicitante = base.codigoSolicitante === codusuSup;
    const podeAprovar = (x: HoraExtraRow) =>
      x.codigoSupervisor === codusuSup || (x.codigoSupervisor == null && souSolicitante);
    const deOutroLider = itens.filter((x) => !podeAprovar(x));

    eventos.push({
      codBancoHoras,
      dtuso: base.dtuso,
      dtusoBR: base.dtusoBR,
      hrini: base.hrini,
      hrfin: base.hrfin,
      coddep: base.coddep,
      descrdep: base.descrdep,
      codigoSolicitante: base.codigoSolicitante,
      nomeSolicitante: base.nomeSolicitante,
      souSolicitante,

      itens,
      minutosPorPessoa,
      totalMinutos: minutosPorPessoa * itens.length,
      pendentes: itens.filter((x) => x.liberado === "N").length,
      aprovados: itens.filter((x) => x.liberado === "S").length,
      itensAprovaveis: itens.filter(podeAprovar),
      itensDeOutroLider: deOutroLider,
      lideresPendentes: [
        ...new Set(
          deOutroLider
            .filter((x) => x.liberado === "N")
            .map((x) => x.nomeSupervisor || SEM_LIDER)
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
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
