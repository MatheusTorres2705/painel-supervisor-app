// src/pages/EquipePage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { obterReg } from "@/lib/obterReg";
import { useAuth } from "@/auth/AuthProvider";
import { api } from "@/lib/api";

import { Card, CardContent } from "@/components/ui/card";
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
  ArrowUpDown,
} from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type SeniorFilter = "Todos" | "Júnior" | "Pleno" | "Sênior";
type SortKey = "rank" | "nome" | "cargo" | "depto" | "tempo" | "atingimento";

export type MembroEquipe = {
  id: number; // CODFUNC
  codfunc: number;
  nome: string;
  cargo: string;
  depto: string;
  senior: string;
  anos: number;
  meses: number;
  tempo: string;

  hhProd: number;
  hhFalta: number;

  // ✅ novo
  atingimento: number; // 0..100
  rank: number; // recalculado
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

function mapNivelToLabel(n: string | null | undefined): "Júnior" | "Pleno" | "Sênior" {
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

function atingimentoTone(p: number) {
  if (p >= 100) return { cls: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "Meta atingida" };
  if (p >= 80) return { cls: "bg-sky-50 text-sky-800 border-sky-200", label: "Dentro do esperado" };
  if (p > 0) return { cls: "bg-amber-50 text-amber-800 border-amber-200", label: "Abaixo do esperado" };
  return { cls: "bg-muted text-muted-foreground border-border", label: "Sem dados" };
}

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
  const [sortKey, setSortKey] = useState<SortKey>("atingimento");
  const [sortAsc, setSortAsc] = useState(false);

  // ----------------- Habilidades (por colaborador) -----------------
  const [skillsMap, setSkillsMap] = useState<Record<number, SkillColaborador[]>>({});
  const [skillsOpenFor, setSkillsOpenFor] = useState<MembroEquipe | null>(null);

  const [newSkill, setNewSkill] = useState<{ codprod: string; nivel: SkillNivel }>({
    codprod: "",
    nivel: "Básico",
  });

  const [catalogoHabs, setCatalogoHabs] = useState<SkillCatalogo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsErro, setSkillsErro] = useState<string | null>(null);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [habilidadeOpen, setHabilidadeOpen] = useState(false);

  // =========================
  // ✅ Carregar atingimento por colaborador (1 query p/ todos)
  // =========================
  const carregarAtingimentoEquipe = async (codfuncs: number[]) => {
    if (!codfuncs.length) return;

    const inList = codfuncs.join(",");

    const sql = `
      WITH
      AVANCO AS (
        SELECT
          FUN.CODFUNC,
          LEAST(100, GREATEST(0, ROUND(NVL(Snk_Dividir(SUM(APO.QTD), 8400) * 100, 0)))) AS AVANCO_PCT
        FROM TFPFUN FUN
        LEFT JOIN AD_DETALCRONOGRAMAFUNC APO ON APO.CODFUNC = FUN.CODFUNC
        WHERE FUN.CODFUNC IN (${inList})
        GROUP BY FUN.CODFUNC
      ),
      COMPORT AS (
        SELECT
          AV.CODFUNC,
          LEAST(100, GREATEST(0, ROUND(NVL((AVG(AV.PONTUACAO) / 5) * 100, 0)))) AS COMP_PCT
        FROM AD_TFPFUNAC AV
        WHERE AV.CODFUNC IN (${inList})
        GROUP BY AV.CODFUNC
      )
      SELECT
        F.CODFUNC,
        LEAST(
          100,
          GREATEST(
            0,
            ROUND(
              ( NVL(A.AVANCO_PCT, 0) + 0 + 0 + NVL(C.COMP_PCT, 0) ) / 4
            )
          )
        ) AS ATING_GERAL
      FROM (SELECT CODFUNC FROM TFPFUN WHERE CODFUNC IN (${inList})) F
      LEFT JOIN AVANCO A ON A.CODFUNC = F.CODFUNC
      LEFT JOIN COMPORT C ON C.CODFUNC = F.CODFUNC
    `.trim();

    const rows = await obterReg(sql);

    const map: Record<number, number> = {};
    for (const r of rows) {
      const id = Number(r.CODFUNC);
      const v = Math.max(0, Math.min(100, Number(r.ATING_GERAL ?? 0)));
      map[id] = Math.round(v);
    }

    setBase((prev) => {
      const next = prev.map((c) => ({
        ...c,
        atingimento: typeof map[c.codfunc] === "number" ? map[c.codfunc] : c.atingimento,
      }));

      // ✅ ranking por atingimento desc + nome
      const sorted = [...next].sort((a, b) => {
        if (b.atingimento !== a.atingimento) return b.atingimento - a.atingimento;
        return a.nome.localeCompare(b.nome);
      });

      const rankMap: Record<number, number> = {};
      sorted.forEach((c, i) => (rankMap[c.codfunc] = i + 1));

      return next.map((c) => ({ ...c, rank: rankMap[c.codfunc] ?? c.rank }));
    });
  };

  // ----------------- Carregar equipe -----------------
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
            AND FUN.SITUACAO <> '0'
        `.trim();

        const rows = await obterReg(sql);
        if (cancel) return;

        const mapped: MembroEquipe[] = rows.map((r: any) => ({
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
          atingimento: 0,
          rank: 0,
        }));

        setBase(mapped);

        const cods = mapped.map((x) => x.codfunc).filter(Boolean);
        await carregarAtingimentoEquipe(cods);
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

  // ----------------- Catálogo habilidades -----------------
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

      setCatalogoHabs(
        rows.map((r: any) => ({
          codprod: Number(r.CODPROD),
          descrprod: String(r.DESCRPROD ?? ""),
        }))
      );
    } catch (e: any) {
      console.error("Erro ao carregar catálogo de habilidades:", e);
    } finally {
      setCatalogoLoading(false);
    }
  };

  // ----------------- Habilidades do colaborador -----------------
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

      setSkillsMap((prev) => ({ ...prev, [codfunc]: list }));
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
        case "atingimento":
          return (a.atingimento - b.atingimento) * dir;
        case "nome":
          return a.nome.localeCompare(b.nome) * dir;
        case "cargo":
          return a.cargo.localeCompare(b.cargo) * dir;
        case "depto":
          return a.depto.localeCompare(b.depto) * dir;
        case "tempo":
          return a.anos !== b.anos ? (a.anos - b.anos) * dir : (a.meses - b.meses) * dir;
        default:
          return 0;
      }
    });

    return data;
  }, [base, q, senior, sortKey, sortAsc]);

  // ----------------- Exportar CSV -----------------
  const exportCsv = () => {
    const header = [
      "rank",
      "atingimento_geral",
      "codfunc",
      "nome",
      "cargo",
      "departamento",
      "senioridade",
      "tempo_casa",
    ];

    const rows = list.map((c) => [
      c.rank,
      c.atingimento,
      c.codfunc,
      c.nome,
      c.cargo,
      c.depto,
      c.senior,
      c.tempo,
    ]);

    const csv = [header, ...rows]
      .map((r) =>
        r
          .map((v) => {
            const s = String(v ?? "");
            if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
            return s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `equipe_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ---- Navegar para Alocação ----
  const irParaAlocacao = (c: MembroEquipe) => {
    const qs = new URLSearchParams({
      colabId: String(c.codfunc),
      colabNome: c.nome,
      cargo: c.cargo,
    }).toString();
    navigate(`/atividades/alocacao/OP-0000?${qs}`);
  };

  // ---- Navegar para Detalhes ----
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

  // ----------------- Habilidades -----------------
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

  const adicionarSkill = async (codfunc: number) => {
    if (!newSkill.codprod) return;

    const codprod = Number(newSkill.codprod);
    const cat = catalogoHabs.find((h) => h.codprod === codprod);
    if (!cat) return;

    try {
      const payload = {
        entity: "AD_TFPFUNHAB",
        fields: ["CODFUNC", "CODPRODSP", "NIVEL"],
        values: {
          CODFUNC: codfunc,
          CODPRODSP: codprod,
          NIVEL: newSkill.nivel,
        },
      };

      const resp = await api.post("/api/sankhya/dataset/save", payload);

      const status = resp.data?.STATUS;
      const ok = status === 1 || status === "1" || status === true || status === "SUCCESS";
      if (!ok) {
        alert(`Não gravou no Sankhya. STATUS: ${String(status)}`);
        return;
      }

      const nova: SkillColaborador = {
        codprod,
        descrprod: cat.descrprod,
        dtInclusao: new Date().toLocaleDateString("pt-BR"),
        nivel: newSkill.nivel,
      };

      setSkillsMap((prev) => ({ ...prev, [codfunc]: [...(prev[codfunc] || []), nova] }));
      setNewSkill({ codprod: "", nivel: "Básico" });
      alert("Habilidade incluída com sucesso.");
    } catch (e: any) {
      console.error(e);
      alert(e?.response?.data?.erro || e?.message || "Erro ao adicionar habilidade.");
    }
  };

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
    return h ? `${h.codprod} - ${h.descrprod}` : "";
  }, [newSkill.codprod, catalogoHabs]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((s) => !s);
    else {
      setSortKey(key);
      // padrão: atingimento desc, rank asc, resto asc
      if (key === "atingimento") setSortAsc(false);
      else if (key === "rank") setSortAsc(true);
      else setSortAsc(true);
    }
  };

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
          <Button variant={senior === "Júnior" ? "default" : "outline"} size="sm" onClick={() => setSenior(senior === "Júnior" ? "Todos" : "Júnior")}>
            Júnior
          </Button>
          <Button variant={senior === "Pleno" ? "default" : "outline"} size="sm" onClick={() => setSenior(senior === "Pleno" ? "Todos" : "Pleno")}>
            Pleno
          </Button>
          <Button variant={senior === "Sênior" ? "default" : "outline"} size="sm" onClick={() => setSenior(senior === "Sênior" ? "Todos" : "Sênior")}>
            Sênior
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSenior("Todos")}>
            Todos
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" className="gap-2" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>

          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filtros
          </Button>
        </div>
      </div>

      {/* Grade */}
      <Card className="flex-1 overflow-hidden">
        <CardContent className="p-0">
          {erro && <div className="p-3 text-sm text-red-600">{erro}</div>}

          {loading ? (
            <div className="p-4 text-sm text-muted-foreground">Carregando equipe…</div>
          ) : (
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
              {/* Header fixo */}
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] text-muted-foreground">
                  <button className="col-span-1 text-left inline-flex items-center gap-1" onClick={() => toggleSort("rank")}>
                    Rank <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-4 text-left inline-flex items-center gap-1" onClick={() => toggleSort("nome")}>
                    Colaborador <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("cargo")}>
                    Cargo <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("depto")}>
                    Depto <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-1 text-left inline-flex items-center gap-1" onClick={() => toggleSort("tempo")}>
                    Tempo <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <button className="col-span-2 text-left inline-flex items-center gap-1" onClick={() => toggleSort("atingimento")}>
                    Atingimento <ArrowUpDown className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Linhas */}
              <div className="divide-y">
                {list.map((c) => {
                  const disp = disponibilidadeColor(c.hhFalta);
                  const at = Math.max(0, Math.min(100, Number(c.atingimento || 0)));
                  const tone = atingimentoTone(at);

                  return (
                    <div
                      key={c.codfunc}
                      className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-muted/40 transition"
                    >
                      {/* Rank */}
                      <div className="col-span-1">
                        <Badge variant="outline" className="text-[11px]">
                          #{c.rank || "-"}
                        </Badge>
                      </div>

                      {/* Colaborador */}
                      <div className="col-span-4 flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9">
                          <AvatarImage
                            src={fotoUrl(c.codfunc)}
                            alt={c.nome}
                            referrerPolicy="no-referrer"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <AvatarFallback>
                            {c.nome.split(" ").map((s) => s[0]).slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium truncate max-w-[320px]">{c.nome}</p>
                            <Badge variant="secondary" className="rounded-full text-[10px]">
                              {c.senior}
                            </Badge>
                            <Badge variant="outline" className="rounded-full text-[10px]">
                              <span className={`mr-1 inline-block h-2 w-2 rounded-full ${disp.dot}`} />
                              {disp.label}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            COD {c.codfunc}
                          </p>
                        </div>
                      </div>

                      {/* Cargo */}
                      <div className="col-span-2">
                        <p className="text-xs font-medium">{c.cargo}</p>
                      </div>

                      {/* Depto */}
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">{c.depto}</p>
                      </div>

                      {/* Tempo */}
                      <div className="col-span-1">
                        <p className="text-xs text-muted-foreground">{c.tempo}</p>
                      </div>

                      {/* Atingimento + Ações */}
                      <div className="col-span-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className={`text-[10px] ${tone.cls}`}>
                            {at}%
                          </Badge>

                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]" onClick={() => irParaDetalhes(c)}>
                              Detalhes <ChevronRight className="h-3 w-3 ml-1" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px]" onClick={() => abrirHabilidades(c)}>
                              Habs
                            </Button>
                           
                          </div>
                        </div>

                        <div className="mt-2">
                          <Progress value={at} className="h-2" />
                          <p className="mt-1 text-[10px] text-muted-foreground">{tone.label}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!list.length && (
                  <div className="p-6 text-sm text-muted-foreground">
                    Nenhum colaborador encontrado com os filtros atuais.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== Side-sheet Habilidades ===== */}
      {skillsOpenFor && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={fecharHabilidades} />

          <div className="absolute right-0 top-0 h-full w-full max-w-lg bg-white shadow-xl border-l">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage
                    src={fotoUrl(skillsOpenFor.codfunc)}
                    alt={skillsOpenFor.nome}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <AvatarFallback>
                    {skillsOpenFor.nome.split(" ").map((s) => s[0]).slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium leading-tight">{skillsOpenFor.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {skillsOpenFor.cargo} • {skillsOpenFor.depto}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={fecharHabilidades} aria-label="Fechar">
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="h-[calc(100%-64px)] overflow-y-auto p-4 space-y-6">
              {/* Lista de habilidades */}
              <div className="space-y-2">
                <h4 className="font-semibold">Habilidades do colaborador</h4>

                <div className="rounded-2xl border divide-y">
                  <div className="grid grid-cols-12 px-3 py-2 text-xs text-muted-foreground">
                    <div className="col-span-7">Habilidade</div>
                    <div className="col-span-3">Nível / Desde</div>
                    <div className="col-span-2 text-right">Ações</div>
                  </div>

                  {skillsLoading ? (
                    <div className="px-3 py-4 text-sm text-muted-foreground">Carregando habilidades…</div>
                  ) : skillsErro ? (
                    <div className="px-3 py-4 text-sm text-red-600">{skillsErro}</div>
                  ) : (skillsMap[skillsOpenFor.codfunc] || []).length === 0 ? (
                    <div className="px-3 py-6 text-sm text-muted-foreground">Nenhuma habilidade cadastrada ainda.</div>
                  ) : (
                    (skillsMap[skillsOpenFor.codfunc] || []).map((s) => (
                      <div key={`${s.codprod}-${s.dtInclusao}`} className="grid grid-cols-12 items-center px-3 py-2 gap-2">
                        <div className="col-span-7">
                          <div className="font-medium text-sm">{s.descrprod}</div>
                          <div className="text-[11px] text-muted-foreground">Cód. produto: {s.codprod}</div>
                        </div>
                        <div className="col-span-3">
                          <Badge variant="outline" className="text-[11px]">{s.nivel}</Badge>
                          <p className="text-[11px] text-muted-foreground mt-1">Desde: {s.dtInclusao}</p>
                        </div>
                        <div className="col-span-2 text-right">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => removerSkill(skillsOpenFor.codfunc, s.codprod)}
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

              {/* Nova habilidade */}
              <div className="space-y-2">
                <h4 className="font-semibold">Cadastrar nova habilidade</h4>

                <div className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-7">
                    <Popover open={habilidadeOpen} onOpenChange={setHabilidadeOpen}>
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
                            : habilidadeSelecionadaLabel || "Selecione ou pesquise a habilidade"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent className="w-[420px] p-0 bg-white">
                        <Command>
                          <CommandInput placeholder="Buscar por código ou descrição..." />
                          <CommandList>
                            <CommandEmpty>Nenhuma habilidade encontrada.</CommandEmpty>
                            <CommandGroup>
                              {catalogoHabs.map((h) => (
                                <CommandItem
                                  key={h.codprod}
                                  value={`${h.codprod} - ${h.descrprod}`}
                                  onSelect={() => {
                                    setNewSkill((p) => ({ ...p, codprod: String(h.codprod) }));
                                    setHabilidadeOpen(false);
                                  }}
                                >
                                  <Check
                                    className={`mr-2 h-4 w-4 ${
                                      Number(newSkill.codprod) === h.codprod ? "opacity-100" : "opacity-0"
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

                  <div className="col-span-3">
                    <select
                      className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                      value={newSkill.nivel}
                      onChange={(e) => setNewSkill((p) => ({ ...p, nivel: e.target.value as SkillNivel }))}
                    >
                      <option value="Básico">Básico</option>
                      <option value="Intermediário">Intermediário</option>
                      <option value="Avançado">Avançado</option>
                    </select>
                  </div>

                  <div className="col-span-2">
                    <Button
                      className="w-full gap-1 text-xs"
                      onClick={() => skillsOpenFor && adicionarSkill(skillsOpenFor.codfunc)}
                      disabled={!newSkill.codprod}
                    >
                      <Plus className="h-4 w-4" />
                      Add
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  * TGFPRO (USOPROD = 'S') • grava em <code>AD_TFPFUNHAB</code> via{" "}
                  <code>/api/sankhya/dataset/save</code>.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
