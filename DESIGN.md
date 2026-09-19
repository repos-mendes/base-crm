# Base CRM — Plano de design

> Status: **rascunho para aprovação** (Etapa 0). Vinculante para toda a UI do webapp e da extensão (spec §10).

---

## 1. Conceito

**Mesa de despacho.** A referência não é um SaaS de marketing nem um dashboard de métricas: é o console de uma central de despacho, onde uma pessoa acompanha dezenas de ocorrências ao mesmo tempo durante oito horas.

O que isso significa na prática:

1. **A tela é lida pela visão periférica.** O normal é silencioso. Só o que exige ação ganha cor forte.
2. **Densidade é respeito ao tempo do operador.** Mais linhas visíveis, menos cliques, menos rolagem.
3. **A estrutura é informação.** Linhas, divisores e números de etapa dizem onde as coisas estão e em que ordem. Nada é enfeite.
4. **Movimento só confirma ação.** O card assenta na coluna, o contador recalcula, o evento entra no fluxo. Nada se mexe por conta própria.
5. **Ousadia em um lugar só:** o **Painel de Fluxo** do Coordenador (§6), que vive em uma aba ao lado do Kanban. O resto é disciplinado e quieto.

---

## 2. Cor

> **Aprovada em 2026-09-19**, após revisão das amostras visuais (paleta clara, Kanban em uso, tema escuro e Painel de Fluxo).
> Estes valores são a fonte de verdade dos tokens de `packages/ui` (§11). Mudança de cor daqui em diante passa por este documento primeiro.

### 2.1 Paleta base (tema claro)

| Nome | Hex | Papel |
|---|---|---|
| **Gelo** | `#F4F6F7` | Fundo de trabalho: trilhos das colunas, áreas de navegação |
| **Branco de ficha** | `#FFFFFF` | Superfícies onde se lê: cards, painel do lead, tabelas |
| **Grafite** | `#1C2529` | Texto principal, ícones ativos, estrutura forte |
| **Ardósia** | `#56666E` | Texto secundário, rótulos, metadados |
| **Névoa** | `#C9D2D6` | Divisores e linhas de grade (decorativos, não carregam informação sozinhos) |
| **Petróleo** | `#0E5C6B` | Ação e seleção: botão primário, foco de teclado, item selecionado, link |

### 2.2 Escala de urgência (única cor saturada da interface)

| Nome | Texto | Tinta de fundo | Uso exclusivo |
|---|---|---|---|
| **Atenção** | `#855700` | `#FBF0D9` | SLA a menos de 20% do limite; lead sem contato perto do prazo |
| **Alerta** | `#B42129` | `#FBE9EA` | SLA estourado; lead sem nenhum contato após o prazo; falha de envio ou sincronização |

Regra: **Atenção e Alerta nunca aparecem como decoração**, nunca identificam etapa e nunca são cor de botão comum. Ações destrutivas usam Grafite com confirmação, não vermelho.

### 2.3 Cores de identificação de etapa

Oito tons de baixa saturação (`etapa-1` … `etapa-8`), usados **apenas** como marcador de identidade (quadrado de 8px no cabeçalho da coluna, fio de 2px no seletor de etapa). Nunca pintam o card inteiro nem o fundo da coluna.

| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| `etapa-1` | `#5B7FA6` | | `etapa-5` | `#8A7BB0` |
| `etapa-2` | `#4E8C84` | | `etapa-6` | `#9C7A5B` |
| `etapa-3` | `#6F8F4E` | | `etapa-7` | `#A0668A` |
| `etapa-4` | `#A68F3C` | | `etapa-8` | `#6F7C86` |

Etapas do tipo `ganho` e `perdido` não recebem verde e vermelho: o tipo é indicado por ícone e rótulo, para não competir com a escala de urgência.

### 2.4 Tema escuro

| Papel | Hex |
|---|---|
| Fundo | `#141A1D` |
| Superfície | `#1C2428` |
| Texto principal | `#E2E8EA` |
| Texto secundário | `#97A5AB` |
| Divisor | `#2C363B` |
| Ação (Petróleo claro) | `#5DB0BF` (texto do botão primário: `#141A1D`) |
| Atenção | `#E0A841` |
| Alerta | `#F0646A` |

O tema escuro é um azul-ardósia profundo, não preto; a ação continua sendo o único tom de destaque fora da urgência.

### 2.5 Contraste verificado (WCAG 2.x)

