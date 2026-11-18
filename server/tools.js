// 工具定义与执行器：查询楼宇数据、渲染图表
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILDINGS = JSON.parse(
  fs.readFileSync(path.join(__dirname, "data", "buildings.json"), "utf-8")
);

/** 提供给模型的工具描述（OpenAI tools 格式） */
export const toolSchemas = [
  {
    type: "function",
    function: {
      name: "query_buildings",
      description:
        "查询商办楼宇数据。可按城市、行政区筛选，并按租金/空置率/评分排序，返回楼宇列表。",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string", description: "城市，例如 成都 / 济南" },
          district: { type: "string", description: "行政区，例如 高新 / 历下" },
          sortBy: { type: "string", enum: ["rent", "vacancy", "score"], description: "排序字段" },
          order: { type: "string", enum: ["desc", "asc"], description: "排序方向，默认 desc" },
          limit: { type: "integer", description: "返回条数，默认 5，最大 20" },
        },
        required: ["city"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "render_chart",
      description:
        "把查询结果渲染成图表卡片。当用户需要对比、排名或看趋势时调用，数据必须来自已查询到的真实结果。",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["bar", "line", "pie"], description: "图表类型" },
          title: { type: "string", description: "图表标题" },
          unit: { type: "string", description: "数值单位，例如 元/㎡/月" },
          data: {
            type: "array",
            description: "图表数据",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                value: { type: "number" },
              },
              required: ["name", "value"],
            },
          },
        },
        required: ["type", "title", "data"],
      },
    },
  },
];

const byField = {
  rent: (b) => b.rent,
  vacancy: (b) => b.vacancy,
  score: (b) => b.score,
};

export function runTool(name, args = {}) {
  const started = Date.now();
  if (name === "query_buildings") {
    const { city, district, sortBy = "rent", order = "desc", limit = 5 } = args;
    let list = BUILDINGS.slice();
    if (city) list = list.filter((b) => b.city.includes(city));
    if (district) list = list.filter((b) => b.district.includes(district));
    const key = byField[sortBy] || byField.rent;
    list.sort((a, b) => (order === "asc" ? key(a) - key(b) : key(b) - key(a)));
    const total = list.length;
    list = list.slice(0, Math.min(Number(limit) || 5, 20));
    return {
      ok: true,
      elapsed: Date.now() - started,
      summary: `命中 ${total} 条，返回 ${list.length} 条`,
      data: list,
    };
  }

  if (name === "render_chart") {
    const { type = "bar", title = "图表", unit = "", data = [] } = args;
    return {
      ok: true,
      elapsed: Date.now() - started,
      summary: `${type} 图 · ${data.length} 个数据点`,
      data: { type, title, unit, data },
    };
  }

  return { ok: false, elapsed: Date.now() - started, summary: `未知工具：${name}`, data: null };
}
