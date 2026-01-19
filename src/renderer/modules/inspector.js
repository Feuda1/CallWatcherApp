
class InspectorModule {
    constructor() {
        this.isActive = false;
        this.overlay = null;
        this.tooltip = null;
        this.toast = null;
        this.hoveredElement = null;

        this.handleMouseOver = this.handleMouseOver.bind(this);
        this.handleClick = this.handleClick.bind(this);
    }

    init() {
        this.createUI();
        this.setupHotkeys();
        }

    createUI() {

        this.overlay = document.createElement('div');
        this.overlay.id = 'inspector-overlay';
        this.overlay.style.display = 'none';
        document.body.appendChild(this.overlay);


        this.tooltip = document.createElement('div');
        this.tooltip.id = 'inspector-tooltip';
        this.tooltip.style.display = 'none';
        document.body.appendChild(this.tooltip);


        this.toast = document.createElement('div');
        this.toast.id = 'inspector-toast';
        this.toast.style.display = 'none';
        document.body.appendChild(this.toast);
    }

    setupHotkeys() {
        document.addEventListener('keydown', async (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы')) {
                e.preventDefault();
                this.toggle();
            }

            if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В')) {
                e.preventDefault();
                if (window.debugReporter) {
                    const success = await window.debugReporter.copyReport();
                    this.showToast(success ? '✅ Debug Report Copied!' : '❌ Copy Failed', 2500);
                }
            }

            if (this.isActive && e.key === 'Escape') {
                this.disable();
            }
        });
    }

    toggle() {
        if (this.isActive) {
            this.disable();
        } else {
            this.enable();
        }
    }

    enable() {
        this.isActive = true;
        document.body.classList.add('inspector-active');
        document.addEventListener('mouseover', this.handleMouseOver, true);
        document.addEventListener('click', this.handleClick, true);
        this.showToast('Inspector Mode ON', 2000);
    }

    disable() {
        this.isActive = false;
        document.body.classList.remove('inspector-active');
        document.removeEventListener('mouseover', this.handleMouseOver, true);
        document.removeEventListener('click', this.handleClick, true);
        this.hideOverlay();
        this.showToast('Inspector Mode OFF', 2000);
    }

    handleMouseOver(e) {
        if (!this.isActive) return;
        e.stopPropagation();

        const target = e.target;
        if (target === this.overlay || target === this.tooltip || target === this.toast) return;

        this.hoveredElement = target;
        this.highlightElement(target);
    }

    handleClick(e) {
        if (!this.isActive) return;
        e.preventDefault();
        e.stopPropagation();

        if (this.hoveredElement) {
            this.captureAndCopy(this.hoveredElement);
            this.disable();
        }
    }

    highlightElement(el) {
        const rect = el.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        this.overlay.style.width = `${rect.width}px`;
        this.overlay.style.height = `${rect.height}px`;
        this.overlay.style.top = `${rect.top + scrollTop}px`;
        this.overlay.style.left = `${rect.left + scrollLeft}px`;
        this.overlay.style.display = 'block';


        const tagName = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const classes = Array.from(el.classList).join('.');
        const classStr = classes ? `.${classes}` : '';
        const dimensions = `${Math.round(rect.width)}x${Math.round(rect.height)}`;

        this.tooltip.innerHTML = `<span class="tag">${tagName}</span>${id}<br/><span class="class">${classStr}</span><br/><span class="dim">${dimensions}</span>`;


        let tipTop = rect.top + scrollTop - this.tooltip.offsetHeight - 5;
        let tipLeft = rect.left + scrollLeft;

        if (tipTop < 0) tipTop = rect.bottom + scrollTop + 5;
        if (tipLeft + this.tooltip.offsetWidth > window.innerWidth) tipLeft = window.innerWidth - this.tooltip.offsetWidth - 5;

        this.tooltip.style.top = `${tipTop}px`;
        this.tooltip.style.left = `${tipLeft}px`;
        this.tooltip.style.display = 'block';
    }

    hideOverlay() {
        this.overlay.style.display = 'none';
        this.tooltip.style.display = 'none';
        this.hoveredElement = null;
    }

    showToast(msg, duration = 3000) {
        this.toast.textContent = msg;
        this.toast.style.display = 'block';
        setTimeout(() => {
            this.toast.style.display = 'none';
        }, duration);
    }

    captureAndCopy(el) {
        const details = this.getElementDetails(el);
        const markdown = this.formatAsMarkdown(details);

        navigator.clipboard.writeText(markdown).then(() => {
            this.showToast('✅ Copied Markdown!');
        }).catch(err => {
            console.error('Failed to copy', err);
            this.showToast('❌ Copy Failed');
        });
    }

    getElementDetails(element) {
        const computed = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();


        const attrs = {};
        if (element.hasAttributes()) {
            for (const attr of element.attributes) {
                attrs[attr.name] = attr.value;
            }
        }


        const formState = {};
        if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName)) {
            formState.value = element.value;
            formState.checked = element.checked;
            formState.disabled = element.disabled;
            formState.readonly = element.readOnly;
            formState.type = element.type;
            formState.name = element.name;
        }

        return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            className: element.className || null,
            classList: Array.from(element.classList),
            innerText: element.innerText || element.textContent || '',
            outerHTML: element.outerHTML,
            attributes: attrs,
            form: Object.keys(formState).length ? formState : null,
            hierarchy: this.getParentHierarchy(element),
            rect: {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                top: Math.round(rect.top),
                left: Math.round(rect.left)
            },
            styles: {
                display: computed.display,
                position: computed.position,
                zIndex: computed.zIndex,
                boxSizing: computed.boxSizing,
                width: computed.width,
                height: computed.height,
                padding: computed.padding,
                margin: computed.margin,
                background: computed.background,
                backgroundColor: computed.backgroundColor,
                color: computed.color,
                font: computed.font,
                fontFamily: computed.fontFamily,
                fontSize: computed.fontSize,
                lineHeight: computed.lineHeight,
                border: computed.border,
                borderRadius: computed.borderRadius,
                flexDirection: computed.flexDirection,
                justifyContent: computed.justifyContent,
                alignItems: computed.alignItems,
                gridTemplateColumns: computed.gridTemplateColumns,
                gap: computed.gap
            }
        };
    }

    getParentHierarchy(el) {
        const parents = [];
        let curr = el.parentElement;
        while (curr && curr.tagName !== 'BODY' && curr.tagName !== 'HTML' && parents.length < 6) {
            let selector = curr.tagName.toLowerCase();
            if (curr.id) selector += `#${curr.id}`;
            if (curr.classList && curr.classList.length > 0) {
                selector += `.${Array.from(curr.classList).slice(0, 3).join('.')}`;
            }
            parents.push(selector);
            curr = curr.parentElement;
        }
        return parents.reverse().join(' > ');
    }

    formatAsMarkdown(data) {
        return `
# UI Element DEBUG
- **Tag**: \`${data.tagName}\`
- **Selector**: \`${data.tagName}${data.id ? '#' + data.id : ''}${data.classList.length ? '.' + data.classList.join('.') : ''}\`
- **Text Content**:
> ${data.innerText.replace(/\n/g, ' ')}
- **Hierarchy**: \`${data.hierarchy} > ${data.tagName}\`
- **Dimensions**: ${data.rect.width}x${data.rect.height}
- **Form State**: \`${data.form ? JSON.stringify(data.form) : 'N/A'}\`
- **Attributes**:
\`\`\`json
${JSON.stringify(data.attributes, null, 2)}
\`\`\`

## Styles
\`\`\`json
${JSON.stringify(data.styles, null, 2)}
\`\`\`

## HTML Snapshot
\`\`\`html
${data.outerHTML}
\`\`\`
`.trim();
    }
}


window.inspectorModule = new InspectorModule();
