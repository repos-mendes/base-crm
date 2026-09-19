# Base CRM — Plano de execução

> Documento vivo. Consolida as decisões tomadas sobre o `prompt-crm-leads.md` (a especificação original).
> Onde este plano diverge da especificação, a divergência é intencional e está justificada em `ARCHITECTURE.md`.

**Última atualização:** 2026-09-19

---

## 1. Decisões consolidadas

| Tema | Decisão |
|---|---|
| Nome do produto | **Base CRM** (provisório, centralizado em `packages/config/brand.ts`; checar marca antes do lançamento comercial) |
| Formato | **Webapp independente** (produto) + **extensão de navegador** (complemento do operador no WhatsApp Web) |
| Hospedagem | **100% nuvem, sem VPS**: Cloudflare (app, borda, filas, arquivos) + Supabase (banco, auth, realtime) |
| Next.js | **16.3.x**, versão exata travada no `package.json` |
| WhatsApp por API | **Fora do escopo inicial.** Estrutura pré-pronta (interfaces, stubs, tabelas, tela desativada) |
| CV CRM | **Fora do escopo inicial.** Interface + adapter em modo simulação |
| Extensão | Barra lateral de **contexto do lead** ao lado da conversa. Não lê nem envia conteúdo de mensagens |
| Ordem das fases | Núcleo → Extensão → Operação (filas, importação, distribuição) → Integrações reais |
| Lead duplicado de outro operador | **Erro neutro, sem revelar dados**, + notificação ao Coordenador (`SCHEMA.md` §5) |
| `last_contact_at` | **Só por ação explícita** (`contato_iniciado`); abrir a conversa não conta (`EXTENSION.md` §6) |
| Tela inicial do Coordenador | **Kanban**, com o Painel de Fluxo na aba ao lado (`DESIGN.md` §6) |
| Paleta e tipografia | **Aprovadas em 2026-09-19** sem alteração (`DESIGN.md` §2 e §3); tokens em `DESIGN.md` §11 |

---

## 2. Escopo inicial

**Entra**
- CRM de registro e acompanhamento de leads: Kanban, card lateral, anotações, histórico (`lead_events`), papéis e permissões, auditoria.
- Pipelines e etapas configuráveis pelo Gestor.
- Botão de contato rápido (WhatsApp Web no desktop, app no celular) com templates de mensagem.
- Responsividade completa + PWA.
- Extensão de navegador com barra lateral no `web.whatsapp.com`.
- Estrutura pré-pronta de integrações:
  - interfaces `MessagingProvider` e `ExternalCrmAdapter`;
  - adapter `mock` funcional; adapters `meta_cloud`, `evolution` e `cvcrm` como esqueleto;
  - tabelas `conversations`, `messages`, `integration_configs`, `outbox_events`;
  - tela de integrações visível com provedores desativados.

**Fica para depois**
- Envio e recebimento de mensagens por API (Meta Cloud API ou Evolution).
- Sincronização real com o CV CRM.

---

## 3. Stack

### 3.1 Hospedagem e serviços
| Camada | Serviço |
|---|---|
| App (UI + API tRPC) | Cloudflare Workers com Next.js 16.3 via `@opennextjs/cloudflare` |
| Banco | Supabase Postgres + Row Level Security |
| Auth | Supabase Auth (claims de organização e papel via Custom Access Token Hook; MFA TOTP para Gestor) |
| Realtime | Supabase Realtime (Broadcast em canais privados + Presence) |
| Conexão app → banco | Cloudflare Hyperdrive → Supabase Postgres |
| Arquivos | Cloudflare R2 |
| Jobs (a partir da Fase 3) | Cloudflare Queues + Workflows + Cron Triggers |
| DNS, TLS, WAF, CDN | Cloudflare |
| Observabilidade | Workers Logs (JSON estruturado) + Sentry (`@sentry/cloudflare`) |
| E-mail transacional | Resend |
| CI/CD | GitHub Actions → preview por PR na Cloudflare; migrations aplicadas no Supabase |
| Planos | Cloudflare Workers Paid + Supabase Pro em produção (Free durante o desenvolvimento) |

### 3.2 Webapp
- Next.js 16.3 (App Router) · React 19 · TypeScript strict
- Tailwind CSS v4 · shadcn/ui como base, re-estilizado conforme `DESIGN.md`
- `@dnd-kit/core` + `@dnd-kit/sortable` (Kanban)
- TanStack Table + TanStack Virtual (listas e colunas virtualizadas)
- tRPC (fetch adapter) + TanStack Query
- Drizzle ORM (schema, migrations, policies RLS)
- React Hook Form + Zod · `nuqs` (filtros na URL)
- `motion` (transições) · `cmdk` (paleta de comandos) · `sonner` (toasts)
- Tiptap (anotações com menção) · Recharts (painéis)
- Serwist (PWA / service worker) · `libphonenumber-js` (E.164)
- `next-themes` (tema claro/escuro)

