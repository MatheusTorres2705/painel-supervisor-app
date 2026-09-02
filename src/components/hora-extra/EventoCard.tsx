// src/components/hora-extra/EventoCard.tsx
// Um cabeçalho de AD_BANCOHORAS e seus colaboradores, expansível.
// Traz a aprovação em lote: antes cada pessoa exigia um modal e uma ida ao ERP.
import * as React from "react";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Lock,
  Pencil,
  RotateCcw,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { diaCurto, faixaHorario, formatDuracao, isFimDeSemana } from "@/lib/horas";
import { rowKey, type Evento, type HoraExtraRow } from "@/components/hora-extra/types";

function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate) && !checked;
  }, [indeterminate, checked]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      disabled={disabled}
      className="h-4 w-4 shrink-0 cursor-pointer rounded border-input accent-[hsl(var(--primary))] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    />
  );
}

export function EventoCard({
  evento,
  codusuSup,
  expandido,
  onToggleExpandir,
  selecionados,
  onToggleItem,
  onToggleTodos,
  onAprovarSelecionados,
  onReverter,
  onEditar,
  ocupado,
}: {
  evento: Evento;
  /** CODUSU do usuário logado — define quem pode aprovar. */
  codusuSup: number;
  expandido: boolean;
  onToggleExpandir: () => void;
  /** Chaves (`rowKey`) selecionadas globalmente. */
  selecionados: Set<string>;
  onToggleItem: (r: HoraExtraRow) => void;
  onToggleTodos: (evento: Evento, marcar: boolean) => void;
  onAprovarSelecionados: (itens: HoraExtraRow[]) => void;
  onReverter: (r: HoraExtraRow) => void;
  onEditar: (evento: Evento) => void;
  ocupado: boolean;
}) {
  // Só entram em lote os pendentes cujo supervisor é o usuário logado.
  const elegiveis = evento.itensAprovaveis.filter((x) => x.liberado === "N");
  const marcadosDoEvento = elegiveis.filter((x) => selecionados.has(rowKey(x)));
  const todosMarcados =
    elegiveis.length > 0 && marcadosDoEvento.length === elegiveis.length;

  const semPermissao = evento.itensAprovaveis.length === 0;
  const fimDeSemana = isFimDeSemana(evento.dtuso);
  const totalmenteAprovado = evento.pendentes === 0;

  return (
    <Card className="overflow-hidden">
      {/* ---------- Cabeçalho do evento ---------- */}
      <div className="flex flex-wrap items-center gap-3 p-3 sm:flex-nowrap">
        <button
          type="button"
          onClick={onToggleExpandir}
          aria-expanded={expandido}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              expandido && "rotate-90"
            )}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-foreground">
                {diaCurto(evento.dtuso)}
              </span>
              {fimDeSemana ? (
                <Badge variant="warning">fim de semana</Badge>
              ) : null}
              <span className="tabular text-2xs text-muted-foreground">
                {faixaHorario(evento.hrini, evento.hrfin)}
              </span>
              <Badge variant="muted">
                {formatDuracao(evento.minutosPorPessoa)} por pessoa
              </Badge>
            </div>

            <p className="mt-0.5 truncate text-2xs text-muted-foreground">
              {evento.descrdep || `Setor ${evento.coddep}`} • solicitado por{" "}
              {evento.nomeSolicitante || "—"}
            </p>
          </div>
        </button>

        {/* Métricas do evento */}
        <div className="flex shrink-0 items-center gap-4 pl-7 sm:pl-0">
          <div className="text-right">
            <p className="tabular text-sm font-semibold text-foreground">
              {formatDuracao(evento.totalMinutos)}
            </p>
            <p className="flex items-center justify-end gap-1 text-2xs text-muted-foreground">
              <Users className="h-3 w-3" aria-hidden="true" />
              {evento.itens.length}
            </p>
          </div>

          {totalmenteAprovado ? (
            <Badge variant="success">Aprovado</Badge>
          ) : (
            <Badge variant="warning">{evento.pendentes} pendente(s)</Badge>
          )}
        </div>

        {/* Ações do evento */}
        <div className="flex shrink-0 items-center gap-2 pl-7 sm:pl-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onEditar(evento)}
            disabled={ocupado || semPermissao}
            aria-label="Editar horário do evento"
            title={
              semPermissao
                ? "Você não é supervisor dos colaboradores deste evento"
                : "Editar horário do evento"
            }
          >
            <Pencil className="h-4 w-4" />
          </Button>

          {elegiveis.length > 0 ? (
            <Button
              size="sm"
              onClick={() =>
                onAprovarSelecionados(
                  marcadosDoEvento.length > 0 ? marcadosDoEvento : elegiveis
                )
              }
              disabled={ocupado}
            >
              <CheckCircle2 className="h-4 w-4" />
              {marcadosDoEvento.length > 0
                ? `Aprovar ${marcadosDoEvento.length}`
                : `Aprovar ${elegiveis.length}`}
            </Button>
          ) : null}
        </div>
      </div>

      {/* Aviso de permissão — antes o botão simplesmente sumia, sem explicação. */}
      {semPermissao ? (
        <p className="flex items-center gap-1.5 border-t border-border bg-muted/40 px-4 py-2 text-2xs text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
          Somente o supervisor destes colaboradores pode aprovar.
        </p>
      ) : null}

      {/* ---------- Colaboradores ---------- */}
      {expandido ? (
        <div className="border-t border-border">
          <div className="flex items-center gap-3 bg-muted/40 px-4 py-2">
            {elegiveis.length > 0 ? (
              <Checkbox
                checked={todosMarcados}
                indeterminate={marcadosDoEvento.length > 0}
                onChange={() => onToggleTodos(evento, !todosMarcados)}
                label={`Selecionar todos os pendentes de ${evento.dtusoBR}`}
                disabled={ocupado}
              />
            ) : (
              <span className="w-4" aria-hidden="true" />
            )}
            <span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Colaborador
            </span>
            <span className="ml-auto text-2xs font-medium uppercase tracking-wide text-muted-foreground">
              Situação
            </span>
          </div>

          <ul className="divide-y divide-border">
            {evento.itens.map((r) => {
              const podeAprovar = r.codigoSupervisor === codusuSup;
              const elegivel = podeAprovar && r.liberado === "N";
              const marcado = selecionados.has(rowKey(r));

              return (
                <li
                  key={rowKey(r)}
                  className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30"
                >
                  {elegivel ? (
                    <Checkbox
                      checked={marcado}
                      onChange={() => onToggleItem(r)}
                      label={`Selecionar ${r.nomefunc}`}
                      disabled={ocupado}
                    />
                  ) : (
                    <span className="w-4" aria-hidden="true" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-foreground">{r.nomefunc}</p>
                    <p className="text-2xs text-muted-foreground">
                      Matrícula {r.codfunc}
                      {r.nomeSupervisor ? ` • supervisor ${r.nomeSupervisor}` : ""}
                    </p>
                  </div>

                  <span className="tabular hidden shrink-0 items-center gap-1 text-2xs text-muted-foreground sm:flex">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {formatDuracao(evento.minutosPorPessoa)}
                  </span>

                  {r.liberado === "S" ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge variant="success">Aprovado</Badge>
                      {podeAprovar ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onReverter(r)}
                          disabled={ocupado}
                          aria-label={`Reverter aprovação de ${r.nomefunc}`}
                          title="Reverter aprovação"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <Badge variant="warning" className="shrink-0">
                      Pendente
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
