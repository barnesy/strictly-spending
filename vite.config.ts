/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import os from 'node:os'

function getLocalNetworkUrls(port: number = 5173): { label: string; url: string; isTailscale: boolean }[] {
  const interfaces = os.networkInterfaces();
  const urls: { label: string; url: string; isTailscale: boolean }[] = [];
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const isTailscale = addr.address.startsWith('100.') || /tailscale/i.test(name);
        urls.push({
          label: isTailscale ? `Tailscale (${name})` : `Wi-Fi / LAN (${name})`,
          url: `http://${addr.address}:${port}`,
          isTailscale,
        });
      }
    }
  }
  return urls;
}

function setCorsHeaders(req: any, res: any): boolean {
  res.setHeader('Access-Control-Allow-Origin', req.headers?.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function devIpcPlugin() {
  return {
    name: 'dev-ipc-plugin',
    configureServer(server: any) {
      server.middlewares.use('/api/mobile-info', (req: any, res: any) => {
        if (setCorsHeaders(req, res)) return;
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        const port = server.config?.server?.port || 5173;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          port,
          urls: getLocalNetworkUrls(port),
        }));
      });

      server.middlewares.use('/api/tauri-ipc', async (req: any, res: any) => {
        if (setCorsHeaders(req, res)) return;
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk;
        });

        req.on('end', async () => {
          try {
            const { cmd, args } = JSON.parse(body || '{}');
            const { createRequire } = await import('node:module');
            const reqCjs = createRequire(import.meta.url);
            const resolved = reqCjs.resolve('./scripts/dev-ipc-handler.cjs');
            delete reqCjs.cache[resolved];
            const { handleIpc } = reqCjs('./scripts/dev-ipc-handler.cjs');
            const result = await handleIpc(cmd, args);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
          } catch (e: any) {
            console.error('[devIpcPlugin] error:', e);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: e.message || String(e) }));
          }
        });
      });

      server.middlewares.use('/api/mcp', async (req: any, res: any) => {
        if (setCorsHeaders(req, res)) return;
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }
        let body = '';
        req.on('data', (chunk: any) => {
          body += chunk;
        });
        req.on('end', async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const { createRequire } = await import('node:module');
            const reqCjs = createRequire(import.meta.url);
            const resolved = reqCjs.resolve('./scripts/mcp-server.cjs');
            delete reqCjs.cache[resolved];
            const { handleMcpJsonRpc } = reqCjs('./scripts/mcp-server.cjs');
            const rpcResp = handleMcpJsonRpc(payload);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(rpcResp || { jsonrpc: '2.0', result: null }));
          } catch (e: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              jsonrpc: '2.0',
              id: null,
              error: { code: -32603, message: e.message || String(e) }
            }));
          }
        });
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react(), devIpcPlugin()],
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime', '@emotion/react', '@emotion/styled', '@mui/material'],
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react/jsx-runtime',
        '@mui/material',
        '@mui/material/styles',
        '@mui/material/utils',
        '@emotion/react',
        '@emotion/styled',
      ],
    },
    server: {
      host: true,
      port: 5173,
      allowedHosts: true,
      watch: {
        ignored: ['**/src-tauri/**', '**/dist/**', '**/dist-landing/**'],
      },
    },
    build: {
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return;
          warn(warning);
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
              return 'vendor-echarts';
            }
            if (id.includes('node_modules/pdfjs-dist')) {
              return 'vendor-pdfjs';
            }
            if (id.includes('node_modules/@mui/')) {
              return 'vendor-mui';
            }
          },
        },
      }
    },
    test: {
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['./src/setupTests.ts']
    }
  }
})
