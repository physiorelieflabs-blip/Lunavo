---
name: Tailwind data URI parsing
description: A CSS parser compatibility note for Tailwind v4 Vite projects.
---

Inline SVG data URIs inside CSS `url(...)` declarations can be reported as unterminated strings by Tailwind v4's Vite transform, even when the CSS appears valid to a browser. Prefer a CSS gradient or a separately served asset for subtle textures.

**Why:** The development preview failed during CSS transformation until the inline SVG noise texture was replaced with a parser-safe CSS background.

**How to apply:** When adding texture/noise backgrounds to Tailwind v4 apps, avoid nested quoted SVG data URIs in CSS and verify the Vite preview after the stylesheet changes.