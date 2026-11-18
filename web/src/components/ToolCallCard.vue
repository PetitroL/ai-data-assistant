<template>
  <div class="tool-card" :class="block.status">
    <div class="tool-head">
      <span class="tool-icon">{{ isChart ? "▤" : "⌕" }}</span>
      <span class="tool-name">{{ label }}</span>
      <span class="tool-fn">{{ block.name }}</span>
      <span class="tool-status">
        <template v-if="block.status === 'running'"><i class="dot pulse" />执行中</template>
        <template v-else-if="block.status === 'done'"><i class="dot ok" />{{ block.ms }}ms</template>
        <template v-else><i class="dot err" />失败</template>
      </span>
      <button class="tool-toggle" @click="open = !open">{{ open ? "收起参数" : "查看参数" }}</button>
    </div>

    <div v-if="open" class="tool-args">
      <pre>{{ prettyArgs }}</pre>
    </div>

    <div v-if="block.status !== 'running'" class="tool-body">
      <div class="tool-summary">{{ block.summary }}</div>

      <ChartView v-if="isChart && block.result" :spec="block.result" />

      <div v-else-if="isData && block.result?.length" class="tool-table">
        <table>
          <thead>
            <tr><th>楼宇</th><th>区</th><th>租金</th><th>空置率</th><th>评分</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in block.result" :key="row.id">
              <td class="strong">{{ row.name }}</td>
              <td>{{ row.district }}</td>
              <td>{{ row.rent }}</td>
              <td>{{ row.vacancy }}%</td>
              <td>{{ row.score }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import ChartView from "./ChartView.vue";

const props = defineProps({ block: { type: Object, required: true } });

const open = ref(false);

const isChart = computed(() => props.block.name === "render_chart");
const isData = computed(() => props.block.name === "query_buildings");
const label = computed(() =>
  isChart.value ? "渲染图表" : isData.value ? "查询楼宇数据" : props.block.name
);
const prettyArgs = computed(() => {
  try {
    return JSON.stringify(props.block.args, null, 2);
  } catch {
    return String(props.block.args);
  }
});
</script>

<style scoped>
.tool-card {
  margin: 10px 0 12px;
  border: 1px solid #e5e7eb;
  border-left: 3px solid #0d7d6f;
  border-radius: 10px;
  background: #fbfcfc;
  overflow: hidden;
}
.tool-card.error {
  border-left-color: #dc2626;
}
.tool-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #f4f7f7;
  font-size: 12px;
}
.tool-icon {
  color: #0d7d6f;
  font-size: 13px;
}
.tool-name {
  font-weight: 600;
  color: #111827;
}
.tool-fn {
  color: #6b7280;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.tool-status {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #4b5563;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
  display: inline-block;
}
.dot.ok {
  background: #0d7d6f;
}
.dot.err {
  background: #dc2626;
}
.dot.pulse {
  background: #d97706;
  animation: blink 1s infinite;
}
@keyframes blink {
  50% {
    opacity: 0.35;
  }
}
.tool-toggle {
  border: none;
  background: none;
  color: #0d7d6f;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
}
.tool-toggle:hover {
  text-decoration: underline;
}
.tool-args {
  padding: 8px 12px;
  background: #fff;
  border-bottom: 1px dashed #eef1f1;
}
.tool-args pre {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.55;
  color: #374151;
  white-space: pre-wrap;
  word-break: break-all;
}
.tool-body {
  padding: 10px 12px 12px;
  background: #fff;
}
.tool-summary {
  font-size: 11.5px;
  color: #6b7280;
  margin-bottom: 8px;
}
.tool-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11.5px;
}
.tool-table th {
  text-align: left;
  font-weight: 600;
  color: #374151;
  padding: 5px 8px;
  background: #f7f9f9;
  border-bottom: 1px solid #e5e7eb;
}
.tool-table td {
  padding: 5px 8px;
  color: #4b5563;
  border-bottom: 1px solid #f1f2f4;
}
.tool-table td.strong {
  color: #111827;
  font-weight: 500;
}
</style>
