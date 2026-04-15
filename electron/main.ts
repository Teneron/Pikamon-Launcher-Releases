import { app, ipcMain, Menu, nativeImage, BrowserWindow, Tray } from 'electron'
import { autoUpdater } from 'electron-updater'
import { Client } from 'minecraft-launcher-core'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { spawn } from 'node:child_process'
// ...


import https from 'node:https'
import http from 'node:http'

// Polyfill for CommonJS compatibility (REMOVED - Native CJS)
// const __dirname = path.dirname(fileURLToPath(import.meta.url))
// ...
// ... (rest of imports)

// Helper to download file
// Helper to download file
// Helper to download file
function downloadFile(url: string, dest: string, label: string = 'Baixando Arquivos...'): Promise<void> {
  return new Promise((resolve, reject) => {
    // Overwrite existing file
    if (fs.existsSync(dest)) {
      try {
        fs.unlinkSync(dest)
      } catch (e) {
        // ignore
      }
    }

    const handleDownload = (downloadUrl: string) => {
      const client = downloadUrl.startsWith('https') ? https : http

      client.get(downloadUrl, (response) => {
        // Handle Redirects - follow before opening file stream
        if (response.statusCode !== undefined && response.statusCode >= 300 && response.statusCode < 400) {
          if (response.headers.location) {
            response.resume() // consume/discard response body
            console.log(`Redirecting to: ${response.headers.location}`)
            handleDownload(response.headers.location)
            return
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download ${downloadUrl}: ${response.statusCode} ${response.statusMessage}`))
          return
        }

        // Only open file stream after we have a 200 response (no more redirects)
        const file = fs.createWriteStream(dest)

        const contentLength = response.headers['content-length']
        const total = contentLength ? parseInt(contentLength, 10) : 0
        let received = 0
        let lastLogTime = 0

        response.on('data', (chunk) => {
          received += chunk.length
          const now = Date.now()

          if (now - lastLogTime > 100) {
            lastLogTime = now
            if (win) {
              win.webContents.send('game:progress', {
                task: received,
                total: total,
                type: label
              })
            }
          }
        })

        response.pipe(file)

        file.on('finish', () => {
          file.close(() => {
            if (total > 0 && received < total) {
              fs.unlink(dest, () => { })
              reject(new Error(`Download incompleto: recebeu ${received} de ${total} bytes`))
            } else {
              resolve()
            }
          })
        })

        file.on('error', (err) => {
          fs.unlink(dest, () => { })
          reject(err)
        })

      }).on('error', (err) => {
        reject(err)
      })
    }

    handleDownload(url)

  })
}

// Helper to get remote file headers (handling redirects)
function getRemoteFileHeaders(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const handleRequest = (requestUrl: string) => {
      const client = requestUrl.startsWith('https') ? https : http
      const req = client.request(requestUrl, { method: 'HEAD' }, (res) => {
        if (res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400) {
          if (res.headers.location) {
            handleRequest(res.headers.location)
            return
          }
        }
        resolve(res.headers)
      })
      req.on('error', reject)
      req.end()
    }
    handleRequest(url)
  })
}

// Java 21 Helpers
function getJava21Path(): string | null {
  const javaRoot = "C:\\Program Files\\Java"

  // Direct check first (optimization)
  const defaultPath = path.join(javaRoot, "jdk-21", "bin", "java.exe")
  if (fs.existsSync(defaultPath)) {
    return defaultPath
  }

  // Scan for versioned folders (e.g. jdk-21.0.2)
  if (fs.existsSync(javaRoot)) {
    try {
      const entries = fs.readdirSync(javaRoot)
      const jdk21Folder = entries.find(entry => entry.startsWith("jdk-21") && fs.existsSync(path.join(javaRoot, entry, "bin", "java.exe")))

      if (jdk21Folder) {
        return path.join(javaRoot, jdk21Folder, "bin", "java.exe")
      }
    } catch (e) {
      console.error("Error scanning Java directory:", e)
    }
  }

  return null
}

async function ensureJava21() {
  const existingPath = getJava21Path()
  if (existingPath) {
    console.log("Java 21 found at:", existingPath)
    return existingPath
  }

  console.log("Java 21 not found. Starting installation process...")
  if (win) win.webContents.send('game:log', `[JAVA] Java 21 não encontrado. Baixando...`)

  const javaUrl = "https://download.oracle.com/java/21/latest/jdk-21_windows-x64_bin.exe"
  const installerPath = path.join(app.getPath('temp'), 'jdk-21_windows-x64_bin.exe')

  try {
    if (win) win.webContents.send('game:log', `[JAVA] Baixando instalador do Java 21...`)
    await downloadFile(javaUrl, installerPath, "Baixando Java 21...")

    // Validate file
    if (!fs.existsSync(installerPath) || fs.statSync(installerPath).size < 1000000) {
      throw new Error("O arquivo do instalador parece estar corrompido ou incompleto.")
    }

    // Install
    if (win) win.webContents.send('game:log', `[JAVA] Executando instalador... Siga as instruções na tela e aguarde!`)

    await new Promise<void>((resolve, reject) => {
      // Use shell: true to handle elevation/UAC better on Windows
      const process = spawn(installerPath, [], {
        stdio: 'ignore',
        windowsHide: false,
        shell: true
      })

      process.on('close', () => {
        resolve()
      })

      process.on('error', (err) => reject(err))
    })

    // Wait for installation to complete (Poll for file existence)
    if (win) win.webContents.send('game:log', `[JAVA] Aguardando conclusão da instalação (pode demorar alguns minutos)...`)

    let attempts = 0
    const maxAttempts = 60 // 60 * 2s = 120 seconds timeout
    let foundPath: string | null = null

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 2000)) // Wait 2 seconds
      attempts++

      const checkPath = getJava21Path()
      if (checkPath) {
        foundPath = checkPath
        break
      }

      if (attempts % 5 === 0) {
        if (win) win.webContents.send('game:log', `[JAVA] Ainda aguardando instalação... (${attempts * 2}s)`)
      }
    }

    if (foundPath) {
      if (win) win.webContents.send('game:log', `[JAVA] Java 21 detectado com sucesso!`)
      return foundPath
    } else {
      throw new Error("Tempo limite excedido. Java 21 não foi detectado no local padrão (C:\\Program Files\\Java\\jdk-21\\bin\\java.exe) após 2 minutos. Se você instalou em outro local, configure manualmente ou tente novamente.")
    }

  } catch (e) {
    console.error("Failed to install Java 21", e)
    if (win) win.webContents.send('game:log', `[ERROR] Falha ao instalar Java 21: ${e}`)
    throw e
  } finally {
    if (fs.existsSync(installerPath)) {
      try { fs.unlinkSync(installerPath) } catch (e) { /* ignore */ }
    }
  }
}

// Ensure NeoForge is installed
async function ensureNeoForge(root: string, neoVersion: string) {
  const versionFolder = path.join(root, 'versions', `neoforge-${neoVersion}`)
  if (fs.existsSync(versionFolder)) {
    console.log("NeoForge already installed:", neoVersion)
    return
  }

  console.log("Installing NeoForge:", neoVersion)
  const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoVersion}/neoforge-${neoVersion}-installer.jar`
  const installerPath = path.join(app.getPath('temp'), `neoforge-${neoVersion}-installer.jar`)

  try {
    if (win) win.webContents.send('game:log', `[INSTALL] Baixando NeoForge ${neoVersion}...`)
    await downloadFile(installerUrl, installerPath, `Baixando NeoForge ${neoVersion}...`)

    if (win) win.webContents.send('game:log', `[INSTALL] Executando instalador NeoForge...`)

    // Fix: Installer needs launcher_profiles.json
    const profilesPath = path.join(root, 'launcher_profiles.json')
    if (!fs.existsSync(profilesPath)) {
      fs.writeFileSync(profilesPath, JSON.stringify({}, null, 2))
    }

    // Run installer
    await new Promise<void>((resolve, reject) => {
      const java = "java" // Assumes java is in path, or use bundled one if available
      const process = spawn(java, ["-jar", installerPath, "--installClient", root], {
        stdio: 'ignore', // Ignore stdio to prevent console window if possible
        windowsHide: true // Explicitly hide window on Windows
      })

      process.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(`Installer exited with code ${code}`))
      })
    })

    console.log("NeoForge installed successfully")
    if (win) win.webContents.send('game:log', `[INSTALL] NeoForge instalado com sucesso!`)

  } catch (e) {
    console.error("Failed to install NeoForge", e)
    if (win) win.webContents.send('game:log', `[ERROR] Falha ao instalar NeoForge: ${e}`)
    throw e
  } finally {
    if (fs.existsSync(installerPath)) fs.unlinkSync(installerPath)
  }
}


// Sync Mods
async function syncMods(root: string) {
  // Placeholder URL - User needs to replace this with a DIRECT download link (e.g. GitHub Release, or direct file host)
  // Google Drive links require complex handling (OAuth or scraping confirm tokens), which is unreliable for automation.
  // Dynamic Config URL - Hosted on this project's raw GitHub (needs to be updated to the final repository URL)
  // For now, it searches for launcher-config.json ideally hosted on a fixed URL. 
  // IMPORTANT: The USER must replace this raw GitHub URL with their actual repository's raw URL!
  const configUrl = "https://raw.githubusercontent.com/Teneron/Pikamon-Launcher-Releases/main/public/launcher-config.json"; // REPLACE THIS URL

  let modsUrl = "";
  try {
    if (win) win.webContents.send('game:log', `[UPDATE] Buscando link atualizado dos mods...`);
    const { data } = await import('axios').then(a => a.default.get(configUrl));
    modsUrl = data.modsUrl;
    if (!modsUrl) throw new Error("Config found, but 'modsUrl' is missing.");
  } catch (err) {
    console.error("Failed to fetch dynamic mods config:", err);
    if (win) win.webContents.send('game:log', `[WARNING] Não foi possível verificar o link dinâmico; usando o link embutido por segurança.`);
    // Fallback link in case GitHub is down or the repo is private/unavailable
    modsUrl = "https://www.dropbox.com/scl/fi/do9cc5855idcmplmj9d54/mods.zip?rlkey=9q0two8mg3wut0w7nswh79zgl&st=28d3il90&dl=1";
  }
  const modsDir = path.join(root, 'mods')
  const modsInfoPath = path.join(root, 'mods_info.json')

  // Robust extension check ignoring query params
  const urlPath = modsUrl.split('?')[0]
  const isRarUrl = urlPath.endsWith('.rar')
  const zipPath = path.join(app.getPath('temp'), isRarUrl ? 'mods.rar' : 'mods.zip')

  // If no URL configured, skip
  if (!modsUrl) {
    console.log("No modpack URL configured, skipping sync.")
    return
  }

  try {
    if (win) win.webContents.send('game:log', `[MODS] Verificando atualizações...`)

    // Check for updates
    let shouldDownload = true
    let remoteEtag = ""
    let remoteSize = ""

    try {
      const headers = await getRemoteFileHeaders(modsUrl)
      remoteEtag = headers.etag || ""
      remoteSize = headers['content-length'] || ""

      if (fs.existsSync(modsInfoPath)) {
        try {
          const localInfo = JSON.parse(fs.readFileSync(modsInfoPath, 'utf-8'))
          if (localInfo.etag === remoteEtag && localInfo.size === remoteSize && remoteEtag !== "") {
            console.log("Mods are up to date (ETag matched).")
            shouldDownload = false
            if (win) win.webContents.send('game:log', `[MODS] Mods já estão atualizados.`)
          }
        } catch (e) { /* ignore json error */ }
      }
    } catch (headErr) {
      console.warn("Failed to check remote headers, defaulting to download if missing", headErr)
      if (win) win.webContents.send('game:log', `[WARNING] Não foi possível verificar atualizações.`)
      // If we can't check headers, we might be offline or link is down.
      // If mods directory exists, maybe we shouldn't force download?
      // For now, let's proceed to try download (which might fail too) or assume we need it if folder missing.
      if (fs.existsSync(modsDir) && fs.readdirSync(modsDir).length > 0) {
        shouldDownload = false // Assume offline mode or check failure means "keep what we have"
        if (win) win.webContents.send('game:log', `[MODS] Verificação falhou, mantendo mods atuais.`)
      }
    }

    if (!shouldDownload) return

    if (win) win.webContents.send('game:log', `[MODS] Baixando pacote de mods...`)

    // 1. Download
    try {
      if (win) win.webContents.send('game:log', `[MODS] Iniciando download...`)
      await downloadFile(modsUrl, zipPath, "Baixando Mods...")

      // Verify file size
      const stat = fs.statSync(zipPath)
      if (stat.size < 1000) { // arbitrary small size check, or check against content-length if possible
        throw new Error(`Arquivo muito pequeno (${stat.size} bytes). Download incompleto ou link quebrado.`)
      }
    } catch (dErr) {
      if (win) win.webContents.send('game:log', `[ERROR] Falha no download: ${dErr}`)
      throw dErr
    }

    // Check magic bytes
    try {
      const fd = fs.openSync(zipPath, 'r')
      const buffer = Buffer.alloc(4)
      fs.readSync(fd, buffer, 0, 4, 0)
      fs.closeSync(fd)

      // ZIP magic bytes: 50 4B 03 04
      const isZipParams = (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04)
      // RAR magic bytes: 52 61 72 21
      const isRarParams = (buffer[0] === 0x52 && buffer[1] === 0x61 && buffer[2] === 0x72 && buffer[3] === 0x21)
      // HTML doctype: <
      const isHtml = (buffer[0] === 0x3C) // <

      if (isHtml) {
        console.error(`HTML content detected: ${buffer.toString('utf8')}`)
        if (win) win.webContents.send('game:log', `[ERROR] O link retornou uma página HTML (não é direto). Verifique o link!`)
        return
      }

      if (isRarParams) {
        console.log("RAR file detected via Magic Bytes.")
        if (win) win.webContents.send('game:log', `[WARNING] O arquivo baixado é um .RAR (Bytes: ${buffer.toString('hex')}). O launcher NÃO extrai RAR automaticamente. Converta para .ZIP!`)
        return
      }

      if (!isZipParams) {
        console.error(`Invalid magic bytes: ${buffer.toString('hex')}`)
        if (win) win.webContents.send('game:log', `[ERROR] O arquivo baixado não é um ZIP nem RAR válido (Bytes: ${buffer.toString('hex')}). O link pode estar quebrado.`)
        return
      }
    } catch (checkErr) {
      console.error("Failed to check file header", checkErr)
    }

    // 2. Extract
    if (win) win.webContents.send('game:log', `[MODS] Arquivo ZIP válido detectado. Extraindo...`)

    // Fix: Use createRequire for CommonJS modules in ESM
    // const require = createRequire(import.meta.url)
    /* @ts-ignore */
    const AdmZip = require("adm-zip")

    try {
      const zip = new AdmZip(zipPath)
      // Extract to root, as the zip already contains a "mods" folder
      zip.extractAllTo(root, true) // overwrite

      // Nested folder check removed as we create/extract to root now
      // which should correctly place "mods" folder if zip structure is correct (root/mods/...)

      // Save cache info
      fs.writeFileSync(modsInfoPath, JSON.stringify({ etag: remoteEtag, size: remoteSize }, null, 2))

      console.log("Mods synced successfully")
      if (win) win.webContents.send('game:log', `[MODS] Mods atualizados com sucesso!`)
    } catch (zipError) {
      console.error("Failed to extract zip", zipError)
      if (win) win.webContents.send('game:log', `[ERROR] Falha ao extrair ZIP: ${zipError}`)
    }

  } catch (e) {
    console.error("Failed to sync mods", e)
    if (win) win.webContents.send('game:log', `[ERROR] Falha ao baixar mods: ${e}`)
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
  }
}

// Enable resource pack in options.txt automatically
function enableResourcePack(root: string, packName: string) {
  const optionsPath = path.join(root, 'options.txt');
  const packEntry = `"file/${packName}"`;

  if (!fs.existsSync(optionsPath)) {
    fs.writeFileSync(optionsPath, `resourcePacks:["vanilla",${packEntry}]\n`, 'utf-8');
    return;
  }

  try {
    let content = fs.readFileSync(optionsPath, 'utf-8');
    const lines = content.split('\n');
    let modified = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('resourcePacks:')) {
        const match = lines[i].match(/resourcePacks:\[(.*)\]/);
        if (match) {
          const currentPacksStr = match[1].trim();
          const currentPacks = currentPacksStr ? currentPacksStr.split(',').map(s => s.trim()) : [];
          if (!currentPacks.includes(packEntry)) {
            currentPacks.push(packEntry);
            lines[i] = `resourcePacks:[${currentPacks.join(',')}]`;
            modified = true;
          }
        } else {
          lines[i] = `resourcePacks:["vanilla",${packEntry}]`;
          modified = true;
        }
        break; // found the line
      }
    }

    if (modified) {
      fs.writeFileSync(optionsPath, lines.join('\n'), 'utf-8');
      console.log(`Enabled resource pack: ${packName}`);
    }
  } catch (err) {
    console.error("Failed to enable resource pack automatically:", err);
  }
}

// Download and sync a single resource pack by name and URL
async function syncSingleResourcePack(root: string, packName: string, packUrl: string) {
  const rpDir = path.join(root, 'resourcepacks');
  if (!fs.existsSync(rpDir)) {
    fs.mkdirSync(rpDir, { recursive: true });
  }

  const packBaseName = packName.replace(/\.zip$/i, '');
  const rpInfoPath = path.join(root, `resourcepack_info_${packBaseName}.json`);
  const destPath = path.join(rpDir, packName);
  const tempZipPath = path.join(app.getPath('temp'), `${packBaseName}_Update.zip`);

  try {
    let shouldDownload = true;
    let remoteEtag = "";
    let remoteSize = "";

    try {
      const headers = await getRemoteFileHeaders(packUrl);
      remoteEtag = headers.etag || "";
      remoteSize = headers['content-length'] || "";

      if (fs.existsSync(rpInfoPath)) {
        try {
          const localInfo = JSON.parse(fs.readFileSync(rpInfoPath, 'utf-8'));
          if (localInfo.etag === remoteEtag && localInfo.size === remoteSize && remoteEtag !== "") {
            console.log(`Resource pack ${packName} is up to date (ETag matched).`);
            shouldDownload = false;
          }
        } catch (e) { /* ignore json error */ }
      }
    } catch (headErr) {
      console.warn(`Failed to check remote headers for ${packName}, defaulting to download if missing`, headErr);
      if (fs.existsSync(destPath)) {
        shouldDownload = false;
      }
    }

    if (!shouldDownload) {
      enableResourcePack(root, packName);
      return;
    }

    if (win) win.webContents.send('game:log', `[RPACK] Baixando ${packName}...`);

    try {
      await downloadFile(packUrl, tempZipPath, `Baixando ${packName}...`);

      const stat = fs.statSync(tempZipPath);
      if (stat.size < 1000) {
        throw new Error(`Arquivo muito pequeno (${stat.size} bytes). Download incompleto.`);
      }

      // Check ZIP magic bytes
      const fd = fs.openSync(tempZipPath, 'r');
      const buffer = Buffer.alloc(4);
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);
      const isZipParams = (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04);

      if (!isZipParams) {
        throw new Error(`O arquivo baixado não é um ZIP válido (Bytes: ${buffer.toString('hex')}).`);
      }

      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.copyFileSync(tempZipPath, destPath);

      fs.writeFileSync(rpInfoPath, JSON.stringify({ etag: remoteEtag, size: remoteSize }, null, 2));

      console.log(`Resource pack ${packName} synced successfully`);
      if (win) win.webContents.send('game:log', `[RPACK] ${packName} atualizado com sucesso!`);

      enableResourcePack(root, packName);

    } catch (dErr) {
      if (win) win.webContents.send('game:log', `[ERROR] Falha no download de ${packName}: ${dErr}`);
      throw dErr;
    }

  } catch (e) {
    console.error(`Failed to sync resource pack ${packName}`, e);
    if (win) win.webContents.send('game:log', `[ERROR] Falha ao atualizar ${packName}: ${e}`);
  } finally {
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
  }
}

// Sync Resource Packs (main + additional from config)
async function syncResourcePack(root: string) {
  const configUrl = "https://raw.githubusercontent.com/Teneron/Pikamon-Launcher-Releases/main/public/launcher-config.json";
  let rpUrl = "";
  let additionalPacks: { name: string; url: string }[] = [];

  try {
    if (win) win.webContents.send('game:log', `[UPDATE] Verificando pacotes de texturas do servidor...`);
    const { data } = await import('axios').then(a => a.default.get(configUrl));
    rpUrl = data.resourcePackUrl;
    if (data.resourcePacks && Array.isArray(data.resourcePacks)) {
      additionalPacks = data.resourcePacks;
    }
  } catch (err) {
    console.error("Failed to fetch dynamic config for resource pack:", err);
    // Fallback links in case GitHub is down
    rpUrl = "https://www.dropbox.com/scl/fi/gcmkwkuwposkprg8nxdjm/Pikamon.zip?rlkey=9askwg6s3ba0pbc2ti4j6a5w2&st=9ldlutjb&dl=1";
    additionalPacks = [
      { name: "PikamonI.zip", url: "https://www.dropbox.com/scl/fi/lgpwmwoegsz3xw13s657q/PikamonI.zip?rlkey=zpxap6d9wdiwz4n87nfxupi9p&st=6p2lzicg&dl=1" },
      { name: "PikamonS.zip", url: "https://www.dropbox.com/scl/fi/epmnxfbahukz8my5lrdiv/PikamonS.zip?rlkey=jdiio5k6z6l99rq7gxkgktl5g&st=7sudesmr&dl=1" }
    ];
  }

  // Sync main resource pack (Pikamon.zip)
  if (rpUrl) {
    await syncSingleResourcePack(root, 'Pikamon.zip', rpUrl);
  }

  // Sync additional resource packs (PikamonI.zip, PikamonS.zip, etc.)
  for (const pack of additionalPacks) {
    if (pack.name && pack.url) {
      try {
        await syncSingleResourcePack(root, pack.name, pack.url);
      } catch (err) {
        console.error(`Failed to sync additional resource pack ${pack.name}:`, err);
        if (win) win.webContents.send('game:log', `[WARNING] Falha ao sincronizar ${pack.name}, continuando...`);
      }
    }
  }
}




// The built directory structure
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null
let tray: Tray | null = null

function createTray() {
  const iconPath = path.join(process.env.VITE_PUBLIC, 'icon.png')
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

  tray = new Tray(icon)
  tray!.setToolTip('Pikamon Launcher')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Launcher',
      click: () => {
        win?.show()
        win?.focus()
      }
    },
    {
      label: 'Sair',
      click: () => {
        app.quit()
      }
    }
  ])

  tray!.setContextMenu(contextMenu)

  tray!.on('click', () => {
    win?.show()
    win?.focus()
  })
}

