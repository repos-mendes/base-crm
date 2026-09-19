# Base CRM — Arquitetura

> Status: **rascunho para aprovação** (Etapa 0).
> Complementa `PLANO.md` (o quê e quando) e `SCHEMA.md` (dados). Este documento registra **como** e **por quê**.

---

## 1. Visão geral

O Base CRM é um **webapp independente** (o produto) com uma **extensão de navegador** como complemento para o operador que trabalha no WhatsApp Web. Toda a infraestrutura é gerenciada: Cloudflare na borda e na computação, Supabase nos dados.

```
 Navegador / PWA (desktop, tablet, celular)        Chrome/Edge + web.whatsapp.com
 ┌─────────────────────────────────────┐          ┌──────────────────────────────┐
 │ Base CRM Web                        │          │ Extensão (WXT, MV3)          │
 │ Kanban, card, anotações, painéis    │          │ Side panel: contexto do lead │
 └───────┬───────────────────┬─────────┘          └───────┬──────────────┬───────┘
         │ tRPC (HTTPS)      │ WebSocket                  │ tRPC         │ WebSocket
         ▼                   │                            ▼              │
 ┌───────────────────────────┼────────────────────────────────────┐      │
 │ Cloudflare                │                                    │      │
 │  Workers: Next.js 16.3 (OpenNext) — UI SSR, tRPC, webhooks     │      │
 │  Hyperdrive (pool) · R2 (arquivos) · Queues/Workflows/Cron*    │      │
 └───────────┬───────────────┼────────────────────────────────────┘      │
             │ SQL           │                                           │
             ▼               ▼                                           ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │ Supabase                                                                     │
 │  Postgres (schema app, RLS, triggers) · Auth (JWT + claims) · Realtime       │
 └──────────────────────────────────────────────────────────────────────────────┘
             ▲
             │ (Fase 4) gateway de mensagens / CV CRM via adapters
```
\* Queues, Workflows e Cron entram na Fase 3.

---

## 2. Decisões e trade-offs

### ADR-01 — Webapp como produto, extensão como complemento
- **Decisão:** o webapp concentra dados, regras e gestão. A extensão é uma janela de contexto no WhatsApp Web.
- **Por quê:** extensão não roda no celular, não serve para gestão em tela cheia e fica refém de mudanças no DOM do WhatsApp. Se a extensão quebrar, o produto continua funcionando.
- **Trade-off:** duas bases de UI. Mitigado com `packages/ui` e `packages/core` compartilhados.

### ADR-02 — 100% nuvem: Cloudflare Workers + Supabase
- **Decisão:** sem VPS e sem containers no escopo inicial.
- **Por quê:** o usuário não quer administrar servidor. Sem Evolution API no início, nada exige processo contínuo.
- **Trade-off:** limites de CPU, memória (128 MB) e bundle dos Workers; dependência de primitivas da Cloudflare (Queues, Workflows). Mitigações: lógica de domínio pura em `packages/core` (portável), leitura de planilhas no navegador, spike de deploy na Etapa 1.
- **Saída de emergência:** o app Next.js e o `packages/core` rodam em Node sem alteração. Se a Cloudflare deixar de servir, migra-se para uma plataforma de containers gerenciados (Railway/Render) trocando só o adapter de deploy e as filas.

### ADR-03 — Next.js 16.3 via `@opennextjs/cloudflare`
- **Decisão:** Next.js 16.3.x com versão exata travada.
- **Por quê:** linha estável atual e em Active LTS; o adapter OpenNext suporta todas as versões 16.x; a Adapter API estável (16.2) reduz risco fora da Vercel.
- **Divergência da spec:** a spec pedia Next.js 15. Justificativa registrada aqui e no README.
- **Validação:** spike de deploy no primeiro dia da Etapa 1 (SSR, route handlers, `proxy.ts`, imagens, tamanho do bundle).

### ADR-04 — Supabase Postgres com schema `app` fora da Data API
- **Decisão:** as tabelas do produto ficam no schema `app`, **não exposto** pela Data API (PostgREST) do Supabase. O cliente nunca consulta tabelas diretamente; todo acesso a dados passa pelo tRPC.
- **Por quê:** evita uma segunda superfície de API que contornaria as regras de ação (ex.: Coordenador não move card). O `supabase-js` no cliente é usado apenas para **Auth** e **Realtime**.
- **Trade-off:** perdemos consultas diretas do cliente (que não queremos).
- **Versão do Postgres:** a oferecida pelo Supabase para projetos novos (a spec citava 16; não há dependência de recurso específico dessa versão). UUID v7 é gerado na aplicação.

