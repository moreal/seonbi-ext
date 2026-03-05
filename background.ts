import browser from "webextension-polyfill";
import {
  TRANSFORM_MESSAGE_TYPE,
  type TransformRequest,
  type TransformResponse,
} from "./lib/messages";
import { toWasmConfiguration } from "./lib/seonbi-config";
import { ensureWasmReady, transform } from "./lib/seonbi-engine";
import {
  isContentType,
  loadSettings,
  type ContentType,
} from "./lib/seonbi-settings";

type LegacyResponse = { resultHtml: string; resultText: string };
const MAX_INPUT_CHARS = 100_000;

function isTransformRequest(message: unknown): message is TransformRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message as { type?: string }).type === TRANSFORM_MESSAGE_TYPE &&
    "text" in message &&
    typeof (message as { text?: unknown }).text === "string" &&
    (!("contentType" in message) ||
      (message as { contentType?: unknown }).contentType === undefined ||
      isContentType((message as { contentType?: unknown }).contentType))
  );
}

async function transformWithSettings(
  input: string,
  contentType?: ContentType
): Promise<string> {
  if (input.length > MAX_INPUT_CHARS) {
    throw new Error("Input is too large");
  }

  const [, settings] = await Promise.all([ensureWasmReady(), loadSettings()]);
  const config = toWasmConfiguration(settings, contentType ?? settings.contentType);
  return transform(config, input);
}

async function handleLegacyMessage(message: string): Promise<LegacyResponse> {
  let result = message;
  try {
    result = await transformWithSettings(message, "text/html");
  } catch {
    // Keep legacy behavior resilient when storage or wasm init temporarily fails.
  }

  return {
    resultHtml: result,
    resultText: result,
  };
}

async function handleTransformMessage(
  message: TransformRequest
): Promise<TransformResponse> {
  try {
    const result = await transformWithSettings(message.text, message.contentType);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

browser.runtime.onMessage.addListener(async (message) => {
  if (typeof message === "string") {
    return handleLegacyMessage(message);
  }

  if (isTransformRequest(message)) {
    return handleTransformMessage(message);
  }

  return undefined;
});
