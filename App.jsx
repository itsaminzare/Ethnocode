import { useState, useRef, useEffect } from "react";

const SAMPLE_A = {
  title: "Tuesday market",
  text: `Field note, Tuesday market, 14:20.

Arrived as vendors were finishing setup. An older woman selling greens waved me over before I'd asked anything — said she remembered me from last week, asked if my notebook work was going well. Several vendors here seem to track who's a regular and who isn't; a younger seller two stalls down didn't acknowledge me at all until the woman introduced me by name.

Noticed vendors constantly redistributing produce between each other's stalls — a crate of tomatoes moved from stall 4 to stall 7 without any visible exchange of money. When I asked about it later, the tomato seller said we're not really competitors, we're neighbors first. This seems to contradict the market association's official rule sheet, which frames stalls as independent renters in competition for the same customers.

A dispute broke out around 15:00 between two fish vendors over stall boundary lines marked in chalk. Bystanders didn't intervene directly but several older vendors positioned themselves nearby, visibly listening, without speaking. The dispute resolved within a few minutes once one of the older listeners cleared their throat loudly. No words exchanged, but the loud vendor immediately lowered his voice and the disagreement ended.`,
  codes: null,
  loading: false,
  error: null,
};

const SAMPLE_B = {
  title: "Interview, stall association head",
  text: `Interview with M., head of the vendor association, 09:40, her stall.

M. was reluctant to have this recorded at first, said association business should stay among vendors. Agreed once I explained notes only, no names in the writeup beyond her role.

She described her job mostly as preventing disputes before they start, not resolving them after. Said the real authority in the market isn't the written rule sheet but a small group of long-tenured vendors who everyone just listens to, though she wouldn't name them directly. When I mentioned the chalk-line dispute from Tuesday, she laughed and said that's exactly the kind of thing that resolves itself if the association stays out of it.

She was more guarded discussing the produce-sharing between stalls, said only that it's not really the association's business what vendors do with their own stock. Notable that this framing sits oddly next to what I observed, where stock moved between stalls as though it were shared.`,
  codes: null,
  loading: false,
  error: null,
};

const THEME_COLORS = {
  light: ["#4f7cab", "#6b8f71", "#a67c52", "#8a6a9a", "#b5677d", "#3f8f8a", "#5c6b78"],
  dark: ["#8a9aa8", "#8fae94", "#c2a37c", "#a894b3", "#d08a9d", "#6fbab4", "#9a9c9e"],
};

const PALETTES = {
  light: {
    bg: "#f3f7fb",
    surface: "#ffffff",
    border: "#dbe4ec",
    ink: "#182530",
    inkSoft: "#5c6b78",
    accent: "#4f7cab",
    accentSoft: "#dde9f4",
    rust: "#b0432c",
    dangerHover: "#e2761b",
    hoverBg: "#e7eff6",
    scrollThumb: "#c7d6e2",
    scrollThumbHover: "#adc2d2",
    shadow: "rgba(24,37,48,0.07)",
    selection: "#d3e3f0",
  },
  dark: {
    bg: "#141516",
    surface: "#1e1f21",
    border: "#333537",
    ink: "#eeeeec",
    inkSoft: "#9a9c9e",
    accent: "#8a9aa8",
    accentSoft: "#2a2d30",
    rust: "#c1573c",
    dangerHover: "#f0904c",
    hoverBg: "#26282a",
    scrollThumb: "#3a3c3e",
    scrollThumbHover: "#4a4c4e",
    shadow: "rgba(0,0,0,0.5)",
    selection: "#3a3d40",
  },
};

function newNote(title) {
  return { id: crypto.randomUUID(), title, text: "", codes: null, loading: false, error: null };
}

async function callClaude(prompt, maxTokens = 2000) {
  const response = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const err = await response.json();
      detail = err?.error?.message || (typeof err?.error === "string" ? err.error : "");
    } catch {}
    if (response.status === 404 && !detail) {
      detail = "the server file api/claude.js was not found. Make sure the api folder with claude.js is in your GitHub repo, then redeploy.";
    }
    throw new Error("API request failed (" + response.status + ")" + (detail ? ": " + detail : ""));
  }
  const data = await response.json();
  const textBlock = data?.content?.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No response text returned.");
  const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const repaired = cleaned.replace(/(?<=[a-zA-Z,.\s])"(?=[a-zA-Z])/g, '\\"');
    return JSON.parse(repaired);
  }
}

function codingPrompt(text) {
  return `You are assisting an ethnographer with open coding of field notes, in the tradition of grounded theory qualitative analysis.

Read the field note below and identify 4-7 thematic codes. For each code, give:
- a short code name (2-4 words, the kind a researcher would write in a margin)
- a one-sentence definition of what the code captures
- 1-3 direct supporting quotes copied exactly from the text

Respond with ONLY valid, strictly parseable JSON, no markdown fences, no preamble, no text outside the JSON object. Any quotation mark that appears inside a JSON string value must be escaped as \\" so the JSON stays valid — prefer rephrasing a quote over risking a broken escape.

Respond in exactly this shape:
{"codes":[{"name":"...","definition":"...","quotes":["...","..."]}]}

Field note:
"""
${text}
"""`;
}

function axialPrompt(entries) {
  const list = entries
    .map((e) => `- id: ${e.id}\n  code: ${e.name}\n  definition: ${e.definition}`)
    .join("\n");
  return `You are helping an ethnographer move from open coding to axial coding: grouping first-pass codes drawn from multiple field notes into a smaller set of higher-level themes.

Here are the open codes collected so far, each with an id:
${list}

Group these into 3-6 axial themes. Every code id must be assigned to exactly one theme. Give each theme a short name and a one-sentence definition of what unifies the codes inside it.

Respond with ONLY valid, strictly parseable JSON, no markdown fences, no text outside the JSON object, in exactly this shape:
{"themes":[{"name":"...","definition":"...","codeIds":["...","..."]}]}`;
}

/* ---------- icons ---------- */
const Icon = {
  plus: (p) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  trash: (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  ),
  close: (p) => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  wand: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 20L18 6M14 4l1.2 2.8L18 8l-2.8 1.2L14 12l-1.2-2.8L10 8l2.8-1.2L14 4zM19 13l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7L19 13z" />
    </svg>
  ),
  cluster: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" />
      <path d="M8 7.5L11 16M16 7.5L13 16" />
    </svg>
  ),
  download: (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 4v11m0 0l-4-4m4 4l4-4M4 19h16" />
    </svg>
  ),
  notebook: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 3v18M8 8h9M8 12h9M8 16h6" />
    </svg>
  ),
  layers: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 13l9 5 9-5" />
    </svg>
  ),
  sun: (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 2.5v2.5M12 19v2.5M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M2.5 12H5M19 12h2.5M4.6 19.4l1.8-1.8M17.6 6.4l1.8-1.8" />
    </svg>
  ),
  moon: (p) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
    </svg>
  ),
  link: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 14a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5.87" />
      <path d="M14 10a5 5 0 0 0-7.07 0L4.1 12.83a5 5 0 0 0 7.07 7.07L13 18.13" />
    </svg>
  ),
  arrowLeft: (p) => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  ),
};

