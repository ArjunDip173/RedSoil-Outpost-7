import { copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

/**
 * Inlines the bundled JS, CSS and fonts into ONE html file, so the game can be opened
 * by double-clicking it (file://), with no server and no "npm run dev".
 * The result is copied to ./RedSoil-Outpost7.html for submission.
 */
const ROOT = fileURLToPath(new URL('.', import.meta.url));

function singleFile(): Plugin {
  return {
    name: 'single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const htmlAsset = Object.values(bundle).find((a) => a.type === 'asset' && a.fileName.endsWith('.html'));
      if (!htmlAsset || htmlAsset.type !== 'asset') return;
      let html = String(htmlAsset.source);
      for (const [name, item] of Object.entries(bundle)) {
        if (item.type === 'chunk' && item.isEntry) {
          const code = item.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(
            new RegExp(
              `<script[^>]*src="[^"]*${item.fileName.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*></script>`,
            ),
            () => '',
          );
          html = html.replace('</body>', () => `<script type="module">${code}</script>\n</body>`);
          delete bundle[name];
        } else if (item.type === 'asset' && name.endsWith('.css')) {
          html = html.replace(
            new RegExp(`<link[^>]*href="[^"]*${item.fileName.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"[^>]*>`),
            () => `<style>${String(item.source)}</style>`,
          );
          delete bundle[name];
        }
      }
      // the dev-only redirect is not needed in the single file
      html = html.replace(/<script id="file-redirect">[\s\S]*?<\/script>/, '');
      htmlAsset.source = html;
    },
    closeBundle() {
      copyFileSync(resolve(ROOT, 'dist/index.html'), resolve(ROOT, 'RedSoil-Outpost7.html'));
    },
  };
}

export default defineConfig({
  base: './',
  publicDir: false,
  server: { port: 5173, open: false },
  build: {
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
  plugins: [singleFile()],
});
