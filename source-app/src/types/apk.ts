export type OrientationMode = 'unspecified' | 'portrait' | 'landscape';

export interface NativePermissions {
  gallerySave: boolean;     // WRITE_EXTERNAL_STORAGE + MediaStore + DownloadListener
  nativeShare: boolean;     // Native Android Share Bridge (Intent.ACTION_SEND + FileProvider)
  microphone: boolean;      // RECORD_AUDIO + WebChromeClient onPermissionRequest
  fullscreen: boolean;      // Fullscreen / Edge-to-Edge WindowCompat
  orientation: OrientationMode;
}

export interface AppConfig {
  appName: string;
  packageName: string;
  versionName: string;
  iconDataUrl: string | null;
  permissions: NativePermissions;
}

export interface NormalizedFileEntry {
  originalPath: string;
  normalizedPath: string;
  sizeBytes: number;
  isDirectory: boolean;
  rewritten: boolean;
}

export interface ZipAnalysisResult {
  fileName: string;
  totalBytes: number;
  fileCount: number;
  discoveredIndexPath: string;
  strippedPrefix: string;
  wasReorganized: boolean;
  rewrittenFilesCount: number;
  projectKind?: 'static' | 'vite-react';
  hasBuildScript?: boolean;
  entries: NormalizedFileEntry[];
  /** Map of normalized relative path under www/ (or source-app/ when buildable) -> raw Uint8Array or UTF-8 string */
  normalizedFiles: Record<string, Uint8Array | string>;
  detectedTitle: string | null;
}

export type BuildStatus = 'draft' | 'queued' | 'in_progress' | 'completed' | 'failed';

export type CloudBuildStepId =
  | 'prepare_zip'
  | 'create_repo'
  | 'push_capacitor'
  | 'github_actions'
  | 'apk_ready';

export interface CloudBuildStep {
  id: CloudBuildStepId;
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export interface BuildRecord {
  id: string;
  appName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  iconDataUrl: string | null;
  permissions: NativePermissions;
  sourceZipName: string;
  fileCount: number;
  wasReorganized: boolean;
  status: BuildStatus;
  repoFullName?: string;
  repoUrl?: string;
  workflowRunId?: number;
  workflowRunUrl?: string;
  artifactId?: number;
  releaseAssetId?: number;
  releaseAssetUrl?: string;
  releaseDownloadUrl?: string;
  releaseAssetName?: string;
  createdAt: string;
  updatedAt: string;
  errorMessage?: string;
}

export interface GitHubUserInfo {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export type ApkBuildKind = 'web-hybrid' | 'native-android';

export interface ApkInspectionEntry {
  path: string;
  sizeBytes: number;
}

export interface ApkInspectionResult {
  fileName: string;
  fileSizeBytes: number;
  totalEntriesCount: number;
  apkKind: ApkBuildKind;
  frameworkLabel: string;
  detectedAppName: string;
  detectedPackageId: string | null;
  webRootPrefix: string | null;
  extractedFilesCount: number;
  dexFiles: string[];
  sampleEntries: ApkInspectionEntry[];
  extractedZipBlob: Blob | null;
  extractedZipFileName: string;
  rawApkBytes: Uint8Array;
}

export type DecompileStepId =
  | 'inspect_apk'
  | 'create_repo'
  | 'push_apk'
  | 'jadx_actions'
  | 'zip_ready';

export interface DecompileStep {
  id: DecompileStepId;
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

