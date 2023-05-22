// utility.ts

import * as Diff from 'diff';

export function applyDiffPatch(originalCode: string, diffPatch: string): string {
  const diff = Diff.parsePatch(diffPatch);
  const updatedCode = Diff.applyPatch(originalCode, diff as any);
  return updatedCode;
}