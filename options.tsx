import { useEffect, useMemo, useRef, useState } from "react";
import { toWasmConfiguration } from "./lib/seonbi-config";
import { ensureWasmReady, transform } from "./lib/seonbi-engine";
import {
  loadSettings,
  saveSettings,
  type ExtensionSettings,
  type HanjaRenderingOption,
  type QuoteOption,
} from "./lib/seonbi-settings";
import "./options.css";

const PREVIEW_SOURCE =
  '漢字語를..."선비"라고 하고, <<예시>>와 <- -> <-> 를 포함한다.';

const HANJA_RENDERINGS: Array<{ value: HanjaRenderingOption; label: string }> = [
  { value: "HangulOnly", label: "Hangul only" },
  { value: "HanjaInParentheses", label: "Hanja in parentheses" },
  {
    value: "DisambiguatingHanjaInParentheses",
    label: "Disambiguating hanja in parentheses",
  },
  { value: "HanjaInRuby", label: "Hanja in ruby" },
];

const QUOTE_OPTIONS: Array<{ value: QuoteOption; label: string }> = [
  { value: "CurvedQuotes", label: "Curved quotes" },
  { value: "VerticalCornerBrackets", label: "Vertical corner brackets" },
  { value: "HorizontalCornerBrackets", label: "Horizontal corner brackets" },
  { value: "Guillemets", label: "Guillemets" },
  { value: "CurvedSingleQuotesWithQ", label: "Curved quotes with q" },
  {
    value: "VerticalCornerBracketsWithQ",
    label: "Vertical corner brackets with q",
  },
  {
    value: "HorizontalCornerBracketsWithQ",
    label: "Horizontal corner brackets with q",
  },
];

function dictionaryToSource(dictionary: Record<string, string>): string {
  return Object.entries(dictionary)
    .map(([key, value]) => `${key} -> ${value}`)
    .join("\n");
}

function parseDictionarySource(
  source: string
): { dictionary: Record<string, string>; invalidLineCount: number } {
  const dictionary: Record<string, string> = {};
  let invalidLineCount = 0;
  const lines = source.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const match = /^(.*?)\s*(?:->|→)\s*(.*?)$/.exec(trimmed);
    if (match === null) {
      invalidLineCount += 1;
      continue;
    }
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) {
      dictionary[key] = value;
    } else {
      invalidLineCount += 1;
    }
  }
  return { dictionary, invalidLineCount };
}

function toComparableSettings(settings: ExtensionSettings): string {
  return JSON.stringify(settings);
}

function joinClasses(
  ...tokens: Array<string | false | null | undefined>
): string {
  return tokens.filter(Boolean).join(" ");
}

