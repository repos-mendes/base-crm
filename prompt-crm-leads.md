# Prompt de construção — CRM de acompanhamento de leads

> Cole este documento inteiro como prompt inicial em um agente de código (Claude Code, Cursor, Windsurf). Ele é a especificação completa: arquitetura, modelo de dados, regras de permissão, integrações e direção visual. Trechos marcados com `⚠️ CONFIRMAR` exigem consulta à documentação oficial antes de implementar — não invente contratos de API.

---

## 1. Contexto e posicionamento

Construa um **CRM operacional de aquisição e atendimento de leads**, desenhado a partir da rotina de equipes de corretagem imobiliária (alto volume de leads frios, distribuição entre operadores, atendimento majoritariamente por WhatsApp, ciclo longo), **mas sem nenhum acoplamento de nicho no domínio, na nomenclatura, na UI ou no schema.**

Regras de neutralidade que valem para todo o código:

- Nada de `imovel`, `empreendimento`, `unidade`, `corretor`, `visita` em tabelas, rotas, componentes ou labels.
- O vocabulário canônico é: **Lead, Operador, Coordenador, Gestor, Fila, Etapa, Distribuição, Conversa**.
- Especificidades de mercado entram por **campos customizados** (`custom_fields` JSONB com schema versionado por organização), nunca por colunas fixas.
- O produto deve poder ser vendido no dia seguinte para uma escola, uma clínica ou uma consultoria sem refactor.

**Nome do produto:** use o placeholder `[PRODUTO]` no código e nos textos. Sugestões neutras já verificadas quanto a ambiguidade de nicho: **Cadência**, **Fluxo**, **Rota**, **Pauta**, **Trilho**, **Nexo**. Centralize a marca em um único arquivo (`config/brand.ts`) para troca em um commit.

---

## 2. Decisão de arquitetura (leia antes de codar)

A pergunta era: **webapp ou extensão de navegador integrada ao WhatsApp Web?**

**Resposta: webapp (PWA) como produto, gateway de WhatsApp como serviço, extensão apenas como acessório opcional na Fase 4.**

Por quê:

| Abordagem | Problema |
|---|---|
| Extensão como transporte principal | Só funciona com o navegador aberto e logado. Não recebe mensagem com a máquina desligada. Quebra a cada atualização de DOM do WhatsApp Web. Não roda no celular. Impossível de auditar. Viola os Termos do WhatsApp de forma mais evidente. |
| Webapp + gateway | Funciona 24/7, recebe webhook mesmo com todo mundo offline, roda no celular, é auditável, e permite trocar o provedor de WhatsApp sem tocar no produto. |

A arquitetura correta:

```
┌──────────────────────────────────────────────────┐
│  [PRODUTO] Web (Next.js / PWA)                   │
│  Kanban · Filas · Importação · Painéis           │
└───────────────┬──────────────────────────────────┘
                │ tRPC / REST + WebSocket
┌───────────────▼──────────────────────────────────┐
│  API + Workers (BullMQ)                          │
│  Motor de distribuição · Outbox · Auditoria      │
└───┬───────────────┬───────────────┬──────────────┘
    │               │               │
┌───▼────┐   ┌──────▼───────┐  ┌────▼──────────────┐
│Postgres│   │ Messaging     │  │ Integração CV CRM │
│ Redis  │   │ Gateway       │  │ (adapter)         │
└────────┘   │ (adapter)     │  └───────────────────┘
             └──┬─────────┬──┘
      Meta Cloud API   Evolution API / Baileys
        (oficial)         (não oficial)
```

Ponto crítico: **o produto nunca fala com o WhatsApp diretamente.** Ele fala com uma interface `MessagingProvider`. Oficial e não oficial são implementações intercambiáveis dessa interface, selecionáveis por organização. Isso é o que o pedido chamou de "estrutura pré-organizada" — implemente a interface e os adapters desde a Fase 1, mesmo com o provider real desligado.

