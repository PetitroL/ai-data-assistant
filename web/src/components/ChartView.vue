<template>
  <div ref="el" class="chart-view"></div>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
// 按需引入，避免把整个 echarts 打进包里（全量约 1.12MB，按需后约 589KB / gzip 205KB）
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, TooltipComponent, TitleComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, TitleComponent, CanvasRenderer]);

const props = defineProps({
  spec: { type: Object, required: true },
});

const el = ref(null);
let chart = null;
let ro = null;

const palette = ["#0d7d6f", "#12907f", "#3aa694", "#68b9a9", "#96cbbf", "#c2ded7"];

function render() {
  if (!el.value) return;
  chart = chart || echarts.init(el.value);
  const { type = "bar", title = "", unit = "", data = [] } = props.spec;

  const series =
    type === "pie"
      ? [
          {
            type: "pie",
            radius: ["42%", "68%"],
            itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 4 },
            label: { formatter: "{b}\n{c}" },
            data: data.map((d, i) => ({
              name: d.name,
              value: d.value,
              itemStyle: { color: palette[i % palette.length] },
            })),
          },
        ]
      : [
          {
            type,
            smooth: type === "line",
            barMaxWidth: 34,
            itemStyle: { color: "#0d7d6f", borderRadius: type === "bar" ? [3, 3, 0, 0] : 0 },
            areaStyle: type === "line" ? { color: "rgba(13,125,111,0.12)" } : null,
            data: data.map((d) => d.value),
          },
        ];

  chart.setOption(
    {
      backgroundColor: "transparent",
      title: {
        text: title,
        subtext: unit ? `单位：${unit}` : "",
        left: 0,
        top: 0,
        textStyle: { fontSize: 13, fontWeight: 600, color: "#111827" },
        subtextStyle: { fontSize: 11, color: "#6b7280" },
      },
      tooltip: { trigger: type === "pie" ? "item" : "axis" },
      grid: { left: 8, right: 12, bottom: 6, top: 46, containLabel: true },
      xAxis:
        type === "pie"
          ? { show: false }
          : {
              type: "category",
              data: data.map((d) => d.name),
              axisLine: { lineStyle: { color: "#e5e7eb" } },
              axisTick: { show: false },
              axisLabel: { color: "#4b5563", fontSize: 11, interval: 0, rotate: data.length > 6 ? 24 : 0 },
            },
      yAxis:
        type === "pie"
          ? { show: false }
          : {
              type: "value",
              axisLine: { show: false },
              splitLine: { lineStyle: { color: "#f1f2f4" } },
              axisLabel: { color: "#9ca3af", fontSize: 11 },
            },
      series,
    },
    true
  );
}

onMounted(() => {
  render();
  ro = new ResizeObserver(() => chart && chart.resize());
  if (el.value) ro.observe(el.value);
});

watch(() => props.spec, render, { deep: true });

onBeforeUnmount(() => {
  ro && ro.disconnect();
  chart && chart.dispose();
  chart = null;
});
</script>

<style scoped>
.chart-view {
  width: 100%;
  height: 240px;
}
</style>
