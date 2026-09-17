import { watch, writeFileSync } from 'node:fs';
import { bundleUserscript, OUTPUT_FILE, SRC_DIR } from './lib/bundler.mjs';

function build() {
    const output = bundleUserscript();
    writeFileSync(OUTPUT_FILE, output, 'utf8');
    console.log(`[build] 已生成 index.js (${Buffer.byteLength(output, 'utf8')} bytes)`);
}

build();

if (process.argv.includes('--watch')) {
    console.log('[build] 监听 src/ 文件变化，保存后自动重新构建...');
    let timer = null;

    watch(SRC_DIR, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            try {
                build();
            } catch (error) {
                console.error('[build] 构建失败:', error.message);
            }
        }, 120);
    });
}
