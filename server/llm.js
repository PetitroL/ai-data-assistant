// 模型层：默认走内置 mock 引擎（无需 API Key），配置 OPENAI_API_KEY 后走真实大模型
import { runTool, toolSchemas } from "./tools.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function estimateTokens(text = "") {
  // 粗估：中文约 1 字 ≈ 0.6 token，英文按 4 字符 ≈ 1 token
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const other = text.length - cjk;
  return Math.round(cjk * 0.6 + other / 4) + 1;
}

/* ---------------------------------- mock ---------------------------------- */

function parseIntent(text) {
  const city = /成都/.test(text) ? "成都" : /济南/.test(text) ? "济南" : null;
  const districtMatch = text.match(/(高新|锦江|武侯|成华|历下|历城)/);
  const district = districtMatch ? districtMatch[1] : null;
  const sortBy = /空置/.test(text) ? "vacancy" : /评分|口碑|品质/.test(text) ? "score" : "rent";
  const order = /便宜|最低|性价比|低租金/.test(text) ? "asc" : "desc";
  const wantChart = /对比|排名|图|趋势|分布|可视化/.test(text) || true;
  const limit = /(top\s*3|前\s*3|三个)/i.test(text) ? 3 : 5;
  return { city, district, sortBy, order, wantChart, limit };
}

const labelOf = { rent: "租金", vacancy: "空置率", score: "综合评分" };
const unitOf = { rent: "元/㎡/月", vacancy: "%", score: "分" };

async function mockEngine({ messages, emit, signal }) {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const text = last?.content || "";
  const intent = parseIntent(text);

  const think = intent.city
    ? `用户想看${intent.city}${intent.district ? intent.district + "区" : ""}的商办楼宇，关注点在${labelOf[intent.sortBy]}。先调用 query_buildings 取数，再决定是否需要出图。`
    : `用户没有明确城市，我不能瞎猜数据，先反问确认城市和关注指标，避免给出误导性结论。`;

  for (const chunk of think.match(/.{1,8}/g) || []) {
    if (signal?.aborted) return;
    emit("reasoning", { text: chunk });
    await sleep(45);
  }

  if (!intent.city) {
    const reply =
      "我需要先确认两件事，才能给你准确的楼宇数据：\n\n1. 你想看**哪个城市**？（目前数据集包含成都、济南）\n2. 你更关注**租金**、**空置率**还是**综合评分**？\n\n补充一句场景我也能帮你筛得更准，比如「预算 100 元/㎡/月以内、要地铁上盖」。";
    for (const chunk of reply.match(/[\s\S]{1,3}/g) || []) {
      if (signal?.aborted) return;
      emit("delta", { text: chunk });
      await sleep(18);
    }
    return { usage: { prompt: estimateTokens(text), completion: estimateTokens(reply) } };
  }

  // 1) 查数
  const queryArgs = {
    city: intent.city,
    ...(intent.district ? { district: intent.district } : {}),
    sortBy: intent.sortBy,
    order: intent.order,
    limit: intent.limit,
  };
  const callId = "call_" + Math.random().toString(36).slice(2, 9);
  emit("tool_call", { id: callId, name: "query_buildings", args: queryArgs, ts: Date.now() });
  await sleep(420);
  const result = runTool("query_buildings", queryArgs);
  emit("tool_result", {
    id: callId,
    name: "query_buildings",
    ok: result.ok,
    ms: result.elapsed,
    summary: result.summary,
    result: result.data,
  });

  // 2) 出图
  let chartCard = null;
  if (intent.wantChart && result.data?.length) {
    const chartArgs = {
      type: "bar",
      title: `${intent.city}${intent.district ? "·" + intent.district + "区" : ""} 楼宇${labelOf[intent.sortBy]}${intent.order === "desc" ? "TOP" + result.data.length : "由低到高"}`,
      unit: unitOf[intent.sortBy],
      data: result.data.map((b) => ({
        name: b.name.length > 8 ? b.name.slice(0, 7) + "…" : b.name,
        value: b[intent.sortBy],
      })),
    };
    const chartId = "call_" + Math.random().toString(36).slice(2, 9);
    emit("tool_call", { id: chartId, name: "render_chart", args: chartArgs, ts: Date.now() });
    await sleep(260);
    const chartRes = runTool("render_chart", chartArgs);
    chartCard = chartRes.data;
    emit("tool_result", {
      id: chartId,
      name: "render_chart",
      ok: chartRes.ok,
      ms: chartRes.elapsed,
      summary: chartRes.summary,
      result: chartCard,
    });
  }

  // 3) 组织回答（基于真实查询结果）
  const rows = result.data || [];
  const top = rows[0];
  const avg = rows.length ? (rows.reduce((s, b) => s + b.rent, 0) / rows.length).toFixed(1) : "-";
  const lines = [
    `按${labelOf[intent.sortBy]}${intent.order === "desc" ? "从高到低" : "从低到高"}排了 **${rows.length}** 个${intent.city}${intent.district ? intent.district + "区" : ""}的楼宇：`,
    "",
    "| 楼宇 | 行政区 | 租金(元/㎡/月) | 空置率 | 评分 |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map(
      (b) => `| ${b.name} | ${b.district} | ${b.rent} | ${b.vacancy}% | ${b.score} |`
    ),
    "",
    `- ${intent.order === "desc" ? "最高" : "最低"}的是 **${top.name}**：${top.rent} 元/㎡/月，空置率 ${top.vacancy}%，${top.tags.join("、")}`,
    `- 这 ${rows.length} 个楼宇的平均租金是 **${avg}** 元/㎡/月`,
    `- 如果预算紧张，可以优先看空置率高的项目（${rows
      .slice()
      .sort((a, b) => b.vacancy - a.vacancy)
      .slice(0, 2)
      .map((b) => `${b.name} ${b.vacancy}%`)
      .join("、")}），议价空间通常更大`,
    "",
    "需要我按「预算区间 + 地铁距离」再筛一轮吗？",
  ];
  const reply = lines.join("\n");

  // 注意用 [\s\S] 而非 . ：点号不匹配换行，会把表格 / 列表的换行吃掉
  for (const chunk of reply.match(/[\s\S]{1,3}/g) || []) {
    if (signal?.aborted) return;
    emit("delta", { text: chunk });
    await sleep(16);
  }

  return {
    usage: {
      prompt: estimateTokens(text),
      completion: estimateTokens(reply) + (chartCard ? 40 : 0),
    },
    chart: chartCard,
  };
}