A extensão de navegador (Fase 4, opcional) não transporta mensagem: ela injeta uma **barra lateral de contexto** dentro de `web.whatsapp.com` mostrando o card do lead, as anotações e um botão de mudar etapa. É conveniência para o operador que vive no WhatsApp Web, não infraestrutura.

---

## 3. Stack

Não substitua sem justificar por escrito no README.

**App**
- Next.js 15 (App Router) + React 19 + TypeScript strict
- Tailwind CSS v4 + shadcn/ui como *base* (obrigatoriamente re-estilizado — ver §10)
- `@dnd-kit/core` para o Kanban (não use `react-beautiful-dnd`, descontinuado)
- TanStack Table + TanStack Virtual para listas e painéis
- `motion` (ex-framer-motion) para transições de estado
- `nuqs` para estado de filtro na URL
- React Hook Form + Zod

**Servidor**
- API: tRPC dentro do Next, workers em processo Node separado
- Postgres 16 + Drizzle ORM (migrations versionadas)
- Redis + BullMQ (distribuição, importação, envio, retry, agendamento)
- Realtime: WebSocket próprio (Socket.io) ou Pusher/Ably — o Kanban precisa refletir movimentação de outro usuário em < 1s
- Auth: Better Auth ou Auth.js, sessão em cookie httpOnly, 2FA opcional para Gestor

**Infra**
- Docker Compose: `app`, `worker`, `postgres`, `redis`, `evolution-api` (opcional), `caddy`
- Multi-tenant por `organization_id` em todas as tabelas + Row Level Security no Postgres
- Logs estruturados (pino) e trace de job

---

## 4. Papéis e matriz de permissão

Três papéis, hierárquicos mas **não cumulativos por herança automática** — implemente como policy explícita (CASL ou função `can(user, action, subject)`), nunca como `if (role === 'gestor')` espalhado.

| Capacidade | Operador | Coordenador | Gestor |
|---|:--:|:--:|:--:|
| Cadastrar lead manualmente | ✅ | ✅ | ✅ |
| Ver leads atribuídos a si | ✅ | ✅ | ✅ |
| Ver leads de outros operadores | ❌ | ✅ (leitura) | ✅ |
| Mover card entre etapas | ✅ (só os seus) | ❌ | ✅ |
| Criar/editar anotações no card | ✅ (só os seus) | ✅ (comentário) | ✅ |
| Conversar via WhatsApp | ✅ | ❌ | ✅ |
| Distribuir / redistribuir leads | ❌ | ✅ | ✅ |
| Criar e configurar filas | ❌ | ❌ | ✅ |
| Alocar operadores em filas | ❌ | ✅ | ✅ |
| Importar planilha | ❌ | ✅ | ✅ |
| Criar/editar/ordenar etapas do Kanban | ❌ | ❌ | ✅ |
| Painéis por operador e por fila | parcial¹ | ✅ | ✅ |
| Histórico de distribuições | ❌ | ✅ | ✅ |
| Log de auditoria completo | ❌ | ❌ | ✅ |
| Configurar integrações (WhatsApp, CV CRM) | ❌ | ❌ | ✅ |
| Gerenciar usuários e papéis | ❌ | ❌ | ✅ |

¹ Operador vê apenas os próprios números.

**Detalhe importante do pedido:** o Coordenador *"visualiza apenas as movimentações"*. Traduza isso literalmente — a interface principal do Coordenador **não é o Kanban editável**. É um **painel de movimentação**: fluxo de eventos em tempo real (quem moveu o quê, quando, de onde para onde), leitura do Kanban consolidado, e a mesa de distribuição. Ele é supervisor de fluxo, não operador.

---

## 5. Modelo de dados

Esqueleto mínimo. Todas as tabelas com `id` (UUID v7), `organization_id`, `created_at`, `updated_at`, `deleted_at` (soft delete).

