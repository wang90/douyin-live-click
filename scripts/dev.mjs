import { createServer } from 'node:http';
import { readFileSync, watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleUserscript, ROOT_DIR, SRC_DIR } from './lib/bundler.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEV_PAGE = resolve(ROOT_DIR, 'dev', 'index.html');

function readPort() {
    const index = process.argv.indexOf('--port');
    if (index !== -1 && process.argv[index + 1]) return Number(process.argv[index + 1]);
    return Number(process.env.PORT || 4173);
}

function openBrowser(url) {
    if (!process.argv.includes('--open')) return;
    const command = process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';
    try {
        spawn(command, [url], { stdio: 'ignore', detached: true }).unref();
    } catch (error) {
        console.warn('[dev] 无法自动打开浏览器，请手动访问:', url);
    }
}

const port = readPort();
const clients = new Set();

const server = createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);

    if (url.pathname === '/' || url.pathname === '/index.html') {
        response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        response.end(readFileSync(DEV_PAGE, 'utf8'));
        return;
    }

    if (url.pathname === '/index.js') {
        try {
            const code = bundleUserscript();
            response.writeHead(200, {
                'Content-Type': 'text/javascript; charset=utf-8',
                'Cache-Control': 'no-store',
            });
            response.end(code);
        } catch (error) {
            response.writeHead(500, {
                'Content-Type': 'text/plain; charset=utf-8',
            });
            response.end(String(error && error.stack ? error.stack : error));
        }
        return;
    }

    if (url.pathname === '/__dev/events') {
        response.writeHead(200, {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        response.write('\n');
        clients.add(response);
        request.on('close', () => clients.delete(response));
        return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
});

let rebuildTimer = null;

watch(SRC_DIR, () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
        console.log('[dev] 检测到源码变化，通知页面刷新...');
        for (const client of clients) {
            client.write('data: reload\n\n');
        }
    }, 120);
});

server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`[dev] 开发模拟页已启动: ${url}`);
    console.log('[dev] 使用 ?auto=0 可关闭页面自动模拟。');
    openBrowser(url);
});

server.on('error', (error) => {
    if (error && error.code === 'EADDRINUSE') {
        console.error(`[dev] 端口 ${port} 已被占用，请使用 --port 指定其他端口。`);
    } else {
        console.error('[dev] 服务启动失败:', error);
    }
    process.exit(1);
});
