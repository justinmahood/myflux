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
 * On narrow screens the drill-in panes participate in browser history so
 * the platform back gesture (Android back swipe/button, iOS edge swipe)
 * walks back out: reader -> list, sidebar -> list, and back from the base
 * list leaves the app, like a native app. The sidebar and reader are
 * modeled as single entries pushed on top of the list, so the stack never
 * grows past two no matter how much you navigate. */
export const nav = {
  current: "list",

  isMobile() {
    return window.matchMedia("(max-width: 900px)").matches;
  },

  init() {
    history.replaceState({ pane: "list" }, "");
    window.addEventListener("popstate", (e) => {
      this.set(e.state?.pane ?? "list");
    });
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
    const onPushedPane =
      history.state?.pane === "sidebar" || history.state?.pane === "reader";
    if (pane === "list") {
      if (onPushedPane) {
        history.back(); // popstate applies the pane
        return;
      }
      this.set("list");
    } else if (onPushedPane) {
      // e.g. j/k opening the next article: reuse the entry, don't stack
      history.replaceState({ pane }, "");
      this.set(pane);
    } else {
      history.pushState({ pane }, "");
      this.set(pane);
    }
  },

  showSidebar() { this.navigate("sidebar"); },
  showList() { this.navigate("list"); },
  showReader() { this.navigate("reader"); },
};