| Par | Razão | Resultado |
|---|---|---|
| Grafite sobre Gelo | 14,39 | AAA |
| Ardósia sobre Branco de ficha | 5,96 | AA |
| Ardósia sobre Gelo | 5,50 | AA |
| Petróleo sobre Branco | 7,60 | AAA |
| Alerta sobre tinta de Alerta | 5,63 | AA |
| Atenção sobre tinta de Atenção | 5,53 | AA |
| Escuro: texto principal sobre superfície | 12,73 | AAA |
| Escuro: texto secundário sobre superfície | 6,22 | AA |
| Escuro: Atenção sobre superfície | 7,39 | AAA |
| Escuro: Petróleo claro sobre superfície | 6,33 | AA |
| Escuro: Alerta sobre superfície | 5,06 | AA |

Névoa sobre Gelo (1,42) é apenas divisor decorativo. Todo indicador que carrega informação (foco, seleção, borda de urgência) usa Petróleo, Alerta ou Atenção, todos acima de 3:1.

---

## 3. Tipografia

### 3.1 Família

**Instrument Sans** (variável: peso e largura), uma família só.

- **Largura normal (100)** para leitura: nome do lead, anotações, formulários.
- **Largura condensada (~80)** para rótulos estruturais densos: cabeçalho de coluna, contadores, números de painel, cabeçalho de tabela.
- **Numerais tabulares** (`font-variant-numeric: tabular-nums`) em todo número: contadores, tempo na etapa, datas, telefones, métricas. Números nunca "dançam" quando mudam.
- Fallback: `ui-sans-serif, system-ui, sans-serif`.

A variação de largura dá o contraste de papéis que normalmente viria de uma segunda família ou de uma monoespaçada, sem ruído visual.

### 3.2 Escala (desktop; mobile +1 step no corpo)

| Papel | Tamanho / altura | Peso | Largura | Uso |
|---|---|---|---|---|
| `numero-painel` | 28 / 32 | 600 | 80 | Número principal de painel |
| `titulo-tela` | 20 / 28 | 600 | 100 | Título da página |
| `titulo-secao` | 15 / 22 | 600 | 100 | Seções do painel do lead |
| `cabecalho-coluna` | 13 / 18 | 600 | 80 | Nome e número da etapa |
| `contador` | 13 / 18 | 500 | 80 | Contagem na coluna, badges |
| `corpo` | 14 / 20 | 400 | 100 | Texto padrão |
| `card-titulo` | 14 / 18 | 500 | 100 | Nome do lead no card |
| `meta` | 12 / 16 | 400 | 100 | Tempo na etapa, origem, responsável |
| `rotulo` | 12 / 16 | 500 | 80 | Rótulos de formulário e cabeçalho de tabela (caixa normal, sem caps) |

---

## 4. Estrutura e forma

- **Raio:** três níveis com significado. `0` em trilhos e tabelas (estrutura), `4px` em cards e campos (objetos manipuláveis), `8px` só em painéis flutuantes (paleta de comandos, bottom sheet).
- **Sombra:** existe só em elementos que estão **acima** da página: card sendo arrastado, painel flutuante, bottom sheet. Nada em repouso tem sombra.
- **Bordas:** card em repouso tem borda Névoa de 1px. A borda esquerda do card é o canal de urgência: 3px Atenção ou Alerta quando aplicável, invisível no estado normal.
- **Numeração:** só as etapas do pipeline são numeradas (`01`, `02`…), porque são sequência real. Filas, operadores e campos não são numerados.
- **Grade:** unidade de 4px. Coluna do Kanban com largura fixa de 288px no desktop, gap de 1px (o divisor é o próprio espaço entre trilhos).
- **Ícones:** Lucide, traço 1,5px, 16px na densidade compacta e 18px na confortável. Ícone sempre acompanhado de rótulo, exceto em ações de linha com tooltip.

---

## 5. Layout

### 5.1 Desktop ≥ 1280px — Kanban (Operador e Gestor)

