/**
 * DEPRECATED — Liquid Glass engine retired.
 *
 * The workbench now uses the tech theme (solid surfaces, hairline borders,
 * no blur/refraction — see `--tech-*` tokens in styles/tokens.css).
 *
 * `GlassLens` and `GlassPanelShell` are kept as thin pass-through wrappers
 * with the same props API so existing call sites render unchanged, but they
 * no longer sample the backdrop or refract anything.
 *
 * The displacement-map engine files (displacementMap.ts, blobUrlLifecycle.ts)
 * are unused and will be removed in a future cleanup pass.
 */
export { default as GlassLens } from './GlassLens'
export { default as GlassPanelShell } from './GlassPanelShell'
