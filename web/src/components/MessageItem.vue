<template>
  <div class="msg" :class="message.role">
    <div class="avatar" :class="message.role">
      <span v-if="message.role === 'user'">罗</span>
      <span v-else>AI</span>
    </div>

    <div class="body">
      <!-- 用户消息 -->
      <div v-if="message.role === 'user'" class="user-bubble">{{ message.content }}</div>

      <!-- 助手消息 -->
      <template v-else>
        <div class="assistant-card">
          <template v-for="(block, i) in message.blocks" :key="i">
            <!-- 思考过程 -->
            <div v-if="block.type === 'reasoning'" class="reasoning">
              <button class="reasoning-head" @click="block.open = !block.open">
                <span class="chev" :class="{ open: block.open }">›</span>
                思考过程
                <span class="reasoning-len">{{ block.text.length }} 字</span>
              </button>
              <div v-if="block.open" class="reasoning-body">{{ block.text }}</div>
            </div>

            <!-- 系统提示 / 降级说明 -->
            <div v-else-if="block.type === 'note'" class="note">
              <span>ⓘ</span>{{ block.text }}
            </div>

            <!-- 工具调用 -->
            <ToolCallCard v-else-if="block.type === 'tool'" :block="block" />

            <!-- 正文 -->
            <div
              v-else-if="block.type === 'text'"
              class="markdown"
              v-html="renderMarkdown(block.text)"
            />
          </template>

          <div v-if="message.streaming && !message.content" class="typing">
            <i /><i /><i />
          </div>

          <div v-if="message.error" class="error-box">
            <div class="error-title">⚠ 本次生成中断</div>
            <div>{{ message.error }}</div>
            <div v-if="message.errorDetail" class="error-detail">{{ message.errorDetail }}</div>
          </div>

          <div v-if="message.aborted" class="aborted">已停止生成</div>
        </div>

        <div class="msg-foot">
          <span v-if="message.usage" class="usage">
            消耗 {{ message.usage.prompt }} + {{ message.usage.completion }} =
            {{ message.usage.total }} tokens
          </span>
          <span v-if="message.elapsed" class="elapsed">{{ (message.elapsed / 1000).toFixed(1) }}s</span>
          <button v-if="!message.streaming" class="link" @click="$emit('regenerate', index)">
            重新生成
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { renderMarkdown } from "../utils/markdown.js";
import ToolCallCard from "./ToolCallCard.vue";

defineProps({
  message: { type: Object, required: true },
  index: { type: Number, required: true },
});
defineEmits(["regenerate"]);
</script>

<style scoped>
.msg {
  display: flex;
  gap: 10px;
  margin: 18px 0;
}
.msg.user {
  flex-direction: row-reverse;
}
.avatar {
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.avatar.user {
  background: #111827;
  color: #fff;
}
.avatar.assistant {
  background: #e6f2ef;
  color: #0d7d6f;
  border: 1px solid #cfe5e0;
}
.body {
  max-width: min(760px, 86%);
}
.user-bubble {
  background: #111827;
  color: #fff;
  padding: 10px 14px;
  border-radius: 12px 4px 12px 12px;
  font-size: 13.5px;
  line-height: 1.7;
  white-space: pre-wrap;
}
.assistant-card {
  background: #fff;
  border: 1px solid #e8ebed;
  border-radius: 4px 12px 12px 12px;
  padding: 12px 14px;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
}
.reasoning {
  margin-bottom: 8px;
}
.reasoning-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: #f6f8f8;
  border-radius: 6px;
  padding: 4px 9px;
  font-size: 11.5px;
  color: #6b7280;
  cursor: pointer;
}
.reasoning-head:hover {
  color: #0d7d6f;
}
.chev {
  display: inline-block;
  transition: transform 0.15s;
}
.chev.open {
  transform: rotate(90deg);
}
.reasoning-len {
  color: #9ca3af;
}
.reasoning-body {
  margin-top: 6px;
  padding: 8px 10px;
  background: #f8faf9;
  border-left: 2px solid #d7e8e4;
  border-radius: 0 6px 6px 0;
  font-size: 12px;
  line-height: 1.75;
  color: #6b7280;
  white-space: pre-wrap;
}
.note {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 11.5px;
  color: #8a6d3b;
  background: #fdf8ec;
  border: 1px solid #f5e6c8;
  border-radius: 6px;
  padding: 5px 9px;
  margin: 8px 0;
}
.typing {
  display: flex;
  gap: 4px;
  padding: 4px 0;
}
.typing i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0d7d6f;
  opacity: 0.4;
  animation: bounce 1.2s infinite;
}
.typing i:nth-child(2) {
  animation-delay: 0.15s;
}
.typing i:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.35;
  }
  30% {
    transform: translateY(-4px);
    opacity: 1;
  }
}
.error-box {
  margin-top: 10px;
  border: 1px solid #f1d7d7;
  background: #fdf4f4;
  border-radius: 8px;
  padding: 9px 11px;
  font-size: 12px;
  line-height: 1.7;
  color: #a02b2b;
}
.error-title {
  font-weight: 600;
  margin-bottom: 3px;
}
.error-detail {
  color: #b98a8a;
  font-size: 11px;
  margin-top: 4px;
}
.aborted {
  margin-top: 8px;
  font-size: 11.5px;
  color: #9ca3af;
}
.msg-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 2px 0;
  font-size: 11px;
  color: #9ca3af;
}
.usage {
  color: #6b7280;
}
.link {
  border: none;
  background: none;
  color: #0d7d6f;
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.link:hover {
  text-decoration: underline;
}
</style>