### ADR-05 — Acesso a dados: Drizzle via Hyperdrive, RLS por transação
- **Decisão:** o Worker conecta ao Supabase pela **conexão direta** (não pelo pooler do Supabase) através do Hyperdrive, que faz o pooling em modo transação. Cada request autenticado executa suas queries dentro de uma transação que define o contexto:
  ```sql
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '<claims do JWT validado>', true);
  select set_config('app.request_ip', '<ip>', true);
  -- queries do request
  commit;
  ```
- **Por quê:** o RLS do Postgres é aplicado mesmo que haja um bug no código da API. `set local`/`set_config(..., true)` só vivem dentro da transação, o que é compatível com pooling em modo transação.
- **Operações de sistema** (seed, jobs, webhooks sem usuário) usam um cliente separado com role de serviço, restrito a `packages/db/system.ts` e auditado.
- **Validação:** confirmar no spike que `set local role` funciona através do Hyperdrive. Plano B: role dedicada sem `BYPASSRLS` + policies baseadas apenas em `current_setting('request.jwt.claims')`.

### ADR-06 — Três camadas de autorização
| Camada | Onde | O que garante |
|---|---|---|
| 1. Policy engine | `packages/core/policy` — `can(member, action, subject)` | Matriz de ações da spec §4. Usada no middleware do tRPC **e** na UI (esconder o que não pode) |
| 2. RLS | Postgres | Isolamento por organização e visibilidade de linha (Operador só vê os próprios leads) |
| 3. Guardas no banco | Triggers | Invariantes críticas: `lead_events` append-only; mudança de etapa só por Operador dono ou Gestor; `organization_id` imutável |

- **Por quê:** o critério de aceite exige que o Operador não acesse lead alheio "por nenhuma rota ou chamada direta". Uma camada sozinha não prova isso.
- **Proibido:** `if (role === 'gestor')` espalhado. Toda checagem passa por `can()`.
- **Testes:** a matriz inteira da spec §4 vira uma tabela de casos em Vitest (camada 1) e um conjunto de testes de integração contra o Supabase local (camadas 2 e 3).

### ADR-07 — Supabase Auth com claims de organização
- **Decisão:** Supabase Auth. Um **Custom Access Token Hook** (função Postgres) adiciona ao JWT: `org_id` (organização ativa), `member_id` e `role`.
- **Por quê:** o RLS lê as claims direto do JWT; MFA TOTP nativo para o Gestor; login compartilhado com a extensão.
- **Divergência da spec:** a spec sugeria Better Auth ou Auth.js.
- **Multi-organização:** um usuário de autenticação pode ser membro de várias organizações (`app.members`). Trocar de organização atualiza a organização ativa e força refresh do token.
- **Mudança de papel:** refresh forçado do token; o middleware do tRPC também revalida o papel no banco em ações sensíveis, para não depender só da validade do JWT.
- **Sessão no webapp:** cookies via `@supabase/ssr` (httpOnly onde o fluxo permite).

### ADR-08 — Realtime por Broadcast disparado no banco
- **Decisão:** um trigger `after insert` em `app.lead_events` publica um evento via `realtime.send()` em **canais privados**. O cliente assina o canal e reconcilia o estado local.
- **Tópicos (evitam vazar dados entre operadores):**
  | Tópico | Quem pode assinar | Recebe |
  |---|---|---|
  | `org:<org_id>:supervisao` | Coordenador, Gestor | Todos os eventos da organização |
  | `member:<member_id>` | O próprio membro | Eventos dos leads atribuídos a ele (inclusive quando perde a atribuição) |
  | `org:<org_id>:config` | Todos os membros | Mudanças de pipeline/etapas (sem dados de lead) |
- A autorização de assinatura é feita por policies RLS em `realtime.messages`, lendo as claims do JWT.
- **Payload mínimo:** `event_id`, `lead_id`, `type`, campos de posição (etapa, responsável). Dados sensíveis são buscados via tRPC quando necessário.
- **Presence:** canal `org:<org_id>:presenca` para disponibilidade dos operadores (Fase 3).
- **Replay:** `event_id` é UUID v7 (ordenável). O cliente guarda o último recebido; ao reconectar, chama `events.since(event_id)` (filtrado por RLS) e aplica o que perdeu.
- **Por quê:** a mudança chega a todos em < 1 s sem servidor de WebSocket próprio, e qualquer escrita que gere evento é transmitida, venha de onde vier.
- **Divergência da spec:** a spec sugeria Socket.io ou Pusher/Ably.

