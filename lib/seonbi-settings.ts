import browser from "webextension-polyfill";

export const SETTINGS_STORAGE_KEY = "seonbi.settings.v1";

export type Preset = "ko-kr" | "ko-kp" | "custom";
export type ContentType =
  | "text/plain"
  | "text/html"
  | "application/xhtml+xml"
  | "text/markdown";
export type QuoteOption =
  | "CurvedQuotes"
  | "VerticalCornerBrackets"
  | "HorizontalCornerBrackets"
  | "Guillemets"
  | "CurvedSingleQuotesWithQ"
  | "VerticalCornerBracketsWithQ"
  | "HorizontalCornerBracketsWithQ";
export type CiteOption =
  | "AngleQuotes"
  | "CornerBrackets"
  | "AngleQuotesWithCite"
  | "CornerBracketsWithCite";
export type StopOption = "Horizontal" | "HorizontalWithSlashes" | "Vertical";
export type HanjaRenderingOption =
  | "HangulOnly"
  | "HanjaInParentheses"
  | "DisambiguatingHanjaInParentheses"
  | "HanjaInRuby";

export interface ExtensionCustomOptions {
  quote: QuoteOption;
  cite: CiteOption | null;
  arrow: {
    bidirArrow: boolean;
    doubleArrow: boolean;
  } | null;
  ellipsis: boolean;
  emDash: boolean;
  stop: StopOption | null;
  hanja: {
    rendering: HanjaRenderingOption;
    reading: {
      initialSoundLaw: boolean;
      useDictionaries: string[];
    };
  } | null;
}

export interface ExtensionSettings {
  preset: Preset;
  contentType: ContentType;
  customOptions: ExtensionCustomOptions;
  customDictionary: Record<string, string>;
}

const PRESETS: Preset[] = ["ko-kr", "ko-kp", "custom"];
const CONTENT_TYPES: ContentType[] = [
  "text/plain",
  "text/html",
  "application/xhtml+xml",
  "text/markdown",
];
const QUOTE_OPTIONS: QuoteOption[] = [
  "CurvedQuotes",
  "VerticalCornerBrackets",
  "HorizontalCornerBrackets",
  "Guillemets",
  "CurvedSingleQuotesWithQ",
  "VerticalCornerBracketsWithQ",
  "HorizontalCornerBracketsWithQ",
];
const CITE_OPTIONS: CiteOption[] = [
  "AngleQuotes",
  "CornerBrackets",
  "AngleQuotesWithCite",
  "CornerBracketsWithCite",
];
const STOP_OPTIONS: StopOption[] = [
  "Horizontal",
  "HorizontalWithSlashes",
  "Vertical",
];
const HANJA_RENDERING_OPTIONS: HanjaRenderingOption[] = [
  "HangulOnly",
  "HanjaInParentheses",
  "DisambiguatingHanjaInParentheses",
  "HanjaInRuby",
];

const DEFAULT_CUSTOM_OPTIONS: ExtensionCustomOptions = {
  quote: "CurvedQuotes",
  cite: "AngleQuotes",
  arrow: {
    bidirArrow: true,
    doubleArrow: true,
  },
  ellipsis: true,
  emDash: true,
  stop: "Horizontal",
  hanja: {
    rendering: "DisambiguatingHanjaInParentheses",
    reading: {
      initialSoundLaw: true,
      useDictionaries: ["kr-stdict"],
    },
  },
};

export const DEFAULT_SETTINGS: ExtensionSettings = {
  preset: "ko-kr",
  contentType: "text/plain",
  customOptions: DEFAULT_CUSTOM_OPTIONS,
  customDictionary: {},
};

let cachedSettings: ExtensionSettings | null = null;
let loadingPromise: Promise<ExtensionSettings> | null = null;
let storageListenerRegistered = false;

