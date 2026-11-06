import type { WireframeRegion, WireframeScreenRole } from "../../contracts/ui-wireframe-pack.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderL1WireframeHtml(input: {
  title: string;
  role: WireframeScreenRole;
  regions: WireframeRegion[];
  annotated?: boolean;
}): string {
  const regionBlocks = input.regions
    .map((region) => {
      const fields =
        input.annotated && region.fields.length > 0
          ? `<ul class="fields">${region.fields
              .map((field) => `<li>${escapeHtml(field)}</li>`)
              .join("")}</ul>`
          : "";
      const cta = region.cta
        ? `<div class="cta">${escapeHtml(region.cta)}</div>`
        : "";
      const brief =
        input.annotated && region.intentBrief
          ? `<p class="brief">${escapeHtml(region.intentBrief)}</p>`
          : "";
      return `<section class="region" data-region-id="${escapeHtml(region.id)}">
  <header>${escapeHtml(region.label)}</header>
  ${brief}
  ${fields}
  ${cta}
  <div class="stub" aria-hidden="true"></div>
</section>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root {
      --wf-bg: #f4f4f5;
      --wf-ink: #18181b;
      --wf-muted: #71717a;
      --wf-line: #a1a1aa;
      --wf-box: #ffffff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--wf-bg);
      color: var(--wf-ink);
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
    }
    .frame {
      max-width: 960px;
      margin: 0 auto;
      padding: 20px;
      min-height: 100vh;
    }
    .chrome {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px dashed var(--wf-line);
    }
    .chrome h1 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    .role {
      font-size: 11px;
      color: var(--wf-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border: 1px solid var(--wf-line);
      padding: 2px 8px;
      border-radius: 4px;
    }
    .layout {
      display: grid;
      gap: 12px;
    }
    .region {
      background: var(--wf-box);
      border: 1.5px solid var(--wf-line);
      border-radius: 4px;
      padding: 12px;
      min-height: 72px;
    }
    .region header {
      font-weight: 600;
      margin-bottom: 6px;
    }
    .brief {
      margin: 0 0 8px;
      color: var(--wf-muted);
      font-size: 12px;
    }
    .fields {
      margin: 0 0 8px;
      padding-left: 16px;
      color: var(--wf-muted);
    }
    .cta {
      display: inline-block;
      margin-top: 4px;
      padding: 6px 12px;
      border: 1.5px solid var(--wf-ink);
      border-radius: 4px;
      font-weight: 600;
      font-size: 12px;
    }
    .stub {
      margin-top: 10px;
      height: 28px;
      border: 1px dashed var(--wf-line);
      border-radius: 3px;
      background: repeating-linear-gradient(
        -45deg,
        transparent,
        transparent 4px,
        rgba(0,0,0,0.04) 4px,
        rgba(0,0,0,0.04) 8px
      );
    }
    .footnote {
      margin-top: 16px;
      color: var(--wf-muted);
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="frame" data-wireframe-l1="" data-role="${escapeHtml(input.role)}">
    <div class="chrome">
      <h1>${escapeHtml(input.title)}</h1>
      <span class="role">${escapeHtml(input.role)}</span>
    </div>
    <div class="layout">
${regionBlocks}
    </div>
    <p class="footnote">L1 wireframe · structural contract (not visual polish)</p>
  </div>
</body>
</html>`;
}
