import wasmInit, {
  koKp as wasmKoKp,
  koKr as wasmKoKr,
  transform as wasmTransform,
  type Configuration,
} from "@seonbi/wasm";

let initialized: Promise<void> | null = null;

export async function ensureWasmReady(): Promise<void> {
  if (initialized === null) {
    initialized = wasmInit()
      .then(() => undefined)
      .catch((error) => {
        initialized = null;
        throw error;
      });
  }
  return initialized;
}

export function koKr(): Configuration {
  return wasmKoKr();
}

export function koKp(): Configuration {
  return wasmKoKp();
}

export function transform(config: Configuration, input: string): string {
  return wasmTransform(config, input);
}

export type { Configuration };
