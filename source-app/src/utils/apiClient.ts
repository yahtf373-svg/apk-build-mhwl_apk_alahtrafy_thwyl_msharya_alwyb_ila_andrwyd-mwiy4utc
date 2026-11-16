import JSZip from 'jszip';
import type { BuildRecord, GitHubUserInfo } from '../types/apk';
import { extractJobFailureLogs } from './logParser';

const BUILDS_CACHE_KEY = 'apk_pro_builds_cache';

const DEFAULT_SEED_BUILDS: BuildRecord[] = [
  {
    id: 'seed-quran-companion',
    appName: 'رفيق التلاوة والحفظ',
    packageName: 'com.apkpro.rafiq_altilawa',
    versionName: '1.2.0',
    versionCode: 10200,
    iconDataUrl: null,
    permissions: {
      gallerySave: true,
      nativeShare: true,
      microphone: true,
      fullscreen: true,
      orientation: 'portrait',
    },
    sourceZipName: 'quran-tasmee-studio.zip',
    fileCount: 14,
    wasReorganized: true,
    status: 'draft',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
  },
  {
    id: 'seed-cards-designer',
    appName: 'مصمم بطاقات الأذكار',
    packageName: 'com.apkpro.adhkar_cards',
    versionName: '1.0.4',
    versionCode: 10004,
    iconDataUrl: null,
    permissions: {
      gallerySave: true,
      nativeShare: true,
      microphone: false,
      fullscreen: false,
      orientation: 'unspecified',
    },
    sourceZipName: 'adhkar-card-maker.zip',
    fileCount: 9,
    wasReorganized: false,
    status: 'draft',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
];

function isStaticProtocol(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return true;
  return (
    window.location.protocol === 'file:' ||
    window.location.protocol === 'capacitor:' ||
    window.location.protocol === 'content:'
  );
}

function readLocalBuilds(): BuildRecord[] {
  try {
    const raw = localStorage.getItem(BUILDS_CACHE_KEY);
    if (!raw) {
      localStorage.setItem(BUILDS_CACHE_KEY, JSON.stringify(DEFAULT_SEED_BUILDS));
      return DEFAULT_SEED_BUILDS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BuildRecord[]) : DEFAULT_SEED_BUILDS;
  } catch {
    return DEFAULT_SEED_BUILDS;
  }
}

function writeLocalBuilds(builds: BuildRecord[]): void {
  try {
    localStorage.setItem(BUILDS_CACHE_KEY, JSON.stringify(builds));
  } catch {
    // ignore storage quota
  }
}

export async function fetchBuildsList(): Promise<BuildRecord[]> {
  if (!isStaticProtocol()) {
    try {
      const res = await fetch('/api/builds');
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = (await res.json()) as { builds: BuildRecord[] };
        const builds = data.builds || [];
        writeLocalBuilds(builds);
        return builds;
      }
    } catch {
      // Fall back to localStorage in standalone static mode
    }
  }
  const local = readLocalBuilds();
  return [...local].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function upsertBuildRecord(record: BuildRecord): Promise<void> {
  if (!isStaticProtocol()) {
    try {
      const res = await fetch('/api/builds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (res.ok) return;
    } catch {
      // fallback below
    }
  }
  const current = readLocalBuilds();
  const idx = current.findIndex((b) => b.id === record.id);
  const now = new Date().toISOString();
  const saved: BuildRecord = {
    ...record,
    createdAt: record.createdAt || now,
    updatedAt: now,
  };
  if (idx >= 0) {
    current[idx] = saved;
  } else {
    current.unshift(saved);
  }
  writeLocalBuilds(current);
}

export async function patchBuildRecord(
  id: string,
  patch: Partial<BuildRecord>
): Promise<void> {
  if (!isStaticProtocol()) {
    try {
      const res = await fetch(`/api/builds/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (res.ok) return;
    } catch {
      // fallback below
    }
  }
  const current = readLocalBuilds();
  const idx = current.findIndex((b) => b.id === id);
  if (idx >= 0) {
    current[idx] = {
      ...current[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    writeLocalBuilds(current);
  }
}

export async function removeBuildRecord(id: string): Promise<void> {
  if (!isStaticProtocol()) {
    try {
      const res = await fetch(`/api/builds/${id}`, { method: 'DELETE' });
      if (res.ok) return;
    } catch {
      // fallback below
    }
  }
  const current = readLocalBuilds();
  writeLocalBuilds(current.filter((b) => b.id !== id));
}

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function verifyGitHubTokenApi(token: string): Promise<{
  ok: boolean;
  user?: GitHubUserInfo;
  scopes?: string[];
  error?: string;
}> {
  if (!isStaticProtocol()) {
    try {
      const res = await fetch('/api/github/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && res.status !== 404) {
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'رمز GitHub غير صالح' };
        return { ok: true, user: data.user, scopes: data.scopes || [] };
      }
    } catch {
      // fallback to direct GitHub API
    }
  }

  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: ghHeaders(token.trim()),
    });
    if (!userRes.ok) {
      const errBody = await userRes.json().catch(() => ({}));
      return {
        ok: false,
        error:
          userRes.status === 401
            ? 'الرمز الشخصي غير صالح أو منتهي الصلاحية.'
            : errBody.message || 'تعذر التحقق من حساب GitHub',
      };
    }
    const scopesHeader = userRes.headers.get('x-oauth-scopes') || '';
    const scopes = scopesHeader
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const user = await userRes.json();
    return {
      ok: true,
      user: {
        login: user.login,
        name: user.name,
        avatar_url: user.avatar_url,
        html_url: user.html_url,
      },
      scopes,
    };
  } catch {
    return { ok: false, error: 'تعذر الاتصال بخادم GitHub API' };
  }
}

export async function startGitHubBuildApi(params: {
  token: string;
  repoName: string;
  isPrivate: boolean;
  files: Array<{ path: string; contentBase64: string }>;
}): Promise<{
  ok: boolean;
  owner?: string;
  repo?: string;
  repoFullName?: string;
  repoUrl?: string;
  commitSha?: string;
  error?: string;
}> {
  if (!isStaticProtocol()) {
    try {
      const res = await fetch('/api/github/build/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && res.status !== 404) {
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error || 'تعذر بدء عملية البناء السحابي.' };
        return { ok: true, ...data };
      }
    } catch {
      // fallback to direct GitHub API below
    }
  }

  const cleanToken = params.token.trim();
  const headers = { ...ghHeaders(cleanToken), 'Content-Type': 'application/json' };

  try {
    const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders(cleanToken) });
    if (!userRes.ok) {
      return { ok: false, error: 'رمز GitHub غير صالح أو لا يملك الصلاحيات المطلوبة.' };
    }
    const user = (await userRes.json()) as { login: string };
    const owner = user.login;

    const createRepoRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: params.repoName,
        description: 'Temporary Capacitor Android APK Build Repository',
        private: Boolean(params.isPrivate),
        auto_init: true,
      }),
    });
    if (!createRepoRes.ok) {
      const err = await createRepoRes.json().catch(() => ({}));
      return { ok: false, error: err.message || 'تعذر إنشاء مستودع البناء المؤقت على GitHub.' };
    }
    const repoData = (await createRepoRes.json()) as {
      full_name: string;
      html_url: string;
      default_branch: string;
    };
    const branch = repoData.default_branch || 'main';
    await new Promise((r) => setTimeout(r, 1200));

    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${params.repoName}/git/ref/heads/${branch}`,
      { headers: ghHeaders(cleanToken) }
    );
    const refJson = (await refRes.json()) as { object: { sha: string } };
    const parentCommitSha = refJson.object.sha;

    const commitRes = await fetch(
      `https://api.github.com/repos/${owner}/${params.repoName}/git/commits/${parentCommitSha}`,
      { headers: ghHeaders(cleanToken) }
    );
    const commitJson = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitJson.tree.sha;

    const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    const batchSize = 6;
    for (let i = 0; i < params.files.length; i += batchSize) {
      const batch = params.files.slice(i, i + batchSize);
      const created = await Promise.all(
        batch.map(async (f) => {
          const blobRes = await fetch(
            `https://api.github.com/repos/${owner}/${params.repoName}/git/blobs`,
            {
              method: 'POST',
              headers,
              body: JSON.stringify({ content: f.contentBase64, encoding: 'base64' }),
            }
          );
          if (!blobRes.ok) throw new Error(`فشل رفع الملف ${f.path}`);
          const blobJson = (await blobRes.json()) as { sha: string };
          return { path: f.path, mode: '100644', type: 'blob', sha: blobJson.sha };
        })
      );
      treeEntries.push(...created);
    }

    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${params.repoName}/git/trees`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
      }
    );
    const treeJson = (await treeRes.json()) as { sha: string };

    const newCommitRes = await fetch(
      `https://api.github.com/repos/${owner}/${params.repoName}/git/commits`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: 'chore: configure Capacitor Android project & APK build workflow',
          tree: treeJson.sha,
          parents: [parentCommitSha],
        }),
      }
    );
    const newCommitJson = (await newCommitRes.json()) as { sha: string };

    await fetch(
      `https://api.github.com/repos/${owner}/${params.repoName}/git/refs/heads/${branch}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ sha: newCommitJson.sha }),
      }
    );

    return {
      ok: true,
      owner,
      repo: params.repoName,
      repoFullName: repoData.full_name,
      repoUrl: repoData.html_url,
      commitSha: newCommitJson.sha,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'حدث خطأ أثناء رفع المشروع إلى GitHub',
    };
  }
}

export async function fetchGitHubBuildStatusApi(params: {
  token: string;
  owner: string;
  repo: string;
  commitSha?: string;
}): Promise<{
  found: boolean;
  runId?: number;
  runUrl?: string;
  status: string;
  conclusion: string | null;
  steps: Array<{ name: string; status: string; conclusion: string | null }>;
  failedJobName?: string | null;
  failedStepName?: string | null;
  failedStepConclusion?: string | null;
  errorDetail?: string | null;
  errorLogsTail?: string[];
  artifactId?: number;
  releaseAssetId?: number;
  releaseAssetUrl?: string;
  releaseDownloadUrl?: string;
  releaseAssetName?: string;
}> {
  if (!isStaticProtocol()) {
    try {
      const res = await fetch('/api/github/build/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {
      // fallback below
    }
  }

  const cleanToken = params.token.trim();
  const runsRes = await fetch(
    `https://api.github.com/repos/${params.owner}/${params.repo}/actions/runs?per_page=5`,
    { headers: ghHeaders(cleanToken) }
  );
  const runsData = (await runsRes.json()) as {
    workflow_runs: Array<{
      id: number;
      status: string;
      conclusion: string | null;
      html_url: string;
      head_sha: string;
    }>;
  };
  const run =
    runsData.workflow_runs?.find((r) => !params.commitSha || r.head_sha === params.commitSha) ||
    runsData.workflow_runs?.[0];

  if (!run) {
    return { found: false, status: 'queued', conclusion: null, steps: [] };
  }

  const jobsRes = await fetch(
    `https://api.github.com/repos/${params.owner}/${params.repo}/actions/runs/${run.id}/jobs`,
    { headers: ghHeaders(cleanToken) }
  );
  let steps: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    started_at?: string;
    completed_at?: string;
  }> = [];
  let failedJobName: string | null = null;
  let failedStepName: string | null = null;
  let failedStepConclusion: string | null = null;
  let errorDetail: string | null = null;
  let errorLogsTail: string[] = [];

  if (jobsRes.ok) {
    const jobsData = (await jobsRes.json()) as {
      jobs: Array<{
        id: number;
        name: string;
        conclusion: string | null;
        steps?: Array<{
          name: string;
          status: string;
          conclusion: string | null;
          started_at?: string;
          completed_at?: string;
        }>;
      }>;
    };
    const jobs = jobsData.jobs || [];
    steps = jobs.flatMap((j) => j.steps || []);
    const failedJob = jobs.find(
      (j) =>
        j.conclusion === 'failure' ||
        j.conclusion === 'timed_out' ||
        j.conclusion === 'cancelled'
    );
    const jobSteps = failedJob?.steps || steps;
    const failedStep =
      jobSteps.find((s) => s.conclusion === 'failure') ||
      jobSteps.find(
        (s) => s.conclusion === 'timed_out' || s.conclusion === 'cancelled'
      );
    if (failedJob) failedJobName = failedJob.name;
    if (failedStep) {
      failedStepName = failedStep.name;
      failedStepConclusion = failedStep.conclusion;
    }

    if (run.status === 'completed' && run.conclusion !== 'success' && failedJob?.id) {
      try {
        const logRes = await fetch(
          `https://api.github.com/repos/${params.owner}/${params.repo}/actions/jobs/${failedJob.id}/logs`,
          { headers: ghHeaders(cleanToken) }
        );
        if (logRes.ok) {
          const logText = await logRes.text();
          const parsed = extractJobFailureLogs(logText, 25, {
            failedStepName: failedStep?.name,
            startedAt: failedStep?.started_at,
            completedAt: failedStep?.completed_at,
          });
          errorDetail = parsed.headline;
          errorLogsTail = parsed.tailLines;
        }
      } catch {
        // ignore optional log fetch failures
      }
    }
  }

  let artifactId: number | undefined;
  let releaseAssetId: number | undefined;
  let releaseAssetUrl: string | undefined;
  let releaseDownloadUrl: string | undefined;
  let releaseAssetName: string | undefined;

  if (run.status === 'completed' && run.conclusion === 'success') {
    const [artRes, relRes] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${params.owner}/${params.repo}/actions/runs/${run.id}/artifacts`,
        { headers: ghHeaders(cleanToken) }
      ),
      fetch(
        `https://api.github.com/repos/${params.owner}/${params.repo}/releases?per_page=5`,
        { headers: ghHeaders(cleanToken) }
      ),
    ]);

    if (artRes.ok) {
      const artJson = (await artRes.json()) as { artifacts: Array<{ id: number; name: string }> };
      const matchedArt =
        artJson.artifacts.find((a) => a.name === 'app-debug-apk') ||
        artJson.artifacts.find((a) => a.name === 'app-release-apk') ||
        artJson.artifacts.find((a) => a.name === 'extracted-source-zip') ||
        artJson.artifacts[0];
      artifactId = matchedArt?.id;
    }

    if (relRes.ok) {
      const releases = (await relRes.json()) as Array<{
        assets?: Array<{
          id: number;
          name: string;
          url: string;
          browser_download_url: string;
        }>;
      }>;
      for (const rel of releases) {
        const matchedAsset = (rel.assets || []).find((a) => /\.(apk|zip)$/i.test(a.name));
        if (matchedAsset) {
          releaseAssetId = matchedAsset.id;
          releaseAssetUrl = matchedAsset.url;
          releaseDownloadUrl = matchedAsset.browser_download_url;
          releaseAssetName = matchedAsset.name;
          break;
        }
      }
    }
  }

  return {
    found: true,
    runId: run.id,
    runUrl: run.html_url,
    status: run.status,
    conclusion: run.conclusion,
    steps,
    failedJobName,
    failedStepName,
    failedStepConclusion,
    errorDetail,
    errorLogsTail,
    artifactId,
    releaseAssetId,
    releaseAssetUrl,
    releaseDownloadUrl,
    releaseAssetName,
  };
}

