import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = resolve(__dirname, '..', '..');
export const SRC_DIR = resolve(ROOT_DIR, 'src');
export const ENTRY_FILE = resolve(SRC_DIR, 'main.js');
export const META_FILE = resolve(SRC_DIR, 'userscript.meta.txt');
export const USERSCRIPT_CONFIG_FILE = resolve(SRC_DIR, 'userscript.config.json');
export const OUTPUT_FILE = resolve(ROOT_DIR, 'index.js');

const DEFAULT_MATCH_PATTERNS = ['https://www.douyin.com/*'];

function readMatchPatterns() {
    try {
        const config = JSON.parse(readFileSync(USERSCRIPT_CONFIG_FILE, 'utf8'));
        if (Array.isArray(config.matchPatterns)) {
            const patterns = config.matchPatterns
                .map((pattern) => String(pattern).trim())
                .filter(Boolean);
            if (patterns.length > 0) return patterns;
        }
    } catch (error) {
        // 配置文件不存在或格式错误时，回退到抖音默认域名。
    }
    return DEFAULT_MATCH_PATTERNS;
}

// 只处理单行 import，适合当前这种轻量 Userscript 项目。
// 这样不需要引入 esbuild/rollup，pnpm run build 可以直接工作。
const IMPORT_RE = /^\s*import\s+(?:[^\n]*?\s+from\s+)?['"]([^'"]+)['"];?[ \t]*$/gm;
const EXPORT_RE = /^export\s+(?=(?:async\s+function|function|class|const|let|var)\b)/gm;

function collectModules(filePath, modules, collected, visiting) {
    const absolutePath = resolve(filePath);

    if (collected.has(absolutePath)) return;
    if (visiting.has(absolutePath)) {
        throw new Error(`[build] 检测到循环依赖: ${absolutePath}`);
    }

    visiting.add(absolutePath);

    const source = readFileSync(absolutePath, 'utf8');
    const imports = [];

    const codeWithoutImports = source.replace(IMPORT_RE, (match, specifier) => {
        imports.push(specifier);
        return '';
    });

    for (const specifier of imports) {
        if (!specifier.startsWith('.')) {
            throw new Error(`[build] 暂不支持 npm 包导入: ${specifier} (${relative(ROOT_DIR, absolutePath)})`);
        }
        collectModules(
            resolve(dirname(absolutePath), specifier),
            modules,
            collected,
            visiting,
        );
    }

    visiting.delete(absolutePath);
    collected.add(absolutePath);

    const transformed = codeWithoutImports.replace(EXPORT_RE, '').trim();
    modules.push(`// --- ${relative(ROOT_DIR, absolutePath)} ---\n${transformed}`);
}

function indent(text, size) {
    const padding = ' '.repeat(size);
    return text
        .split('\n')
        .map((line) => (line.length > 0 ? padding + line : line))
        .join('\n');
}

export function bundleUserscript() {
    const modules = [];
    collectModules(ENTRY_FILE, modules, new Set(), new Set());

    const matchLines = readMatchPatterns()
        .map((pattern) => `// @match        ${pattern}`)
        .join('\n');
    const metadata = readFileSync(META_FILE, 'utf8')
        .replace('__MATCH_PATTERNS__', matchLines)
        .trim();
    const body = modules.join('\n\n');

    return `${metadata}\n\n(function () {\n    'use strict';\n${indent(body, 4)}\n})();\n`;
}
