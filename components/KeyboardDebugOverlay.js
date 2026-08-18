import { useEffect } from "react";
import { Platform } from "react-native";

// Opt-in on-screen keyboard diagnostic for the web build. Off by default.
//
// Turn on by opening any page with `?kbdebug=1` (or `#kbdebug`); it then
// sticks for the tab via sessionStorage so client-side navigation keeps it.
// `?kbdebug=0` turns it off. It draws a small fixed panel that reports what
// the browser is actually doing around the on-screen keyboard — layout vs
// visual viewport, ICB, scroll offset, the focused field's position — plus a
// rolling log of focus/resize events with timestamps.
//
// Why this exists: every keyboard bug so far (iOS 26 root-shrink, the
// focus-drop on /login) was only understood once the numbers were read off a
// real device. Android can't be simulated here, so this is how a member on
// an Android phone can hand us the numbers with one screenshot.
//
// It is deliberately READ-ONLY with respect to the page: passive listeners,
// no scrolling, no meta rewrites, no focus contact — the panel itself is
// pointer-events:none so it can't steal a tap. It writes to its own DOM
// node appended to <body>, outside the React tree, on rAF.
const KEY = "kova-kbdebug";
const MAX_LOG = 9;

function readFlagFromUrl() {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("kbdebug");
    if (q === "1" || q === "true") return true;
    if (q === "0" || q === "false") return false;
    if ((url.hash || "").includes("kbdebug")) return true;
  } catch {}
  return null;
}

export function KeyboardDebugOverlay() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return undefined;

    const fromUrl = readFlagFromUrl();
    let enabled = false;
    try {
      if (fromUrl === true) window.sessionStorage.setItem(KEY, "1");
      if (fromUrl === false) window.sessionStorage.removeItem(KEY);
      enabled = window.sessionStorage.getItem(KEY) === "1";
    } catch {
      enabled = fromUrl === true;
    }
    if (!enabled) return undefined;

    const vv = window.visualViewport;
    const panel = document.createElement("pre");
    Object.assign(panel.style, {
      position: "fixed",
      top: "0",
      left: "0",
      zIndex: "2147483647",
      margin: "0",
      padding: "6px 8px",
      maxWidth: "100vw",
      font: "10px/1.35 Menlo, monospace",
      color: "#fff",
      background: "rgba(0,0,0,0.72)",
      pointerEvents: "none",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    });
    document.body.appendChild(panel);

    const t0 = performance.now();
    const log = [];
    const push = (line) => {
      log.push(`${String(Math.round(performance.now() - t0)).padStart(6)}ms ${line}`);
      while (log.length > MAX_LOG) log.shift();
    };

    const rect = (el) => {
      if (!el || !el.getBoundingClientRect) return "";
      const r = el.getBoundingClientRect();
      return `top ${Math.round(r.top)} bot ${Math.round(r.bottom)}`;
    };
    const desc = (el) => {
      if (!el || el === document.body) return "none";
      const tag = el.tagName?.toLowerCase();
      const type = el.getAttribute?.("type") || el.getAttribute?.("inputmode") || "";
      const ph = el.getAttribute?.("placeholder") || el.getAttribute?.("aria-label") || "";
      return `${tag}${type ? `[${type}]` : ""}${ph ? ` "${ph.slice(0, 18)}"` : ""}`;
    };

    let frame = 0;
    const render = () => {
      frame = 0;
      const root = document.getElementById("root");
      const ae = document.activeElement;
      const standalone =
        window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
      const meta = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
      const lines = [
        `KOVA KEYBOARD DEBUG  (?kbdebug=0 to hide)`,
        `${navigator.userAgent.slice(0, 110)}`,
        `mode ${standalone ? "standalone" : "browser"}  scale ${vv ? vv.scale.toFixed(2) : "?"}  vf-cover ${/viewport-fit=cover/.test(meta) ? "y" : "n"}  iw ${/interactive-widget=(\w+-?\w*)/.exec(meta)?.[1] || "-"}`,
        `innerH ${window.innerHeight}  outerH ${window.outerHeight}  screenH ${window.screen?.height}`,
        `vv.h ${vv ? Math.round(vv.height) : "?"}  vv.offTop ${vv ? Math.round(vv.offsetTop) : "?"}  vv.pageTop ${vv ? Math.round(vv.pageTop) : "?"}`,
        `docEl.clientH ${document.documentElement.clientHeight}  body ${document.body.clientHeight}  #root ${root ? root.clientHeight : "?"}  docScrollH ${document.documentElement.scrollHeight}`,
        `scrollY ${Math.round(window.scrollY)}  docEl.scrollTop ${document.documentElement.scrollTop}  body.scrollTop ${document.body.scrollTop}`,
        `active ${desc(ae)}  ${rect(ae)}`,
        `--- events ---`,
        ...log,
      ];
      panel.textContent = lines.join("\n");
    };
    // setTimeout rather than rAF: rAF pauses in a background/hidden tab,
    // and a coalesced 16ms timeout batches just as well during the focus
    // gesture without touching the page.
    const schedule = () => {
      if (!frame) frame = setTimeout(render, 16);
    };

    const onFocusIn = (e) => {
      push(`focusin  ${desc(e.target)} ${rect(e.target)} vv.h ${vv ? Math.round(vv.height) : "?"} innerH ${window.innerHeight}`);
      schedule();
    };
    const onFocusOut = (e) => {
      push(`focusout ${desc(e.target)} vv.h ${vv ? Math.round(vv.height) : "?"}`);
      schedule();
    };
    const onVvResize = () => {
      push(`vv.resize h ${Math.round(vv.height)} off ${Math.round(vv.offsetTop)} innerH ${window.innerHeight} scrollY ${Math.round(window.scrollY)}`);
      schedule();
    };
    const onVvScroll = () => {
      push(`vv.scroll off ${Math.round(vv.offsetTop)} pageTop ${Math.round(vv.pageTop)}`);
      schedule();
    };
    const onWinResize = () => {
      push(`win.resize innerH ${window.innerHeight}`);
      schedule();
    };
    const onScroll = () => {
      push(`win.scroll y ${Math.round(window.scrollY)}`);
      schedule();
    };

    document.addEventListener("focusin", onFocusIn, { capture: true, passive: true });
    document.addEventListener("focusout", onFocusOut, { capture: true, passive: true });
    window.addEventListener("resize", onWinResize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    if (vv) {
      vv.addEventListener("resize", onVvResize, { passive: true });
      vv.addEventListener("scroll", onVvScroll, { passive: true });
    }
    // Keep the static numbers fresh even without an event (layout settling).
    const tick = setInterval(schedule, 1000);
    push("panel ready — tap a field");
    render();

    return () => {
      clearInterval(tick);
      if (frame) clearTimeout(frame);
      document.removeEventListener("focusin", onFocusIn, { capture: true });
      document.removeEventListener("focusout", onFocusOut, { capture: true });
      window.removeEventListener("resize", onWinResize);
      window.removeEventListener("scroll", onScroll);
      if (vv) {
        vv.removeEventListener("resize", onVvResize);
        vv.removeEventListener("scroll", onVvScroll);
      }
      panel.remove();
    };
  }, []);

  return null;
}
