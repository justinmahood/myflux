/* Allowlist HTML sanitizer for untrusted feed content.
 *
 * Builds a fresh DOM tree: allowed tags are recreated with only their
 * allowed attributes, unknown tags are unwrapped (children kept), and
 * dangerous tags are dropped entirely with their contents. DOMParser
 * documents are inert, so nothing loads or executes during parsing. */
(function () {
  "use strict";
  window.App = window.App || {};

  // tag -> allowed attributes
  const ALLOWED = {
    a: ["href", "title"],
    abbr: ["title"],
    audio: ["src"],
    b: [], big: [], blockquote: [], br: [], caption: [],
    cite: [], code: [], dd: [], del: [], details: [], dfn: [],
    div: [], dl: [], dt: [], em: [],
    figcaption: [], figure: [],
    h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
    hr: [], i: [],
    img: ["src", "alt", "title", "width", "height"],
    ins: [], kbd: [],
    li: [], mark: [],
    ol: ["start"],
    p: [], pre: [], q: [], s: [], samp: [], small: [],
    source: ["src", "type"],
    span: [], strike: [], strong: [], sub: [], summary: [], sup: [],
    table: [], tbody: [],
    td: ["colspan", "rowspan"],
    tfoot: [],
    th: ["colspan", "rowspan"],
    thead: [],
    time: ["datetime"],
    tr: [], u: [], ul: [], var: [], wbr: [],
    video: ["src", "poster", "width", "height"],
  };

  // Dropped with all of their contents.
  const DROP = new Set([
    "script", "style", "iframe", "object", "embed", "applet", "form",
    "input", "button", "select", "textarea", "option", "link", "meta",
    "base", "noscript", "template", "svg", "math", "frame", "frameset",
    "title", "head", "dialog", "slot", "canvas",
  ]);

  function safeUrl(value, baseUrl, { allowData = false } = {}) {
    let url;
    try {
      url = new URL(value, baseUrl || undefined);
    } catch (_) {
      return null;
    }
    const proto = url.protocol;
    if (proto === "http:" || proto === "https:" || proto === "mailto:") return url.href;
    if (allowData && proto === "data:" && /^data:image\//i.test(url.href)) return url.href;
    return null;
  }

  const URL_ATTRS = new Set(["href", "src", "poster"]);

  function cleanInto(source, dest, baseUrl) {
    for (const child of source.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        dest.appendChild(document.createTextNode(child.nodeValue));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;

      const tag = child.localName;
      if (DROP.has(tag)) continue;

      if (!Object.prototype.hasOwnProperty.call(ALLOWED, tag)) {
        cleanInto(child, dest, baseUrl); // unwrap unknown tag, keep children
        continue;
      }

      const el = document.createElement(tag);
      for (const name of ALLOWED[tag]) {
        if (!child.hasAttribute(name)) continue;
        let value = child.getAttribute(name);
        if (URL_ATTRS.has(name)) {
          value = safeUrl(value, baseUrl, { allowData: tag === "img" });
          if (value === null) continue;
        }
        el.setAttribute(name, value);
      }

      if (tag === "a") {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else if (tag === "img") {
        if (!el.hasAttribute("src")) continue; // image with no safe source: drop
        el.setAttribute("loading", "lazy");
        el.setAttribute("referrerpolicy", "no-referrer");
      } else if (tag === "audio" || tag === "video") {
        el.setAttribute("controls", "");
        el.setAttribute("preload", "none");
      }

      cleanInto(child, el, baseUrl);
      dest.appendChild(el);
    }
  }

  function parse(html) {
    return new DOMParser().parseFromString(html || "", "text/html");
  }

  App.sanitize = {
    /* Sanitize an HTML string into a DocumentFragment safe to insert. */
    html(html, baseUrl) {
      const doc = parse(html);
      const frag = document.createDocumentFragment();
      cleanInto(doc.body, frag, baseUrl);
      return frag;
    },

    /* Plain-text extraction (for snippets). The "< " trick inserts a word
     * break at every tag boundary so block elements don't run together. */
    text(html, maxLen) {
      const doc = parse(String(html || "").replace(/</g, " <"));
      doc.body.querySelectorAll("script, style, noscript, template")
        .forEach((el) => el.remove());
      const text = (doc.body.textContent || "").replace(/\s+/g, " ").trim();
      return maxLen && text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;
    },

    /* First usable image URL in the content, or null. */
    firstImage(html, baseUrl) {
      for (const img of parse(html).querySelectorAll("img[src]")) {
        const src = safeUrl(img.getAttribute("src"), baseUrl, { allowData: true });
        if (src) return src;
      }
      return null;
    },
  };
})();
