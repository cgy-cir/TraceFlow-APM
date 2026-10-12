import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { uploadBuild, withUploadSession } from "./upload-source-maps.mjs";
import { preparePublicAssets } from "./prepare-public-assets.mjs";
import { sha256, walkFiles } from "./release-artifacts.mjs";

export async function ensureDemoApplication(api, origin, requestedId) {
  const url = new URL(origin);
  if (url.origin !== origin || url.protocol !== "https:")
    throw new Error("Demo origin must be an HTTPS origin");
  if (requestedId && !/^[1-9][0-9]*$/.test(requestedId))
    throw new Error("Invalid application ID");
  const { items } = await (await api.fetchSession("/applications")).json();
  const matches = requestedId
    ? items.filter((item) => String(item.id) === requestedId)
    : items.filter((item) => item.name === "Demo Web");
  if (matches.length > 1)
    throw new Error(
      "Multiple Demo Web applications found; specify an application ID",
    );
  let application = matches[0];
  if (!application) {
    if (requestedId) throw new Error("Requested application does not exist");
    application = await (
      await api.write(
        "/applications",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Demo Web", allowedOrigins: [origin] }),
        },
        1,
      )
    ).json();
  }
  if (
    application.status !== "active" ||
    !application.allowedOrigins.includes(origin) ||
    !Number.isSafeInteger(application.id) ||
    application.id < 1 ||
    !/^tf_app_[a-f0-9]{32}$/.test(application.appKey)
  ) {
    throw new Error(
      "Application must be active with a production App Key and the Demo origin allowed",
    );
  }
  return application;
}

const metadataFile = "demo-deployment.json";
const privateDist = "apps/demo/dist-private";
const publicDist = "apps/demo/dist-public-production";

async function metadata() {
  return JSON.parse(await readFile(metadataFile, "utf8"));
}

export async function runDemoStep(step, env = process.env) {
  if (step === "configure") {
    if (
      !/^[a-f0-9]{40}$/.test(env.DEMO_COMMIT ?? "") ||
      !/^[0-9]+$/.test(env.GITHUB_RUN_ID ?? "") ||
      !/^[0-9]+$/.test(env.GITHUB_RUN_ATTEMPT ?? "")
    ) {
      throw new Error("Verified commit and GitHub run identity are required");
    }
    const application = await withUploadSession(
      (api) =>
        ensureDemoApplication(
          api,
          env.TRACEFLOW_DEMO_ORIGIN,
          env.DEMO_APPLICATION_ID,
        ),
      env,
    );
    const release = `demo-web@${env.DEMO_COMMIT.slice(0, 12)}-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
    const info = {
      commit: env.DEMO_COMMIT,
      release,
      applicationId: application.id,
      origin: env.TRACEFLOW_DEMO_ORIGIN,
    };
    await writeFile(metadataFile, JSON.stringify(info), { mode: 0o600 });
    if (!env.GITHUB_ENV)
      throw new Error("GitHub environment output is required");
    await appendFile(
      env.GITHUB_ENV,
      `DEMO_RELEASE=${release}\nVITE_TRACEFLOW_APP_KEY=${application.appKey}\n`,
    );
    console.log(
      `Production Demo application: ${application.id}; release: ${release}`,
    );
    return;
  }
  const info = await metadata();
  if (step === "upload") {
    const detail = await uploadBuild(
      {
        "application-id": String(info.applicationId),
        release: info.release,
        dist: privateDist,
        "url-prefix": "/",
        commit: info.commit,
      },
      env,
    );
    info.releaseId = detail.release.id;
    await writeFile(metadataFile, JSON.stringify(info), { mode: 0o600 });
  } else if (step === "public") {
    await preparePublicAssets({
      dist: privateDist,
      out: publicDist,
      release: info.release,
      "url-prefix": "/",
    });
    await writeFile(
      path.join(publicDist, "version.json"),
      JSON.stringify(info),
    );
    const { root, files } = await walkFiles(publicDist);
    const lines = [];
    for (const file of files) {
      const relative = file.replaceAll(path.sep, "/");
      if (
        !/^[A-Za-z0-9_./-]+$/.test(relative) ||
        relative.split("/").some((part) => part.startsWith("."))
      ) {
        throw new Error("Unsafe public artifact path");
      }
      lines.push(
        `${sha256(await readFile(path.join(root, file)))}  ${relative}`,
      );
    }
    await writeFile("demo-checksums.sha256", lines.join("\n") + "\n");
  } else if (step === "record") {
    await withUploadSession(async (api) => {
      const route = `/releases/${info.releaseId}?applicationId=${info.applicationId}`;
      const detail = await (await api.fetchSession(route)).json();
      if (
        detail.release.releaseName !== info.release ||
        detail.release.commitSha !== info.commit ||
        detail.release.status !== "finalized"
      )
        throw new Error("Published release identity does not match");
      const deployedAt = detail.release.deployedAt ?? Date.now();
      await api.write(
        `/releases/${info.releaseId}/deployment?applicationId=${info.applicationId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deployedAt }),
        },
      );
      console.log(`Deployment recorded for release ${info.releaseId}.`);
    }, env);
  } else if (step === "smoke") {
    await smokeDemo(info, env);
  } else throw new Error("Unknown Demo deployment step");
}

