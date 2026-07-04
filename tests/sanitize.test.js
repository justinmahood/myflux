/* Sanitizer tests — the security-critical module. Every vector here is
 * something a hostile feed could actually ship. */
import { test, expect } from "vitest";
import { sanitizeHtml, textOf, firstImage } from "../js/sanitize.js";

/* Render a fragment into a detached container for inspection. */
function clean(html, base) {
  const div = document.createElement("div");
  div.append(sanitizeHtml(html, base));
  return div;
}

test("sanitize: <script> dropped with its contents", () => {
  const out = clean('<p>a</p><script>document.title="pwn"</script><p>b</p>');
  expect(out.querySelectorAll("script")).toHaveLength(0);
  expect(out.textContent).not.toContain("pwn");
  expect(out.querySelectorAll("p")).toHaveLength(2);
});

test("sanitize: <style>, <iframe>, <object>, <embed>, <form>, <input> dropped", () => {
  const out = clean(
    '<style>body{display:none}</style><iframe src="https://evil.example"></iframe>' +
    '<object data="x"></object><embed src="x"><form action="x"><input value="y"></form>');
  expect(out.querySelectorAll("style,iframe,object,embed,form,input")).toHaveLength(0);
  expect(out.textContent).not.toContain("display:none");
});

test("sanitize: <svg> and <math> dropped entirely (children too)", () => {
  const out = clean('<svg><a href="https://x.test">inside</a></svg><math><mi>y</mi></math>');
  expect(out.querySelectorAll("svg,math,a,mi")).toHaveLength(0);
  expect(out.textContent.trim()).toBe("");
});

test("sanitize: event handler attributes stripped", () => {
  const out = clean(
    '<p onclick="a()" onmouseover="b()">x</p>' +
    '<img src="https://e.test/i.png" onerror="c()" ONLOAD="d()">');
  for (const el of out.querySelectorAll("*")) {
    for (const attr of el.attributes) {
      expect(attr.name, `event attr survived: ${attr.name}`).not.toMatch(/^on/);
    }
  }
});

test("sanitize: javascript: href removed, link kept", () => {
  const a = clean('<a href="javascript:alert(1)">evil</a>').querySelector("a");
  expect(a).not.toBeNull();
  expect(a.hasAttribute("href")).toBe(false);
});

test("sanitize: http(s) and mailto links kept, forced target/rel", () => {
  const out = clean('<a href="https://ok.test/x">a</a><a href="mailto:me@x.test">b</a>');
  const links = [...out.querySelectorAll("a")];
  expect(links).toHaveLength(2);
  for (const a of links) {
    expect(a.hasAttribute("href")).toBe(true);
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
  }
});

test("sanitize: style/class/id attributes stripped, allowed attrs kept", () => {
  const img = clean(
    '<img src="https://e.test/i.png" alt="pic" width="10" height="20" style="border:9px solid red" class="x" id="y">'
  ).querySelector("img");
  expect(img.getAttribute("alt")).toBe("pic");
  expect(img.getAttribute("width")).toBe("10");
  expect(img.getAttribute("height")).toBe("20");
  expect(img.hasAttribute("style")).toBe(false);
  expect(img.hasAttribute("class")).toBe(false);
  expect(img.hasAttribute("id")).toBe(false);
});

test("sanitize: images get loading=lazy and referrerpolicy=no-referrer", () => {
  const img = clean('<img src="https://e.test/i.png">').querySelector("img");
  expect(img.getAttribute("loading")).toBe("lazy");
  expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
});

test("sanitize: img with no safe src is dropped entirely", () => {
  const out = clean('<img onerror="x()"><img src="javascript:x"><img src="data:text/html,<b>">');
  expect(out.querySelectorAll("img")).toHaveLength(0);
});

test("sanitize: data:image/* allowed on img, not on links", () => {
  const out = clean(
    '<img src="data:image/png;base64,AA=="><a href="data:image/png;base64,AA==">x</a>');
  expect(out.querySelector("img")).not.toBeNull();
  expect(out.querySelector("a").hasAttribute("href")).toBe(false);
});

test("sanitize: relative and protocol-relative URLs resolved against base", () => {
  const base = "https://example.com/posts/1";
  const out = clean('<img src="x.png"><a href="/about">a</a><img src="//cdn.test/i.jpg">', base);
  const [img1, img2] = out.querySelectorAll("img");
  expect(img1.getAttribute("src")).toBe("https://example.com/posts/x.png");
  expect(img2.getAttribute("src")).toBe("https://cdn.test/i.jpg");
  expect(out.querySelector("a").getAttribute("href")).toBe("https://example.com/about");
});

test("sanitize: unknown tags unwrapped, children kept", () => {
  const out = clean("<article><section><p>kept</p></section></article><font>text</font>");
  expect(out.querySelectorAll("article,section,font")).toHaveLength(0);
  expect(out.querySelector("p").textContent).toBe("kept");
  expect(out.textContent).toContain("text");
});

test("sanitize: audio/video forced to controls + preload=none", () => {
  const out = clean(
    '<video src="https://e.test/v.mp4" autoplay></video><audio src="https://e.test/a.mp3"></audio>');
  for (const el of out.querySelectorAll("video,audio")) {
    expect(el.hasAttribute("controls")).toBe(true);
    expect(el.getAttribute("preload")).toBe("none");
    expect(el.hasAttribute("autoplay")).toBe(false);
  }
});

test("sanitize: table structure kept with colspan/rowspan", () => {
  const out = clean(
    '<table><tr><td colspan="2" style="x">a</td><th rowspan="3">b</th></tr></table>');
  expect(out.querySelector("td").getAttribute("colspan")).toBe("2");
  expect(out.querySelector("th").getAttribute("rowspan")).toBe("3");
  expect(out.querySelector("td").hasAttribute("style")).toBe(false);
});

test("sanitize: uppercase tags and attributes handled", () => {
  const out = clean('<IMG SRC="https://e.test/i.png" ONERROR="x()"><SCRIPT>bad()</SCRIPT>');
  const img = out.querySelector("img");
  expect(img).not.toBeNull();
  expect(img.hasAttribute("onerror")).toBe(false);
  expect(out.querySelectorAll("script")).toHaveLength(0);
});

test("sanitize: malformed HTML does not throw", () => {
  expect(() => {
    clean("<p><div></p><a href='<script>'><<<>>>");
    clean(null);
    clean(undefined);
  }).not.toThrow();
});

test("textOf: strips tags and collapses whitespace", () => {
  expect(textOf("<p>Hello</p>\n\n<p>World</p>")).toBe("Hello World");
});

test("textOf: block boundaries become word breaks", () => {
  expect(textOf("<h2>Title</h2><p>Body</p>")).toBe("Title Body");
});

test("textOf: script/style text excluded", () => {
  expect(textOf("<script>bad()</script><style>x{}</style><p>ok</p>")).toBe("ok");
});

test("textOf: truncates with ellipsis at maxLen", () => {
  const out = textOf(`<p>${"a".repeat(100)}</p>`, 10);
  expect(out).toHaveLength(10);
  expect(out.endsWith("…")).toBe(true);
});

test("firstImage: returns first safe image, resolved against base", () => {
  expect(firstImage('<p><img src="i.jpg"></p>', "https://site.test/a/b"))
    .toBe("https://site.test/a/i.jpg");
});

test("firstImage: skips unsafe sources, allows data:image", () => {
  expect(firstImage('<img src="javascript:x"><img src="data:image/gif;base64,AA==">'))
    .toBe("data:image/gif;base64,AA==");
  expect(firstImage("<p>no images</p>")).toBeNull();
});