```
organizations        id, name, settings, custom_field_schema (jsonb)
users                id, name, email, phone, role, status, avatar_url
                     capacity_daily (int), accepts_distribution (bool)
user_availability    user_id, status (disponivel|pausado|offline), since

pipelines            id, name, is_default
stages               id, pipeline_id, name, position, color,
                     type (aberto|ganho|perdido), sla_hours,
                     is_entry (bool), requires_reason (bool)

queues               id, name, description, pipeline_id, is_active,
                     distribution_strategy (round_robin|carga|peso|aleatorio),
                     respect_capacity (bool), fallback_user_id, business_hours (jsonb)
queue_members        queue_id, user_id, weight (int), is_active

leads                id, name, phone_e164, email, source, campaign,
                     queue_id, assigned_user_id, stage_id,
                     stage_entered_at, last_contact_at, score,
                     custom_fields (jsonb), external_refs (jsonb),
                     dedupe_key (unique por org: phone normalizado)

lead_events          id, lead_id, actor_id, type, payload (jsonb), created_at
                     -- type: criado, atribuido, reatribuido, etapa_alterada,
                     --       anotacao, mensagem_enviada, mensagem_recebida,
                     --       campo_alterado, sincronizado_externo
notes                id, lead_id, author_id, body (rich text), pinned

imports              id, file_url, uploaded_by, status, mapping (jsonb),
                     total_rows, valid_rows, duplicate_rows, error_rows
import_rows          import_id, row_number, raw (jsonb), status, error, lead_id

distribution_batches id, source (importacao|manual|api|webhook),
                     import_id, created_by, queue_ids (uuid[]),
                     strategy, status, totals (jsonb)
distributions        batch_id, lead_id, queue_id, to_user_id, from_user_id,
                     reason, distributed_at

conversations        id, lead_id, provider, external_id, unread_count, last_message_at
messages             id, conversation_id, direction, body, media (jsonb),
                     status (enfileirada|enviada|entregue|lida|falha),
                     provider_message_id, sent_at
integration_configs  id, kind (whatsapp|cvcrm), provider, credentials (cifrado),
                     status, settings (jsonb)
outbox_events        id, kind, payload, status, attempts, next_attempt_at
audit_logs           id, actor_id, action, subject_type, subject_id, diff (jsonb), ip
```

Regras não negociáveis:
- **`lead_events` é append-only.** É a fonte de verdade do histórico do lead. Nunca update, nunca delete.
- Telefone sempre normalizado para E.164 na escrita (`libphonenumber-js`, região padrão configurável por org). Deduplicação por telefone normalizado + `organization_id`.
- `stage_entered_at` alimenta o SLA por coluna. Atualize a cada movimentação.

---

## 6. Módulos funcionais

### 6.1 Kanban
- Colunas = `stages` do pipeline ativo, ordenáveis pelo Gestor (drag das próprias colunas).
- Cada coluna exibe contador, e opcionalmente soma de um campo numérico customizado.
- Cards virtualizados — a coluna precisa aguentar 2.000 leads sem travar.
- Movimentação com update otimista + rollback em falha + broadcast via WebSocket.
- Etapa com `requires_reason = true` abre modal de motivo obrigatório ao receber o card (padrão para etapas do tipo `perdido`).
- Filtros persistidos na URL: fila, operador, origem, período, etapa, busca, "sem contato há X dias".
- Densidade alternável: compacto / confortável.

### 6.2 Card do lead
Painel lateral (não modal de tela cheia), com abas:
- **Resumo** — dados, campos customizados, fila, operador, tempo na etapa atual.
- **Anotações** — texto rico, menção a usuário, fixar nota no topo.
- **Histórico** — timeline unificada de `lead_events` (criação, atribuições, mudanças de etapa, mensagens, sincronizações externas), filtrável por tipo.
- **Conversa** — thread de WhatsApp (Fase 3).

