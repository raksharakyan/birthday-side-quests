import { defineConfig, loadEnv, type Plugin } from 'vite';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildCsp, workerOrigin } from './csp.config';

/**
 * Injects the CSP <meta> at build time (dev server needs inline styles/HMR, so
 * dev is left without CSP) and rewrites dist/_headers with the same policy.
 */
function cspPlugin(rawWorkerUrl: string | undefined): Plugin {
  const origin = workerOrigin(rawWorkerUrl);
  if (rawWorkerUrl && !origin) {
    throw new Error('VITE_WORKER_URL must be an https URL without credentials');
  }
  let outDir = 'dist';
  return {
    name: 'bsq-csp',
    apply: 'build',
    configResolved(cfg) {
      outDir = resolve(cfg.root, cfg.build.outDir);
    },
    transformIndexHtml: {
      order: 'post',
      handler() {
        return [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: buildCsp({ workerOrigin: origin, forHeader: false }) },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
    closeBundle() {
      const file = resolve(outDir, '_headers');
      if (!existsSync(file)) return;
      const csp = buildCsp({ workerOrigin: origin, forHeader: true });
      const next = readFileSync(file, 'utf8').replace(/Content-Security-Policy:.*$/m, `Content-Security-Policy: ${csp}`);
      writeFileSync(file, next);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = env.VITE_BASE || process.env.VITE_BASE || '/birthday-side-quests/';
  const workerUrl = env.VITE_WORKER_URL || process.env.VITE_WORKER_URL || '';
  return {
    base,
    plugins: [cspPlugin(workerUrl)],
    build: {
      target: 'es2022',
      // No data: URIs for fonts/images (font-src is 'self' only) and no inline scripts.
      assetsInlineLimit: 0,
      modulePreload: { polyfill: false },
      cssCodeSplit: false,
      sourcemap: false,
    },
    preview: { port: 4173, strictPort: true },
    server: { port: 5173 },
  };
});
