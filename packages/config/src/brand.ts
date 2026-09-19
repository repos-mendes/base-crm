/**
 * Marca do produto, em um só lugar.
 *
 * O nome é provisório (ver `PLANO.md` §1): trocar aqui deve bastar para
 * renomear o produto inteiro em um commit. Nada de nome de produto escrito
 * à mão em componente, e-mail, título de página ou texto de erro.
 */
export const marca = {
  /** Nome exibido ao usuário. */
  nome: 'Base CRM',
  /** Nome curto, para onde não cabe o completo (aba do navegador, PWA). */
  nomeCurto: 'Base',
  /** Frase de apoio, usada em login e em metadados. */
  descricao: 'Registro e acompanhamento de leads',
  /** Identificador estável para chaves técnicas: storage, cookies, prefixos. */
  slug: 'base-crm',
} as const;

export type Marca = typeof marca;
