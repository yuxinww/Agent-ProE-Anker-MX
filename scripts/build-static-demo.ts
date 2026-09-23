/** Build a read-only Pages bundle from explicit public assets and synthetic data only. */
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { H5Service } from "../src/h5-service.ts";
import { initialState, LOCAL_OWNER, stateSchema } from "../src/h5-state.ts";
import type { H5StateStore, LocalState } from "../src/h5-state.ts";
import type { ArtifactStorage } from "../src/docx-export.ts";
import { loadSkill } from "../src/skills.ts";

const root = process.cwd();
const output = path.join(root, "work/static-demo-build");
const now = new Date().toISOString();
const base = initialState(now);
const mainMatter = base.matters[0];
const otherMatter = base.matters[1];
if (mainMatter === undefined || otherMatter === undefined) throw new Error("Synthetic seed is missing its baseline matters.");

const matters: LocalState["matters"] = [
  { ...mainMatter, title: "团队方案同步", goal: "准备进展、变化与待决定事项的演示内容" },
  { ...otherMatter, id: "demo-ideas", title: "整理今天的两个新想法", goal: "查看归类到灵感模块的合成示例" },
  { ...otherMatter, id: "demo-weekend", title: "周末出行计划", goal: "浏览生活记录与关联事项示例" },
];
const mainId = matters[0]!.id;
const ideasId = matters[1]!.id;
const weekendId = matters[2]!.id;
const sampleTime = (minutesAgo: number): string => new Date(Date.parse(now) - minutesAgo * 60_000).toISOString();
const ideasRecord = base.records.find((record) => record.id === "sample-life");
if (ideasRecord === undefined) throw new Error("Synthetic seed is missing its reusable example record.");
const state = stateSchema.parse({
  ...base,
  matters,
  records: [
    ...base.records.filter((record) => record.contextId === mainId && record.id !== "sample-scope"),
    { ...ideasRecord, id: "demo-idea-one", contextId: ideasId, title: "示例 · 通勤时想到的产品方向", text: "可以把每天零散记录的想法整理成一个每周回顾。", module: "inspiration", cover: "commute", recordedAt: sampleTime(8) },
    { ...ideasRecord, id: "demo-idea-two", contextId: ideasId, title: "示例 · 先验证一个小问题", text: "在做完整方案之前，先找两位用户确认这个想法是否有用。", module: "inspiration", cover: "commute", recordedAt: sampleTime(6) },
    { ...ideasRecord, id: "demo-social", contextId: mainId, title: "示例 · 团队讨论中的补充想法", text: "讨论中提到先对齐目标，再决定下一步由谁跟进。", module: "social", cover: "none", recordedAt: sampleTime(4) },
    { ...ideasRecord, id: "demo-weekend-record", contextId: weekendId, title: "示例 · 周末出行偏好", text: "周末想找一条轻松的路线，出发时间还没有决定。", module: "life", cover: "run", recordedAt: sampleTime(12) },
  ],
});
if (state.records.some((record) => record.provenance !== "synthetic") || state.matters.some((matter) => matter.provenance !== "synthetic")) {
  throw new Error("Static demo must contain synthetic records and matters only.");
}

const store: H5StateStore = {
  read: () => structuredClone(state),
  save: async () => { throw new Error("Static demo data is read-only."); },
  refresh: async () => {},
};
const noStorage: ArtifactStorage = {
  writeNew: async () => { throw new Error("Static demo has no artifact storage."); },
  read: async () => { throw new Error("Static demo has no artifact storage."); },
};
const service = new H5Service(store, {
  now: () => now,
  mode: "local-preview",
  ownerId: LOCAL_OWNER,
  loadTemplate: async (id) => (await loadSkill(path.join(root, "product/skills"), id)).template,
  storage: noStorage,
});
const demoSnapshot = service.snapshot();

await mkdir(output, { recursive: true });
await build({ entryPoints: ["web/app.ts"], outfile: path.join(output, "app.js"), bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true });
const bundlePath = path.join(output, "app.js");
const bundle = (await readFile(bundlePath, "utf8")).replaceAll("/assets/", "assets/");
if (bundle.includes('src="/assets/') || bundle.includes('url(/assets/')) throw new Error("The app bundle still contains root-relative asset paths.");
await writeFile(bundlePath, bundle, "utf8");
await cp(path.join(root, "web/assets"), path.join(output, "assets"), { recursive: true });
await mkdir(path.join(output, "assets/iphone"), { recursive: true });
await cp(path.join(root, "scripts/assets/iphone/Bezel.png"), path.join(output, "assets/iphone/Bezel.png"));
await cp(path.join(root, "scripts/assets/iphone/ios-status-icons.svg"), path.join(output, "assets/iphone/status-icons.svg"));
for (const stylesheet of ["styles.css", "modules.css", "iphone-preview.css"]) {
  const input = stylesheet === "iphone-preview.css" ? path.join(root, "web/iphone-preview.css") : path.join(root, "web", stylesheet);
  let contents = await readFile(input, "utf8");
  contents = contents.replaceAll("url(/assets/", "url(assets/").replaceAll("url(\"/assets/", "url(\"assets/").replaceAll("url('/assets/", "url('assets/");
  await writeFile(path.join(output, stylesheet), contents, "utf8");
}

const sourceApp = await readFile(path.join(root, "web/index.html"), "utf8");
const staticApp = sourceApp
  .replace('<html lang="zh-CN">', '<html lang="zh-CN" data-static-demo="true">')
  .replace("<head>", '<head>\n    <base href="./">')
  .replace('href="/assets/', 'href="assets/')
  .replace('href="/styles.css"', 'href="styles.css"')
  .replace('href="/modules.css"', 'href="modules.css"')
  .replace('src="/app.js"', 'src="app.js"');
if (staticApp === sourceApp || !staticApp.includes('data-static-demo="true"') || staticApp.includes('href="/styles.css"') || staticApp.includes('src="/app.js"')) {
  throw new Error("Could not safely prepare the static app document.");
}
await writeFile(path.join(output, "app.html"), staticApp, "utf8");

const sourceFrame = await readFile(path.join(root, "web/iphone-preview.html"), "utf8");
const staticFrame = sourceFrame
  .replace("<head>", '<head>\n    <base href="./">')
  .replace('href="/assets/', 'href="assets/')
  .replace('href="/_preview/iphone.css"', 'href="iphone-preview.css"')
  .replace('src="/"', 'src="app.html"')
  .replace('src="/_preview/iphone/status-icons.svg"', 'src="assets/iphone/status-icons.svg"')
  .replace('src="/_preview/iphone/Bezel.png"', 'src="assets/iphone/Bezel.png"');
if (staticFrame === sourceFrame || staticFrame.includes('src="/"') || staticFrame.includes('href="/_preview/')) {
  throw new Error("Could not safely prepare the static iPhone frame.");
}
await writeFile(path.join(output, "index.html"), staticFrame, "utf8");
await writeFile(path.join(output, "demo-state.json"), JSON.stringify(demoSnapshot), "utf8");
console.log(JSON.stringify({ event: "static_demo_build_completed", output, records: demoSnapshot.records.length, matters: demoSnapshot.matters.length, syntheticOnly: true, backendIncluded: false }));
