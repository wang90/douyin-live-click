export const CONFIG = {
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

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const isEditableTarget = (target) => {
    if (!(target instanceof Element)) return false;
    return Boolean(
        target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
    );
};
