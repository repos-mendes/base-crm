#!/usr/bin/env node
/**
 * Lint de vocabulário de nicho.
 *
 * Falha o CI se um termo do mercado imobiliário aparecer em código, schema,
 * estilo ou texto de interface. Os documentos de decisão na raiz ficam de fora
 * de propósito: eles precisam citar os termos para explicar por que são
 * proibidos.
 *
 * Uso: node scripts/lint-vocabulario.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));

// Node 24 remove as anotações de tipo sozinho, então o .ts é importado direto:
// a lista de termos vive em um lugar só.
const { termosProibidos } = await import(
  new URL('../packages/config/src/vocabulario.ts', import.meta.url).href
);

/** Pastas varridas. O resto da raiz é documentação. */
const alvos = ['apps', 'packages', 'supabase', 'scripts'];

const extensoes = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.sql',
  '.css',
  '.json',
  '.html',
]);

/** Arquivos que existem justamente para declarar os termos proibidos. */
const isentos = new Set(
  ['packages/config/src/vocabulario.ts', 'scripts/lint-vocabulario.mjs'].map((p) =>
    p.split('/').join(sep),
  ),
);

const ignorados = new Set([
  'node_modules',
  '.next',
  '.open-next',
  '.turbo',
  '.wrangler',
  'dist',
  'build',
  'coverage',
  '.git',
]);

async function* arquivos(dir) {
  let entradas;
  try {
    entradas = await readdir(dir, { withFileTypes: true });
  } catch {
    return; // pasta ainda não existe neste estágio do projeto
  }
  for (const entrada of entradas) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      if (ignorados.has(entrada.name)) continue;
      yield* arquivos(caminho);
    } else if (extensoes.has(entrada.name.slice(entrada.name.lastIndexOf('.')))) {
      yield caminho;
    }
  }
}

const padroes = termosProibidos.map(({ termo, alternativa }) => ({
  termo,
  alternativa,
  regex: new RegExp(`(?<!\\p{L})${termo}(?!\\p{L})`, 'giu'),
}));

const ocorrencias = [];

for (const alvo of alvos) {
  for await (const caminho of arquivos(join(raiz, alvo))) {
    const rel = relative(raiz, caminho);
    if (isentos.has(rel)) continue;

    const conteudo = await readFile(caminho, 'utf8');
    const linhas = conteudo.split(/\r?\n/);

    linhas.forEach((linha, i) => {
      for (const { termo, alternativa, regex } of padroes) {
        regex.lastIndex = 0;
        if (regex.test(linha)) {
          ocorrencias.push({
            arquivo: rel.split(sep).join('/'),
            linha: i + 1,
            termo,
            alternativa,
            trecho: linha.trim().slice(0, 100),
          });
        }
      }
    });
  }
}

if (ocorrencias.length === 0) {
  console.log('Vocabulário neutro: nenhum termo de nicho encontrado.');
  process.exit(0);
}

console.error(`\n${ocorrencias.length} ocorrência(s) de vocabulário de nicho:\n`);
for (const o of ocorrencias) {
  console.error(`  ${o.arquivo}:${o.linha}  "${o.termo}" → ${o.alternativa}`);
  console.error(`    ${o.trecho}`);
}
console.error(
  '\nO produto precisa servir a uma escola ou clínica sem refactor.' +
    '\nEspecificidade de mercado entra por campos customizados da organização.\n',
);
process.exit(1);