```
┌──────┬──────────────────────────────────────────────────────────────────┬───────────────────────────┐
│ Base │ Pipeline padrão         Busca /          Ctrl K    [ Novo lead ] │ Ana Ribeiro         Fechar │
│ CRM  ├──────────────────────────────────────────────────────────────────┤ +55 11 98765-4321         │
│      │ Operador: todos   Origem: todas   Período: 30 dias   Sem contato │ 02 Primeiro contato       │
│Kanban│ há 3+ dias                                  Compacto  Confortável│ há 2 d 4 h nesta etapa    │
│Leads ├────────────────┬────────────────┬────────────────┬───────────────┤ [ WhatsApp ] [ Mover ]    │
│Fluxo │ ■ 01 Novo   48 │ ■ 02 Primeiro  │ ■ 03 Em        │ ■ 04 Propos   ├───────────────────────────┤
│      │                │   contato   31 │   conversa  22 │   ta       9  │ Resumo  Anotações  Histór │
│Config│ ┌────────────┐ │ ┌────────────┐ │ ┌────────────┐ │ ┌───────────┐ ├───────────────────────────┤
│      │ │Carlos Mota │ │▌Ana Ribeiro │ │ │Júlia Prado │ │ │Rui Tavares│ │ Origem       Anúncio       │
│      │ │Formulário  │ │▌Anúncio     │ │ │Indicação   │ │ │Evento     │ │ Responsável  Paula Lima    │
│      │ │há 3 h      │ │▌há 2 d 4 h  │ │ │há 6 h      │ │ │há 1 d     │ │ Criado em    12/09 09:14   │
│      │ └────────────┘ │ └────────────┘ │ └────────────┘ │ └───────────┘ │                           │
│      │ ┌────────────┐ │ ┌────────────┐ │                │               │ Campos                    │
│      │ │…           │ │ │…           │ │                │               │ Interesse    Plano anual  │
│      │ └────────────┘ │ └────────────┘ │                │               │ Valor est.   R$ 12.400    │
└──────┴────────────────┴────────────────┴────────────────┴───────────────┴───────────────────────────┘
  ▌ = borda esquerda de urgência (Alerta: SLA estourado)       ■ = marcador de identificação da etapa
```

- Navegação lateral estreita (72px) com rótulos curtos.
- Filtros em linha, persistidos na URL; filtro ativo mostra valor, inativo mostra "todos".
- O painel do lead **empurra** o board (420px), nunca cobre. O board rola horizontalmente.
- Metadados do card ficam em **linhas separadas**, não concatenados.

### 5.2 Tablet (768–1279px)

- Colunas de 272px com scroll horizontal por snap.
- Painel do lead abre como folha lateral de 60% da largura, sobre o board, com o card de origem ainda visível à esquerda.

### 5.3 Mobile (< 768px) — navegação por etapa

```
┌─────────────────────────────┐
│ Base CRM            Busca   │
├─────────────────────────────┤
│ 01 Novo 48 │02 Primeiro 31 │▸ seletor de etapa com scroll horizontal
├─────────────────────────────┤
│▌Ana Ribeiro                 │
│▌Anúncio                     │
│▌há 2 d 4 h                  │
├─────────────────────────────┤
│ Carlos Mota                 │
│ Formulário                  │
│ há 3 h                      │
├─────────────────────────────┤
│ …                           │
│                             │
├─────────────────────────────┤
│  Ligar   WhatsApp   Anotar  │ ◂ barra de ações ao alcance do polegar
└─────────────────────────────┘
```

- Nenhum drag-and-drop no mobile. Mudar etapa: botão **Mover** abre bottom sheet com a lista numerada de etapas.
- Toque no card abre o lead em tela cheia, com as mesmas abas.
- Painéis viram sequência vertical com um número por bloco.

### 5.4 Extensão — Side panel

```
┌──────────────────────────────────────────────┬──────────────────────────┐
│  WhatsApp Web (intocado)                     │ Base CRM                 │
│                                              ├──────────────────────────┤
│  ┌─ Ana Ribeiro ──────────────────────────┐  │ Ana Ribeiro              │
│  │                                        │  │ +55 11 98765-4321        │
│  │  mensagens…                            │  │ Vinculado pela URL       │
│  │                                        │  ├──────────────────────────┤
│  │                                        │  │ Etapa                    │
│  │                                        │  │ ■ 02 Primeiro contato    │
│  │                                        │  │ há 2 d 4 h    [ Mover ]  │
│  │                                        │  ├──────────────────────────┤
│  │                                        │  │ Anotação rápida          │
│  │                                        │  │ ┌──────────────────────┐ │
│  │                                        │  │ │                      │ │
│  └────────────────────────────────────────┘  │ └──────────────────────┘ │
│                                              │ Últimos eventos          │
│                                              │ 12/09 Etapa alterada     │
└──────────────────────────────────────────────┴──────────────────────────┘
```

