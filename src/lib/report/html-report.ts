/**
 * HTML renderer for a {@link DecisionReport} — the same model the text renderer
 * uses, laid out as a self-contained, printable page.
 *
 * Security: every dynamic value (owner names, addresses, ordinance note text,
 * required actions) originates from external services or ordinance text, so it
 * is HTML-escaped before interpolation — the renderer never emits caller or
 * source data as markup. The output is a full standalone document with inline
 * CSS and no external requests, so it renders identically offline and in print.
 */

import type {
  DecisionReport,
  FactLine,
  GapLine,
} from "./decision-report.js";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function factRow(f: FactLine): string {
  const flags = `${f.provenance} · ${f.confidence} · ${f.verification}`;
  const unverified = f.verification !== "verified" ? " unverified" : "";
  const source = f.source !== undefined ? `<div class="src">${esc(f.source)}</div>` : "";
  const note = f.note !== undefined ? `<div class="note">${esc(f.note)}</div>` : "";
  return `<tr>
    <th scope="row">${esc(f.label)}</th>
    <td><span class="val">${esc(f.value)}</span>${source}${note}</td>
    <td class="flags${unverified}">${esc(flags)}</td>
  </tr>`;
}

function gapItem(g: GapLine): string {
  const badge = g.blocksApproval
    ? `<span class="badge block">Blocks approval</span>`
    : `<span class="badge track">Tracked</span>`;
  return `<li>
    <div class="gap-head">${esc(g.label)} ${badge}</div>
    <div class="gap-meta">Owner: ${esc(g.owner)}</div>
    <div class="gap-action">${esc(g.requiredAction)}</div>
  </li>`;
}

const STYLE = `
:root{--bg:#fff;--fg:#1a1d21;--muted:#5b6672;--line:#e3e7ec;--card:#f7f9fb;
--ok:#0f7b4f;--okbg:#e6f4ec;--bad:#b42318;--badbg:#fdece9;--warn:#8a5a00;--flag:#6b7684}
@media(prefers-color-scheme:dark){:root{--bg:#15181c;--fg:#e8ebee;--muted:#9aa4b0;
--line:#2a2f36;--card:#1c2127;--ok:#4ecb8b;--okbg:#122a1f;--bad:#f0837a;--badbg:#2c1614;
--warn:#e0b25c;--flag:#8b95a1}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:32px 24px 64px}
.brand{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
h1{font-size:22px;margin:.2em 0 .1em}
.sub{color:var(--muted);font-size:13px;margin-bottom:20px;word-break:break-all}
.decision{padding:14px 18px;border-radius:10px;font-weight:600;margin:0 0 28px;
border:1px solid transparent}
.decision.bad{background:var(--badbg);color:var(--bad);border-color:var(--bad)}
.decision.ok{background:var(--okbg);color:var(--ok);border-color:var(--ok)}
h2{font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);
margin:28px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
table{width:100%;border-collapse:collapse}
th[scope=row]{text-align:left;vertical-align:top;font-weight:600;width:34%;padding:10px 12px 10px 0}
td{vertical-align:top;padding:10px 0;border-top:1px solid var(--line)}
th[scope=row]{border-top:1px solid var(--line)}
.val{font-weight:600}
.src{color:var(--muted);font-size:12px;margin-top:3px}
.note{color:var(--muted);font-size:12px;margin-top:4px;font-style:italic}
.flags{color:var(--flag);font-size:11px;white-space:nowrap;text-align:right}
.flags.unverified{color:var(--warn);font-weight:600}
ul{list-style:none;padding:0;margin:0}
li{background:var(--card);border:1px solid var(--line);border-radius:8px;
padding:12px 14px;margin-bottom:10px}
.gap-head{font-weight:600}
.gap-meta{color:var(--muted);font-size:12px;margin:2px 0}
.gap-action{font-size:13px;margin-top:4px}
.badge{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
padding:2px 7px;border-radius:99px;vertical-align:middle;margin-left:6px}
.badge.block{background:var(--badbg);color:var(--bad)}
.badge.track{background:var(--card);color:var(--muted);border:1px solid var(--line)}
.summary{margin-top:28px;padding:14px 16px;background:var(--card);border-radius:8px;
border:1px solid var(--line);color:var(--muted);font-size:13px}
.disclaimer{margin-top:16px;color:var(--muted);font-size:11px;line-height:1.5}
`;

/** Render a full, self-contained HTML decision report. */
export function renderHtmlReport(report: DecisionReport): string {
  const decisionClass = report.approvable ? "ok" : "bad";
  const decisionText = report.approvable
    ? "No open blockers — professional confirmation still required"
    : `Not approvable — ${report.blockers.length} blocking item(s)`;

  const facts = report.facts.length
    ? `<table><tbody>${report.facts.map(factRow).join("")}</tbody></table>`
    : `<p class="src">No facts resolved.</p>`;

  const gaps = report.gaps.length
    ? `<ul>${report.gaps.map(gapItem).join("")}</ul>`
    : `<p class="src">No open items.</p>`;

  const siteId =
    report.siteId !== undefined ? ` · Site ${esc(report.siteId)}` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Due Diligence — ${esc(report.address)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="wrap">
  <div class="brand">PARCELGRID · Preliminary Due Diligence</div>
  <h1>${esc(report.address)}</h1>
  <div class="sub">${esc(new Date().toISOString().slice(0, 10))}${siteId}</div>
  <div class="decision ${decisionClass}">${esc(decisionText)}</div>

  <h2>Known facts (${report.facts.length})</h2>
  ${facts}

  <h2>Open items (${report.gaps.length})</h2>
  ${gaps}

  <div class="summary">${esc(report.summary)}</div>
  <p class="disclaimer">This is a preliminary, source-linked reference generated
  from public data. It is not a substitute for a survey, title work, a zoning
  verification letter, or professional review. Values marked "unverified" are
  machine-read from the ordinance and must be confirmed by a qualified local
  professional before they are relied on.</p>
</main>
</body>
</html>`;
}
