export interface DiffChange {
  type: 'ADDED' | 'REMOVED' | 'UNCHANGED';
  value: string;
}

/**
 * Compares two strings word-by-word (including whitespace) and returns
 * the differences using the Longest Common Subsequence (LCS) algorithm.
 */
export function diffWords(oldStr: string, newStr: string): DiffChange[] {
  // Split using a regex that captures word groups and their whitespace
  const oldWords = oldStr.split(/(\s+)/).filter(Boolean);
  const newWords = newStr.split(/(\s+)/).filter(Boolean);

  const m = oldWords.length;
  const n = newWords.length;

  // Initialize a 2D dynamic programming grid
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Int32Array(n + 1) as any);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffChange[] = [];
  let i = m;
  let j = n;

  // Backtrack through the DP grid to construct the diff sequence
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ type: 'UNCHANGED', value: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'ADDED', value: newWords[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'REMOVED', value: oldWords[i - 1] });
      i--;
    }
  }

  // Group contiguous changes of the same type to optimize rendering performance
  const groupedResult: DiffChange[] = [];
  for (const item of result) {
    const last = groupedResult[groupedResult.length - 1];
    if (last && last.type === item.type) {
      last.value += item.value;
    } else {
      groupedResult.push({ ...item });
    }
  }

  return groupedResult;
}
