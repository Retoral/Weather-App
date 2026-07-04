/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface Window {
  weatherWatch?: {
    fetchText: (url: string) => Promise<string>;
    fetchZipText: (url: string) => Promise<string>;
    onSystemResume?: (callback: () => void) => () => void;
    openExternal?: (url: string) => Promise<void>;
  };
}
