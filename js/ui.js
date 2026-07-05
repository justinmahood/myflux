/* Small shared UI helpers: toasts and mobile drill-in navigation. */

let toastTimer = null;

export function toast(message, isError = false) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.toggle("error", isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

/* Pane switching for narrow screens; visually a no-op on wide layouts
 * (CSS-gated).
 *
 * On narrow screens the three panes form a hierarchy — sources (sidebar)
 * -> list -> article — mirrored in browser history so the platform back
 * gesture (Android back swipe/button, iOS edge swipe) walks back down:
 * article -> list -> sources -> exit, like a native app. Moving deeper
 * pushes an entry, moving shallower travels back through real entries,
 * and same-level moves (j/k between articles) replace, so the stack never
 * grows no matter how much you navigate. */
const PANE_DEPTH = { sidebar: 0, list: 1, reader: 2 };

export const nav = {
  current: "list",

  isMobile() {
    return window.matchMedia("(max-width: 900px)").matches;
  },

  init() {
    window.addEventListener("popstate", (e) => {
      this.set(e.state?.pane ?? "list");
    });
  },

  /* Called when the logged-in app becomes visible: establish the base
   * stack, [sources, list] on narrow screens, so back from the opening
   * list reveals the sources pane. */
  enterApp() {
    if (!this.isMobile()) {
      history.replaceState({ pane: "list" }, "");
      return;
    }
    history.replaceState({ pane: "sidebar" }, "");
    history.pushState({ pane: "list" }, "");
  },

  /* Apply the pane visually without touching history. */
  set(pane) {
    document.body.classList.remove("show-sidebar", "show-list", "show-reader");
    document.body.classList.add(`show-${pane}`);
    this.current = pane;
  },

  navigate(pane) {
    if (!this.isMobile()) {
      this.set(pane);
      return;
    }
    const depth = PANE_DEPTH[history.state?.pane] ?? PANE_DEPTH.list;
    const target = PANE_DEPTH[pane];
    if (target === depth) {
      history.replaceState({ pane }, "");
      this.set(pane);
    } else if (target > depth) {
      history.pushState({ pane }, "");
      this.set(pane);
    } else {
      history.go(target - depth); // popstate applies the pane
    }
  },

  showSidebar() { this.navigate("sidebar"); },
  showList() { this.navigate("list"); },
  showReader() { this.navigate("reader"); },
};
