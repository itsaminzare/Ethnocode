/* EthnoCode workspace. Plain JavaScript, no build step. */
(function () {
  "use strict";

  var MODEL = "claude-sonnet-4-6";
  var STORE_KEY = "ethnocode.workspace.v2";
  var COLORS = ["#ddbdff", "#b6f0ff", "#ffd9a8", "#c9f2d4", "#ffc9de", "#cfd6ff", "#ece6a6"];

  var SAMPLES = [
    {
      title: "Tuesday market",
      text: "Field note, Tuesday market, 14:20.\n\nArrived as vendors were finishing setup. An older woman selling greens waved me over before I'd asked anything. She said she remembered me from last week, asked if my notebook work was going well. Several vendors here seem to track who's a regular and who isn't; a younger seller two stalls down didn't acknowledge me at all until the woman introduced me by name.\n\nNoticed vendors constantly redistributing produce between each other's stalls: a crate of tomatoes moved from stall 4 to stall 7 without any visible exchange of money. When I asked about it later, the tomato seller said we're not really competitors, we're neighbors first. This seems to contradict the market association's official rule sheet, which frames stalls as independent renters in competition for the same customers.\n\nA dispute broke out around 15:00 between two fish vendors over stall boundary lines marked in chalk. Bystanders didn't intervene directly but several older vendors positioned themselves nearby, visibly listening, without speaking. The dispute resolved within a few minutes once one of the older listeners cleared their throat loudly. No words exchanged, but the loud vendor immediately lowered his voice and the disagreement ended."
    },
    {
      title: "Interview with the association head",
      text: "Interview with M., head of the vendor association, 09:40, her stall.\n\nM. was reluctant to have this recorded at first, said association business should stay among vendors. Agreed once I explained notes only, no names in the writeup beyond her role.\n\nShe described her job mostly as preventing disputes before they start, not resolving them after. Said the real authority in the market isn't the written rule sheet but a small group of long-tenured vendors who everyone just listens to, though she wouldn't name them directly. When I mentioned the chalk-line dispute from Tuesday, she laughed and said that's exactly the kind of thing that resolves itself if the association stays out of it.\n\nShe was more guarded discussing the produce-sharing between stalls, said only that it's not really the association's business what vendors do with their own stock. Notable that this framing sits oddly next to what I observed, where stock moved between stalls as though it were shared."
    }
  ];

  /* ---------- helpers ---------- */
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function wordCount(t) { t = (t || "").trim(); return t ? t.split(/\s+/).length : 0; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // Finds a quote in the text: exact first, then ignoring spacing, case and curly quote marks.
  function locateQuote(text, quote) {
    if (!text || !quote || !quote.trim()) return null;
    var i = text.indexOf(quote);
    if (i >= 0) return [i, i + quote.length];
    var words = quote.trim().split(/\s+/).map(function (w) {
      return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/['’‘]/g, "['’‘]")
        .replace(/["“”]/g, "[\"“”]");
    });
    try {
      var m = new RegExp(words.join("\\s+"), "i").exec(text);
      return m ? [m.index, m.index + m[0].length] : null;
    } catch (e) { return null; }
  }

  function sampleNotes() {
    return SAMPLES.map(function (s) { return { id: uid(), title: s.title, text: s.text, codes: null }; });
  }

  /* ---------- state ---------- */
  var LAST_USER_KEY = "ethnocode.lastUser";
  var account = { enabled: false, client: null, user: null, pendingUser: null, timer: null, dirty: false, syncedAt: null, busy: false, mode: null, msg: null, msgKind: null };
  try { account.pendingUser = localStorage.getItem(LAST_USER_KEY); } catch (e) {}
  function storeKey() {
    if (account.user) return STORE_KEY + ":" + account.user.id;
    if (account.pendingUser) return STORE_KEY + ":" + account.pendingUser;
    return STORE_KEY;
  }

  function load(key) {
    try {
      var raw = localStorage.getItem(key || STORE_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !Array.isArray(d.notes)) return null;
      return d;
    } catch (e) { return null; }
  }

  function freshState() { return { notes: sampleNotes(), activeId: null, view: "notes", codebook: null, codebookStale: false }; }
  function normalize(d) {
    var st = d && Array.isArray(d.notes) ? d : freshState();
    if (!st.notes.length) st.notes = sampleNotes();
    if (!st.notes.some(function (n) { return n.id === st.activeId; })) st.activeId = st.notes[0].id;
    if (st.view !== "codebook") st.view = "notes";
    return st;
  }
  // A returning signed-in user sees their own saved copy straight away, while the account reconnects.
  var state = normalize(load(storeKey()));

  var ui = { loading: {}, errors: {}, editing: {}, pane: {}, cbLoading: false, cbError: null, armed: null };

  function setStatus(kind) {
    var el = $("#saved");
    var text = {
      local: "Saved in this browser",
      saving: "Saving to your account",
      synced: "Saved to your account",
      error: "Not synced yet, retrying",
      blocked: "Not saved: browser storage is blocked"
    }[kind];
    el.textContent = text;
    el.classList.toggle("warn", kind === "error" || kind === "blocked");
    el.classList.toggle("busy", kind === "saving");
  }

  function save() {
    state.savedAt = new Date().toISOString();
    var stored = true;
    try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch (e) { stored = false; }
    if (account.user) { account.dirty = true; queueSync(); setStatus("saving"); }
    else setStatus(stored ? "local" : "blocked");
  }

  function activeNote() {
    for (var i = 0; i < state.notes.length; i++) if (state.notes[i].id === state.activeId) return state.notes[i];
    return null;
  }
  function findNote(id) { return state.notes.filter(function (n) { return n.id === id; })[0] || null; }
  function findCode(note, codeId) { return note && note.codes ? note.codes.filter(function (c) { return c.id === codeId; })[0] || null : null; }

  function verifyStats(note) {
    var total = 0, found = 0;
    (note.codes || []).forEach(function (c) {
      c.quotes.forEach(function (q) { total++; if (locateQuote(note.text, q)) found++; });
    });
    return { total: total, found: found };
  }

  var toastTimer;
  function toast(msg) {
    var t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  /* ---------- Claude ---------- */
  function parseJSON(text) {
    var t = String(text || "").replace(/```json|```/g, "");
    var a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a < 0 || b < a) throw new Error("Claude's reply wasn't in the expected format. Try again.");
    return JSON.parse(t.slice(a, b + 1));
  }

  function callClaude(system, user, maxTokens) {
    return fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system: system, messages: [{ role: "user", content: user }] })
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = null;
        try { data = JSON.parse(raw); } catch (e) { data = null; }
        if (!res.ok) {
          var d = data && data.error ? (data.error.message || (typeof data.error === "string" ? data.error : "")) : "";
          if (res.status === 404 && !d) d = "the server file api/claude.js wasn't found. Check that it's in your GitHub repo inside a folder called api, then redeploy.";
          throw new Error("Request failed (" + res.status + ")" + (d ? ": " + d : ""));
        }
        var text = (data && data.content || []).filter(function (b) { return b.type === "text"; }).map(function (b) { return b.text; }).join("");
        return parseJSON(text);
      });
    });
  }

  var CODE_SYSTEM = "You are an experienced qualitative researcher doing open coding on ethnographic field notes and interview transcripts. You reply with JSON only, no other text.";
  function codePrompt(note) {
    return "Do open coding on the field note below.\n\n" +
      "Return JSON in exactly this shape:\n" +
      '{"codes":[{"name":"...","definition":"...","quotes":["...","..."]}]}\n\n' +
      "Rules:\n" +
      "- 4 to 7 codes that capture practices, relationships, meanings and tensions in the note.\n" +
      "- name: 2 to 4 words, sentence case, analytic rather than descriptive.\n" +
      "- definition: one sentence saying what the code captures in this note.\n" +
      "- quotes: 1 to 3 per code. Each quote must be copied character for character from the note: one continuous passage of 5 to 30 words, with no ellipses, no changes and no added quotation marks.\n\n" +
      "Field note title: " + note.title + "\n<note>\n" + note.text + "\n</note>";
  }

  var CB_SYSTEM = "You are an experienced qualitative researcher doing axial coding across a set of field notes. You reply with JSON only, no other text.";
  function cbPrompt(list) {
    var lines = list.map(function (x) { return x.key + " | " + x.code.name + " | " + x.code.definition + " | note: " + x.note.title; }).join("\n");
    return "Group these open codes from several field notes into themes.\n\n" +
      "Return JSON in exactly this shape:\n" +
      '{"themes":[{"name":"...","definition":"...","codeIds":["c1","c2"]}]}\n\n' +
      "Rules:\n" +
      "- 3 to 6 themes. Each theme should connect codes across notes where the data supports it.\n" +
      "- name: 2 to 5 words, sentence case. definition: one or two sentences.\n" +
      "- Put every code id in exactly one theme.\n\n" +
      "Codes (id | name | definition | note):\n" + lines;
  }

  function generate(noteId) {
    var note = findNote(noteId);
    if (!note || ui.loading[noteId]) return;
    if (wordCount(note.text) < 25) {
      ui.errors[noteId] = "Add at least a few sentences to this note before generating codes.";
      render();
      return;
    }
    ui.loading[noteId] = true;
    ui.pane[noteId] = "codes";
    delete ui.errors[noteId];
    render();
    callClaude(CODE_SYSTEM, codePrompt(note), 3000).then(function (out) {
      var codes = (out.codes || []).filter(function (c) { return c && c.name; }).map(function (c) {
        return {
          id: uid(),
          name: String(c.name).trim(),
          definition: String(c.definition || "").trim(),
          quotes: (Array.isArray(c.quotes) ? c.quotes : []).map(function (q) { return String(q).trim(); }).filter(Boolean)
        };
      });
      if (!codes.length) throw new Error("Claude didn't return any codes. Try again.");
      var n = findNote(noteId);
      if (!n) return;
      n.codes = codes;
      ui.editing[noteId] = false;
      ui.animate = true;
      if (state.codebook) state.codebookStale = true;
      save();
      var v = verifyStats(n);
      toast(plural(codes.length, "code", "codes") + " generated, " + v.found + " of " + v.total + " quotes verified");
    }).catch(function (e) {
      ui.errors[noteId] = e.message || "Something went wrong. Try again.";
    }).then(function () {
      delete ui.loading[noteId];
      render();
    });
  }

  function buildCodebook() {
    var list = [];
    state.notes.forEach(function (note) {
      (note.codes || []).forEach(function (code) { list.push({ key: "c" + (list.length + 1), note: note, code: code }); });
    });
    if (!list.length) return;
    ui.cbLoading = true;
    ui.cbError = null;
    render();
    callClaude(CB_SYSTEM, cbPrompt(list), 2500).then(function (out) {
      var byKey = {};
      list.forEach(function (x) { byKey[x.key] = x; });
      var used = {};
      var themes = (out.themes || []).filter(function (t) { return t && t.name; }).map(function (t) {
        var refs = (t.codeIds || []).filter(function (k) { return byKey[k] && !used[k]; }).map(function (k) {
          used[k] = true;
          return { noteId: byKey[k].note.id, codeId: byKey[k].code.id };
        });
        return { id: uid(), name: String(t.name).trim(), definition: String(t.definition || "").trim(), refs: refs };
      }).filter(function (t) { return t.refs.length; });
      var left = list.filter(function (x) { return !used[x.key]; });
      if (left.length) themes.push({ id: uid(), name: "Other codes", definition: "Codes that were not placed in a theme.", refs: left.map(function (x) { return { noteId: x.note.id, codeId: x.code.id }; }) });
      if (!themes.length) throw new Error("Claude didn't return any themes. Try again.");
      state.codebook = { themes: themes, builtAt: new Date().toISOString() };
      ui.animate = true;
      state.codebookStale = false;
      save();
      toast("Codebook built: " + plural(themes.length, "theme", "themes"));
    }).catch(function (e) {
      ui.cbError = e.message || "Something went wrong. Try again.";
    }).then(function () {
      ui.cbLoading = false;
      render();
    });
  }

  /* ---------- rendering ---------- */
  var ICON_CHECK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  var ICON_X = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
  var ICON_SPARK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5l1.6 4.3 4.4 1.7-4.4 1.7L8 13.5 6.4 9.2 2 7.5l4.4-1.7z" fill="currentColor"/></svg>';
  var ICON_DL = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8M4.5 6.5L8 10l3.5-3.5M3 13h10" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';

  function annotated(note) {
    var text = note.text || "";
    var ranges = [];
    (note.codes || []).forEach(function (c, ci) {
      c.quotes.forEach(function (q, qi) {
        var loc = locateQuote(text, q);
        if (loc) ranges.push({ s: loc[0], e: loc[1], color: COLORS[ci % COLORS.length], key: c.id + ":" + qi, name: c.name });
      });
    });
    ranges.sort(function (a, b) { return a.s - b.s; });
    var out = "", pos = 0;
    ranges.forEach(function (r) {
      if (r.s < pos) return;
      out += esc(text.slice(pos, r.s));
      out += '<mark class="hl" data-k="' + esc(r.key) + '" style="--hl:' + r.color + '" title="' + esc(r.name) + '">' + esc(text.slice(r.s, r.e)) + "</mark>";
      pos = r.e;
    });
    return out + esc(text.slice(pos));
  }

  function renderSidebar() {
    var items = state.notes.map(function (n) {
      var sub, dot = "dot";
      if (ui.loading[n.id]) { sub = "Generating codes"; dot += " busy"; }
      else if (n.codes) {
        var v = verifyStats(n);
        sub = plural(n.codes.length, "code", "codes") + ", " + v.found + "/" + v.total + " verified";
        dot += v.found === v.total ? " ok" : " warn";
      } else sub = "Not coded yet";
      return '<li><button type="button" class="note-item" data-action="open" data-id="' + n.id + '"' + (n.id === state.activeId && state.view === "notes" ? ' aria-current="true"' : "") + '>' +
        '<span class="t">' + esc(n.title || "Untitled note") + '</span><span class="s"><span class="' + dot + '"></span>' + esc(sub) + "</span></button></li>";
    }).join("");
    $("#sidebar").innerHTML =
      '<div class="side-actions">' +
      '<button type="button" class="btn btn-dark" data-action="new">New field note</button>' +
      '<button type="button" class="btn btn-line" data-action="import">Import .txt or .docx</button>' +
      "</div>" +
      '<div class="side-label">Field notes (' + state.notes.length + ")</div>" +
      '<ul class="note-list">' + items + "</ul>" +
      '<div class="side-foot">' + sideFootText() +
      '<button type="button" class="btn btn-quiet btn-danger" data-action="reset">' + (ui.armed === "reset" ? "Click again to reset" : "Reset to sample notes") + "</button></div>";
  }

  function renderTabs() {
    var codedCount = state.notes.filter(function (n) { return n.codes; }).length;
    $("#tab-notes").setAttribute("aria-current", state.view === "notes" ? "page" : "false");
    $("#tab-codebook").setAttribute("aria-current", state.view === "codebook" ? "page" : "false");
    $("#tab-notes").innerHTML = 'Notes <span class="count">' + state.notes.length + "</span>";
    $("#tab-codebook").innerHTML = "Codebook" + (state.codebook ? ' <span class="count">' + state.codebook.themes.length + "</span>" : codedCount ? "" : "");
  }

  function renderNote() {
    var note = activeNote();
    if (!note) {
      return '<div class="page"><div class="empty"><h3>No field notes yet</h3><p>Create a note, paste in your text, and generate codes.</p><button type="button" class="btn btn-primary" data-action="new">New field note</button></div></div>';
    }
    var loading = !!ui.loading[note.id];
    var editing = ui.editing[note.id] === true || !note.codes;
    var v = verifyStats(note);
    var meta = "<span><b>" + wordCount(note.text) + "</b> words</span>";
    if (note.codes) {
      meta += "<span><b>" + note.codes.length + "</b> codes</span>";
      meta += '<span class="' + (v.found === v.total ? "ok" : "bad") + '">' + v.found + " of " + v.total + " quotes verified in the text</span>";
    }
    var genLabel = loading ? '<span class="spinner" aria-hidden="true"></span>Generating codes' : ICON_SPARK + (note.codes ? "Regenerate codes" : "Generate codes");
    var head =
      '<div class="note-head"><div class="grow">' +
      '<label class="sr" for="title-input" hidden>Note title</label>' +
      '<input id="title-input" class="title-input" data-field="title" value="' + esc(note.title) + '" placeholder="Untitled note" aria-label="Note title">' +
      '<div class="meta" id="meta">' + meta + "</div></div>" +
      '<div class="note-actions">' +
      (note.codes ? '<button type="button" class="btn btn-line" data-action="toggle-edit">' + (editing ? "Show highlights" : "Edit text") + "</button>" : "") +
      '<button type="button" class="btn btn-quiet btn-danger" data-action="delete-note">' + (ui.armed === "del:" + note.id ? "Click again to delete" : "Delete") + "</button>" +
      '<button type="button" class="btn btn-primary" data-action="generate"' + (loading ? " disabled" : "") + ">" + genLabel + "</button>" +
      "</div></div>";

    var sheet;
    if (editing) {
      sheet = '<section class="sheet"><div class="sheet-head"><span>Field note text</span><span>Paste or type your note</span></div>' +
        '<textarea class="note-edit" data-field="text" aria-label="Field note text" placeholder="Paste a field note or interview transcript here.">' + esc(note.text) + "</textarea></section>";
    } else {
      var legend = note.codes.map(function (c, i) { return '<span style="--c:' + COLORS[i % COLORS.length] + '"><i></i>' + esc(c.name) + "</span>"; }).join("");
      sheet = '<section class="sheet"><div class="sheet-head"><span>Coded passages</span><span>Select a highlight to see its code</span></div>' +
        '<div class="legend">' + legend + '</div><div class="note-text" id="note-text">' + annotated(note) + "</div></section>";
    }

    var panel = '<section aria-labelledby="codes-h"><div class="panel-head"><h2 id="codes-h">Codes</h2>' +
      (note.codes ? "<span>Select a quote to find it in the note</span>" : "") + "</div>";
    if (ui.errors[note.id]) panel += '<div class="error" role="alert"><b>Couldn\'t generate codes</b>' + esc(ui.errors[note.id]) + "</div>";
    if (loading) {
      panel += '<div class="codes">' + [0, 1, 2].map(function () { return '<div class="skel"><i style="width:40%"></i><i style="width:90%"></i><i style="width:75%"></i></div>'; }).join("") + "</div>";
    } else if (!note.codes) {
      panel += '<div class="empty"><h3>No codes yet</h3><p>Claude will read this note and propose four to seven codes, each with a definition and quotes copied from your text. You can edit or delete any of them.</p>' +
        '<button type="button" class="btn btn-primary" data-action="generate">' + ICON_SPARK + "Generate codes</button></div>";
    } else {
      panel += '<div class="codes">' + note.codes.map(function (c, i) {
        var qs = c.quotes.map(function (q, qi) {
          var ok = !!locateQuote(note.text, q);
          return '<li><button type="button" class="quote' + (ok ? "" : " missing") + '" data-action="jump" data-code="' + c.id + '" data-q="' + qi + '"' +
            (ok ? "" : ' title="This exact wording isn\'t in the note. Check it before citing."') + ">“" + esc(q) + "”</button>" +
            (ok ? '<span class="badge ok">' + ICON_CHECK + "Verified</span>" : '<span class="badge bad">' + ICON_X + "Not in text</span>") +
            '<button type="button" class="icon-btn" data-action="del-quote" data-code="' + c.id + '" data-q="' + qi + '" aria-label="Remove this quote">' + ICON_X + "</button></li>";
        }).join("");
        return '<article class="code" style="--c:' + COLORS[i % COLORS.length] + '">' +
          '<div class="code-top"><input class="code-name" data-field="code-name" data-code="' + c.id + '" value="' + esc(c.name) + '" aria-label="Code name">' +
          '<button type="button" class="icon-btn" data-action="del-code" data-code="' + c.id + '" aria-label="Delete code ' + esc(c.name) + '">' + ICON_X + "</button></div>" +
          '<textarea class="code-def" rows="2" data-field="code-def" data-code="' + c.id + '" aria-label="Code definition">' + esc(c.definition) + "</textarea>" +
          (qs ? '<ul class="quotes">' + qs + "</ul>" : "") + "</article>";
      }).join("") + "</div>";
    }
    panel += "</section>";
    var pane = ui.pane[note.id] || "text";
    var sw = '<div class="pane-switch" role="tablist" aria-label="Show">' +
      '<button type="button" role="tab" data-action="pane" data-pane="text" aria-selected="' + (pane === "text") + '">Note</button>' +
      '<button type="button" role="tab" data-action="pane" data-pane="codes" aria-selected="' + (pane === "codes") + '">Codes' + (note.codes ? ' <span class="count">' + note.codes.length + "</span>" : "") + "</button></div>";
    return '<div class="page">' + head + sw + '<div class="note-grid" data-pane="' + pane + '">' + sheet + panel + "</div></div>";
  }

  function renderCodebook() {
    var coded = state.notes.filter(function (n) { return n.codes && n.codes.length; });
    var totalCodes = coded.reduce(function (a, n) { return a + n.codes.length; }, 0);
    var cb = state.codebook;
    var html = '<div class="page"><div class="cb-head"><div><h1>Codebook</h1>' +
      "<p>Codes from all your coded notes, grouped into themes by Claude. Every quote still links back to its note.</p></div>" +
      '<div class="note-actions">' +
      (cb ? '<div class="exports"><button type="button" class="btn btn-line" data-action="export" data-fmt="doc">' + ICON_DL + 'Word</button><button type="button" class="btn btn-line" data-action="export" data-fmt="csv">' + ICON_DL + 'CSV</button><button type="button" class="btn btn-line" data-action="export" data-fmt="md">' + ICON_DL + "Markdown</button></div>" : "") +
      '<button type="button" class="btn btn-primary" data-action="build"' + (ui.cbLoading || !totalCodes ? " disabled" : "") + ">" +
      (ui.cbLoading ? '<span class="spinner" aria-hidden="true"></span>Building codebook' : ICON_SPARK + (cb ? "Rebuild codebook" : "Build codebook")) + "</button></div></div>";

    if (ui.cbError) html += '<div class="error" role="alert"><b>Couldn\'t build the codebook</b>' + esc(ui.cbError) + "</div>";
    if (cb && state.codebookStale && !ui.cbLoading) html += '<div class="notice"><span>Your codes have changed since this codebook was built.</span><button type="button" class="btn btn-dark" data-action="build">Rebuild codebook</button></div>';

    if (ui.cbLoading && !cb) {
      html += '<div class="themes">' + [0, 1, 2].map(function () { return '<div class="skel"><i style="width:30%"></i><i style="width:80%"></i><i style="width:100%;height:8px"></i></div>'; }).join("") + "</div>";
    } else if (!cb) {
      html += '<div class="empty"><h3>' + (totalCodes ? "Ready to build your codebook" : "Code a note first") + "</h3><p>" +
        (totalCodes ? "You have " + plural(totalCodes, "code", "codes") + " across " + plural(coded.length, "note", "notes") + ". Claude will group them into three to six themes." + (coded.length < 2 ? " Coding at least two notes gives better themes." : "")
          : "Open a field note and generate codes. The codebook groups codes from all your notes into shared themes.") + "</p>" +
        (totalCodes ? '<button type="button" class="btn btn-primary" data-action="build">' + ICON_SPARK + "Build codebook</button>" : '<button type="button" class="btn btn-dark" data-action="view" data-view="notes">Go to notes</button>') + "</div>";
    } else {
      var themes = cb.themes.map(function (t) {
        var codes = t.refs.map(function (r) { var n = findNote(r.noteId); var c = findCode(n, r.codeId); return c ? { note: n, code: c } : null; }).filter(Boolean);
        var quotes = codes.reduce(function (a, x) { return a + x.code.quotes.length; }, 0);
        var notes = {}; codes.forEach(function (x) { notes[x.note.id] = 1; });
        return { t: t, codes: codes, quotes: quotes, notes: Object.keys(notes).length };
      }).filter(function (x) { return x.codes.length; });
      var max = Math.max.apply(null, themes.map(function (x) { return x.quotes; }).concat([1]));
      var tq = themes.reduce(function (a, x) { return a + x.quotes; }, 0);
      html += '<div class="cb-stats"><span><b>' + themes.length + "</b> themes</span><span><b>" + themes.reduce(function (a, x) { return a + x.codes.length; }, 0) + "</b> codes</span><span><b>" + tq + "</b> quotes</span><span><b>" + coded.length + "</b> coded notes</span></div>";
      html += '<div class="themes">' + themes.map(function (x, ti) {
        var body = x.codes.map(function (y) {
          var qs = y.code.quotes.map(function (q, qi) {
            var ok = !!locateQuote(y.note.text, q);
            return '<li><button type="button" class="quote' + (ok ? "" : " missing") + '" data-action="jump" data-note="' + y.note.id + '" data-code="' + y.code.id + '" data-q="' + qi + '">“' + esc(q) + "”</button>" +
              (ok ? '<span class="badge ok">' + ICON_CHECK + "Verified</span>" : '<span class="badge bad">' + ICON_X + "Not in text</span>") + "</li>";
          }).join("");
          return '<div class="tcode"><div class="tcode-top"><b>' + esc(y.code.name) + '</b><button type="button" class="link-btn" data-action="open" data-id="' + y.note.id + '">' + esc(y.note.title) + "</button></div>" +
            (y.code.definition ? "<p>" + esc(y.code.definition) + "</p>" : "") + (qs ? '<ul class="quotes">' + qs + "</ul>" : "") + "</div>";
        }).join("");
        return '<details class="theme"' + (ti === 0 ? " open" : "") + "><summary><div><h2>" + esc(x.t.name) + '<span class="chev" aria-hidden="true">›</span></h2>' +
          (x.t.definition ? '<p class="def">' + esc(x.t.definition) + "</p>" : "") + "</div>" +
          '<div class="nums"><b>' + x.codes.length + "</b> codes<br>" + plural(x.quotes, "quote", "quotes") + ", " + plural(x.notes, "note", "notes") + "</div>" +
          '<div class="bar" aria-hidden="true"><i style="width:' + Math.round((x.quotes / max) * 100) + '%"></i></div></summary>' +
          '<div class="theme-body">' + body + "</div></details>";
      }).join("") + "</div>";
    }
    return html + "</div>";
  }

  var lastKey = null;
  function render() {
    renderTabs();
    renderSidebar();
    var main = $("#main");
    var scroll = window.scrollY;
    main.innerHTML = state.view === "codebook" ? renderCodebook() : renderNote();
    var key = state.view + ":" + (state.view === "notes" ? state.activeId : "");
    var page = main.querySelector(".page");
    if (key !== lastKey) { if (page) page.classList.add("enter"); lastKey = key; }
    else if (!ui.animate) main.querySelectorAll(".code,.theme").forEach(function (el) { el.style.animation = "none"; });
    ui.animate = false;
    window.scrollTo(0, scroll);
    document.title = (state.view === "codebook" ? "Codebook" : (activeNote() ? activeNote().title || "Untitled note" : "Workspace")) + " – EthnoCode";
  }

  function updateMetaOnly() {
    var note = activeNote(); if (!note) return;
    var m = $("#meta"); if (!m) return;
    var v = verifyStats(note);
    var meta = "<span><b>" + wordCount(note.text) + "</b> words</span>";
    if (note.codes) {
      meta += "<span><b>" + note.codes.length + "</b> codes</span>";
      meta += '<span class="' + (v.found === v.total ? "ok" : "bad") + '">' + v.found + " of " + v.total + " quotes verified in the text</span>";
    }
    m.innerHTML = meta;
  }

  /* ---------- actions ---------- */
  function jump(noteId, codeId, qi) {
    var note = findNote(noteId); if (!note) return;
    var code = findCode(note, codeId);
    if (!code || !locateQuote(note.text, code.quotes[qi])) {
      toast("This exact wording isn't in the note, so it can't be shown");
      return;
    }
    state.activeId = noteId;
    state.view = "notes";
    ui.editing[noteId] = false;
    ui.pane[noteId] = "text";
    save();
    render();
    var el = document.querySelector('mark.hl[data-k="' + codeId + ":" + qi + '"]');
    if (!el) { toast("This passage overlaps another highlight"); return; }
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }

  function arm(key) {
    if (ui.armed === key) return true;
    ui.armed = key;
    render();
    setTimeout(function () { if (ui.armed === key) { ui.armed = null; render(); } }, 3500);
    return false;
  }

  function newNote(title, text) {
    var n = { id: uid(), title: title || "Untitled note", text: text || "", codes: null };
    state.notes.push(n);
    state.activeId = n.id;
    state.view = "notes";
    ui.editing[n.id] = true;
    save();
    render();
    return n;
  }

  var mammothLoading = null;
  function loadMammoth() {
    if (window.mammoth) return Promise.resolve(window.mammoth);
    if (mammothLoading) return mammothLoading;
    mammothLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
      s.onload = function () { resolve(window.mammoth); };
      s.onerror = function () { mammothLoading = null; reject(new Error("Couldn't load the Word reader. Check your connection and try again.")); };
      document.head.appendChild(s);
    });
    return mammothLoading;
  }

  function importFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    var added = 0;
    var chain = Promise.resolve();
    list.forEach(function (f) {
      chain = chain.then(function () {
        var name = f.name.replace(/\.[^.]+$/, "");
        var lower = f.name.toLowerCase();
        if (/\.(txt|md)$/.test(lower)) return f.text().then(function (t) { newNote(name, t.trim()); added++; });
        if (/\.docx$/.test(lower)) {
          return loadMammoth().then(function (m) { return f.arrayBuffer().then(function (buf) { return m.extractRawText({ arrayBuffer: buf }); }); })
            .then(function (r) { newNote(name, (r.value || "").trim()); added++; });
        }
        toast(f.name + " isn't a .txt, .md or .docx file");
      }).catch(function (e) { toast("Couldn't import " + f.name + ": " + e.message); });
    });
    chain.then(function () {
      if (added) { ui.editing[state.activeId] = true; render(); toast(plural(added, "note", "notes") + " imported"); }
      $("#fileInput").value = "";
    });
  }

  /* ---------- export ---------- */
  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function csvCell(v) { var s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  function exportCodebook(fmt) {
    var cb = state.codebook; if (!cb) return;
    var rows = [];
    cb.themes.forEach(function (t) {
      t.refs.forEach(function (r) {
        var n = findNote(r.noteId), c = findCode(n, r.codeId);
        if (c) rows.push({ t: t, n: n, c: c });
      });
    });
    var stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "csv") {
      var out = [["Theme", "Theme definition", "Code", "Code definition", "Note", "Quote", "Verified in text"]];
      rows.forEach(function (x) {
        (x.c.quotes.length ? x.c.quotes : [""]).forEach(function (q) {
          out.push([x.t.name, x.t.definition, x.c.name, x.c.definition, x.n.title, q, q ? (locateQuote(x.n.text, q) ? "yes" : "no") : ""]);
        });
      });
      download("ethnocode-codebook-" + stamp + ".csv", "﻿" + out.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n"), "text/csv");
    } else if (fmt === "md") {
      var md = "# Codebook\n\n_Exported from EthnoCode on " + stamp + "_\n\n";
      cb.themes.forEach(function (t) {
        md += "## " + t.name + "\n\n" + (t.definition ? t.definition + "\n\n" : "");
        rows.filter(function (x) { return x.t === t; }).forEach(function (x) {
          md += "### " + x.c.name + " (" + x.n.title + ")\n\n" + (x.c.definition ? x.c.definition + "\n\n" : "");
          x.c.quotes.forEach(function (q) { md += "> " + q + (locateQuote(x.n.text, q) ? "" : " _(not found in note)_") + "\n\n"; });
        });
      });
      download("ethnocode-codebook-" + stamp + ".md", md, "text/markdown");
    } else {
      var body = cb.themes.map(function (t, i) {
        var codes = rows.filter(function (x) { return x.t === t; }).map(function (x) {
          return "<h3>" + esc(x.c.name) + ' <span style="font-weight:normal;color:#5b4a70">(' + esc(x.n.title) + ")</span></h3>" +
            (x.c.definition ? "<p>" + esc(x.c.definition) + "</p>" : "") +
            x.c.quotes.map(function (q) {
              return '<p style="margin:4px 0 4px 18px;border-left:3px solid #993bff;padding-left:10px;font-style:italic">“' + esc(q) + "”" +
                (locateQuote(x.n.text, q) ? "" : ' <span style="color:#a3352a;font-style:normal">[not found in note]</span>') + "</p>";
            }).join("");
        }).join("");
        return '<h2 style="color:#361a54">' + (i + 1) + ". " + esc(t.name) + "</h2>" + (t.definition ? "<p><i>" + esc(t.definition) + "</i></p>" : "") + codes;
      }).join("");
      var html = '<html><head><meta charset="utf-8"><title>Codebook</title></head><body style="font-family:Calibri,Arial,sans-serif;color:#222">' +
        '<h1 style="color:#361a54">Codebook</h1><p style="color:#5b4a70">Exported from EthnoCode on ' + stamp + "</p>" + body + "</body></html>";
      download("ethnocode-codebook-" + stamp + ".doc", html, "application/msword");
    }
    toast("Codebook exported");
  }


  /* ---------- accounts (Supabase) ---------- */
  var SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";

  function sideFootText() {
    if (account.user) return "<span>Saved to your account as <b>" + esc(account.user.email || "") + "</b>. Text is sent to Claude only when you generate codes.</span>";
    if (account.enabled) return '<span>Notes are saved in this browser. <button type="button" class="link-btn" data-action="auth-open" data-mode="signup">Create a free account</button> to keep them across devices.</span>';
    return "<span>Notes stay in this browser. Text is sent to Claude only when you generate codes.</span>";
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("Couldn't load the sign-in library")); };
      document.head.appendChild(s);
    });
  }

  function initAccounts() {
    fetch("/api/config").then(function (r) { return r.ok ? r.json() : null; }).then(function (cfg) {
      if (cfg && cfg.problem && window.console) console.warn("EthnoCode accounts are off: " + cfg.problem);
      if (!cfg || !cfg.accounts) return;
      return loadScript(SUPABASE_JS).then(function () {
        account.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        account.enabled = true;
        renderAccount(); renderSidebar();
        account.client.auth.onAuthStateChange(function (event, session) {
          // Run outside the callback: the library advises against awaiting its calls in here.
          setTimeout(function () { handleAuth(event, session); }, 0);
        });
      });
    }).catch(function () { /* accounts unavailable: the workspace keeps working locally */ });
  }

  function handleAuth(event, session) {
    if (event === "PASSWORD_RECOVERY") { openAuth("reset"); }
    var user = session && session.user;
    if (!user && account.pendingUser) {
      // The saved session has ended: go back to this browser's own notes.
      account.pendingUser = null;
      try { localStorage.removeItem(LAST_USER_KEY); } catch (e) {}
      state = normalize(load(STORE_KEY)); lastKey = null; render(); setStatus("local");
    }
    if (user && (!account.user || account.user.id !== user.id)) onSignedIn(user);
    else if (!user && account.user) onSignedOut();
    else renderAccount();
  }

  function isUntouchedSample(n) {
    return !n.codes && SAMPLES.some(function (s) { return s.title === n.title && s.text === n.text; });
  }

  function onSignedIn(user) {
    var fromCache = account.pendingUser === user.id;
    // Never mix another account's cached notes into this one.
    var guest = (account.pendingUser && !fromCache) ? normalize(load(STORE_KEY)) : state;
    account.pendingUser = null;
    try { localStorage.setItem(LAST_USER_KEY, user.id); } catch (e) {}
    account.user = user;
    account.dirty = false;
    setStatus("saving");
    renderAccount();
    account.client.from("workspaces").select("data, updated_at").eq("user_id", user.id).maybeSingle().then(function (res) {
      if (res.error) throw res.error;
      var remote = res.data && res.data.data && Array.isArray(res.data.data.notes) ? res.data.data : null;
      var added = 0, merged, pushCache = false;
      if (fromCache) {
        // This browser's copy of the account. Keep whichever is newer; edits made offline get uploaded.
        if (remote && !(guest.savedAt && guest.savedAt > res.data.updated_at)) merged = remote;
        else { merged = guest; pushCache = true; }
        if (remote) account.syncedAt = res.data.updated_at;
      } else if (remote) {
        merged = remote;
        var ids = {};
        merged.notes.forEach(function (n) { ids[n.id] = 1; });
        guest.notes.forEach(function (n) {
          if (!ids[n.id] && !isUntouchedSample(n)) { merged.notes.push(n); added++; }
        });
        account.syncedAt = res.data.updated_at;
      } else {
        merged = guest;
      }
      state = normalize(merged);
      ui = { loading: {}, errors: {}, editing: {}, pane: {}, cbLoading: false, cbError: null, armed: null };
      try { localStorage.setItem(storeKey(), JSON.stringify(state)); if (!fromCache) localStorage.removeItem(STORE_KEY); } catch (e) {}
      lastKey = null;
      render(); renderAccount();
      if (!remote || added || pushCache) { account.dirty = true; pushNow(); } else setStatus("synced");
      if (fromCache) return;
      closeAuth();
      toast(added ? plural(added, "note", "notes") + " from this browser added to your account" : remote ? "Welcome back. Your work is loaded." : "Signed in. Your work is now saved to your account.");
    }).catch(function (e) {
      setStatus("error");
      toast("Couldn't load your saved work: " + (e.message || "unknown error"));
    });
  }

  function onSignedOut() {
    clearTimeout(account.timer);
    account.user = null; account.pendingUser = null; account.dirty = false; account.syncedAt = null;
    try { localStorage.removeItem(LAST_USER_KEY); } catch (e) {}
    state = normalize(load(STORE_KEY));
    ui = { loading: {}, errors: {}, editing: {}, pane: {}, cbLoading: false, cbError: null, armed: null };
    lastKey = null;
    render(); renderAccount(); setStatus("local");
  }

  function queueSync() {
    clearTimeout(account.timer);
    account.timer = setTimeout(pushNow, 1200);
  }

  function pushNow() {
    if (!account.user || !account.client) return;
    var stamp = new Date().toISOString();
    var uidNow = account.user.id;
    account.client.from("workspaces").upsert({ user_id: uidNow, data: state, updated_at: stamp }).then(function (res) {
      if (!account.user || account.user.id !== uidNow) return;
      if (res.error) { setStatus("error"); clearTimeout(account.timer); account.timer = setTimeout(pushNow, 5000); return; }
      account.dirty = false; account.syncedAt = stamp; setStatus("synced");
    }, function () { setStatus("error"); account.timer = setTimeout(pushNow, 5000); });
  }

  // Pick up changes made on another device when this tab comes back into focus.
  window.addEventListener("focus", function () {
    if (!account.user || account.dirty) return;
    account.client.from("workspaces").select("data, updated_at").eq("user_id", account.user.id).maybeSingle().then(function (res) {
      if (res.error || !res.data || !res.data.data || account.dirty) return;
      if (account.syncedAt && res.data.updated_at <= account.syncedAt) return;
      account.syncedAt = res.data.updated_at;
      state = normalize(res.data.data);
      try { localStorage.setItem(storeKey(), JSON.stringify(state)); } catch (e) {}
      render(); toast("Updated with changes from another device");
    });
  });

  function signOut() {
    if (!account.client) return;
    var finish = function () { closeAuth(); onSignedOut(); toast("Signed out"); };
    if (account.dirty) pushNow();
    account.client.auth.signOut().then(finish, finish);
  }

  function renderAccount() {
    var box = $("#account");
    if (!box) return;
    if (!account.enabled) { box.innerHTML = ""; return; }
    if (account.user) {
      var email = account.user.email || "";
      box.innerHTML = '<button type="button" class="acct-btn" data-action="auth-open" data-mode="account" aria-label="Account: ' + esc(email) + '"><span class="avatar">' + esc((email[0] || "?").toUpperCase()) + '</span><span class="acct-email">' + esc(email) + "</span></button>";
    } else {
      box.innerHTML = '<button type="button" class="btn btn-signin" data-action="auth-open" data-mode="signin">Sign in</button>';
    }
  }

  /* auth dialog */
  function openAuth(mode) {
    var d = $("#authDialog");
    if (!d || !account.enabled) return;
    account.msg = null; account.msgKind = null;
    setAuthMode(mode);
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute("open", ""); }
    var first = d.querySelector("input");
    if (first) first.focus();
  }
  function closeAuth() { var d = $("#authDialog"); if (d && d.open) { if (d.close) d.close(); else d.removeAttribute("open"); } }
  function setAuthMode(mode) { account.mode = mode; account.msg = null; account.msgKind = null; renderAuth(); }

  function authMessage() {
    return account.msg ? '<p class="auth-msg ' + (account.msgKind || "") + '" role="status">' + esc(account.msg) + "</p>" : "";
  }

  function renderAuth() {
    var d = $("#authDialog"); if (!d) return;
    var m = account.mode, html;
    var close = '<button type="button" class="auth-x" data-action="auth-close" aria-label="Close">' + ICON_X + "</button>";
    var busy = account.busy ? " disabled" : "";
    if (m === "account") {
      html = close + '<h2 id="auth-title">Your account</h2>' +
        '<p class="auth-lead">Signed in as <b>' + esc(account.user ? account.user.email : "") + "</b>. Your notes and codebook are saved to your account and sync across your devices.</p>" +
        '<div class="auth-actions"><button type="button" class="btn btn-line" data-action="auth-close">Close</button><button type="button" class="btn btn-dark" data-action="sign-out">Sign out</button></div>';
    } else if (m === "forgot") {
      html = close + '<h2 id="auth-title">Reset your password</h2><p class="auth-lead">Enter your email and we’ll send you a link to choose a new password.</p>' + authMessage() +
        '<form data-auth="forgot"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required>' +
        '<button type="submit" class="btn btn-primary auth-submit"' + busy + ">Send reset link</button></form>" +
        '<p class="auth-switch"><button type="button" class="link-btn" data-action="auth-mode" data-mode="signin">Back to sign in</button></p>';
    } else if (m === "reset") {
      html = close + '<h2 id="auth-title">Choose a new password</h2>' + authMessage() +
        '<form data-auth="reset"><label for="auth-password">New password</label><input id="auth-password" name="password" type="password" autocomplete="new-password" minlength="8" required>' +
        '<p class="auth-hint">At least 8 characters.</p><button type="submit" class="btn btn-primary auth-submit"' + busy + ">Save new password</button></form>";
    } else {
      var up = m === "signup";
      html = close + '<h2 id="auth-title">' + (up ? "Create your account" : "Sign in") + "</h2>" +
        '<p class="auth-lead">' + (up ? "Save your notes and codebook to your account and pick up where you left off on any device." : "Welcome back. Sign in to load your saved notes.") + "</p>" +
        '<div class="auth-tabs" role="tablist"><button type="button" role="tab" data-action="auth-mode" data-mode="signin" aria-selected="' + !up + '">Sign in</button><button type="button" role="tab" data-action="auth-mode" data-mode="signup" aria-selected="' + up + '">Create account</button></div>' +
        authMessage() +
        '<form data-auth="' + m + '"><label for="auth-email">Email</label><input id="auth-email" name="email" type="email" autocomplete="email" required>' +
        '<label for="auth-password">Password</label><input id="auth-password" name="password" type="password" autocomplete="' + (up ? "new-password" : "current-password") + '" minlength="' + (up ? 8 : 1) + '" required>' +
        (up ? '<p class="auth-hint">At least 8 characters.</p>' : '<p class="auth-hint"><button type="button" class="link-btn" data-action="auth-mode" data-mode="forgot">Forgot your password?</button></p>') +
        '<button type="submit" class="btn btn-primary auth-submit"' + busy + ">" + (account.busy ? '<span class="spinner" aria-hidden="true"></span>' : "") + (up ? "Create account" : "Sign in") + "</button></form>" +
        (up ? '<p class="auth-fine">Your notes are private to your account. Text is sent to Claude only when you choose to generate codes.</p>' : "");
    }
    var keepEmail = d.querySelector("#auth-email") ? d.querySelector("#auth-email").value : "";
    d.innerHTML = '<div class="auth-card">' + html + "</div>";
    if (keepEmail && d.querySelector("#auth-email")) d.querySelector("#auth-email").value = keepEmail;
  }

  function friendlyAuthError(e) {
    var msg = (e && e.message) || "Something went wrong. Try again.";
    if (/invalid login credentials/i.test(msg)) return "That email and password don’t match an account.";
    if (/email not confirmed/i.test(msg)) return "Confirm your email first. Check your inbox for the link we sent.";
    if (/already registered|already exists/i.test(msg)) return "An account with this email already exists. Sign in instead.";
    if (/password should be at least/i.test(msg)) return "Use a password with at least 8 characters.";
    if (/rate limit|too many/i.test(msg)) return "Too many attempts. Wait a minute and try again.";
    return msg;
  }

  document.addEventListener("submit", function (e) {
    var form = e.target.closest && e.target.closest("form[data-auth]");
    if (!form) return;
    e.preventDefault();
    if (account.busy || !account.client) return;
    var kind = form.getAttribute("data-auth");
    var email = form.email ? form.email.value.trim() : "";
    var password = form.password ? form.password.value : "";
    var auth = account.client.auth;
    var redirect = location.origin + "/app.html";
    var done = function (msg, kindOfMsg) {
      account.busy = false; account.msg = msg; account.msgKind = kindOfMsg || "";
      renderAuth();
    };
    account.busy = true; account.msg = null; renderAuth();
    var p;
    if (kind === "signin") p = auth.signInWithPassword({ email: email, password: password }).then(function (r) { if (r.error) throw r.error; account.busy = false; });
    else if (kind === "signup") p = auth.signUp({ email: email, password: password, options: { emailRedirectTo: redirect } }).then(function (r) {
      if (r.error) throw r.error;
      if (r.data && r.data.user && Array.isArray(r.data.user.identities) && !r.data.user.identities.length) throw new Error("already registered");
      if (!r.data.session) { account.mode = "signin"; done("Check your inbox at " + email + " and click the link to confirm your account. Then sign in here.", "ok"); }
      else account.busy = false;
    });
    else if (kind === "forgot") p = auth.resetPasswordForEmail(email, { redirectTo: redirect }).then(function (r) {
      if (r.error) throw r.error;
      done("If an account exists for " + email + ", we’ve sent a link to reset your password.", "ok");
    });
    else if (kind === "reset") p = auth.updateUser({ password: password }).then(function (r) {
      if (r.error) throw r.error;
      account.busy = false; closeAuth(); toast("Password updated");
    });
    p.catch(function (err) { done(friendlyAuthError(err), "bad"); });
  });

  /* ---------- events ---------- */
  document.addEventListener("click", function (e) {
    var mk = e.target.closest("mark.hl");
    if (mk) {
      var parts = mk.getAttribute("data-k").split(":");
      var cd = findCode(activeNote(), parts[0]);
      if (cd) toast("Code: " + cd.name);
      return;
    }
    var b = e.target.closest("[data-action]");
    if (!b) return;
    var a = b.getAttribute("data-action");
    var note = activeNote();
    if (a === "view") { state.view = b.getAttribute("data-view"); save(); render(); $("#main").focus({ preventScroll: true }); }
    else if (a === "open") { state.activeId = b.getAttribute("data-id"); state.view = "notes"; save(); render(); window.scrollTo(0, 0); }
    else if (a === "new") { newNote(); var t = $(".note-edit"); if (t) t.focus(); }
    else if (a === "import") { $("#fileInput").click(); }
    else if (a === "generate" && note) { generate(note.id); }
    else if (a === "toggle-edit" && note) { ui.editing[note.id] = !(ui.editing[note.id] === true); render(); }
    else if (a === "delete-note" && note) {
      if (!arm("del:" + note.id)) return;
      ui.armed = null;
      state.notes = state.notes.filter(function (n) { return n.id !== note.id; });
      state.activeId = state.notes.length ? state.notes[0].id : null;
      if (state.codebook) state.codebookStale = true;
      save(); render(); toast("Note deleted");
    }
    else if (a === "reset") {
      if (!arm("reset")) return;
      ui.armed = null;
      state = { notes: sampleNotes(), activeId: null, view: "notes", codebook: null, codebookStale: false };
      state.activeId = state.notes[0].id;
      ui = { loading: {}, errors: {}, editing: {}, pane: {}, cbLoading: false, cbError: null, armed: null };
      save(); render(); toast("Workspace reset to the sample notes");
    }
    else if (a === "del-code" && note) {
      note.codes = note.codes.filter(function (c) { return c.id !== b.getAttribute("data-code"); });
      if (!note.codes.length) note.codes = null;
      if (state.codebook) state.codebookStale = true;
      save(); render();
    }
    else if (a === "del-quote" && note) {
      var c = findCode(note, b.getAttribute("data-code"));
      if (c) { c.quotes.splice(+b.getAttribute("data-q"), 1); save(); render(); }
    }
    else if (a === "jump") { jump(b.getAttribute("data-note") || (note && note.id), b.getAttribute("data-code"), +b.getAttribute("data-q")); }
    else if (a === "build") { buildCodebook(); }
    else if (a === "pane" && note) { ui.pane[note.id] = b.getAttribute("data-pane"); render(); }
    else if (a === "export") { exportCodebook(b.getAttribute("data-fmt")); }
    else if (a === "auth-open") { openAuth(b.getAttribute("data-mode") || "signin"); }
    else if (a === "auth-mode") { setAuthMode(b.getAttribute("data-mode")); }
    else if (a === "auth-close") { closeAuth(); }
    else if (a === "sign-out") { signOut(); }
  });

  document.addEventListener("input", function (e) {
    var f = e.target.getAttribute && e.target.getAttribute("data-field");
    var note = activeNote();
    if (!f || !note) return;
    if (f === "title") { note.title = e.target.value; save(); renderSidebar(); }
    else if (f === "text") { note.text = e.target.value; save(); updateMetaOnly(); renderSidebar(); }
    else if (f === "code-name" || f === "code-def") {
      var c = findCode(note, e.target.getAttribute("data-code"));
      if (!c) return;
      if (f === "code-name") c.name = e.target.value; else c.definition = e.target.value;
      save();
    }
  });
  document.addEventListener("change", function (e) {
    var f = e.target.getAttribute && e.target.getAttribute("data-field");
    if (f === "code-name") renderSidebar();
  });
  $("#fileInput").addEventListener("change", function (e) { importFiles(e.target.files); });

  window.addEventListener("storage", function (e) {
    if (e.key === storeKey() && e.newValue) { var d = load(storeKey()); if (d) { state = normalize(d); render(); } }
  });

  if (document.documentElement.classList.contains("vt-fallback") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.addEventListener("click", function (e) {
      var l = e.target.closest("a[href]");
      if (!l || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || l.target === "_blank") return;
      var href = l.getAttribute("href");
      if (!href || href.charAt(0) === "#" || /^(https?:|mailto:|tel:)/.test(href)) return;
      e.preventDefault();
      document.body.classList.add("leaving");
      setTimeout(function () { location.href = l.href; }, 280);
    });
    window.addEventListener("pageshow", function () { document.body.classList.remove("leaving"); });
  }

  render();
  save();
  initAccounts();
})();
