// src/pages/FuncionarioDetalhePage.tsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import {
  ArrowLeft,
  Flag,
  Handshake,
  BriefcaseBusiness,
  Target,
  CheckSquare,
  MessageCircle,
} from "lucide-react";

type TabKey = "metas" | "combinados" | "funcoes" | "pdi" | "checkin" | "anotacoes";

type MembroBasico = {
  codfunc: number;
  nome: string;
  cargo: string;
  depto: string;
  senior: string;
};

type MetaItem = {
  id: number;
  titulo: string;
  peso: number;
  status: "Dentro do esperado" | "Abaixo do esperado" | "Acima do esperado";
  atingimento: number; // 0-100
};

interface LocationState {
  membro?: MembroBasico;
}

/**
 * URL da foto a partir do CODFUNC
 */
const fotoUrl = (codfunc: number) =>
  `http://sankhya.nxboats.com.br:8180/mge/Funcionario@IMAGEM@CODEMP=1@CODFUNC=${codfunc}.dbimage`;

export default function FuncionarioDetalhePage() {
  const { codfunc } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as LocationState;

  const [tab, setTab] = useState<TabKey>("metas");
  const [membro, setMembro] = useState<MembroBasico | null>(state.membro || null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Metas do colaborador (agora vindo do ERP)
  const [metas, setMetas] = useState<MetaItem[]>([]);
  const [metasLoading, setMetasLoading] = useState(false);
  const [metasErro, setMetasErro] = useState<string | null>(null);

  // ---------- Carrega dados básicos do colaborador, se não veio via state ----------
  useEffect(() => {
    const cod = Number(codfunc);
    if (!cod || membro) return;

    let cancel = false;
    (async () => {
      try {
        setLoading(true);
        setErro(null);

        const sql = `
          SELECT 
              FUN.CODFUNC, 
              FUN.NOMEFUNC,
              DEP.DESCRDEP,
              CAR.DESCRCARGO,
              NVL(CAR.AD_NIVEL, 'I') AS SENHORIDADE
          FROM TFPFUN FUN
          JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
          JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
          WHERE FUN.CODFUNC = ${cod}
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        if (!rows.length) {
          setErro("Funcionário não encontrado.");
          return;
        }

        const r = rows[0];
        const senioridade =
          String(r.SENHORIDADE || "").toUpperCase().startsWith("S")
            ? "Sênior"
            : String(r.SENHORIDADE || "").toUpperCase().startsWith("P")
            ? "Pleno"
            : "Júnior";

        setMembro({
          codfunc: Number(r.CODFUNC),
          nome: String(r.NOMEFUNC ?? ""),
          cargo: String(r.DESCRCARGO ?? ""),
          depto: String(r.DESCRDEP ?? ""),
          senior: senioridade,
        });
      } catch (e: any) {
        console.error("[FuncionarioDetalhePage] erro:", e);
        setErro(e?.message || "Falha ao carregar dados do colaborador.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [codfunc, membro]);

  // ---------- Carrega metas do colaborador via ERP ----------
  useEffect(() => {
    const cod = Number(codfunc);
    if (!cod) return;

    let cancel = false;

    (async () => {
      try {
        setMetasLoading(true);
        setMetasErro(null);

        const sql = `
          SELECT
              1 AS ID,
              'Avanco de Atividades' AS TITULO,
              10 AS PESO,
              CASE 
                  WHEN Snk_Dividir(SUM(APO.QTD), 8400) * 100 < 80 
                      THEN 'Abaixo do esperado'
                  ELSE 'Dentro do esperado'
              END AS STATUS,
              Snk_Dividir(SUM(APO.QTD), 8400) * 100 AS atingimento
          FROM AD_DETALCRONOGRAMAFUNC APO
          JOIN TFPFUN FUN ON FUN.CODFUNC = APO.CODFUNC
          WHERE FUN.CODFUNC = ${cod}
          GROUP BY FUN.NOMEFUNC

          UNION ALL

          SELECT
            2 AS ID,
            'Assiduidade e Pontualidade' AS TITULO,
            10 AS PESO,
            'Dentro do esperado' AS STATUS,
            0 AS atingimento
          FROM DUAL

          UNION ALL

          SELECT
            3 AS ID,
            'Apontamento de Qualidade' AS TITULO,
            10 AS PESO,
            'Dentro do esperado' AS STATUS,
            0 AS atingimento
          FROM DUAL
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const list: MetaItem[] = rows.map((r: any) => {
          const atingRaw = Number(r.ATINGIMENTO ?? 0);
          const atingimento = Math.round(atingRaw); // arredonda para inteiro

          const statusStr = String(r.STATUS ?? "Dentro do esperado");
          let status: MetaItem["status"] = "Dentro do esperado";
          if (statusStr.toLowerCase().includes("abaixo")) {
            status = "Abaixo do esperado";
          } else if (statusStr.toLowerCase().includes("acima")) {
            status = "Acima do esperado";
          }

          return {
            id: Number(r.ID),
            titulo: String(r.TITULO ?? ""),
            peso: Number(r.PESO ?? 0),
            status,
            atingimento,
          };
        });

        setMetas(list);
      } catch (e: any) {
        console.error("[FuncionarioDetalhePage] erro metas:", e);
        setMetasErro(
          e?.message || "Falha ao carregar as metas do colaborador."
        );
        setMetas([]);
      } finally {
        if (!cancel) setMetasLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [codfunc]);

  if (!codfunc) {
    return (
      <div className="p-4 text-sm text-red-500">
        Código de funcionário não informado na rota.
      </div>
    );
  }

  const metasResumo = (() => {
    if (!metas.length) return { total: 0, concluidas: 0, abaixo: 0 };

    const total = metas.length;
    const concluidas = metas.filter((m) => m.atingimento >= 100).length;
    const abaixo = metas.filter(
      (m) => m.atingimento < 100 && m.status === "Abaixo do esperado"
    ).length;

    return { total, concluidas, abaixo };
  })();

  const tabs = [
    { key: "metas", label: "Metas", icon: Flag },
    { key: "combinados", label: "Combinados", icon: Handshake },
    { key: "funcoes", label: "Funções", icon: BriefcaseBusiness },
    { key: "pdi", label: "PDI", icon: Target },
    { key: "checkin", label: "Check-in", icon: CheckSquare },
    { key: "anotacoes", label: "Anotações", icon: MessageCircle },
  ] as const;

  const currentTabConfig = tabs.find((t) => t.key === tab) ?? tabs[0];

  return (
    <div className="h-[calc(100vh-80px)] w-full bg-background text-foreground flex rounded-xl border overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-muted/40 flex flex-col">
        {/* Cabeçalho / Voltar */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <Button
            variant="ghost"
            size="icon"
            className="text-foreground hover:bg-muted"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Detalhes do colaborador
          </span>
        </div>

        {/* Avatar + info base */}
        <div className="px-4 pb-4">
          <Card className="bg-card border shadow-sm">
            <CardContent className="p-3 flex flex-col items-center gap-2">
              <Avatar className="h-20 w-20 border border-border">
                {membro && (
                  <AvatarImage
                    src={fotoUrl(membro.codfunc)}
                    alt={membro.nome}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display =
                        "none";
                    }}
                  />
                )}
                <AvatarFallback className="text-lg">
                  {membro?.nome
                    ?.split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("") ?? "NX"}
                </AvatarFallback>
              </Avatar>

              <div className="text-center space-y-1">
                <p className="font-semibold leading-tight text-sm">
                  {membro?.nome || (loading ? "Carregando..." : "Não informado")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {membro?.cargo || "Função não informada"}
                </p>
                {membro && (
                  <Badge variant="outline" className="text-[10px]">
                    {membro.senior} • {membro.depto}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Menu lateral */}
        <nav className="px-3 space-y-1 text-sm">
          {tabs.map((item) => {
            const active = tab === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => setTab(item.key as TabKey)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 transition text-left border border-transparent ${
                  active
                    ? "bg-background text-foreground shadow-sm border-border"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${
                    active ? "bg-foreground text-background" : "bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-4 pb-4">
          <p className="text-[10px] text-muted-foreground">
            Supervisor de Produção • NX Boats
          </p>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Header da aba selecionada */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b">
          <div className="flex flex-col gap-1">
            <div className="inline-flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background">
                <currentTabConfig.icon className="h-4 w-4" />
              </span>
              <h1 className="text-base font-semibold">
                {tab === "metas" && "Metas do colaborador"}
                {tab === "combinados" && "Combinados"}
                {tab === "funcoes" && "Funções / Papéis"}
                {tab === "pdi" && "Plano de Desenvolvimento Individual"}
                {tab === "checkin" && "Check-ins"}
                {tab === "anotacoes" && "Anotações"}
              </h1>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {membro?.nome ? `Você está visualizando ${membro.nome}.` : ""}
            </p>
          </div>
        </div>

        {/* Área de conteúdo com scroll */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {erro && (
            <div className="text-sm text-red-600">
              {erro}
            </div>
          )}

          {tab === "metas" && (
            <>
              {/* Cards de KPIs de metas */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="bg-card border text-foreground">
                  <CardContent className="p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">
                      Total de metas
                    </p>
                    <p className="text-2xl font-semibold">
                      {metasResumo.total}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card border text-foreground">
                  <CardContent className="p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">
                      Concluídas
                    </p>
                    <p className="text-2xl font-semibold">
                      {metasResumo.concluidas}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-card border text-foreground">
                  <CardContent className="p-3">
                    <p className="text-[11px] text-muted-foreground mb-1">
                      Abaixo do esperado
                    </p>
                    <p className="text-2xl font-semibold">
                      {metasResumo.abaixo}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Lista de metas */}
              <div className="space-y-3 mt-1">
                {metasLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Carregando metas do colaborador…
                  </div>
                ) : metasErro ? (
                  <div className="text-sm text-red-600">
                    {metasErro}
                  </div>
                ) : metas.length === 0 ? (
                  <Card className="bg-card border">
                    <CardContent className="p-4 text-sm text-muted-foreground">
                      Nenhuma meta encontrada para este colaborador.
                    </CardContent>
                  </Card>
                ) : (
                  metas.map((m) => (
                    <Card key={m.id} className="bg-card border text-foreground">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold">
                              {m.titulo}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-1">
                              Peso:{" "}
                              <span className="font-medium">{m.peso}</span>
                            </p>
                          </div>
                          <Badge
                            className={`text-[10px] border ${
                              m.status === "Abaixo do esperado"
                                ? "bg-amber-50 text-amber-800 border-amber-200"
                                : m.status === "Acima do esperado"
                                ? "bg-sky-50 text-sky-800 border-sky-200"
                                : "bg-emerald-50 text-emerald-800 border-emerald-200"
                            }`}
                            variant="outline"
                          >
                            {m.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 pb-3 space-y-1.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span>Atingimento acumulado</span>
                          <span className="font-medium">
                            {m.atingimento}%
                          </span>
                        </div>
                        <Progress value={m.atingimento} className="h-2" />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {m.status}
                        </p>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </>
          )}

          {tab !== "metas" && (
            <Card className="bg-card border-dashed text-foreground">
              <CardContent className="p-6 flex flex-col items-start gap-2">
                <h3 className="font-semibold text-sm">
                  Área &quot;{tab.toUpperCase()}&quot; em construção
                </h3>
                <p className="text-[12px] text-muted-foreground max-w-md">
                  Aqui você poderá visualizar e registrar informações específicas
                  de <strong>{membro?.nome}</strong> relacionadas a{" "}
                  {tab === "combinados" && "acordos e combinados individuais."}
                  {tab === "funcoes" && "funções, responsabilidades e escopo."}
                  {tab === "pdi" && "metas de desenvolvimento e PDI."}
                  {tab === "checkin" &&
                    "check-ins recorrentes e acompanhamento."}
                  {tab === "anotacoes" &&
                    "anotações relevantes do gestor sobre o colaborador."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
