const fs = require("fs");
const https = require("https");
const path = require("path");

const USERNAME = process.env.GITHUB_USERNAME || "shivanshsenpai";
const ROOT = path.resolve(__dirname, "..");
const OUT_FILE = path.join(ROOT, "assets", "isometric-streak-live.svg");
const README_FILE = path.join(ROOT, "README.md");
const CONTRIBUTIONS_URL = `https://github.com/users/${USERNAME}/contributions`;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "isometric-streak-generator" } }, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { body += chunk; });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Request failed ${res.statusCode}: ${body.slice(0, 200)}`));
            return;
          }
          resolve(body);
        });
      })
      .on("error", reject);
  });
}

function parseContributionDays(html) {
  const dayPattern = /<td(?=[^>]*ContributionCalendar-day)(?=[^>]*data-date="([^"]+)")(?=[^>]*data-level="([^"]+)")[^>]*><\/td>\s*<tool-tip[^>]*>([\s\S]*?)<\/tool-tip>/g;
  const days = [];
  for (const match of html.matchAll(dayPattern)) {
    const tooltip = match[3].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const countMatch = tooltip.match(/([\d,]+)\s+contribution/);
    const count = countMatch ? Number(countMatch[1].replace(/,/g, "")) : 0;
    days.push({
      date: match[1],
      level: Number(match[2]),
      count
    });
  }
  if (!days.length) throw new Error("Could not parse GitHub contribution calendar.");
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function parseDate(key) {
  return new Date(`${key}T00:00:00Z`);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function startOfWeek(date) {
  return addDays(date, -date.getUTCDay());
}

function monthName(date) {
  return date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function formatDay(date) {
  return `${monthName(date)} ${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatRange(start, end) {
  return `${formatDay(start)} - ${formatDay(end)}, ${end.getUTCFullYear()}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function computeStats(days) {
  let current = 0;
  for (let i = days.length - 1; i >= 0; i -= 1) {
    if (days[i].count > 0 || days[i].level > 0) current += 1;
    else break;
  }

  let best = 0;
  let run = 0;
  for (const day of days) {
    if (day.count > 0 || day.level > 0) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  const total = days.reduce((sum, day) => sum + day.count, 0);
  const active = days.filter((day) => day.count > 0 || day.level > 0).length;
  const peak = days.reduce((bestDay, day) => (day.count > bestDay.count ? day : bestDay), days[0]);
  return { current, best, total, active, peak };
}

function towerHeight(count) {
  if (count <= 0) return 0;
  if (count >= 20) return 78;
  if (count >= 15) return 68;
  if (count >= 10) return 58;
  if (count >= 7) return 48;
  if (count >= 5) return 40;
  if (count >= 3) return 32;
  if (count >= 2) return 26;
  return 20;
}

function towerColors(count) {
  if (count >= 15) return ["#34d399", "#059669", "#047857"];
  if (count >= 8) return ["#4ade80", "#16a34a", "#15803d"];
  if (count >= 5) return ["#86efac", "#22c55e", "#16a34a"];
  if (count >= 2) return ["#bbf7d0", "#4ade80", "#22c55e"];
  return ["#dcfce7", "#86efac", "#22c55e"];
}

function renderTile(cx, by) {
  return `<polygon points="${cx},${by - 7} ${cx + 15},${by} ${cx},${by + 7} ${cx - 15},${by}" fill="#dbeafe" stroke="#bfdbfe" stroke-width="0.8" opacity="0.86" />`;
}

function renderTower(day, position) {
  const { cx, by } = position;
  if (day.count <= 0) return renderTile(cx, by);

  const height = towerHeight(day.count);
  const topY = by - height;
  const [top, left, right] = towerColors(day.count);
  const label = String(day.count);
  return [
    `<g class="tower">`,
    `<title>${escapeXml(`${formatDay(parseDate(day.date))}: ${day.count} ${day.count === 1 ? "edit" : "edits"}`)}</title>`,
    `<polygon points="${cx - 15},${topY} ${cx},${topY + 8} ${cx},${by + 8} ${cx - 15},${by}" fill="${left}" />`,
    `<polygon points="${cx + 15},${topY} ${cx},${topY + 8} ${cx},${by + 8} ${cx + 15},${by}" fill="${right}" />`,
    `<polygon points="${cx},${topY - 8} ${cx + 15},${topY} ${cx},${topY + 8} ${cx - 15},${topY}" fill="${top}" />`,
    `<text x="${cx}" y="${topY - 12}" class="count">${label}</text>`,
    `</g>`
  ].join("\n");
}

function renderMonthLabels(days, positions) {
  const labels = [];
  let lastMonth = "";
  days.forEach((day, index) => {
    const date = parseDate(day.date);
    const month = monthName(date);
    if (month !== lastMonth) {
      const position = positions[index];
      labels.push(`<text x="${position.cx - 8}" y="282" class="month">${month}</text>`);
      lastMonth = month;
    }
  });
  return labels.join("\n");
}

function renderWeekTicks(days, positions) {
  const ticks = [];
  days.forEach((day, index) => {
    const date = parseDate(day.date);
    const isFirst = index === 0;
    const isMonthStartWeek = date.getUTCDay() === 0 && date.getUTCDate() <= 7;
    const isLast = index === days.length - 1;
    if (!isFirst && !isMonthStartWeek && !isLast) return;
    const position = positions[index];
    ticks.push(`<text x="${position.cx}" y="640" class="date">${formatDay(date)}</text>`);
  });
  return ticks.join("\n");
}

function buildSvg(days, stats, rangeStart, rangeEnd) {
  const start = startOfWeek(rangeStart);
  const dayMap = new Map(days.map((day) => [day.date, day]));
  const visibleDays = [];
  for (let cursor = new Date(start); cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
    const key = dateKey(cursor);
    visibleDays.push(dayMap.get(key) || { date: key, level: 0, count: 0 });
  }

  const positions = visibleDays.map((day, index) => {
    const week = Math.floor(index / 7);
    const dow = index % 7;
    return {
      cx: 94 + week * 39,
      by: 344 + dow * 37
    };
  });

  const towers = visibleDays.map((day, index) => renderTower(day, positions[index])).join("\n");
  const monthLabels = renderMonthLabels(visibleDays, positions);
  const weekTicks = renderWeekTicks(visibleDays, positions);
  const rangeLabel = formatRange(rangeStart, rangeEnd);
  const peakDate = formatDay(parseDate(stats.peak.date));
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 760" role="img" aria-labelledby="title desc">
  <title id="title">Six-month isometric GitHub contribution timeline for ${USERNAME}</title>
  <desc id="desc">Dynamic six-month isometric timeline generated from public GitHub contribution data.</desc>

  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#f8fafc" />
      <stop offset="0.52" stop-color="#eff6ff" />
      <stop offset="1" stop-color="#ecfdf5" />
    </linearGradient>
    <linearGradient id="panel" x1="0" x2="1">
      <stop offset="0" stop-color="#0f172a" />
      <stop offset="1" stop-color="#164e63" />
    </linearGradient>
    <linearGradient id="rail" x1="0" x2="1">
      <stop offset="0" stop-color="#22c55e" stop-opacity="0.13" />
      <stop offset="0.62" stop-color="#16a34a" stop-opacity="0.22" />
      <stop offset="1" stop-color="#2563eb" stop-opacity="0.16" />
    </linearGradient>
    <filter id="shadow" x="-25%" y="-35%" width="150%" height="170%">
      <feDropShadow dx="0" dy="8" stdDeviation="7" flood-color="#0f172a" flood-opacity="0.16" />
    </filter>
    <filter id="glow" x="-45%" y="-45%" width="190%" height="190%">
      <feGaussianBlur stdDeviation="7" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <style>
    .kicker { font: 800 13px Inter, Segoe UI, Arial, sans-serif; letter-spacing: .09em; text-transform: uppercase; fill: #2563eb; }
    .title { font: 850 39px Inter, Segoe UI, Arial, sans-serif; fill: #0f172a; }
    .copy { font: 500 16px Inter, Segoe UI, Arial, sans-serif; fill: #475569; }
    .tiny { font: 600 12px Inter, Segoe UI, Arial, sans-serif; fill: #64748b; letter-spacing: .02em; }
    .stat-label { font: 800 11px Inter, Segoe UI, Arial, sans-serif; fill: #cbd5e1; letter-spacing: .07em; text-transform: uppercase; }
    .stat-value { font: 850 30px Inter, Segoe UI, Arial, sans-serif; fill: #ffffff; }
    .stat-note { font: 600 12px Inter, Segoe UI, Arial, sans-serif; fill: #bfdbfe; }
    .mini-label { font: 800 10px Inter, Segoe UI, Arial, sans-serif; fill: #2563eb; letter-spacing: .07em; text-transform: uppercase; }
    .mini-value { font: 850 22px Inter, Segoe UI, Arial, sans-serif; fill: #0f172a; }
    .count { font: 850 8px Inter, Segoe UI, Arial, sans-serif; fill: #0f172a; text-anchor: middle; paint-order: stroke; stroke: #ffffff; stroke-width: 3px; stroke-linejoin: round; }
    .date { font: 800 10px Inter, Segoe UI, Arial, sans-serif; fill: #334155; text-anchor: middle; }
    .month { font: 850 13px Inter, Segoe UI, Arial, sans-serif; fill: #2563eb; letter-spacing: .09em; text-transform: uppercase; }
    .axis { font: 700 12px Inter, Segoe UI, Arial, sans-serif; fill: #64748b; }
  </style>

  <rect x="18" y="18" width="1164" height="724" rx="30" fill="url(#bg)" stroke="#dbeafe" />
  <path d="M44 616 C254 496 421 636 650 538 C830 462 949 500 1158 384" fill="none" stroke="#bfdbfe" stroke-width="2" opacity="0.58" />
  <path d="M60 672 C263 598 423 684 672 616 C844 567 966 574 1146 530" fill="none" stroke="#bbf7d0" stroke-width="2" opacity="0.65" />

  <text x="58" y="72" class="kicker">GitHub Streak</text>
  <text x="58" y="118" class="title">Six-Month Isometric Timeline</text>
  <text x="58" y="150" class="copy">Every tower is a day. Height and number show daily edits across the last six months.</text>
  <text x="58" y="175" class="tiny">Range: ${escapeXml(rangeLabel)}. Auto-generated from the public GitHub contribution calendar.</text>

  <g transform="translate(730 54)">
    <rect width="172" height="112" rx="22" fill="url(#panel)" filter="url(#shadow)" />
    <text x="22" y="34" class="stat-label">Current streak</text>
    <text x="22" y="75" class="stat-value">${stats.current} days</text>
    <text x="22" y="96" class="stat-note">through ${escapeXml(formatDay(rangeEnd))}</text>
  </g>
  <g transform="translate(924 54)">
    <rect width="204" height="112" rx="22" fill="#ffffff" stroke="#dbeafe" filter="url(#shadow)" />
    <text x="22" y="34" class="mini-label">Six-month total</text>
    <text x="22" y="73" class="mini-value">${stats.total}</text>
    <text x="22" y="94" class="tiny">contributions</text>
  </g>
  <g transform="translate(730 186)">
    <rect width="172" height="74" rx="18" fill="#ffffff" stroke="#dbeafe" />
    <text x="22" y="30" class="mini-label">Best streak</text>
    <text x="22" y="56" class="mini-value" style="font-size:20px">${stats.best} days</text>
  </g>
  <g transform="translate(924 186)">
    <rect width="204" height="74" rx="18" fill="#ffffff" stroke="#dbeafe" />
    <text x="22" y="30" class="mini-label">Active days / peak</text>
    <text x="22" y="52" class="mini-value" style="font-size:18px">${stats.active} active days</text>
    <text x="22" y="67" class="tiny">Peak: ${stats.peak.count} on ${escapeXml(peakDate)}</text>
  </g>

  <g id="timeline">
    <path d="M62 328 L1144 328 L1160 618 L78 618 Z" fill="url(#rail)" stroke="#bfdbfe" stroke-width="1.4" />
    <path d="M90 606 C360 548 745 638 1128 560" fill="none" stroke="#22c55e" stroke-width="7" stroke-linecap="round" opacity="0.18" filter="url(#glow)" />
    ${monthLabels}
    ${towers}
    ${weekTicks}
    <text x="82" y="714" class="axis">Numbers above active towers are daily edits. Month and week labels make the six-month timeline readable.</text>
    <text x="972" y="714" class="axis">Updated: ${escapeXml(generated)} UTC</text>
  </g>
</svg>
`;
}

function updateReadme(cacheKey) {
  const nextSrc = `./assets/isometric-streak-live.svg?v=${cacheKey}`;
  let readme = fs.readFileSync(README_FILE, "utf8");
  const imagePattern = /<img width="100%" src="\.\/assets\/isometric-streak[^"]*\.svg(?:\?v=[^"]*)?" alt="[^"]*" \/>/;
  const replacement = `<img width="100%" src="${nextSrc}" alt="Dynamic six-month isometric GitHub contribution timeline" />`;
  if (!imagePattern.test(readme)) {
    throw new Error("Could not find streak image tag in README.md.");
  }
  readme = readme.replace(imagePattern, replacement);
  fs.writeFileSync(README_FILE, readme);
}

async function main() {
  const html = await fetchText(CONTRIBUTIONS_URL);
  const allDays = parseContributionDays(html);
  const latestDate = parseDate(allDays[allDays.length - 1].date);
  const rangeStart = addDays(addMonths(latestDate, -6), 1);
  const sixMonthDays = allDays.filter((day) => {
    const date = parseDate(day.date);
    return date >= rangeStart && date <= latestDate;
  });

  const allStats = computeStats(allDays);
  const windowStats = computeStats(sixMonthDays);
  const stats = {
    current: allStats.current,
    best: allStats.best,
    total: windowStats.total,
    active: windowStats.active,
    peak: windowStats.peak
  };
  const svg = buildSvg(sixMonthDays, stats, rangeStart, latestDate);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, svg);

  const cacheKey = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 12);
  updateReadme(cacheKey);
  console.log(`Generated ${path.relative(ROOT, OUT_FILE)} for ${USERNAME}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