function cloneSettings(settings: ExtensionSettings): ExtensionSettings {
  return {
    preset: settings.preset,
    contentType: settings.contentType,
    customOptions: {
      quote: settings.customOptions.quote,
      cite: settings.customOptions.cite,
      arrow: settings.customOptions.arrow
        ? {
            bidirArrow: settings.customOptions.arrow.bidirArrow,
            doubleArrow: settings.customOptions.arrow.doubleArrow,
          }
        : null,
      ellipsis: settings.customOptions.ellipsis,
      emDash: settings.customOptions.emDash,
      stop: settings.customOptions.stop,
      hanja: settings.customOptions.hanja
        ? {
            rendering: settings.customOptions.hanja.rendering,
            reading: {
              initialSoundLaw: settings.customOptions.hanja.reading.initialSoundLaw,
              useDictionaries: [...settings.customOptions.hanja.reading.useDictionaries],
            },
          }
        : null,
    },
    customDictionary: { ...settings.customDictionary },
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOneOf<T extends string>(value: unknown, options: T[]): value is T {
  return typeof value === "string" && options.includes(value as T);
}

export function isContentType(value: unknown): value is ContentType {
  return isOneOf(value, CONTENT_TYPES);
}

function toRecordString(value: unknown): Record<string, string> {
  if (!isObject(value)) {
    return {};
  }

  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string") {
      result[key] = item;
    }
  }
  return result;
}

function normalizeSettings(value: unknown): ExtensionSettings {
  const normalized = cloneSettings(DEFAULT_SETTINGS);
  if (!isObject(value)) {
    return normalized;
  }

  if (isOneOf(value.preset, PRESETS)) {
    normalized.preset = value.preset;
  }

  if (isOneOf(value.contentType, CONTENT_TYPES)) {
    normalized.contentType = value.contentType;
  }

  if (isObject(value.customOptions)) {
    const customOptions = value.customOptions;

    if (isOneOf(customOptions.quote, QUOTE_OPTIONS)) {
      normalized.customOptions.quote = customOptions.quote;
    }
    if (customOptions.cite === null) {
      normalized.customOptions.cite = null;
    } else if (isOneOf(customOptions.cite, CITE_OPTIONS)) {
      normalized.customOptions.cite = customOptions.cite;
    }
    if (customOptions.arrow === null) {
      normalized.customOptions.arrow = null;
    } else if (isObject(customOptions.arrow)) {
      normalized.customOptions.arrow = {
        bidirArrow: Boolean(customOptions.arrow.bidirArrow),
        doubleArrow: Boolean(customOptions.arrow.doubleArrow),
      };
    }
    if (typeof customOptions.ellipsis === "boolean") {
      normalized.customOptions.ellipsis = customOptions.ellipsis;
    }
    if (typeof customOptions.emDash === "boolean") {
      normalized.customOptions.emDash = customOptions.emDash;
    }
    if (customOptions.stop === null) {
      normalized.customOptions.stop = null;
    } else if (isOneOf(customOptions.stop, STOP_OPTIONS)) {
      normalized.customOptions.stop = customOptions.stop;
    }
    if (customOptions.hanja === null) {
      normalized.customOptions.hanja = null;
    } else if (
      isObject(customOptions.hanja) &&
      isOneOf(customOptions.hanja.rendering, HANJA_RENDERING_OPTIONS) &&
      isObject(customOptions.hanja.reading)
    ) {
      normalized.customOptions.hanja = {
        rendering: customOptions.hanja.rendering,
        reading: {
          initialSoundLaw: Boolean(customOptions.hanja.reading.initialSoundLaw),
          useDictionaries: Array.isArray(customOptions.hanja.reading.useDictionaries)
            ? customOptions.hanja.reading.useDictionaries.filter(
                (item): item is string => typeof item === "string"
              )
            : [],
        },
      };
    }
  }

  normalized.customDictionary = toRecordString(value.customDictionary);
  return normalized;
}

export async function loadSettings(): Promise<ExtensionSettings> {
  if (!storageListenerRegistered) {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync" || !(SETTINGS_STORAGE_KEY in changes)) {
        return;
      }
      const change = changes[SETTINGS_STORAGE_KEY];
      cachedSettings = normalizeSettings(change?.newValue);
    });
    storageListenerRegistered = true;
  }

  if (cachedSettings !== null) {
    return cloneSettings(cachedSettings);
  }
  if (loadingPromise !== null) {
    return loadingPromise;
  }

  loadingPromise = browser.storage.sync
    .get(SETTINGS_STORAGE_KEY)
    .then((loaded) => normalizeSettings(loaded[SETTINGS_STORAGE_KEY]))
    .catch(() => cloneSettings(DEFAULT_SETTINGS))
    .then((normalized) => {
      cachedSettings = normalized;
      return cloneSettings(normalized);
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  const normalized = normalizeSettings(settings);
  cachedSettings = normalized;
  await browser.storage.sync.set({
    [SETTINGS_STORAGE_KEY]: normalized,
  });
}
