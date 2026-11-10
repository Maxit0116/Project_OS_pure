# Loop SaaS integration icons — provenance

## n8n UX reference (not copied)

Fetched / checked **2026-11-10**. Behavior reference only — n8n Sustainable Use License forbids copying source, CSS, or brand assets into Pure.

| Item | URL / version | Mapped Pure behavior |
|------|---------------|----------------------|
| Work with nodes (add, Triggers vs Actions, hover controls, settings on demand) | https://docs.n8n.io/workflows/components/nodes/ | Palette add → Action select in inspector; hover/selected/disabled/error/running/complete/awaiting_hitl card states |
| Connect nodes (ports, drag wire) | https://docs.n8n.io/workflows/components/connections/ | Existing Pure `data-loop-port` + connect feedback kept; SaaS cards keep same ports |
| Canvas node design discussion | https://github.com/n8n-io/n8n/pull/12317 (n8n@1.74.0 era) | Compact logo + name + secondary operation label |
| NodeIcon rendering | https://github.com/n8n-io/n8n/pull/14097 (n8n@1.86.0 era) | Local `LoopIntegrationIcon` + registry `iconKey` (no remote hotlink) |
| License | https://docs.n8n.io/n8n-community-license (Sustainable Use License) | Independent Pure CSS (`LoopSaaSNodeCard.css` / Overlay tokens) |

Fixture screenshots: `fixtures/saas-node-comparison.html` (before Lucide-letter cards vs after brand logo cards, zoom=1, GitHub/Slack/Lark + Agent/Human/Logic).

## Brand mark assets (local, versioned)

| Key | File | Source | Asset license | Trademark |
|-----|------|--------|---------------|-----------|
| github | `icons/github.svg` | Simple Icons path geometry (simpleicons.org) | CC0 1.0 for SVG path packaging | GitHub® trademark of GitHub, Inc. |
| slack | `icons/slack.svg` | Simple Icons path geometry | CC0 1.0 for SVG path packaging | Slack® trademark of Salesforce, Inc. |
| feishu | `icons/feishu.svg` | Pure-authored geometric mark for **飞书 Feishu** display | Original Pure-authored SVG | 飞书 / Feishu trademarks of ByteDance — distinct from Lark |
| lark | `icons/lark.svg` | Independent geometric mark for **Lark** (international) | Original Pure-authored SVG | Lark™ trademark of ByteDance — not Feishu naming/host |
| sentry | `icons/sentry.svg` | Simple Icons-inspired geometric path | CC0-style packaging / Pure-adapted | Sentry® trademark of Functional Software, Inc. |

Rules:
- No runtime CDN/hotlink fetches.
- SVGs are static, sanitized (no `<script>`, no external `href`/`xlink`).
- Missing icon → neutral `fallback` glyph (not a fake trademark).
- Brand logo ≠ OAuth connected ≠ executable (see `runtimeStatus` on connector descriptors).
