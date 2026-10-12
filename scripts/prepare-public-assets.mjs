import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  parseArgs,
  walkFiles,
  scanArtifacts,
  verifyBuildMetadata,
  sha256,
} from './release-artifacts.mjs'

export async function preparePublicAssets(args) {
  if (!args.dist || !args.out || !args.release)
    throw new Error('dist, out and release are required')
  const artifacts = await scanArtifacts(args.dist, args['url-prefix'] || '/')
  await verifyBuildMetadata(
    args.dist,
    args.release,
    args['url-prefix'] || '/',
    artifacts,
  )
  const { root, files } = await walkFiles(args.dist)
  const output = path.resolve(args.out)
  const relative = path.relative(root, output)
  if (
    !relative ||
    (!relative.startsWith('..' + path.sep) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
    throw new Error('Public output must not be inside the private build')
  try {
    await stat(output)
    throw new Error(
      'Public output already exists; choose a new output directory',
    )
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const allowed = new Set([
    '.html',
    '.js',
    '.css',
    '.svg',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.ico',
    '.woff',
    '.woff2',
    '.ttf',
  ])
  const publicFiles = files.filter(
    (file) =>
      !file.endsWith('.map') &&
      path.basename(file) !== 'traceflow-release.json',
  )
  for (const file of publicFiles) {
    if (!allowed.has(path.extname(file)))
      throw new Error('Unexpected private file in build output')
    if (
      file.endsWith('.js') &&
      /sourceMappingURL\s*=/.test(await readFile(path.join(root, file), 'utf8'))
    )
      throw new Error('Public JavaScript must use hidden Source Maps')
  }
  await mkdir(output, { recursive: true })
  for (const file of publicFiles) {
    const target = path.join(output, file)
    const source = path.join(root, file)
    const bytes = await readFile(source)
    if (file.endsWith('.js')) {
      const artifact = artifacts.find((item) => item.jsFile === source)
      if (
        !artifact ||
        sha256(bytes) !== artifact.jsSha256 ||
        /sourceMappingURL\s*=/.test(bytes.toString('utf8'))
      )
        throw new Error(
          'Build changed while preparing public assets; do not publish the partial output',
        )
    }
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes)
  }
  console.log(
    `Public directory ready: ${publicFiles.length} files, no Source Maps.`,
  )
  return output
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await preparePublicAssets(
      parseArgs(process.argv.slice(2), [
        'dist',
        'out',
        'release',
        'url-prefix',
      ]),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
