import assert from "node:assert/strict";
import test from "node:test";
import { resolveScopedApproval } from "../src/scoped-approval.js";
import { CodexMicroRendererBridge } from "../src/codex-micro-renderer-bridge.js";

function fixture(actions: object, overrides: object = {}) {
  const card: { memoizedProps: object; return: unknown } = { memoizedProps: { actions }, return: null };
  const surface = { isConnected: true, getClientRects: () => [{}], checkVisibility: () => true, closest: () => null,
    __reactFiber$test: { memoizedProps: {}, return: card }, ...overrides };
  return { surface, card, document: { querySelectorAll: () => [surface] } as unknown as Document };
}

test("serialized renderer calls native scoped approval, never approve-once or permanent leading action", async () => {
  const calls: string[] = [];
  const { document } = fixture({ onApprove: () => calls.push("once"), onDeny() {},
    leadingAction: { onClick: () => calls.push("permanent") },
    scopedApproveAction: { onClick: () => calls.push("conversation") } });
  const bridge = new CodexMicroRendererBridge(() => {});
  const harness = bridge as unknown as { ensureConnected: () => Promise<void>; evaluate: (source: string) => Promise<unknown> };
  harness.ensureConnected = async () => {};
  harness.evaluate = (source) => new Function("document", `return ${source}`)(document);
  await bridge.approveForConversation();
  assert.deepEqual(calls, ["conversation"]);
});

test("missing scope, disabled/loading cards, hidden/detached cards cannot approve", () => {
  const base = { onApprove() {}, onDeny() {}, scopedApproveAction: { onClick() {} } };
  for (const actions of [{ onApprove() {}, onDeny() {} }, { ...base, isLoading: true },
    { ...base, approveDisabled: true }, { ...base, onDeny: null }]) {
    assert.equal(resolveScopedApproval(fixture(actions).document), undefined);
  }
  for (const overrides of [{ isConnected: false }, { getClientRects: () => [] },
    { checkVisibility: () => false }, { checkVisibility: undefined }, { closest: () => ({}) }]) {
    assert.equal(resolveScopedApproval(fixture(base, overrides).document), undefined);
  }
});

test("ambiguous cards/callbacks, cyclic fibers, and accessors fail closed", () => {
  const base = { onApprove() {}, onDeny() {}, scopedApproveAction: { onClick() {} } };
  const { surface, card, document } = fixture(base);
  assert.equal(resolveScopedApproval({ querySelectorAll: () => [surface, surface] } as unknown as Document), undefined);
  card.return = card;
  assert.equal(resolveScopedApproval(document), undefined);
  card.return = { memoizedProps: { actions: { ...base, scopedApproveAction: { onClick() {} } } }, return: null };
  assert.equal(resolveScopedApproval(document), undefined);
  let reads = 0;
  const accessor = { ...base };
  Object.defineProperty(accessor, "scopedApproveAction", { get() { reads++; return base.scopedApproveAction; } });
  assert.equal(resolveScopedApproval(fixture(accessor).document), undefined);
  assert.equal(reads, 0);
});

test("unavailable native scope rejects without an APPR fallback", async () => {
  const bridge = new CodexMicroRendererBridge(() => {});
  const harness = bridge as unknown as { ensureConnected: () => Promise<void>; evaluate: (source: string) => Promise<unknown> };
  harness.ensureConnected = async () => {};
  harness.evaluate = (source) => new Function("document", `return ${source}`)({ querySelectorAll: () => [] });
  await assert.rejects(bridge.approveForConversation(), /Conversation-scoped approval is unavailable/);
});
