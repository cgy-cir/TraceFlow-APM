import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import {
  parseArgs,
  scanArtifacts,
  manifest,
  urlPrefix,
} from './release-artifacts.mjs'

try {
  const args = parseArgs(process.argv.slice(2), ['release', 'url-prefix'])
  if (
    !args.release ||
    args.release !== args.release.trim() ||
    args.release.length > 100
  )
    throw new Error('A valid --release is required')
  const prefix = urlPrefix(args['url-prefix'])
  const root = fileURLToPath(new URL('../', import.meta.url))
  const env = {
    ...process.env,
    TRACEFLOW_PRIVATE_BUILD: 'true',
    VITE_TRACEFLOW_RELEASE: args.release,
    VITE_TRACEFLOW_BASE: prefix,
  }
  for (const workspace of [
    '@traceflow/shared',
    '@traceflow/web-sdk',
    '@traceflow/demo',
  ]) {
    const command = ['run', 'build', '--workspace', workspace]
    const result =
      process.platform === 'win32'
        ? spawnSync(
            process.env.ComSpec || 'cmd.exe',
            ['/d', '/s', '/c', `npm ${command.join(' ')}`],
            { cwd: root, env, stdio: 'inherit' },
          )
        : spawnSync('npm', command, { cwd: root, env, stdio: 'inherit' })
    if (result.error || result.status !== 0)
      throw new Error('Production build failed')
  }
  const directory = path.join(root, 'apps/demo/dist-private')
  const artifacts = await scanArtifacts(directory, prefix)
  await writeFile(
    path.join(directory, 'traceflow-release.json'),
    JSON.stringify(
      {
        release: args.release,
        urlPrefix: prefix,
        artifacts: manifest(artifacts),
      },
      null,
      2,
    ),
  )
  console.log(
    `Private build ready: ${artifacts.length} JS/Map pairs. Do not publish dist-private.`,
  )
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
