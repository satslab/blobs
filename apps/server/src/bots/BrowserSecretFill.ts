import { PreviewTabId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export const BrowserSecretFillInput = Schema.Struct({
  key: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64)),
  tabId: PreviewTabId,
  selector: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
  expectedOrigin: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(2048)),
});
export type BrowserSecretFillInput = typeof BrowserSecretFillInput.Type;
const literal = Schema.encodeSync(Schema.fromJsonString(Schema.String));

export function browserSecretOrigin(value: string) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

// Check the origin and fill one field in the same synchronous page evaluation.
export function browserSecretExpression(input: {
  selector: string;
  origin: string;
  value: string;
}) {
  return `(() => {
    if (location.origin !== ${literal(input.origin)}) return "origin_mismatch";
    try {
      const fields = document.querySelectorAll(${literal(input.selector)});
      if (fields.length === 0) return "not_found";
      if (fields.length !== 1) return "ambiguous";
      const field = fields[0];
      const isInput = field instanceof HTMLInputElement;
      if ((!isInput && !(field instanceof HTMLTextAreaElement)) || field.disabled || field.readOnly ||
          (isInput && !["password", "text", "email", "tel", "url", "search"].includes(field.type))) return "not_editable";
      const prototype = isInput ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value").set;
      const value = ${literal(input.value)};
      setter.call(field, value);
      if (field.value !== value) { setter.call(field, ""); return "not_editable"; }
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
      return "filled";
    } catch { return "unavailable"; }
  })()`;
}
