/**
 * Espelho dos tokens de `tokens.css`, para onde o CSS não chega: cálculo de
 * cor de etapa, canvas, e-mail, ícone do PWA e testes de contraste.
 *
 * Os dois arquivos precisam concordar. `DESIGN.md` §11 é a fonte de verdade
 * dos dois — ao mudar um valor, mudar nos três lugares.
 */

export const corClara = {
  fundo: '#F4F6F7',
  superficie: '#FFFFFF',
  texto: '#1C2529',
  textoSecundario: '#56666E',
  divisor: '#C9D2D6',
  acao: '#0E5C6B',
  acaoTexto: '#FFFFFF',
  atencao: '#855700',
  atencaoTinta: '#FBF0D9',
  alerta: '#B42129',
  alertaTinta: '#FBE9EA',
} as const;

export const corEscura = {
  fundo: '#141A1D',
  superficie: '#1C2428',
  texto: '#E2E8EA',
  textoSecundario: '#97A5AB',
  divisor: '#2C363B',
  acao: '#5DB0BF',
  acaoTexto: '#141A1D',
  atencao: '#E0A841',
  atencaoTinta: '#3B2E18',
  alerta: '#F0646A',
  alertaTinta: '#3B1F22',
} as const;

/**
 * Identidade de etapa. Oito tons dessaturados, iguais nos dois temas.
 * Etapas de tipo `ganho` e `perdido` não recebem verde nem vermelho: o tipo
 * é dito por ícone e rótulo, para não competir com a urgência.
 */
export const coresEtapa = [
  '#5B7FA6',
  '#4E8C84',
  '#6F8F4E',
  '#A68F3C',
  '#8A7BB0',
  '#9C7A5B',
  '#A0668A',
  '#6F7C86',
] as const;

/** Etapa n (1-based, como o usuário vê) → cor de identidade. */
export function corDaEtapa(posicao: number): string {
  const indice = (Math.max(1, Math.trunc(posicao)) - 1) % coresEtapa.length;
  // O módulo mantém o índice no intervalo, mas o tipo não sabe disso: a
  // primeira cor é o padrão em vez de uma asserção de não-nulo.
  return coresEtapa[indice] ?? coresEtapa[0];
}

export const raio = {
  /** Trilhos e tabelas: estrutura. */
  estrutura: '0',
  /** Cards e campos: objetos manipuláveis. */
  objeto: '4px',
  /** Só painéis flutuantes. */
  flutuante: '8px',
} as const;

export const tipografia = {
  familia: "'Instrument Sans', ui-sans-serif, system-ui, sans-serif",
  larguraNormal: 100,
  larguraCondensada: 80,
} as const;

export const medida = {
  colunaKanban: '288px',
  painelLead: '420px',
  grade: '4px',
} as const;

export type Tema = 'claro' | 'escuro';
