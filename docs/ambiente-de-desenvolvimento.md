# Ambiente de desenvolvimento

> Documento de ambiente, não de produto. Registra uma restrição da máquina de
> desenvolvimento e como conviver com ela. Última atualização: 2026-09-19.

## A restrição

A máquina de desenvolvimento tem uma Software Restriction Policy que **bloqueia
arquivos `.bat` e `.cmd` fora de `C:\Windows` e `C:\Program Files`**. A tentativa
responde:

```
Este programa está bloqueado por uma política de grupo.
```

Foi pedida uma exceção de política e a instalação do WSL2; **ambas foram
negadas**. O usuário não tem direitos de administrador na máquina. A decisão,
tomada em 2026-09-19, é conviver com a restrição.

### O que exatamente é afetado

| Caso                                         | Situação                                                         |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `.exe` em pasta de usuário                   | Funciona (`bash.exe`, `turbo.exe`, `node.exe`)                   |
| Shim POSIX do pnpm/npm (sem extensão)        | Funciona quando chamado pelo bash                                |
| `.cmd` e `.bat` em qualquer pasta de usuário | **Bloqueado**                                                    |
| `npx`                                        | **Bloqueado** (é `npx.cmd`)                                      |
| `turbo run`                                  | **Bloqueado** — o binário roda, mas invoca `pnpm.cmd` por tarefa |

Apontar o `script-shell` do pnpm para o bash **não** resolve: o bloqueio é do
arquivo `.cmd`, não do shell que o invoca.

## Como trabalhar

- **Use o bash**, não o PowerShell nem o `cmd`. O PowerShell ainda roda em
  Constrained Language Mode, o que limita scripts.
- **Instale ferramenta global com `npm i -g`**, nunca com `npx`. O destino é
  `%APPDATA%\npm`, que gera shim POSIX utilizável.
- **`%APPDATA%\npm` não está no PATH do shell.** Prefixe quando precisar:
  ```bash
  export PATH="$PATH:/c/Users/lucasmendes/AppData/Roaming/npm"
  ```
- **Chame binário do projeto pelo shim POSIX:** `./node_modules/.bin/eslint .`
- **Tarefas do monorepo vão por `pnpm -r run <script>`.** Os scripts `turbo:*`
  do `package.json` existem para o CI, que é Linux e não tem a restrição.

## Ao adicionar uma ferramenta

Rode a verificação **antes** de construir em cima dela:

```bash
pnpm run ferramentas
```

O script `scripts/verificar-ferramentas.mjs` executa cada ferramenta de verdade,
em vez de só conferir se o arquivo existe — foi assim que o Turborepo passou
despercebido, porque `turbo --version` respondia normalmente e só o `turbo run`
quebrava.

Para incluir uma ferramenta nova, acrescente-a ao manifesto no topo do script:

```js
{
  nome: 'drizzle-kit',
  escopo: 'projeto',
  args: ['--version'],
  provaReal: {
    args: ['generate', '--help'],
    descricao: 'gerar uma migration',
  },
}
```

A `provaReal` é a parte que importa: ela deve exercitar o caminho que você vai
usar de verdade, porque é lá que a política aparece. Se a ferramenta falhar na
prova real, a verificação sai com erro e pede uma decisão. Depois de decidir o
contorno, registre-o em `contornoAceito` na mesma entrada — aí ela passa a
informar sem derrubar o `pnpm run check`.

## Se a política mudar

A verificação testa a restrição a cada execução. Quando ela deixar de existir, a
saída passa a dizer:

```
Restrição de lote: AUSENTE — arquivos .cmd executam normalmente.
```

Nesse dia, vale trocar os scripts padrão do `package.json` de volta para os
`turbo:*` e recuperar o cache e o grafo de tarefas do Turborepo.