function createWindow() {
  win = new BrowserWindow({
    title: 'Pikamon Launcher',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // Allow loading local resources if needed, though mostly for dev
    },
    frame: true, // Keep standard frame for now, maybe custom later
    width: 1000,
    height: 700,
    backgroundColor: '#111827', // match gray-900
    autoHideMenuBar: true,
  })

  // Remove default menu
  win!.setMenu(null)

  // Test active push message to Renderer-process.
  win!.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win!.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win!.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Auth Handler - Pikamon Yggdrasil API
const PIKAMON_AUTH_URL = 'https://pikamon.com.br/api/yggdrasil/authserver/authenticate';

ipcMain.handle('auth:login', async (_event: any, args: any) => {
  try {
    const username = args.username || ""
    const password = args.password || ""

    if (!username || !password) {
      return { success: false, error: "Username e senha são obrigatórios." }
    }

    // Authenticate against Pikamon site Yggdrasil API
    const axios = (await import('axios')).default;
    
    try {
      const response = await axios.post(PIKAMON_AUTH_URL, {
        username: username,
        password: password,
        clientToken: crypto.randomUUID().replace(/-/g, ''),
      }, {
        timeout: 10000,
        headers: { 'Content-Type': 'application/json' }
      });

      const data = response.data;
      const profile = data.selectedProfile;

      if (!profile) {
        return { success: false, error: "Resposta inválida do servidor de autenticação." }
      }

      return {
        success: true,
        profile: { name: profile.name, id: profile.id },
        token: {
          access_token: data.accessToken,
          client_token: data.clientToken,
          uuid: profile.id,
          name: profile.name,
          user_properties: "{}"
        }
      }
    } catch (authError: any) {
      if (authError.response) {
        const errData = authError.response.data;
        if (errData.errorMessage) {
          return { success: false, error: errData.errorMessage }
        }
        return { success: false, error: "Credenciais inválidas. Verifique seu username/email e senha." }
      }
      // Network error - server might be down
      return { success: false, error: "Não foi possível conectar ao servidor de autenticação. Verifique se o site está online." }
    }
  } catch (e) {
    console.error("Auth failed", e)
    return { success: false, error: String(e) }
  }
})

