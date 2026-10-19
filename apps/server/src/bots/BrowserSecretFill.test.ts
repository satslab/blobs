import * as NodeVM from "node:vm";
import { expect, it } from "vite-plus/test";
import { browserSecretExpression, browserSecretOrigin } from "./BrowserSecretFill.ts";

class Input {
  type = "password";
  disabled = false;
  readOnly = false;
  stored = "";
  events: string[] = [];
  get value() {
    return this.stored;
  }
  set value(value: string) {
    this.stored = value.replaceAll("\n", "");
  }
  dispatchEvent(event: { type: string }) {
    this.events.push(event.type);
  }
}
class Textarea extends Input {}
class PageEvent {
  readonly type: string;
  constructor(type: string) {
    this.type = type;
  }
}
function run(
  fields: readonly unknown[],
  value = 'fixture-"token"\\</script>',
  origin = "https://example.com",
  selector = "#password",
) {
  const expression = browserSecretExpression({ selector, origin: "https://example.com", value });
  const result: unknown = NodeVM.runInNewContext(expression, {
    location: { origin },
    HTMLInputElement: Input,
    HTMLTextAreaElement: Textarea,
    Event: PageEvent,
    document: {
      querySelectorAll: (query: string) => {
        if (query === "[") throw new SyntaxError();
        return fields;
      },
    },
  });
  return result;
}

it("fills exactly one editable field and returns only a status", () => {
  const field = new Input();
  const value = '"; globalThis.compromised = true; //';
  expect(run([field], value)).toBe("filled");
  expect(field.value).toBe(value);
  expect(field.events).toEqual(["input", "change"]);
  for (const fields of [[], [field, field], [{}]]) expect(run(fields)).not.toBe("filled");
  expect(run([field], "other", "https://other.example.com")).toBe("origin_mismatch");
  expect(field.value).toBe(value);
  expect(run([field], "other", "https://example.com", "[")).toBe("unavailable");
  field.disabled = true;
  expect(run([field])).toBe("not_editable");
  field.disabled = false;
  field.readOnly = true;
  expect(run([field])).toBe("not_editable");
  field.readOnly = false;
  field.type = "file";
  expect(run([field])).toBe("not_editable");
  field.type = "text";
  expect(run([field], "normalized\nvalue")).toBe("not_editable");
  expect(field.value).toBe("");
});

it("normalizes exact web origins and rejects paths and credentials", () => {
  expect(browserSecretOrigin("https://EXAMPLE.com:443/")).toBe("https://example.com");
  expect(browserSecretOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  for (const origin of [
    "https://example.com/login",
    "https://user:password@example.com",
    "https://example.com?q=1",
    "https://example.com/#hash",
    "file:///tmp/page",
    "javascript:alert(1)",
    "not-a-url",
  ])
    expect(browserSecretOrigin(origin)).toBeNull();
});
