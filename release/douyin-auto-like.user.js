// ==UserScript==
// @name         抖音自动点赞 - Z键连发
// @namespace    https://github.com/wang90/douyin-live-click
// @version      2.2.0
// @description  自动模拟 Z 键点赞。悬浮窗可拖拽、可展开/收起，闲置后自动贴边收起；支持跟随系统 / 浅色 / 深色主题与快捷键控制。
// @author       You
// @match        *://*/*
// @run-at       document-idle
// @noframes
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    // --- src/config.js ---
    const CONFIG = {
        defaultInterval: 200,
        minInterval: 50,
        maxInterval: 1000,
        intervalStep: 50,
        autoCollapseDelay: 6000,
        viewportGap: 8,
        dragThreshold: 4,
        panelWidth: 260,
        handleSize: 44,
        themeStorageKey: 'douyin-auto-like:theme',
    };

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const isEditableTarget = (target) => {
        if (!(target instanceof Element)) return false;
        return Boolean(
            target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
        );
    };

    // --- src/auto-like-controller.js ---
    class AutoLikeController {
        constructor(options = {}) {
            this.interval = this.normalizeInterval(options.interval ?? CONFIG.defaultInterval);
            this.timerId = null;
            this.isRunning = false;
            this.status = 'idle';
            this.listeners = new Set();
        }

        normalizeInterval(value) {
            const number = Number(value);
            if (!Number.isFinite(number)) return CONFIG.defaultInterval;
            const stepped = Math.round(number / CONFIG.intervalStep) * CONFIG.intervalStep;
            return clamp(stepped, CONFIG.minInterval, CONFIG.maxInterval);
        }

        subscribe(listener) {
            this.listeners.add(listener);
            listener(this.getState());
            return () => this.listeners.delete(listener);
        }

        emit() {
            const state = this.getState();
            this.listeners.forEach((listener) => listener(state));
        }

        getState() {
            return {
                running: this.isRunning,
                status: this.status,
                interval: this.interval,
            };
        }

        setInterval(value) {
            const nextInterval = this.normalizeInterval(value);
            if (nextInterval === this.interval) return;
            this.interval = nextInterval;

            if (this.isRunning) {
                this.restartTimer();
            }
            this.emit();
        }

        start() {
            if (this.isRunning) return;
            this.isRunning = true;
            this.status = 'running';
            this.triggerZ();
            this.restartTimer();
            this.emit();
        }

        pause() {
            if (!this.isRunning && !this.timerId) return;
            this.clearTimer();
            this.isRunning = false;
            this.status = 'paused';
            this.emit();
        }

        stop() {
            this.clearTimer();
            this.isRunning = false;
            this.status = 'stopped';
            this.emit();
        }

        toggle() {
            if (this.isRunning) {
                this.pause();
            } else {
                this.start();
            }
        }

        restartTimer() {
            this.clearTimer();
            this.timerId = window.setInterval(() => this.triggerZ(), this.interval);
        }

        clearTimer() {
            if (this.timerId) {
                window.clearInterval(this.timerId);
                this.timerId = null;
            }
        }

        triggerZ() {
            const target = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : document.body;

            if (!target) return;

            const baseOptions = {
                key: 'z',
                code: 'KeyZ',
                keyCode: 90,
                which: 90,
                bubbles: true,
                cancelable: true,
                composed: true,
            };

            target.dispatchEvent(new KeyboardEvent('keydown', {
                ...baseOptions,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
            }));

            target.dispatchEvent(new KeyboardEvent('keyup', {
                ...baseOptions,
                ctrlKey: false,
                shiftKey: false,
                altKey: false,
                metaKey: false,
            }));
        }
    }

    // ---------------------------------------------------------------------
    // 悬浮窗 UI
    // ---------------------------------------------------------------------

    // --- src/floating-widget.js ---
    class FloatingWidget {
        constructor(controller) {
            this.controller = controller;
            this.host = null;
            this.shadowRoot = null;
            this.elements = {};
            this.collapsed = true;
            this.edge = 'right';
            this.dragState = null;
            this.autoCollapseTimer = null;
            this.resizeTimer = null;
            this.isHovering = false;
            this.mounted = false;
            this.suppressClickUntil = 0;
            this.themeMode = this.readThemeMode();
            this.themeMedia = null;

            this.handleClick = this.handleClick.bind(this);
            this.handleRootKeyDown = this.handleRootKeyDown.bind(this);
            this.handleDragStart = this.handleDragStart.bind(this);
            this.handleDragMove = this.handleDragMove.bind(this);
            this.handleDragEnd = this.handleDragEnd.bind(this);
            this.handleIntervalInput = this.handleIntervalInput.bind(this);
            this.handlePointerEnter = this.handlePointerEnter.bind(this);
            this.handlePointerLeave = this.handlePointerLeave.bind(this);
            this.handleWindowResize = this.handleWindowResize.bind(this);
            this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
            this.handleSystemThemeChange = this.handleSystemThemeChange.bind(this);
        }

        mount() {
            if (this.mounted || !document.body) return;
            this.mounted = true;

            const host = document.createElement('div');
            host.id = 'douyin-auto-like-root';
            host.style.cssText = [
                'position: fixed !important',
                'top: auto !important',
                'left: auto !important',
                'right: 20px !important',
                'bottom: 20px !important',
                'z-index: 2147483647 !important',
                'display: block !important',
                `width: ${CONFIG.handleSize}px !important`,
                `height: ${CONFIG.handleSize}px !important`,
                'margin: 0 !important',
                'padding: 0 !important',
                'border: 0 !important',
                'background: transparent !important',
                'overflow: visible !important',
                'pointer-events: auto !important',
                'opacity: 1 !important',
                'visibility: visible !important',
                'transform: none !important',
                'filter: none !important',
            ].join(';') + ';';

            const shadowRoot = host.attachShadow({ mode: 'open' });
            shadowRoot.innerHTML = this.getTemplate();

            this.host = host;
            this.shadowRoot = shadowRoot;
            this.elements.root = shadowRoot.querySelector('.dy-widget');
            this.elements.statusText = shadowRoot.querySelector('.dy-status-text');
            this.elements.statusDot = shadowRoot.querySelector('.dy-dot');
            this.elements.toggleButton = shadowRoot.querySelector('[data-action="toggle"]');
            this.elements.themeButton = shadowRoot.querySelector('[data-action="theme"]');
            this.elements.intervalInput = shadowRoot.querySelector('.dy-interval');
            this.elements.intervalLabel = shadowRoot.querySelector('.dy-interval-label');

            this.setupTheme();
            this.bindEvents();
            document.body.appendChild(host);

            this.unsubscribe = this.controller.subscribe((state) => this.render(state));

            // 首次加载默认收起为贴边小圆点，不遮挡页面内容。
            this.setEdge('right');
            requestAnimationFrame(() => {
                this.snapToNearestEdge();
                this.render(this.controller.getState());
            });
        }

        destroy() {
            if (!this.mounted) return;
            if (this.unsubscribe) this.unsubscribe();

            this.cancelAutoCollapse();
            window.clearTimeout(this.resizeTimer);
            window.removeEventListener('resize', this.handleWindowResize);
            document.removeEventListener('visibilitychange', this.handleVisibilityChange);
            this.removeThemeListener();

            if (this.host && this.host.isConnected) {
                this.host.remove();
            }

            this.mounted = false;
            this.host = null;
            this.shadowRoot = null;
            this.elements = {};
        }

        readThemeMode() {
            try {
                const stored = window.localStorage.getItem(CONFIG.themeStorageKey);
                if (stored === 'auto' || stored === 'light' || stored === 'dark') return stored;
            } catch (error) {
                // 某些站点或隐私模式下 localStorage 不可用，忽略即可。
            }
            return 'auto';
        }

        persistThemeMode() {
            try {
                window.localStorage.setItem(CONFIG.themeStorageKey, this.themeMode);
            } catch (error) {
                // 忽略存储失败，主题仍然会在当前页面生效。
            }
        }

        setupTheme() {
            if (window.matchMedia) {
                this.themeMedia = window.matchMedia('(prefers-color-scheme: dark)');
                if (typeof this.themeMedia.addEventListener === 'function') {
                    this.themeMedia.addEventListener('change', this.handleSystemThemeChange);
                } else if (typeof this.themeMedia.addListener === 'function') {
                    this.themeMedia.addListener(this.handleSystemThemeChange);
                }
            }
            this.applyTheme();
        }

        removeThemeListener() {
            if (!this.themeMedia) return;
            if (typeof this.themeMedia.removeEventListener === 'function') {
                this.themeMedia.removeEventListener('change', this.handleSystemThemeChange);
            } else if (typeof this.themeMedia.removeListener === 'function') {
                this.themeMedia.removeListener(this.handleSystemThemeChange);
            }
            this.themeMedia = null;
        }

        handleSystemThemeChange() {
            if (this.themeMode === 'auto') this.applyTheme();
        }

        resolveTheme() {
            if (this.themeMode === 'auto') {
                return this.themeMedia && this.themeMedia.matches ? 'dark' : 'light';
            }
            return this.themeMode;
        }

        applyTheme() {
            if (!this.elements.root || !this.elements.themeButton) return;

            const resolved = this.resolveTheme();
            const labels = { auto: '跟随系统', light: '浅色', dark: '深色' };
            const icons = { auto: '◐', light: '☀', dark: '☾' };
            const modeLabel = labels[this.themeMode] || labels.auto;

            this.elements.root.classList.toggle('is-light', resolved === 'light');
            this.elements.root.classList.toggle('is-dark', resolved === 'dark');
            this.elements.themeButton.textContent = icons[this.themeMode] || icons.auto;
            this.elements.themeButton.title = `主题：${modeLabel}（点击切换）`;
            this.elements.themeButton.setAttribute('aria-label', `主题：${modeLabel}，点击切换`);
        }

        cycleTheme() {
            const order = ['auto', 'light', 'dark'];
            const nextIndex = (order.indexOf(this.themeMode) + 1) % order.length;
            this.themeMode = order[nextIndex] || 'auto';
            this.persistThemeMode();
            this.applyTheme();
        }

        getTemplate() {
            return `
                <style>
                    .dy-widget,
                    .dy-widget * {
                        box-sizing: border-box;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
                            "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
                    }

                    .dy-widget {
                        --dy-bg: rgba(22, 24, 35, 0.96);
                        --dy-border: rgba(255, 255, 255, 0.12);
                        --dy-text: #f5f6f7;
                        --dy-muted: #9ca3af;
                        --dy-green: #22c55e;
                        --dy-yellow: #f59e0b;
                        --dy-red: #ef4444;
                        --dy-brand: #fe2c55;
                        --dy-button-bg: rgba(255, 255, 255, 0.08);
                        --dy-button-hover: rgba(255, 255, 255, 0.14);
                        --dy-soft-bg: rgba(255, 255, 255, 0.055);
                        --dy-kbd-bg: rgba(255, 255, 255, 0.06);
                        --dy-kbd-border: rgba(255, 255, 255, 0.12);
                        --dy-track-bg: rgba(255, 255, 255, 0.13);
                        --dy-shadow: 0 10px 34px rgba(0, 0, 0, 0.38), 0 0 0 1px rgba(255, 255, 255, 0.03);
                        --dy-handle-shadow: 0 10px 26px rgba(0, 0, 0, 0.36);
                        --dy-badge-border: #161823;
                        color-scheme: dark;

                        color: var(--dy-text);
                        font-size: 13px;
                        line-height: 1.4;
                        user-select: none;
                        -webkit-user-select: none;
                        -webkit-tap-highlight-color: transparent;
                    }

                    .dy-widget.is-light {
                        --dy-bg: rgba(255, 255, 255, 0.98);
                        --dy-border: rgba(15, 23, 42, 0.14);
                        --dy-text: #111827;
                        --dy-muted: #64748b;
                        --dy-button-bg: rgba(15, 23, 42, 0.06);
                        --dy-button-hover: rgba(15, 23, 42, 0.11);
                        --dy-soft-bg: rgba(15, 23, 42, 0.05);
                        --dy-kbd-bg: rgba(15, 23, 42, 0.05);
                        --dy-kbd-border: rgba(15, 23, 42, 0.12);
                        --dy-track-bg: rgba(15, 23, 42, 0.13);
                        --dy-shadow: 0 12px 34px rgba(15, 23, 42, 0.16), 0 0 0 1px rgba(15, 23, 42, 0.04);
                        --dy-handle-shadow: 0 10px 26px rgba(15, 23, 42, 0.18);
                        --dy-badge-border: #fff;
                        color-scheme: light;
                    }

                    .dy-panel {
                        width: min(${CONFIG.panelWidth}px, calc(100vw - 12px));
                        max-height: calc(100vh - 12px);
                        overflow-x: hidden;
                        overflow-y: auto;
                        border: 1px solid var(--dy-border);
                        border-radius: 14px;
                        background: var(--dy-bg);
                        box-shadow: var(--dy-shadow);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        transition: background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
                    }

                    .dy-widget.is-collapsed .dy-panel {
                        display: none;
                    }

                    .dy-header {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        gap: 6px;
                        padding: 9px 10px 7px;
                        cursor: grab;
                        touch-action: none;
                    }

                    .dy-widget.is-dragging .dy-header {
                        cursor: grabbing;
                    }

                    .dy-header-actions {
                        display: flex;
                        align-items: center;
                        gap: 4px;
                    }

                    .dy-brand {
                        display: flex;
                        align-items: center;
                        min-width: 0;
                        gap: 7px;
                        font-size: 12px;
                        font-weight: 700;
                        letter-spacing: 0.2px;
                        white-space: nowrap;
                    }

                    .dy-brand-logo {
                        display: grid;
                        width: 20px;
                        height: 20px;
                        flex: 0 0 20px;
                        place-items: center;
                        border-radius: 6px;
                        background: linear-gradient(135deg, #fe2c55, #ff7a45);
                        color: #fff;
                        font-size: 10px;
                        font-weight: 800;
                        line-height: 1;
                    }

                    .dy-icon-btn {
                        display: grid;
                        width: 22px;
                        height: 22px;
                        flex: 0 0 22px;
                        place-items: center;
                        padding: 0;
                        border: 0;
                        border-radius: 7px;
                        background: var(--dy-button-bg);
                        color: var(--dy-muted);
                        font-family: inherit;
                        font-size: 15px;
                        line-height: 1;
                        cursor: pointer;
                        transition: background 0.15s ease, color 0.15s ease;
                    }

                    .dy-icon-btn:hover {
                        background: var(--dy-button-hover);
                        color: var(--dy-text);
                    }

                    .dy-status {
                        display: flex;
                        align-items: center;
                        gap: 7px;
                        margin: 0 10px;
                        padding: 7px 9px;
                        border-radius: 9px;
                        background: var(--dy-soft-bg);
                        color: var(--dy-muted);
                        font-size: 11px;
                        transition: background 0.2s ease, color 0.2s ease;
                    }

                    .dy-dot {
                        width: 8px;
                        height: 8px;
                        flex: 0 0 8px;
                        border-radius: 50%;
                        background: var(--dy-muted);
                        box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.15);
                        transition: background 0.2s ease, box-shadow 0.2s ease;
                    }

                    .dy-dot.is-running {
                        background: var(--dy-green);
                        box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.18);
                        animation: dy-dot-pulse 1.1s ease-in-out infinite;
                    }

                    .dy-dot.is-paused {
                        background: var(--dy-yellow);
                        box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.18);
                    }

                    .dy-dot.is-stopped {
                        background: var(--dy-red);
                        box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.16);
                    }

                    @keyframes dy-dot-pulse {
                        0%, 100% { transform: scale(1); opacity: 1; }
                        50% { transform: scale(0.72); opacity: 0.62; }
                    }

                    .dy-shortcut {
                        margin: 7px 10px 0;
                        color: var(--dy-muted);
                        font-size: 10px;
                        line-height: 1.5;
                    }

                    .dy-shortcut kbd {
                        display: inline-block;
                        min-width: 14px;
                        padding: 0 3px;
                        border: 1px solid var(--dy-kbd-border);
                        border-bottom-color: var(--dy-border);
                        border-radius: 4px;
                        background: var(--dy-kbd-bg);
                        color: var(--dy-muted);
                        font-family: inherit;
                        font-size: 9px;
                        line-height: 14px;
                        text-align: center;
                    }

                    .dy-actions {
                        display: flex;
                        gap: 6px;
                        padding: 8px 10px 5px;
                    }

                    .dy-btn {
                        flex: 1;
                        height: 29px;
                        padding: 0 8px;
                        border: 0;
                        border-radius: 8px;
                        background: var(--dy-button-bg);
                        color: var(--dy-text);
                        font-family: inherit;
                        font-size: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: background 0.15s ease, color 0.15s ease, filter 0.15s ease, transform 0.05s ease;
                    }

                    .dy-btn:hover {
                        background: var(--dy-button-hover);
                    }

                    .dy-btn:active {
                        transform: scale(0.98);
                    }

                    .dy-btn--primary {
                        background: linear-gradient(135deg, #fe2c55, #ff7a45);
                        color: #fff;
                    }

                    .dy-btn--primary:hover {
                        filter: brightness(1.08);
                    }

                    .dy-speed {
                        padding: 2px 10px 10px;
                    }

                    .dy-speed-row {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        margin-bottom: 5px;
                        color: var(--dy-muted);
                        font-size: 10px;
                    }

                    .dy-interval {
                        display: block;
                        width: 100%;
                        height: 4px;
                        margin: 0;
                        padding: 0;
                        border-radius: 999px;
                        outline: none;
                        background: var(--dy-track-bg);
                        -webkit-appearance: none;
                        appearance: none;
                    }

                    .dy-interval::-webkit-slider-thumb {
                        width: 14px;
                        height: 14px;
                        border: 2px solid #fff;
                        border-radius: 50%;
                        background: var(--dy-brand);
                        cursor: pointer;
                        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.35);
                        -webkit-appearance: none;
                        appearance: none;
                    }

                    .dy-interval::-moz-range-thumb {
                        width: 11px;
                        height: 11px;
                        border: 2px solid #fff;
                        border-radius: 50%;
                        background: var(--dy-brand);
                        cursor: pointer;
                        box-shadow: 0 1px 5px rgba(0, 0, 0, 0.35);
                    }


                    .dy-handle {
                        position: relative;
                        display: none;
                        width: ${CONFIG.handleSize}px;
                        height: ${CONFIG.handleSize}px;
                        align-items: center;
                        justify-content: center;
                        border: 1px solid var(--dy-border);
                        border-radius: 50%;
                        background: var(--dy-bg);
                        color: var(--dy-text);
                        box-shadow: var(--dy-handle-shadow);
                        font-size: 15px;
                        font-weight: 800;
                        cursor: pointer;
                        backdrop-filter: blur(10px);
                        -webkit-backdrop-filter: blur(10px);
                        transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease,
                            background 0.2s ease, color 0.2s ease, border-radius 0.15s ease;
                        touch-action: none;
                    }

                    .dy-widget.is-collapsed .dy-handle {
                        display: flex;
                    }

                    .dy-widget.is-collapsed.is-edge-left .dy-handle {
                        border-top-left-radius: 0;
                        border-bottom-left-radius: 0;
                    }

                    .dy-widget.is-collapsed.is-edge-right .dy-handle {
                        border-top-right-radius: 0;
                        border-bottom-right-radius: 0;
                    }

                    .dy-handle:hover {
                        transform: scale(1.05);
                        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.42);
                    }

                    .dy-handle:focus-visible,
                    .dy-icon-btn:focus-visible,
                    .dy-btn:focus-visible {
                        outline: 2px solid rgba(254, 44, 85, 0.85);
                        outline-offset: 2px;
                    }

                    .dy-handle::after {
                        content: "";
                        position: absolute;
                        inset: -5px;
                        border: 1px solid rgba(254, 44, 85, 0.35);
                        border-radius: 50%;
                        opacity: 0;
                    }

                    .dy-widget.is-running .dy-handle::after {
                        opacity: 1;
                        animation: dy-handle-ring 1.5s ease-out infinite;
                    }

                    @keyframes dy-handle-ring {
                        0% { transform: scale(0.9); opacity: 0.85; }
                        100% { transform: scale(1.35); opacity: 0; }
                    }

                    .dy-handle-badge {
                        position: absolute;
                        top: -2px;
                        right: -2px;
                        width: 10px;
                        height: 10px;
                        border: 2px solid var(--dy-badge-border);
                        border-radius: 50%;
                        background: var(--dy-muted);
                        transition: background 0.15s ease, border-color 0.2s ease;
                    }

                    .dy-widget.is-running .dy-handle-badge {
                        background: var(--dy-green);
                    }

                    .dy-widget.is-paused .dy-handle-badge {
                        background: var(--dy-yellow);
                    }

                    .dy-widget.is-stopped .dy-handle-badge {
                        background: var(--dy-red);
                    }

                    .dy-widget.is-light .dy-handle:hover {
                        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.2);
                    }

                    .dy-widget.is-light .dy-interval::-webkit-slider-thumb,
                    .dy-widget.is-light .dy-interval::-moz-range-thumb {
                        border-color: #fff;
                    }

                    @media (prefers-reduced-motion: reduce) {
                        .dy-dot.is-running,
                        .dy-widget.is-running .dy-handle::after {
                            animation: none;
                        }
                    }
                </style>

                <div class="dy-widget is-collapsed" part="widget">
                    <section class="dy-panel" aria-label="自动点赞控制面板">
                        <header class="dy-header" data-drag-handle title="按住可拖动">
                            <div class="dy-brand">
                                <span class="dy-brand-logo">Z</span>
                                <span>抖音自动点赞</span>
                            </div>
                            <div class="dy-header-actions">
                                <button class="dy-icon-btn" type="button" data-action="theme"
                                    aria-label="主题：跟随系统" title="主题：跟随系统（点击切换）">◐</button>
                                <button class="dy-icon-btn" type="button" data-action="collapse"
                                    aria-label="收起面板" title="收起">−</button>
                            </div>
                        </header>

                        <div class="dy-status">
                            <span class="dy-dot"></span>
                            <span class="dy-status-text">待命</span>
                        </div>

                        <div class="dy-shortcut">
                            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> 开关 ·
                            <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd> 停止
                        </div>

                        <div class="dy-actions">
                            <button class="dy-btn dy-btn--primary" type="button" data-action="toggle">开始</button>
                            <button class="dy-btn" type="button" data-action="stop">停止</button>
                        </div>

                        <div class="dy-speed">
                            <div class="dy-speed-row">
                                <span>连发间隔</span>
                                <span class="dy-interval-label">200ms</span>
                            </div>
                            <input class="dy-interval" type="range"
                                min="${CONFIG.minInterval}" max="${CONFIG.maxInterval}"
                                step="${CONFIG.intervalStep}" value="${CONFIG.defaultInterval}"
                                aria-label="连发间隔">
                        </div>
                    </section>

                    <div class="dy-handle" data-drag-handle data-action="expand" role="button" tabindex="0"
                        aria-label="展开自动点赞面板" title="展开自动点赞面板">
                        <span>Z</span>
                        <span class="dy-handle-badge"></span>
                    </div>
                </div>
            `;
        }

        bindEvents() {
            this.elements.root.addEventListener('click', this.handleClick);
            this.elements.root.addEventListener('keydown', this.handleRootKeyDown);
            this.elements.root.addEventListener('pointerenter', this.handlePointerEnter);
            this.elements.root.addEventListener('pointerleave', this.handlePointerLeave);

            this.elements.root.addEventListener('pointerdown', this.handleDragStart);
            this.elements.root.addEventListener('pointermove', this.handleDragMove);
            this.elements.root.addEventListener('pointerup', this.handleDragEnd);
            this.elements.root.addEventListener('pointercancel', this.handleDragEnd);

            this.elements.intervalInput.addEventListener('input', this.handleIntervalInput);

            window.addEventListener('resize', this.handleWindowResize, { passive: true });
            document.addEventListener('visibilitychange', this.handleVisibilityChange);
        }

        render(state) {
            const statusMap = {
                idle: { text: '待命', dotClass: '', button: '开始' },
                running: { text: '运行中', dotClass: 'is-running', button: '暂停' },
                paused: { text: '已暂停', dotClass: 'is-paused', button: '继续' },
                stopped: { text: '已停止', dotClass: 'is-stopped', button: '开始' },
            };

            const status = statusMap[state.status] || statusMap.idle;
            this.elements.statusText.textContent = status.text;
            this.elements.statusDot.className = `dy-dot ${status.dotClass}`;
            this.elements.toggleButton.textContent = status.button;
            this.elements.intervalInput.value = String(state.interval);
            this.elements.intervalLabel.textContent = `${state.interval}ms`;

            this.elements.root.classList.toggle('is-running', state.running);
            this.elements.root.classList.toggle('is-paused', state.status === 'paused');
            this.elements.root.classList.toggle('is-stopped', state.status === 'stopped');
        }


        handleClick(event) {
            if (Date.now() < this.suppressClickUntil) return;

            const actionElement = event.target.closest('[data-action]');
            if (!actionElement || !this.elements.root.contains(actionElement)) return;

            const action = actionElement.dataset.action;
            if (action === 'toggle') this.controller.toggle();
            if (action === 'stop') this.controller.stop();
            if (action === 'theme') this.cycleTheme();
            if (action === 'collapse') this.setCollapsed(true, { userInitiated: true });
            if (action === 'expand') this.setCollapsed(false, { userInitiated: true });

            this.markInteracted();
        }

        handleRootKeyDown(event) {
            const handle = event.target.closest('.dy-handle');
            if (!handle) return;
            if (event.key !== 'Enter' && event.key !== ' ') return;

            event.preventDefault();
            this.setCollapsed(false, { userInitiated: true });
            this.markInteracted();
        }

        handleIntervalInput(event) {
            this.controller.setInterval(Number(event.target.value));
            this.markInteracted();
        }

        handlePointerEnter() {
            this.isHovering = true;
            this.cancelAutoCollapse();
        }

        handlePointerLeave() {
            this.isHovering = false;
            this.scheduleAutoCollapse();
        }

        handleDragStart(event) {
            if (event.button !== 0) return;

            const dragHandle = event.target.closest('[data-drag-handle]');
            if (!dragHandle) return;
            if (event.target.closest('button, input')) return;

            const rect = this.host.getBoundingClientRect();
            this.dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startLeft: rect.left,
                startTop: rect.top,
                moved: false,
                captureTarget: dragHandle,
            };

            this.cancelAutoCollapse();
            try {
                dragHandle.setPointerCapture(event.pointerId);
            } catch (error) {
                // 指针已失效或不支持时忽略，后续仍可通过点击使用。
            }
        }

        handleDragMove(event) {
            const drag = this.dragState;
            if (!drag || event.pointerId !== drag.pointerId) return;

            const deltaX = event.clientX - drag.startX;
            const deltaY = event.clientY - drag.startY;

            if (!drag.moved) {
                if (Math.hypot(deltaX, deltaY) < CONFIG.dragThreshold) return;
                drag.moved = true;
                this.elements.root.classList.add('is-dragging');
                this.setEdge(null);
            }

            event.preventDefault();
            this.applyPosition(drag.startLeft + deltaX, drag.startTop + deltaY, { clamp: true });
        }

        handleDragEnd(event) {
            const drag = this.dragState;
            if (!drag || event.pointerId !== drag.pointerId) return;

            if (typeof drag.captureTarget.hasPointerCapture === 'function'
                && drag.captureTarget.hasPointerCapture(event.pointerId)) {
                drag.captureTarget.releasePointerCapture(event.pointerId);
            }

            this.dragState = null;
            this.elements.root.classList.remove('is-dragging');

            if (drag.moved) {
                this.suppressClickUntil = Date.now() + 300;

                if (this.collapsed) {
                    this.snapToNearestEdge();
                } else {
                    this.ensureInViewport();
                }
            }

            this.markInteracted();
        }

        handleWindowResize() {
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = window.setTimeout(() => {
                this.ensureInViewport();
                if (this.collapsed) this.snapToNearestEdge();
            }, 150);
        }

        handleVisibilityChange() {
            if (document.hidden && !this.collapsed) {
                this.setCollapsed(true);
            }
        }

        setCollapsed(collapsed, options = {}) {
            const { userInitiated = false } = options;

            const reposition = () => {
                if (collapsed) {
                    this.snapToNearestEdge();
                } else {
                    this.ensureInViewport();
                }
            };

            if (this.collapsed === collapsed) {
                this.updateHostSize(collapsed);
                reposition();
                requestAnimationFrame(reposition);
                if (userInitiated) this.markInteracted();
                return;
            }

            this.collapsed = collapsed;
            this.elements.root.classList.toggle('is-collapsed', collapsed);
            this.updateHostSize(collapsed);
            this.cancelAutoCollapse();

            // getBoundingClientRect 会强制刷新布局，再延迟一帧兜底处理窗口尺寸变化。
            reposition();
            requestAnimationFrame(reposition);

            if (!collapsed && userInitiated) {
                this.markInteracted();
            }
        }

        updateHostSize(collapsed) {
            const size = `${CONFIG.handleSize}px`;
            const panelWidth = `min(${CONFIG.panelWidth}px, calc(100vw - 12px))`;
            this.host.style.setProperty('width', collapsed ? size : panelWidth, 'important');
            this.host.style.setProperty('height', collapsed ? size : 'auto', 'important');
        }

        markInteracted() {
            this.cancelAutoCollapse();
            this.scheduleAutoCollapse();
        }

        cancelAutoCollapse() {
            if (this.autoCollapseTimer) {
                window.clearTimeout(this.autoCollapseTimer);
                this.autoCollapseTimer = null;
            }
        }

        scheduleAutoCollapse() {
            this.cancelAutoCollapse();
            if (this.collapsed || this.isHovering || this.dragState) return;

            this.autoCollapseTimer = window.setTimeout(() => {
                this.autoCollapseTimer = null;
                if (!this.collapsed && !this.isHovering && !this.dragState) {
                    this.setCollapsed(true);
                }
            }, CONFIG.autoCollapseDelay);
        }

        setEdge(edge) {
            this.edge = edge;
            this.elements.root.classList.toggle('is-edge-left', edge === 'left');
            this.elements.root.classList.toggle('is-edge-right', edge === 'right');
        }

        applyPosition(left, top, options = {}) {
            const { clamp: shouldClamp = true, gap = CONFIG.viewportGap } = options;
            const rect = this.host.getBoundingClientRect();

            let nextLeft = left;
            let nextTop = top;

            if (shouldClamp) {
                const maxLeft = Math.max(gap, window.innerWidth - rect.width - gap);
                const maxTop = Math.max(gap, window.innerHeight - rect.height - gap);
                nextLeft = clamp(left, gap, maxLeft);
                nextTop = clamp(top, gap, maxTop);
            }

            this.host.style.setProperty('left', `${Math.round(nextLeft)}px`, 'important');
            this.host.style.setProperty('top', `${Math.round(nextTop)}px`, 'important');
            this.host.style.setProperty('right', 'auto', 'important');
            this.host.style.setProperty('bottom', 'auto', 'important');
        }

        ensureInViewport() {
            if (!this.host || !this.host.isConnected) return;
            const rect = this.host.getBoundingClientRect();
            this.applyPosition(rect.left, rect.top, { clamp: true });
        }

        snapToNearestEdge() {
            if (!this.host || !this.host.isConnected) return;

            const rect = this.host.getBoundingClientRect();
            const viewportMiddle = window.innerWidth / 2;
            const centerX = rect.left + rect.width / 2;
            const edge = centerX <= viewportMiddle ? 'left' : 'right';
            const gap = this.collapsed ? 0 : CONFIG.viewportGap;
            const left = edge === 'left'
                ? gap
                : window.innerWidth - rect.width - gap;

            this.setEdge(edge);
            this.applyPosition(left, rect.top, { clamp: true, gap });
        }
    }

    // ---------------------------------------------------------------------
    // 启动脚本
    // ---------------------------------------------------------------------

    // --- src/bootstrap.js ---
    function initialize() {
        if (window.__DOUYIN_AUTO_LIKE_LOADED__) return;
        window.__DOUYIN_AUTO_LIKE_LOADED__ = true;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
        } else {
            bootstrap();
        }
    }

    function bindGlobalShortcuts(controller, widget) {
        document.addEventListener('keydown', (event) => {
            if (event.repeat) return;
            if (!event.ctrlKey || !event.shiftKey) return;

            const key = event.key ? event.key.toLowerCase() : '';
            if (key !== 'z' && key !== 'x') return;

            if (isEditableTarget(event.target)) return;

            event.preventDefault();

            if (key === 'z') {
                controller.toggle();
            } else {
                controller.stop();
            }

            widget.markInteracted();
        }, true);
    }

    function bootstrap() {
        if (!document.body) return;

        const controller = new AutoLikeController();
        const widget = new FloatingWidget(controller);

        widget.mount();
        bindGlobalShortcuts(controller, widget);

        console.info(
            '[抖音自动点赞] 脚本已加载：Ctrl+Shift+Z 开启/暂停，Ctrl+Shift+X 停止。' +
            '悬浮窗可拖动，闲置 6 秒后自动贴边收起。'
        );
    }

    // --- src/main.js ---
    initialize();
})();
