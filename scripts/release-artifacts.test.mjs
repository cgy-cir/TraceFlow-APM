import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  symlink,
  rm,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  scanArtifacts,
  sha256,
  verifyBuildMetadata,
  manifest,
  parseArgs,
  urlPrefix,
} from './release-artifacts.mjs'
import { preparePublicAssets } from './prepare-public-assets.mjs'

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'traceflow-release-test-'))
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('traceflow-release-test-'))
    return rm(root, { recursive: true, force: true })
  })
  const dist = path.join(root, 'private')
  await mkdir(path.join(dist, 'assets'), { recursive: true })
  await writeFile(path.join(dist, 'assets/a.js'), 'throw new Error("fixture")')
  await writeFile(
    path.join(dist, 'assets/a.js.map'),
    JSON.stringify({
      version: 3,
      file: 'a.js',
      sources: ['src/a.ts'],
      names: [],
      mappings: 'AAAA',
    }),
  )
  await writeFile(
    path.join(dist, 'index.html'),
    '<script src="/assets/a.js"></script>',
  )
  return { root, dist }
}

test('scanner pairs chunks and computes deployment paths and original byte checksums', async (t) => {
  const { dist } = await fixture(t)
  await writeFile(path.join(dist, 'assets/lazy.js'), 'export default 1')
  await writeFile(
    path.join(dist, 'assets/lazy.js.map'),
    JSON.stringify({
      version: 3,
      file: 'lazy.js',
      sources: ['src/lazy.ts'],
      names: [],
      mappings: 'AAAA',
    }),
  )
  const artifacts = await scanArtifacts(dist, '/base/')
  assert.equal(artifacts.length, 2)
  assert.equal(artifacts[0].artifactPath, '/base/assets/a.js')
  assert.equal(
    artifacts[0].jsSha256,
    sha256(await readFile(artifacts[0].jsFile)),
  )
  await writeFile(
    path.join(dist, 'traceflow-release.json'),
    JSON.stringify({
      release: 'fixture@1',
      urlPrefix: '/base/',
      artifacts: manifest(artifacts),
    }),
  )
  await verifyBuildMetadata(dist, 'fixture@1', '/base/', artifacts)
  await assert.rejects(
    verifyBuildMetadata(dist, 'wrong-version', '/base/', artifacts),
  )
  await writeFile(artifacts[0].jsFile, 'changed build')
  await assert.rejects(
    verifyBuildMetadata(
      dist,
      'fixture@1',
      '/base/',
      await scanArtifacts(dist, '/base/'),
    ),
  )
})

test('scanner rejects unpaired files and empty or oversized artifacts', async (t) => {
  const { dist } = await fixture(t)
  await writeFile(path.join(dist, 'assets/b.js'), 'export default 1')
  await assert.rejects(scanArtifacts(dist), /missing/)
  await rm(path.join(dist, 'assets/b.js'))
  await writeFile(
    path.join(dist, 'assets/a.js'),
    Buffer.alloc(5 * 1024 * 1024 + 1),
  )
  await assert.rejects(scanArtifacts(dist), /size limits/)
})

test('scanner refuses symlinks', async (t) => {
  const { dist, root } = await fixture(t)
  await mkdir(path.join(root, 'external'))
  await symlink(
    path.join(root, 'external'),
    path.join(dist, 'linked'),
    'junction',
  )
  await assert.rejects(scanArtifacts(dist), /Symbolic links/)
})

test('public packaging excludes maps and metadata and refuses existing outputs', async (t) => {
  const { dist, root } = await fixture(t)
  const artifacts = await scanArtifacts(dist)
  await writeFile(
    path.join(dist, 'traceflow-release.json'),
    JSON.stringify({
      release: 'fixture@1',
      urlPrefix: '/',
      artifacts: manifest(artifacts),
    }),
  )
  const output = path.join(root, 'public')
  await preparePublicAssets({ dist, out: output, release: 'fixture@1' })
  assert.deepEqual(await readdir(path.join(output, 'assets')), ['a.js'])
  assert.deepEqual((await readdir(output)).sort(), ['assets', 'index.html'])
  assert.equal(
    await readFile(path.join(output, 'assets/a.js'), 'utf8'),
    await readFile(artifacts[0].jsFile, 'utf8'),
  )
  await assert.rejects(
    preparePublicAssets({ dist, out: output, release: 'fixture@1' }),
    /already exists/,
  )
  await assert.rejects(
    preparePublicAssets({
      dist,
      out: path.join(dist, 'public'),
      release: 'fixture@1',
    }),
    /inside/,
  )
})

test('public packaging rejects sourceMappingURL and unexpected private files', async (t) => {
  const { dist, root } = await fixture(t)
  await writeFile(
    path.join(dist, 'assets/a.js'),
    '//# sourceMappingURL=a.js.map',
  )
  await assert.rejects(
    preparePublicAssets({
      dist,
      out: path.join(root, 'public'),
      release: 'fixture@1',
    }),
    /hidden/,
  )
  await writeFile(path.join(dist, 'assets/a.js'), 'export default 1')
  await writeFile(path.join(dist, 'secret.env'), 'secret')
  await assert.rejects(
    preparePublicAssets({
      dist,
      out: path.join(root, 'public'),
      release: 'fixture@1',
    }),
    /private file/,
  )
})

test('arguments and URL prefixes are strict', () => {
  assert.deepEqual(parseArgs(['--release', 'one'], ['release']), {
    release: 'one',
  })
  assert.throws(() =>
    parseArgs(['--release', 'one', '--release', 'two'], ['release']),
  )
  assert.throws(() => urlPrefix('/../'))
  assert.throws(() => urlPrefix('https://cdn.example.com/'))
})
