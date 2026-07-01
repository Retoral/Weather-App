import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("weatherWatch", {
  fetchText: (url: string) => ipcRenderer.invoke("fetch-text", url),
  fetchZipText: (url: string) => ipcRenderer.invoke("fetch-zip-text", url)
});
