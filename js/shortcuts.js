/* Global keyboard shortcuts. The help overlay itself is a native popover —
 * open/close buttons, Esc, and light dismiss are all handled by the browser. */
import { list } from "./entrylist.js";
import { reader } from "./reader.js";

export const shortcuts = {
  init() {
    document.addEventListener("keydown", (e) => this.onKey(e));
  },

  onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const target = e.target;
    const typing = target instanceof HTMLElement &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (typing) return;

    // Only when logged in and the app is visible
    if (document.getElementById("app-view").hidden) return;

    switch (e.key) {
      case "j":
        e.preventDefault();
        list.selectOffset(+1);
        break;
      case "k":
        e.preventDefault();
        list.selectOffset(-1);
        break;
      case "m":
        reader.toggleRead();
        break;
      case "s":
        reader.toggleStar();
        break;
      case "S":
        reader.saveEntry();
        break;
      case "v":
        reader.openOriginal();
        break;
      case "r":
        list.refresh();
        break;
      case "/":
        e.preventDefault();
        document.getElementById("search-input").focus();
        break;
      case "?":
        document.getElementById("help-overlay").togglePopover();
        break;
    }
  },
};
