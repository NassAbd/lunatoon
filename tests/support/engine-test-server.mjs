import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { mockChapter, jpegBase64 } from "./mock-chapter.mjs";

const port = 3110;
const directory = mkdtempSync(path.join(os.tmpdir(), "lunatoon-browser-"));
const stats = { scripts: 0, images: 0, contexts: [], imagePrompts: [], endpoints: [], streamedImages: 0, previews: 0, completedImages: [] };
let nextProcess, failSecond = false, invalidScript = false, duplicateEndingDialogue = false, imageDelay = 900;
let scriptDelay = 120, reverseImages = false, streamPreviews = false, truncateSecondStream = false;
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function body(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return Buffer.concat(chunks).toString("utf8"); }
function json(response, data, status = 200) { response.writeHead(status, { "Content-Type": "application/json", "x-request-id": `req_local_mock_${stats.scripts}_${stats.images}` }); response.end(JSON.stringify(data)); }
async function startNext() {
  nextProcess = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, LUNATOON_TEST_BUILD: "1", LUNATOON_DATA_DIR: directory, OPENAI_API_KEY: "test-only", OPENAI_BASE_URL: `http://127.0.0.1:${mock.address().port}/v1`, OPENAI_STORY_MODEL: "gpt-4.1-mini", OPENAI_IMAGE_MODEL: "gpt-image-2.5-flare", OPENAI_IMAGE_QUALITY: "low", LUNATOON_MAX_STEPS: "2", LUNATOON_MAX_IMAGE_CALLS: "6", LUNATOON_MAX_SCRIPT_CALLS: "3", LUNATOON_RUN_BUDGET_USD: "0.3" } });
  for (let tries = 0; tries < 100; tries++) {
    try {
      const ready = await fetch(`http://127.0.0.1:${port}`);
      // Consume the readiness body so this harness cannot leave its own HTTP
      // response open while Next later waits for graceful request completion.
      await ready.arrayBuffer();
      if (ready.ok) return;
    } catch { /* Wait for this child only. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Integration Next server did not become ready");
}
const mock = http.createServer(async (request, response) => {
  try {
    if (request.url === "/__stats") return json(response, stats);
    if (request.url === "/__control") {
      const input = JSON.parse(await body(request));
      failSecond = Boolean(input.failSecond); invalidScript = Boolean(input.invalidScript); duplicateEndingDialogue = Boolean(input.duplicateEndingDialogue);
      imageDelay = input.imageDelay ?? 900; scriptDelay = input.scriptDelay ?? 120;
      reverseImages = Boolean(input.reverseImages); streamPreviews = Boolean(input.streamPreviews); truncateSecondStream = Boolean(input.truncateSecondStream);
      return json(response, { ok: true });
    }
    if (request.url === "/__restart") { const child = nextProcess; const stopped = once(child, "exit"); child.kill("SIGTERM"); await stopped; await startNext(); return json(response, { ok: true }); }
    if (request.url === "/v1/responses") {
      const input = JSON.parse(await body(request)); const context = JSON.parse(input.input.find(item => item.role === "user").content);
      stats.scripts++; stats.contexts.push(context); stats.endpoints.push("responses");
      if (input.text?.format?.strict !== true || input.text.format.schema.additionalProperties !== false) return json(response, { error: { message: "Strict schema required" } }, 400);
      await delay(scriptDelay);
      const chapter = mockChapter(context);
      if (invalidScript) chapter.story_state_updates.facts_added[0].id = "device_knows_kael";
      if (duplicateEndingDialogue && context.step === 2) chapter.panels[1].dialogues = [chapter.panels[1].dialogues[0], { ...chapter.panels[1].dialogues[0], text: "A second line with the same presentation ID." }];
      return json(response, { id: "resp_local_mock", model: input.model, status: "completed", output: [{ type: "message", id: "msg_local_mock", role: "assistant", status: "completed", content: [{ type: "output_text", text: JSON.stringify(chapter), annotations: [] }] }], usage: { input_tokens: 630, input_tokens_details: { cached_tokens: 0 }, output_tokens: 412, total_tokens: 1042 } });
    }
    if (["/v1/images/edits", "/v1/images/generations"].includes(request.url)) {
      const raw = await body(request); stats.images++; stats.imagePrompts.push(raw); stats.endpoints.push(request.url.split("/").at(-1)); const second = raw.includes("SCENE_TWO");
      const duration = imageDelay * (reverseImages ? second ? 1 : 2 : second ? 2 : 1);
      const stream = /name="stream"\r?\n\r?\ntrue/.test(raw) || /"stream"\s*:\s*true/.test(raw);
      const reference = request.url.endsWith("edits"); const input = reference ? 1982 : 542;
      const usage = { input_tokens: input, input_tokens_details: { text_tokens: 542, image_tokens: reference ? 1440 : 0 }, output_tokens: 158, total_tokens: input + 158 };
      if (stream && !(second && failSecond)) {
        stats.streamedImages++;
        response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "x-request-id": `req_local_mock_${stats.scripts}_${stats.images}` });
        const fields = { b64_json: jpegBase64, background: "opaque", created_at: 1, output_format: "jpeg", quality: "low", size: "1024x1536" };
        const prefix = reference ? "image_edit" : "image_generation";
        const emit = event => response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        const previewDelay = streamPreviews ? Math.min(120, duration / 4) : 0;
        if (streamPreviews) { await delay(previewDelay); emit({ ...fields, type: `${prefix}.partial_image`, partial_image_index: 0 }); stats.previews++; }
        await delay(duration - previewDelay);
        // EOF without a completed event is deliberately ambiguous and must never trigger an automatic paid retry.
        if (second && truncateSecondStream) return response.end();
        stats.completedImages.push(second ? 2 : 1);
        emit({ ...fields, type: `${prefix}.completed`, usage });
        return response.end();
      }
      await delay(duration);
      if (second && failSecond) return json(response, { error: { message: "Synthetic failure", type: "server_error" } }, 500);
      stats.completedImages.push(second ? 2 : 1);
      return json(response, { created: 1, data: [{ b64_json: jpegBase64 }], usage });
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
