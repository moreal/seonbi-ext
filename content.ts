import type { PlasmoContentScript } from "plasmo";
import browser from "webextension-polyfill";
import {
  TRANSFORM_MESSAGE_TYPE,
  type TransformRequest,
  type TransformResponse,
} from "./lib/messages";

let actionButton: HTMLButtonElement | null = null;
let resultPanel: HTMLDivElement | null = null;
let resultText: HTMLDivElement | null = null;
let copyButton: HTMLButtonElement | null = null;
let closeButton: HTMLButtonElement | null = null;
let updateTimer: number | null = null;
let transformRequestSerial = 0;
let transformInFlight = false;

let selectionText = "";
let selectionRect: DOMRect | null = null;

export const config: PlasmoContentScript = {
  matches: ["http://*/*", "https://*/*"],
  all_frames: false,
  run_at: "document_idle",
};

function isTextInput(element: Element | null): element is HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    return false;
  }

  const supportedTypes = new Set([
    "text",
    "search",
    "url",
    "tel",
    "email",
  ]);
  return supportedTypes.has(element.type);
}

function getInputSelectionContext(): { text: string; rect: DOMRect } | null {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLTextAreaElement) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? 0;
    if (end > start) {
      const text = activeElement.value.slice(start, end).trim();
      if (text.length > 0) {
        return { text, rect: activeElement.getBoundingClientRect() };
      }
    }
    return null;
  }

  if (isTextInput(activeElement)) {
    const start = activeElement.selectionStart ?? 0;
    const end = activeElement.selectionEnd ?? 0;
    if (end > start) {
      const text = activeElement.value.slice(start, end).trim();
      if (text.length > 0) {
        return { text, rect: activeElement.getBoundingClientRect() };
      }
    }
  }

  return null;
}

function getRangeSelectionContext(): { text: string; rect: DOMRect } | null {
  const selection = window.getSelection();
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const text = selection.toString().trim();
  if (text.length === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    const firstRect = range.getClientRects().item(0);
    if (firstRect === null) {
      return null;
    }
    return { text, rect: firstRect };
  }

  return { text, rect };
}

function getSelectionContext(): { text: string; rect: DOMRect } | null {
  return getInputSelectionContext() ?? getRangeSelectionContext();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function ensureActionButton(): HTMLButtonElement {
  if (actionButton !== null) {
    return actionButton;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.title = "Transform selected text with Seonbi";
  button.textContent = "선";
  Object.assign(button.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "30px",
    height: "30px",
    borderRadius: "8px",
    border: "1px solid #d0d7de",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    zIndex: "2147483647",
    boxShadow: "0 8px 20px rgba(0, 0, 0, 0.12)",
    fontSize: "13px",
    fontWeight: "700",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "0px",
  } as CSSStyleDeclaration);

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", async (event) => {
    if (!event.isTrusted) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    await showTransformationResult();
  });

  document.documentElement.appendChild(button);
  actionButton = button;
  return button;
}

