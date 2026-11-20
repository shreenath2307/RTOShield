"use client";
/**
 * Intro loader. Sequence modelled on eugeniagrab.com's page loader:
 *  1. rows of random uppercase serif letters slide in from the left (random stagger);
 *  2. the brand letters hidden in the middle row slide in on a tighter stagger;
 *  3. filler letters fade to grey, then exit right while the gaps between brand words collapse;
 *  4. the brand exits right and an ink-edged opening reveals the page.
 * Their reveal is a WebGL shader; this one is an SVG mask with a turbulence-displaced edge.
 * Shown once per browser session, never on the customer confirmation page (/c/...),
 * and skipped entirely under prefers-reduced-motion.
 */
import * as React from "react";
import { usePathname } from "next/navigation";
import { gsap } from "gsap";

const SEEN_KEY = "rto-shield:intro-seen";
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const rand = (n: number, seed: number) => {
  let s = seed;
  return Array.from({ length: n }, () => {
    s = (s * 9301 + 49297) % 233280;
    return ALPHA[Math.floor((s / 233280) * ALPHA.length)];
  });
};
// Fixed seeds so server and client render the same letters.
const ROWS = [
  { id: "r1", letters: rand(18, 11) },
  { id: "r2", letters: rand(20, 23) },
  { id: "brand", first: ["R", "T", "O"], mid: rand(3, 37), last: ["S", "H", "I", "E", "L", "D"], trail: rand(2, 41) },
  { id: "r4", letters: rand(18, 53) },
  { id: "r5", letters: rand(18, 67) },
] as const;

const Letter = ({ ch, kind }: { ch: string; kind: "random" | "first" | "last" }) => (
  <span className="inline-flex shrink-0 items-center justify-center overflow-hidden leading-[1.35]">
    <span
      data-l={kind}
      className="block font-display font-medium uppercase leading-[1.35] tracking-[.03em] text-ink opacity-0 will-change-transform"
      style={{ fontSize: "clamp(20px, 2.4vw, 40px)" }}
    >
      {ch}
    </span>
  </span>
);

export function PageLoader() {
  const path = usePathname();
  const [show, setShow] = React.useState<boolean | null>(null);
  const root = React.useRef<HTMLDivElement>(null);
  const midGap = React.useRef<HTMLSpanElement>(null);
  const trailGap = React.useRef<HTMLSpanElement>(null);
  const hole = React.useRef<SVGCircleElement>(null);
  const [size, setSize] = React.useState({ w: 1440, h: 900 });

  React.useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduced || path?.startsWith("/c/")) return setShow(false);
    setSize({ w: window.innerWidth, h: window.innerHeight });
    setShow(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useLayoutEffect(() => {
    if (!show || !root.current) return;
    const el = root.current;
    const random = el.querySelectorAll('[data-l="random"]');
    const first = el.querySelectorAll('[data-l="first"]');
    const last = el.querySelectorAll('[data-l="last"]');
    const brand = [...first, ...last];
    const finish = () => {
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      setShow(false);
    };

    const ctx = gsap.context(() => {
      gsap.set([random, brand], { autoAlpha: 0, xPercent: -120 });
      const tl = gsap.timeline({ defaults: { overwrite: "auto" }, onComplete: finish });
      tl.to(random, { autoAlpha: 1, xPercent: 0, duration: 1, ease: "power2.out", stagger: { amount: 0.75, from: "random" } })
        .to(brand, { autoAlpha: 1, xPercent: 0, duration: 1, ease: "power2.out", stagger: 0.035 }, 0.25)
        .to(random, { color: "#E6E6E6", duration: 0.95, ease: "sine.inOut", stagger: { amount: 0.85, from: "random" } }, "+=0.4")
        .addLabel("converge", "+=0.25")
        .to(random, { autoAlpha: 0, xPercent: 120, duration: 1.15, ease: "power2.inOut", stagger: { amount: 0.35, from: "random" } }, "converge")
        .fromTo(midGap.current, { width: () => midGap.current?.offsetWidth ?? 0 }, {
          width: () => `${0.48 * parseFloat(getComputedStyle(midGap.current!).fontSize)}px`,
          duration: 1.25,
          ease: "power2.inOut",
        }, "converge")
        .fromTo(trailGap.current, { width: () => trailGap.current?.offsetWidth ?? 0 }, { width: 0, duration: 1.25, ease: "power2.inOut" }, "converge")
        .addLabel("brandExit", "+=0.4")
        .to(brand, { autoAlpha: 0, xPercent: 120, duration: 0.85, ease: "power2.inOut", stagger: 0.02 }, "brandExit")
        .addLabel("reveal", "-=0.35")
        .set(el, { pointerEvents: "none" }, "reveal")
        .to(hole.current, { attr: { r: Math.hypot(size.w, size.h) * 0.75 }, duration: 1.9, ease: "sine.inOut" }, "reveal");
      // Their sequence runs ~7s before the reveal; an operations tool should not hold users that long.
      tl.timeScale(1.4);
    }, el);
    return () => ctx.revert();
  }, [show, size]);

  // Before the client decides, cover the page so first-time visitors never see a flash of content.
  if (show === null) return <div aria-hidden className="fixed inset-0 z-[2000] bg-cream" />;
  if (!show) return null;

  return (
    <div ref={root} role="status" aria-label="Loading RTO Shield" className="fixed inset-0 z-[2000] flex items-center justify-center overflow-hidden">
      {/* cream sheet with an ink-edged hole that grows from just below centre */}
      <svg className="absolute inset-0 h-full w-full" width={size.w} height={size.h} aria-hidden>
        <defs>
          <filter id="ink-edge" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="70" />
          </filter>
          <mask id="ink-mask">
            <rect width="100%" height="100%" fill="white" />
            <circle ref={hole} cx={size.w * 0.46} cy={size.h * 0.56} r={0} fill="black" filter="url(#ink-edge)" />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="#FAF5EE" mask="url(#ink-mask)" />
      </svg>

      <div className="relative z-[1] flex w-full flex-col items-center justify-center p-5" aria-hidden>
        {ROWS.map((row) =>
          "letters" in row ? (
            <div key={row.id} className="flex items-center justify-center whitespace-nowrap">
              {row.letters.map((ch, i) => (
                <Letter key={i} ch={ch} kind="random" />
              ))}
            </div>
          ) : (
            <div key={row.id} className="flex items-center justify-center whitespace-nowrap">
              <span className="inline-flex shrink-0">{row.first.map((ch, i) => <Letter key={i} ch={ch} kind="first" />)}</span>
              <span ref={midGap} className="inline-flex shrink-0 overflow-hidden whitespace-nowrap" style={{ fontSize: "clamp(20px, 2.4vw, 40px)" }}>
                {row.mid.map((ch, i) => <Letter key={i} ch={ch} kind="random" />)}
              </span>
              <span className="inline-flex shrink-0">{row.last.map((ch, i) => <Letter key={i} ch={ch} kind="last" />)}</span>
              <span ref={trailGap} className="inline-flex shrink-0 overflow-hidden whitespace-nowrap">
                {row.trail.map((ch, i) => <Letter key={i} ch={ch} kind="random" />)}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}
