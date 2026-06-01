#!/usr/bin/env bun
import { format } from './index'

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const HELP = `htmlegy-format - format htmlegy source

Usage:
  htmlegy-format [options] [file]
  cat file.htmlegy | htmlegy-format [options]

Reads from the given file or stdin and writes formatted output to stdout.
On a parse error, the original input is echoed to stdout and the error is
printed to stderr with a non-zero exit code.

Options:
  -w, --width <n>        maximum print width before breaking (default 80)
  -i, --indent-size <n>  number of spaces per indent level (default 2)
  -h, --help             show this help and exit
`

async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP)
    return
  }

  const widthFlag = args.findIndex((a) => a === '--width' || a === '-w')
  const printWidth =
    widthFlag >= 0 && args[widthFlag + 1] !== undefined
      ? Number(args[widthFlag + 1])
      : undefined

  const indentFlag = args.findIndex((a) => a === '--indent-size' || a === '-i')
  const indentSize =
    indentFlag >= 0 && args[indentFlag + 1] !== undefined
      ? Number(args[indentFlag + 1])
      : undefined

  const numericArgs = new Set([String(printWidth), String(indentSize)])
  const fileArg = args.find((a) => !a.startsWith('-') && !numericArgs.has(a))
  const src = fileArg
    ? await (await import('node:fs/promises')).readFile(fileArg, 'utf8')
    : await readStdin()

  try {
    process.stdout.write(format(src, { printWidth, indentSize }))
  } catch (err) {
    process.stderr.write(
      `htmlegy-format: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exitCode = 1
    process.stdout.write(src)
  }
}

void main()
