<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo">◈</div>
        <div>
          <div class="brand-name">商办数据助手</div>
          <div class="brand-sub">AI Data Assistant</div>
        </div>
      </div>

      <div class="side-block">
        <div class="side-title">试试这样问</div>
        <button
          v-for="q in examples"
          :key="q"
          class="example"
          :disabled="sending"
          @click="ask(q)"
        >
          {{ q }}
        </button>
      </div>

      <div class="side-block grow">
        <div class="side-title">
          历史会话
          <button class="mini" @click="newSession">＋ 新对话</button>
        </div>
        <div class="history">
          <div
            v-for="s in sessions"
            :key="s.id"
            class="history-item"
            :class="{ active: s.id === activeId }"
            @click="activeId = s.id"
          >
            <span class="history-title">{{ s.title }}</span>
            <span class="history-meta">{{ s.messages.length }} 条</span>
            <button class="del" title="删除" @click.stop="removeSession(s.id)">×</button>
          </div>
        </div>
        <button class="clear-all" @click="clearAll">清空全部会话</button>
      </div>

      <div class="side-foot">
        <span class="engine" :class="engine">{{ engine === "mock" ? "Mock 引擎" : "真实模型" }}</span>
        <span class="hint">数据为演示用样例集</span>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="topbar-left">
          <span class="topbar-title">{{ activeSession?.title || "新对话" }}</span>
          <span class="badge">19 个楼宇 · 成都 / 济南</span>
        </div>
        <div class="topbar-right">
          <span class="token-total">累计 {{ totalTokens }} tokens</span>
          <button v-if="sending" class="stop-btn" @click="stop">停止生成</button>
        </div>
      </header>

      <div ref="scroller" class="chat-scroll">
        <div v-if="!messages.length" class="welcome">
          <h1>用一句话问出你要的楼宇数据</h1>
          <p>
            后端把「查数」和「出图」做成两个工具交给模型调用，前端用 SSE 逐字渲染，
            并实时显示工具调用的参数、耗时与返回结果。
          </p>
          <div class="welcome-grid">
            <div>
              <div class="card-title">工具调用可视化</div>
              <p>模型每次调用工具，都会渲染成卡片：参数 → 状态 → 结果</p>
            </div>
            <div>
              <div class="card-title">结果即图表</div>
              <p>render_chart 返回的图表 spec 直接交给 ECharts 渲染</p>
            </div>
            <div>
              <div class="card-title">上下文可控</div>
              <p>超过 10 条自动压缩为摘要 + 最近 6 条原文，避免上下文爆炸</p>
            </div>
          </div>
        </div>

        <MessageItem
          v-for="(m, i) in messages"
          :key="m.id"
          :message="m"
          :index="i"
          @regenerate="regenerate"
        />
      </div>

      <div class="composer">
        <div class="composer-box">
          <textarea
            v-model="draft"
            rows="1"
            placeholder="例如：成都高新区租金最高的 5 个楼宇，出图对比一下"
            :disabled="sending"
            @keydown.enter.exact.prevent="submit"
            @input="autosize"
            ref="ta"
          />
          <button class="send" :disabled="!draft.trim() || sending" @click="submit">
            {{ sending ? "生成中" : "发送" }}
          </button>
        </div>
        <div class="composer-hint">Enter 发送 · Shift + Enter 换行 · 答案基于本地样例数据集</div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from "vue";
import MessageItem from "./components/MessageItem.vue";
import { useChat } from "./composables/useChat.js";

const {
  sessions,
  activeId,
  activeSession,
  messages,
  sending,
  engine,
  totalTokens,
  send,
  stop,
  regenerate,
  newSession,
  removeSession,
  clearAll,
} = useChat();

const examples = [
  "成都高新区租金最高的 5 个楼宇，帮我出图对比",
  "济南历下区空置率最低的楼宇有哪些？",
  "成都和济南的写字楼租金水平差多少？",
  "哪个楼宇性价比最高？",
];

const draft = ref("");
const ta = ref(null);
const scroller = ref(null);

function autosize() {
  const el = ta.value;
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 140) + "px";
}

async function ask(q) {
  draft.value = q;
  await submit();
}

async function submit() {
  const text = draft.value.trim();
  if (!text || sending.value) return;
  draft.value = "";
  await nextTick();
  autosize();
  await send(text);
}

function scrollToBottom() {
  const el = scroller.value;
  if (!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
  if (nearBottom || sending.value) el.scrollTop = el.scrollHeight;
}

watch(
  () => messages.value.map((m) => m.content.length + m.blocks.length).join(","),
  () => nextTick(scrollToBottom)
);

// ?demo=1：自动跑一条示例，方便录屏 / 截图 / 演示
onMounted(() => {
  if (new URLSearchParams(location.search).get("demo") === "1") {
    setTimeout(() => ask(examples[0]), 400);
  }
});
</script>