export async function downloadGitHubApkApi(params: {
  token: string;
  owner: string;
  repo: string;
  artifactId?: number;
  releaseAssetId?: number;
  releaseAssetUrl?: string;
  releaseDownloadUrl?: string;
  fileName: string;
}): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  const errors: string[] = [];

  if (!isStaticProtocol()) {
    try {
      const res = await fetch('/api/github/build/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (res.ok) {
        return { ok: true, blob: await res.blob() };
      }
      if (res.status !== 404) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || `تعذر تحميل ملف APK (HTTP ${res.status})` };
      }
    } catch (e) {
      errors.push(`Server proxy: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const cleanToken = params.token.trim();

    // 1. Direct uncompressed Release Asset download via GitHub API (omit X-GitHub-Api-Version to avoid CORS preflight block on 302 redirect)
    const directAssetApiUrl =
      params.releaseAssetUrl ||
      (params.releaseAssetId
        ? `https://api.github.com/repos/${params.owner}/${params.repo}/releases/assets/${params.releaseAssetId}`
        : null);

    if (directAssetApiUrl) {
      try {
        const assetRes = await fetch(directAssetApiUrl, {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            Accept: 'application/octet-stream',
          },
        });
        if (assetRes.ok) {
          const rawBlob = await assetRes.blob();
          return {
            ok: true,
            blob: new Blob([rawBlob], { type: 'application/vnd.android.package-archive' }),
          };
        }
        errors.push(`Release Asset HTTP ${assetRes.status}`);
      } catch (e) {
        errors.push(`Release Asset fetch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (!params.artifactId) {
      return {
        ok: false,
        error: `تعذر تحميل ملف APK المباشر (${errors.join(' | ') || 'لا يوجد رابط Release أو Artifact'})`,
      };
    }

    // 2. Fallback to zipped Actions Artifact (omit X-GitHub-Api-Version to avoid Azure blob redirect CORS block)
    const zipRes = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/actions/artifacts/${params.artifactId}/zip`,
      {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
        },
      }
    );
    if (!zipRes.ok) {
      errors.push(`Artifact ZIP HTTP ${zipRes.status}`);
      return {
        ok: false,
        error: `تعذر تحميل حزمة APK من GitHub (${errors.join(' | ')})`,
      };
    }

    const buf = await zipRes.arrayBuffer();
    const archive = await JSZip.loadAsync(buf);
    const apkEntry = Object.values(archive.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.apk')
    );
    if (!apkEntry) {
      return { ok: false, error: 'لم يتم العثور على ملف .apk داخل حزمة المخرجات.' };
    }
    const apkBlob = await apkEntry.async('blob');
    return {
      ok: true,
      blob: new Blob([apkBlob], { type: 'application/vnd.android.package-archive' }),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `فشل استخراج ملف APK النهائي: ${[...errors, detail].filter(Boolean).join(' | ')}`,
    };
  }
}

