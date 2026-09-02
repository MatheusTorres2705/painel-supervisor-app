// src/components/hora-extra/RetornoDialog.tsx
// Resultado de uma operação no ERP. A versão anterior despejava PK, SQL e
// transactionId em <pre> na cara do supervisor; agora o técnico fica recolhido.
import { Copy } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export type RetornoInfo = {
  title: string;
  resumo: string;
  human: string;
  tech?: string;
  transactionId?: string;
  personalization?: string;
  variant?: "success" | "warning" | "destructive" | "info";
};

export function RetornoDialog({
  open,
  onOpenChange,
  info,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  info: RetornoInfo | null;
}) {
  const copiar = () => {
    const text =
      `${info?.title || "Retorno"}\n\n${info?.resumo || ""}\n\n${info?.human || ""}\n\n` +
      (info?.tech ? `--- TÉCNICO ---\n${info.tech}\n\n` : "") +
      (info?.transactionId ? `TransactionId: ${info.transactionId}\n` : "");
    navigator.clipboard?.writeText(text);
  };

  const temTecnico = Boolean(info?.tech || info?.personalization || info?.transactionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{info?.title || "Retorno"}</DialogTitle>
          <DialogDescription>{info?.resumo}</DialogDescription>
        </DialogHeader>

        {info?.human ? (
          <Alert variant={info.variant ?? "info"}>
            <pre className="whitespace-pre-wrap break-words font-sans text-2xs">
              {info.human}
            </pre>
          </Alert>
        ) : null}

        {temTecnico ? (
          <details className="rounded-lg border border-border bg-muted/40 p-3">
            <summary className="cursor-pointer text-2xs text-muted-foreground">
              Detalhes técnicos
            </summary>
            <div className="mt-2 space-y-2">
              {info?.transactionId ? (
                <p className="text-2xs text-muted-foreground">
                  TransactionId:{" "}
                  <span className="font-mono text-foreground">
                    {info.transactionId}
                  </span>
                </p>
              ) : null}
              {info?.tech ? (
                <pre className="whitespace-pre-wrap break-words text-2xs text-muted-foreground">
                  {info.tech}
                </pre>
              ) : null}
              {info?.personalization ? (
                <pre className="whitespace-pre-wrap break-words text-2xs text-muted-foreground">
                  {info.personalization}
                </pre>
              ) : null}
            </div>
          </details>
        ) : null}

        <div className="flex justify-end gap-2">
          {temTecnico ? (
            <Button variant="outline" onClick={copiar}>
              <Copy className="h-4 w-4" />
              Copiar
            </Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
