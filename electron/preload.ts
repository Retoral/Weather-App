import { contextBridge, ipcRenderer } from "electron";

type FetchTextResult = { ok: true; text: string } | { ok: false; error: string; status?: number };

async function fetchText(channel: "fetch-text" | "fetch-zip-text", url: string) {
  const result = await ipcRenderer.invoke(channel, url) as FetchTextResult;
  if (result.ok) return result.text;
  throw new Error(result.error);
}

contextBridge.exposeInMainWorld("weatherWatch", {
  fetchText: (url: string) => fetchText("fetch-text", url),
  fetchZipText: (url: string) => fetchText("fetch-zip-text", url)
});
