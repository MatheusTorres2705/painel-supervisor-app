// src/pages/EquipePage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";
import { useAuth } from "@/auth/AuthProvider";
import { api } from "@/lib/api";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  ChevronRight,
  Download,
  Filter,
  Plus,
  X,
  Trash2,
  ChevronsUpDown,
  Check,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type SeniorFilter = "Todos" | "Júnior" | "Pleno" | "Sênior";
type SortKey = "rank" | "hhProd" | "hhFalta" | "nome";

export type MembroEquipe = {
  id: number; // = CODFUNC
  codfunc: number; // idem
  nome: string; // NOMEFUNC
  cargo: string; // DESCRCARGO
  depto: string; // DESCRDEP
  senior: string; // 'Júnior' | 'Pleno' | 'Sênior'
  anos: number; // ANOS
  meses: number; // MESES
  tempo: string; // TEMPO_CASA
  hhProd: number;
  hhFalta: number;
  rank: number;
};

type SkillNivel = "Básico" | "Intermediário" | "Avançado";

type SkillColaborador = {
  codprod: number;
  descrprod: string;
  dtInclusao: string;
  nivel: SkillNivel;
};

type SkillCatalogo = {
  codprod: number;
  descrprod: string;
};

function mapNivelToLabel(
  n: string | null | undefined
): "Júnior" | "Pleno" | "Sênior" {
  const v = (n || "").toUpperCase();
  if (v.startsWith("S")) return "Sênior";
  if (v.startsWith("P")) return "Pleno";
  return "Júnior";
}

function disponibilidadeColor(hhFalta: number) {
  if (hhFalta > 4) return { dot: "bg-red-500", label: "Crítico" };
  if (hhFalta > 1) return { dot: "bg-amber-500", label: "Atenção" };
  return { dot: "bg-emerald-500", label: "OK" };
}

// URL da foto por CODFUNC
const fotoUrl = (codfunc: number) =>
  `http://sankhya.nxboats.com.br:8180/mge/Funcionario@IMAGEM@CODEMP=1@CODFUNC=${codfunc}.dbimage`;

