# Base CRM — Extensão para WhatsApp Web

> Status: **rascunho para aprovação** (Etapa 0). Implementação na Fase 2.

---

## 1. Propósito

Mostrar o **contexto do lead ao lado da conversa** no `web.whatsapp.com`, para que o operador consulte e atualize o CRM sem trocar de aba.

### Faz
- Identifica a conversa aberta e mostra o lead correspondente.
- Exibe dados principais, etapa atual e tempo na etapa, anotações e últimos eventos.
- Permite mudar etapa, escrever anotação e vincular a conversa a um lead.
- Reflete em tempo real o que muda no webapp, e vice-versa.

### Não faz (por decisão de produto e de risco)
- Não lê o conteúdo das mensagens.
- Não envia mensagens nem automatiza cliques ou digitação no WhatsApp.
- Não altera o DOM do WhatsApp Web (a interface fica no side panel do navegador).
- Não funciona sem o webapp: login, dados e permissões vêm dele.

---

## 2. Arquitetura

```
┌──────────────────────── Chrome / Edge ────────────────────────────────┐
│                                                                       │
│  Aba web.whatsapp.com                    Side panel (React)           │
│  ┌──────────────────────────┐            ┌─────────────────────────┐  │
│  │ content script           │  mensagem  │ UI do lead              │  │
│  │ - lê URL no carregamento │──────────▶ │ packages/ui + core      │  │
│  │ - observa troca de       │            │ tRPC client             │  │
│  │   conversa (só cabeçalho)│            │ Supabase Realtime       │  │
│  └──────────────────────────┘            └───────────┬─────────────┘  │
│               │                                      │                │
│               ▼                                      │                │
│  Service worker (background)                         │                │
│  - sessão Supabase (refresh)                         │                │
│  - cache da config de detecção                       │                │
│  - roteamento de mensagens                           │                │
└──────────────────────────────────────────────────────┼────────────────┘
                                                       │ HTTPS / WSS
                                           Base CRM API (Workers) + Supabase
```

| Parte | Tecnologia | Responsabilidade |
|---|---|---|
| Build | WXT (Vite, React, TypeScript), Manifest V3 | Empacotamento para Chrome e Edge |
| Content script | TypeScript puro, sem React | Detectar a conversa ativa; nada mais |
| Side panel | React + `packages/ui` | Toda a interface |
| Service worker | TypeScript | Sessão, cache de configuração, mensagens |
| Dados | tRPC (mesmos routers do webapp) | Mesmas regras de permissão |
| Tempo real | Supabase Realtime (canal `member:<id>`) | Atualização < 1 s |

---

## 3. Identificação da conversa ativa

Este é o **principal risco técnico**. O WhatsApp Web muda o DOM sem aviso e nem sempre mostra o telefone (contatos salvos aparecem pelo nome). A estratégia é em camadas, da mais confiável para a menos confiável.

### Camada 1 — URL de abertura (confiável)
1. No webapp, o botão **WhatsApp** abre `https://web.whatsapp.com/send?phone=<e164>&text=<template>`.
2. O content script roda em `document_start` e lê `phone` da URL **antes** do redirecionamento interno do WhatsApp.
3. Guarda uma "abertura pendente" `{ phone, lead_id?, at }`.
4. Quando o cabeçalho de conversa aparece (até 30 s), cria o vínculo `chat_key = phone`, `chat_label = título do cabeçalho`, `method = url`.

**Melhoria:** se já existir uma aba do WhatsApp Web aberta, o webapp pede à extensão (via `externally_connectable`) para navegar nessa aba em vez de abrir outra.

### Camada 2 — Detecção na página
- Ao trocar de conversa, o content script lê **apenas o cabeçalho da conversa ativa** (título e, quando disponível, o número exibido).
- Se houver número, normaliza para E.164 e busca o lead (`method = detectado`).
- Se houver só o nome, procura um vínculo existente com esse `chat_label`.

### Camada 3 — Vínculo manual
- Sem identificação, o side panel mostra busca de leads e o botão **Vincular a esta conversa**.
- O vínculo é salvo em `app.conversation_links` e reutilizado nas próximas aberturas.
- Vínculo manual por nome é marcado como "fraco" e pode ser desfeito ou corrigido.