**Botão de contato rápido (requisito explícito):** um único botão que detecta a plataforma e abre o destino correto.
```ts
// desktop  → https://web.whatsapp.com/send?phone=<e164 sem +>&text=<encoded>
// mobile   → https://wa.me/<e164 sem +>?text=<encoded>
// fallback → whatsapp://send?phone=...
```
O clique registra um `lead_event` do tipo `contato_iniciado` e atualiza `last_contact_at`. Suporte a templates de primeira mensagem com variáveis (`{{nome}}`, `{{origem}}`), configuráveis por fila.

### 6.3 Filas
- Gestor cria a fila, define pipeline, estratégia de distribuição, horário de funcionamento e operador de fallback.
- Coordenador aloca e remove operadores, define peso individual.
- Operador marca-se como *disponível / pausado*; pausado não recebe distribuição automática.
- Fila fora do horário comercial: leads ficam represados em `pendente_distribuicao` e são liberados na abertura.

### 6.4 Importação de planilha e distribuição automática
Fluxo em 5 passos, cada um reversível antes do commit:

1. **Upload** — `.csv`, `.xlsx`, `.xls`. Streaming, limite de 50.000 linhas por arquivo.
2. **Mapeamento** — auto-detecção de colunas por similaridade, com override manual. Mapeamentos podem ser salvos como preset por origem.
3. **Validação** — telefone válido, duplicados dentro do arquivo, duplicados contra a base. Política de duplicado escolhível: ignorar / atualizar existente / criar mesmo assim.
4. **Seleção de filas** — o usuário escolhe **quais filas participam** desta distribuição (multi-seleção) e como o volume se reparte entre elas: igualitário, proporcional ao número de operadores ativos, ou percentual manual por fila.
5. **Prévia e confirmação** — mostra exatamente quantos leads cada operador receberá, **antes** de gravar. Só então enfileira o job.

Execução em worker BullMQ, em lotes, com barra de progresso ao vivo, relatório final baixável e **desfazer em até 1 hora** (reverte atribuições, mantém os leads).

### 6.5 Motor de distribuição
Serviço isolado e testável — entrada: lista de leads + filas + estratégia. Saída: plano de atribuição. Nenhum efeito colateral dentro do cálculo.

Estratégias:
- `round_robin` — rodízio com cursor persistido por fila (não reinicia a cada lote).
- `carga` — sempre para quem tem menos leads em aberto.
- `peso` — proporcional ao `weight` de `queue_members`.
- `aleatorio` — sorteio simples.

Modificadores: respeitar `capacity_daily`, pular operador pausado/offline, respeitar horário da fila, cair para `fallback_user_id` quando ninguém elegível. Toda atribuição gera `distributions` + `lead_events`.

Redistribuição manual: o Coordenador seleciona múltiplos leads (checkbox no Kanban ou em visão de tabela) e reatribui em massa com motivo obrigatório.

### 6.6 Painéis
**Por operador:** total de leads, distribuição por etapa, novos hoje/semana, tempo médio até o primeiro contato, tempo médio por etapa, leads parados há mais de X dias, taxa de conversão até etapa `ganho`.

**Por fila:** volume total e por etapa, entrada por período, distribuição entre os operadores da fila (identificar gargalo), conversão da fila, SLA estourado.

**Histórico de distribuições:** tabela filtrável por lote, origem, período, fila, operador; drill-down até o lead individual; exportação CSV.

Todos os painéis com comparativo contra o período anterior e exportação.

---

## 7. Integração WhatsApp (estrutura pré-organizada)

Implemente a interface na Fase 1, mesmo sem provider ativo.

