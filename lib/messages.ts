import type { ContentType } from "./seonbi-settings";

export const TRANSFORM_MESSAGE_TYPE = "SEONBI_TRANSFORM";

export interface TransformRequest {
  type: typeof TRANSFORM_MESSAGE_TYPE;
  text: string;
  contentType?: ContentType;
}

export type TransformResponse =
  | {
      ok: true;
      result: string;
    }
  | {
      ok: false;
      error: string;
    };