// Open external URLs (for "Create Account" link)
ipcMain.handle('open-external', async (_event: any, url: string) => {
  const { shell } = await import('electron');
  shell.openExternal(url);
})

// Game Launch Handler
ipcMain.handle('game:launch', async (_event: any, options: any) => {
  const launcher = new Client()

  // ========== SECURITY: Validate auth token before launching ==========
  const PIKAMON_VALIDATE_URL = 'https://pikamon.com.br/api/yggdrasil/authserver/validate';
  const PIKAMON_YGGDRASIL_URL = 'https://pikamon.com.br/api/yggdrasil';

  if (!options.auth || !options.auth.access_token || !options.auth.name) {
    return { success: false, error: "Autenticação obrigatória! Faça login com sua conta Pikamon." }
  }

  // Re-validate the access token against the auth server
  try {
    const axios = (await import('axios')).default;
    await axios.post(PIKAMON_VALIDATE_URL, {
      accessToken: options.auth.access_token,
    }, { timeout: 10000 });
    if (win) win.webContents.send('game:log', `[AUTH] Token validado com sucesso para ${options.auth.name}`);
  } catch (validateErr: any) {
    console.error("Token validation failed:", validateErr?.response?.status || validateErr.message);
    return { 
      success: false, 
      error: "Sua sessão expirou ou é inválida. Faça login novamente com sua conta Pikamon." 
    }
  }

  // ========== authlib-injector: Download if needed ==========
  const authlibDir = path.join(app.getPath('appData'), '.launcher_1_21_1', 'authlib')
  const authlibJar = path.join(authlibDir, 'authlib-injector.jar')

  if (!fs.existsSync(authlibDir)) {
    fs.mkdirSync(authlibDir, { recursive: true })
  }

  if (!fs.existsSync(authlibJar)) {
    try {
      if (win) win.webContents.send('game:log', '[SECURITY] Baixando authlib-injector para proteção de conta...')
      await downloadFile(
        'https://github.com/yushijinhun/authlib-injector/releases/download/v1.2.5/authlib-injector-1.2.5.jar',
        authlibJar,
        'Baixando Proteção de Conta...'
      )
      if (win) win.webContents.send('game:log', '[SECURITY] authlib-injector instalado com sucesso!')
    } catch (dlErr) {
      console.error("Failed to download authlib-injector:", dlErr)
      if (win) win.webContents.send('game:log', `[WARNING] Falha ao baixar authlib-injector: ${dlErr}`)
      // Continue without it - the server-side authlib will still protect
    }
  }

  // ========== Build custom JVM args with authlib-injector ==========
  const customJvmArgs: string[] = [
    "-Djava.net.preferIPv6Addresses=system",
    `-DignoreList=client-extra,neoforge-21.1.216.jar`,
    `-Dminecraft.launcher.brand=Pikamon`,
    `-Dbitcoin.j=null`,
    `-Dorg.lwjgl.opengl.Window.name=Pikamon Client`,
    `-DlibraryDirectory=${path.join(path.join(app.getPath('appData'), '.launcher_1_21_1'), 'libraries')}`,
  ]

  // Inject authlib-injector as a Java agent (points to our Yggdrasil API)
  if (fs.existsSync(authlibJar)) {
    customJvmArgs.unshift(`-javaagent:${authlibJar}=${PIKAMON_YGGDRASIL_URL}`)
    if (win) win.webContents.send('game:log', '[SECURITY] authlib-injector ativo - proteção de conta habilitada')
  }

  const opts = {
    authorization: options.auth,
    root: path.join(app.getPath('appData'), '.launcher_1_21_1'),
    version: {
      number: "1.21.1",
      type: "Pikamon",
      custom: "neoforge-21.1.216"
    },
    memory: {
      max: options.memory || "4G",
      min: "2G"
    },
    javaPath: await ensureJava21(), // Enforce Java 21
    customArgs: [
      ...customJvmArgs,
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
      ].map(lib => path.join(path.join(app.getPath('appData'), '.launcher_1_21_1'), 'libraries', lib)).join(path.delimiter),
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
    // quickPlay removed as requested
  }

  // Handle Server Auto-Connect if provided
  if (options.server) {
    // @ts-ignore - quickPlay might not be fully typed in older definitions
    opts.quickPlay = {
      type: "multiplayer" as const,
      identifier: `${options.server}:${options.port || 25565}`
    }
  }

  launcher.on('debug', () => {
  })
  launcher.on('data', (e) => {
    console.log("[DATA]", e)
    win?.webContents.send('game:data', `[DATA] ${e}`)
  })
  launcher.on('progress', (e) => {
    win?.webContents.send('game:progress', e)
  })
  launcher.on('close', (e) => {
    console.log("[CLOSE]", e)
    win?.webContents.send('game:close', e)
    win?.show()
    win?.focus()
  })
  launcher.on('download-status', (e) => {
    if (e.type && e.current && e.total) {
    }
  })

  try {
    const neoVersion = "21.1.216"

    // Sync Mods (Non-blocking / Log errors but continue)
    try {
      await syncMods(opts.root)
    } catch (err) {
      console.error("Mod sync failed but continuing launch:", err)
      if (win) win.webContents.send('game:log', `[WARNING] Falha ao sincronizar mods (continuando assim mesmo): ${err}`)
    }

    // Sync Resource Pack (Non-blocking)
    try {
      await syncResourcePack(opts.root)
    } catch (err) {
      console.error("Resource pack sync failed but continuing launch:", err)
      if (win) win.webContents.send('game:log', `[WARNING] Falha ao sincronizar texturas (continuando assim mesmo): ${err}`)
    }

    // Ensure Forge
    await ensureNeoForge(opts.root, neoVersion)

    console.log("Starting launcher with opts:", JSON.stringify(opts, null, 2))
    await launcher.launch(opts)

    // Hide window when game launches
    win?.hide()


    return { success: true }
  } catch (e) {
    console.error("Launch failed", e)
    return { success: false, error: String(e) }
  }
})

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  createTray()
  createWindow()

  // Configuração do AutoUpdater para GitHub Releases
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    if (win) {
      win.webContents.send('game:log', `[UPDATE] Uma nova atualização (${info.version}) foi encontrada! Baixando em segundo plano...`);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (win) {
      // Usar a mesma barra de progresso do jogo para mostrar o download da atualização
      win.webContents.send('game:progress', {
        task: progressObj.transferred,
        total: progressObj.total,
        type: `Baixando Atualização... ${Math.round(progressObj.percent)}%`
      });
    }
  });

  autoUpdater.on('update-downloaded', () => {
    if (win) {
      win.webContents.send('game:log', `[UPDATE] Atualização baixada com sucesso! O launcher será reiniciado em 3 segundos para instalar...`);
    }
    setTimeout(() => {
      autoUpdater.quitAndInstall();
    }, 3000);
  });

  autoUpdater.on('error', (err) => {
    if (win) {
      // Apenas pro log, não interrompe o uso do launcher caso esteja offline ou se o repositório ainda não existir
      win.webContents.send('game:log', `[UPDATE ERROR] Falha ao verificar/baixar atualização: ${err.message}`);
    }
  });

  // Checar atualizações assim que o app abriu
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    console.error("Erro ao verificar atualizações:", err);
  });
})
