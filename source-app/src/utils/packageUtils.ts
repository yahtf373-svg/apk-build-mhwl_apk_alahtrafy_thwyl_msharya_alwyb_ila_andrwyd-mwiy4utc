const ARABIC_TRANSLIT_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'aa', 'ب': 'b', 'ت': 't', 'ث': 'th',
  'ج': 'j', 'ح': 'h', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a',
  'غ': 'gh', 'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'ة': 'a', 'و': 'w', 'ؤ': 'w', 'ي': 'y', 'ى': 'a', 'ئ': 'y',
  'ء': '',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'true', 'false', 'null',
]);

export function transliterateToAsciiSlug(input: string): string {
  const lowered = input.trim().toLowerCase();
  let out = '';
  for (const ch of lowered) {
    if (ARABIC_TRANSLIT_MAP[ch] !== undefined) {
      out += ARABIC_TRANSLIT_MAP[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (ch === ' ' || ch === '-' || ch === '_' || ch === '.') {
      out += '_';
    }
  }
  const collapsed = out.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!collapsed) return 'app';
  const safeStart = /^[0-9]/.test(collapsed) ? `app_${collapsed}` : collapsed;
  return JAVA_KEYWORDS.has(safeStart) ? `${safeStart}_app` : safeStart;
}

export function generatePackageName(appName: string, orgPrefix = 'com.apkpro'): string {
  const slug = transliterateToAsciiSlug(appName);
  const cleanPrefix = orgPrefix
    .toLowerCase()
    .split('.')
    .map((seg) => seg.replace(/[^a-z0-9_]/g, ''))
    .filter((seg) => seg.length > 0 && !/^[0-9]/.test(seg) && !JAVA_KEYWORDS.has(seg));

  const base = cleanPrefix.length >= 2 ? cleanPrefix.join('.') : 'com.apkpro';
  return `${base}.${slug}`;
}

export function validatePackageName(pkg: string): { valid: boolean; reason?: string } {
  const trimmed = pkg.trim();
  if (!trimmed) {
    return { valid: false, reason: 'يرجى إدخال معرّف الحزمة (Package Name)' };
  }
  const segments = trimmed.split('.');
  if (segments.length < 2) {
    return { valid: false, reason: 'يجب أن يحتوي المعرّف على مقطعين على الأقل مثل com.myapp.app' };
  }
  for (const seg of segments) {
    if (!/^[a-z][a-z0-9_]*$/.test(seg)) {
      return {
        valid: false,
        reason: `المقطع "${seg}" غير صالح: يجب أن يبدأ بحرف إنجليزي صغير ويحتوي على أحرف وأرقام و (_) فقط`,
      };
    }
    if (JAVA_KEYWORDS.has(seg)) {
      return { valid: false, reason: `المقطع "${seg}" كلمة محجوزة في Java ولا يمكن استخدامها` };
    }
  }
  return { valid: true };
}

export function validateVersionName(version: string): { valid: boolean; reason?: string } {
  const trimmed = version.trim();
  if (!/^\d+\.\d+\.\d+$/.test(trimmed)) {
    return { valid: false, reason: 'يجب كتابة رقم الإصدار بصيغة ثلاثية مثل 1.0.0' };
  }
  return { valid: true };
}

export function computeVersionCode(versionName: string): number {
  const match = versionName.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return 10000;
  const major = Number.parseInt(match[1], 10);
  const minor = Number.parseInt(match[2], 10);
  const patch = Number.parseInt(match[3], 10);
  return Math.max(1, major * 10000 + minor * 100 + patch);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
