import {
  BotChatError,
  BotResourceAction,
  BotResourceTransfer,
  SecretRef,
  type BotId,
  type ProjectId,
} from "@t3tools/contracts";
// @effect-diagnostics-next-line nodeBuiltinImport:off -- Transfer secrets need authenticated encryption.
import * as NodeCrypto from "node:crypto";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as BotStorage from "./BotStorage.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as SecretRequests from "../secrets/SecretRequests.ts";
import { makeEnsureWorkspace } from "./BotWorkspace.ts";

const fail = () => new BotChatError({ operation: "resources", reason: "not-found" });
const secretValues = Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String }));
const isBotChatError = Schema.is(BotChatError);
const encodeSecretValues = Schema.encodeEffect(Schema.fromJsonString(secretValues));
const decodeSecretValues = Schema.decodeEffect(Schema.fromJsonString(secretValues));
const wrap = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError((cause) =>
      isBotChatError(cause)
        ? cause
        : new BotChatError({ operation: "resources", reason: "storage", cause }),
    ),
  );
const keyFor = (proof: string) => NodeCrypto.createHash("sha256").update(proof).digest();

const make = Effect.gen(function* () {
  const storage = yield* BotStorage.BotStorage;
  const store = yield* ServerSecretStore.ServerSecretStore;
  const fs = yield* FileSystem.FileSystem;
  const workspace = yield* makeEnsureWorkspace;
  const skillPath = Effect.fn("BotResources.skillPath")(function* (id: BotId, key: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(key)) return yield* fail();
    const root = `${yield* fs.realPath(yield* workspace(id))}/skills`;
    yield* fs.makeDirectory(root, { recursive: true });
    const realRoot = yield* fs.realPath(root);
    if (realRoot !== root) return yield* fail();
    return `${root}/${key}.md`;
  });
  const saveSkill = Effect.fn("BotResources.saveSkill")(function* (
    id: BotId,
    key: string,
    content: string,
  ) {
    const path = yield* skillPath(id, key);
    // Replacing the directory entry never follows a skill file symlink.
    const temporary = `${path}.${NodeCrypto.randomUUID()}.tmp`;
    yield* fs.writeFileString(temporary, content, { flag: "wx", mode: 0o600 });
    yield* fs
      .rename(temporary, path)
      .pipe(Effect.ensuring(fs.remove(temporary, { force: true }).pipe(Effect.ignore)));
  });
  const readSkill = Effect.fn("BotResources.readSkill")(function* (id: BotId, key: string) {
    const path = yield* skillPath(id, key);
    if ((yield* fs.realPath(path)) !== path) return yield* fail();
    return yield* fs.readFileString(path);
  });
  const saveSecret = Effect.fn("BotResources.saveSecret")(function* (
    id: BotId,
    key: string,
    value: string,
  ) {
    const old = (yield* storage.secretRefs(id)).find((entry) => entry.key === key);
    const ref = `bot-secret-${NodeCrypto.randomUUID()}`;
    yield* store.set(ref, new TextEncoder().encode(value));
    yield* storage
      .setSecretRef(id, key, ref)
      .pipe(Effect.tapError(() => store.remove(ref).pipe(Effect.ignore)));
    if (old) yield* store.remove(old.ref);
  });
  const removeSecret = Effect.fn("BotResources.removeSecret")(function* (id: BotId, key: string) {
    const old = (yield* storage.secretRefs(id)).find((entry) => entry.key === key);
    if (old) yield* store.remove(old.ref);
    yield* storage.setSecretRef(id, key, null);
  });
  const change = Effect.fn("BotResources.change")(function* (
    id: BotId,
    action: typeof BotResourceAction.Type,
    projectId: ProjectId,
  ) {
    yield* storage.withBot(
      id,
      Effect.gen(function* () {
        const owner = yield* storage.get(id);
        if (owner.status !== "active")
          return yield* new BotChatError({ operation: "resources", reason: "not-owner" });
        const state = yield* storage.resources(id);
        switch (action.type) {
          case "follow-up.save":
            yield* storage.saveResources(id, {
              ...state,
              followUps: [
                ...state.followUps.filter((item) => item.key !== action.item.key),
                action.item,
              ],
            });
            break;
          case "follow-up.delete":
            yield* storage.saveResources(id, {
              ...state,
              followUps: state.followUps.filter((item) => item.key !== action.key),
            });
            break;
          case "skill.save":
            yield* saveSkill(id, action.key, action.content);
            yield* storage.saveResources(id, {
              ...state,
              skills: [
                ...state.skills.filter((item) => item.key !== action.key),
                { key: action.key, description: action.description },
              ],
            });
            break;
          case "skill.delete":
            yield* fs.remove(yield* skillPath(id, action.key), { force: true });
            yield* storage.saveResources(id, {
              ...state,
              skills: state.skills.filter((item) => item.key !== action.key),
            });
            break;
          case "secret.save": {
            const requests = yield* SecretRequests.SecretRequests;
            const value = yield* requests.consume({
              ref: SecretRef.make(action.secretRef),
              projectId,
            });
            yield* saveSecret(id, action.key, value);
            break;
          }
          case "secret.delete":
            yield* removeSecret(id, action.key);
            break;
          case "check-in.configure":
            yield* Effect.try(
              () => new Intl.DateTimeFormat("en", { timeZone: action.settings.timezone }),
            );
            yield* storage.saveResources(id, { ...state, checkIn: action.settings });
            break;
        }
      }),
    );
    return yield* storage.resources(id);
  }, wrap);
  const secretValue = Effect.fn("BotResources.secretValue")(function* (id: BotId, key: string) {
    const entry = (yield* storage.secretRefs(id)).find((item) => item.key === key);
    if (!entry) return yield* fail();
    const value = yield* store.get(entry.ref);
    if (Option.isNone(value)) return yield* fail();
    return Redacted.make(new TextDecoder().decode(value.value));
  }, wrap);
  const secretPath = Effect.fn("BotResources.secretPath")(function* (id: BotId, key: string) {
    const entry = (yield* storage.secretRefs(id)).find((item) => item.key === key);
    if (!entry || !store.directory || Option.isNone(yield* store.get(entry.ref)))
      return yield* fail();
    return `${store.directory}/${entry.ref}.bin`;
  }, wrap);
  const exportResources = Effect.fn("BotResources.export")(function* (id: BotId, proof: string) {
    const state = yield* storage.resources(id);
    const skills = yield* Effect.forEach(state.skills, (skill) =>
      readSkill(id, skill.key).pipe(Effect.map((content) => ({ ...skill, content }))),
    );
    const secrets = yield* Effect.forEach(yield* storage.secretRefs(id), (entry) =>
      Effect.gen(function* () {
        const value = yield* store.get(entry.ref);
        if (Option.isNone(value)) return yield* fail();
        return { key: entry.key, value: new TextDecoder().decode(value.value) };
      }),
    );
    const json = yield* encodeSecretValues(secrets);
    const iv = NodeCrypto.randomBytes(12);
    const cipher = NodeCrypto.createCipheriv("aes-256-gcm", keyFor(proof), iv);
    const ciphertext = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
    return {
      state,
      skills,
      encryptedSecrets: Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64"),
    } satisfies BotResourceTransfer;
  }, wrap);
  const importResources = Effect.fn("BotResources.import")(function* (
    id: BotId,
    input: BotResourceTransfer,
    proof: string,
  ) {
    const bytes = Buffer.from(input.encryptedSecrets, "base64");
    const decoded = yield* Effect.try(() => {
      const decipher = NodeCrypto.createDecipheriv(
        "aes-256-gcm",
        keyFor(proof),
        bytes.subarray(0, 12),
      );
      decipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(
        "utf8",
      );
    });
    const secrets = yield* decodeSecretValues(decoded);
    const previous = yield* storage.resources(id);
    for (const skill of previous.skills) {
      if (!input.skills.some((next) => next.key === skill.key))
        yield* fs.remove(yield* skillPath(id, skill.key), { force: true });
    }
    for (const entry of yield* storage.secretRefs(id)) {
      if (!secrets.some((next) => next.key === entry.key)) yield* removeSecret(id, entry.key);
    }
    for (const skill of input.skills) yield* saveSkill(id, skill.key, skill.content);
    for (const secret of secrets) yield* saveSecret(id, secret.key, secret.value);
    yield* storage.saveResources(id, input.state);
  }, wrap);
  const clear = Effect.fn("BotResources.clear")(function* (id: BotId) {
    for (const entry of yield* storage.secretRefs(id)) yield* removeSecret(id, entry.key);
    const state = yield* storage.resources(id);
    for (const skill of state.skills)
      yield* fs.remove(yield* skillPath(id, skill.key), { force: true });
    yield* storage.saveResources(id, {
      ...state,
      followUps: [],
      skills: [],
      checkIn: { ...state.checkIn, enabled: false },
    });
  }, wrap);
  return { change, secretPath, secretValue, exportResources, importResources, clear };
});
export class BotResources extends Context.Service<BotResources, Effect.Success<typeof make>>()(
  "@t3tools/sora/bots/BotResources",
) {}
export const layer = Layer.effect(BotResources, make);
