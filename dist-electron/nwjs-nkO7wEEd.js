import { g as a } from "./main-CbhYgwM0.js";
const u = (o, c = a()) => new Promise((n, t) => {
  var i = o.createLink();
  nw.Window.open(i, c, function(e) {
    e.on("close", function() {
      t("error.gui.closed"), e.close(!0);
    }), e.on("loaded", function() {
      const r = e.window.location.href;
      if (r.startsWith(o.token.redirect)) {
        const s = new URLSearchParams(r.substr(r.indexOf("?") + 1)).get("code");
        s ? n(s) : t("error.gui.closed");
        try {
          e.close(!0);
        } catch {
          console.error("[MSMC]: Failed to close window!");
        }
        return !0;
      }
      return !1;
    });
  });
});
export {
  u as default
};