Estados obrigatórios: conversa não identificada (busca + vincular), lead de outro operador (mensagem sem dados), sem sessão (conectar conta), WhatsApp Web fora da conversa (instrução de uso).

---

## 6. O elemento ousado: Painel de Fluxo (Coordenador)

**Navegação do Coordenador (decidido em 2026-09-19):** `Kanban | Fluxo | Filas`. O Coordenador abre no **Kanban**, como os demais perfis — mesma tela, mesma leitura, sem curva de aprendizado própria. O **Fluxo** fica a um clique, na segunda aba, e é para onde ele vai quando a pergunta é "onde o funil está travando agora?". A aba lembra a última escolhida por usuário.

O Painel de Fluxo é um **mapa de movimentações ao vivo**: as etapas são trilhos verticais, o tempo corre de cima para baixo (mais recente no topo) e cada movimentação é desenhada como um traço horizontal ligando a etapa de origem à etapa de destino.

```
            01 Novo   02 Primeiro   03 Em       04 Proposta   05 Ganho   06 Perdido
                      contato       conversa
 14:32:08     │           ●━━━━━━━━━━━━●            │             │           │     Paula L.  Ana Ribeiro
 14:31:55     ●━━━━━━━━━━━●            │            │             │           │     Marcos T. Carlos Mota
 14:30:12     │           │            ●━━━━━━━━━━━━●             │           │     Paula L.  Júlia Prado
 14:28:40     │           │            │            ●━━━━━━━━━━━━━●           │     Rui S.    Rui Tavares
 14:27:03     │           ●━━━━━━━━━━━━┿━━━━━━━━━━━━┿━━━━━━━━━━━━━┿━━━━━━━━━━━●     Marcos T. Lia Campos
 ─────────────┼───────────┼────────────┼────────────┼─────────────┼───────────┼──────────────────────────
 agora        48          31  ▲3       22           9  ▼1          4           7
```

- **Leitura imediata:** trilhos com muitos traços saindo são onde o fluxo anda; trilhos sem traços por muito tempo são gargalo.
- **Rodapé:** contador por etapa com variação da última hora em numerais tabulares.
- **Traço regressivo** (etapa voltou para trás) usa tracejado, sem cor extra.
- **Chegada de evento:** o traço é desenhado da origem ao destino em 240ms e a linha assenta; a lista não salta (a posição de leitura é preservada se o Coordenador rolou para baixo).
- **Clique** em um traço abre o lead em leitura; filtros por fila, operador e etapa.
- **Tabela equivalente** acessível por alternância, para leitores de tela e exportação.
- **Badge de atividade:** quando o Coordenador está no Kanban, a aba Fluxo mostra um ponto discreto (Petróleo) se chegaram movimentações desde a última visita. Sem contador e sem animação — a aba não disputa atenção com o trabalho em curso.

Esta continua sendo a tela de maior ambição visual do produto; todo o resto é deliberadamente contido. Ela apenas não é mais a porta de entrada do Coordenador: entra como aba para que o primeiro contato com o sistema seja o mesmo para todos os perfis.

---

## 7. Movimento

| Situação | Movimento | Duração |
|---|---|---|
| Card solto em nova coluna | Assenta na posição com leve desaceleração | 180ms |
| Contador muda | Número troca com deslocamento vertical de 4px | 140ms |
| Rollback de movimentação | Card volta à coluna de origem + toast explicativo | 200ms |
| Evento no Painel de Fluxo | Traço desenhado da origem ao destino | 240ms |
| Painel do lead abre | Board reduz a largura (sem fade) | 200ms |
| Bottom sheet (mobile) | Sobe acompanhando o gesto | segue o dedo |

- Proibido: animação de entrada em seções, hover animado em cards, skeleton pulsante longo, qualquer loop ambiente.
- `prefers-reduced-motion`: todas as durações viram 0 e as mudanças acontecem por troca direta.

---

## 8. Conteúdo e voz

- Voz ativa, direta, sem desculpas: "Não foi possível mover o card: a etapa exige motivo. Informe o motivo para continuar."
- Estados vazios dizem o próximo passo: "Nenhum lead nesta etapa. Arraste um card para cá ou cadastre com N."
- Tempo relativo curto e tabular: `há 3 h`, `há 2 d 4 h`. Data absoluta no tooltip e no histórico.
- Botões com verbo e sem símbolos: `Mover`, `Salvar anotação`, `Vincular a esta conversa`.
- Rótulos em caixa normal. Nenhum texto em caps com espaçamento aberto.

