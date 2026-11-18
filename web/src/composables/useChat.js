import { computed, ref, watch } from "vue";

const STORAGE_KEY = "ai-data-assistant:sessions:v1";
const API = "/api/chat";

const uid = () => Math.random().toString(36).slice(2, 10);
const now = () => Date.now();

function loadSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

function createSession(title = "新对话") {
  return { id: uid(), title, createdAt: now(), updatedAt: now(), messages: [] };
}

/** 流式追加：把 token 写进当前消息的最后一个同类区块，没有就新建 */
function appendBlock(msg, type, payload) {
  const last = msg.blocks[msg.blocks.length - 1];
  if (type === "text" || type === "reasoning") {
    if (last && last.type === type) last.text += payload.text;
    else msg.blocks.push({ type, text: payload.text, open: false });
    if (type === "text") msg.content += payload.text;
    return;
  }
  msg.blocks.push({ type, ...payload });
}

export function useChat() {
  const sessions = ref(loadSessions() || [createSession()]);
  const activeId = ref(sessions.value[0].id);
  const sending = ref(false);
  const engine = ref("mock");
  let controller = null;

  const activeSession = computed(
    () => sessions.value.find((s) => s.id === activeId.value) || sessions.value[0]
  );
  const messages = computed(() => activeSession.value?.messages || []);
  const totalTokens = computed(() =>
    messages.value.reduce((sum, m) => sum + (m.usage?.total || 0), 0)
  );
  const canSend = computed(() => !sending.value);

  watch(
    sessions,
    (val) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val.slice(0, 30)));
      } catch {
        /* 超配额时静默失败，不影响使用 */
      }
    },
    { deep: true }
  );

  fetch("/api/health")
    .then((r) => r.json())
    .then((d) => (engine.value = d.engine))
    .catch(() => (engine.value = "mock"));

  function touch() {
    activeSession.value.updatedAt = now();
  }

  function newSession() {
    sessions.value.unshift(createSession());
    activeId.value = sessions.value[0].id;
  }

  function removeSession(id) {
    const idx = sessions.value.findIndex((s) => s.id === id);
    if (idx === -1) return;
    sessions.value.splice(idx, 1);
    if (!sessions.value.length) sessions.value.push(createSession());
    if (!sessions.value.some((s) => s.id === activeId.value)) {
      activeId.value = sessions.value[0].id;
    }
  }

  function clearAll() {
    sessions.value = [createSession()];
    activeId.value = sessions.value[0].id;
  }

  function historyForApi(session) {
    return session.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => (m.role === "user" ? m.content : m.content?.trim()))
      .map((m) => ({ role: m.role, content: m.content }));
  }

  async function runStream(session, assistantMsg, attempt = 0) {
    controller = new AbortController();
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyForApi(session), sessionId: session.id }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let event = "message";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }
          handleEvent(event, payload, assistantMsg);
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        assistantMsg.aborted = true;
      } else if (attempt === 0) {
        // 网络抖动：自动重试一次，UI 上给出提示
        assistantMsg.blocks.push({ type: "note", text: "连接中断，正在自动重试一次…" });
        return runStream(session, assistantMsg, 1);
      } else {
        assistantMsg.error =
          "模型服务暂时不可用，已切换到降级模式：你可以点「重新生成」再试一次，或直接查看上方的数据结果。";
      }
    } finally {
      assistantMsg.streaming = false;
      assistantMsg.elapsed = now() - assistantMsg.createdAt;
      sending.value = false;
      controller = null;
      touch();
    }
  }

  function handleEvent(event, data, msg) {
    switch (event) {
      case "reasoning":
        appendBlock(msg, "reasoning", { text: data.text });
        break;
      case "delta":
        appendBlock(msg, "text", { text: data.text });
        break;
      case "tool_call":
        appendBlock(msg, "tool", {
          id: data.id,
          name: data.name,
          args: data.args,
          status: "running",
          startedAt: data.ts || now(),
          ms: 0,
          summary: "",
          result: null,
        });
        break;
      case "tool_result": {
        const block = [...msg.blocks].reverse().find((b) => b.type === "tool" && b.id === data.id);
        if (block) {
          block.status = data.ok ? "done" : "error";
          block.summary = data.summary;
          block.ms = data.ms;
          block.result = data.result;
        }
        break;
      }
      case "context":
        appendBlock(msg, "note", {
          text: `上下文已压缩：${data.before} 条 → ${data.after} 条（保留最近 6 条原文 + 摘要）`,
        });
        break;
      case "usage":
        msg.usage = data;
        break;
      case "done":
        if (data.aborted) msg.aborted = true;
        break;
      case "error":
        msg.error = data.message;
        if (data.detail) msg.errorDetail = data.detail;
        break;
      default:
        break;
    }
  }

  async function send(text) {
    const trimmed = (text || "").trim();
    if (!trimmed || sending.value) return;

    const session = activeSession.value;
    session.messages.push({ id: uid(), role: "user", content: trimmed, createdAt: now() });
    if (session.messages.filter((m) => m.role === "user").length === 1) {
      session.title = trimmed.slice(0, 18);
    }

    const assistantMsg = {
      id: uid(),
      role: "assistant",
      content: "",
      blocks: [],
      streaming: true,
      usage: null,
      createdAt: now(),
      elapsed: 0,
      error: "",
      aborted: false,
    };
    session.messages.push(assistantMsg);
    sending.value = true;
    touch();
    await runStream(session, assistantMsg);
  }

  function stop() {
    if (controller) controller.abort();
  }

  async function regenerate(index) {
    const session = activeSession.value;
    const msg = session.messages[index];
    if (!msg || msg.role !== "assistant" || sending.value) return;
    // 找到上一条用户消息，删掉当前回答后重跑
    let userIdx = index - 1;
    while (userIdx >= 0 && session.messages[userIdx].role !== "user") userIdx--;
    if (userIdx < 0) return;
    session.messages.splice(index, 1);
    const question = session.messages[userIdx].content;
    session.messages.splice(userIdx, 1);
    await send(question);
  }

  return {
    sessions,
    activeId,
    activeSession,
    messages,
    sending,
    canSend,
    engine,
    totalTokens,
    send,
    stop,
    regenerate,
    newSession,
    removeSession,
    clearAll,
  };
}
