/* Sanitizer tests — the security-critical module. Every vector here is
 * something a hostile feed could actually ship. */
import { test, assert, assertEqual } from "./runner.js";
import { sanitizeHtml, textOf, firstImage } from "../js/sanitize.js";

/* Render a fragment into a detached container for inspection. */
function clean(html, base) {
  const div = document.createElement("div");
  div.append(sanitizeHtml(html, base));
  return div;
}

test("sanitize: <script> dropped with its contents", () => {
  const out = clean('<p>a</p><script>document.title="pwn"</script><p>b</p>');
  assertEqual(out.querySelectorAll("script").length, 0);
  assert(!out.textContent.includes("pwn"), "script text leaked");
  assertEqual(out.querySelectorAll("p").length, 2);
});

test("sanitize: <style>, <iframe>, <object>, <embed>, <form>, <input> dropped", () => {
  const out = clean(
    '<style>body{display:none}</style><iframe src="https://evil.example"></iframe>' +
    '<object data="x"></object><embed src="x"><form action="x"><input value="y"></form>');
  assertEqual(out.querySelectorAll("style,iframe,object,embed,form,input").length, 0);
  assert(!out.textContent.includes("display:none"), "style text leaked");
});

test("sanitize: <svg> and <math> dropped entirely (children too)", () => {
  const out = clean('<svg><a href="https://x.test">inside</a></svg><math><mi>y</mi></math>');
  assertEqual(out.querySelectorAll("svg,math,a,mi").length, 0);
  assertEqual(out.textContent.trim(), "");
});

test("sanitize: event handler attributes stripped", () => {
  const out = clean(
    '<p onclick="a()" onmouseover="b()">x</p>' +
    '<img src="https://e.test/i.png" onerror="c()" ONLOAD="d()">');
  for (const el of out.querySelectorAll("*")) {
    for (const attr of el.attributes) {
      assert(!attr.name.startsWith("on"), `event attr survived: ${attr.name}`);
    }
  }
});

test("sanitize: javascript: href removed, link kept", () => {
  const out = clean('<a href="javascript:alert(1)">evil</a>');
  const a = out.querySelector("a");
  assert(a, "link should survive without its href");
  assert(!a.hasAttribute("href"), "javascript: href survived");
});

test("sanitize: http(s) and mailto links kept, forced target/rel", () => {
  const out = clean('<a href="https://ok.test/x">a</a><a href="mailto:me@x.test">b</a>');
  const links = [...out.querySelectorAll("a")];
  assertEqual(links.length, 2);
  for (const a of links) {
    assert(a.hasAttribute("href"), "safe href removed");
    assertEqual(a.getAttribute("target"), "_blank");
    assertEqual(a.getAttribute("rel"), "noopener noreferrer");
  }
});

test("sanitize: style/class/id attributes stripped, allowed attrs kept", () => {
  const out = clean(
    '<img src="https://e.test/i.png" alt="pic" width="10" height="20" style="border:9px solid red" class="x" id="y">');
  const img = out.querySelector("img");
  assertEqual(img.getAttribute("alt"), "pic");
  assertEqual(img.getAttribute("width"), "10");
  assertEqual(img.getAttribute("height"), "20");
  assert(!img.hasAttribute("style") && !img.hasAttribute("class") && !img.hasAttribute("id"),
    "disallowed attribute survived");
});

test("sanitize: images get loading=lazy and referrerpolicy=no-referrer", () => {
  const img = clean('<img src="https://e.test/i.png">').querySelector("img");
  assertEqual(img.getAttribute("loading"), "lazy");
  assertEqual(img.getAttribute("referrerpolicy"), "no-referrer");
});

test("sanitize: img with no safe src is dropped entirely", () => {
  const out = clean('<img onerror="x()"><img src="javascript:x"><img src="data:text/html,<b>">');
  assertEqual(out.querySelectorAll("img").length, 0);
});

