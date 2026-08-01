import { Button, IconButton } from '../components.js';

const SECTION_COPY = Object.freeze([
    { key: 'rant', icon: 'info', zh: ' 为什么需要这个？', en: ' Why does this exist?' },
    { key: 'features', icon: 'gem', zh: ' 它能做什么？', en: ' What does it do?' },
    { key: 'guide', icon: 'wrench', zh: ' 如何使用？', en: ' How to use?' }
]);

function languageOf(ui) {
    return ui.getLocale().split('-')[0] === 'zh' ? 'zh' : 'en';
}

export function openOnboardingController(options = {}) {
    const { document: documentRef, registry, core, getTheme, createIcon, renderModuleIcon, ui } = options;
    if (!documentRef?.createElement) throw new TypeError('Onboarding requires a DOM document');
    for (const [value, label] of [[getTheme, 'getTheme'], [createIcon, 'createIcon'], [renderModuleIcon, 'renderModuleIcon']]) {
        if (typeof value !== 'function') throw new TypeError(`Onboarding ${label} must be a function`);
    }
    if (!registry || !core || !ui) throw new TypeError('Onboarding requires registry, core, and ui');

    const module = registry.modules[options.moduleId];
    if (!module || typeof module.getOnboarding !== 'function') return undefined;
    const content = module.getOnboarding();
    if (!content) return undefined;

    const modalId = 'gemini-onboarding-modal';
    let dialogHandle = null;
    let modal = documentRef.createElement('section');
    modal.className = 'onboarding-modal';
    core.applyTheme(modal, getTheme());
    let unsubscribe = null;
    let controls = [];

    function disposeControls() {
        for (const control of controls) control.destroy();
        controls = [];
    }

    const close = () => dialogHandle?.close('programmatic');
    function render() {
        disposeControls();
        modal.replaceChildren();
        const language = languageOf(ui);
        const copy = content[language] || content.zh || content.en || {};

        const header = documentRef.createElement('header');
        header.className = 'onboarding-header';
        const title = documentRef.createElement('h3');
        title.append(renderModuleIcon(module, 16), documentRef.createTextNode(` ${module.name}`));
        const closeControl = IconButton({
            document: documentRef,
            label: ui.t('关闭引导', 'Close guide'),
            icon: createIcon('x', 16),
            onPress: close
        });
        closeControl.element.className += ' onboarding-close';
        controls.push(closeControl);
        header.append(title, closeControl.element);
        modal.appendChild(header);

        const body = documentRef.createElement('div');
        body.className = 'onboarding-body';
        for (const sectionCopy of SECTION_COPY) {
            if (!copy[sectionCopy.key]) continue;
            const section = documentRef.createElement('section');
            section.className = 'onboarding-section';
            const heading = documentRef.createElement('h4');
            heading.className = 'onboarding-section-title';
            const icon = createIcon(sectionCopy.icon, 14);
            icon.setAttribute('aria-hidden', 'true');
            heading.append(icon, documentRef.createTextNode(sectionCopy[language]));
            const text = documentRef.createElement('div');
            text.className = 'onboarding-text';
            text.textContent = copy[sectionCopy.key];
            section.append(heading, text);
            body.appendChild(section);
        }
        modal.appendChild(body);

        const footer = documentRef.createElement('footer');
        footer.className = 'onboarding-footer';
        const localeControl = Button({
            document: documentRef,
            label: language === 'zh' ? 'EN' : '中',
            ariaLabel: language === 'zh' ? 'Switch to English' : '切换到中文',
            onPress() {
                ui.setLocale(language === 'zh' ? 'en' : 'zh-CN');
                modal.querySelector('.onboarding-lang-btn')?.focus({ preventScroll: true });
            }
        });
        localeControl.element.className += ' onboarding-lang-btn';
        const globe = createIcon('globe', 12);
        globe.setAttribute('aria-hidden', 'true');
        localeControl.element.prepend?.(globe);
        const startControl = Button({
            document: documentRef,
            label: language === 'zh' ? '开始使用 →' : 'Get Started →',
            variant: 'primary',
            onPress: close
        });
        startControl.element.className += ' onboarding-start-btn';
        controls.push(localeControl, startControl);
        footer.append(localeControl.element, startControl.element);
        modal.appendChild(footer);
        return closeControl.element;
    }

    const firstFocus = render();
    dialogHandle = ui.openDialog({
        id: modalId,
        ariaLabel: ui.t(`${module.name} 引导`, `${module.name} guide`),
        overlayClass: 'onboarding-overlay',
        contentElement: modal,
        initialFocus: firstFocus,
        replaceExisting: true,
        onClose() {
            unsubscribe?.();
            unsubscribe = null;
            disposeControls();
        }
    });
    modal = dialogHandle.element;
    unsubscribe = ui.subscribeLocale(() => render());
    return dialogHandle;
}