---

## 9. Acessibilidade e atalhos

- Foco visível: anel de 2px em Petróleo com 2px de afastamento, em todos os elementos interativos.
- Kanban operável por teclado: setas navegam entre cards, `Espaço` pega o card, setas escolhem a coluna, `Espaço` solta, `Esc` cancela (anúncios via `aria-live` do dnd-kit).
- Atalhos: `Ctrl/Cmd+K` paleta de comandos, `N` novo lead, `/` busca, `?` lista de atalhos.
- Contraste AA verificado (§2.5). Urgência nunca é só cor: sempre acompanha texto ("SLA estourado há 3 h").
- Alvos de toque mínimos de 44px no mobile.

---

## 10. Revisão contra os anti-padrões da spec

| Anti-padrão | Situação no plano |
|---|---|
| Fundo creme + serifada de alto contraste + acento terracota | Fundo Gelo frio, sem serifa, sem terracota. O tom `etapa-6` (`#9C7A5B`) é marcador de 8px e dessaturado, nunca acento |
| Preto-quase com um único acento verde-ácido ou vermelhão | Tema escuro em azul-ardósia `#141A1D`; ação em Petróleo claro; vermelho só para urgência |
| Kit de cards SaaS (tudo em cards, mesmo raio, sombra em tudo, gradiente) | Três raios com significado, sombra só para elementos elevados, tabelas e trilhos sem card, zero gradiente |
| Eyebrow em caps tracked-out | Proibido; rótulos em caixa normal com largura condensada |
| Meta-strings unidas por ponto médio | Metadados do card em linhas separadas; no painel, pares rótulo/valor alinhados |
| Label `PALAVRA — fragmento` | Não usado |
| Monoespaçada em rótulos de dado | Instrument Sans com numerais tabulares |
| `→` grudado em botões e links | Botões só com verbo; navegação indicada por ícone separado quando necessário |
| Palavra do título destacada em itálico/cor | Títulos em peso e cor únicos |
| Fade-and-slide-up em seções e hover animado em cards | Movimento só em resposta a ação (§7) |

### O que foi reescrito após a autocrítica

| Primeira ideia (genérica) | Problema | Versão final |
|---|---|---|
| Inter + azul `#3B82F6` como primária | Assinatura de qualquer SaaS | Instrument Sans com eixo de largura + Petróleo, que só marca ação e seleção |
| Linha de "KPI cards" no topo dos painéis | Kit de cards picotado | Faixa única de números separados por divisores verticais, com variação ao lado |
| Cor da etapa pintando o fundo da coluna | Cor como hierarquia e ruído periférico | Marcador de 8px; o fundo é igual para todas as etapas |
| Card de lead com avatar, tags coloridas e contador de mensagens | Excesso de sinais competindo | Três linhas: nome, origem, tempo na etapa. Urgência na borda esquerda |
| Painel do Coordenador como feed de atividade tipo rede social | Lista genérica, não mostra fluxo | Painel de Fluxo com trilhos e traços, na aba Fluxo (§6) |
| Ganho verde e perdido vermelho | Compete com a urgência | Tipo indicado por ícone e rótulo |

---

## 11. Tokens (referência para `packages/ui`)

```css
:root {
  --cor-fundo: #F4F6F7;
  --cor-superficie: #FFFFFF;
  --cor-texto: #1C2529;
  --cor-texto-secundario: #56666E;
  --cor-divisor: #C9D2D6;
  --cor-acao: #0E5C6B;
  --cor-acao-texto: #FFFFFF;
  --cor-atencao: #855700;
  --cor-atencao-tinta: #FBF0D9;
  --cor-alerta: #B42129;
  --cor-alerta-tinta: #FBE9EA;

  --raio-estrutura: 0;
  --raio-objeto: 4px;
  --raio-flutuante: 8px;

  --fonte: "Instrument Sans", ui-sans-serif, system-ui, sans-serif;
  --largura-condensada: 80;
  --coluna-kanban: 288px;
  --painel-lead: 420px;
}
```

A validação final da tipografia (renderização do eixo de largura e dos numerais tabulares em Windows, macOS e Android) acontece na Etapa 1, junto dos tokens.
