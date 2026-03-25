/**
 * Stage2 입력에서 templateHeaders 누수를 차단한다.
 * - Stage2는 RequiredExecutionPlan(requiredFields, mappingPlan)만 사용해야 한다.
 */
export function assertNoTemplateLeak(stage2Input: unknown): void {
  if (stage2Input == null || typeof stage2Input !== "object") {
    return;
  }

  const queue: unknown[] = [stage2Input];
  const visited = new WeakSet<object>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || typeof current !== "object") {
      continue;
    }

    const obj = current as Record<string, unknown>;
    if (visited.has(obj)) {
      continue;
    }
    visited.add(obj);

    if ("templateHeaders" in obj) {
      throw new Error(
        "Stage2 template leak detected: templateHeaders must not be accessible in Stage2."
      );
    }

    for (const value of Object.values(obj)) {
      if (value != null && typeof value === "object") {
        queue.push(value);
      }
    }
  }
}
