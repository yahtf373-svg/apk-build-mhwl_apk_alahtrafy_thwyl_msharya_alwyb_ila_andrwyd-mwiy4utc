import express, { type Request, type Response } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import type { BuildRecord } from './src/types/apk';
import { extractJobFailureLogs } from './src/utils/logParser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.resolve(__dirname, '.data');
const BUILDS_FILE = path.join(DATA_DIR, 'builds.json');

const SEED_BUILDS: BuildRecord[] = [
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

async function ensureDataFile(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(BUILDS_FILE);
  } catch {
    await fs.writeFile(BUILDS_FILE, JSON.stringify(SEED_BUILDS, null, 2), 'utf8');
  }
}

async function readBuilds(): Promise<BuildRecord[]> {
  await ensureDataFile();
  const raw = await fs.readFile(BUILDS_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BuildRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeBuilds(builds: BuildRecord[]): Promise<void> {
  await ensureDataFile();
  await fs.writeFile(BUILDS_FILE, JSON.stringify(builds, null, 2), 'utf8');
}

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'APK-Converter-Pro-Studio',
  };
}

async function ghFetch(url: string, token: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...githubHeaders(token),
      ...(init.headers || {}),
    },
  });
  return res;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '140mb' }));

  // --- Builds History CRUD ---
  app.get('/api/builds', async (_req: Request, res: Response) => {
    try {
      const builds = await readBuilds();
      builds.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      res.json({ builds });
    } catch (err) {
      res.status(500).json({ error: 'تعذر قراءة سجل التطبيقات' });
    }
  });

  app.post('/api/builds', async (req: Request, res: Response) => {
    try {
      const record = req.body as BuildRecord;
      if (!record || !record.id || !record.appName || !record.packageName) {
        res.status(400).json({ error: 'بيانات التطبيق غير مكتملة' });
        return;
      }
      const builds = await readBuilds();
      const idx = builds.findIndex((b) => b.id === record.id);
      const now = new Date().toISOString();
      const saved: BuildRecord = {
        ...record,
        createdAt: record.createdAt || now,
        updatedAt: now,
      };
      if (idx >= 0) {
        builds[idx] = saved;
      } else {
        builds.unshift(saved);
      }
      await writeBuilds(builds);
      res.json({ build: saved });
    } catch {
      res.status(500).json({ error: 'تعذر حفظ سجل التطبيق' });
    }
  });

  app.patch('/api/builds/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const patch = req.body as Partial<BuildRecord>;
      const builds = await readBuilds();
      const idx = builds.findIndex((b) => b.id === id);
      if (idx < 0) {
        res.status(404).json({ error: 'التطبيق غير موجود في السجل' });
        return;
      }
      builds[idx] = {
        ...builds[idx],
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      await writeBuilds(builds);
      res.json({ build: builds[idx] });
    } catch {
      res.status(500).json({ error: 'تعذر تحديث بيانات التطبيق' });
    }
  });

  app.delete('/api/builds/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const builds = await readBuilds();
      const filtered = builds.filter((b) => b.id !== id);
      await writeBuilds(filtered);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'تعذر حذف التطبيق من السجل' });
    }
  });

  // --- GitHub Cloud Build Proxy API ---
  app.post('/api/github/verify', async (req: Request, res: Response) => {
    const { token } = req.body as { token?: string };
    if (!token || !token.trim()) {
      res.status(400).json({ error: 'يرجى إدخال رمز GitHub الشخصي (Token)' });
      return;
    }

    try {
      const userRes = await ghFetch('https://api.github.com/user', token.trim());
      if (!userRes.ok) {
        const errBody = await userRes.json().catch(() => ({}));
        res.status(userRes.status).json({
          error:
            userRes.status === 401
              ? 'الرمز الشخصي غير صالح أو منتهي الصلاحية.'
              : errBody.message || 'تعذر التحقق من حساب GitHub',
        });
        return;
      }

      const scopesHeader = userRes.headers.get('x-oauth-scopes') || '';
      const scopes = scopesHeader
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const user = await userRes.json();

      res.json({
        user: {
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url,
          html_url: user.html_url,
        },
        scopes,
      });
    } catch {
      res.status(502).json({ error: 'فشل الاتصال بخادم GitHub API' });
    }
  });

  app.post('/api/github/build/start', async (req: Request, res: Response) => {
    const { token, repoName, isPrivate, files } = req.body as {
      token?: string;
      repoName?: string;
      isPrivate?: boolean;
      files?: Array<{ path: string; contentBase64: string }>;
    };

    if (!token || !repoName || !Array.isArray(files) || files.length === 0) {
      res.status(400).json({ error: 'بيانات البناء السحابي غير مكتملة.' });
      return;
    }

    const cleanToken = token.trim();

    try {
      // 1. Identify owner
      const userRes = await ghFetch('https://api.github.com/user', cleanToken);
      if (!userRes.ok) {
        res.status(401).json({ error: 'رمز GitHub غير صالح أو لا يملك الصلاحيات المطلوبة.' });
        return;
      }
      const user = (await userRes.json()) as { login: string };
      const owner = user.login;

      // 2. Create temporary repository initialized with README
      const createRepoRes = await ghFetch('https://api.github.com/user/repos', cleanToken, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: repoName,
          description: 'Temporary Capacitor Android APK Build Repository',
          private: Boolean(isPrivate),
          auto_init: true,
        }),
      });

      if (!createRepoRes.ok) {
        const err = await createRepoRes.json().catch(() => ({}));
        res.status(createRepoRes.status).json({
          error: err.message || 'تعذر إنشاء مستودع البناء المؤقت على GitHub (تأكد من صلاحية repo و workflow).',
        });
        return;
      }

      const repoData = (await createRepoRes.json()) as {
        full_name: string;
        html_url: string;
        default_branch: string;
      };
      const branch = repoData.default_branch || 'main';

      // Brief pause to allow GitHub to finalize initial commit on default branch
      await new Promise((r) => setTimeout(r, 1200));

      // 3. Get head ref SHA
      const refRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/${branch}`,
        cleanToken
      );
      if (!refRes.ok) {
        res.status(502).json({ error: 'تعذر قراءة الفرع الافتراضي للمستودع الجديد.' });
        return;
      }
      const refJson = (await refRes.json()) as { object: { sha: string } };
      const parentCommitSha = refJson.object.sha;

      const commitRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repoName}/git/commits/${parentCommitSha}`,
        cleanToken
      );
      const commitJson = (await commitRes.json()) as { tree: { sha: string } };
      const baseTreeSha = commitJson.tree.sha;

      // 4. Upload blobs in controlled parallel batches
      const treeEntries: Array<{ path: string; mode: string; type: string; sha: string }> = [];
      const batchSize = 6;
      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const created = await Promise.all(
          batch.map(async (f) => {
            const blobRes = await ghFetch(
              `https://api.github.com/repos/${owner}/${repoName}/git/blobs`,
              cleanToken,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: f.contentBase64,
                  encoding: 'base64',
                }),
              }
            );
            if (!blobRes.ok) {
              throw new Error(`فشل رفع الملف ${f.path}`);
            }
            const blobJson = (await blobRes.json()) as { sha: string };
            return {
              path: f.path,
              mode: '100644',
              type: 'blob',
              sha: blobJson.sha,
            };
          })
        );
        treeEntries.push(...created);
      }

      // 5. Create tree & commit & update ref
      const treeRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repoName}/git/trees`,
        cleanToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base_tree: baseTreeSha,
            tree: treeEntries,
          }),
        }
      );
      if (!treeRes.ok) {
        res.status(502).json({ error: 'تعذر إنشاء شجرة ملفات Capacitor في المستودع.' });
        return;
      }
      const treeJson = (await treeRes.json()) as { sha: string };

      const newCommitRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repoName}/git/commits`,
        cleanToken,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'chore: configure Capacitor Android project & APK build workflow',
            tree: treeJson.sha,
            parents: [parentCommitSha],
          }),
        }
      );
      if (!newCommitRes.ok) {
        res.status(502).json({ error: 'تعذر إنشاء commit البناء.' });
        return;
      }
      const newCommitJson = (await newCommitRes.json()) as { sha: string };

      const updateRefRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/${branch}`,
        cleanToken,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sha: newCommitJson.sha }),
        }
      );
      if (!updateRefRes.ok) {
        res.status(502).json({ error: 'تعذر تحديث فرع المستودع لتشغيل GitHub Actions.' });
        return;
      }

      res.json({
        owner,
        repo: repoName,
        repoFullName: repoData.full_name,
        repoUrl: repoData.html_url,
        commitSha: newCommitJson.sha,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'حدث خطأ أثناء رفع المشروع إلى GitHub',
      });
    }
  });

  app.post('/api/github/build/status', async (req: Request, res: Response) => {
    const { token, owner, repo, commitSha } = req.body as {
      token?: string;
      owner?: string;
      repo?: string;
      commitSha?: string;
    };

    if (!token || !owner || !repo) {
      res.status(400).json({ error: 'معاملات تتبع البناء ناقصة' });
      return;
    }

    const cleanToken = token.trim();

    try {
      const runsRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=5`,
        cleanToken
      );
      if (!runsRes.ok) {
        res.status(runsRes.status).json({ error: 'تعذر جلب حالة سير عمل GitHub Actions' });
        return;
      }

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
        runsData.workflow_runs.find((r) => !commitSha || r.head_sha === commitSha) ||
        runsData.workflow_runs[0];

      if (!run) {
        res.json({
          found: false,
          status: 'queued',
          conclusion: null,
          steps: [],
        });
        return;
      }

      // Fetch jobs & steps for live granular progress and exact failure reporting
      const jobsRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/jobs`,
        cleanToken
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
            const logRes = await ghFetch(
              `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${failedJob.id}/logs`,
              cleanToken
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
            // ignore optional log detail fetch failures
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
          ghFetch(
            `https://api.github.com/repos/${owner}/${repo}/actions/runs/${run.id}/artifacts`,
            cleanToken
          ),
          ghFetch(
            `https://api.github.com/repos/${owner}/${repo}/releases?per_page=5`,
            cleanToken
          ),
        ]);

        if (artRes.ok) {
          const artJson = (await artRes.json()) as {
            artifacts: Array<{ id: number; name: string }>;
          };
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
            const matchedAsset = (rel.assets || []).find((a) =>
              /\.(apk|zip)$/i.test(a.name)
            );
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

      res.json({
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
      });
    } catch {
      res.status(502).json({ error: 'تعذر الاتصال بـ GitHub Actions API' });
    }
  });

  app.post('/api/github/build/download', async (req: Request, res: Response) => {
    const { token, owner, repo, artifactId, releaseAssetId, fileName, expectedType } = req.body as {
      token?: string;
      owner?: string;
      repo?: string;
      artifactId?: number;
      releaseAssetId?: number;
      fileName?: string;
      expectedType?: 'apk' | 'zip';
    };

    if (!token || !owner || !repo || (!artifactId && !releaseAssetId)) {
      res.status(400).json({ error: 'بيانات تحميل المخرجات غير مكتملة' });
      return;
    }

    const isZipTarget =
      expectedType === 'zip' || (fileName ? fileName.toLowerCase().endsWith('.zip') : false);
    const defaultExt = isZipTarget ? '.zip' : '.apk';
    const contentType = isZipTarget ? 'application/zip' : 'application/vnd.android.package-archive';
    const safeDownloadName = (fileName || (isZipTarget ? 'extracted_source' : 'app-release')).replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );
    const headerFileName = safeDownloadName.toLowerCase().endsWith(defaultExt)
      ? safeDownloadName
      : `${safeDownloadName}${defaultExt}`;

    try {
      let lastDetail = '';
      // 1. Prefer direct uncompressed GitHub Release Asset if available
      if (releaseAssetId) {
        const assetRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/releases/assets/${releaseAssetId}`,
          {
            headers: {
              Authorization: `Bearer ${token.trim()}`,
              Accept: 'application/octet-stream',
              'User-Agent': 'APK-Converter-Pro-Studio',
            },
          }
        );
        if (assetRes.ok) {
          const outBuffer = Buffer.from(await assetRes.arrayBuffer());
          res.setHeader('Content-Type', contentType);
          res.setHeader('Content-Disposition', `attachment; filename="${headerFileName}"`);
          res.send(outBuffer);
          return;
        }
        lastDetail = `Release Asset HTTP ${assetRes.status}`;
      }

      if (!artifactId) {
        res.status(404).json({
          error: `لم يتم العثور على الملف المطلوب للتحميل (${lastDetail || 'no artifactId'}).`,
        });
        return;
      }

      // 2. Fallback to GitHub Actions zipped artifact
      const zipRes = await ghFetch(
        `https://api.github.com/repos/${owner}/${repo}/actions/artifacts/${artifactId}/zip`,
        token.trim()
      );
      if (!zipRes.ok) {
        res.status(zipRes.status).json({
          error: `تعذر تحميل الحزمة من GitHub Actions (HTTP ${zipRes.status}${lastDetail ? ` · ${lastDetail}` : ''})`,
        });
        return;
      }

      const arrayBuf = await zipRes.arrayBuffer();
      const archive = await JSZip.loadAsync(arrayBuf);

      if (isZipTarget) {
        const innerZip = Object.values(archive.files).find(
          (f) => !f.dir && f.name.toLowerCase().endsWith('.zip')
        );
        const zipBuffer = innerZip ? await innerZip.async('nodebuffer') : Buffer.from(arrayBuf);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${headerFileName}"`);
        res.send(zipBuffer);
        return;
      }

      const apkEntry = Object.values(archive.files).find(
        (f) => !f.dir && f.name.toLowerCase().endsWith('.apk')
      );

      if (!apkEntry) {
        res.status(404).json({ error: 'لم يتم العثور على ملف .apk داخل حزمة المخرجات.' });
        return;
      }

      const apkBuffer = await apkEntry.async('nodebuffer');
      res.setHeader('Content-Type', 'application/vnd.android.package-archive');
      res.setHeader('Content-Disposition', `attachment; filename="${headerFileName}"`);
      res.send(apkBuffer);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: `فشل استخراج الملف النهائي: ${detail}` });
    }
  });

  // Vite dev middleware vs static production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }
      try {
        const entryHtml = await fs.readFile(
          path.resolve(__dirname, 'src/entry.html'),
          'utf8'
        );
        const transformed = await vite.transformIndexHtml(req.originalUrl, entryHtml);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (e) {
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`APK Converter Pro server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
