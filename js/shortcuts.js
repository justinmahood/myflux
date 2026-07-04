/* Global keyboard shortcuts and the help overlay. */
(function () {
  "use strict";
  window.App = window.App || {};

  const shortcuts = {
    init() {
      const overlay = document.getElementById("help-overlay");
      document.getElementById("help-btn").addEventListener("click", () => this.toggleHelp());
      document.getElementById("help-close").addEventListener("click", () => this.toggleHelp(false));
      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.toggleHelp(false);
      });

      document.addEventListener("keydown", (e) => this.onKey(e));
    },

    toggleHelp(force) {
      const overlay = document.getElementById("help-overlay");
      overlay.hidden = force === undefined ? !overlay.hidden : !force;
    },

    onKey(e) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target;
      const typing = target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (e.key === "Escape") {
        this.toggleHelp(false);
        return;
      }
      if (typing) return;

      // Only when logged in and the app is visible
      if (document.getElementById("app-view").hidden) return;

      switch (e.key) {
        case "j":
          e.preventDefault();
          App.list.selectOffset(+1);
          break;
        case "k":
          e.preventDefault();
          App.list.selectOffset(-1);
          break;
        case "m":
          App.reader.toggleRead();
          break;
        case "s":
          App.reader.toggleStar();
          break;
        case "v":
          App.reader.openOriginal();
          break;
        case "r":
          App.list.refresh();
          break;
        case "/":
          e.preventDefault();
          document.getElementById("search-input").focus();
          break;
        case "?":
          this.toggleHelp();
          break;
      }
    },
  };

  App.shortcuts = shortcuts;
})();
