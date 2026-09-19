/**
 * Neutralidade de nicho.
 *
 * O produto nasce da rotina de corretagem imobiliária, mas não pode carregar
 * esse vocabulário no domínio, no schema, nas rotas nem na interface — a ideia
 * é poder vendê-lo para uma escola ou uma clínica sem refactor
 * (`prompt-crm-leads.md` §1).
 *
 * O script `scripts/lint-vocabulario.mjs` usa estas listas no CI.
 */

/** O vocabulário que o produto usa. Qualquer conceito novo deve caber aqui. */
export const vocabularioCanonico = [
  'lead',
  'operador',
  'coordenador',
  'gestor',
  'fila',
  'etapa',
  'distribuicao',
  'conversa',
  'organizacao',
  'pipeline',
  'anotacao',
  'evento',
] as const;

/**
 * Termos de nicho que não podem aparecer em código, schema ou texto de
 * interface. Cada entrada traz a alternativa neutra, para o erro do lint
 * dizer o que fazer em vez de só reclamar.
 */
export const termosProibidos: readonly {
  termo: string;
  alternativa: string;
}[] = [
  { termo: 'imovel', alternativa: 'use um campo customizado da organização' },
  { termo: 'imóvel', alternativa: 'use um campo customizado da organização' },
  { termo: 'imoveis', alternativa: 'use um campo customizado da organização' },
  { termo: 'imóveis', alternativa: 'use um campo customizado da organização' },
  { termo: 'empreendimento', alternativa: 'use um campo customizado da organização' },
  { termo: 'unidade', alternativa: 'use um campo customizado da organização' },
  { termo: 'corretor', alternativa: 'operador' },
  { termo: 'corretora', alternativa: 'operadora' },
  { termo: 'corretagem', alternativa: 'atendimento' },
  { termo: 'visita', alternativa: 'conversa, ou um evento do lead' },
  { termo: 'apartamento', alternativa: 'use um campo customizado da organização' },
  { termo: 'metragem', alternativa: 'use um campo customizado da organização' },
  { termo: 'condominio', alternativa: 'use um campo customizado da organização' },
  { termo: 'condomínio', alternativa: 'use um campo customizado da organização' },
  { termo: 'locacao', alternativa: 'use um campo customizado da organização' },
  { termo: 'locação', alternativa: 'use um campo customizado da organização' },
];

export type TermoProibido = (typeof termosProibidos)[number];
