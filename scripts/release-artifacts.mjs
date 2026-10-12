import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const sha256 = (data) => createHash('sha256').update(data).digest('hex')

export function parseArgs(argv, allowed) {
  const args = {}
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, '')
    if (
      !argv[i]?.startsWith('--') ||
      !allowed.includes(name) ||
      !argv[i + 1] ||
      argv[i + 1].startsWith('--') ||
      name in args
    ) {
      throw new Error('Invalid or duplicate command argument')
    }
    args[name] = argv[i + 1]
  }
  return args
}

export function urlPrefix(value = '/') {
  if (
    !value.startsWith('/') ||
    !value.endsWith('/') ||
    /[^A-Za-z0-9/_.~!$&'()*+,;=:@-]/.test(value) ||
    value.split('/').some((part) => part === '.' || part === '..')
  ) {
    throw new Error('url-prefix must be a pathname beginning and ending with /')
  }
  return value
}

export async function walkFiles(directory) {
  const root = await realpath(directory)
  const files = []
  async function visit(relative) {
    for (const item of await readdir(path.join(root, relative), {
      withFileTypes: true,
    })) {
      const next = path.join(relative, item.name)
      if (item.isSymbolicLink())
        throw new Error('Symbolic links are not allowed in build artifacts')
      if (item.isDirectory()) await visit(next)
      else if (item.isFile()) files.push(next)
      else throw new Error('Unsupported build file type')
    }
  }
  await visit('')
  return { root, files: files.sort() }
}

export async function scanArtifacts(directory, prefix = '/') {
  prefix = urlPrefix(prefix)
  const { root, files } = await walkFiles(directory)
  const javascript = files.filter((file) => file.endsWith('.js'))
  if (javascript.length === 0 || javascript.length > 100)
    throw new Error('Expected 1 to 100 JavaScript artifacts')
  const maps = files.filter((file) => file.endsWith('.js.map'))
  if (maps.some((file) => !javascript.includes(file.slice(0, -4))))
    throw new Error('Source Map has no corresponding JS file')
  let total = 0
  const artifacts = []
  for (const file of javascript) {
    if (!maps.includes(`${file}.map`))
      throw new Error('JavaScript artifact is missing its Source Map')
    const jsFile = path.join(root, file)
    const mapFile = `${jsFile}.map`
    const jsSize = (await stat(jsFile)).size
    const mapSize = (await stat(mapFile)).size
    total += mapSize
    if (
      jsSize < 1 ||
      mapSize < 1 ||
      jsSize > 5 * 1024 * 1024 ||
      mapSize > 5 * 1024 * 1024 ||
      total > 100 * 1024 * 1024
    ) {
      throw new Error('Build artifacts exceed upload size limits')
    }
    const relativeUrl = file.split(path.sep).map(encodeURIComponent).join('/')
    artifacts.push({
      artifactPath: prefix + relativeUrl,
      jsSha256: sha256(await readFile(jsFile)),
      mapSha256: sha256(await readFile(mapFile)),
      jsFile,
      mapFile,
    })
  }
  return artifacts.sort((left, right) =>
    left.artifactPath.localeCompare(right.artifactPath),
  )
}

export const manifest = (artifacts) =>
  artifacts.map(({ artifactPath, jsSha256, mapSha256 }) => ({
    artifactPath,
    jsSha256,
    mapSha256,
  }))

export async function verifyBuildMetadata(
  directory,
  release,
  prefix,
  artifacts,
) {
  let metadata
  try {
    metadata = JSON.parse(
      await readFile(path.join(directory, 'traceflow-release.json'), 'utf8'),
    )
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error('Invalid private build metadata')
  }
  if (
    metadata.release !== release ||
    metadata.urlPrefix !== prefix ||
    JSON.stringify(metadata.artifacts) !== JSON.stringify(manifest(artifacts))
  ) {
    throw new Error(
      'Release, URL prefix or checksums differ from the original build',
    )
  }
  return metadata
}
