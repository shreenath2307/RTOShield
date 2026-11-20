# RTO Shield — design brief

Two references, measured from their live CSS/JS on 2026-11-20.

## From eugeniagrab.com — type and motion
- Display: **Cormorant** 300/400/500 (`font-display`). Body: **Inter** 300/400/500 (`font-sans`). No other fonts.
- Headings are Cormorant at weight 400–500, large, line-height 1–1.15, never bold. Hero title ~80px desktop.
- Ink `#142022`, accent rose-brown `#936E6C` (hover/ink `#603D3B`), cream `#FAF5EE`.
- Easings: `ease-out` = cubic-bezier(.16,1,.3,1), `ease-soft` = (.22,1,.36,1), `ease-ink` = (.35,0,.15,1). Long, calm durations (0.9–1.5s), no bounce/spring overshoot.
- Motion vocabulary — use these, nothing else:
  - text reveal: blur(5px)+6px rise → sharp (`<BlurText>`, `animate-blurIn`), or masked line slide-up.
  - image/panel reveal: `clip-path: inset()` wipe.
  - circle CTA with ink fill from the cursor (`<CircleButton>`).
  - link underline drawing in from the left over 1.5s (`.link-draw`).
  - logo letters slide out/in (`<SlideWord>` in shell/sidebar).
  - sticky/pinned hero scrubbed with GSAP ScrollTrigger; Lenis smooth scroll (already global).
- Intro loader: `components/shell/page-loader.tsx` (already mounted in root layout). Don't add another.

## From motorq.com — restraint and structure
- Headings weight 400; h1 3.5rem / 1.1; generous whitespace; hairline 1px borders; **no** gradients, glows, glassmorphism, drop shadows, blurred colour blobs, pulsing dots, emoji.
- Colour is sparse: neutrals do the work, the accent appears in at most one or two places per screen.
- Copy: short declarative headlines (3–7 words), one- or two-sentence body, numbers with a one-line label, numbered steps `01 02 03`, an FAQ, a plain footer. No exclamation marks, no hype words.
- Buttons: pill, 1px border, padding .75rem 1.5rem, 200ms colour transition.

## Tokens (tailwind.config.ts) — use these, not raw Tailwind hues
`ink, ink-2..5, line, line-2, canvas, canvas-2, canvas-3, cream, brand-50..900 (rose-brown), risk.low/med/high (+bg)`.
`emerald/amber/rose/cyan` are remapped to muted sage/ochre/brick/slate — fine for status chips. Do not use indigo/violet/purple/pink/sky/blue/fuchsia, `bg-gradient-*`, `blur-*` decoration, `shadow-glow`, `animate-ping`, `animate-pulse` (except skeletons).

## Avoid-AI-slop rules for copy (from the project's avoid-ai-slop skill)
- Every sentence carries a fact, decision or action about RTO Shield. Cut filler.
- No "delve", "seamless", "unlock", "supercharge", "game-changer", "in today's fast-paced world", "not just X but Y", reflexive triplets, em-dash chains.
- Numbers must be real (from the API) or labelled as published figures with source: COD RTO 37.5% vs prepaid 5.3% (ClickPost, FY2026); Tier-3 23.7% vs metro 10.9% for COD-heavy brands (ClickPost); industry average 14–18% (Delhivery). Demo-model numbers: ROC-AUC 0.71 vs 0.64 COD-only baseline, on synthetic data — say "synthetic".
- No invented customers, logos, testimonials or quotes.