### 3.3 Extensão
- **WXT** (Vite + React + TypeScript), Manifest V3, Chrome e Edge
- **Chrome Side Panel API** para a interface (fora do DOM do WhatsApp)
- Content script mínimo, apenas para identificar a conversa ativa
- Auth compartilhada com o webapp via `externally_connectable`
- Reaproveita `packages/ui` e `packages/core`
- Publicação não listada na Chrome Web Store (e Edge Add-ons)

### 3.4 Qualidade
- Vitest (unitário e integração contra Supabase local)
- Playwright (E2E do webapp e da extensão com fixtures de DOM)
- ESLint + Prettier + **lint de vocabulário de nicho** no CI
- Dev local: Supabase CLI + `wrangler dev` / `next dev`

### 3.5 Monorepo (pnpm + Turborepo)
```
apps/
  web/           Next.js 16.3 → Cloudflare Workers
  extension/     WXT → barra lateral do WhatsApp Web
  jobs/          Worker de Queues/Workflows/Cron (criado na Fase 3)
packages/
  db/            Drizzle schema, migrations, policies RLS, seed
  core/          Policy engine, regras de domínio, motor de distribuição (sem I/O)
  integrations/  MessagingProvider, ExternalCrmAdapter, adapters mock/stub
  ui/            Design tokens e componentes (web + extensão)
  config/        brand.ts, eslint, tsconfig, lista de vocabulário proibido
supabase/        config local, hooks de auth, seeds
docs/            contratos de integração (*.contract.md)
```

---

## 4. Roadmap

### Etapa 0 — Documentos de decisão (concluída e aprovada em 2026-09-19)
- [x] `ARCHITECTURE.md` — decisões, trade-offs, divergências da spec
- [x] `SCHEMA.md` — modelo final com índices, constraints e RLS (§5 decidido em 2026-09-19)
- [x] `DESIGN.md` — plano de design revisado contra os anti-padrões (§6 decidido e paleta aprovada em 2026-09-19)
- [x] `EXTENSION.md` — detecção da conversa, permissões, auth, riscos (§6 decidido em 2026-09-19)

### Etapa 1 — Fundação
- [ ] Monorepo (pnpm + Turborepo), TypeScript strict, ESLint, Prettier
- [ ] **Spike de deploy**: Next.js 16.3 + OpenNext na Cloudflare, Hyperdrive + RLS, Supabase Auth
- [ ] Supabase local (CLI) e projeto remoto de staging
- [ ] Wrangler: bindings de Hyperdrive, R2 e secrets por ambiente
- [ ] Drizzle: schema base, migrations, policies RLS, seed com dados neutros
- [ ] `brand.ts` ("Base CRM") e lint de vocabulário no CI
- [ ] Design tokens (`DESIGN.md` §11, já aprovados) e Instrument Sans em `packages/ui`
- [ ] GitHub Actions: lint, typecheck, testes, build, preview por PR

### Fase 1 — Núcleo do CRM
- [ ] Auth (login, convite, MFA opcional para Gestor), troca de organização ativa
- [ ] Policy engine `can(user, action, subject)` com a matriz completa da spec §4
- [ ] Multi-tenant com RLS + guardas de invariantes no banco
- [ ] CRUD de lead: E.164, deduplicação, `custom_fields` validados pelo schema da organização
- [ ] Pipelines e etapas: criar, renomear, reordenar, arquivar, SLA, `requires_reason`
- [ ] `lead_events` append-only + `audit_logs` com diff em toda escrita
- [ ] Kanban: drag-and-drop, colunas virtualizadas, update otimista com rollback, modal de motivo, filtros na URL, densidade
- [ ] Realtime do Kanban (Supabase Realtime) com replay por `event_id`
- [ ] Card lateral: Resumo, Anotações (Tiptap, menção, fixar), Histórico filtrável
- [ ] Botão de contato rápido + templates com variáveis + evento `contato_iniciado`
- [ ] Coordenador: Kanban como tela inicial + aba **Fluxo** (versão inicial: lista de eventos com trilhos, sem animação avançada)
- [ ] Responsividade (desktop, tablet, mobile por etapa) + PWA instalável
- [ ] Paleta de comandos (`Ctrl/Cmd+K`), atalhos `N` e `/`, estados vazios
- [ ] Estrutura pré-pronta de integrações (interfaces, mock, stubs, tabelas, tela desativada)

