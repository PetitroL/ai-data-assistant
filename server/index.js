// AI 对话式数据助手 · 服务端（Express + SSE 流式）
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { streamChat, estimateTokens } from "./llm.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 5178;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    engine: process.env.OPENAI_API_KEY ? "openai-compatible" : "mock",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    ts: Date.now(),
  });
});

/**
 * 多轮上下文压缩：
 * 超过 MAX_TURNS 时，把更早的用户问题压成一段摘要，只保留最近 6 条原文。
 * 真实场景可以换成模型摘要（更贵、更准），这里用确定性规则，便于演示与单测。
 */
function compressHistory(messages, emit) {
  const MAX = 10;
  if (messages.length <= MAX) return messages;

  const system = messages.filter((m) => m.role === "system");
  const dialogue = messages.filter((m) => m.role !== "system");
  const keepTail = dialogue.slice(-6);
  const dropped = dialogue.slice(0, -6);
  const userTopics = dropped.filter((m) => m.role === "user").map((m) => m.content).slice(-6);
  const summary =
    userTopics.length > 0
      ? `【历史摘要】用户此前问过：${userTopics.map((t) => t.replace(/\s+/g, " ").slice(0, 28)).join("；")}。`
      : "";

  emit("context", {
    before: messages.length,
    after: keepTail.length + system.length + (summary ? 1 : 0),
    summary,
  });

  return [
    ...system,
    ...(summary ? [{ role: "user", content: summary }] : []),
    ...keepTail,
  ];
}

app.post("/api/chat", async (req, res) => {
  const { messages = [], sessionId = "default" } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ ok: false, error: "messages 不能为空" });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders?.();

  const emit = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
  const controller = new AbortController();
  // 注意：必须监听 res 的 close（req 在 body 解析完就会触发 close，会被误判为客户端中断）
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });

  const started = Date.now();
  emit("start", { id: sessionId, ts: started });

  try {
    const compacted = compressHistory(messages, emit);
    const result = await streamChat({ messages: compacted, emit, signal: controller.signal });

    const promptTokens =
      result.usage?.prompt || compacted.reduce((s, m) => s + estimateTokens(m.content), 0);
    const completionTokens = result.usage?.completion || 0;
    emit("usage", {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
    });
    emit("done", { elapsed: Date.now() - started });
  } catch (err) {
    if (controller.signal.aborted) {
      emit("done", { elapsed: Date.now() - started, aborted: true });
    } else {
      console.error("[chat error]", err);
      emit("error", {
        message:
          "模型服务暂时不可用，已切换到降级模式：你可以稍后重试，或直接查看下方数据表（数据接口本身是正常的）。",
        detail: String(err.message || err).slice(0, 200),
      });
    }
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// 生产构建产物（npm run build 之后可直接由本服务托管）
const DIST = path.join(ROOT, "web", "dist");
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get("*", (req, res) => res.sendFile(path.join(DIST, "index.html")));
}

app.listen(PORT, () => {
  const mode = process.env.OPENAI_API_KEY ? "真实模型（OpenAI 兼容接口）" : "内置 Mock 引擎";
  console.log(`\n  AI 对话式数据助手 · 服务已启动`);
  console.log(`  接口: http://localhost:${PORT}/api/chat`);
  console.log(`  运行模式: ${mode}`);
  console.log(`  前端: http://localhost:5179（npm run dev 会同时启动）\n`);
});
