import { contextBridge, ipcRenderer } from "electron";

type FetchTextResult = { ok: true; text: string } | { ok: false; error: string; status?: number };
type OpenExternalResult = { ok: true } | { ok: false; error: string };
type SystemResumeCallback = () => void;

async function fetchText(channel: "fetch-text" | "fetch-zip-text", url: string) {
  const result = await ipcRenderer.invoke(channel, url) as FetchTextResult;
  if (result.ok) return result.text;
  throw new Error(result.error);
}

contextBridge.exposeInMainWorld("weatherWatch", {
  fetchText: (url: string) => fetchText("fetch-text", url),
  fetchZipText: (url: string) => fetchText("fetch-zip-text", url),
  onSystemResume: (callback: SystemResumeCallback) => {
    const listener = () => callback();
    ipcRenderer.on("system-resume", listener);
    return () => ipcRenderer.removeListener("system-resume", listener);
  },
  openExternal: async (url: string) => {
    const result = await ipcRenderer.invoke("open-external", url) as OpenExternalResult;
    if (!result.ok) throw new Error(result.error);
  }
});
