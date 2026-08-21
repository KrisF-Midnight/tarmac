/* ---------------------------------------------------------------------------
   Shared page script for the field guide.

   Two jobs, in this order:

     1. Apply the reader's stored theme to <html> before anything paints, so a
        dark-mode reader never sees a white flash.
     2. Render the <pre class="mermaid"> diagrams in the book's own palette, and
        re-render them when the theme is toggled.

   Plain ES5-ish IIFE on purpose: no modules, no build step, works from
   file://. Everything is guarded — a page with no diagrams and no toggle
   button must load without throwing.
--------------------------------------------------------------------------- */

(function () {
  'use strict';

  var STORAGE_KEY = 'fg-theme';
  var root = document.documentElement;

  /* --- theme ------------------------------------------------------------- */

  function readStored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function writeStored(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* private mode */ }
  }

  /* Applied immediately, not on DOMContentLoaded — this is the anti-flash bit. */
  var stored = readStored();
  if (stored === 'light' || stored === 'dark') {
    root.setAttribute('data-theme', stored);
  }

  function prefersDark() {
    return !!(window.matchMedia &&
              window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* The theme actually in force: the explicit stamp if there is one, else what
     the operating system asked for. */
  function effectiveTheme() {
    var attr = root.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    return prefersDark() ? 'dark' : 'light';
  }

  /* --- palette ------------------------------------------------------------
     Hex values are lifted verbatim from book.css (:root and the
     :root[data-theme="dark"] override) so the diagrams sit in the same palette
     as the prose. If a token changes there it must change here too.
  ------------------------------------------------------------------------- */

  var PALETTE = {
    light: {
      ground:     '#F1F0EB',
      surface:    '#FBFAF6',
      surfaceAlt: '#E9E7E0',
      ink:        '#15181B',
      inkSoft:    '#576169',
      inkFaint:   '#8B939A',
      rule:       '#D8D5CC',
      ruleStrong: '#B9B5A9',
      accent:     '#8A6604',
      accentMark: '#E9B824',
      accentWash: '#FAF0D2',
      dark: false
    },
    dark: {
      ground:     '#131719',
      surface:    '#1A1F22',
      surfaceAlt: '#22282C',
      ink:        '#E7E5DF',
      inkSoft:    '#9BA5AC',
      inkFaint:   '#6B757C',
      rule:       '#2C3338',
      ruleStrong: '#3E474D',
      accent:     '#E9B824',
      accentMark: '#E9B824',
      accentWash: '#2A2415',
      dark: true
    }
  };

  var MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, ' +
             '"Liberation Mono", monospace';

  /* Flat, quiet look: surface-coloured fills, --rule-strong borders, --ink
     text, --accent reserved for the one node a diagram wants to emphasise
     (reachable from the diagram source as `classDef`/`class ... accent`). */
  function mermaidConfig(name) {
    var p = PALETTE[name] || PALETTE.light;
    return {
      startOnLoad: false,
      securityLevel: 'strict',
      /* 'base' is the only stock theme meant to be driven entirely by
         themeVariables; darkMode tells mermaid which way to derive anything we
         have not named explicitly. */
      theme: 'base',
      fontFamily: MONO,
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 12 },
      sequence: { useMaxWidth: true, mirrorActors: false, wrap: true },
      themeVariables: {
        darkMode: p.dark,
        background: p.surface,
        fontFamily: MONO,
        fontSize: '13px',

        primaryColor: p.surfaceAlt,
        primaryTextColor: p.ink,
        primaryBorderColor: p.ruleStrong,

        secondaryColor: p.accentWash,
        secondaryTextColor: p.ink,
        secondaryBorderColor: p.accentMark,

        tertiaryColor: p.surface,
        tertiaryTextColor: p.inkSoft,
        tertiaryBorderColor: p.rule,

        lineColor: p.inkFaint,
        textColor: p.ink,
        mainBkg: p.surfaceAlt,
        nodeBorder: p.ruleStrong,
        nodeTextColor: p.ink,

        clusterBkg: p.ground,
        clusterBorder: p.rule,
        titleColor: p.inkSoft,
        edgeLabelBackground: p.surface,

        /* sequence diagrams */
        actorBkg: p.surfaceAlt,
        actorBorder: p.ruleStrong,
        actorTextColor: p.ink,
        actorLineColor: p.rule,
        signalColor: p.inkSoft,
        signalTextColor: p.inkSoft,
        labelBoxBkgColor: p.surfaceAlt,
        labelBoxBorderColor: p.ruleStrong,
        labelTextColor: p.ink,
        loopTextColor: p.inkSoft,
        activationBkgColor: p.accentWash,
        activationBorderColor: p.accentMark,
        sequenceNumberColor: p.surface,
        noteBkgColor: p.accentWash,
        noteBorderColor: p.accentMark,
        noteTextColor: p.ink
      },
      /* Hooks the pages can lean on: `class X accent` paints the one node that
         matters, and edge labels should read as machine text like the rail. */
      themeCSS:
        '.edgeLabel, .edgeLabel p { background: ' + p.surface + '; color: ' + p.inkFaint + '; }' +
        '.node.accent > rect, .node.accent > polygon, .node.accent > path,' +
        '.node.accent > circle, .node.accent > ellipse {' +
        '  fill: ' + p.accentWash + ' !important; stroke: ' + p.accentMark + ' !important; }' +
        '.node.accent .nodeLabel, .node.accent text { color: ' + p.ink + '; fill: ' + p.ink + '; }' +
        '.cluster rect { rx: 3; }'
    };
  }

  /* --- diagrams ----------------------------------------------------------- */

  /* mermaid.render replaces the element's content, so the source has to be
     stashed on the first pass or a second render (after a theme toggle) would
     have nothing left to parse. */
  var diagrams = [];
  var renderPass = 0;

  /* <pre> content arrives indented to match the surrounding HTML; mermaid's
     parser wants it flush left. */
  function dedent(text) {
    var lines = String(text).replace(/\t/g, '    ').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var indent = null;
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      var lead = lines[i].match(/^ */)[0].length;
      if (indent === null || lead < indent) indent = lead;
    }
    if (!indent) return lines.join('\n');
    for (var j = 0; j < lines.length; j++) lines[j] = lines[j].slice(indent);
    return lines.join('\n');
  }

  function collectDiagrams() {
    var nodes = document.querySelectorAll('pre.mermaid');
    for (var i = 0; i < nodes.length; i++) {
      diagrams.push({ el: nodes[i], src: dedent(nodes[i].textContent || '') });
    }
  }

  function reveal(entry, svg) {
    entry.el.innerHTML = svg;
    /* CSS keeps pre.mermaid display:none until this lands, so the source never
       flashes as a monospace code block. */
    entry.el.setAttribute('data-fg-rendered', '');
  }

  function renderAll() {
    var mermaid = window.mermaid;
    if (!mermaid || !diagrams.length) return;

    var pass = renderPass++;
    try {
      mermaid.initialize(mermaidConfig(effectiveTheme()));
    } catch (e) {
      return;
    }

    for (var i = 0; i < diagrams.length; i++) {
      renderOne(mermaid, diagrams[i], 'fg-mmd-' + i + '-' + pass);
    }
  }

  function renderOne(mermaid, entry, id) {
    var result;
    try {
      result = mermaid.render(id, entry.src);
    } catch (e) {
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(function (out) {
        if (out && out.svg) reveal(entry, out.svg);
      }, function () { /* leave the diagram hidden rather than half-drawn */ });
    } else if (result && result.svg) {
      reveal(entry, result.svg);          // pre-v10 synchronous signature
    } else if (typeof result === 'string') {
      reveal(entry, result);
    }
  }

  /* --- toggle -------------------------------------------------------------- */

  function setTheme(next) {
    root.setAttribute('data-theme', next);
    writeStored(next);
    renderAll();                          // diagrams have to follow the page
  }

  function wireToggles() {
    var buttons = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        setTheme(effectiveTheme() === 'dark' ? 'light' : 'dark');
      });
    }
  }

  /* --- start --------------------------------------------------------------- */

  function start() {
    wireToggles();
    collectDiagrams();
    renderAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  /* A reader who has never touched the toggle should follow the OS. */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () {
      if (!root.hasAttribute('data-theme')) renderAll();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
})();
