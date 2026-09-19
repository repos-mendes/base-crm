# Base CRM — Modelo de dados

> Status: **rascunho para aprovação** (Etapa 0).
> Base: spec §5, ajustada para Supabase (ver `ARCHITECTURE.md`, ADR-04 a ADR-10).

---

## 1. Convenções

- **Schema:** todas as tabelas do produto ficam em `app` (fora da Data API do Supabase).
- **Colunas padrão** em toda tabela de domínio:
  | Coluna | Tipo | Regra |
  |---|---|---|
  | `id` | `uuid` | UUID v7 gerado na aplicação; PK |
  | `organization_id` | `uuid` | FK `app.organizations`; `not null`; imutável (trigger) |
  | `created_at` | `timestamptz` | `default now()` |
  | `updated_at` | `timestamptz` | atualizado por trigger |
  | `deleted_at` | `timestamptz` | soft delete; `null` = ativo |
- **Exceções:** tabelas append-only (`lead_events`, `audit_logs`, `distributions`, `import_rows`) não têm `updated_at` nem `deleted_at`.
- **Enums** como tipos Postgres com valores em português, conforme a spec.
- **Índices** de listagem são parciais `where deleted_at is null`.
- **RLS habilitado em 100% das tabelas**; teste automatizado garante isso.
- **Funções auxiliares de RLS** (em `app`, `stable`, `security definer` quando necessário):
  - `app.current_org_id()` → `(auth.jwt() ->> 'org_id')::uuid`
  - `app.current_member_id()` → `(auth.jwt() ->> 'member_id')::uuid`
  - `app.current_role()` → `auth.jwt() ->> 'role'`
  - `app.is_supervisor()` → papel em (`coordenador`, `gestor`)

### Mudança em relação à spec: `users` → `members`
O Supabase já possui `auth.users` (identidade global). O vínculo de uma pessoa com uma organização, com papel e capacidade, fica em `app.members`. Isso permite a mesma pessoa em mais de uma organização e evita colisão de nomes. Todas as FKs da spec que apontavam para `users` apontam para `members`.

---

## 2. Enums

```sql
create type app.member_role        as enum ('operador', 'coordenador', 'gestor');
create type app.member_status      as enum ('convidado', 'ativo', 'suspenso');
create type app.availability       as enum ('disponivel', 'pausado', 'offline');
create type app.stage_type         as enum ('aberto', 'ganho', 'perdido');
create type app.distribution_strategy as enum ('round_robin', 'carga', 'peso', 'aleatorio');
create type app.lead_status        as enum ('ativo', 'pendente_distribuicao');
create type app.lead_event_type    as enum (
  'criado', 'atribuido', 'reatribuido', 'etapa_alterada', 'anotacao',
  'campo_alterado', 'contato_iniciado', 'conversa_aberta', 'conversa_vinculada',
  'mensagem_enviada', 'mensagem_recebida', 'sincronizado_externo'
);
create type app.actor_kind         as enum ('membro', 'sistema', 'integracao');
create type app.import_status      as enum ('enviado', 'mapeado', 'validado', 'processando', 'concluido', 'desfeito', 'falhou');
create type app.import_row_status  as enum ('valida', 'duplicada', 'erro', 'importada', 'ignorada');
create type app.batch_source       as enum ('importacao', 'manual', 'api', 'webhook');
create type app.batch_status       as enum ('previa', 'processando', 'concluido', 'desfeito', 'falhou');
create type app.message_direction  as enum ('entrada', 'saida');
create type app.message_status     as enum ('enfileirada', 'enviada', 'entregue', 'lida', 'falha');
create type app.integration_kind   as enum ('whatsapp', 'crm_externo');
create type app.integration_status as enum ('desativada', 'conectando', 'conectada', 'erro');
create type app.outbox_status      as enum ('pendente', 'processando', 'enviado', 'falhou', 'morto');
create type app.link_method        as enum ('url', 'detectado', 'manual');
```

---

## 3. Tabelas

Legenda da coluna **Fase**: 1 = criada e usada na Fase 1 · 1* = criada na Fase 1 (estrutura pré-pronta), usada depois · 2, 3 = criada na fase indicada.

### 3.1 Organização e pessoas

#### `app.organizations` — Fase 1
| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid | PK (sem `organization_id`) |
| `name` | text | not null |
| `slug` | text | unique |
| `default_region` | char(2) | `default 'BR'` — região padrão para E.164 |
| `timezone` | text | `default 'America/Sao_Paulo'` |
| `settings` | jsonb | `default '{}'` (MFA obrigatório, densidade padrão etc.) |
| `custom_field_schema` | jsonb | `{ version, fields[] }` — ver ADR-10 |

