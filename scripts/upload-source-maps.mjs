import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  parseArgs,
  scanArtifacts,
  manifest,
  verifyBuildMetadata,
  sha256,
  urlPrefix,
} from "./release-artifacts.mjs";

export async function uploadBuild(args, env = process.env) {
  const applicationId = Number(args["application-id"]);
  if (
    !Number.isSafeInteger(applicationId) ||
    applicationId < 1 ||
    !args.release ||
    !args.dist
  )
    throw new Error("application-id, release and dist are required");
  const prefix = urlPrefix(args["url-prefix"]);
  const artifacts = await scanArtifacts(args.dist, prefix);
  await verifyBuildMetadata(args.dist, args.release, prefix, artifacts);
  return withUploadSession(async ({ fetchSession, write }) => {
    return uploadArtifacts(args, applicationId, artifacts, fetchSession, write);
  }, env);
}

export async function withUploadSession(action, env = process.env) {
  if (
    !env.TRACEFLOW_API_BASE ||
    !env.TRACEFLOW_UPLOAD_EMAIL ||
    !env.TRACEFLOW_UPLOAD_PASSWORD
  )
    throw new Error(
      "Upload API address and administrator credentials are required",
    );
  const base = new URL(env.TRACEFLOW_API_BASE);
  if (
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !["http:", "https:"].includes(base.protocol)
  )
    throw new Error("Invalid upload API address");
  if (
    base.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  )
    throw new Error("Remote upload requires HTTPS");
  const address = base.href.replace(/\/$/, "");
  const cookies = new Map();

  async function fetchSession(route, init = {}, attempts = 3) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const headers = new Headers(init.headers);
        if (cookies.size)
          headers.set(
            "Cookie",
            [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          );
        const response = await fetch(address + route, {
          ...init,
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
        });
        for (const cookie of response.headers.getSetCookie()) {
          const [pair] = cookie.split(";");
          const separator = pair.indexOf("=");
          const key = pair.slice(0, separator),
            value = pair.slice(separator + 1);
          if (/max-age=0/i.test(cookie) || !value) cookies.delete(key);
          else cookies.set(key, value);
        }
        if (
          (response.status === 429 || response.status >= 500) &&
          attempt + 1 < attempts
        ) {
          await response.arrayBuffer();
          await new Promise((resolve) =>
            setTimeout(resolve, 300 * (attempt + 1)),
          );
          continue;
        }
        if (!response.ok) {
          const error = new Error(
            `Upload API returned HTTP ${response.status}`,
          );
          error.permanent = response.status !== 429 && response.status < 500;
          throw error;
        }
        return response;
      } catch (error) {
        if (error.permanent || attempt + 1 === attempts) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, 300 * (attempt + 1)),
        );
      }
    }
  }

  async function write(route, init, attempts = 3) {
    const token = await (await fetchSession("/auth/csrf")).json();
    if (typeof token.headerName !== "string" || typeof token.token !== "string")
      throw new Error("Invalid CSRF response");
    const headers = new Headers(init.headers);
    headers.set(token.headerName, token.token);
    return fetchSession(route, { ...init, headers }, attempts);
  }

  let loggedIn = false;
  try {
    await write(
      "/auth/login",
      {
        method: "POST",
        body: new URLSearchParams({
          email: env.TRACEFLOW_UPLOAD_EMAIL,
          password: env.TRACEFLOW_UPLOAD_PASSWORD,
        }),
      },
      1,
    );
    loggedIn = true;
    return await action({ fetchSession, write });
  } finally {
    if (loggedIn) {
      try {
        await write("/auth/logout", { method: "POST" }, 1);
      } catch {
        console.error(
          "Upload session logout could not be confirmed; session will expire.",
        );
      }
    }
  }
}

async function uploadArtifacts(
  args,
  applicationId,
  artifacts,
  fetchSession,
  write,
) {
  const detail = await (
    await write("/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId,
        releaseName: args.release,
        commitSha: args.commit || undefined,
        artifacts: manifest(artifacts),
      }),
    })
  ).json();
  const id = detail.release.id;
  const scope = `?applicationId=${applicationId}`;
  const uploaded = await (
    await fetchSession(`/releases/${id}/source-maps${scope}`)
  ).json();
  for (const artifact of artifacts) {
    const previous = uploaded.items.find(
      (item) => item.artifactPath === artifact.artifactPath,
    );
    if (previous) {
      if (
        previous.jsSha256 !== artifact.jsSha256 ||
        previous.mapSha256 !== artifact.mapSha256
      )
        throw new Error("Stored artifact conflicts with local build");
      continue;
    }
    const js = await readFile(artifact.jsFile),
      map = await readFile(artifact.mapFile);
    if (sha256(js) !== artifact.jsSha256 || sha256(map) !== artifact.mapSha256)
      throw new Error("Build files changed during upload");
    const data = new FormData();
    data.set("artifactPath", artifact.artifactPath);
    data.set(
      "javascript",
      new Blob([js]),
      artifact.artifactPath.split("/").at(-1),
    );
    data.set(
      "sourceMap",
      new Blob([map]),
      artifact.artifactPath.split("/").at(-1) + ".map",
    );
    // An uncertain POST result is reconciled through metadata before trying the idempotent upload again.
    try {
      await write(
        `/releases/${id}/source-maps${scope}`,
        { method: "POST", body: data },
        1,
      );
    } catch (error) {
      if (error.permanent) throw error;
      const latest = await (
        await fetchSession(`/releases/${id}/source-maps${scope}`)
      ).json();
      const accepted = latest.items.find(
        (item) =>
          item.artifactPath === artifact.artifactPath &&
          item.jsSha256 === artifact.jsSha256 &&
          item.mapSha256 === artifact.mapSha256,
      );
      if (!accepted)
        await write(`/releases/${id}/source-maps${scope}`, {
          method: "POST",
          body: data,
        });
    }
  }
  const finalized = await (
    await write(`/releases/${id}/finalize${scope}`, { method: "POST" })
  ).json();
  console.log(
    `Release ${id} finalized: ${finalized.release.artifactCount} artifacts.`,
  );
  return finalized;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await uploadBuild(
      parseArgs(process.argv.slice(2), [
        "application-id",
        "release",
        "dist",
        "url-prefix",
        "commit",
      ]),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
