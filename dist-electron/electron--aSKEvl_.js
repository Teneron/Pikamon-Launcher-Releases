import { g as d } from "./main-CbhYgwM0.js";
const f = async (t, c = d()) => {
  let e;
  try {
    const { BrowserWindow: o } = await import(
      /* webpackIgnore: true */
      "electron"
    );
    e = new o(c);
  } catch {
    const o = typeof __webpack_require__ == "function" ? __non_webpack_require__ : require, { BrowserWindow: r } = o("electron");
    e = new r(c), console.log("[MSMC]: Using fallback dynamic require for electron");
  }
  return await new Promise((o, r) => {
    var l = t.createLink();
    e.setMenu(null), e.loadURL(l);
    const i = e.webContents;
    var s = !1;
    e.on("close", () => {
      s || r("error.gui.closed");
    }), i.on("did-finish-load", () => {
      const n = i.getURL();
      if (n.startsWith(t.token.redirect)) {
        const a = new URLSearchParams(n.substr(n.indexOf("?") + 1)).get("code");
        a && (o(a), s = !0);
        try {
          e.close();
        } catch {
          console.error("[MSMC]: Failed to close window!");
        }
      }
    });
  });
};
export {
  f as default
};
