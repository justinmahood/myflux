/* Allowlist HTML sanitizer for untrusted feed content.
 *
 * Builds a fresh DOM tree: allowed tags are recreated with only their
 * allowed attributes, unknown tags are unwrapped (children kept), and
 * dangerous tags are dropped entirely with their contents. DOMParser
 * documents are inert, so nothing loads or executes during parsing. */

// tag -> allowed attributes
const ALLOWED = new Map(Object.entries({
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
}));

// Dropped with all of their contents.
const DROP = new Set([
  "script", "style", "iframe", "object", "embed", "applet", "form",
  "input", "button", "select", "textarea", "option", "link", "meta",
  "base", "noscript", "template", "svg", "math", "frame", "frameset",
  "title", "head", "dialog", "slot", "canvas",
]);

const URL_ATTRS = new Set(["href", "src", "poster"]);

function safeUrl(value, baseUrl, { allowData = false } = {}) {
  if (!URL.canParse(value, baseUrl || undefined)) return null;
  const url = new URL(value, baseUrl || undefined);
  const proto = url.protocol;
  if (proto === "http:" || proto === "https:" || proto === "mailto:") return url.href;
  if (allowData && proto === "data:" && /^data:image\//i.test(url.href)) return url.href;
  return null;
}

function cleanInto(source, dest, baseUrl) {
  for (const child of source.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      dest.appendChild(document.createTextNode(child.nodeValue));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.localName;
    if (DROP.has(tag)) continue;

    const allowedAttrs = ALLOWED.get(tag);
    if (!allowedAttrs) {
      cleanInto(child, dest, baseUrl); // unwrap unknown tag, keep children
      continue;
    }

    const el = document.createElement(tag);
    for (const name of allowedAttrs) {
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

const parse = (html) => new DOMParser().parseFromString(html ?? "", "text/html");

/** Sanitize an HTML string into a DocumentFragment safe to insert. */
export function sanitizeHtml(html, baseUrl) {
  const frag = document.createDocumentFragment();
  cleanInto(parse(html).body, frag, baseUrl);
  return frag;
}

/** Plain-text extraction (for snippets). The "< " trick inserts a word
 * break at every tag boundary so block elements don't run together. */
export function textOf(html, maxLen) {
  const doc = parse(String(html ?? "").replaceAll("<", " <"));
  for (const el of doc.body.querySelectorAll("script, style, noscript, template")) {
    el.remove();
  }
  const text = (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
  return maxLen && text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

/** First usable image URL in the content, or null. */
export function firstImage(html, baseUrl) {
  for (const img of parse(html).querySelectorAll("img[src]")) {
    const src = safeUrl(img.getAttribute("src"), baseUrl, { allowData: true });
    if (src) return src;
  }
  return null;
}
