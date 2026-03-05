import type { Configuration } from "@seonbi/wasm";
import { koKp, koKr } from "./seonbi-engine";
import type { ContentType, ExtensionSettings } from "./seonbi-settings";

function presetConfiguration(
  preset: "ko-kr" | "ko-kp",
  contentType: ContentType
): Configuration {
  const base = preset === "ko-kp" ? koKp() : koKr();
  return {
    ...base,
    contentType,
  };
}

export function toWasmConfiguration(
  settings: ExtensionSettings,
  contentTypeOverride?: ContentType
): Configuration {
  const contentType = contentTypeOverride ?? settings.contentType;
  if (settings.preset === "ko-kr" || settings.preset === "ko-kp") {
    return presetConfiguration(settings.preset, contentType);
  }

  const options = settings.customOptions;
  return {
    contentType,
    preset: undefined,
    quote: options.quote,
    cite: options.cite ?? undefined,
    arrow: options.arrow ?? undefined,
    ellipsis: options.ellipsis,
    emDash: options.emDash,
    stop: options.stop ?? undefined,
    hanja: options.hanja
      ? {
          rendering: options.hanja.rendering,
          reading: {
            initialSoundLaw: options.hanja.reading.initialSoundLaw,
            useDictionaries: options.hanja.reading.useDictionaries,
            dictionary: new Map(Object.entries(settings.customDictionary)),
          },
        }
      : undefined,
  };
}