const GlobalStyle = ({ p }) => (
  <style>{`
    html, body, #root { margin: 0; padding: 0; height: 100%; width: 100%; }
    body { background: ${p.bg}; }
    .ec * { box-sizing: border-box; }
    .ec ::selection { background: ${p.selection}; }
    .ec-scroll::-webkit-scrollbar { width: 9px; }
    .ec-scroll::-webkit-scrollbar-track { background: transparent; }
    .ec-scroll::-webkit-scrollbar-thumb { background: ${p.scrollThumb}; border-radius: 8px; }
    .ec-scroll::-webkit-scrollbar-thumb:hover { background: ${p.scrollThumbHover}; }
    .ec-btn-primary { transition: filter .15s ease, transform .1s ease; }
    .ec-btn-primary:hover:not(:disabled) { filter: brightness(0.93); }
    .ec-btn-primary:active:not(:disabled) { transform: translateY(1px); }
    .ec-btn-ghost { transition: background-color .15s ease, border-color .15s ease; }
    .ec-btn-ghost:hover { background: ${p.hoverBg}; }
    .ec-icon-btn { transition: background-color .15s ease, color .15s ease; }
    .ec-icon-btn:hover { background: ${p.hoverBg}; color: ${p.rust}; }
    .ec-icon-btn-danger { transition: color .15s ease; }
    .ec-icon-btn-danger:hover { color: ${p.dangerHover}; }
    .ec-quote-link { transition: color .15s ease; }
    .ec-quote-link:hover { color: ${p.accent}; text-decoration: underline; }
    .ec-note-item { transition: background-color .15s ease; border-left: 3px solid transparent; }
    .ec-note-item:hover { background: ${p.hoverBg}; }
    .ec-note-item.active { background: ${p.accentSoft}; border-left-color: ${p.accent}; }
    .ec-nav-row { transition: background-color .15s ease, border-color .15s ease; border-left: 3px solid transparent; }
    .ec-nav-row:hover:not(.active) { background: ${p.hoverBg}; }
    .ec-nav-row.active { background: ${p.accentSoft}; border-left-color: ${p.accent}; }
    .ec-input-line { transition: border-color .15s ease; border-bottom: 1px solid transparent; }
    .ec-input-line:focus { outline: none; border-bottom-color: ${p.accent}; }
    .ec-fade-in { animation: ecFadeIn .35s ease both; }
    @keyframes ecFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .ec-textarea:focus { outline: none; }
    .ec-theme-toggle { transition: background-color .15s ease; }
    .ec-theme-toggle:hover { background: ${p.hoverBg}; }

    /* -- entrance sequence (plays once on load) -- */
    @keyframes ecEnterLeft { from { opacity: 0; transform: translateX(-14px); } to { opacity: 1; transform: translateX(0); } }
    @keyframes ecEnterUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .ec-enter-sidebar { animation: ecEnterLeft .6s cubic-bezier(.16,1,.3,1) both; }
    .ec-enter-main { animation: ecEnterUp .6s cubic-bezier(.16,1,.3,1) .15s both; }
    .ec-enter-item { opacity: 0; animation: ecEnterUp .5s cubic-bezier(.16,1,.3,1) both; }

    /* -- skeleton loading state -- */
    .ec-skel { border-radius: 6px; background: linear-gradient(100deg, ${p.border} 30%, ${p.hoverBg} 50%, ${p.border} 70%); background-size: 250% 100%; animation: ecShimmer 1.5s ease-in-out infinite; }
    @keyframes ecShimmer { 0% { background-position: 200% 0; } 100% { background-position: -50% 0; } }

    /* -- indeterminate progress line -- */
    .ec-loadbar { position: absolute; top: 0; left: 0; right: 0; height: 2px; overflow: hidden; background: transparent; }
    .ec-loadbar::after { content: ""; position: absolute; top: 0; left: 0; height: 100%; width: 40%; background: ${p.accent}; border-radius: 2px; animation: ecLoadbar 1.15s cubic-bezier(.4,0,.2,1) infinite; }
    @keyframes ecLoadbar { 0% { left: -40%; } 100% { left: 100%; } }

    @media (prefers-reduced-motion: reduce) {
      .ec-enter-sidebar, .ec-enter-main, .ec-enter-item, .ec-fade-in, .ec-skel, .ec-loadbar::after { animation: none !important; opacity: 1 !important; transform: none !important; }
    }

    /* -- landing page -- */
    .ec-marquee-track { display: flex; align-items: center; gap: 56px; width: max-content; animation: ecMarquee 30s linear infinite; will-change: transform; }
    .ec-marquee-wrap:hover .ec-marquee-track { animation-play-state: paused; }
    @keyframes ecMarquee { from { transform: translate3d(0,0,0); } to { transform: translate3d(-33.3334%,0,0); } }
    .ec-land-cta { transition: filter .15s ease, transform .1s ease; }
    .ec-land-cta:hover { filter: brightness(0.93); }
    .ec-land-cta:active { transform: translateY(1px); }
    .ec-land-link { transition: color .15s ease; }
    .ec-land-link:hover { color: var(--ec-land-accent, inherit); }
    .ec-feature-card { transition: border-color .2s ease, box-shadow .2s ease, transform .2s ease; }
    .ec-feature-card:hover { transform: translateY(-2px); }
    @media (prefers-reduced-motion: reduce) {
      .ec-marquee-track { animation: none !important; }
    }
  `}</style>
);

function eyebrowStyle(p, color) {
  return {
    display: "block",
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: ".08em",
    textTransform: "uppercase",
    color: color || p.accent,
    marginBottom: 8,
  };
}

function tagStyle(p, color) {
  return {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: ".05em",
    textTransform: "uppercase",
    color: color || p.accent,
    background: (color || p.accent) + "1e",
    borderRadius: 5,
    padding: "3px 8px",
  };
}

function renderHighlightedText(text, quote, p, markRef) {
  const loc = locateQuote(text, quote);
  if (!loc) {
    return <>{text}</>;
  }
  const before = text.slice(0, loc[0]);
  const match = text.slice(loc[0], loc[1]);
  const after = text.slice(loc[1]);
  return (
    <>
      {before}
      <mark ref={markRef} style={{ background: p.accentSoft, color: p.ink, borderRadius: 3, padding: "1px 2px", boxShadow: `0 0 0 2px ${p.accent}` }}>
        {match}
      </mark>
      {after}
    </>
  );
}

const STORAGE_KEY = "ethnocode.workspace.v1";

function sampleNotes() {
  return [
    { ...SAMPLE_A, id: crypto.randomUUID() },
    { ...SAMPLE_B, id: crypto.randomUUID() },
  ];
}

function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!Array.isArray(d.notes)) return null;
    return {
      notes: d.notes.map((n) => ({ ...n, loading: false, error: null })),
      codebook: Array.isArray(d.codebook) ? d.codebook : null,
    };
  } catch {
    return null;
  }
}