### ADR-09 — Escrita de domínio: evento + auditoria na mesma transação
- Cada mutação de domínio (mover etapa, atribuir, anotar) é um **caso de uso** em `apps/web/server/use-cases/*` que, na mesma transação: valida com `can()`, altera a entidade, insere em `lead_events`.
- **Auditoria genérica por trigger:** um trigger `audit_row()` em todas as tabelas de escrita grava `audit_logs` com `actor_id` (das claims), ação, `subject_type`, `subject_id`, diff (old/new em JSONB, só campos alterados) e IP (`app.request_ip`). Garante 100% de cobertura mesmo para escritas fora dos casos de uso.
- **Update otimista no cliente:** TanStack Query aplica a mudança, envia a mutação, faz rollback em erro; o evento realtime confirma e reconcilia.

### ADR-10 — Campos customizados
- `organizations.custom_field_schema` (JSONB) versionado: `{ version, fields: [{ key, label, type, required, options, archived }] }`.
- No servidor, o schema é convertido em um validador Zod e aplicado em toda escrita de `leads.custom_fields`.
- Campos nunca são apagados, só arquivados, para não invalidar dados antigos.
- Índice GIN em `leads.custom_fields` para filtros.

### ADR-11 — Estrutura pré-pronta de integrações
- `packages/integrations/messaging`: interface `MessagingProvider` (conforme spec §7), `MockMessagingProvider` funcional (simula envio, status e webhook de entrada) e esqueletos `MetaCloudProvider` e `EvolutionProvider` que lançam `NotImplementedError` com referência ao contrato pendente.
- `packages/integrations/external-crm`: interface `ExternalCrmAdapter` (spec §8) e `CvCrmAdapter` em **modo simulação** (loga payloads, não chama rede).
- `packages/integrations/registry.ts`: resolve o provider pela `integration_configs` da organização — trocar de provider é configuração.
- Contratos não confirmados ficam em `docs/meta-cloud.contract.md`, `docs/evolution.contract.md` e `docs/cvcrm.contract.md`. **Nenhum endpoint é inventado.**
- Credenciais: AES-256-GCM via Web Crypto, chave em Workers Secrets, com versão da chave no registro para permitir rotação.
- Tela de integrações visível para o Gestor com provedores desativados e o aviso sobre provedores não oficiais.

### ADR-12 — Jobs e processamento assíncrono (Fase 3)
| Necessidade | Primitiva |
|---|---|
| Importação e distribuição em lotes, desfazer | Cloudflare **Workflows** (passos duráveis com retry) |
| Envio/sincronização com retry e DLQ | Cloudflare **Queues** |
| Abertura de filas, expiração do desfazer, varredura do outbox | **Cron Triggers** |
| Leitura de planilhas | No **navegador** (SheetJS em Web Worker); o arquivo original vai para o R2 |

- **Outbox:** a transação grava em `outbox_events`; após o commit o app publica na Queue; um cron varre registros pendentes para cobrir falhas entre commit e publicação.
- **Divergência da spec:** a spec pedia Redis + BullMQ, que exigem processo Node contínuo.

### ADR-13 — Extensão com Side Panel API
Detalhada em `EXTENSION.md`. Resumo: WXT + React, interface no `chrome.sidePanel` (fora do DOM do WhatsApp), content script mínimo para detectar a conversa ativa, seletores de detecção entregues como **configuração** pela API (dados, não código), auth compartilhada com o webapp.

### ADR-14 — Marca centralizada e neutralidade de nicho
- `packages/config/brand.ts` exporta nome, descrição curta e metadados. Nenhum outro arquivo escreve "Base CRM".
- `packages/config/forbidden-terms.ts` + script `pnpm lint:vocab` varre schema, rotas, componentes, labels e mensagens; falha o CI em qualquer termo de nicho.

---

## 3. Estrutura do código

