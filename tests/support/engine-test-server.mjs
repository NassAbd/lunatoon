import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { mockChapter, jpegBase64 } from "./mock-chapter.mjs";

const port = 3110;
const directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-browser-"));
const stats = { scripts: 0, images: 0, contexts: [], imagePrompts: [], endpoints: [] };
let nextProcess, failSecond = false, invalidScript = false, duplicateEndingDialogue = false, imageDelay = 900;
async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks).toString("utf8"); }
function json(response, data, status = 200) { response.writeHead(status, { "Content-Type": "application/json", "x-request-id": `req_local_mock_${stats.scripts}_${stats.images}` }); response.end(JSON.stringify(data)); }
async function startNext() {
  nextProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, LUNATOON_TEST_BUILD: "1", LUNATOON_DATA_DIR: directory, OPENAI_API_KEY: "test-only", OPENAI_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1`, OPENAI_STORY_MODEL: "gpt-4.1-mini", OPENAI_IMAGE_MODEL: "gpt-image-2.5-flare", OPENAI_IMAGE_QUALITY: "low", LUNATOON_MAX_STEPS: "2", LUNATOON_MAX_IMAGE_CALLS: "6", LUNATOON_MAX_SCRIPT_CALLS: "3", LUNATOON_RUN_BUDGET_USD: "0.3" } });
  for (let tries = 0; tries < 100; tries++) {
    try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) return; } catch { /* Wait for this child only. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Integration Next server did not become ready");
}
const mock = http.createServer(async (request, response) => {
  try {
    if (request.url === "/__stats") return json(response, stats);
    if (request.url === "/__control") { const input = JSON.parse(await body(request)); failSecond = Boolean(input.failSecond); invalidScript = Boolean(input.invalidScript); duplicateEndingDialogue = Boolean(input.duplicateEndingDialogue); imageDelay = input.imageDelay ?? 900; return json(response, { ok: true }); }
    if (request.url === "/__restart") { const child = nextProcess; const stopped = once(child, "exit"); child.kill("SIGTERM"); await stopped; await startNext(); return json(response, { ok: true }); }
    if (request.url === "/v1/responses") {
      const input = JSON.parse(await body(request)); const context = JSON.parse(input.input.find(item => item.role === "user").content);
      stats.scripts++; stats.contexts.push(context); stats.endpoints.push("responses");
      if (input.text?.format?.strict !== true || input.text.format.schema.additionalProperties !== false) return json(response, { error: { message: "Strict schema required" } }, 400);
      await new Promise(resolve => setTimeout(resolve, 120));
      const chapter = mockChapter(context);
      if (invalidScript) chapter.story_state_updates.facts_added[0].id = "device_knows_kael";
      if (duplicateEndingDialogue && context.step === 2) chapter.panels[1].dialogues = [chapter.panels[1].dialogues[0], { ...chapter.panels[1].dialogues[0], text: "A second line with the same presentation ID." }];
      return json(response, { id: "resp_local_mock", model: input.model, status: "completed", output: [{ type: "message", id: "msg_local_mock", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(chapter), annotations: [] }] }], usage: { input_tokens: 630, input_tokens_details: { cached_tokens: 0 }, output_tokens: 412, total_tokens: 1042 } });
    }
    if (["/v1/images/edits", "/v1/images/generations"].includes(request.url)) {
      const raw = await body(request); stats.images++; stats.imagePrompts.push(raw); stats.endpoints.push(request.url.split("/").at(-1)); const second = raw.includes("SCENE_TWO");
      await new Promise(resolve => setTimeout(resolve, imageDelay * (second ? 2 : 1)));
      if (second && failSecond) return json(response, { error: { message: "Synthetic failure", type: "server_error" } }, 500);
      const reference = request.url.endsWith("edits"); const input = reference ? 1982 : 542;
      return json(response, { created: 1, data: [{ b64_json: jpegBase64 }], usage: { input_tokens: input, input_tokens_details: { text_tokens: 542, image_tokens: reference ? 1440 : 0 }, output_tokens: 158, total_tokens: input + 158 } });
    }
    json(response, { error: "Unknown local mock route" }, 404);
  } catch { json(response, { error: "Local mock failed" }, 500); }
});
await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
mkdirSync("test-results-engine", { recursive: true });
writeFileSync("test-results-engine/runtime.json", JSON.stringify({ mockURL: `http://127.0.0.1:${mock.address().port}`, dataDirectory: directory }));
await startNext();
async function cleanup() { if (nextProcess && nextProcess.exitCode === null) { const stopped = once(nextProcess, "exit"); nextProcess.kill("SIGTERM"); await stopped; } mock.close(); rmSync(directory, { recursive: true, force: true }); process.exit(0); }
process.on("SIGINT", cleanup); process.on("SIGTERM", cleanup);
