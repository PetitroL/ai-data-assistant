// 轻量 Markdown 渲染（先转义再解析，避免 v-html 带来的 XSS 风险）
const ESC = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function inline(text) {
  return ESC(text)
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function renderTable(rows) {
  const cells = (line) =>
    line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const [head, , ...body] = rows;
  const th = cells(head).map((c) => `<th>${inline(c)}</th>`).join("");
  const trs = body
    .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<div class="md-table-wrap"><table class="md-table"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

export function renderMarkdown(md = "") {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) buf.push(lines[i++]);
      i++;
      out.push(
        `<pre class="md-code" data-lang="${ESC(lang)}"><code>${ESC(buf.join("\n"))}</code></pre>`
      );
      continue;
    }

    // 表格
    if (/^\|.*\|$/.test(line.trim()) && /^\|[\s:|-]+\|$/.test((lines[i + 1] || "").trim())) {
      const rows = [];
      while (i < lines.length && /^\|.*\|$/.test(lines[i].trim())) rows.push(lines[i++]);
      out.push(renderTable(rows));
      continue;
    }

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 2, 5);
      out.push(`<h${level} class="md-h">${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 列表
    if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const items = [];
      while (i < lines.length && /^\s*(?:[-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*(?:[-*]|\d+\.)\s+/, ""));
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag} class="md-list">${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }

    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 段落
    const buf = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(\||```|#{1,4}\s)/.test(lines[i].trim())) {
      buf.push(lines[i]);
      i++;
    }
    out.push(`<p class="md-p">${inline(buf.join(" "))}</p>`);
  }

  return out.join("");
}