async function smokeDemo(info, env) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({
    channel: env.PLAYWRIGHT_CHANNEL || undefined,
  });
  try {
    const page = await browser.newPage();
    await page.goto(info.origin, { waitUntil: "networkidle", timeout: 60000 });
    const batchResult = page.waitForResponse(
      (response) => {
        if (
          !response.url().endsWith("/events/batch") ||
          response.request().method() !== "POST"
        )
          return false;
        const batch = response.request().postDataJSON();
        return batch.events?.some(
          (event) => event.type === "error" && event.release === info.release,
        );
      },
      { timeout: 30000 },
    );
    await page.getByRole("button", { name: /手动错误/ }).click();
    await page.getByRole("button", { name: "立即上报" }).click();
    const response = await batchResult;
    const batch = response.request().postDataJSON();
    const event = batch.events.find(
      (item) => item.type === "error" && item.release === info.release,
    );
    const result = await response.json();
    if (
      !response.ok() ||
      result.rejected !== 0 ||
      result.accepted < 1 ||
      event.environment !== "production"
    ) {
      throw new Error("Real browser SDK event was not accepted");
    }
    await withUploadSession(async ({ fetchSession }) => {
      const scope = `applicationId=${info.applicationId}`;
      const issues = await (
        await fetchSession(
          `/issues?${scope}&release=${encodeURIComponent(info.release)}`,
        )
      ).json();
      let saved;
      for (const issue of issues.items) {
        const events = await (
          await fetchSession(`/issues/${issue.id}/events?${scope}&pageSize=100`)
        ).json();
        saved = events.items.find((item) => item.eventId === event.eventId);
        if (saved) break;
      }
      if (!saved) throw new Error("SDK event not found in Console API");
      const stack = await (
        await fetchSession(`/events/${saved.id}/stacktrace?${scope}`)
      ).json();
      if (
        !stack.frames.some((frame) =>
          frame.original?.filename?.endsWith("src/App.tsx"),
        )
      ) {
        throw new Error("Real Demo error did not resolve to App.tsx");
      }
      console.log(
        `HTTPS Demo -> SDK -> stored event ${saved.id} -> App.tsx verified.`,
      );
    }, env);
    for (const [width, name] of [
      [1440, "desktop"],
      [320, "mobile"],
    ]) {
      await page.setViewportSize({ width, height: 900 });
      if (
        !(await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ))
      ) {
        throw new Error("Demo has horizontal overflow");
      }
      await page.screenshot({ path: `demo-live-${name}.png`, fullPage: true });
    }
  } finally {
    await browser.close();
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await runDemoStep(process.argv[2]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