function ensureResultPanel(): HTMLDivElement {
  if (resultPanel !== null && resultText !== null) {
    return resultPanel;
  }

  const panel = document.createElement("div");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Seonbi transformation result");
  Object.assign(panel.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "min(420px, calc(100vw - 16px))",
    maxHeight: "min(320px, calc(100vh - 16px))",
    zIndex: "2147483647",
    background: "#ffffff",
    border: "1px solid #d0d7de",
    borderRadius: "10px",
    boxShadow: "0 16px 32px rgba(0, 0, 0, 0.18)",
    display: "none",
    overflow: "hidden",
    color: "#111827",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, Arial, sans-serif",
  } as CSSStyleDeclaration);

  const header = document.createElement("div");
  Object.assign(header.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 12px",
    borderBottom: "1px solid #e5e7eb",
    background: "#f8fafc",
    gap: "8px",
  } as CSSStyleDeclaration);

  const title = document.createElement("strong");
  title.textContent = "Seonbi";
  Object.assign(title.style, {
    fontSize: "13px",
    fontWeight: "700",
  } as CSSStyleDeclaration);

  const actions = document.createElement("div");
  Object.assign(actions.style, {
    display: "flex",
    gap: "6px",
  } as CSSStyleDeclaration);

  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy";
  applyPanelButtonStyle(copy);
  copy.addEventListener("mousedown", (event) => event.preventDefault());
  copy.addEventListener("click", async (event) => {
    if (!event.isTrusted) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (!copy.disabled && resultText !== null) {
      await copyToClipboard(resultText.textContent ?? "");
      copy.textContent = "Copied";
      window.setTimeout(() => {
        copy.textContent = "Copy";
      }, 900);
    }
  });

  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  applyPanelButtonStyle(close);
  close.addEventListener("mousedown", (event) => event.preventDefault());
  close.addEventListener("click", (event) => {
    if (!event.isTrusted) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    hideResultPanel();
  });

  const body = document.createElement("div");
  body.setAttribute("aria-live", "polite");
  Object.assign(body.style, {
    padding: "12px",
    fontSize: "13px",
    lineHeight: "1.6",
    whiteSpace: "pre-wrap",
    overflow: "auto",
    maxHeight: "250px",
  } as CSSStyleDeclaration);

  actions.append(copy, close);
  header.append(title, actions);
  panel.append(header, body);
  document.documentElement.appendChild(panel);

  panel.addEventListener("mousedown", (event) => {
    event.stopPropagation();
  });
  panel.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  resultPanel = panel;
  resultText = body;
  copyButton = copy;
  closeButton = close;
  return panel;
}

function applyPanelButtonStyle(button: HTMLButtonElement): void {
  Object.assign(button.style, {
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    background: "#ffffff",
    color: "#0f172a",
    fontSize: "12px",
    lineHeight: "1",
    padding: "6px 10px",
    cursor: "pointer",
  } as CSSStyleDeclaration);
}

function updateActionButtonPosition(): void {
  if (
    actionButton === null ||
    actionButton.style.display === "none" ||
    selectionRect === null
  ) {
    return;
  }

  const left = clamp(selectionRect.left, 8, window.innerWidth - 38);
  const top = clamp(selectionRect.bottom + 6, 8, window.innerHeight - 38);

  actionButton.style.left = `${left}px`;
  actionButton.style.top = `${top}px`;
}

function updateResultPanelPosition(): void {
  if (resultPanel === null || resultPanel.style.display === "none") {
    return;
  }

  const referenceRect = selectionRect;
  const buttonLeft = actionButton ? Number.parseFloat(actionButton.style.left) : 8;
  const buttonTop = actionButton ? Number.parseFloat(actionButton.style.top) : 8;

  const preferredLeft = referenceRect ? referenceRect.left : buttonLeft;
  const panelWidth = Math.min(420, window.innerWidth - 16);
  const left = clamp(preferredLeft, 8, window.innerWidth - panelWidth - 8);

  const panelHeight = resultPanel.offsetHeight || 180;
  const belowTop = buttonTop + 40;
  const aboveTop = buttonTop - panelHeight - 8;
  const top =
    belowTop + panelHeight <= window.innerHeight - 8
      ? belowTop
      : clamp(aboveTop, 8, window.innerHeight - panelHeight - 8);

  resultPanel.style.left = `${left}px`;
  resultPanel.style.top = `${top}px`;
}

function showActionButton(): void {
  const button = ensureActionButton();
  button.style.display = "flex";
  updateActionButtonPosition();
}

function hideActionButton(): void {
  if (actionButton !== null) {
    actionButton.style.display = "none";
  }
}

