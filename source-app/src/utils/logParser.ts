export interface ParsedJobFailure {
  headline: string | null;
  tailLines: string[];
}

export interface ExtractLogOptions {
  failedStepName?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

const TIMESTAMP_PREFIX_RE = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s?(.*)$/;

function stripTimestamp(line: string): { tsMs: number | null; text: string } {
  const m = line.match(TIMESTAMP_PREFIX_RE);
  if (!m) return { tsMs: null, text: line.trimEnd() };
  const parsed = Date.parse(m[1]);
  return {
    tsMs: Number.isFinite(parsed) ? parsed : null,
    text: m[2].trimEnd(),
  };
}

function isolateFailedStepLines(
  rawLines: string[],
  options?: ExtractLogOptions
): string[] {
  const nonEmpty = rawLines
    .map((raw) => stripTimestamp(raw))
    .filter((entry) => entry.text.trim().length > 0);

  if (nonEmpty.length === 0) return [];

  // 1. Prefer exact timestamp window of the failed step if GitHub provided started_at / completed_at
  const startMs = options?.startedAt ? Date.parse(options.startedAt) : NaN;
  const endMs = options?.completedAt ? Date.parse(options.completedAt) : NaN;

  if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
    const windowEntries = nonEmpty.filter((entry) => {
      if (entry.tsMs === null) return false;
      if (entry.tsMs < startMs - 1000 || entry.tsMs > endMs + 1500) return false;
      // Exclude trailing post-run cleanup markers even if same second
      if (/^(?:##\[group\](?:Post |Complete job)|Cleaning up orphan processes)/i.test(entry.text.trim())) {
        return false;
      }
      return true;
    });
    if (windowEntries.length > 0) {
      return windowEntries.map((e) => e.text);
    }
  }

  const textLines = nonEmpty.map((e) => e.text);

  // 2. Try locating explicit failed step name section in the log
  const stepName = options?.failedStepName?.trim();
  if (stepName) {
    const stepIdx = textLines.findIndex(
      (line) =>
        line.includes(`##[group]${stepName}`) ||
        line.includes(`Run ${stepName}`) ||
        line.trim() === stepName
    );
    if (stepIdx >= 0) {
      let endIdx = textLines.length;
      for (let i = stepIdx + 1; i < textLines.length; i += 1) {
        const trimmed = textLines[i].trim();
        if (
          trimmed.startsWith('##[group]Post ') ||
          trimmed.startsWith('##[group]Complete job') ||
          trimmed.startsWith('Cleaning up orphan processes')
        ) {
          endIdx = i;
          break;
        }
      }
      const section = textLines.slice(stepIdx, endIdx);
      if (section.length > 0) return section;
    }
  }

  // 3. Fallback: strip trailing Post / Complete job cleanup lines after the last ##[error]
  const lastErrorIdx = textLines.reduce(
    (acc, l, idx) => (l.includes('##[error]') ? idx : acc),
    -1
  );
  if (lastErrorIdx >= 0) {
    // Include everything up through the last ##[error] (and up to 2 lines after it if not Post/Complete)
    let cutoff = Math.min(textLines.length, lastErrorIdx + 1);
    for (let i = lastErrorIdx + 1; i < textLines.length; i += 1) {
      const trimmed = textLines[i].trim();
      if (
        trimmed.startsWith('##[group]Post ') ||
        trimmed.startsWith('##[group]Complete job') ||
        trimmed.startsWith('Cleaning up orphan processes')
      ) {
        break;
      }
      cutoff = i + 1;
    }
    // Find the start of the group containing lastErrorIdx if possible
    let startIdx = 0;
    for (let i = lastErrorIdx; i >= 0; i -= 1) {
      if (textLines[i].trim().startsWith('##[group]Run ')) {
        startIdx = i;
        break;
      }
    }
    const scoped = textLines.slice(startIdx, cutoff);
    if (scoped.length > 0) return scoped;
  }

  return textLines;
}

export function extractJobFailureLogs(
  rawLog: string,
  maxTailLines = 25,
  options?: ExtractLogOptions
): ParsedJobFailure {
  const scopedLines = isolateFailedStepLines(rawLog.split(/\r?\n/), options);

  if (scopedLines.length === 0) {
    return { headline: null, tailLines: [] };
  }

  const tailLines = scopedLines.slice(-maxTailLines);

  // Look for explicit Gradle / javac / npm / CLI error headlines across the failed step log
  const failureIdx = scopedLines.findIndex((l) => /^FAILURE:/i.test(l.trim()));
  let headline: string | null = null;

  if (failureIdx >= 0) {
    const slice = scopedLines.slice(failureIdx, failureIdx + 4).map((s) => s.trim());
    headline = slice.join(' ').slice(0, 320);
  } else {
    const specificErr =
      [...scopedLines]
        .reverse()
        .find((l) =>
          /(?:^|\s)(?:##\[error\]|npm ERR!|npm error|error:|> Task .* FAILED|What went wrong:|Execution failed for task|Could not resolve)/i.test(
            l
          )
        ) || [...tailLines].reverse().find((l) => /error|failed|exception/i.test(l));

    if (specificErr) {
      headline = specificErr.replace(/^##\[error\]/, '').trim().slice(0, 320);
    }
  }

  return { headline, tailLines };
}
