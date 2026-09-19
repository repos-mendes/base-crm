#!/usr/bin/env node
/**
 * Verificação de ferramentas.
 *
 * A máquina de desenvolvimento tem uma política de grupo que bloqueia
 * arquivos `.bat` e `.cmd` fora de `C:\Windows` e `C:\Program Files`. Isso não
 * impede o trabalho — os shims POSIX que o pnpm gera funcionam —, mas derruba
 * qualquer ferramenta que, por dentro, dispare um `.cmd`. Foi o que aconteceu
 * com o Turborepo, que invoca `pnpm.cmd` a cada tarefa, e só descobrimos
 * depois de configurá-lo inteiro.
 *
 * Este script roda uma ferramenta de verdade e olha o resultado, em vez de
 * apenas conferir se o arquivo existe. Rode-o ao adicionar qualquer ferramenta
 * nova, antes de construir algo em cima dela.
 *
 * Uso:
 *   node scripts/verificar-ferramentas.mjs
 *   node scripts/verificar-ferramentas.mjs --json
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const noWindows = process.platform === 'win32';
const formatoJson = process.argv.includes('--json');

/** A política responde isto, em português ou inglês, conforme a instalação. */
const MARCAS_DE_BLOQUEIO = [/bloqueado por uma pol/i, /blocked by group policy/i];

/**
 * Ferramentas verificadas.
 *
 * `escopo: 'projeto'` vem do `node_modules` e precisa existir em qualquer
 * máquina, o CI incluído — ausência é falha. `escopo: 'global'` é instalado por
 * quem desenvolve; ausência vira aviso, não erro.
 *
 * `provaReal` é o que torna esta verificação útil para ferramenta nova:
 * `--version` só prova que o binário responde, e o Turborepo respondia. O que
 * quebra é o fluxo de trabalho, porque ele dispara um `.cmd` por dentro. Ao
 * adicionar uma ferramenta, dê a ela uma `provaReal` que exercite o caminho
 * que você vai usar de verdade — um build curto, uma listagem, um dry-run que
 * ainda assim gere processos.
 */
const ferramentas = [
  { nome: 'node', escopo: 'global', args: ['--version'] },
  { nome: 'pnpm', escopo: 'global', args: ['--version'] },
  { nome: 'git', escopo: 'global', args: ['--version'] },
  { nome: 'tsc', escopo: 'projeto', args: ['--version'] },
  { nome: 'eslint', escopo: 'projeto', args: ['--version'] },
  { nome: 'prettier', escopo: 'projeto', args: ['--version'] },
  {
    nome: 'turbo',
    escopo: 'projeto',
    args: ['--version'],
    provaReal: {
      args: ['run', 'typecheck', '--filter=@base-crm/config'],
      descricao: 'executar uma tarefa do monorepo',
    },
    // Contorno já decidido: os scripts padrão usam `pnpm -r`, e os `turbo:*`
    // ficam para o CI. Sem esta linha, uma falha de fluxo derruba a verificação
    // — que é o que deve acontecer com ferramenta nova.
    contornoAceito: 'scripts padrão usam `pnpm -r`; os `turbo:*` rodam no CI (Linux)',
  },
  { nome: 'gh', escopo: 'global', args: ['--version'] },
  { nome: 'supabase', escopo: 'global', args: ['--version'] },
  { nome: 'wrangler', escopo: 'global', args: ['--version'] },
];

/** Caminhos onde um executável pode estar, do mais específico ao mais geral. */
function candidatos(nome) {
  const lista = [join(raiz, 'node_modules', '.bin', nome)];
  if (noWindows && process.env['APPDATA']) {
    lista.push(join(process.env['APPDATA'], 'npm', nome));
  }
  return lista;
}

function pareceBloqueado(texto) {
  return MARCAS_DE_BLOQUEIO.some((marca) => marca.test(texto));
}

function executar(comando, args) {
  const r = spawnSync(comando, args, { encoding: 'utf8', shell: false, timeout: 20_000 });
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  return { erro: r.error, status: r.status, saida };
}

/**
 * Os shims que o pnpm e o npm geram sem extensão são scripts de shell. O
 * Windows não sabe executá-los sozinho, e o `.cmd` equivalente está bloqueado
 * — então vão pelo bash, que é como nós os chamamos no dia a dia.
 */
function executarShim(caminho, args) {
  if (!noWindows) {
    return executar(caminho, args);
  }
  const tentativas = [
    'bash',
    'C:\\Users\\' +
      (process.env['USERNAME'] ?? '') +
      '\\AppData\\Local\\Programs\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\bin\\bash.exe',
  ];
  let ultima = { erro: new Error('bash não encontrado'), status: null, saida: '' };
  for (const bash of tentativas) {
    // O bash espera o caminho em barras normais.
    const r = executar(bash, [caminho.replaceAll('\\', '/'), ...args]);
    if (!r.erro) return r;
    ultima = r;
  }
  return ultima;
}

/**
 * Confirma se a restrição de `.bat`/`.cmd` continua valendo. Se um dia a
 * política mudar, este é o aviso de que dá para voltar ao caminho normal e
 * usar o Turborepo de novo.
 */
function verificarRestricaoDeLote() {
  if (!noWindows) {
    return { aplicavel: false, bloqueado: false };
  }
  const pasta = mkdtempSync(join(tmpdir(), 'verif-lote-'));
  const arquivo = join(pasta, 'teste.cmd');
  try {
    writeFileSync(arquivo, '@echo off\r\necho lote-ok\r\n');
    const { saida } = executar(process.env['COMSPEC'] ?? 'cmd.exe', ['/c', arquivo]);
    return { aplicavel: true, bloqueado: pareceBloqueado(saida), saida };
  } finally {
    rmSync(pasta, { recursive: true, force: true });
  }
}

