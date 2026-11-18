// SSE 冒烟测试：校验 /api/chat 的事件协议是否完整
// 用法：先启动服务（node server/index.js），再 node scripts/smoke.mjs
// 可用环境变量 BASE_URL 指向其他地址，例如部署后的 https://xxx
const BASE = (process.env.BASE_URL || "http://localhost:5178").replace(/\/$/, "");

const QUESTION = "成都高新区租金最高的 5 个楼宇，帮我出图对比";
const EXPECT = { start: 1, tool_call: 2, tool_result: 2, done: 1 };

const fail = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

const health = await fetch(`${BASE}/api/health`).then((r) => r.json()).catch(() =>
  fail(`服务未启动或不可达：${BASE}/api/health`)
);
console.log("✓ health:", JSON.stringify(health));
if (!health.ok) fail("health 返回 ok=false");

const res = await fetch(`${BASE}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ messages: [{ role: "user", content: QUESTION }], sessionId: "smoke" }),
});
if (!res.ok || !/text\/event-stream/.test(res.headers.get("content-type") || "")) {
  fail(`/api/chat 返回异常：${res.status} ${res.headers.get("content-type")}`);
}

const reader = res.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
const counts = {};
let donePayload = null;
let text = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });
  const chunks = buffer.split("\n\n");
  buffer = chunks.pop() || "";
  for (const chunk of chunks) {
    if (chunk.startsWith(":")) continue; // 心跳
    const event = chunk.split("\n").find((l) => l.startsWith("event:"))?.slice(6).trim();
    const data = chunk.split("\n").find((l) => l.startsWith("data:"))?.slice(5).trim();
    if (!event || !data) continue;
    counts[event] = (counts[event] || 0) + 1;
    if (event === "delta") text += JSON.parse(data).text;
    if (event === "done") donePayload = JSON.parse(data);
  }
}

console.log("✓ 事件统计:", counts);

for (const [event, min] of Object.entries(EXPECT)) {
  const got = counts[event] || 0;
  if (got < min) fail(`事件 ${event} 数量不足：期望 ≥${min}，实际 ${got}`);
}

if (!counts.delta || counts.delta < 50) fail(`流式片段过少：${counts.delta}`);
if (!donePayload) fail("没有收到 done 事件");
if (donePayload.aborted) fail("done 标记了 aborted（可能被误判为客户端中断）");

// 表格与换行是否完好（模拟流式切分不能吃掉 \n）
if (!text.includes("\n|") || !/\|\s*---/.test(text)) fail("回答里缺少 Markdown 表格，换行可能被流式切分吞掉");
if (!text.includes("天府国际金融中心")) fail("回答里没有命中真实查询结果");

console.log(`✓ 回答长度 ${text.length} 字符，耗时 ${donePayload.elapsed}ms`);
console.log("✓ 冒烟测试通过");