#### `app.members` — Fase 1
| Coluna | Tipo | Regra |
|---|---|---|
| `auth_user_id` | uuid | FK `auth.users(id)`; not null |
| `name` | text | not null |
| `email` | citext | not null |
| `phone_e164` | text | |
| `role` | `member_role` | not null |
| `status` | `member_status` | `default 'convidado'` |
| `avatar_url` | text | |
| `capacity_daily` | int | `check (capacity_daily >= 0)`; null = sem limite |
| `accepts_distribution` | bool | `default true` |

Índices: `unique (organization_id, auth_user_id)`, `unique (organization_id, email) where deleted_at is null`, `(organization_id, role) where deleted_at is null`.

#### `app.member_availability` — Fase 3
| Coluna | Tipo | Regra |
|---|---|---|
| `member_id` | uuid | PK, FK `members` |
| `status` | `availability` | not null |
| `since` | timestamptz | not null |

### 3.2 Pipeline

#### `app.pipelines` — Fase 1
| Coluna | Tipo | Regra |
|---|---|---|
| `name` | text | not null |
| `is_default` | bool | `default false` |

Índices: `unique (organization_id) where is_default and deleted_at is null` (um padrão por organização).

#### `app.stages` — Fase 1
| Coluna | Tipo | Regra |
|---|---|---|
| `pipeline_id` | uuid | FK `pipelines`; not null |
| `name` | text | not null |
| `position` | int | not null; reordenação reescreve posições da pipeline em transação |
| `color` | text | token de identificação (`etapa-1`…`etapa-8`), não hex livre |
| `type` | `stage_type` | `default 'aberto'` |
| `sla_hours` | int | `check (sla_hours > 0)`; null = sem SLA |
| `is_entry` | bool | `default false` |
| `requires_reason` | bool | `default false`; `true` por padrão quando `type = 'perdido'` |
| `archived_at` | timestamptz | etapa arquivada some do board mas preserva histórico |

Índices: `(pipeline_id, position) where archived_at is null and deleted_at is null`; `unique (pipeline_id) where is_entry and archived_at is null and deleted_at is null`.
Regra: não é possível arquivar etapa com leads ativos sem escolher etapa de destino (caso de uso `stages.archive`).

### 3.3 Leads

#### `app.leads` — Fase 1
| Coluna | Tipo | Regra |
|---|---|---|
| `name` | text | not null |
| `phone_e164` | text | `check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')` |
| `email` | citext | |
| `source` | text | origem (ex.: formulário, planilha, indicação) |
| `campaign` | text | |
| `pipeline_id` | uuid | FK `pipelines`; not null |
| `stage_id` | uuid | FK `stages`; not null |
| `stage_entered_at` | timestamptz | not null; atualizado a cada mudança de etapa |
| `queue_id` | uuid | FK `queues` (Fase 3; nullable) |
| `assigned_member_id` | uuid | FK `members`; nullable |
| `status` | `lead_status` | `default 'ativo'` |
| `last_contact_at` | timestamptz | |
| `score` | int | |
| `lost_reason` | text | preenchido ao entrar em etapa com `requires_reason` |
| `custom_fields` | jsonb | `default '{}'`; validado pelo schema da organização |
| `external_refs` | jsonb | `default '{}'` (ex.: `{ "cvcrm_id": "..." }`) |
| `dedupe_key` | text | telefone E.164 normalizado; null quando não há telefone |
| `search_text` | text | gerada: `lower(unaccent(name \|\| ' ' \|\| coalesce(email,'') \|\| ' ' \|\| coalesce(phone_e164,'')))` |

Índices:
- `unique (organization_id, dedupe_key) where dedupe_key is not null and deleted_at is null`
- `(organization_id, stage_id, stage_entered_at) where deleted_at is null` — colunas do Kanban e SLA
- `(organization_id, assigned_member_id, stage_id) where deleted_at is null` — board do Operador
- `(organization_id, last_contact_at) where deleted_at is null` — filtro "sem contato há X dias"
- `(organization_id, source, created_at) where deleted_at is null`
- `gin (search_text gin_trgm_ops)` — busca
- `gin (custom_fields jsonb_path_ops)` — filtros por campo customizado
- `gin (external_refs jsonb_path_ops)`