### Seletores como configuração, não como código
- As regras de detecção (seletores e atributos a ler) ficam em `app.extension_selector_configs` e são entregues pela API como **JSON**.
- O content script tem um **interpretador fixo** dessas regras; não há `eval` nem código remoto (exigência do Manifest V3 e da Chrome Web Store).
- Uma versão padrão vai embutida no pacote como fallback.
- Quando o WhatsApp muda o layout, corrige-se a configuração sem publicar nova versão da extensão.

```json
{
  "version": 3,
  "chat_header": { "selector": "…", "title": { "selector": "…", "read": "textContent" } },
  "phone_candidates": [
    { "selector": "…", "read": "textContent", "normalize": "e164" },
    { "selector": "…", "read": "attribute", "attribute": "…", "pattern": "…" }
  ],
  "change_observer": { "root": "…", "debounce_ms": 250 }
}
```
Os seletores reais são definidos no protótipo (§8, passo 1) a partir do DOM atual.

---

## 4. Autenticação

1. Sem sessão, o side panel mostra **Conectar conta** e abre `https://<app>/extensao/conectar`.
2. Com o usuário logado no webapp, a página envia a sessão para a extensão com `chrome.runtime.sendMessage(EXTENSION_ID, …)`.
3. O manifest declara `externally_connectable.matches` apenas com o domínio do app (produção e staging). Mensagens de qualquer outra origem são ignoradas.
4. O service worker guarda a sessão em `chrome.storage.local` e usa `supabase-js` com storage customizado para renovar o token.
5. **Sair** no side panel encerra a sessão da extensão; logout no webapp invalida o refresh token e a extensão volta ao estado desconectado na próxima renovação.

A API aceita o `access_token` do Supabase em `Authorization: Bearer`, com CORS liberado só para `chrome-extension://<ID publicado>`.

---

## 5. Permissões do manifest

| Permissão | Motivo |
|---|---|
| `sidePanel` | Interface lateral |
| `storage` | Sessão e cache da configuração de detecção |
| `host_permissions: https://web.whatsapp.com/*` | Content script de detecção |
| `host_permissions: https://<api do Base CRM>/*` | Chamadas à API |
| `externally_connectable` (domínio do app) | Receber a sessão e pedidos de abrir conversa |

Sem `tabs`, `history`, `cookies`, `webRequest` ou `<all_urls>`. O side panel fica habilitado apenas nas abas do WhatsApp Web (`chrome.sidePanel.setOptions` por aba).

---

## 6. Regras de negócio na extensão

- **Permissões idênticas ao webapp:** a extensão chama os mesmos routers tRPC; `can()` e RLS se aplicam.
- **Lead de outro operador:** mostra "Esta conversa está vinculada a um lead de outro operador", sem dados.
- **Mudar etapa:** mesmo fluxo do webapp, incluindo modal de motivo obrigatório.
- **Anotação rápida:** texto simples com menção; formatação rica fica no webapp.
- **Eventos gerados:**
  | Evento | Quando | Observação |
  |---|---|---|
  | `conversa_vinculada` | Vínculo criado ou corrigido | Registra o método (`url`, `detectado`, `manual`) |
  | `conversa_aberta` | Conversa vinculada fica ativa | No máximo 1 por lead e operador a cada 30 min, para não poluir o histórico |
  | `etapa_alterada`, `anotacao` | Ações no side panel | `origin = extensao` |

### `last_contact_at` (decidido em 2026-09-19)

Abrir uma conversa não prova que houve contato, e `last_contact_at` alimenta a escala de urgência (`DESIGN.md` §2.2). Um falso positivo aqui desarma o alarme de SLA, que é o pior erro possível para este campo.

**Decisão.** `conversa_aberta` **não** atualiza `last_contact_at`. O campo só avança por ação explícita do operador:

| Gatilho | Onde | Evento | Atualiza `last_contact_at` |
|---|---|---|---|
| Botão **Registrar contato** | Side panel da extensão | `contato_iniciado` (`origin = extensao`) | Sim |
| Botão de contato rápido | Webapp | `contato_iniciado` (`origin = webapp`) | Sim |
| Conversa vinculada fica ativa | Extensão, automático | `conversa_aberta` | Não |
| Mensagem recebida por integração | Fase 4 | `mensagem_recebida` | Sim (a definir na Fase 4) |