export async function downloadGitHubSourceZipApi(params: {
  token: string;
  owner: string;
  repo: string;
  artifactId?: number;
  releaseAssetId?: number;
  releaseAssetUrl?: string;
  releaseDownloadUrl?: string;
  fileName: string;
}): Promise<{ ok: boolean; blob?: Blob; error?: string }> {
  const errors: string[] = [];

  if (!isStaticProtocol()) {
    try {
      const res = await fetch('/api/github/build/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, expectedType: 'zip' }),
      });
      if (res.ok) {
        return { ok: true, blob: await res.blob() };
      }
      if (res.status !== 404) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error || `تعذر تحميل ملف ZIP المصدري (HTTP ${res.status})` };
      }
    } catch (e) {
      errors.push(`Server proxy: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  try {
    const cleanToken = params.token.trim();

    const directAssetApiUrl =
      params.releaseAssetUrl ||
      (params.releaseAssetId
        ? `https://api.github.com/repos/${params.owner}/${params.repo}/releases/assets/${params.releaseAssetId}`
        : null);

    if (directAssetApiUrl) {
      try {
        const assetRes = await fetch(directAssetApiUrl, {
          headers: {
            Authorization: `Bearer ${cleanToken}`,
            Accept: 'application/octet-stream',
          },
        });
        if (assetRes.ok) {
          const rawBlob = await assetRes.blob();
          return {
            ok: true,
            blob: new Blob([rawBlob], { type: 'application/zip' }),
          };
        }
        errors.push(`Release Asset HTTP ${assetRes.status}`);
      } catch (e) {
        errors.push(`Release Asset fetch: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (!params.artifactId) {
      return {
        ok: false,
        error: `تعذر تحميل ملف الكود المصدري (${errors.join(' | ') || 'لا يوجد رابط Release أو Artifact'})`,
      };
    }

    const zipRes = await fetch(
      `https://api.github.com/repos/${params.owner}/${params.repo}/actions/artifacts/${params.artifactId}/zip`,
      {
        headers: {
          Authorization: `Bearer ${cleanToken}`,
        },
      }
    );
    if (!zipRes.ok) {
      errors.push(`Artifact ZIP HTTP ${zipRes.status}`);
      return {
        ok: false,
        error: `تعذر تحميل أرشيف الكود المصدري من GitHub (${errors.join(' | ')})`,
      };
    }

    const buf = await zipRes.arrayBuffer();
    const archive = await JSZip.loadAsync(buf);
    const innerZip = Object.values(archive.files).find(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.zip')
    );
    const finalBlob = innerZip
      ? await innerZip.async('blob')
      : new Blob([buf], { type: 'application/zip' });

    return {
      ok: true,
      blob: new Blob([finalBlob], { type: 'application/zip' }),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `فشل استخراج ملف الكود المصدري: ${[...errors, detail].filter(Boolean).join(' | ')}`,
    };
  }
}