#### `app.lead_events` — Fase 1 (**append-only**)
| Coluna | Tipo | Regra |
|---|---|---|
| `id` | uuid | UUID v7 — ordenação temporal e cursor de replay |
| `organization_id` | uuid | |
| `lead_id` | uuid | FK `leads`; not null |
| `actor_kind` | `actor_kind` | not null |
| `actor_member_id` | uuid | FK `members`; null quando `sistema`/`integracao` |
| `type` | `lead_event_type` | not null |
| `payload` | jsonb | ex.: `{ from_stage_id, to_stage_id, reason }` |
| `origin` | text | `app`, `extensao`, `importacao`, `sync:cvcrm`… (anti-eco na Fase 4) |
| `created_at` | timestamptz | |

Índices: `(lead_id, id desc)`, `(organization_id, id)`, `(organization_id, type, created_at)`.
Triggers: `forbid_update_delete` (lança erro em UPDATE/DELETE); `broadcast_lead_event` (after insert → `realtime.send`, ver ADR-08).

#### `app.notes` — Fase 1
| Coluna | Tipo | Regra |
|---|---|---|
| `lead_id` | uuid | FK `leads`; not null |
| `author_member_id` | uuid | FK `members`; not null |
| `body` | jsonb | documento Tiptap |
| `body_text` | text | texto puro para busca e histórico |
| `kind` | text | `anotacao` (Operador/Gestor) ou `comentario` (Coordenador) |
| `pinned` | bool | `default false` |
| `mentions` | uuid[] | membros mencionados |

Índices: `(lead_id, pinned desc, created_at desc) where deleted_at is null`, `gin (mentions)`.

#### `app.message_templates` — Fase 1
| Coluna | Tipo | Regra |
|---|---|---|
| `name` | text | not null |
| `body` | text | com variáveis `{{nome}}`, `{{origem}}`… |
| `queue_id` | uuid | FK `queues`; null = template da organização |
| `is_default` | bool | |

Índices: `(organization_id, queue_id) where deleted_at is null`.

### 3.4 Extensão

#### `app.conversation_links` — Fase 2
Vínculo entre uma conversa do WhatsApp Web e um lead.
| Coluna | Tipo | Regra |
|---|---|---|
| `lead_id` | uuid | FK `leads`; not null |
| `channel` | text | `default 'whatsapp_web'` |
| `chat_key` | text | chave normalizada da conversa (telefone E.164 ou identificador estável detectado) |
| `chat_label` | text | nome exibido no momento do vínculo |
| `method` | `link_method` | `url`, `detectado` ou `manual` |
| `linked_by_member_id` | uuid | FK `members` |

Índices: `unique (organization_id, channel, chat_key) where deleted_at is null`, `(lead_id)`.

#### `app.extension_selector_configs` — Fase 2
Seletores de detecção entregues como dados à extensão (ver `EXTENSION.md`).
| Coluna | Tipo | Regra |
|---|---|---|
| `version` | int | not null |
| `rules` | jsonb | estratégias e seletores |
| `is_active` | bool | |

Tabela global (sem `organization_id`), só escrita pelo sistema; leitura liberada a membros autenticados.

### 3.5 Filas e distribuição — Fase 3

#### `app.queues`
| Coluna | Tipo | Regra |
|---|---|---|
| `name` | text | not null |
| `description` | text | |
| `pipeline_id` | uuid | FK `pipelines` |
| `is_active` | bool | `default true` |
| `is_inbound_default` | bool | fila padrão de entrada (leads de número desconhecido) |
| `distribution_strategy` | `distribution_strategy` | not null |
| `respect_capacity` | bool | `default true` |
| `fallback_member_id` | uuid | FK `members` |
| `business_hours` | jsonb | `{ timezone, days: { seg: [["08:00","18:00"]], … }, holidays[] }` |

#### `app.queue_members`
| Coluna | Tipo | Regra |
|---|---|---|
| `queue_id` | uuid | FK `queues` |
| `member_id` | uuid | FK `members` |
| `weight` | int | `default 1`, `check (weight > 0)` |
| `is_active` | bool | `default true` |

Índices: `unique (queue_id, member_id) where deleted_at is null`.

#### `app.queue_cursors` *(nova, não estava na spec)*
Cursor persistido do `round_robin`, para não reiniciar a cada lote.
| Coluna | Tipo | Regra |
|---|---|---|
| `queue_id` | uuid | PK |
| `last_member_id` | uuid | |
| `updated_at` | timestamptz | |

