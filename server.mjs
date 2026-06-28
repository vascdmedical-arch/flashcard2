import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./public", import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ttsModel = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const ttsVoice = process.env.OPENAI_TTS_VOICE || "alloy";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string", enum: ["number", "date", "year"] },
          spoken: { type: "string" },
          answer: { type: "string" },
          note: { type: "string" },
        },
        required: ["kind", "spoken", "answer", "note"],
      },
    },
  },
  required: ["questions"],
};

const instructions = `You create English listening flashcards for a Japanese learner.
Return exactly the requested number of unique questions.
For kind=number, spoken must be natural English number words and answer must use digits with comma separators. Use integers only, from 0 through 1,000,000,000,000. About 70% of number questions must be between 100 and 100,000,000 because that range is especially important. Mix round and irregular values. Use American-style number wording without "and" (for example, "six hundred twenty-one").
For kind=date, spoken must be a natural US English month-and-day expression (for example, "September twenty-third"); answer must be "September 23". Do not include a year.
For kind=year, spoken must be the way a native speaker normally says that calendar year; answer must be the four-digit year. Include a helpful Japanese note only when the pronunciation is potentially confusing; otherwise use an empty string.
Never include clues or extra prose in spoken.`;

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("Request too large");
  }
  return JSON.parse(body || "{}");
}

function extractText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("The API returned no text output");
}

async function makeQuestions(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return json(res, 503, { error: "APIキーが未設定です", fallback: true });
  }

  try {
    const body = await readBody(req);
    const category = body.category === "dates" ? "dates" : "numbers";
    const count = Math.max(4, Math.min(20, Number(body.count) || 12));
    const input = category === "numbers"
      ? `Create ${count} number questions. Follow the required weighted distribution.`
      : `Create ${count} questions, mixing month-and-day dates and calendar years roughly equally.`;

    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        text: { format: { type: "json_schema", name: "flashcard_questions", strict: true, schema } },
      }),
    });

    const data = await apiResponse.json();
    if (!apiResponse.ok) throw new Error(data.error?.message || "OpenAI API request failed");
    const parsed = JSON.parse(extractText(data));
    const questions = parsed.questions.slice(0, count);
    if (questions.length < 4) throw new Error("Not enough questions returned");
    return json(res, 200, { questions, source: "openai", model });
  } catch (error) {
    console.error(error);
    return json(res, 502, { error: "問題の生成に失敗しました", detail: error.message, fallback: true });
  }
}

async function makeSpeech(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    return json(res, 503, { error: "APIキーが未設定です", fallback: true });
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const input = (url.searchParams.get("text") || "").trim();
    const speed = Math.max(0.6, Math.min(1.2, Number(url.searchParams.get("speed")) || 0.85));
    if (!input) return json(res, 400, { error: "text is required" });
    if (input.length > 300) return json(res, 400, { error: "text is too long" });

    const apiResponse = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ttsModel,
        voice: ttsVoice,
        input,
        speed,
        response_format: "mp3",
        instructions: "Speak clearly in neutral American English. Read the expression exactly and do not add extra words.",
      }),
    });

    if (!apiResponse.ok) {
      const detail = await apiResponse.text();
      throw new Error(detail || "OpenAI speech request failed");
    }

    const audio = Buffer.from(await apiResponse.arrayBuffer());
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(audio.length),
      "Cache-Control": "no-store",
    });
    res.end(audio);
  } catch (error) {
    console.error(error);
    return json(res, 502, { error: "音声生成に失敗しました", detail: error.message, fallback: true });
  }
}

async function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const relative = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const path = join(root, relative);
  if (!path.startsWith(root)) return json(res, 403, { error: "Forbidden" });
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Not a file");
    const content = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/questions") return makeQuestions(req, res);
  if (req.method === "GET" && req.url.startsWith("/api/speech")) return makeSpeech(req, res);
  if (req.method === "GET" && req.url === "/api/status") {
    return json(res, 200, { apiReady: Boolean(process.env.OPENAI_API_KEY), model, ttsModel, ttsVoice });
  }
  if (req.method === "GET") return serveFile(req, res);
  json(res, 405, { error: "Method not allowed" });
}).listen(port, host, () => {
  const localUrl = host === "0.0.0.0" ? `http://127.0.0.1:${port}` : `http://${host}:${port}`;
  console.log(`Number Ear Trainer: ${localUrl}`);
  if (!process.env.OPENAI_API_KEY) console.log("OPENAI_API_KEY is not set; built-in questions will be used.");
});