function verificarFerramenta(ferramenta) {
  const caminhos = candidatos(ferramenta.nome).filter((c) => existsSync(c));
  // Sem shim POSIX próprio, resta o PATH — que no bash acha o shim certo.
  const alvos = caminhos.length > 0 ? caminhos : [ferramenta.nome];

  for (const alvo of alvos) {
    // Caminho resolvido é shim de arquivo; nome solto vai pelo PATH.
    const { erro, status, saida } =
      alvo === ferramenta.nome
        ? executar(alvo, ferramenta.args)
        : executarShim(alvo, ferramenta.args);
    if (pareceBloqueado(saida)) {
      return { situacao: 'bloqueada', caminho: alvo, detalhe: saida.split('\n')[0] };
    }
    if (!erro && status === 0) {
      const versao = saida.split('\n')[0];
      if (!ferramenta.provaReal) {
        return { situacao: 'ok', caminho: alvo, versao };
      }
      // Responder a `--version` não prova nada sobre o fluxo real.
      const prova =
        alvo === ferramenta.nome
          ? executar(alvo, ferramenta.provaReal.args)
          : executarShim(alvo, ferramenta.provaReal.args);
      if (pareceBloqueado(prova.saida)) {
        return {
          situacao: 'parcial',
          caminho: alvo,
          versao,
          detalhe:
            `responde a --version, mas falha ao ${ferramenta.provaReal.descricao}: ` +
            'dispara um .cmd por dentro',
        };
      }
      return { situacao: 'ok', caminho: alvo, versao };
    }
  }
  return { situacao: 'ausente' };
}

const lote = verificarRestricaoDeLote();
const resultados = ferramentas.map((f) => ({ ...f, ...verificarFerramenta(f) }));

const bloqueadas = resultados.filter((r) => r.situacao === 'bloqueada');
const ausentesObrigatorias = resultados.filter(
  (r) => r.situacao === 'ausente' && r.escopo === 'projeto',
);
const ausentesOpcionais = resultados.filter(
  (r) => r.situacao === 'ausente' && r.escopo === 'global',
);
/** Fluxo quebrado, mas com contorno já decidido: informa, não derruba. */
const contornadas = resultados.filter((r) => r.situacao === 'parcial' && r.contornoAceito);
/** Fluxo quebrado e sem contorno: é ferramenta nova esbarrando na política. */
const quebradas = resultados.filter((r) => r.situacao === 'parcial' && !r.contornoAceito);

if (formatoJson) {
  console.log(JSON.stringify({ restricaoDeLote: lote, ferramentas: resultados }, null, 2));
} else {
  console.log('\nVerificação de ferramentas\n');

  if (lote.aplicavel) {
    console.log(
      lote.bloqueado
        ? 'Restrição de lote: ATIVA — arquivos .bat e .cmd são bloqueados por política.\n' +
            '  Consequência: use os shims POSIX pelo bash (./node_modules/.bin/<bin>)\n' +
            '  ou `pnpm -r run <script>`. Evite `npx` e `turbo run`.\n'
        : 'Restrição de lote: AUSENTE — arquivos .cmd executam normalmente.\n' +
            '  A política mudou. Vale voltar os scripts para o Turborepo\n' +
            '  (`turbo:*` no package.json) e recuperar cache e grafo de tarefas.\n',
    );
  }

  for (const r of resultados) {
    const rotulo = r.escopo === 'projeto' ? 'projeto' : 'global ';
    if (r.situacao === 'ok') {
      console.log(`  ok        ${rotulo}  ${r.nome.padEnd(10)} ${r.versao ?? ''}`);
    } else if (r.situacao === 'parcial') {
      const marca = r.contornoAceito ? 'contorno ' : 'QUEBRADA ';
      console.log(`  ${marca} ${rotulo}  ${r.nome.padEnd(10)} ${r.versao ?? ''}`);
    } else if (r.situacao === 'bloqueada') {
      console.log(`  BLOQUEADA ${rotulo}  ${r.nome.padEnd(10)} ${r.detalhe ?? ''}`);
    } else {
      console.log(`  ausente   ${rotulo}  ${r.nome}`);
    }
  }

  if (contornadas.length > 0) {
    console.log('\nFluxo quebrado pela política, com contorno já decidido:');
    for (const r of contornadas) {
      console.log(`  ${r.nome}: ${r.detalhe ?? ''}`);
      console.log(`    contorno: ${r.contornoAceito ?? ''}`);
    }
  }

  if (ausentesOpcionais.length > 0) {
    console.log(
      `\nNão encontradas (instalação de quem desenvolve, não falha o CI): ` +
        ausentesOpcionais.map((r) => r.nome).join(', '),
    );
  }

  if (bloqueadas.length > 0 || ausentesObrigatorias.length > 0 || quebradas.length > 0) {
    console.log('\nProblemas que precisam de ação:');
    for (const r of quebradas) {
      console.log(`  ${r.nome}: ${r.detalhe ?? ''}`);
      console.log(
        '    Decida o contorno ANTES de construir em cima dela, e registre-o\n' +
          '    em `contornoAceito` no manifesto deste script.',
      );
    }
    for (const r of bloqueadas) {
      console.log(`  ${r.nome} está bloqueada pela política — chame o shim POSIX pelo bash.`);
    }
    for (const r of ausentesObrigatorias) {
      console.log(`  ${r.nome} não foi encontrada. Rode \`pnpm install\`.`);
    }
    console.log('');
  } else {
    console.log('\nNenhum impedimento.\n');
  }
}

const falhou = bloqueadas.length > 0 || ausentesObrigatorias.length > 0 || quebradas.length > 0;
process.exit(falhou ? 1 : 0);
