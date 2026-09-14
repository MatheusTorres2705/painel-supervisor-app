// src/components/patterns/ChartPanels.tsx
// Portado de painel-diretoria (components/ui/chart-panels.tsx) para os tokens
// deste projeto; comportamento e medidas iguais.
//
// Substitui o gráfico de eixo duplo: com duas escalas verticais, o ponto em
// que a linha cruza as barras parece dizer algo, mas só depende de onde cada
// eixo começa e termina. Aqui as escalas ficam separadas, em dois painéis com
// o mesmo eixo X.
//
// Os dois painéis só alinham as categorias se usarem a MESMA margem lateral e
// a MESMA largura de YAxis: PANEL_MARGIN e PANEL_Y_WIDTH, em lib/chartTheme
// (lá, e não aqui, porque arquivo de componente só exporta componente).
import * as React from "react";

export function ChartPanels({
  principal,
  apoio,
  alturaPrincipal = "h-40 md:h-56 2xl:h-64",
  alturaApoio = "h-24 md:h-28 2xl:h-32",
  legenda,
  rotuloApoio,
}: {
  /** Painel de cima: a métrica que a tela existe para mostrar. */
  principal: React.ReactNode;
  /** Painel de baixo: o contexto (denominador, volume). Menor de propósito. */
  apoio: React.ReactNode;
  alturaPrincipal?: string;
  alturaApoio?: string;
  /** Nota de rodapé explicando as duas séries. */
  legenda?: React.ReactNode;
  /** Rótulo curto do painel inferior, já que ele perde a legenda própria. */
  rotuloApoio?: string;
}) {
  return (
    <div>
      <div className={alturaPrincipal}>{principal}</div>

      {rotuloApoio && (
        <div className="mb-0.5 mt-1 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {rotuloApoio}
        </div>
      )}
      <div className={alturaApoio}>{apoio}</div>

      {legenda && <div className="mt-2 text-2xs text-muted-foreground">{legenda}</div>}
    </div>
  );
}