/* ------------------------------ 真实模型接入 ------------------------------ */

async function openAIEngine({ messages, emit, signal }) {
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  let completionText = "";

  for (let round = 0; round < 3; round++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: convo, tools: toolSchemas, stream: true }),
      signal,
    });
    if (!res.ok) {
      throw new Error(`模型接口返回 ${res.status}：${(await res.text()).slice(0, 200)}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    const toolCalls = [];

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          continue;
        }
        const delta = json.choices?.[0]?.delta || {};
        if (delta.reasoning_content) emit("reasoning", { text: delta.reasoning_content });
        if (delta.content) {
          content += delta.content;
          completionText += delta.content;
          emit("delta", { text: delta.content });
        }
        for (const tc of delta.tool_calls || []) {
          const idx = tc.index ?? 0;
          toolCalls[idx] = toolCalls[idx] || { id: "", name: "", args: "" };
          if (tc.id) toolCalls[idx].id = tc.id;
          if (tc.function?.name) toolCalls[idx].name += tc.function.name;
          if (tc.function?.arguments) toolCalls[idx].args += tc.function.arguments;
        }
        if (json.usage && json.usage.total_tokens) {
          emit("usage", {
            prompt: json.usage.prompt_tokens || 0,
            completion: json.usage.completion_tokens || 0,
            total: json.usage.total_tokens,
          });
        }
      }
    }

    if (!toolCalls.length) {
      return { usage: { prompt: 0, completion: estimateTokens(completionText) } };
    }

    convo.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls.map((t) => ({
        id: t.id,
        type: "function",
        function: { name: t.name, arguments: t.args || "{}" },
      })),
    });

    for (const t of toolCalls) {
      let args = {};
      try {
        args = JSON.parse(t.args || "{}");
      } catch {
        args = {};
      }
      emit("tool_call", { id: t.id, name: t.name, args, ts: Date.now() });
      const out = runTool(t.name, args);
      emit("tool_result", {
        id: t.id,
        name: t.name,
        ok: out.ok,
        ms: out.elapsed,
        summary: out.summary,
        result: out.data,
      });
      convo.push({
        role: "tool",
        tool_call_id: t.id,
        content: JSON.stringify({ ok: out.ok, data: out.data }).slice(0, 6000),
      });
    }
  }
  return { usage: { prompt: 0, completion: estimateTokens(completionText) } };
}

export async function streamChat(payload) {
  if (process.env.OPENAI_API_KEY) return openAIEngine(payload);
  return mockEngine(payload);
}
