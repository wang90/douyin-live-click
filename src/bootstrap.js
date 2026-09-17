import { AutoLikeController } from './auto-like-controller.js';
import { FloatingWidget } from './floating-widget.js';
import { isEditableTarget } from './config.js';

export function initialize() {
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