- **Registrar contato** fica desabilitado por 30 minutos após o último `contato_iniciado` do mesmo par lead/operador, com o horário do último registro visível ao lado, para evitar duplo clique e inflação do indicador.
- `conversa_aberta` continua no histórico como sinal de atividade e alimenta o Painel de Fluxo; ele apenas não move o relógio do SLA.
- Se o operador registrar contato em um lead que não é dele, vale `can()` normalmente — a ação é negada.

**Alternativas descartadas:** atualizar ao abrir a conversa (falso positivo que zera o alarme só por conferir algo); detectar o envio da mensagem no DOM do WhatsApp Web (é o ponto mais frágil do projeto, quebra a cada mudança deles — pode ser reavaliado depois que o protótipo de detecção da Fase 2 mostrar quanto o DOM é estável).

---

## 7. Falhas e degradação

| Situação | Comportamento |
|---|---|
| Seletores não encontram o cabeçalho | Side panel cai para busca e vínculo manual; evento de telemetria `deteccao_falhou` com versão da config |
| API fora do ar | Mostra o último lead em cache (somente leitura) e avisa que as ações estão indisponíveis |
| Token expirado sem renovação possível | Estado "Conectar conta" |
| Realtime desconectado | Reconecta com replay por `event_id` (mesmo mecanismo do webapp) |
| Extensão desatualizada em relação à API | API responde versão mínima; side panel pede atualização |

---

## 8. Plano da Fase 2

1. **Protótipo de detecção (2–3 dias):** content script isolado registrando no console o que consegue identificar em conversas de contatos salvos, não salvos, grupos e conversas abertas por URL. Resultado: seletores iniciais, taxa de acerto por camada e decisão de seguir.
2. **Esqueleto WXT** no monorepo, manifest com permissões mínimas, side panel habilitado só no WhatsApp Web.
3. **Autenticação** (`/extensao/conectar`, `externally_connectable`, renovação de sessão).
4. **Interpretador de configuração** + endpoint da configuração de detecção + fallback embutido.
5. **Side panel:** lead, etapa, mover, anotação rápida, últimos eventos, estados vazios e de erro.
6. **Vínculos:** camadas 1, 2 e 3, correção de vínculo.
7. **Abrir conversa na aba existente** a partir do webapp.
8. **Realtime** no side panel.
9. **Testes e publicação:** Playwright + fixtures, política de privacidade, publicação não listada na Chrome Web Store e Edge Add-ons.

---

## 9. Testes

- **Unitário:** interpretador de configuração, normalização de telefone, máquina de estados da abertura pendente.
- **Fixtures de DOM:** cópias anonimizadas do cabeçalho do WhatsApp Web para cada cenário (contato salvo, não salvo, grupo, sem conversa). Sem dados reais de pessoas.
- **E2E (Playwright):** extensão carregada em Chromium; o domínio `web.whatsapp.com` é interceptado e servido com as fixtures; fluxo completo de vincular, mudar etapa e ver o reflexo no webapp.
- **Checklist manual** no WhatsApp Web real antes de cada publicação.
- **Telemetria em produção:** percentual de vínculos por método e falhas de detecção por versão de configuração. Queda brusca = mudança no WhatsApp Web.

---

## 10. Privacidade e conformidade

- O content script lê somente o cabeçalho da conversa ativa (nome e número exibidos). Nenhum conteúdo de mensagem é lido, armazenado ou transmitido.
- Dados enviados à API: telefone normalizado e nome exibido, apenas para localizar ou vincular o lead.
- A organização cliente é controladora dos dados dos seus leads; o Base CRM atua como operador (LGPD). Isso entra na política de privacidade exigida pela Chrome Web Store.
- A extensão não automatiza o WhatsApp. Mesmo assim, extensões que interagem com o WhatsApp Web não são oficialmente suportadas pela Meta; o risco residual é mudança de layout, mitigado pela configuração remota e pelo fallback manual.
