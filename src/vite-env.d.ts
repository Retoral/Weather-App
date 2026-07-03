/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  weatherWatch?: {
    fetchText: (url: string) => Promise<string>;
    fetchZipText: (url: string) => Promise<string>;
    openExternal?: (url: string) => Promise<void>;
  };
}