### Fase 2 — Extensão WhatsApp Web
- [ ] Protótipo de detecção da conversa ativa (validação de risco, 2–3 dias)
- [ ] Conexão da extensão com a conta do webapp
- [ ] Side panel: card do lead, etapa, anotações, histórico recente, mudar etapa
- [ ] Vínculo conversa ↔ lead (automático pela URL, detectado na página, ou manual)
- [ ] Eventos `conversa_aberta` / `conversa_vinculada` + botão **Registrar contato** (`EXTENSION.md` §6)
- [ ] Sincronização em tempo real com o webapp
- [ ] Publicação não listada na Chrome Web Store

### Fase 3 — Operação
- [ ] Filas: CRUD, horário comercial, fallback, alocação e peso de operadores
- [ ] Disponibilidade do operador (disponível/pausado) + Presence
- [ ] Motor de distribuição (4 estratégias + modificadores), puro e testado
- [ ] Importação de planilha em 5 passos (leitura no navegador, processamento em Workflows) + desfazer em 1h
- [ ] Redistribuição em massa com motivo obrigatório
- [ ] Painéis por operador e por fila, histórico de distribuições, exportação CSV

### Fase 4 — Integrações reais
- [ ] Meta Cloud API (webhooks nos Workers) e/ou Evolution API (container gerenciado separado)
- [ ] Inbox de conversas no card, templates de mensagem, fila de saída com rate limit
- [ ] Adapter CV CRM com mapeamento de status bidirecional, outbox, DLQ, modo simulação
- [ ] Automações por regra, relatórios agendados, API pública com chave por organização

---

## 5. Critérios de aceite por fase

**Fase 1**
- Operador não lê nem altera lead de outro operador por nenhuma rota ou chamada direta.
- Coordenador não move card nem cria etapa.
- Gestor cria, renomeia, reordena e arquiva etapa sem migration e sem deploy.
- Movimentação de um usuário aparece na tela de outro em menos de 1 segundo.
- Histórico reconstrói a linha do tempo completa a partir de `lead_events`.
- Botão de WhatsApp abre `web.whatsapp.com` no desktop e o app no celular, com template preenchido.
- Coluna com 2.000 cards rola a 60fps.
- Zero vocabulário de nicho em schema, rotas, componentes ou labels (lint no CI).
- Auditoria em 100% das ações de escrita, com diff.

**Fase 2**
- Conversa aberta a partir do botão do CRM é vinculada ao lead automaticamente.
- Mudança de etapa feita na barra lateral aparece no Kanban em menos de 1 segundo, e vice-versa.
- A barra respeita a mesma matriz de permissões do webapp.
- Falha de detecção nunca bloqueia o uso: cai para busca e vínculo manual.

**Fase 3**
- Planilha de 10.000 linhas importa, valida e distribui entre 3 filas e 12 operadores; a prévia bate com o resultado gravado.
- Desfazer reverte 100% das atribuições do lote e preserva os leads.

**Fase 4**
- Trocar `MessagingProvider` de `meta_cloud` para `evolution` é configuração, não código.
- Adapter do CV CRM roda em simulação sem credencial e loga os payloads.

---

## 6. Riscos acompanhados

| Risco | Mitigação |
|---|---|
| Compatibilidade Next.js 16.3 + OpenNext na Cloudflare | Spike de deploy no primeiro dia da Etapa 1 |
| RLS por transação através do Hyperdrive | Validar no spike; plano B documentado em `ARCHITECTURE.md` |
| Limite de bundle/memória dos Workers | Monitorar tamanho no CI; importação pesada lida no navegador |
| Detecção da conversa ativa no WhatsApp Web | Estratégia em camadas + protótipo antes da UI + seletores como configuração remota |
| Revisão da Chrome Web Store | Permissões mínimas, publicação não listada, política de privacidade |
| Termos de uso do WhatsApp (extensão) | Extensão não automatiza, não envia e não lê conteúdo de mensagens |
| Nome "Base CRM" já usado no passado por outro produto | Checagem de marca antes do lançamento; troca em um arquivo |

---

## 7. Regras de condução (da spec §13)

1. Documentos da Etapa 0 aprovados antes de codar.
2. Ao fim de cada fase: testes passando, seed realista, README atualizado, demo navegável.
3. Testes obrigatórios: policy engine (matriz inteira), motor de distribuição, fluxo de importação, E2E do operador.
4. Parar e perguntar quando uma decisão prender o produto a um nicho ou faltar contrato oficial de API externa.