```ts
interface MessagingProvider {
  readonly id: 'meta_cloud' | 'evolution' | 'wppconnect'
  readonly supportsTemplates: boolean
  readonly supportsSessionWindow: boolean

  connect(config: ProviderConfig): Promise<ConnectionResult>
  disconnect(): Promise<void>
  getStatus(): Promise<'conectado' | 'pareando' | 'desconectado' | 'erro'>
  getQrCode?(): Promise<string>                       // só provedores de sessão

  sendText(to: E164, body: string, opts?: SendOpts): Promise<SentMessage>
  sendTemplate(to: E164, template: TemplateRef, vars: Record<string,string>): Promise<SentMessage>
  sendMedia(to: E164, media: MediaPayload): Promise<SentMessage>

  parseWebhook(raw: unknown): InboundEvent[]          // normaliza para o formato interno
  verifyWebhook(req: Request): boolean
}
```

Adapters:
- **`meta_cloud`** — WhatsApp Cloud API oficial. Respeite a janela de 24h e o fluxo de *templates* aprovados fora dela. Este é o caminho recomendado para produção. `⚠️ CONFIRMAR` endpoints e versão da Graph API na documentação oficial.
- **`evolution`** — Evolution API (Baileys), autoconectada por QR Code. Sobe no Compose. `⚠️ CONFIRMAR` contrato na doc do projeto.
- **`wppconnect`** — alternativa equivalente.

Requisitos transversais:
- Fila de saída com rate limit por número e retry exponencial.
- Idempotência por `provider_message_id`.
- Webhook de entrada → casa por telefone E.164 → cria ou atualiza `conversations` e `messages` → gera `lead_events` → emite WebSocket → incrementa não-lidas.
- Mensagem de número desconhecido: cria lead novo na fila padrão de entrada e distribui pela estratégia da fila.
- Credenciais cifradas em repouso (AES-GCM, chave via env).

**Aviso a registrar no README:** provedores não oficiais violam os Termos de Serviço do WhatsApp e expõem o número a bloqueio. A arquitetura suporta os dois; a escolha e o risco são do cliente, e a interface deve deixar isso explícito na tela de configuração.

---

## 8. Integração CV CRM (estrutura pré-organizada)

Mesmo padrão: adapter com contrato explícito, desligável, e **nenhum acoplamento ao produto**.

```ts
interface ExternalCrmAdapter {
  readonly id: 'cvcrm'
  testConnection(): Promise<boolean>
  pullLeads(since: Date, cursor?: string): Promise<{ leads: ExternalLead[]; cursor?: string }>
  pushStatus(leadRef: string, stageId: string): Promise<void>
  handleWebhook(raw: unknown): ExternalEvent[]
}
```

Implementação:
- **Tabela de mapeamento de status** editável pelo Gestor na UI: etapa interna ⇄ status externo, bidirecional. Nunca hardcode.
- **Push:** toda mudança de etapa grava em `outbox_events`; worker consome, envia, marca. Retry exponencial, dead-letter queue, reprocessamento manual pelo Gestor.
- **Pull/Webhook:** normaliza para `ExternalLead`, casa por `external_refs.cvcrm_id` ou por telefone, aplica mudança e grava `lead_event` com `actor = sistema`.
- **Anti-eco:** evento originado de sincronização não dispara push de volta. Marque a origem no evento e filtre.
- **Modo simulação:** flag que loga tudo sem chamar a API externa — essencial para desenvolver sem credencial.

`⚠️ CONFIRMAR` autenticação, endpoints, formato de payload e disponibilidade de webhook na documentação oficial do CV CRM antes de escrever o adapter. Se a documentação não estiver disponível no momento da implementação, entregue o adapter contra uma interface mock e um arquivo `cvcrm.contract.md` listando exatamente o que falta.

---

## 9. Tempo real

- WebSocket com salas por `organization_id` e por `queue_id`.
- Eventos: `lead:criado`, `lead:atribuido`, `lead:etapa_alterada`, `mensagem:recebida`, `distribuicao:progresso`.
- Presença de operadores (disponível/pausado) visível ao Coordenador.
- Update otimista no cliente com reconciliação; reconexão com replay dos eventos perdidos desde o último `event_id` conhecido.

---

## 10. Direção de frontend — instruções para fugir do óbvio

