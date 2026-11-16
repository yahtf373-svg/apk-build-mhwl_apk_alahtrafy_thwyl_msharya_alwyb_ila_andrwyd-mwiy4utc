import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

function singleFileRootPlugin(): Plugin {
  let outDir = path.resolve(__dirname, 'dist');
  let builtHtml = '';

  return {
    name: 'single-file-root-html',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = path.resolve(__dirname, config.build.outDir || 'dist');
    },
    generateBundle(_opts, bundle) {
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith('.html'));
      if (!htmlKey) return;
      const htmlAsset = bundle[htmlKey];
      if (htmlAsset.type !== 'asset') return;

      let html = String(htmlAsset.source);
      const toRemove: string[] = [];
      const inlineScripts: string[] = [];

      for (const [key, item] of Object.entries(bundle)) {
        const baseName = path.posix.basename(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (item.type === 'asset' && key.endsWith('.css')) {
          const css = String(item.source);
          const linkRe = new RegExp(
            `<link[^>]*href=["'][^"']*${baseName}["'][^>]*>`,
            'gi'
          );
          html = html.replace(linkRe, () => `<style>${css}</style>`);
          toRemove.push(key);
        } else if (item.type === 'chunk' && key.endsWith('.js')) {
          const safeJs = item.code.replace(/<\/script>/gi, '<\\/script>');
          const scriptRe = new RegExp(
            `<script[^>]*src=["'][^"']*${baseName}["'][^>]*>\\s*</script>`,
            'gi'
          );
          html = html.replace(scriptRe, '');
          inlineScripts.push(`<script type="module">${safeJs}</script>`);
          toRemove.push(key);
        }
      }

      if (inlineScripts.length > 0) {
        const scriptsBlock = inlineScripts.join('\n');
        if (/<\/body>/i.test(html)) {
          html = html.replace(/<\/body>/i, () => `${scriptsBlock}\n  </body>`);
        } else {
          html += `\n${scriptsBlock}`;
        }
      }

      for (const key of toRemove) {
        delete bundle[key];
      }

      delete bundle[htmlKey];
      builtHtml = html;
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: html,
      });
    },
    closeBundle() {
      if (!builtHtml) {
        const distHtmlPath = path.join(outDir, 'index.html');
        if (fs.existsSync(distHtmlPath)) {
          builtHtml = fs.readFileSync(distHtmlPath, 'utf8');
        }
      }
      if (builtHtml) {
        fs.writeFileSync(path.resolve(__dirname, 'index.html'), builtHtml, 'utf8');
      }
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), singleFileRootPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      assetsInlineLimit: 100_000_000,
      cssCodeSplit: false,
      rollupOptions: {
        input: path.resolve(__dirname, 'src/entry.html'),
        output: {
          inlineDynamicImports: true,
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
