// ==UserScript==
// @name         自动点赞 - Z键连发
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  自动无限触发键盘Z键，模拟手动点赞。按 `Ctrl + Shift + Z` 开启/暂停，按 `Ctrl + Shift + X` 彻底停止。
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    let isRunning = false;
    let intervalId = null;

    // 触发 Z 键（模拟真实按键事件）
    function triggerZ() {
        const target = document.activeElement || document.body;

        // 构造并分发 keydown 事件
        const keydownEvent = new KeyboardEvent('keydown', {
            key: 'z',
            code: 'KeyZ',
            keyCode: 90,
            which: 90,
            bubbles: true,
            cancelable: true,
            ctrlKey: false,
            shiftKey: false,
            altKey: false
        });
        target.dispatchEvent(keydownEvent);

        // 构造并分发 keyup 事件
        const keyupEvent = new KeyboardEvent('keyup', {
            key: 'z',
            code: 'KeyZ',
            keyCode: 90,
            which: 90,
            bubbles: true,
            cancelable: true
        });
        target.dispatchEvent(keyupEvent);
    }

    // 开始连发
    function start() {
        if (isRunning) return;
        isRunning = true;
        console.log('[自动点赞] 已开启，间隔 200ms 触发 Z 键');

        // 立即触发一次，然后定时循环
        triggerZ();
        intervalId = setInterval(() => {
            triggerZ();
        }, 200); // 200ms 间隔，约每秒 5 次，既稳定又接近真人手速
    }

    // 暂停
    function pause() {
        isRunning = false;
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        console.log('[自动点赞] 已暂停');
    }

    // 完全停止并清理
    function stop() {
        pause();
        console.log('[自动点赞] 已彻底停止');
    }

    // 监听全局快捷键
    document.addEventListener('keydown', (e) => {
        // Ctrl + Shift + Z：切换 开启/暂停
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (isRunning) {
                pause();
            } else {
                start();
            }
        }

        // Ctrl + Shift + X：彻底停止
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            stop();
        }
    });

    // 页面右下角显示一个小状态指示器
    const indicator = document.createElement('div');
    indicator.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 8px 14px;
        background: rgba(0,0,0,0.7);
        color: #fff;
        font-size: 13px;
        border-radius: 6px;
        z-index: 999999;
        font-family: sans-serif;
        pointer-events: none;
        user-select: none;
        transition: opacity 0.3s;
    `;
    indicator.textContent = '自动点赞：待命 (Ctrl+Shift+Z)';
    document.body.appendChild(indicator);

    // 更新指示器状态
    const originalStart = start;
    const originalPause = pause;
    start = function() {
        originalStart();
        indicator.textContent = '自动点赞：运行中 🔥 (Ctrl+Shift+Z 暂停)';
        indicator.style.background = 'rgba(231, 76, 60, 0.85)';
    };
    pause = function() {
        originalPause();
        indicator.textContent = '自动点赞：已暂停 ⏸ (Ctrl+Shift+Z 继续)';
        indicator.style.background = 'rgba(241, 196, 15, 0.85)';
    };

    console.log('[自动点赞] 脚本已加载。按 Ctrl+Shift+Z 开启/暂停，Ctrl+Shift+X 停止');
})();