Esta seção é vinculante. Antes de escrever qualquer componente, produza um **plano de design** (paleta com 4–6 hex nomeados, tipografia com papéis definidos, conceito de layout em wireframe ASCII, princípios) e revise-o contra o briefing. Se alguma parte do plano for o que você produziria para qualquer SaaS genérico, reescreva e explique o que mudou.

**Assunto que ancora o design:** isto não é um site de marketing nem um dashboard de métricas. É uma **mesa de operação em tempo real** — o parente próximo é o painel de despacho, o console de sala de controle, o terminal de mesa de operações. Densidade, legibilidade periférica, hierarquia de urgência e ausência de ruído valem mais que respiro e ilustração. A pessoa fica oito horas nesta tela.

**Anti-padrões proibidos** (são as marcas registradas de interface gerada):
- Fundo creme (~#F4F1EA) com serifada de alto contraste e acento terracota (~#D97757).
- Preto-quase (#0B0B0B, #111) com um único acento verde-ácido ou vermelhão.
- Kit de cards SaaS: tudo picotado em cards idênticos, mesmo border-radius em toda hierarquia, mesma sombra cinza suave sob cada bloco, gradiente como decoração.
- Eyebrow em CAPS LOCK tracked-out acima de cada título.
- Meta-strings unidas por ponto médio (`A · B · C`).
- Label no padrão `PALAVRA — fragmento` com travessão espaçado.
- Monoespaçada para todo rótulo pequeno de dado — use numerais tabulares da própria família.
- `→` grudado no texto de botões e links.
- Destacar uma única palavra do título em itálico, negrito ou cor diferente.
- Entrada com fade-and-slide-up em cada seção e transição de hover em cada card.

**Decisões que você deve tomar de forma opinativa:**
- **Tipografia:** uma família, no máximo duas e claramente distintas. Fuja de Inter como padrão reflexo. Considere Schibsted Grotesk, Familjen Grotesk, Public Sans, Instrument Sans, Bricolage Grotesque. Exija numerais tabulares em toda métrica e contador. Escala de tipo definida e consistente.
- **Cor:** a paleta carrega significado operacional, não decoração. Reserve saturação alta exclusivamente para urgência (SLA estourado, lead sem contato, falha de envio). Estado normal é cromaticamente calmo. Etapas ganham cor de identificação, não de hierarquia.
- **Movimento:** só em resposta a ação do usuário, e só quando mostra o que mudou — card assentando na coluna, contador recalculando, mensagem chegando. Nada de animação ambiente.
- **Estrutura:** bordas, divisores e numeração codificam informação, não enfeitam. Só numere o que é sequência real (as etapas do pipeline são; a lista de filas não é).
- **Gaste ousadia em um lugar só.** Escolha o elemento memorável — provavelmente o próprio Kanban ou o painel de movimentação do Coordenador — e mantenha todo o resto disciplinado e quieto.

**Responsividade (requisito explícito):**
- Desktop ≥1280px: Kanban horizontal com colunas fixas, painel lateral do lead abre sem cobrir o board.
- Tablet: colunas com scroll horizontal por snap.
- Mobile: **o Kanban não vira drag-and-drop encolhido.** Vira navegação por etapa — seletor de coluna no topo, lista vertical de cards, mudança de etapa por bottom sheet, ações primárias (ligar, WhatsApp, anotar) ao alcance do polegar. Painéis viram cartões empilhados com um número por vez.
- PWA instalável, offline-tolerante para leitura, notificação push de lead novo e mensagem recebida.

**Piso de qualidade, sem anunciar:** foco de teclado visível, `prefers-reduced-motion` respeitado, contraste AA, atalhos (`Cmd/Ctrl+K` para paleta de comandos, `N` novo lead, `/` busca), estados vazios que dizem o que fazer em seguida, mensagens de erro que explicam o que houve e como resolver — em voz ativa, sem pedir desculpas.

**Skills e ferramentas recomendadas:** ative a skill `frontend-design` do Claude Code antes da etapa de UI (ela força exatamente o processo de plano → crítica → build descrito acima). Para o design system e handoff, o plugin **Design** do catálogo cobre crítica, tokens, UX writing e auditoria de acessibilidade. Complemente com: `@dnd-kit` (Kanban), `motion` (transições), `cmdk` (paleta de comandos), `sonner` (toasts), `visx` ou `recharts` (painéis), `next-themes` (tema).

---

## 11. Roadmap

**Fase 1 — Núcleo (fundação)**
Auth, papéis e policy engine, multi-tenant com RLS, CRUD de lead, pipelines e etapas configuráveis pelo Gestor, Kanban com drag-and-drop e realtime, anotações, `lead_events`, botão de contato rápido, responsividade completa. Interfaces `MessagingProvider` e `ExternalCrmAdapter` definidas e mockadas.

**Fase 2 — Operação**
Filas, alocação de operadores, motor de distribuição com as quatro estratégias, importação de planilha com os 5 passos e desfazer, redistribuição em massa, painel de movimentação do Coordenador, painéis por operador e por fila, histórico de distribuições, auditoria.

**Fase 3 — Integrações**
Adapter Meta Cloud API, adapter Evolution API, inbox de conversas dentro do card, templates de mensagem, adapter CV CRM com mapeamento de status bidirecional, outbox com retry e DLQ, modo simulação.

**Fase 4 — Acessórios**
Extensão Manifest V3 com barra lateral de contexto em `web.whatsapp.com` (somente leitura + mudar etapa + anotar), automações por regra (sem contato há X → reatribuir), relatórios agendados por e-mail, API pública com chave por organização.

---

## 12. Critérios de aceite

- [ ] Operador não consegue, por nenhuma rota ou chamada direta de API, ler ou alterar lead de outro operador.
- [ ] Coordenador não consegue mover card no Kanban nem criar etapa.
- [ ] Gestor cria, renomeia, reordena e arquiva etapa sem migration e sem deploy.
- [ ] Planilha de 10.000 linhas importa, valida, distribui entre 3 filas e 12 operadores, e a prévia bate exatamente com o resultado gravado.
- [ ] Desfazer da distribuição reverte 100% das atribuições do lote e preserva os leads.
- [ ] Movimentação feita por um usuário aparece na tela de outro em menos de 1 segundo.
- [ ] Histórico do lead reconstrói a linha do tempo completa a partir de `lead_events`, sem lacuna.
- [ ] Botão de WhatsApp abre `web.whatsapp.com` no desktop e o app no celular, com a mensagem template preenchida.
- [ ] Trocar `MessagingProvider` de `meta_cloud` para `evolution` é mudança de configuração, não de código.
- [ ] Adapter do CV CRM roda em modo simulação sem credencial e loga todos os payloads que enviaria.
- [ ] Coluna com 2.000 cards rola a 60fps.
- [ ] Zero ocorrência de vocabulário imobiliário em schema, rotas, componentes ou labels — validado por script de lint.
- [ ] Auditoria em 100% das ações de escrita, com diff.

---

## 13. Como conduzir a implementação

1. Antes de codar: produza `ARCHITECTURE.md` (decisões e trade-offs), `SCHEMA.md` (modelo final com índices) e `DESIGN.md` (o plano de design da §10, já revisado contra os anti-padrões). Aguarde meu aval nos três.
2. Implemente fase por fase. Ao fim de cada fase: testes passando, seed com dados realistas, README atualizado, demo navegável.
3. Testes obrigatórios: unitário no motor de distribuição (todas as estratégias e modificadores), unitário na policy de permissão (matriz da §4 inteira), integração no fluxo de importação, E2E no fluxo operador ponta a ponta.
4. Pare e pergunte sempre que uma decisão prender o produto a um nicho, ou quando faltar contrato oficial de API externa. Não invente endpoint.
