import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { bundleUserscript, OUTPUT_FILE } from './lib/bundler.mjs';

const SCRIPT_FILE = 'douyin-auto-like.user.js';
const KEEP_ALIVE = process.argv.includes('--keep');
const NO_OPEN = process.argv.includes('--no-open');
const portIndex = process.argv.indexOf('--port');
const preferredPort = portIndex !== -1 ? Number(process.argv[portIndex + 1]) : 0;

function openBrowser(url) {
    if (NO_OPEN) return;

    const platform = process.platform;
    let command = null;
    let args = null;

    if (platform === 'darwin') {
        command = 'open';
        args = [url];
    } else if (platform === 'win32') {
        command = 'cmd';
        args = ['/c', 'start', '', url];
    } else {
        command = 'xdg-open';
        args = [url];
    }

    try {
        spawn(command, args, { stdio: 'ignore', detached: true }).unref();
    } catch (error) {
        console.warn(`[import] 无法自动打开浏览器，请手动访问: ${url}`);
    }
}

function createLandingPage(installPath) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>安装抖音自动点赞</title>
  <style>
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #111; color: #eee; font-family: sans-serif; }
    main { max-width: 460px; padding: 28px; border: 1px solid #333; border-radius: 16px; background: #1a1a1a; }
    h1 { margin: 0 0 10px; font-size: 20px; }
    p { color: #aaa; line-height: 1.7; }
    a { display: inline-block; margin-top: 12px; padding: 10px 14px; border-radius: 8px; background: #fe2c55; color: #fff; text-decoration: none; }
  </style>
</head>
<body>
  <main>
    <h1>抖音自动点赞 Userscript</h1>
    <p>如果 Tampermonkey 没有自动弹出安装页面，请点击下面的按钮。</p>
    <a href="${installPath}">安装到 Tampermonkey</a>
  </main>
</body>
</html>`;
}

const output = bundleUserscript();
writeFileSync(OUTPUT_FILE, output, 'utf8');

let server = null;
let closing = false;
let maxLifetimeTimer = null;

function closeServer(reason) {
    if (closing || !server || !server.listening) return;
    closing = true;
    console.log(`[import] ${reason}，关闭本地服务。`);
    server.close(() => process.exit(0));
}

server = createServer((request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);

    if (url.pathname === `/${SCRIPT_FILE}`) {
        response.writeHead(200, {
            'Content-Type': 'application/javascript; charset=utf-8',
            'Content-Disposition': `inline; filename="${SCRIPT_FILE}"`,
            'Cache-Control': 'no-store',
        });
        response.end(output);

        if (!KEEP_ALIVE) {
            setTimeout(() => closeServer('安装脚本已发送'), 8000);
        }
        return;
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
        response.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
        });
        response.end(createLandingPage(`/${SCRIPT_FILE}`));
        return;
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
});

server.on('error', (error) => {
    console.error('[import] 本地服务启动失败:', error.message);
    process.exit(1);
});

server.listen(preferredPort, '127.0.0.1', () => {
    const address = server.address();
    const port = address && typeof address === 'object' ? address.port : preferredPort;
    const installUrl = `http://127.0.0.1:${port}/${SCRIPT_FILE}`;

    console.log(`[import] 已重新构建: ${OUTPUT_FILE}`);
    console.log(`[import] 安装地址: ${installUrl}`);
    console.log('[import] 浏览器会在 Tampermonkey 安装页请求确认，点击“安装”即可导入。');

    openBrowser(installUrl);

    if (KEEP_ALIVE) {
        console.log('[import] 已启用 --keep，服务将保持运行；按 Ctrl+C 退出。');
    } else {
        maxLifetimeTimer = setTimeout(() => closeServer('等待超时'), 120000);
        if (maxLifetimeTimer.unref) maxLifetimeTimer.unref();
    }
});

process.on('SIGINT', () => {
    closeServer('收到退出信号');
});
