import { CONFIG, clamp } from './config.js';

export class AutoLikeController {
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
