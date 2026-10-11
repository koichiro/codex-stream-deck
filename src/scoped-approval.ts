/** Resolve the native conversation-scoped action on one visible approval card.
 * Never synthesize a decision, widen a policy, or fall back to approve-once.
 * This function is serialized into the renderer; keep it self-contained.
 */
export function resolveScopedApproval(document: Pick<Document, "querySelectorAll">): (() => unknown) | undefined {
  const readers = {
    own(value: unknown, key: string): unknown {
      if (!value || typeof value !== "object") return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && "value" in descriptor ? descriptor.value : undefined;
    }
  };
  try {
    const surfaces = [...document.querySelectorAll('[data-codex-approval-surface="true"]')].filter((element) =>
      element.isConnected && element.getClientRects().length > 0 &&
      typeof element.checkVisibility === "function" &&
      element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) &&
      !element.closest('[hidden], [inert], [aria-hidden="true"]'));
    if (surfaces.length !== 1) return undefined;
    const surface = surfaces[0]!;
    const keys = Object.getOwnPropertyNames(surface).filter((key) => key.startsWith("__reactFiber$"));
    if (keys.length !== 1) return undefined;
    let fiber = readers.own(surface, keys[0]!);
    const seen = new Set<object>();
    const candidates = new Set<() => unknown>();
    for (let depth = 0; fiber && typeof fiber === "object" && depth < 128; depth++) {
      if (seen.has(fiber)) return undefined;
      seen.add(fiber);
      const actions = readers.own(readers.own(fiber, "memoizedProps"), "actions");
      if (actions !== undefined) {
        if (typeof readers.own(actions, "onApprove") !== "function" || typeof readers.own(actions, "onDeny") !== "function" ||
            readers.own(actions, "isLoading") === true || readers.own(actions, "approveDisabled") === true) return undefined;
        const scoped = readers.own(actions, "scopedApproveAction");
        const callback = readers.own(scoped, "onClick");
        if (typeof callback !== "function") return undefined;
        candidates.add(callback as () => unknown);
      }
      fiber = readers.own(fiber, "return");
    }
    if (fiber != null || candidates.size !== 1) return undefined;
    return [...candidates][0];
  } catch { return undefined; }
}
