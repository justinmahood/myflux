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

/* Pane switching for narrow screens; a no-op on wide layouts (CSS-gated). */
export const nav = {
  set(pane) {
    document.body.classList.remove("show-sidebar", "show-list", "show-reader");
    document.body.classList.add(`show-${pane}`);
  },
  showSidebar() { this.set("sidebar"); },
  showList() { this.set("list"); },
  showReader() { this.set("reader"); },
};
