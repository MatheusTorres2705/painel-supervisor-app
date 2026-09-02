# Roadmap de UI/UX — Painel Supervisor

Estado após a primeira fase do refactor (fundação de design, shell, Login e Dashboard).
Itens ordenados por relação impacto/esforço.

---

## O que já foi feito

- **Camada de tokens** (`src/index.css` + `tailwind.config.js`): paleta *Deep Ocean*
  (navy `#0B3D57` + teal `#14889B`). Antes, `theme.extend` estava vazio e
  **~451 classes semânticas** (`text-muted-foreground`, `bg-card`, `bg-primary`…)
  não geravam CSS nenhum — botões sem fundo, cards transparentes, e **nenhum
  indicador de foco visível no app inteiro**.
- **Tipografia**: Inter carregada, escala `text-2xs` (11px) oficializada,
  `.tabular` para números. `<html lang="pt-BR">`.
- **`tailwindcss-animate` instalado** — 18 classes de animação estavam mortas.
- **Codemod de cores**: 216 cores cruas (`slate`/`gray`/`zinc`) e 32 `bg-white`
  hardcoded migrados para tokens; 196 `text-[10px]`/`text-[11px]` para `text-2xs`;
  4 opacidades de scrim unificadas.
- **Primitivos corrigidos**: as duas reimplementações locais de `cn()` em
  `button.tsx` e `card.tsx` desligavam o `tailwind-merge` — removidas. `Badge`
  duplicado eliminado. Hardcodes forçados de `dialog.tsx`/`popover.tsx` removidos.
- **Novos**: `Skeleton`, `Alert`, `Toast`, `Field`, `Select`, `EmptyState`,
  `PageHeader`, `StatCard`, `AsyncBoundary`, `DataDialog`.
- **Shell** (`components/layout/AppShell.tsx`): rail navy com indicador teal,
  drawer mobile, rail colapsado em tablet, busca global ⌘K funcional,
  rota de layout com `<Outlet/>` (o par `ProtectedRoute`+`Layout` era repetido 9×).
  O shell é dono do scroll — os 5 `calc(100vh-Npx)` mágicos foram removidos.
- **Login** redesenhado (split-screen com painel de marca) e **Dashboard**
  (1526 → ~1370 linhas; 4 modais viraram um `DataDialog`; gauge reescrito).
- Resíduos deletados: `src/App.css`, `index.css` da raiz, `output.css` (build
  Tailwind v4 num projeto v3), `PainelSupervisorMock.tsx` (0 bytes).
  `.gitignore` preenchido — estava vazio.

---

## Segunda rodada — tela de Hora Extra

- **Reorganizada por evento.** A tela achatava o modelo do ERP (um cabeçalho
  `AD_BANCOHORAS` × N colaboradores em `AD_BCOFUN`): 20 pessoas numa noite
  viravam 20 linhas idênticas e 20 aprovações separadas. Agora cada turno é um
  card expansível — `src/components/hora-extra/EventoCard.tsx`.
- **Aprovação em lote**: checkbox por colaborador, "selecionar todos" do evento,
  barra fixa de ação e diálogo único com progresso e relatório de falhas.
- **Aritmética de horas** (`src/lib/horas.ts`): a tela toda era sobre hora extra
  e nunca calculava `fim − início`. O parser tolera `"22:32"`, `"2232"` e o
  número `800` (o Oracle devolve `"0800"` como `800`), e trata turno que vira o
  dia (22:00 → 02:00 = 4h00).
- **Faixa gerencial**: horas planejadas com variação vs. mês anterior, pendentes
  de aprovação, aprovadas, nº de colaboradores, distribuição por setor e ranking
  de acúmulo — `src/components/hora-extra/HoraExtraResumo.tsx`.
- **Filtros**: setor virou `<select>` com nome (antes exigia digitar o código),
  período passou a ser "por mês" **ou** "intervalo" (antes os dois filtros se
  sobrepunham no SQL e devolviam vazio sem explicar), busca por nome ganhou
  debounce de 400ms (antes cada tecla disparava um SELECT no Oracle) e todos os
  campos usam `<Field>` com `htmlFor`.
- **Ações novas**: reverter aprovação e editar o horário do turno.
- **Linguagem**: `CODDEP`/`DTUSO`/`HRINI`/`LIBERADO = "S"`/`AD_BCOFUN` saíram da
  interface; o retorno técnico do ERP ficou recolhido num `<details>`.

### Pendente: remover colaborador de um evento
Você pediu essa ação e ela **não foi implementada** — o backend expõe apenas
`/api/auth/login`, `/api/obter-reg` e `/api/sankhya/dataset/save`. Não há
endpoint de exclusão, e ele vive em outro projeto. Para destravar, o backend
precisa de um `dataset/remove` (ou equivalente) para `AD_BCOFUN` recebendo a PK
`{ CODBANCOHORAS, CODBCOHRFUN }`; a UI já tem o lugar natural para o botão, na
linha do colaborador dentro do `EventoCard`.

