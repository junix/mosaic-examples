/// <reference types="vite/client" />

declare global {
  interface Window {
    __mosaicDemo?: {
      ready: boolean;
      scene: string;
      rows: number;
      interactions: number;
      error?: string;
    };
  }
}

export {};