function showResultPanel(
  message: string,
  options: { isError?: boolean; isLoading?: boolean } = {}
): void {
  const isError = options.isError === true;
  const isLoading = options.isLoading === true;
  const panel = ensureResultPanel();
  if (resultText !== null) {
    resultText.textContent = message;
    resultText.style.color = isError ? "#b42318" : "#111827";
  }
  if (copyButton !== null) {
    const disabled = isError || isLoading;
    copyButton.disabled = disabled;
    copyButton.style.opacity = disabled ? "0.45" : "1";
    copyButton.style.cursor = disabled ? "not-allowed" : "pointer";
  }
  panel.style.display = "block";
  updateResultPanelPosition();
}

function hideResultPanel(): void {
  if (resultPanel !== null) {
    resultPanel.style.display = "none";
  }
  transformRequestSerial += 1;
  transformInFlight = false;
}

function hideAllUi(): void {
  hideResultPanel();
  hideActionButton();
}

function scheduleSelectionUpdate(): void {
  if (updateTimer !== null) {
    window.clearTimeout(updateTimer);
  }
  updateTimer = window.setTimeout(() => {
    updateTimer = null;
    refreshSelectionState();
  }, 80);
}

function refreshSelectionState(): void {
  const previousSelectionText = selectionText;
  const context = getSelectionContext();
  if (context === null) {
    selectionText = "";
    selectionRect = null;
    hideAllUi();
    return;
  }

  selectionText = context.text;
  selectionRect = context.rect;
  if (selectionText !== previousSelectionText) {
    transformRequestSerial += 1;
    transformInFlight = false;
    hideResultPanel();
  }
  showActionButton();
  updateResultPanelPosition();
}

async function showTransformationResult(): Promise<void> {
  if (selectionText.length === 0 || transformInFlight) {
    hideResultPanel();
    return;
  }

  transformInFlight = true;
  const requestId = ++transformRequestSerial;
  const selectedTextSnapshot = selectionText;
  showResultPanel("Converting...", { isLoading: true });

  const request: TransformRequest = {
    type: TRANSFORM_MESSAGE_TYPE,
    text: selectedTextSnapshot,
  };

  let response: TransformResponse | undefined;
  try {
    response = (await browser.runtime.sendMessage(request)) as TransformResponse;
  } catch (error) {
    if (requestId !== transformRequestSerial) {
      return;
    }
    showResultPanel(`Failed to transform text.\n${String(error)}`, { isError: true });
    transformInFlight = false;
    return;
  }

  if (requestId !== transformRequestSerial) {
    return;
  }

  if (response === undefined || response.ok === false) {
    showResultPanel(
      `Failed to transform text.\n${response?.error ?? "Unknown error"}`,
      { isError: true }
    );
    transformInFlight = false;
    return;
  }

  showResultPanel(response.result);
  transformInFlight = false;
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if ("clipboard" in navigator && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    // Fallback below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "readonly");
  Object.assign(textarea.style, {
    position: "fixed",
    left: "-9999px",
    top: "-9999px",
    opacity: "0",
  } as CSSStyleDeclaration);
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function registerGlobalEvents(): void {
  document.addEventListener("selectionchange", scheduleSelectionUpdate, true);
  document.addEventListener("mouseup", scheduleSelectionUpdate, true);
  document.addEventListener("keyup", scheduleSelectionUpdate, true);
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        hideResultPanel();
      }
    },
    true
  );
  document.addEventListener(
    "mousedown",
    (event) => {
      const target = event.target as Node | null;
      if (
        target !== null &&
        ((actionButton !== null && actionButton.contains(target)) ||
          (resultPanel !== null && resultPanel.contains(target)))
      ) {
        return;
      }
      hideResultPanel();
    },
    true
  );
  window.addEventListener("scroll", updateActionButtonPosition, true);
  window.addEventListener("scroll", updateResultPanelPosition, true);
  window.addEventListener("resize", updateActionButtonPosition, true);
  window.addEventListener("resize", updateResultPanelPosition, true);
}

registerGlobalEvents();
scheduleSelectionUpdate();
