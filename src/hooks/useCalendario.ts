// src/hooks/useCalendario.ts
// Leva o calendário de feriados do ERP até as telas que dividem meta por dia
// útil (Meta de Produção, Daily, Alocação, Dashboard).
//
// Cache POR ANO no escopo do módulo: duas telas que olham 2026 disparam UMA
// consulta, e trocar de mês dentro do ano não reconsulta. O cache guarda a
// Promise, não o resultado — duas telas que montam ao mesmo tempo compartilham
// a mesma requisição em vez de abrirem duas.
import { useEffect, useMemo, useState } from "react";

import { CALENDARIO_VAZIO, type Calendario } from "@/lib/calendario";
import { getFeriadosDoAno } from "@/services/feriadosService";
import { mensagemErro } from "@/lib/sankhyaRetorno";

const cache = new Map<number, Promise<string[]>>();

function carregarAno(ano: number): Promise<string[]> {
  const pronto = cache.get(ano);
  if (pronto) return pronto;
  /* A Promise entra no cache ANTES do await: se duas telas pedirem o mesmo ano
     no mesmo tick, a segunda pega esta e não abre outra consulta. Em caso de
     falha ela sai do cache, para a próxima tentativa não herdar o erro. */
  const p = getFeriadosDoAno(ano).catch((e: unknown) => {
    cache.delete(ano);
    throw e;
  });
  cache.set(ano, p);
  return p;
}

export type CalendarioCarregado = Calendario & { carregando: boolean; erro: string | null };

/**
 * Garante que os `anos` pedidos estejam carregados.
 *
 * Enquanto não chegam — ou se a consulta falhar — devolve o calendário vazio
 * com `completo: false`: as contas caem para segunda a sexta e a tela mostra o
 * selo "sem feriados". Nunca bloqueia o primeiro render.
 */
export function useCalendario(anos: number[]): CalendarioCarregado {
  /* `anos` costuma ser um array novo a cada render; a chave estável evita que o
     efeito rode de novo sem o conteúdo ter mudado. */
  const chave = useMemo(() => [...new Set(anos)].sort((a, b) => a - b).join(","), [anos]);
  const [cal, setCal] = useState<Calendario>(CALENDARIO_VAZIO);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const lista = chave ? chave.split(",").map(Number).filter(Number.isFinite) : [];
    if (lista.length === 0) {
      setCal(CALENDARIO_VAZIO);
      return;
    }
    let vivo = true;
    setCarregando(true);
    setErro(null);
    Promise.all(lista.map((ano) => carregarAno(ano).then((dias) => ({ ano, dias }))))
      .then((partes) => {
        if (!vivo) return;
        /* Ano sem nenhum feriado não é um ano: é a função devolvendo 0 para
           tudo (TSIFER vazia, empresa 1 sem cidade, CODUSU sem permissão).
           Vale o mesmo aviso de quando a consulta falha. */
        const completo = partes.length > 0 && partes.every((p) => p.dias.length > 0);
        setCal({
          feriados: new Set(partes.flatMap((p) => p.dias)),
          anos: new Set(partes.filter((p) => p.dias.length > 0).map((p) => p.ano)),
          completo,
        });
      })
      .catch((e: unknown) => {
        if (!vivo) return;
        setCal(CALENDARIO_VAZIO);
        setErro(mensagemErro(e, "Falha ao carregar o calendário de feriados."));
      })
      .finally(() => {
        if (vivo) setCarregando(false);
      });
    return () => {
      vivo = false;
    };
  }, [chave]);

  return { ...cal, carregando, erro };
}