```
apps/web/
  app/                      rotas (App Router)
    (auth)/                 login, convite, MFA
    (app)/kanban/           board + card lateral (rota paralela)
    (app)/movimentacao/     painel do Coordenador
    (app)/leads/            visão em tabela
    (app)/configuracoes/    pipelines, etapas, campos, usuários, integrações
    api/trpc/[trpc]/        handler tRPC
    api/webhooks/[kind]/    webhooks (estrutura, Fase 4)
  server/
    trpc/                   routers, middleware (auth, org, can, rate limit)
    use-cases/              mutações de domínio transacionais
    db.ts                   cliente Drizzle com contexto RLS
  features/                 UI por domínio (kanban, lead-panel, notes, history…)
packages/core/
  policy/                   matriz, can(), testes da matriz inteira
  domain/                   tipos, eventos, regras de etapa/SLA, telefone E.164
  distribution/             motor puro (Fase 3)
packages/db/
  schema/                   tabelas Drizzle por domínio
  policies/                 RLS declaradas junto do schema
  sql/                      triggers, hooks de auth, funções
  seed/                     dados neutros e realistas
```

---

## 4. Ambientes

| Ambiente | App | Banco |
|---|---|---|
| Local | `next dev` / `wrangler dev` | Supabase CLI (Docker local) |
| Preview | Deploy por PR na Cloudflare | Projeto Supabase de staging |
| Produção | Cloudflare Workers | Projeto Supabase de produção (Pro, backups diários) |

- Segredos: Workers Secrets + GitHub Environments. Nada em `.env` versionado; `.env.example` documenta as chaves.
- Migrations: geradas pelo Drizzle, revisadas em PR, aplicadas por pipeline (staging automático, produção com aprovação manual).

---

## 5. Observabilidade

- Logs JSON estruturados (`level`, `msg`, `request_id`, `org_id`, `member_id`, `route`, `duration_ms`) no Workers Logs.
- Sentry para erros no webapp, no Worker e na extensão.
- `request_id` propagado até o banco (`app.request_id`) e gravado na auditoria.
- Painel de saúde da extensão: taxa de detecção automática vs. vínculo manual (sinal precoce de mudança no WhatsApp Web).

---

## 6. Segurança

- RLS em 100% das tabelas do schema `app`; teste automatizado que falha se alguma tabela não tiver RLS habilitado.
- Schema `app` fora da Data API do Supabase.
- Rate limit por membro no tRPC (Cloudflare Rate Limiting binding).
- CORS do tRPC restrito ao domínio do app e ao ID da extensão publicada.
- MFA opcional para Gestor, com possibilidade de torná-lo obrigatório por organização.
- Credenciais de integração cifradas em repouso com rotação de chave.
- Soft delete com `deleted_at`; exclusão definitiva só por rotina de retenção (LGPD), auditada.

---

## 7. Riscos e validações pendentes

| Item | Como validar | Quando |
|---|---|---|
| Next.js 16.3 + OpenNext (SSR, `proxy.ts`, bundle) | Spike de deploy | Etapa 1, dia 1 |
| `set local role` + claims através do Hyperdrive | Teste de integração no spike | Etapa 1, dia 1 |
| Latência realtime < 1 s com trigger + `realtime.send()` | Medição com dois clientes | Fase 1 |
| 2.000 cards a 60fps | Playwright + trace de performance | Fase 1 |
| Detecção da conversa ativa no WhatsApp Web | Protótipo | Início da Fase 2 |
| Contratos Meta, Evolution, CV CRM | Documentação oficial | Fase 4 |

---

## 8. Divergências da especificação (resumo para o README)

| Spec | Adotado | Motivo |
|---|---|---|
| Next.js 15 | Next.js 16.3 | Linha estável atual, suporte do OpenNext, Adapter API estável |
| Better Auth / Auth.js | Supabase Auth | Integração direta com RLS, MFA nativo, sessão compartilhada com a extensão |
| Socket.io / Pusher | Supabase Realtime | Sem servidor de WebSocket próprio; broadcast disparado pelo banco |
| Redis + BullMQ | Cloudflare Queues + Workflows + Cron | Hospedagem 100% nuvem sem processo contínuo |
| Docker Compose + Caddy (produção) | Cloudflare Workers + Supabase | Sem VPS |
| pino | Logs JSON nativos do Workers + Sentry | pino não é voltado ao runtime dos Workers |
| Postgres 16 | Versão atual do Supabase | Sem dependência de recurso específico |
| Extensão na Fase 4 | Extensão na Fase 2 | Prioridade do produto no escopo inicial |
