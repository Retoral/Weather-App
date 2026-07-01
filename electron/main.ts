import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import zlib from "node:zlib";

const isDev = !app.isPackaged;
const devServerUrl = process.argv
  .find((arg) => arg.startsWith("--dev-server="))
  ?.replace("--dev-server=", "");

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: "#0e1726",
    title: "Weather Watch",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && devServerUrl) {
    void window.loadURL(devServerUrl);
  } else {
    void window.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.whenReady().then(() => {
  ipcMain.handle("fetch-text", async (_event, url: string) => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Weather Watch Desktop 0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return response.text();
  });

  ipcMain.handle("fetch-zip-text", async (_event, url: string) => {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Weather Watch Desktop 0.1"
      }
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    return extractFirstZipEntryText(Buffer.from(await response.arrayBuffer()));
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function extractFirstZipEntryText(buffer: Buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw new Error("ZIP directory not found");

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  if (entryCount < 1 || buffer.readUInt32LE(centralDirectoryOffset) !== 0x02014b50) {
    throw new Error("ZIP entry not found");
  }

  const method = buffer.readUInt16LE(centralDirectoryOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralDirectoryOffset + 20);
  const fileNameLength = buffer.readUInt16LE(centralDirectoryOffset + 28);
  const extraLength = buffer.readUInt16LE(centralDirectoryOffset + 30);
  const localHeaderOffset = buffer.readUInt32LE(centralDirectoryOffset + 42);
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) throw new Error("ZIP local header not found");

  const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
  const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
  const inflated = method === 0 ? compressed : method === 8 ? zlib.inflateRawSync(compressed) : undefined;
  if (!inflated) throw new Error(`Unsupported ZIP compression ${method}`);

  // GDELT ZIPs contain a single UTF-8 CSV entry. Keep the name checks above
  // conservative and only decode after the central/local headers agree.
  void fileNameLength;
  void extraLength;
  return inflated.toString("utf8");
}

function findEndOfCentralDirectory(buffer: Buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }

  return -1;
}