Leitura com `select … for update` dentro da transação de distribuição.

#### `app.distribution_batches`
| Coluna | Tipo | Regra |
|---|---|---|
| `source` | `batch_source` | |
| `import_id` | uuid | FK `imports` |
| `created_by_member_id` | uuid | |
| `queue_ids` | uuid[] | |
| `split` | jsonb | `{ mode: igualitario\|proporcional\|percentual, percentages }` |
| `strategy` | `distribution_strategy` | |
| `status` | `batch_status` | |
| `plan` | jsonb | plano congelado da prévia (hash + atribuições) — garante prévia = resultado |
| `totals` | jsonb | |
| `undo_until` | timestamptz | `created_at + 1h` |

#### `app.distributions` (append-only)
| Coluna | Tipo | Regra |
|---|---|---|
| `batch_id` | uuid | FK `distribution_batches` |
| `lead_id` | uuid | |
| `queue_id` | uuid | |
| `to_member_id` | uuid | |
| `from_member_id` | uuid | |
| `reason` | text | |
| `distributed_at` | timestamptz | |
| `reverted_at` | timestamptz | preenchido pelo desfazer (única exceção de update, via função dedicada) |

Índices: `(batch_id)`, `(organization_id, to_member_id, distributed_at)`, `(organization_id, queue_id, distributed_at)`, `(lead_id)`.

#### `app.imports` e `app.import_rows`
Conforme spec §5, acrescentando em `imports`: `file_key` (objeto no R2), `duplicate_policy` (`ignorar`/`atualizar`/`criar`), `mapping_preset_id`.
`import_rows`: `unique (import_id, row_number)`, índice `(import_id, status)`.

#### `app.import_mapping_presets` *(nova)*
`name`, `source`, `mapping jsonb` — presets de mapeamento por origem (spec §6.4 passo 2).

### 3.6 Integrações — estrutura pré-pronta (Fase 1*)

#### `app.integration_configs`
| Coluna | Tipo | Regra |
|---|---|---|
| `kind` | `integration_kind` | |
| `provider` | text | `mock`, `meta_cloud`, `evolution`, `wppconnect`, `cvcrm` |
| `credentials_ciphertext` | bytea | AES-256-GCM |
| `credentials_key_version` | int | rotação de chave |
| `status` | `integration_status` | `default 'desativada'` |
| `simulation_mode` | bool | `default true` |
| `settings` | jsonb | |

Índices: `unique (organization_id, kind) where deleted_at is null` (um provider ativo por tipo).

#### `app.conversations`, `app.messages`
Conforme spec §5. Índices: `conversations unique (organization_id, provider, external_id)`, `(lead_id)`; `messages unique (provider_message_id) where provider_message_id is not null` (idempotência), `(conversation_id, created_at)`.

#### `app.external_status_mappings` *(nova)*
Mapeamento etapa interna ⇄ status externo (spec §8), editável pelo Gestor.
`integration_config_id`, `stage_id`, `external_status`, `direction` (`envio`/`recebimento`/`ambos`).
Índice: `unique (integration_config_id, stage_id, external_status)`.

#### `app.outbox_events`
Conforme spec §5, acrescentando `last_error text`, `dedupe_key text unique`.
Índice: `(status, next_attempt_at)`.

### 3.7 Auditoria e notificações

#### `app.audit_logs` — Fase 1 (append-only)
| Coluna | Tipo | Regra |
|---|---|---|
| `actor_kind` | `actor_kind` | |
| `actor_member_id` | uuid | |
| `action` | text | `insert`, `update`, `delete`, `soft_delete` ou ação de domínio |
| `subject_type` | text | nome da tabela |
| `subject_id` | uuid | |
| `diff` | jsonb | `{ campo: [antes, depois] }` só com campos alterados |
| `ip` | inet | de `app.request_ip` |
| `request_id` | text | |

Índices: `(organization_id, created_at desc)`, `(subject_type, subject_id, created_at desc)`, `(actor_member_id, created_at desc)`.
Preenchida por trigger genérico `app.audit_row()` em todas as tabelas de escrita (ADR-09).

#### `app.push_subscriptions` — Fase 1
`member_id`, `endpoint` (unique), `keys jsonb`, `user_agent`.

---

## 4. Políticas de RLS

