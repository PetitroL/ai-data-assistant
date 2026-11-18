---
title: 用 Vue3 + Node 做一个能真跑的 AI 对话式数据助手
date: 2026-11-18 20:00:00
tags:
  - AI
  - Vue3
  - Node
  - SSE
categories: 前端工程
---

简历上写「AI 对话式数据助手（Vue3 + Node）」很容易，被追问一句「工具调用那轮循环你怎么收敛的」就露馅了。所以我把这条做成了一个能真跑的项目：一句自然语言查楼宇数据，模型自己调工具取数、自己决定要不要出图，前端逐字流式渲染，还把每次工具调用的参数、状态、耗时、结果全部摊开给用户看。

- 在线体验：https://ai-data-assistant.onrender.com （无 Key 也能跑，内部是 Mock 引擎）
- 源码：https://github.com/sinolw/ai-data-assistant

<!-- more -->

## 想解决的真问题

大部分「AI 对话 Demo」的套路是：前端把问题发给后端，后端拼一段 prompt 丢给大模型，模型返回一段 Markdown，前端渲染。看着像那么回事，但它本质是个聊天框，不碰任何真实数据——问到具体数字，模型就开始编。

我想做的是另一半：**让模型负责「决定查什么」，让代码负责「真的去查」**。数字一定来自查询结果，模型只做组织语言和选择工具。

## 整体链路

```
用户提问
   │
   ▼
POST /api/chat ───────────► Express
                             │ ① 上下文压缩（>10 条 → 摘要 + 最近 6 条）
                             │ ② 带 tools 定义请求模型
                             ▼
                      模型返回 tool_calls
                             │ ③ 执行 query_buildings / render_chart
                             ▼
   SSE 逐条回推 ◄───────── ④ 结果以 role:"tool" 回灌，继续生成
   start / reasoning / delta / tool_call / tool_result / usage / done
```

两个工具，都用 JSON Schema 描述：

| 工具 | 作用 | 参数 |
| --- | --- | --- |
| `query_buildings` | 查楼宇数据 | city / district / sortBy / order / limit |
| `render_chart` | 产出图表 spec | type / title / unit / data[] |

有个设计我比较满意：`render_chart` **不生成图片**，只返回结构化 spec，前端拿 ECharts 渲染。好处是图表可交互、可换肤、可导出，而且不占模型输出 token——模型只需要给「柱状图、标题、五个数据点」，剩下的交给浏览器。

## 三个实现细节

**1. 工具调用循环怎么收敛**

```js
for (let round = 0; round < 3; round++) {
  const stream = await callModel(convo, tools);
  // 聚合 tool_calls 增量（流式里 function.arguments 是拼字符串）
  if (!toolCalls.length) break;
  for (const call of toolCalls) {
    const result = runTool(call.name, call.args);
    convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
  }
}
```

最多 3 轮，防止模型陷入「查了不满意再查」的死循环，也顺便兜住超时。

**2. SSE 事件设计**

除了常规的 `delta`，我额外推了 `reasoning`（思考过程）、`tool_call` / `tool_result`（工具调用前后各一发）、`context`（上下文被压缩时通知前端）、`usage`（token 用量）。这样前端能做出「思考过程折叠 + 工具卡片 + 用量统计」，而不是只有一个光秃秃的打字机效果。

**3. 前端不用 `marked`，自己写了个 60 行的 Markdown 渲染**

因为要 `v-html`，直接把模型输出塞进去就是 XSS。我的做法是**先转义再解析**：`& < > "` 全部转义后，再识别表格 / 列表 / 代码块 / 加粗 / 行内 code。只有白名单标签会被生成，链接统一加 `rel="noopener"`。

## 踩到的两个坑（都是真 bug）

**坑一：`req.on("close")` 会误判客户端中断**

第一版接完 SSE，测试只收到 `start / reasoning / done`，`done` 里还带 `aborted: true`，整个回答 49ms 就结束。排查下来：Express 的 `express.json()` 解析完请求体后，`req` 就会触发 `close`，被我的中断监听误认成「用户关掉了页面」。

```js
// 错：body 解析完就触发
req.on("close", () => controller.abort());
// 对：响应流真的断了才中止
res.on("close", () => { if (!res.writableEnded) controller.abort(); });
```

**坑二：`.{1,3}` 把换行吃掉了**

为了让 Mock 引擎模拟逐字输出，我按 3 个字符切片：

```js
reply.match(/.{1,3}/g)   // 点号不匹配 \n！
```

结果所有换行被丢弃，前端拿到的是一整段带 `|` 的文本，Markdown 表格完全解析不出来——屏幕上就是一坨竖线。改成正则 `[\s\S]{1,3}` 才正常。

这两个坑现在都写进了 `scripts/smoke.mjs` 的断言里：冒烟测试会检查事件数量、`done` 是否被误标 `aborted`、流式片段里表格换行是否完好。以后改代码，回归直接拦住。

## 顺手做的体积优化

ECharts 全量引入时构建产物 1,120KB（gzip 378KB）。改成按需注册后：

```js
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
echarts.use([...]);
```

589KB（gzip 205KB），砍掉 47%。

## 怎么跑起来

```bash
npm install && npm run dev     # 前端 5179，后端 5178
```

**不需要 API Key**：没配密钥时走内置 Mock 引擎，数据是 19 条成都 / 济南商办楼宇的样例集，但查询是真的走工具、图表是真的渲染，演示效果一致。配了 `OPENAI_API_KEY`（任何 OpenAI 兼容接口都行，DeepSeek / 通义 / 豆包都可以）就切真实模型。

部署也配好了：多阶段 `Dockerfile` + `/api/health` 健康检查，`docker run -p 5178:5178` 一个端口就能同时跑 API 和前端。注意它需要 Node 常驻（SSE），所以不能丢到 GitHub Pages 这类纯静态托管。

## 一点体会

做完这个项目最大的感受是：AI 应用的门槛不在「调通接口」，而在**把不确定性关进笼子**。模型可以自由决定查什么、怎么答，但取数一定走工具、参数一定过 Schema、循环一定设上限、上下文一定做压缩、失败一定有降级路径。这些东西写出来不酷，但它们是「能演示」和「敢上线」之间的差别。