---

## Próximos passos

### 1. `<DataTable>` semântico nas 8 páginas restantes
O repo tem **zero `<table>`** e ~45 blocos `grid-cols-12` simulando tabelas
(a Hora Extra deixou de usá-los ao virar lista de eventos).
Leitores de tela recebem um amontoado de `div` sem relação linha/coluna.
Maior ganho isolado de acessibilidade e de redução de código.

### 2. Substituir as 26 `alert()` / `confirm()` pelo `Toaster`
`ToastProvider` já está montado em `App.tsx` e pronto — **ainda não consumido**.
Os piores casos são os de **sucesso**: `AlocacaoPage.tsx:999`
("Planejamento salvo com sucesso"), `FuncionarioDetalhePage.tsx:1192`,
`MateriaisPage.tsx:424`, `EquipePage.tsx:572`. Distribuição: `AlocacaoPage` 10,
`FuncionarioDetalhePage` 7, `MateriaisPage` 4, `EquipePage` 3, `AtividadesPage` 1.
Os `confirm()` de ação destrutiva (`FuncionarioDetalhePage.tsx:2244`,
`AlocacaoPage.tsx:1040`) pedem um `<ConfirmDialog>`.

### 3. Rotular todos os campos com `<Field>`
Ainda há `<label>` sem `htmlFor` e `<span>` fazendo papel de rótulo nas páginas
não revisadas, além de `<select>` nativos não rotulados. Login, Dashboard e
Hora Extra já usam `<Field>`. Também: a tab bar de
`FuncionarioDetalhePage.tsx:1414` não tem `role="tablist"`/`aria-selected` —
migrar para o `Tabs` do Radix.

### 4. Aplicar `AsyncBoundary` / `EmptyState` nas páginas restantes
Ainda existem ~34 strings `"Carregando…"` e 37 `"Nenhum…"` com 5 paddings
diferentes, e ~17 `{erro && <div className="text-sm text-destructive">}`
sem `role="alert"`.

### 5. Quebrar as páginas gigantes
`FuncionarioDetalhePage` 2295, `AlocacaoPage` 1812, `HoraExtraPage` 1601,
`EquipePage` 1071 linhas. Cada uma é uma única função com SQL, fetch, exportação
CSV/PDF, regra de negócio e ~500 linhas de JSX. **87% do código está em 10
arquivos de página.** `FuncionarioDetalhePage` sozinha tem 7 painéis de aba,
um gerador de PDF e 2 modais.

### 6. Camada de dados
32 chamadas `obterReg` com **SQL cru interpolado dentro dos componentes**
(`HoraExtraPage` já tem sanitizers `safeSqlLike`/`safeDigits`, o que indica a
superfície de injeção). Extrair para `src/services/` + hooks com
`@tanstack/react-query`, **instalado e nunca configurado**. Hoje não há cache,
retry nem deduplicação — cada página refaz tudo a cada montagem.
Aproveitar para consolidar os helpers já centralizados em `src/lib/format.ts`
(`toBR` estava definido 4× com 3 comportamentos diferentes para nulo;
`exportCsv`, 5×) e `src/lib/tone.ts` (7 mapeadores de status duplicados).

### 7. Remover os dados simulados do Dashboard
`mockKpis()` (`DashboardPage.tsx:237`) alimenta o KPI de hora extra e
`assValue = 87` alimenta o gauge de assiduidade. Ambos estão marcados com um
badge **"simulado"** na UI, mas precisam vir do ERP.

### 8. Tema escuro + modo TV
Os tokens já estão estruturados e `darkMode: ["class"]` está ligado — falta
popular o bloco `.dark` em `src/index.css` e adicionar o alternador.
Para painel de parede, um "modo apresentação": tipografia ampliada, alto
contraste, sem interação.

### 9. Trocar o calendário artesanal pelo `@fullcalendar`
`CalendarioPage.tsx` (686 linhas) faz month/week/day com aritmética de datas na
mão, enquanto `@fullcalendar/react` + daygrid + timegrid estão **instalados e
nunca usados**.

### 10. Limpeza de dependências
Mortas: `framer-motion`, `zustand` (o estado global é só o `AuthContext`), e
`@fullcalendar/*` caso o item 9 não avance.

### 11. Segurança / infra
- A URL de foto (`EquipePage.tsx:133` e `FuncionarioDetalhePage`, duplicada) usa
  `http://` — será bloqueada como mixed content assim que o app for servido em TLS.
- `node_modules/` está **rastreado no git** (o `.gitignore` estava vazio).
  Corrigir com `git rm -r --cached node_modules` num commit dedicado.
- `README.md` ainda é o template padrão do Vite.

### 12. Storybook + testes visuais dos primitivos
Não há suíte de testes nem Storybook. Com a camada de componentes agora
existindo, é o momento de fixar o comportamento visual.