Resumo por tabela. Toda policy inclui `organization_id = app.current_org_id()`.

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `organizations` | membro da org | sistema | Gestor | — |
| `members` | todos da org (dados básicos) | Gestor | Gestor; o próprio membro em campos pessoais | — (soft delete por Gestor) |
| `pipelines`, `stages` | todos da org | Gestor | Gestor | — |
| `leads` | Supervisor: todos · Operador: `assigned_member_id = current_member_id()` | todos (Operador: atribuído a si) | Gestor: todos · Operador: os seus · Coordenador: só atribuição (Fase 3) | — |
| `lead_events` | mesma visibilidade do lead | via casos de uso (membro) ou sistema | **negado** | **negado** |
| `notes` | mesma visibilidade do lead | Operador (leads seus), Coordenador (`kind = comentario`), Gestor | autor | autor (soft delete) |
| `conversation_links` | mesma visibilidade do lead | Operador (seus), Gestor | Operador (seus), Gestor | — |
| `message_templates` | todos da org | Gestor | Gestor | — |
| `queues` | todos da org | Gestor | Gestor | — |
| `queue_members` | todos da org | Coordenador, Gestor | Coordenador, Gestor | — |
| `distribution_batches`, `distributions`, `imports` | Supervisor | Supervisor | sistema | — |
| `integration_configs`, `external_status_mappings`, `outbox_events` | Gestor | Gestor | Gestor | — |
| `audit_logs` | Gestor | sistema (trigger) | **negado** | **negado** |

### Guardas por trigger (camada 3)
- `leads_guard_stage_change`: se `stage_id` mudou, exige papel `gestor` ou (`operador` e `assigned_member_id = current_member_id()`). Coordenador é rejeitado mesmo que a policy de UPDATE permita a linha.
- `leads_guard_requires_reason`: ao entrar em etapa com `requires_reason`, exige `lost_reason` (ou o motivo no payload do evento).
- `leads_set_stage_entered_at`: atualiza `stage_entered_at` quando `stage_id` muda.
- `guard_immutable_org`: impede alterar `organization_id` em qualquer tabela.
- `forbid_update_delete`: em `lead_events`, `audit_logs`, `distributions` (exceto função `app.revert_batch`).

---

## 5. Deduplicação entre operadores (decidido em 2026-09-19)

**Situação.** Um Operador cadastra um telefone que já existe e está atribuído a outra pessoa. O RLS impede que ele veja o lead existente, então a resposta da API não pode vazar o registro.

**Decisão.** A API responde com erro de conflito e mensagem neutra, sem revelar nome, responsável ou qualquer dado do lead existente, e gera uma notificação para os Coordenadores da organização.

- Resposta da API: `409 CONFLICT`, código `lead_duplicado`, mensagem **"Este telefone já está cadastrado e atribuído a outro operador."**
- O payload de erro **não** contém `lead_id`, `owner_id`, nome nem qualquer campo do lead existente — nem mesmo para depuração.
- A verificação roda em função `security definer` (a checagem precisa enxergar além do RLS); ela retorna apenas um booleano e o `id` do lead para uso interno da notificação, nunca para o cliente.
- É gerado um `audit_log` (`acao = lead_duplicado_bloqueado`) e uma notificação para o papel Coordenador, contendo: telefone em E.164, quem tentou cadastrar, quem é o responsável atual e o horário. O Coordenador decide se transfere, mantém ou mescla.
- Quando o lead duplicado pertence ao **próprio** operador (ou ele tem permissão de vê-lo), a resposta continua sendo a normal: link direto para o lead existente.
- A extensão usa exatamente a mesma resposta, alinhada com `EXTENSION.md` §6.

**Alternativas descartadas:** mostrar o nome do responsável (vaza a estrutura da carteira e tira a movimentação do histórico auditável); abrir um pedido de transferência pelo próprio operador (fica registrado como possível evolução, mas exige tabela e tela próprias que não cabem na Fase 1).

---

## 6. Seed (dados neutros)

- 1 organização, 1 Gestor, 1 Coordenador, 4 Operadores.
- Pipeline padrão: `01 Novo`, `02 Primeiro contato`, `03 Em conversa`, `04 Proposta`, `05 Ganho` (ganho), `06 Perdido` (perdido, com motivo).
- 300 leads com origens genéricas (formulário do site, anúncio, indicação, evento, planilha), telefones válidos fictícios, datas distribuídas nos últimos 60 dias, histórico coerente em `lead_events`.
- Campos customizados de exemplo neutros: `interesse` (texto), `valor_estimado` (número), `cidade` (texto).
- Seed de performance separado: 2.000 leads em uma única etapa.