export default function EquipePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [base, setBase] = useState<MembroEquipe[]>([]);

  // ----------------- Filtros/Ordenação -----------------
  const [q, setQ] = useState("");
  const [senior, setSenior] = useState<SeniorFilter>("Todos");
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortAsc, setSortAsc] = useState(true);

  // ----------------- Habilidades (por colaborador) -----------------
  const [skillsMap, setSkillsMap] = useState<Record<number, SkillColaborador[]>>(
    {}
  );
  const [skillsOpenFor, setSkillsOpenFor] = useState<MembroEquipe | null>(null);

  const [newSkill, setNewSkill] = useState<{
    codprod: string;
    nivel: SkillNivel;
  }>({
    codprod: "",
    nivel: "Básico",
  });

  const [catalogoHabs, setCatalogoHabs] = useState<SkillCatalogo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsErro, setSkillsErro] = useState<string | null>(null);
  const [catalogoLoading, setCatalogoLoading] = useState(false);

  const [habilidadeOpen, setHabilidadeOpen] = useState(false);

  // ----------------- Carregar equipe da API -----------------
  useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setLoading(true);
        setErro(null);

        const CODUSU_SUP = (user as any)?.codusu ?? 134;

        const sql = `
          SELECT 
          
              FUN.CODFUNC, 
              FUN.NOMEFUNC,
              FUN.CODDEP, 
              DEP.DESCRDEP,
              CAR.DESCRCARGO,
              NVL(CAR.AD_NIVEL, 'I') AS SENHORIDADE, 
              TRUNC(MONTHS_BETWEEN(SYSDATE, FUN.DTADM) / 12) AS ANOS,
              TRUNC(MOD(MONTHS_BETWEEN(SYSDATE, FUN.DTADM), 12)) AS MESES,
              TO_CHAR(FLOOR(MONTHS_BETWEEN(SYSDATE, FUN.DTADM)/12)) || ' ano(s) e ' ||
              TO_CHAR(FLOOR(MOD(MONTHS_BETWEEN(SYSDATE, FUN.DTADM),12))) || ' mes(es)' AS TEMPO_CASA
          FROM TFPFUN FUN
          JOIN TFPDEP DEP ON DEP.CODDEP = FUN.CODDEP
          JOIN TFPCAR CAR ON CAR.CODCARGO = FUN.CODCARGO
          WHERE FUN.USUVPJSUP = ${CODUSU_SUP}
          and FUN.SITUACAO <> '0'
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const mapped: MembroEquipe[] = rows.map((r: any, idx: number) => ({
          id: Number(r.CODFUNC),
          codfunc: Number(r.CODFUNC),
          nome: String(r.NOMEFUNC ?? ""),
          cargo: String(r.DESCRCARGO ?? ""),
          depto: String(r.DESCRDEP ?? ""),
          senior: mapNivelToLabel(r.SENHORIDADE),
          anos: Number(r.ANOS ?? 0),
          meses: Number(r.MESES ?? 0),
          tempo: String(r.TEMPO_CASA ?? ""),
          hhProd: 0,
          hhFalta: 0,
          rank: idx + 1,
        }));

        setBase(mapped);
      } catch (e: any) {
        console.error(e);
        setErro(e?.message || "Falha ao carregar equipe.");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();

    return () => {
      cancel = true;
    };
  }, [user]);

  // ----------------- Carregar catálogo de habilidades (TGFPRO) -----------------
  const carregarCatalogoHabilidades = async () => {
    if (catalogoHabs.length > 0) return;
    try {
      setCatalogoLoading(true);

      const sql = `
        SELECT CODPROD, DESCRPROD
          FROM TGFPRO
         WHERE USOPROD = 'S'
         ORDER BY DESCRPROD
      `.trim();

      const rows = await obterReg(sql);

      const list: SkillCatalogo[] = rows.map((r: any) => ({
        codprod: Number(r.CODPROD),
        descrprod: String(r.DESCRPROD ?? ""),
      }));

      setCatalogoHabs(list);
    } catch (e: any) {
      console.error("Erro ao carregar catálogo de habilidades:", e);
    } finally {
      setCatalogoLoading(false);
    }
  };

  // ----------------- Carregar habilidades do colaborador (AD_TFPFUNHAB) -----------------
  const carregarHabilidadesColaborador = async (codfunc: number) => {
    try {
      setSkillsLoading(true);
      setSkillsErro(null);

      const sql = `
        SELECT HAB.CODPRODSP,
               PRO.DESCRPROD,
               TO_CHAR(HAB.DTINCLUSAO, 'DD/MM/YYYY') AS DTINCLUSAO,
               HAB.NIVEL
          FROM AD_TFPFUNHAB HAB
          JOIN TGFPRO PRO ON PRO.CODPROD = HAB.CODPRODSP
         WHERE HAB.CODFUNC = ${codfunc}
         ORDER BY HAB.DTINCLUSAO DESC
      `.trim();

      const rows = await obterReg(sql);

      const list: SkillColaborador[] = rows.map((r: any) => ({
        codprod: Number(r.CODPRODSP),
        descrprod: String(r.DESCRPROD ?? ""),
        dtInclusao: String(r.DTINCLUSAO ?? ""),
        nivel: (String(r.NIVEL ?? "Básico") as SkillNivel) || "Básico",
      }));

      setSkillsMap((prev) => ({
        ...prev,
        [codfunc]: list,
      }));
    } catch (e: any) {
      console.error("Erro ao carregar habilidades:", e);
      setSkillsErro(e?.message || "Falha ao carregar habilidades.");
      setSkillsMap((prev) => ({ ...prev, [codfunc]: [] }));
    } finally {
      setSkillsLoading(false);
    }
  };

  // ----------------- Lista filtrada/ordenada -----------------
  const list = useMemo(() => {
    let data = [...base];

    if (q.trim()) {
      const k = q.trim().toLowerCase();
      data = data.filter(
        (c) =>
          c.nome.toLowerCase().includes(k) ||
          c.cargo.toLowerCase().includes(k) ||
          c.depto.toLowerCase().includes(k) ||
          c.senior.toLowerCase().includes(k)
      );
    }

    if (senior !== "Todos") {
      data = data.filter((c) => c.senior === senior);
    }

    data.sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      switch (sortKey) {
        case "rank":
          return (a.rank - b.rank) * dir;
        case "hhProd":
          return (a.hhProd - b.hhProd) * dir;
        case "hhFalta":
          return (a.hhFalta - b.hhFalta) * dir;
        case "nome":
          return a.nome.localeCompare(b.nome) * dir;
        default:
          return 0;
      }
    });

    return data;
  }, [base, q, senior, sortKey, sortAsc]);

  // ----------------- Exportar CSV -----------------
  const exportCsv = () => {
    const header = [
      "codfunc",
      "nome",
      "cargo",
      "departamento",
      "senioridade",
      "anos",
      "meses",
      "tempo_casa",
      "hh_produtivo",
      "hh_falta",
      "ranking",
    ];
    const rows = list.map((c) => [
      c.codfunc,
      c.nome,
      c.cargo,
      c.depto,
      c.senior,
      c.anos,
      c.meses,
      c.tempo,
      c.hhProd,
      c.hhFalta,
      c.rank,
    ]);

    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            if (s.includes(",") || s.includes('"') || s.includes("\n")) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `equipe_filtrada_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ---- Navegar para Alocação com colaborador pré-selecionado ----
  const irParaAlocacao = (c: MembroEquipe) => {
    const qs = new URLSearchParams({
      colabId: String(c.codfunc),
      colabNome: c.nome,
      cargo: c.cargo,
    }).toString();
    navigate(`/atividades/alocacao/OP-0000?${qs}`);
  };

  // ---- Navegar para Detalhes do Funcionário ----
  const irParaDetalhes = (c: MembroEquipe) => {
    navigate(`/equipe/${c.codfunc}`, {
      state: {
        membro: {
          codfunc: c.codfunc,
          nome: c.nome,
          cargo: c.cargo,
          depto: c.depto,
          senior: c.senior,
        },
      },
    });
  };

  // ----------------- Ações Habilidades -----------------
  const abrirHabilidades = (c: MembroEquipe) => {
    setSkillsOpenFor(c);
    setNewSkill({ codprod: "", nivel: "Básico" });
    setHabilidadeOpen(false);
    carregarHabilidadesColaborador(c.codfunc);
    carregarCatalogoHabilidades();
  };

  const fecharHabilidades = () => {
    setSkillsOpenFor(null);
    setSkillsErro(null);
    setSkillsLoading(false);
    setHabilidadeOpen(false);
  };

  // grava em AD_TFPFUNHAB via /api/sankhya/dataset/save
  const adicionarSkill = async (codfunc: number) => {
    if (!newSkill.codprod) return;

    const codprod = Number(newSkill.codprod);
    const cat = catalogoHabs.find((h) => h.codprod === codprod);
    if (!cat) return;

    const nivelDb = newSkill.nivel; // "Básico" | "Intermediário" | "Avançado"

    try {
      const payload = {
        entity: "AD_TFPFUNHAB",
        fields: ["CODFUNC", "CODPRODSP", "NIVEL"],
        values: {
          CODFUNC: codfunc,
          CODPRODSP: codprod,
          NIVEL: nivelDb,
        },
      };

      console.log("[EquipePage] Enviando DatasetSP.save:", payload);

      const resp = await api.post("/api/sankhya/dataset/save", payload);

      console.log("[EquipePage] Retorno DatasetSP.save:", resp.data);

      const status = resp.data?.STATUS;
      const retornoBruto = resp.data?.RETORNO;

      const sucesso =
        status === 1 ||
        status === "1" ||
        status === true ||
        status === "SUCCESS";

      if (!sucesso) {
        console.error(
          "[EquipePage] Inclusão em AD_TFPFUNHAB NÃO OK. STATUS:",
          status,
          "RETORNO:",
          retornoBruto
        );

        alert(
          "A API respondeu, mas o DatasetSP.save não indicou sucesso.\n" +
            `STATUS: ${String(status)}`
        );
        return;
      }

      // Se chegar aqui, consideramos que gravou no backend
      const novaHab: SkillColaborador = {
        codprod,
        descrprod: cat.descrprod,
        dtInclusao: new Date().toLocaleDateString("pt-BR"),
        nivel: newSkill.nivel,
      };

      setSkillsMap((prev) => ({
        ...prev,
        [codfunc]: [...(prev[codfunc] || []), novaHab],
      }));

      setNewSkill({ codprod: "", nivel: "Básico" });

      alert("Habilidade incluída com sucesso em AD_TFPFUNHAB.");
    } catch (e: any) {
      console.error(
        "[EquipePage] Erro ao chamar /api/sankhya/dataset/save:",
        e
      );
      alert(
        "Erro ao adicionar habilidade no Sankhya.\n" +
          (e?.response?.data?.erro || e?.message || "")
      );
    }
  };

  // por enquanto só remove da tela; depois dá pra plugar delete via DatasetSP
  const removerSkill = (codfunc: number, codprod: number) => {
    setSkillsMap((prev) => ({
      ...prev,
      [codfunc]: (prev[codfunc] || []).filter((s) => s.codprod !== codprod),
    }));
  };

  const habilidadeSelecionadaLabel = useMemo(() => {
    if (!newSkill.codprod) return "";
    const cod = Number(newSkill.codprod);
    const h = catalogoHabs.find((x) => x.codprod === cod);
    if (!h) return "";
    return `${h.codprod} - ${h.descrprod}`;
  }, [newSkill.codprod, catalogoHabs]);

  return (
    <div className="relative flex flex-col h-full">
      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome, cargo, depto ou senioridade…"
          className="w-72"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="flex items-center gap-2">
          <Button
            variant={senior === "Júnior" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setSenior(senior === "Júnior" ? "Todos" : "Júnior")
            }
          >
            Júnior
          </Button>
          <Button
            variant={senior === "Pleno" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setSenior(senior === "Pleno" ? "Todos" : "Pleno")
            }
          >
            Pleno
          </Button>
          <Button
            variant={senior === "Sênior" ? "default" : "outline"}
            size="sm"
            onClick={() =>
              setSenior(senior === "Sênior" ? "Todos" : "Sênior")
            }
          >
            Sênior
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSenior("Todos")}
            title="Limpar senioridade"
          >
            Todos
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortKey("rank")}
          >
            Rank
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortKey("hhProd")}
          >
            HH Prod
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortKey("hhFalta")}
          >
            HH Falta
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortKey("nome")}
          >
            Nome
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSortAsc((s) => !s)}
          >
            {sortAsc ? "Asc" : "Desc"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="gap-2"
            onClick={exportCsv}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>

          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
        </div>
      </div>

      {/* SCROLL da lista */}
      <div className="flex-1 overflow-y-auto pr-1 max-h-[calc(100vh-220px)]">
        {erro && <div className="mb-3 text-sm text-red-600">{erro}</div>}

        {loading ? (
          <div className="text-sm text-muted-foreground">
            Carregando equipe…
          </div>
        ) : (
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
            {list.map((c) => {
              const disp = disponibilidadeColor(c.hhFalta);
              return (
                <Card
                  key={c.codfunc}
                  className="hover:shadow-md transition relative text-sm"
                >
                  <span
                    className={`absolute right-3 top-3 h-2.5 w-2.5 rounded-full ${disp.dot}`}
                    title={`Disponibilidade: ${disp.label}`}
                  />
                  <CardHeader className="flex flex-row items-center gap-3 pb-2 pt-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage
                        src={fotoUrl(c.codfunc)}
                        alt={c.nome}
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (
                            e.currentTarget as HTMLImageElement
                          ).style.display = "none";
                        }}
                      />
                      <AvatarFallback>
                        {c.nome
                          .split(" ")
                          .map((s) => s[0])
                          .slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium leading-tight text-sm">
                          {c.nome}
                        </p>
                        <Badge
                          variant="secondary"
                          className="rounded-full text-[11px]"
                        >
                          {c.senior}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="rounded-full text-[11px]"
                        >
                          {disp.label}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {c.cargo} • {c.depto}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Tempo de casa:{" "}
                        <span className="font-medium">{c.tempo}</span>
                      </p>
                    </div>
                  </CardHeader>

                  <CardContent className="grid grid-cols-3 gap-3 pt-1 pb-3">
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        HH produtivo
                      </p>
                      <p className="font-semibold text-sm">{c.hhProd} h</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        HH falta
                      </p>
                      <p className="font-semibold text-sm">{c.hhFalta} h</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground">
                        Ranking
                      </p>
                      <p className="font-semibold text-sm">#{c.rank}</p>
                    </div>

                    <div className="col-span-3">
                      <Progress
                        value={Math.min(100, (c.hhProd / 160) * 100)}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Capacidade usada no mês
                      </p>
                    </div>

                    <div className="col-span-3 flex flex-wrap justify-between gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => irParaDetalhes(c)}
                      >
                        Detalhes{" "}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => abrirHabilidades(c)}
                        >
                          Habilidades
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1 text-xs"
                          onClick={() => irParaAlocacao(c)}
                        >
                          Alocar{" "}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== Modal/Aba de Habilidades ===== */}
      {skillsOpenFor && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={fecharHabilidades}
          />
          {/* Painel (side-sheet) */}
          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl border-l">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={fotoUrl(skillsOpenFor.codfunc)}
                    alt={skillsOpenFor.nome}
                    onError={(e) => {
                      (
                        e.currentTarget as HTMLImageElement
                      ).style.display = "none";
                    }}
                  />
                  <AvatarFallback>
                    {skillsOpenFor.nome
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-tight">
                    {skillsOpenFor.nome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {skillsOpenFor.cargo} • {skillsOpenFor.depto}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={fecharHabilidades}
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Conteúdo */}
            <div className="h-[calc(100%-64px)] overflow-y-auto p-4 space-y-6">
              {/* Aba: Habilidades */}
              <div className="space-y-2">
                <h4 className="font-semibold">Habilidades do colaborador</h4>
                <div className="rounded-2xl border divide-y">
                  <div className="grid grid-cols-12 px-3 py-2 text-xs text-muted-foreground">
                    <div className="col-span-7">Habilidade</div>
                    <div className="col-span-3">Nível / Desde</div>
                    <div className="col-span-2 text-right">Ações</div>
                  </div>

                  {skillsLoading ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">
                      Carregando habilidades…
                    </div>
                  ) : skillsErro ? (
                    <div className="px-3 py-4 text-sm text-red-600">
                      {skillsErro}
                    </div>
                  ) : (skillsMap[skillsOpenFor.codfunc] || []).length === 0 ? (
                    <div className="px-3 py-6 text-sm text-muted-foreground">
                      Nenhuma habilidade cadastrada ainda.
                    </div>
                  ) : (
                    (skillsMap[skillsOpenFor.codfunc] || []).map((s) => (
                      <div
                        key={`${s.codprod}-${s.dtInclusao}`}
                        className="grid grid-cols-12 items-center px-3 py-2 gap-2"
                      >
                        <div className="col-span-7">
                          <div className="font-medium text-sm">
                            {s.descrprod}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Cód. produto: {s.codprod}
                          </div>
                        </div>
                        <div className="col-span-3">
                          <Badge variant="outline" className="text-[11px]">
                            {s.nivel}
                          </Badge>
                          <p className="text-[11px] text-muted-foreground mt-1">
                            Desde: {s.dtInclusao}
                          </p>
                        </div>
                        <div className="col-span-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              removerSkill(
                                skillsOpenFor.codfunc,
                                s.codprod
                              )
                            }
                            title="Remover habilidade"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Form: nova habilidade */}
              <div className="space-y-2">
                <h4 className="font-semibold">Cadastrar nova habilidade</h4>
                <div className="grid grid-cols-12 gap-2 items-center">
                  {/* Combobox com Command + Popover */}
                  <div className="col-span-7">
                    <Popover
                      open={habilidadeOpen}
                      onOpenChange={setHabilidadeOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={habilidadeOpen}
                          className="w-full justify-between text-xs"
                          disabled={catalogoLoading}
                        >
                          {catalogoLoading
                            ? "Carregando habilidades…"
                            : habilidadeSelecionadaLabel ||
                              "Selecione ou pesquise a habilidade"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[420px] p-0 bg-white">
                        <Command>
                          <CommandInput placeholder="Buscar por código ou descrição..." />
                          <CommandList>
                            <CommandEmpty>
                              Nenhuma habilidade encontrada.
                            </CommandEmpty>
                            <CommandGroup>
                              {catalogoHabs.map((h) => (
                                <CommandItem
                                  key={h.codprod}
                                  value={`${h.codprod} - ${h.descrprod}`}
                                  onSelect={() => {
                                    setNewSkill((p) => ({
                                      ...p,
                                      codprod: String(h.codprod),
                                    }));
                                    setHabilidadeOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      Number(newSkill.codprod) === h.codprod
                                        ? "opacity-100"
                                        : "opacity-0"
                                    }`}
                                  />
                                  <span className="text-xs">
                                    {h.codprod} - {h.descrprod}
                                  </span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Nível */}
                  <div className="col-span-3">
                    <select
                      className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                      value={newSkill.nivel}
                      onChange={(e) =>
                        setNewSkill((p) => ({
                          ...p,
                          nivel: e.target.value as SkillNivel,
                        }))
                      }
                    >
                      <option value="Básico">Básico</option>
                      <option value="Intermediário">Intermediário</option>
                      <option value="Avançado">Avançado</option>
                    </select>
                  </div>

                  {/* Botão adicionar */}
                  <div className="col-span-2">
                    <Button
                      className="w-full gap-1 text-xs"
                      onClick={() =>
                        skillsOpenFor && adicionarSkill(skillsOpenFor.codfunc)
                      }
                      disabled={!newSkill.codprod}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  * As habilidades são carregadas do TGFPRO (USOPROD = &apos;S&apos;).
                  A inclusão é feita em <code>AD_TFPFUNHAB</code> via{" "}
                  <code>/api/sankhya/dataset/save</code>. Veja os detalhes no
                  console do navegador se algo não gravar.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