// Finds a quote in the note: exact match first, then a whitespace-,
// case- and smart-quote-tolerant match. Returns [start, end] or null.
function locateQuote(text, quote) {
  if (!text || !quote || !quote.trim()) return null;
  const exact = text.indexOf(quote);
  if (exact >= 0) return [exact, exact + quote.length];
  const words = quote
    .trim()
    .split(/\s+/)
    .map((w) =>
      w
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/['’‘]/g, "['’‘]")
        .replace(/["“”]/g, '["“”]')
    );
  try {
    const m = new RegExp(words.join("\\s+"), "i").exec(text);
    return m ? [m.index, m.index + m[0].length] : null;
  } catch {
    return null;
  }
}

function renderAnnotatedText(text, codes, colors, p) {
  const ranges = [];
  (codes || []).forEach((c, ci) => {
    (c.quotes || []).forEach((q) => {
      const loc = locateQuote(text, q);
      if (loc) ranges.push({ start: loc[0], end: loc[1], color: colors[ci % colors.length], name: c.name });
    });
  });
  ranges.sort((a, b) => a.start - b.start);
  const out = [];
  let pos = 0;
  ranges.forEach((r, i) => {
    if (r.start < pos) return;
    if (r.start > pos) out.push(text.slice(pos, r.start));
    out.push(
      <mark
        key={i}
        title={r.name}
        style={{ background: r.color + "2e", color: p.ink, borderBottom: `2px solid ${r.color}`, borderRadius: 2, padding: "1px 0" }}
      >
        {text.slice(r.start, r.end)}
      </mark>
    );
    pos = r.end;
  });
  out.push(text.slice(pos));
  return out;
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function csvCell(v) {
  const str = String(v ?? "");
  return /[",\n]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
}
/* -------------------------- */

const UNIVERSITY_LOGOS = [
  { name: "UCL", src: "data:image/png;base64,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" },
  { name: "University of Tehran", src: "data:image/png;base64,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" },
  { name: "Mehrais", src: "data:image/png;base64,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" },
];

const FEATURES = [
  {
    icon: Icon.wand,
    title: "Open coding, grounded in the text",
    body: "Claude reads a field note and drafts codes with a definition and the exact quotes that support each one — nothing invented, everything traceable.",
  },
  {
    icon: Icon.cluster,
    title: "Axial coding across notes",
    body: "Once a few notes are coded, cluster every open code you've collected into a smaller set of shared themes, with the reasoning shown.",
  },
  {
    icon: Icon.link,
    title: "Traceable by design",
    body: "Every quote is checked against your original note and flagged if it isn't word-for-word. Click any quote to jump straight back to that line.",
  },
];

const STEPS = [
  { title: "Paste your field note", body: "Drop in a field note, interview transcript, or observation log. No formatting or cleanup needed first." },
  { title: "Generate open codes", body: "Review what Claude drafted, edit any code or definition by hand, and add your own where something's missing." },
  { title: "Build your codebook", body: "Cluster codes from every note you've analyzed into axial themes, then export the whole codebook as markdown." },
];

function LandingPage({ theme, setTheme, onEnter }) {
  const p = PALETTES[theme];
  return (
    <div className="ec" style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif", background: p.bg, color: p.ink, minHeight: "100vh", width: "100%" }}>
      <GlobalStyle p={p} />

      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 32px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-.03em" }}>EthnoCode</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="ec-theme-toggle"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            style={{ width: 34, height: 34, borderRadius: 8, border: `1px solid ${p.border}`, background: p.surface, color: p.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {theme === "light" ? <Icon.moon /> : <Icon.sun />}
          </button>
          <button onClick={onEnter} className="ec-btn-ghost" style={{ ...iconTextButtonStyle(p), border: `1px solid ${p.border}`, padding: "9px 16px", borderRadius: 7, color: p.ink }}>
            Open workspace
          </button>
        </div>
      </div>

      {/* hero */}
      <div className="ec-enter-main" style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 32px 84px", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: 56, alignItems: "center" }}>
        <div>
          <span style={eyebrowStyle(p)}>Open &amp; axial coding, assisted</span>
          <h1 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 44, lineHeight: 1.14, margin: "0 0 20px", letterSpacing: "-.01em", color: p.ink }}>
            Every code, still tied to the line it came from.
          </h1>
          <p style={{ fontSize: 16.5, color: p.inkSoft, lineHeight: 1.65, maxWidth: 440, marginBottom: 30 }}>
            Paste a field note or interview transcript. EthnoCode drafts open codes with supporting quotes, then clusters codes from every note into axial themes — with each quote one click from its source.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
            <button onClick={onEnter} className="ec-btn-primary ec-land-cta" style={{ background: p.accent, color: "#fff", border: "none", borderRadius: 8, padding: "13px 24px", fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>
              Start coding your notes
            </button>
            <span style={{ fontSize: 13, color: p.inkSoft }}>Two sample notes are loaded in — nothing to upload first.</span>
          </div>
        </div>

        <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 14, padding: 22, boxShadow: `0 14px 34px ${p.shadow}` }}>
          <span style={eyebrowStyle(p, p.inkSoft)}>Tuesday market — open codes</span>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { name: "Reciprocal stocking", def: "Vendors move stock between stalls without payment, framing each other as neighbors rather than competitors.", quote: "we're not really competitors, we're neighbors first" },
              { name: "Informal seniority", def: "Long-tenured vendors defuse disputes through presence alone, without invoking the written rules.", quote: "the loud vendor immediately lowered his voice" },
            ].map((c, i) => (
              <div key={i} style={{ background: p.bg, borderRadius: 10, padding: "13px 15px" }}>
                <span style={tagStyle(p)}>{`Code 0${i + 1}`}</span>
                <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 700, fontSize: 15.5, marginTop: 7 }}>{c.name}</div>
                <div style={{ fontSize: 12.5, color: p.inkSoft, margin: "3px 0 9px" }}>{c.def}</div>
                <div style={{ display: "flex", gap: 7 }}>
                  <span style={{ color: p.accent, fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 17, lineHeight: 1, flexShrink: 0 }}>&ldquo;</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: p.inkSoft, lineHeight: 1.55 }}>{c.quote}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* trust marquee */}
      <div style={{ borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}`, padding: "26px 0" }}>
        <div style={{ textAlign: "center", fontSize: 12.5, color: p.inkSoft, fontWeight: 600, marginBottom: 18 }}>
          In use for fieldwork and coursework at
        </div>
        <div
          className="ec-marquee-wrap"
          style={{ overflow: "hidden", maskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, black 8%, black 92%, transparent)" }}
        >
          <div className="ec-marquee-track">
            {[...UNIVERSITY_LOGOS, ...UNIVERSITY_LOGOS, ...UNIVERSITY_LOGOS].map((u, i) => (
              <div
                key={i}
                title={u.name}
                style={{ width: 132, height: 46, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <img
                  src={u.src}
                  alt={u.name}
                  style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain" }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* features */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ maxWidth: 520, marginBottom: 44 }}>
          <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 29, margin: "0 0 12px", color: p.ink }}>Built around how coding actually works</h2>
          <p style={{ color: p.inkSoft, fontSize: 15, lineHeight: 1.6 }}>Not a black box — every suggestion is grounded in your own text and stays editable.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22 }}>
          {FEATURES.map((f, i) => (
            <div key={i} className="ec-feature-card" style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 12, padding: "24px 22px", boxShadow: `0 1px 3px ${p.shadow}` }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: p.accentSoft, color: p.accent, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <f.icon />
              </div>
              <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontWeight: 700, fontSize: 16.5, marginBottom: 8, color: p.ink }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: p.inkSoft, lineHeight: 1.6 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* steps */}
      <div style={{ background: p.surface, borderTop: `1px solid ${p.border}`, borderBottom: `1px solid ${p.border}` }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "68px 32px", display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 32 }}>
          {STEPS.map((s, i) => (
            <div key={i}>
              <div style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 25, color: p.accent, fontWeight: 700, marginBottom: 10 }}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: p.ink }}>{s.title}</div>
              <div style={{ fontSize: 13.5, color: p.inkSoft, lineHeight: 1.6 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* final CTA */}
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "84px 32px", textAlign: "center" }}>
        <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 29, margin: "0 0 22px", color: p.ink }}>Your notes stay yours. Start coding.</h2>
        <button onClick={onEnter} className="ec-btn-primary ec-land-cta" style={{ background: p.accent, color: "#fff", border: "none", borderRadius: 8, padding: "14px 28px", fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>
          Open the workspace
        </button>
      </div>

      <div style={{ borderTop: `1px solid ${p.border}`, padding: "22px 32px", textAlign: "center", fontSize: 12.5, color: p.inkSoft }}>
        EthnoCode is a coding workspace for ethnographers, running on Claude.
      </div>
    </div>
  );
}

function Workspace({ theme, setTheme, onExitToLanding }) {
  const p = PALETTES[theme];
  const themeColors = THEME_COLORS[theme];

  const [initial] = useState(() => loadWorkspace());
  const [notes, setNotes] = useState(() => (initial && initial.notes.length ? initial.notes : sampleNotes()));
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState("notes");
  const [codebook, setCodebook] = useState(() => (initial ? initial.codebook : null));
  const [importError, setImportError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ notes: notes.map(({ loading, error, ...rest }) => rest), codebook })
      );
    } catch {}
  }, [notes, codebook]);

  const noteTexts = Object.fromEntries(notes.map((n) => [n.id, n.text]));

  function resetWorkspace() {
    if (!window.confirm("Reset the workspace to the two sample notes? Your current notes and codebook will be cleared.")) return;
    setNotes(sampleNotes());
    setCodebook(null);
    setActiveId(null);
    setHighlight(null);
    setView("notes");
  }

  async function importFiles(fileList) {
    setImportError(null);
    const created = [];
    for (const f of Array.from(fileList || [])) {
      try {
        const lower = f.name.toLowerCase();
        let text = "";
        if (lower.endsWith(".docx")) {
          const mod = await import("mammoth");
          const mammoth = mod.default || mod;
          const res = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() });
          text = res.value;
        } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
          text = await f.text();
        } else {
          throw new Error("only .txt, .md and .docx files are supported");
        }
        created.push({ ...newNote(f.name.replace(/\.[^.]+$/, "")), text: text.trim() });
      } catch (e) {
        setImportError(`Couldn't import ${f.name}: ${e?.message || "unknown error"}`);
      }
    }
    if (created.length) {
      setNotes((prev) => [...prev, ...created]);
      setActiveId(created[created.length - 1].id);
      setView("notes");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }
  const [codebookLoading, setCodebookLoading] = useState(false);
  const [codebookError, setCodebookError] = useState(null);
  const [highlight, setHighlight] = useState(null); // { noteId, quote }
  const nextTitleNum = useRef(notes.length + 1);

  function jumpToQuote(noteId, quote) {
    setView("notes");
    setActiveId(noteId);
    setHighlight({ noteId, quote });
  }

  const activeNote = notes.find((n) => n.id === activeId) || notes[0];
  const activeNoteId = activeNote?.id;

  function updateNote(id, patch) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function addNote() {
    const n = newNote("Untitled note " + nextTitleNum.current);
    nextTitleNum.current += 1;
    setNotes((prev) => [...prev, n]);
    setActiveId(n.id);
    setView("notes");
  }

  function deleteNote(id) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeId === id) setActiveId(null);
  }

  async function generateCodes(id) {
    const note = notes.find((n) => n.id === id);
    if (!note || !note.text.trim()) return;
    updateNote(id, { loading: true, error: null });
    try {
      const parsed = await callClaude(codingPrompt(note.text));
      if (!parsed.codes || !Array.isArray(parsed.codes)) throw new Error("Unexpected response shape.");
      const codes = parsed.codes.map((c) => ({ ...c, id: crypto.randomUUID() }));
      updateNote(id, { codes, loading: false });
    } catch (e) {
      updateNote(id, { loading: false, error: "Coding failed: " + (e?.message || "unknown error") });
    }
  }

  function editCode(noteId, codeId, patch) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id !== noteId ? n : { ...n, codes: n.codes.map((c) => (c.id === codeId ? { ...c, ...patch } : c)) }
      )
    );
  }

  function deleteCode(noteId, codeId) {
    setNotes((prev) =>
      prev.map((n) => (n.id !== noteId ? n : { ...n, codes: n.codes.filter((c) => c.id !== codeId) }))
    );
  }

  function deleteQuote(noteId, codeId, quoteIdx) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id !== noteId
          ? n
          : {
              ...n,
              codes: n.codes.map((c) =>
                c.id !== codeId ? c : { ...c, quotes: c.quotes.filter((_, i) => i !== quoteIdx) }
              ),
            }
      )
    );
  }

  function addManualCode(noteId) {
    setNotes((prev) =>
      prev.map((n) =>
        n.id !== noteId
          ? n
          : { ...n, codes: [...(n.codes || []), { id: crypto.randomUUID(), name: "New code", definition: "Click to edit.", quotes: [] }] }
      )
    );
  }

  const codedNotes = notes.filter((n) => n.codes && n.codes.length > 0);

  async function buildCodebook() {
    if (codedNotes.length === 0) return;
    setCodebookLoading(true);
    setCodebookError(null);
    setCodebook(null);
    try {
      const entries = [];
      codedNotes.forEach((n) => {
        n.codes.forEach((c) => {
          entries.push({ id: c.id, name: c.name, definition: c.definition, noteId: n.id, noteTitle: n.title, quotes: c.quotes });
        });
      });
      const parsed = await callClaude(axialPrompt(entries), 1500);
      if (!parsed.themes || !Array.isArray(parsed.themes)) throw new Error("Unexpected response shape.");
      const byId = Object.fromEntries(entries.map((e) => [e.id, e]));
      const themes = parsed.themes.map((t) => {
        const memberCodes = (t.codeIds || []).map((id) => byId[id]).filter(Boolean);
        const totalQuotes = memberCodes.reduce((sum, c) => sum + c.quotes.length, 0);
        const noteSet = new Set(memberCodes.map((c) => c.noteId));
        return { name: t.name, definition: t.definition, codes: memberCodes, totalQuotes, noteCount: noteSet.size };
      });
      setCodebook(themes);
    } catch (e) {
      setCodebookError("Couldn't build the codebook: " + (e?.message || "unknown error"));
    } finally {
      setCodebookLoading(false);
    }
  }

  function exportCodebook(format) {
    if (!codebook) return;
    const found = (c, q) => !!locateQuote(noteTexts[c.noteId] || "", q);
    if (format === "md") {
      let md = "# Codebook\n\n";
      codebook.forEach((theme) => {
        md += `## ${theme.name}\n\n_${theme.definition}_\n\n`;
        theme.codes.forEach((c) => {
          md += `**${c.name}** (${c.noteTitle}) — ${c.definition}\n\n`;
          c.quotes.forEach((q) => {
            md += `> ${q}${found(c, q) ? "" : " _(not found in note)_"}\n\n`;
          });
        });
      });
      downloadFile("codebook.md", md, "text/markdown");
    } else if (format === "csv") {
      const rows = [["Theme", "Theme definition", "Code", "Code definition", "Note", "Quote", "Quote found in note"]];
      codebook.forEach((t) =>
        t.codes.forEach((c) => {
          const qs = c.quotes.length ? c.quotes : [""];
          qs.forEach((q) => rows.push([t.name, t.definition, c.name, c.definition, c.noteTitle, q, q ? (found(c, q) ? "yes" : "no") : ""]));
        })
      );
      downloadFile("codebook.csv", "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n"), "text/csv");
    } else {
      const body = codebook
        .map(
          (t, i) =>
            `<h2>${i + 1}. ${escHtml(t.name)}</h2><p><i>${escHtml(t.definition)}</i></p>` +
            `<p style="color:#666">${t.codes.length} codes · ${t.totalQuotes} quotes · ${t.noteCount} notes</p>` +
            t.codes
              .map(
                (c) =>
                  `<h3>${escHtml(c.name)} <span style="font-weight:normal;color:#666">— ${escHtml(c.noteTitle)}</span></h3>` +
                  `<p>${escHtml(c.definition)}</p>` +
                  c.quotes
                    .map(
                      (q) =>
                        `<p style="margin:4px 0 4px 18px;color:#333;border-left:3px solid #4f7cab;padding-left:8px">“${escHtml(q)}”` +
                        (found(c, q) ? "" : ' <span style="color:#b0432c">[not found in note]</span>') +
                        `</p>`
                    )
                    .join("")
              )
              .join("")
        )
        .join("");
      const html = `<html><head><meta charset="utf-8"><title>Codebook</title></head><body style="font-family:Calibri,Arial,sans-serif"><h1>EthnoCode codebook</h1><p style="color:#666">Generated ${new Date().toLocaleDateString()} from ${codedNotes.length} field notes</p>${body}</body></html>`;
      downloadFile("codebook.doc", html, "application/msword");
    }
  }

  const maxThemeSize = codebook ? Math.max(...codebook.map((t) => t.totalQuotes), 1) : 1;

  return (
    <div
      className="ec"
      style={{
        fontFamily: "'Inter', -apple-system, system-ui, sans-serif",
        background: p.bg,
        color: p.ink,
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        display: "flex",
        fontSize: 15.5,
      }}
    >
      <GlobalStyle p={p} />

      {/* Sidebar */}
      <div
        className="ec-enter-sidebar"
        style={{
          width: 300,
          flexShrink: 0,
          background: p.bg,
          borderRight: `1px solid ${p.border}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "26px 20px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={onExitToLanding}
              title="Back to overview"
              className="ec-btn-ghost"
              style={{
                width: 30, height: 30, borderRadius: 8, border: `1px solid ${p.border}`, background: p.surface,
                color: p.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <Icon.arrowLeft />
            </button>
            <button
              onClick={onExitToLanding}
              title="Back to overview"
              style={{
                fontSize: 30, fontWeight: 900, letterSpacing: "-.03em", color: p.ink,
                background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              EthnoCode
            </button>
          </div>
          <button
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="ec-theme-toggle"
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
            style={{
              width: 30, height: 30, borderRadius: 8, border: `1px solid ${p.border}`, background: p.surface,
              color: p.inkSoft, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            {theme === "light" ? <Icon.moon /> : <Icon.sun />}
          </button>
        </div>

        <div style={{ padding: "6px 20px 18px" }}>
          <button
            onClick={addNote}
            className="ec-btn-primary"
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              background: p.accent, color: "#fff", border: "none", borderRadius: 8, padding: "11px 14px",
              fontWeight: 700, fontSize: 14, cursor: "pointer",
            }}
          >
            <Icon.plus /> New field note
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md,.docx"
            style={{ display: "none" }}
            onChange={(e) => importFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current && fileInputRef.current.click()}
            className="ec-btn-ghost"
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8,
              background: p.surface, color: p.ink, border: `1px solid ${p.border}`, borderRadius: 8, padding: "9px 14px",
              fontWeight: 600, fontSize: 13.5, cursor: "pointer",
            }}
          >
            <Icon.download style={{ transform: "rotate(180deg)" }} /> Import .txt / .docx
          </button>
          {importError && <div style={{ color: p.rust, fontSize: 12.5, marginTop: 8, lineHeight: 1.45 }}>{importError}</div>}
        </div>

        <div style={{ padding: "0 20px 10px" }}>
          <span style={eyebrowStyle(p, p.inkSoft)}>Workspace</span>
        </div>
        <div style={{ padding: "0 12px", display: "flex", flexDirection: "column", gap: 2, marginBottom: 8 }}>
          <button
            onClick={() => setView("notes")}
            className={"ec-nav-row ec-enter-item" + (view === "notes" ? " active" : "")}
            style={{ ...navRowStyle(view === "notes", p), animationDelay: ".16s" }}
          >
            <Icon.notebook />
            <span style={{ flex: 1, textAlign: "left", fontWeight: view === "notes" ? 700 : 600 }}>Field notes</span>
            <span style={navBadgeStyle(p)}>{notes.length}</span>
          </button>
          <button
            onClick={() => setView("codebook")}
            className={"ec-nav-row ec-enter-item" + (view === "codebook" ? " active" : "")}
            style={{ ...navRowStyle(view === "codebook", p), animationDelay: ".21s" }}
          >
            <Icon.layers />
            <span style={{ flex: 1, textAlign: "left", fontWeight: view === "codebook" ? 700 : 600 }}>Codebook</span>
            {codebook && <span style={navBadgeStyle(p)}>{codebook.length}</span>}
          </button>
        </div>

        {view === "notes" && (
          <>
            <div style={{ padding: "10px 20px 8px", borderTop: `1px solid ${p.border}`, marginTop: 4 }}>
              <span style={eyebrowStyle(p, p.inkSoft)}>Notes</span>
            </div>
            <div className="ec-scroll" style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", flex: 1, minHeight: 0, padding: "0 12px 20px" }}>
              {notes.map((n, i) => (
                <div
                  key={n.id}
                  onClick={() => setActiveId(n.id)}
                  className={"ec-note-item ec-enter-item" + (n.id === activeNoteId ? " active" : "")}
                  style={{ padding: "13px 14px", borderRadius: 8, cursor: "pointer", animationDelay: `${0.26 + Math.min(i, 8) * 0.045}s` }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: n.id === activeNoteId ? p.accent : p.ink,
                        fontWeight: n.id === activeNoteId ? 700 : 600,
                        fontSize: 15,
                      }}
                    >
                      {n.title || "Untitled"}
                    </span>
                    {n.codes && (
                      <span style={{ fontSize: 11.5, color: p.accent, background: p.accentSoft, borderRadius: 10, padding: "2px 8px", flexShrink: 0, fontWeight: 700 }}>
                        {n.codes.length}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: p.inkSoft, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.text ? n.text.replace(/\s+/g, " ").slice(0, 64) : "Empty note"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{ marginTop: "auto", padding: "12px 20px", borderTop: `1px solid ${p.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: p.inkSoft }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4a9a63" }} /> Saved on this device
          </span>
          <button onClick={resetWorkspace} className="ec-btn-ghost" style={{ background: "none", border: "none", color: p.inkSoft, cursor: "pointer", fontSize: 12, padding: "4px 6px", borderRadius: 5 }}>
            Reset
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {(codebookLoading || (activeNote && activeNote.loading)) && <div className="ec-loadbar" />}
        <div className="ec-scroll" style={{ height: "100%", padding: "60px 48px 60px", overflowY: "auto" }}>
          <div key={view + (activeNote ? activeNote.id : "none")} className="ec-enter-main">
            {view === "notes" && activeNote && (
              <NoteView
                p={p}
                themeColors={themeColors}
                note={activeNote}
                onTitleChange={(title) => updateNote(activeNote.id, { title })}
                onTextChange={(text) => updateNote(activeNote.id, { text })}
                onDelete={() => deleteNote(activeNote.id)}
                onGenerate={() => generateCodes(activeNote.id)}
                onEditCode={(codeId, patch) => editCode(activeNote.id, codeId, patch)}
                onDeleteCode={(codeId) => deleteCode(activeNote.id, codeId)}
                onDeleteQuote={(codeId, qi) => deleteQuote(activeNote.id, codeId, qi)}
                onAddCode={() => addManualCode(activeNote.id)}
                onQuoteClick={(quote) => jumpToQuote(activeNote.id, quote)}
                highlightQuote={highlight && highlight.noteId === activeNote.id ? highlight.quote : null}
                onClearHighlight={() => setHighlight(null)}
              />
            )}

            {view === "notes" && !activeNote && <EmptyState p={p} eyebrow="Field notes" title="No note selected" body="Choose a note from the sidebar, or add a new one." />}

            {view === "codebook" && (
              <CodebookView
                p={p}
                themeColors={themeColors}
                codedNotes={codedNotes}
                codebook={codebook}
                loading={codebookLoading}
                error={codebookError}
                onBuild={buildCodebook}
                onExport={exportCodebook}
                noteTexts={noteTexts}
                maxThemeSize={maxThemeSize}
                onQuoteClick={jumpToQuote}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function navRowStyle(active, p) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    width: "100%",
    textAlign: "left",
    padding: "9px 10px",
    borderRadius: 7,
    border: "none",
    cursor: "pointer",
    fontSize: 14.5,
    background: active ? p.accentSoft : "transparent",
    color: active ? p.accent : p.inkSoft,
  };
}

function navBadgeStyle(p) {
  return {
    fontSize: 11.5,
    fontWeight: 700,
    color: p.inkSoft,
    background: p.surface,
    border: `1px solid ${p.border}`,
    borderRadius: 10,
    padding: "1px 7px",
    flexShrink: 0,
  };
}

const iconTextButtonStyle = (p) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  background: "none",
  border: "none",
  color: p.accent,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
});

function IconButton({ onClick, children, title, danger, p }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={danger ? "ec-icon-btn-danger" : "ec-icon-btn"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 30,
        height: 30,
        borderRadius: 7,
        border: "none",
        background: danger ? p.hoverBg : "transparent",
        color: p.inkSoft,
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

function CodeSkeleton({ p, count = 4 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="ec-enter-item"
          style={{
            animationDelay: `${i * 0.06}s`,
            background: p.surface,
            border: `1px solid ${p.border}`,
            borderRadius: 10,
            padding: "16px 18px",
          }}
        >
          <div className="ec-skel" style={{ width: 78, height: 16, marginBottom: 14 }} />
          <div className="ec-skel" style={{ width: "46%", height: 15, marginBottom: 9 }} />
          <div className="ec-skel" style={{ width: "72%", height: 12, marginBottom: 14 }} />
          <div className="ec-skel" style={{ width: "100%", height: 34, borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

function ThemeSkeleton({ p, count = 3 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="ec-enter-item"
          style={{
            animationDelay: `${i * 0.08}s`,
            background: p.surface,
            border: `1px solid ${p.border}`,
            borderLeft: `3px solid ${p.border}`,
            borderRadius: 10,
            padding: "18px 22px",
          }}
        >
          <div className="ec-skel" style={{ width: 90, height: 14, marginBottom: 12 }} />
          <div className="ec-skel" style={{ width: "38%", height: 18, marginBottom: 10 }} />
          <div className="ec-skel" style={{ width: "80%", height: 12, marginBottom: 16 }} />
          <div className="ec-skel" style={{ width: "60%", height: 12 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ p, eyebrow, title, body }) {
  return (
    <div style={{ maxWidth: 460, margin: "40px auto 0", textAlign: "center" }}>
      {eyebrow && <span style={{ ...eyebrowStyle(p), textAlign: "center" }}>{eyebrow}</span>}
      <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 25, margin: "0 0 10px", color: p.ink }}>{title}</h2>
      <p style={{ color: p.inkSoft, lineHeight: 1.6, margin: 0, fontSize: 15 }}>{body}</p>
    </div>
  );
}

function NoteView({ p, themeColors, note, onTitleChange, onTextChange, onDelete, onGenerate, onEditCode, onDeleteCode, onDeleteQuote, onAddCode, onQuoteClick, highlightQuote, onClearHighlight }) {
  const wordCount = note.text.trim() ? note.text.trim().split(/\s+/).length : 0;
  const markRef = useRef(null);
  const hasCodes = !!(note.codes && note.codes.length);
  const allQuotes = hasCodes ? note.codes.flatMap((c) => c.quotes || []) : [];
  const verifiedCount = allQuotes.filter((q) => locateQuote(note.text, q)).length;
  const [showHighlights, setShowHighlights] = useState(hasCodes);
  const codeCount = hasCodes ? note.codes.length : 0;
  const prevCodeCount = useRef(codeCount);
  useEffect(() => {
    if (prevCodeCount.current === 0 && codeCount > 0) setShowHighlights(true);
    prevCodeCount.current = codeCount;
  }, [codeCount]);
  useEffect(() => {
    if (highlightQuote && markRef.current) {
      markRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightQuote, note.id]);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <span style={eyebrowStyle(p)}>Field note</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 5 }}>
        <input
          value={note.title}
          onChange={(e) => onTitleChange(e.target.value)}
          className="ec-input-line"
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",            fontSize: 34,
            fontWeight: 700,
            border: "none",
            background: "transparent",
            color: p.ink,
            width: "100%",
            paddingBottom: 3,
          }}
        />
        <IconButton onClick={onDelete} title="Delete note" danger p={p}>
          <Icon.trash />
        </IconButton>
      </div>
      <div style={{ fontSize: 13, color: p.inkSoft, marginBottom: 22, fontWeight: 500 }}>
        {wordCount} words{note.codes ? ` · ${note.codes.length} codes` : ""}
        {allQuotes.length > 0 && (
          <span style={{ color: verifiedCount === allQuotes.length ? "#4a9a63" : p.rust, fontWeight: 600 }}>
            {` · ${verifiedCount}/${allQuotes.length} quotes verified in text`}
          </span>
        )}
      </div>

      {highlightQuote ? (
        <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, marginBottom: 20, boxShadow: `0 1px 3px ${p.shadow}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${p.border}` }}>
            <span style={{ fontSize: 12.5, color: p.inkSoft, fontWeight: 600 }}>Showing extracted quote in context</span>
            <button onClick={onClearHighlight} className="ec-btn-ghost" style={{ ...iconTextButtonStyle(p), padding: "4px 8px", borderRadius: 6, fontSize: 12.5 }}>
              Back to editing
            </button>
          </div>
          <div
            style={{
              padding: 16,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 14.5,
              lineHeight: 1.75,
              color: p.ink,
              whiteSpace: "pre-wrap",
              maxHeight: 420,
              overflowY: "auto",
            }}
          >
            {renderHighlightedText(note.text, highlightQuote, p, markRef)}
          </div>
        </div>
      ) : showHighlights && hasCodes ? (
        <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, marginBottom: 20, boxShadow: `0 1px 3px ${p.shadow}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${p.border}` }}>
            <span style={{ fontSize: 12.5, color: p.inkSoft, fontWeight: 600 }}>Coded passages</span>
            <button onClick={() => setShowHighlights(false)} className="ec-btn-ghost" style={{ ...iconTextButtonStyle(p), padding: "4px 8px", borderRadius: 6, fontSize: 12.5 }}>
              Edit text
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", padding: "10px 16px 0" }}>
            {note.codes.map((c, i) => (
              <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: p.inkSoft, fontWeight: 600 }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: themeColors[i % themeColors.length] }} />
                {c.name}
              </span>
            ))}
          </div>
          <div
            style={{
              padding: 16, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14.5, lineHeight: 1.85,
              color: p.ink, whiteSpace: "pre-wrap", maxHeight: 460, overflowY: "auto",
            }}
          >
            {renderAnnotatedText(note.text, note.codes, themeColors, p)}
          </div>
        </div>
      ) : (
        <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, padding: 4, marginBottom: 20, boxShadow: `0 1px 3px ${p.shadow}` }}>
          {hasCodes && (
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 10px 0" }}>
              <button onClick={() => setShowHighlights(true)} className="ec-btn-ghost" style={{ ...iconTextButtonStyle(p), padding: "4px 8px", borderRadius: 6, fontSize: 12.5 }}>
                Show highlights
              </button>
            </div>
          )}
          <textarea
            value={note.text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={12}
            placeholder="Paste the field note or interview transcript here..."
            className="ec-textarea"
            style={{
              width: "100%",
              boxSizing: "border-box",
              background: "transparent",
              border: "none",
              resize: "vertical",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 14.5,
              lineHeight: 1.75,
              color: p.ink,
              padding: 16,
            }}
          />
        </div>
      )}

      <button
        onClick={onGenerate}
        disabled={note.loading || !note.text.trim()}
        className="ec-btn-primary"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 9,
          fontFamily: "'Inter', sans-serif",
          fontSize: 15,
          fontWeight: 700,
          color: "#fff",
          background: note.loading ? p.inkSoft : p.accent,
          border: "none",
          borderRadius: 8,
          padding: "11px 20px",
          cursor: note.loading || !note.text.trim() ? "default" : "pointer",
        }}
      >
        <Icon.wand />
        {note.loading ? "Coding..." : note.codes ? "Re-generate codes" : "Generate codes"}
      </button>

      {note.error && <p style={{ color: p.rust, marginTop: 16, fontSize: 14.5 }}>{note.error}</p>}

      {note.loading && (
        <div style={{ marginTop: 34 }}>
          <span style={{ ...eyebrowStyle(p), marginBottom: 14, display: "block" }}>Reading for codes...</span>
          <CodeSkeleton p={p} />
        </div>
      )}

      {!note.loading && note.codes && (
        <div className="ec-fade-in" style={{ marginTop: 34 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <span style={{ ...eyebrowStyle(p), marginBottom: 0 }}>
              Open codes · {note.codes.length}
            </span>
            <button onClick={onAddCode} className="ec-btn-ghost" style={{ ...iconTextButtonStyle(p), padding: "5px 9px", borderRadius: 6 }}>
              <Icon.plus /> Add code manually
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {note.codes.map((c, i) => (
              <CodeCard key={c.id} p={p} index={i} code={c} noteText={note.text} color={themeColors[i % themeColors.length]} delay={Math.min(i, 8) * 0.05} onEdit={(patch) => onEditCode(c.id, patch)} onDelete={() => onDeleteCode(c.id)} onDeleteQuote={(qi) => onDeleteQuote(c.id, qi)} onQuoteClick={onQuoteClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CodeCard({ p, code, index, noteText, color, delay = 0, onEdit, onDelete, onDeleteQuote, onQuoteClick }) {
  return (
    <div className="ec-enter-item" style={{ animationDelay: `${delay}s`, background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, padding: "16px 18px", boxShadow: `0 1px 3px ${p.shadow}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={tagStyle(p, color)}>{`Code ${String(index + 1).padStart(2, "0")}`}</span>
        <IconButton onClick={onDelete} title="Remove code" danger p={p}>
          <Icon.trash />
        </IconButton>
      </div>
      <div style={{ marginTop: 10 }}>
        <input
          value={code.name}
          onChange={(e) => onEdit({ name: e.target.value })}
          className="ec-input-line"
          style={{
            fontFamily: "'Source Serif 4', Georgia, serif",
            fontWeight: 700, fontSize: 17, border: "none", background: "transparent", color: p.ink, width: "100%",
          }}
        />
        <input
          value={code.definition}
          onChange={(e) => onEdit({ definition: e.target.value })}
          className="ec-input-line"
          style={{ fontSize: 14, color: p.inkSoft, border: "none", background: "transparent", width: "100%", marginTop: 3 }}
        />
        {code.quotes && code.quotes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {code.quotes.map((q, qi) => (
              <div key={qi} style={{ display: "flex", gap: 9, alignItems: "flex-start", background: p.bg, borderRadius: 6, padding: "9px 11px" }}>
                <span style={{ color: p.accent, fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 20, lineHeight: 1, flexShrink: 0 }}>&ldquo;</span>
                <div
                  onClick={() => onQuoteClick && onQuoteClick(q)}
                  className="ec-quote-link"
                  title="Jump to this quote in the field note"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13.5, lineHeight: 1.65, color: p.inkSoft, flex: 1, cursor: onQuoteClick ? "pointer" : "default" }}
                >
                  {q}
                </div>
                {locateQuote(noteText || "", q) ? (
                  <span title="This quote appears in the field note" style={{ fontSize: 10.5, fontWeight: 700, color: "#4a9a63", background: "#4a9a631e", borderRadius: 4, padding: "2px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>
                    ✓ Verified
                  </span>
                ) : (
                  <span title="This quote doesn't appear word-for-word in the note. Check it before citing." style={{ fontSize: 10.5, fontWeight: 700, color: p.rust, background: p.rust + "1e", borderRadius: 4, padding: "2px 6px", flexShrink: 0, whiteSpace: "nowrap" }}>
                    Not in text
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteQuote(qi); }}
                  className="ec-icon-btn"
                  style={{ background: "none", border: "none", color: p.inkSoft, cursor: "pointer", padding: 3, borderRadius: 5, flexShrink: 0 }}
                >
                  <Icon.close />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CodebookView({ p, themeColors, codedNotes, codebook, loading, error, onBuild, onExport, maxThemeSize, onQuoteClick, noteTexts }) {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 26 }}>
        <div>
          <span style={eyebrowStyle(p)}>Axial coding</span>
          <h2 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 32, margin: 0, color: p.ink }}>Codebook</h2>
          <p style={{ color: p.inkSoft, marginTop: 7, maxWidth: 500, lineHeight: 1.6, fontSize: 14.5 }}>
            Axial coding across every note you've analyzed — clusters your open codes into shared themes.
          </p>
        </div>
        {codebook && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[["doc", "Word"], ["csv", "CSV"], ["md", "Markdown"]].map(([f, label]) => (
              <button key={f} onClick={() => onExport(f)} className="ec-btn-ghost" style={{ ...iconTextButtonStyle(p), border: `1px solid ${p.border}`, padding: "9px 12px", borderRadius: 7, color: p.ink }}>
                <Icon.download /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {codedNotes.length === 0 ? (
        <EmptyState p={p} title="Nothing to cluster yet" body="Generate codes on at least one field note first, then come back here." />
      ) : (
        <>
          <button
            onClick={onBuild}
            disabled={loading}
            className="ec-btn-primary"
            style={{
              display: "inline-flex", alignItems: "center", gap: 9, fontSize: 15, fontWeight: 700, color: "#fff",
              background: loading ? p.inkSoft : p.accent, border: "none", borderRadius: 8, padding: "11px 20px",
              cursor: loading ? "default" : "pointer", marginBottom: 26,
            }}
          >
            <Icon.cluster />
            {loading ? "Clustering..." : codebook ? "Rebuild from current notes" : `Build codebook from ${codedNotes.length} note${codedNotes.length !== 1 ? "s" : ""}`}
          </button>

          {error && <p style={{ color: p.rust, marginBottom: 18, fontSize: 14.5 }}>{error}</p>}

          {loading && (
            <div style={{ marginBottom: 26 }}>
              <ThemeSkeleton p={p} />
            </div>
          )}

          {!loading && codebook && (
            <div className="ec-fade-in">
              <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 10, padding: 20, marginBottom: 26, boxShadow: `0 1px 3px ${p.shadow}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {codebook.map((t, i) => (
                    <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 13 }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: themeColors[i % themeColors.length], flexShrink: 0 }} />
                      <span style={{ fontSize: 13.5, width: 180, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{t.name}</span>
                      <div style={{ flex: 1, background: p.bg, borderRadius: 3, height: 8 }}>
                        <div style={{ width: `${(t.totalQuotes / maxThemeSize) * 100}%`, background: themeColors[i % themeColors.length], height: 8, borderRadius: 3, transition: "width .4s ease" }} />
                      </div>
                      <span style={{ fontSize: 12.5, color: p.inkSoft, width: 105, flexShrink: 0, textAlign: "right" }}>
                        {t.totalQuotes} quotes · {t.noteCount} notes
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {codebook.map((theme, i) => (
                  <div key={theme.name} className="ec-enter-item" style={{ animationDelay: `${Math.min(i, 8) * 0.06}s`, background: p.surface, border: `1px solid ${p.border}`, borderLeft: `3px solid ${themeColors[i % themeColors.length]}`, borderRadius: 10, padding: "18px 22px", boxShadow: `0 1px 3px ${p.shadow}` }}>
                    <span style={tagStyle(p, themeColors[i % themeColors.length])}>{`Theme ${String(i + 1).padStart(2, "0")}`}</span>
                    <h3 style={{ fontFamily: "'Source Serif 4', Georgia, serif", fontSize: 20, margin: "8px 0 0", color: p.ink }}>{theme.name}</h3>
                    <p style={{ color: p.inkSoft, fontSize: 14, margin: "5px 0 15px" }}>{theme.definition}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                      {theme.codes.map((c) => (
                        <div key={c.id} style={{ borderLeft: `2px solid ${p.border}`, paddingLeft: 13 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 700, color: p.ink }}>
                            {c.name} <span style={{ fontWeight: 500, color: p.inkSoft, fontSize: 12.5 }}>— {c.noteTitle}</span>
                          </div>
                          {c.quotes.map((q, qi) => (
                            <div
                              key={qi}
                              onClick={() => onQuoteClick && onQuoteClick(c.noteId, q)}
                              className="ec-quote-link"
                              title="Jump to this quote in the field note"
                              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: p.inkSoft, marginTop: 5, lineHeight: 1.6, cursor: onQuoteClick ? "pointer" : "default" }}
                            >
                              {q}
                              {!locateQuote((noteTexts && noteTexts[c.noteId]) || "", q) && (
                                <span style={{ marginLeft: 8, fontFamily: "'Inter', sans-serif", fontSize: 10.5, fontWeight: 700, color: p.rust }}>Not in text</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function EthnoCode() {
  const [theme, setTheme] = useState("light");
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return <LandingPage theme={theme} setTheme={setTheme} onEnter={() => setEntered(true)} />;
  }
  return <Workspace theme={theme} setTheme={setTheme} onExitToLanding={() => setEntered(false)} />;
}