test("sanitize: data:image/* allowed on img, not on links", () => {
  const out = clean(
    '<img src="data:image/png;base64,AA=="><a href="data:image/png;base64,AA==">x</a>');
  assert(out.querySelector("img"), "data:image img dropped");
  assert(!out.querySelector("a").hasAttribute("href"), "data: href survived on link");
});

test("sanitize: relative and protocol-relative URLs resolved against base", () => {
  const base = "https://example.com/posts/1";
  const out = clean('<img src="x.png"><a href="/about">a</a><img src="//cdn.test/i.jpg">', base);
  const [img1, img2] = out.querySelectorAll("img");
  assertEqual(img1.getAttribute("src"), "https://example.com/posts/x.png");
  assertEqual(img2.getAttribute("src"), "https://cdn.test/i.jpg");
  assertEqual(out.querySelector("a").getAttribute("href"), "https://example.com/about");
});

test("sanitize: unknown tags unwrapped, children kept", () => {
  const out = clean("<article><section><p>kept</p></section></article><font>text</font>");
  assertEqual(out.querySelectorAll("article,section,font").length, 0);
  assertEqual(out.querySelector("p").textContent, "kept");
  assert(out.textContent.includes("text"), "unwrapped tag lost its text");
});

test("sanitize: audio/video forced to controls + preload=none", () => {
  const out = clean('<video src="https://e.test/v.mp4" autoplay></video><audio src="https://e.test/a.mp3"></audio>');
  for (const el of out.querySelectorAll("video,audio")) {
    assert(el.hasAttribute("controls"), "controls missing");
    assertEqual(el.getAttribute("preload"), "none");
    assert(!el.hasAttribute("autoplay"), "autoplay survived");
  }
});

test("sanitize: table structure kept with colspan/rowspan", () => {
  const out = clean('<table><tr><td colspan="2" style="x">a</td><th rowspan="3">b</th></tr></table>');
  assertEqual(out.querySelector("td").getAttribute("colspan"), "2");
  assertEqual(out.querySelector("th").getAttribute("rowspan"), "3");
  assert(!out.querySelector("td").hasAttribute("style"));
});

test("sanitize: uppercase tags and attributes handled", () => {
  const out = clean('<IMG SRC="https://e.test/i.png" ONERROR="x()"><SCRIPT>bad()</SCRIPT>');
  const img = out.querySelector("img");
  assert(img, "uppercase img lost");
  assert(!img.hasAttribute("onerror"));
  assertEqual(out.querySelectorAll("script").length, 0);
});

test("sanitize: malformed HTML does not throw", () => {
  clean("<p><div></p><a href='<script>'><<<>>>");
  clean(null);
  clean(undefined);
});

test("textOf: strips tags and collapses whitespace", () => {
  assertEqual(textOf("<p>Hello</p>\n\n<p>World</p>"), "Hello World");
});

test("textOf: block boundaries become word breaks", () => {
  assertEqual(textOf("<h2>Title</h2><p>Body</p>"), "Title Body");
});

test("textOf: script/style text excluded", () => {
  assertEqual(textOf("<script>bad()</script><style>x{}</style><p>ok</p>"), "ok");
});

test("textOf: truncates with ellipsis at maxLen", () => {
  const out = textOf(`<p>${"a".repeat(100)}</p>`, 10);
  assertEqual(out.length, 10);
  assert(out.endsWith("…"));
});

test("firstImage: returns first safe image, resolved against base", () => {
  const src = firstImage('<p><img src="i.jpg"></p>', "https://site.test/a/b");
  assertEqual(src, "https://site.test/a/i.jpg");
});

test("firstImage: skips unsafe sources, allows data:image", () => {
  assertEqual(firstImage('<img src="javascript:x"><img src="data:image/gif;base64,AA==">'),
    "data:image/gif;base64,AA==");
  assertEqual(firstImage("<p>no images</p>"), null);
});
