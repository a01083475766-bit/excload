/**
 * Stage3는 병합만 수행해야 하므로 입력 StandardRow 값이 변형되면 실패한다.
 */
export function assertNoStage3Mutation(
  beforeRows: ReadonlyArray<Record<string, string | undefined>>,
  afterRows: ReadonlyArray<Record<string, string | undefined>>
): void {
  if (beforeRows.length !== afterRows.length) {
    throw new Error("Stage3 mutation detected: row length changed.");
  }

  for (let rowIndex = 0; rowIndex < beforeRows.length; rowIndex += 1) {
    const before = beforeRows[rowIndex];
    const after = afterRows[rowIndex];

    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      if (before[key] !== after[key]) {
        throw new Error(
          `Stage3 mutation detected at row=${rowIndex}, key=${key}.`
        );
      }
    }
  }
}
