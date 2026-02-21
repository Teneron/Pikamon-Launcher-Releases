import C from "path";
import h from "fs";
import w from "os";
import { execSync as v, spawn as M } from "child_process";
import { e as L, g as E, f as O } from "./main-CPwo-dIo.js";
const b = C.join(w.tmpdir(), "msmc");
var k = !1, p;
console.log("[MSMC]: OS Type => " + w.type());
switch (w.type()) {
  case "Windows_NT":
    const f = ["HKEY_LOCAL_MACHINE", "HKEY_CURRENT_USER"], o = [
      "chrome.exe",
      "vivaldi.exe",
      "brave.exe",
      "blisk.exe",
      "msedge.exe"
    ];
    e: {
      for (var e = 0; e < o.length; e++)
        for (var m = 0; m < f.length; m++) {
          const a = f[m] + "\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\";
          try {
            console.log('reg query "' + a + o[e] + '"');
            var t = v('"C:\\Windows\\System32\\reg.exe" query "' + a + o[e] + '"').toString();
            if (!t.startsWith("ERROR"))
              if (t = t.substring(t.indexOf("REG_SZ") + 6).trim(), t.indexOf(`
`) > 0 && (t = t.substring(0, t.indexOf(`
`) - 1)), h.existsSync(t)) {
                p = t;
                break e;
              } else
                console.log("[MSMC]: cannot find " + t);
          } catch {
          }
        }
      console.error("[MSMC]: No Chromium browser was found");
    }
    break;
  case "Darwin":
    const n = "/Applications/{0}.app/Contents/MacOS/{0}", g = [
      "Google\\ Chrome",
      "Google Chrome",
      "Microsoft\\ Edge",
      "Microsoft Edge",
      "Vivaldi",
      "Blisk",
      "Brave\\ Browser",
      "Brave Browser",
      "Yandex"
    ];
    for (var e = 0; e < g.length; e++) {
      const c = n.replace(/\{0\}/g, g[e]);
      if (h.existsSync(c)) {
        p = c;
        break;
      }
    }
    if (p)
      break;
  case "Linux":
  default:
    const d = process.env.PATH.split(":"), i = ["", "-stable", "-beta", "-dev", "-g4", "-browser"], r = [
      "chromium",
      "google-chrome",
      "microsoft-edge",
      "vivaldi",
      "brave-browser",
      "blisk-browser",
      "yandex-browser",
      "waterfox",
      "firefox"
    ], s = ["firefox", "waterfox"];
    e: {
      for (var e = 0; e < r.length; e++)
        for (var u = 0; u < i.length; u++)
          for (var m = 0; m < d.length; m++) {
            const l = C.join(d[m], r[e] + i[u]);
            if (h.existsSync(l)) {
              p = l, k = s.includes(r[e]);
              break e;
            }
          }
      console.error("[MSMC]: No compatible browser was found");
    }
}
function R(f, o, n) {
  return new Promise((g, d) => {
    const i = () => {
      try {
        clearInterval(r), process.removeListener("exit", i), w.type() == "Windows_NT" ? v("taskkill /pid " + n.pid) : n.kill();
      } catch {
        console.error("[MSMC]: Failed to close window!");
      }
    };
    process.on("exit", i);
    const r = setInterval(() => {
      O("http://127.0.0.1:" + o + "/json/list").then((s) => s.json()).then((s) => {
        for (var a = 0; a < s.length; a++) {
          const c = s[a].url;
          if (c && c.startsWith(f.token.redirect)) {
            const l = new URLSearchParams(c.substr(c.indexOf("?") + 1)).get("code");
            l ? g(l) : d("error.gui.closed"), i();
          }
        }
      }).catch((s) => {
        i(), console.error("[msmc]: " + s), d("error.gui.closed");
      });
    }, 500);
  });
}
const A = (f, o = E()) => {
  const n = o.browserCMD ? o.browserCMD : p;
  n || L("error.gui.raw.noBrowser"), console.log('[MSMC]: Using "' + n + '"');
  var g = f.createLink();
  return new Promise((d, i) => {
    var r;
    k || o.firefox ? (console.log("[MSMC]: Using firefox fallback {Linux only!}"), h.existsSync(b) && v("rm -R " + b), h.mkdirSync(b), r = M(n, [
      "--profile",
      b,
      "-kiosk",
      g,
      "--remote-debugging-port=0",
      "--new-instance"
    ])) : r = M(n, [
      "--disable-restore-session-state",
      "--disable-first-run-ui",
      "--disable-component-extensions-with-background-pages",
      "--no-first-run",
      "--disable-extensions",
      "--window-size=" + o.width + "," + o.height,
      "--remote-debugging-port=0",
      "--no-default-browser-check",
      "--user-data-dir=" + b,
      "--force-app-mode",
      "--app=" + g
    ]);
    var s = !0;
    const a = (c) => {
      const l = String(c.toString()).toLocaleLowerCase().trim();
      if (console.log("[MSMC][Browser]: " + l), s && l.startsWith("devtools listening on ws://")) {
        s = !1;
        var x = l.substring(27);
        const y = x.indexOf(":") + 1, S = x.substring(y, x.indexOf("/"));
        console.log("[MSMC]: Debug hook => http://127.0.0.1:" + S), R(f, S, r).then(d).catch(i);
      }
    };
    o.suppress || (r.stdout.on("data", a), r.stderr.on("data", a));
  });
};
export {
  A as default
};
