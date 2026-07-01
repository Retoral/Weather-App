/// <reference types="vite/client" />

interface Window {
  weatherWatch?: {
    fetchText: (url: string) => Promise<string>;
    fetchZipText: (url: string) => Promise<string>;
  };
}