export default function OptionsPage() {
  const [savedSettings, setSavedSettings] = useState<ExtensionSettings | null>(null);
  const [draftSettings, setDraftSettings] = useState<ExtensionSettings | null>(null);
  const [dictionarySource, setDictionarySource] = useState("");
  const [previewResult, setPreviewResult] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const [isSaving, setIsSaving] = useState(false);
  const [invalidDictionaryLines, setInvalidDictionaryLines] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const previewVersionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadSettings()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setSavedSettings(loaded);
        setDraftSettings(loaded);
        setDictionarySource(dictionaryToSource(loaded.customDictionary));
        setInvalidDictionaryLines(0);
      });

    ensureWasmReady()
      .then(() => {
        if (!cancelled) {
          setInitialized(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(String(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialized || draftSettings === null) {
      return;
    }

    let cancelled = false;
    const currentVersion = previewVersionRef.current + 1;
    previewVersionRef.current = currentVersion;
    const debounceTimer = window.setTimeout(() => {
      if (!cancelled && currentVersion === previewVersionRef.current) {
        setPreviewBusy(true);
      }
    }, 120);
    setPreviewError(null);

    const transformTimer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        if (cancelled || currentVersion !== previewVersionRef.current) {
          return;
        }
        try {
          const config = toWasmConfiguration(draftSettings);
          const nextResult = transform(config, PREVIEW_SOURCE);
          if (!cancelled && currentVersion === previewVersionRef.current) {
            setPreviewResult(nextResult);
          }
        } catch (error) {
          if (!cancelled && currentVersion === previewVersionRef.current) {
            setPreviewError(String(error));
          }
        } finally {
          if (!cancelled && currentVersion === previewVersionRef.current) {
            setPreviewBusy(false);
          }
        }
      });
    }, 140);

    return () => {
      cancelled = true;
      window.clearTimeout(debounceTimer);
      window.clearTimeout(transformTimer);
    };
  }, [draftSettings, initialized]);

  const hasChanges = useMemo(() => {
    if (savedSettings === null || draftSettings === null) {
      return false;
    }
    return (
      invalidDictionaryLines === 0 &&
      toComparableSettings(savedSettings) !== toComparableSettings(draftSettings)
    );
  }, [savedSettings, draftSettings, invalidDictionaryLines]);

  function updateDraft(updater: (previous: ExtensionSettings) => ExtensionSettings): void {
    setDraftSettings((previous) => {
      if (previous === null) {
        return previous;
      }
      setSaveState("idle");
      return updater(previous);
    });
  }

  async function onSave(): Promise<void> {
    if (draftSettings === null || isSaving || invalidDictionaryLines > 0) {
      return;
    }
    try {
      setIsSaving(true);
      await saveSettings(draftSettings);
      setSavedSettings(draftSettings);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    } finally {
      setIsSaving(false);
    }
  }

  if (draftSettings === null) {
    return <main className="options-root">Loading settings...</main>;
  }

  const isCustom = draftSettings.preset === "custom";
  const arrowEnabled = isCustom && draftSettings.customOptions.arrow !== null;
  const hanjaEnabled = isCustom && draftSettings.customOptions.hanja !== null;
  const dictionaryCount = Object.keys(draftSettings.customDictionary).length;
  const stopDisabled = !isCustom;
  const useKrStdict =
    hanjaEnabled &&
    (draftSettings.customOptions.hanja?.reading.useDictionaries.includes(
      "kr-stdict"
    ) ??
      false);

  return (
    <main className="options-root">
      <div className="options-shell">
        <header className="options-header">
          <h1>Seonbi Settings</h1>
          <p>Selection transform uses the settings below.</p>
        </header>

        <section className="options-card">
          <h2>Preset</h2>
          <div className="row radio-row">
            <label
              className={joinClasses(
                "radio-option",
                draftSettings.preset === "ko-kr" && "selected"
              )}
            >
              <input
                type="radio"
                name="preset"
                checked={draftSettings.preset === "ko-kr"}
                onChange={() => updateDraft((previous) => ({ ...previous, preset: "ko-kr" }))}
              />
              <span>South Korean</span>
            </label>
            <label
              className={joinClasses(
                "radio-option",
                draftSettings.preset === "ko-kp" && "selected"
              )}
            >
              <input
                type="radio"
                name="preset"
                checked={draftSettings.preset === "ko-kp"}
                onChange={() => updateDraft((previous) => ({ ...previous, preset: "ko-kp" }))}
              />
              <span>North Korean</span>
            </label>
            <label
              className={joinClasses(
                "radio-option",
                draftSettings.preset === "custom" && "selected"
              )}
            >
              <input
                type="radio"
                name="preset"
                checked={draftSettings.preset === "custom"}
                onChange={() => updateDraft((previous) => ({ ...previous, preset: "custom" }))}
              />
              <span>Custom</span>
            </label>
          </div>
        </section>

        <section className="options-card">
          <h2>General</h2>
          <div className="row">
            <label className="field">
              Content Type
              <select
                value={draftSettings.contentType}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    contentType: event.target.value as ExtensionSettings["contentType"],
                  }))
                }
              >
                <option value="text/plain">Plain text</option>
                <option value="text/html">HTML</option>
                <option value="application/xhtml+xml">XHTML</option>
                <option value="text/markdown">Markdown</option>
              </select>
            </label>
          </div>
        </section>

        <section className="options-card">
          <h2>Punctuation</h2>
          <div className="row">
            <label
              className={joinClasses(
                "field",
                "check",
                "toggle-option",
                isCustom && draftSettings.customOptions.ellipsis && "selected",
                !isCustom && "disabled"
              )}
            >
              <input
                type="checkbox"
                disabled={!isCustom}
                checked={isCustom && draftSettings.customOptions.ellipsis}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      ellipsis: event.target.checked,
                    },
                  }))
                }
              />
              <span>Ellipsis</span>
            </label>
            <label
              className={joinClasses(
                "field",
                "check",
                "toggle-option",
                isCustom && draftSettings.customOptions.emDash && "selected",
                !isCustom && "disabled"
              )}
            >
              <input
                type="checkbox"
                disabled={!isCustom}
                checked={isCustom && draftSettings.customOptions.emDash}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      emDash: event.target.checked,
                    },
                  }))
                }
              />
              <span>Em dash</span>
            </label>
          </div>
        </section>

        <section className="options-card">
          <h2>Quote / Citation</h2>
          <div className="row">
            <label className="field">
              Quote
              <select
                disabled={!isCustom}
                value={draftSettings.customOptions.quote}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      quote: event.target.value as QuoteOption,
                    },
                  }))
                }
              >
                {QUOTE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Citation
              <select
                disabled={!isCustom}
                value={isCustom ? draftSettings.customOptions.cite ?? "" : ""}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      cite:
                        event.target.value === ""
                          ? null
                          : (event.target.value as ExtensionSettings["customOptions"]["cite"]),
                    },
                  }))
                }
              >
                <option value="">As is</option>
                <option value="AngleQuotes">Angle quotes</option>
                <option value="AngleQuotesWithCite">Angle quotes with cite</option>
                <option value="CornerBrackets">Corner brackets</option>
                <option value="CornerBracketsWithCite">Corner brackets with cite</option>
              </select>
            </label>
          </div>
        </section>

        <section className="options-card">
          <h2>Arrow / Stop</h2>
          <div className="row">
            <label
              className={joinClasses(
                "field",
                "check",
                "toggle-option",
                arrowEnabled && "selected",
                !isCustom && "disabled"
              )}
            >
              <input
                type="checkbox"
                disabled={!isCustom}
                checked={arrowEnabled}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      arrow: event.target.checked
                        ? { bidirArrow: true, doubleArrow: true }
                        : null,
                    },
                  }))
                }
              />
              <span>Enable arrow conversion</span>
            </label>
            <label
              className={joinClasses(
                "field",
                "check",
                "toggle-option",
                arrowEnabled && (draftSettings.customOptions.arrow?.bidirArrow ?? false) && "selected",
                !arrowEnabled && "disabled"
              )}
            >
              <input
                type="checkbox"
                disabled={!arrowEnabled}
                checked={arrowEnabled && (draftSettings.customOptions.arrow?.bidirArrow ?? false)}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      arrow: {
                        bidirArrow: event.target.checked,
                        doubleArrow: previous.customOptions.arrow?.doubleArrow ?? false,
                      },
                    },
                  }))
                }
              />
              <span>Bidirectional</span>
            </label>
            <label
              className={joinClasses(
                "field",
                "check",
                "toggle-option",
                arrowEnabled && (draftSettings.customOptions.arrow?.doubleArrow ?? false) && "selected",
                !arrowEnabled && "disabled"
              )}
            >
              <input
                type="checkbox"
                disabled={!arrowEnabled}
                checked={arrowEnabled && (draftSettings.customOptions.arrow?.doubleArrow ?? false)}
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      arrow: {
                        bidirArrow: previous.customOptions.arrow?.bidirArrow ?? false,
                        doubleArrow: event.target.checked,
                      },
                    },
                  }))
                }
              />
              <span>Double arrow</span>
            </label>
          </div>
          <div className="row radio-row">
            <label
              className={joinClasses(
                "radio-option",
                isCustom && draftSettings.customOptions.stop === "Horizontal" && "selected",
                stopDisabled && "disabled"
              )}
            >
              <input
                type="radio"
                name="stop"
                disabled={stopDisabled}
                checked={isCustom && draftSettings.customOptions.stop === "Horizontal"}
                onChange={() =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      stop: "Horizontal",
                    },
                  }))
                }
              />
              <span>Horizontal</span>
            </label>
            <label
              className={joinClasses(
                "radio-option",
                isCustom && draftSettings.customOptions.stop === "HorizontalWithSlashes" && "selected",
                stopDisabled && "disabled"
              )}
            >
              <input
                type="radio"
                name="stop"
                disabled={stopDisabled}
                checked={
                  isCustom && draftSettings.customOptions.stop === "HorizontalWithSlashes"
                }
                onChange={() =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      stop: "HorizontalWithSlashes",
                    },
                  }))
                }
              />
              <span>Horizontal with slashes</span>
            </label>
            <label
              className={joinClasses(
                "radio-option",
                isCustom && draftSettings.customOptions.stop === "Vertical" && "selected",
                stopDisabled && "disabled"
              )}
            >
              <input
                type="radio"
                name="stop"
                disabled={stopDisabled}
                checked={isCustom && draftSettings.customOptions.stop === "Vertical"}
                onChange={() =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      stop: "Vertical",
                    },
                  }))
                }
              />
              <span>Vertical</span>
            </label>
            <label
              className={joinClasses(
                "radio-option",
                isCustom && draftSettings.customOptions.stop === null && "selected",
                stopDisabled && "disabled"
              )}
            >
              <input
                type="radio"
                name="stop"
                disabled={stopDisabled}
                checked={isCustom && draftSettings.customOptions.stop === null}
                onChange={() =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      stop: null,
                    },
                  }))
                }
              />
              <span>As is</span>
            </label>
          </div>
        </section>

        <section className="options-card">
          <h2>Hanja</h2>
          <div className="row">
            <label className="field">
              Rendering
              <select
                disabled={!isCustom}
                value={isCustom && draftSettings.customOptions.hanja ? draftSettings.customOptions.hanja.rendering : ""}
                onChange={(event) =>
                  updateDraft((previous) => {
                    const rendering = event.target.value as HanjaRenderingOption | "";
                    if (rendering === "") {
                      return {
                        ...previous,
                        preset: "custom",
                        customOptions: {
                          ...previous.customOptions,
                          hanja: null,
                        },
                      };
                    }
                    return {
                      ...previous,
                      preset: "custom",
                      customOptions: {
                        ...previous.customOptions,
                        hanja: {
                          rendering,
                          reading: previous.customOptions.hanja?.reading ?? {
                            initialSoundLaw: true,
                            useDictionaries: [],
                          },
                        },
                      },
                    };
                  })
                }
              >
                <option value="">As is</option>
                {HANJA_RENDERINGS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label
              className={joinClasses(
                "field",
                "check",
                "toggle-option",
                hanjaEnabled && draftSettings.customOptions.hanja?.reading.initialSoundLaw && "selected",
                !hanjaEnabled && "disabled"
              )}
            >
              <input
                type="checkbox"
                disabled={!hanjaEnabled}
                checked={
                  hanjaEnabled && draftSettings.customOptions.hanja?.reading.initialSoundLaw
                }
                onChange={(event) =>
                  updateDraft((previous) => ({
                    ...previous,
                    preset: "custom",
                    customOptions: {
                      ...previous.customOptions,
                      hanja: previous.customOptions.hanja
                        ? {
                            ...previous.customOptions.hanja,
                            reading: {
                              ...previous.customOptions.hanja.reading,
                              initialSoundLaw: event.target.checked,
                            },
                          }
                        : previous.customOptions.hanja,
                    },
                  }))
                }
              />
              <span>Initial Sound Law</span>
            </label>
            <label
              className={joinClasses(
                "field",
                "check",
                "toggle-option",
                hanjaEnabled &&
                  useKrStdict &&
                  "selected",
                !hanjaEnabled && "disabled"
              )}
            >
              <input
                type="checkbox"
                disabled={!hanjaEnabled}
                checked={useKrStdict}
                onChange={(event) =>
                  updateDraft((previous) => {
                    if (previous.customOptions.hanja === null) {
                      return previous;
                    }

                    const dictionaries = new Set(
                      previous.customOptions.hanja.reading.useDictionaries
                    );
                    if (event.target.checked) {
                      dictionaries.add("kr-stdict");
                    } else {
                      dictionaries.delete("kr-stdict");
                    }

                    return {
                      ...previous,
                      preset: "custom",
                      customOptions: {
                        ...previous.customOptions,
                        hanja: {
                          ...previous.customOptions.hanja,
                          reading: {
                            ...previous.customOptions.hanja.reading,
                            useDictionaries: [...dictionaries],
                          },
                        },
                      },
                    };
                  })
                }
              />
              <span>South Korean Standard Dictionary</span>
            </label>
          </div>
          <div className="row">
            <label className="field full">
              Custom dictionary ({dictionaryCount})
              <textarea
                disabled={!hanjaEnabled}
                rows={8}
                placeholder={"Sino-Korean word -> Hangul reading\n漢字語 -> 한자어"}
                value={dictionarySource}
                onChange={(event) => {
                  const source = event.target.value;
                  setDictionarySource(source);
                  const parsed = parseDictionarySource(source);
                  setInvalidDictionaryLines(parsed.invalidLineCount);
                  updateDraft((previous) => ({
                    ...previous,
                    customDictionary: parsed.dictionary,
                  }));
                }}
              />
            </label>
          </div>
          {invalidDictionaryLines > 0 && (
            <p className="validation-error">
              {invalidDictionaryLines} invalid line(s). Use `word -> reading` format.
            </p>
          )}
        </section>

        <section className="options-card">
          <h2>Preview</h2>
          <p className="preview-label">Sample input</p>
          <pre className="preview-source">{PREVIEW_SOURCE}</pre>
          <p className="preview-label">Rendered output</p>
          <div className="preview-result-wrap">
            <pre className={`preview-result ${previewBusy ? "preview-result-busy" : ""}`}>
              {previewError ? `Preview failed: ${previewError}` : previewResult}
            </pre>
            {previewBusy && <div className="preview-overlay">Updating preview...</div>}
          </div>
        </section>

        <footer className="options-footer">
          <button
            type="button"
            onClick={onSave}
            disabled={!hasChanges || isSaving || invalidDictionaryLines > 0}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
          {saveState === "saved" && <span className="save-state ok">Saved</span>}
          {saveState === "error" && (
            <span className="save-state err">Failed to save settings</span>
          )}
        </footer>
      </div>
    </main>
  );
}
