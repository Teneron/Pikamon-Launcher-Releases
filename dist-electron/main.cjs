import { ipcMain, app, BrowserWindow, nativeImage, Tray, Menu } from "electron";
import { Client } from "minecraft-launcher-core";
import path from "node:path";
import crypto from "node:crypto";
import fs from "node:fs";
import { spawn } from "node:child_process";
import https from "node:https";
import http from "node:http";
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) {
      try {
        fs.unlinkSync(dest);
      } catch (e) {
      }
    }
    const file = fs.createWriteStream(dest);
    const handleDownload = (downloadUrl) => {
      const client = downloadUrl.startsWith("https") ? https : http;
      client.get(downloadUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          if (response.headers.location) {
            console.log(`Redirecting to: ${response.headers.location}`);
            handleDownload(response.headers.location);
            return;
          }
        }
        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(dest, () => {
          });
          reject(new Error(`Failed to download ${downloadUrl}: ${response.statusCode} ${response.statusMessage}`));
          return;
        }
        const contentLength = response.headers["content-length"];
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        let received = 0;
        let lastLogTime = 0;
        response.on("data", (chunk) => {
          received += chunk.length;
          const now = Date.now();
          if (now - lastLogTime > 100) {
            lastLogTime = now;
            if (win) {
              win.webContents.send("game:progress", {
                task: received,
                total,
                type: "Baixando Arquivos..."
              });
            }
          }
        });
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            if (total > 0 && received < total) {
              fs.unlink(dest, () => {
              });
              reject(new Error(`Download incompleto: recebeu ${received} de ${total} bytes`));
            } else {
              resolve();
            }
          });
        });
        file.on("error", (err) => {
          fs.unlink(dest, () => {
          });
          reject(err);
        });
      }).on("error", (err) => {
        fs.unlink(dest, () => {
        });
        reject(err);
      });
    };
    handleDownload(url);
  });
}
function getRemoteFileHeaders(url) {
  return new Promise((resolve, reject) => {
    const handleRequest = (requestUrl) => {
      const client = requestUrl.startsWith("https") ? https : http;
      const req = client.request(requestUrl, { method: "HEAD" }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          if (res.headers.location) {
            handleRequest(res.headers.location);
            return;
          }
        }
        resolve(res.headers);
      });
      req.on("error", reject);
      req.end();
    };
    handleRequest(url);
  });
}
async function ensureNeoForge(root, neoVersion) {
  const versionFolder = path.join(root, "versions", `neoforge-${neoVersion}`);
  if (fs.existsSync(versionFolder)) {
    console.log("NeoForge already installed:", neoVersion);
    return;
  }
  console.log("Installing NeoForge:", neoVersion);
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`;
  const installerPath = path.join(app.getPath("temp"), `neoforge-${neoVersion}-installer.jar`);
  try {
    if (win) win.webContents.send("game:log", `[INSTALL] Baixando NeoForge ${neoVersion}...`);
    await downloadFile(installerUrl, installerPath);
    if (win) win.webContents.send("game:log", `[INSTALL] Executando instalador NeoForge...`);
    const profilesPath = path.join(root, "launcher_profiles.json");
    if (!fs.existsSync(profilesPath)) {
      fs.writeFileSync(profilesPath, JSON.stringify({}, null, 2));
    }
    await new Promise((resolve, reject) => {
      const java = "java";
      const process2 = spawn(java, ["-jar", installerPath, "--installClient", root], { stdio: "inherit" });
      process2.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Installer exited with code ${code}`));
      });
    });
    console.log("NeoForge installed successfully");
    if (win) win.webContents.send("game:log", `[INSTALL] NeoForge instalado com sucesso!`);
  } catch (e) {
    console.error("Failed to install NeoForge", e);
    if (win) win.webContents.send("game:log", `[ERROR] Falha ao instalar NeoForge: ${e}`);
    throw e;
  } finally {
    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath);
  }
}
async function syncMods(root) {
  const modsUrl = "https://www.dropbox.com/scl/fi/0893bb9eaaas92ilzdork/mods.zip?rlkey=hixzbv97nh1wpgf3hmb81l0u5&st=c5s2f5a8&dl=1";
  const modsDir = path.join(root, "mods");
  const modsInfoPath = path.join(root, "mods_info.json");
  const urlPath = modsUrl.split("?")[0];
  const isRarUrl = urlPath.endsWith(".rar");
  const zipPath = path.join(app.getPath("temp"), isRarUrl ? "mods.rar" : "mods.zip");
  try {
    if (win) win.webContents.send("game:log", `[MODS] Verificando atualizações...`);
    let shouldDownload = true;
    let remoteEtag = "";
    let remoteSize = "";
    try {
      const headers = await getRemoteFileHeaders(modsUrl);
      remoteEtag = headers.etag || "";
      remoteSize = headers["content-length"] || "";
      if (fs.existsSync(modsInfoPath)) {
        try {
          const localInfo = JSON.parse(fs.readFileSync(modsInfoPath, "utf-8"));
          if (localInfo.etag === remoteEtag && localInfo.size === remoteSize && remoteEtag !== "") {
            console.log("Mods are up to date (ETag matched).");
            shouldDownload = false;
            if (win) win.webContents.send("game:log", `[MODS] Mods já estão atualizados.`);
          }
        } catch (e) {
        }
      }
    } catch (headErr) {
      console.warn("Failed to check remote headers, defaulting to download if missing", headErr);
      if (win) win.webContents.send("game:log", `[WARNING] Não foi possível verificar atualizações.`);
      if (fs.existsSync(modsDir) && fs.readdirSync(modsDir).length > 0) {
        shouldDownload = false;
        if (win) win.webContents.send("game:log", `[MODS] Verificação falhou, mantendo mods atuais.`);
      }
    }
    if (!shouldDownload) return;
    if (win) win.webContents.send("game:log", `[MODS] Baixando pacote de mods...`);
    try {
      if (win) win.webContents.send("game:log", `[MODS] Iniciando download...`);
      await downloadFile(modsUrl, zipPath);
      const stat = fs.statSync(zipPath);
      if (stat.size < 1e3) {
        throw new Error(`Arquivo muito pequeno (${stat.size} bytes). Download incompleto ou link quebrado.`);
      }
    } catch (dErr) {
      if (win) win.webContents.send("game:log", `[ERROR] Falha no download: ${dErr}`);
      throw dErr;
    }
    try {
      const fd = fs.openSync(zipPath, "r");
      const buffer = Buffer.alloc(4);
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);
      const isZipParams = buffer[0] === 80 && buffer[1] === 75 && buffer[2] === 3 && buffer[3] === 4;
      const isRarParams = buffer[0] === 82 && buffer[1] === 97 && buffer[2] === 114 && buffer[3] === 33;
      const isHtml = buffer[0] === 60;
      if (isHtml) {
        console.error(`HTML content detected: ${buffer.toString("utf8")}`);
        if (win) win.webContents.send("game:log", `[ERROR] O link retornou uma página HTML (não é direto). Verifique o link!`);
        return;
      }
      if (isRarParams) {
        console.log("RAR file detected via Magic Bytes.");
        if (win) win.webContents.send("game:log", `[WARNING] O arquivo baixado é um .RAR (Bytes: ${buffer.toString("hex")}). O launcher NÃO extrai RAR automaticamente. Converta para .ZIP!`);
        return;
      }
      if (!isZipParams) {
        console.error(`Invalid magic bytes: ${buffer.toString("hex")}`);
        if (win) win.webContents.send("game:log", `[ERROR] O arquivo baixado não é um ZIP nem RAR válido (Bytes: ${buffer.toString("hex")}). O link pode estar quebrado.`);
        return;
      }
    } catch (checkErr) {
      console.error("Failed to check file header", checkErr);
    }
    if (win) win.webContents.send("game:log", `[MODS] Arquivo ZIP válido detectado. Extraindo...`);
    const AdmZip = require("adm-zip");
    try {
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(root, true);
      fs.writeFileSync(modsInfoPath, JSON.stringify({ etag: remoteEtag, size: remoteSize }, null, 2));
      console.log("Mods synced successfully");
      if (win) win.webContents.send("game:log", `[MODS] Mods atualizados com sucesso!`);
    } catch (zipError) {
      console.error("Failed to extract zip", zipError);
      if (win) win.webContents.send("game:log", `[ERROR] Falha ao extrair ZIP: ${zipError}`);
    }
  } catch (e) {
    console.error("Failed to sync mods", e);
    if (win) win.webContents.send("game:log", `[ERROR] Falha ao baixar mods: ${e}`);
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
  }
}
process.env.APP_ROOT = path.join(__dirname, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
let tray = null;
function createTray() {
  const iconPath = path.join(process.env.VITE_PUBLIC, "icon.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip("Pikamon Launcher");
  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Abrir Launcher",
      click: () => {
        win == null ? void 0 : win.show();
        win == null ? void 0 : win.focus();
      }
    },
    {
      label: "Sair",
      click: () => {
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    win == null ? void 0 : win.show();
    win == null ? void 0 : win.focus();
  });
}
function createWindow() {
  win = new BrowserWindow({
    title: "Pikamon Launcher",
    icon: path.join(process.env.VITE_PUBLIC, "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
      // Allow loading local resources if needed, though mostly for dev
    },
    frame: true,
    // Keep standard frame for now, maybe custom later
    width: 1e3,
    height: 700,
    backgroundColor: "#111827",
    // match gray-900
    autoHideMenuBar: true
  });
  win.setMenu(null);
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
ipcMain.handle("auth:login", async (_event, args) => {
  try {
    const username = args.username || "Steve";
    const uuid = crypto.randomUUID().replace(/-/g, "");
    return {
      success: true,
      profile: { name: username, id: uuid },
      token: {
        access_token: uuid,
        client_token: uuid,
        uuid,
        name: username,
        user_properties: "{}"
      }
    };
  } catch (e) {
    console.error("Auth failed", e);
    return { success: false, error: String(e) };
  }
});
ipcMain.handle("game:launch", async (_event, options) => {
  const launcher = new Client();
  const opts = {
    authorization: options.auth,
    root: path.join(app.getPath("appData"), ".launcher_1_21_1"),
    version: {
      number: "1.21.1",
      type: "release",
      custom: "neoforge-21.1.216"
    },
    memory: {
      max: options.memory || "4G",
      min: "2G"
    },
    javaPath: options.javaPath || void 0,
    customArgs: [
      "-Djava.net.preferIPv6Addresses=system",
      `-DignoreList=client-extra,neoforge-21.1.216.jar`,
      `-DlibraryDirectory=${path.join(path.join(app.getPath("appData"), ".launcher_1_21_1"), "libraries")}`,
      "-p",
      [
        "cpw/mods/bootstraplauncher/2.0.2/bootstraplauncher-2.0.2.jar",
        "cpw/mods/securejarhandler/3.0.8/securejarhandler-3.0.8.jar",
        "org/ow2/asm/asm-commons/9.8/asm-commons-9.8.jar",
        "org/ow2/asm/asm-util/9.8/asm-util-9.8.jar",
        "org/ow2/asm/asm-analysis/9.8/asm-analysis-9.8.jar",
        "org/ow2/asm/asm-tree/9.8/asm-tree-9.8.jar",
        "org/ow2/asm/asm/9.8/asm-9.8.jar",
        "net/neoforged/JarJarFileSystems/0.4.1/JarJarFileSystems-0.4.1.jar"
      ].map((lib) => path.join(path.join(app.getPath("appData"), ".launcher_1_21_1"), "libraries", lib)).join(path.delimiter),
      "--add-modules",
      "ALL-MODULE-PATH",
      "--add-opens",
      "java.base/java.util.jar=cpw.mods.securejarhandler",
      "--add-opens",
      "java.base/java.lang.invoke=cpw.mods.securejarhandler",
      "--add-exports",
      "java.base/sun.security.util=cpw.mods.securejarhandler",
      "--add-exports",
      "jdk.naming.dns/com.sun.jndi.dns=java.naming"
    ],
    overrides: {
      detached: false
    },
    // Auto-Connect Arguments
    // Auto-Connect Arguments
    quickPlay: {
      type: "multiplayer",
      identifier: "localhost:25565"
    }
  };
  if (options.server) {
    opts.quickPlay = {
      type: "multiplayer",
      identifier: `${options.server}:${options.port || 25565}`
    };
  }
  launcher.on("debug", (e) => {
    console.log("[DEBUG]", e);
    win == null ? void 0 : win.webContents.send("game:log", `[DEBUG] ${e}`);
  });
  launcher.on("data", (e) => {
    console.log("[DATA]", e);
    win == null ? void 0 : win.webContents.send("game:data", `[DATA] ${e}`);
  });
  launcher.on("progress", (e) => {
    win == null ? void 0 : win.webContents.send("game:progress", e);
  });
  launcher.on("close", (e) => {
    console.log("[CLOSE]", e);
    win == null ? void 0 : win.webContents.send("game:close", e);
    win == null ? void 0 : win.show();
    win == null ? void 0 : win.focus();
  });
  launcher.on("download-status", (e) => {
    if (e.type && e.current && e.total) {
      win == null ? void 0 : win.webContents.send("game:log", `[DOWNLOAD] ${e.type} - ${Math.round(e.current / e.total * 100)}%`);
    }
  });
  try {
    const neoVersion = "21.1.216";
    try {
      await syncMods(opts.root);
    } catch (err) {
      console.error("Mod sync failed but continuing launch:", err);
      if (win) win.webContents.send("game:log", `[WARNING] Falha ao sincronizar mods (continuando assim mesmo): ${err}`);
    }
    await ensureNeoForge(opts.root, neoVersion);
    console.log("Starting launcher with opts:", JSON.stringify(opts, null, 2));
    await launcher.launch(opts);
    win == null ? void 0 : win.hide();
    return { success: true };
  } catch (e) {
    console.error("Launch failed", e);
    return { success: false, error: String(e) };
  }
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  createTray();
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
