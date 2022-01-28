/* global sauce */

sauce.ns('ui', ns => {
    'use strict';

    ns.throttledAnimationFrame = function() {
        let nextFrame;
        return function(callback) {
            if (nextFrame) {
                cancelAnimationFrame(nextFrame);
            }
            nextFrame = requestAnimationFrame(() => {
                nextFrame = null;
                callback();
            });
        };
    };

 
    ns.downloadBlob = function(blob, name) {
        const url = URL.createObjectURL(blob);
        try {
            ns.downloadURL(url, name || blob.name);
        } finally {
            URL.revokeObjectURL(url);
        }
    };


    ns.downloadURL = function(url, name) {
        const link = document.createElement('a');
        link.href = url;
        link.download = name;
        link.style.display = 'none';
        document.body.appendChild(link);
        try {
            link.click();
        } finally {
            link.remove();
        }
    };


    const _textCache = new Map();
    const _textFetching = new Map();
    ns.getImage = async function(path) {
        if (!_textCache.has(path)) {
            try {
                if (!_textFetching.has(path)) {
                    _textFetching.set(path, (async () => {
                        const resp = await fetch(`${sauce.extUrl}images/${path.replace(/^\/+/, '')}`);
                        _textCache.set(path, resp.ok ? await resp.text() : undefined);
                        _textFetching.delete(path);
                    })());
                }
                await _textFetching.get(path);
            } catch(e) {
                console.warn("Failed to fetch image:", path, e);
                _textCache.set(path, '');
            }
        }
        return _textCache.get(path);
    };


    let _dialogClose = 'x';
    ns.getImage('fa/times-light.svg').then(x => _dialogClose = x);
    ns.dialog = function(options={}) {
        const $dialog = options.el || self.jQuery(`<div>${options.body || ''}</div>`);
        const dialogClass = `sauce-dialog ${options.dialogClass || ''}`;
        if (options.flex) {
            $dialog.addClass('flex');
        }
        // Assign default button(s) (will be clobbered if options.buttons is defined)
        const defaultClass = 'btn';
        const buttons = [{
            html: _dialogClose,
            click: () => $dialog.dialog('close'),
            class: 'btn btn-icon-only',
        }];
        if (Array.isArray(options.extraButtons)) {
            for (const x of options.extraButtons) {
                if (!x.class) {
                    x.class = defaultClass;
                }
                buttons.push(x);
            }
        } else if (options.extraButtons && typeof options.extraButtons === 'object') {
            for (const [text, click] of Object.entries(options.extraButtons)) {
                buttons.push({text, click, class: defaultClass});
            }
        }
        $dialog.dialog(Object.assign({buttons}, options, {dialogClass}));
        $dialog.on('click', 'a.help-info', ev => {
            const helpFor = ev.currentTarget.dataset.help;
            ev.currentTarget.classList.add('hidden');
            $dialog.find(`.help[data-for="${helpFor}"]`).toggleClass('visible');
        });
        $dialog.on('click', '.help a.sauce-dismiss', ev => {
            const help = ev.currentTarget.closest('.help');
            help.classList.remove('visible');
            $dialog.find(`a.help-info[data-help="${help.dataset.for}"]`).removeClass('hidden');
        });
        if (options.autoDestroy) {
            $dialog.on('dialogclose', ev => void $dialog.dialog('destroy'));
        }
        if (options.closeOnMobileBack) {
            const dialogId = Math.random();
            history.pushState({dialogId}, null);
            const onPop = ev => $dialog.dialog('close');
            window.addEventListener('popstate', onPop);
            $dialog.on('dialogclose', ev => {
                window.removeEventListener('popstate', onPop);
                if (history.state.dialogId === dialogId) {
                    history.go(-1);
                }
            });
        }
        return $dialog;
    };


    ns.modal = function(options={}) {
        return ns.dialog({
            modal: true,
            ...options,
        });
    };
});
