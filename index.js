/**
 * 数据管家 (Data Manager) — SillyTavern 第三方 UI 扩展
 *
 * 在一个面板里批量管理：预设 / 世界书 / 角色卡 / 聊天记录 / 主题美化。
 * 支持：搜索筛选、多选批量删除、重命名、JSON 内容编辑、删除前自动备份 + 一键撤销。
 *
 * 所有写操作都走 SillyTavern 官方后端 API，不直接碰文件系统，因此云端/服务器部署同样可用。
 */

const EXT_NAME = '数据管家';

/** @returns {any} SillyTavern 上下文 */
function ctx() {
    // eslint-disable-next-line no-undef
    return SillyTavern.getContext();
}

function headers() {
    try {
        const c = ctx();
        if (typeof c.getRequestHeaders === 'function') {
            return c.getRequestHeaders();
        }
    } catch { /* 忽略 */ }
    return { 'Content-Type': 'application/json' };
}

async function post(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) {
        throw new Error(`${url} 返回 ${res.status}`);
    }
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch { return text; }
}

function toast(msg, type = 'info') {
    try {
        // eslint-disable-next-line no-undef
        toastr[type](msg, EXT_NAME);
    } catch {
        console.log(`[${EXT_NAME}] ${msg}`);
    }
}

function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/* ------------------------------------------------------------------ *
 *  数据适配层：每种数据一个 adapter
 * ------------------------------------------------------------------ */

/** 预设按 API 分类。key 是后端 apiId。 */
const PRESET_KINDS = [
    { apiId: 'openai', label: '聊天补全预设 (OpenAI/Claude 等)', namesKey: 'openai_setting_names', dataKey: 'openai_settings' },
    { apiId: 'textgenerationwebui', label: '文本补全预设 (TextGen)', namesKey: 'textgenerationwebui_preset_names', dataKey: 'textgenerationwebui_presets' },
    { apiId: 'novel', label: 'NovelAI 预设', namesKey: 'novelai_setting_names', dataKey: 'novelai_settings' },
    { apiId: 'kobold', label: 'KoboldAI 预设', namesKey: 'koboldai_setting_names', dataKey: 'koboldai_settings' },
    { apiId: 'instruct', label: '指令模板 (Instruct)', objectsKey: 'instruct' },
    { apiId: 'context', label: '上下文模板 (Context)', objectsKey: 'context' },
    { apiId: 'sysprompt', label: '系统提示词 (SysPrompt)', objectsKey: 'sysprompt' },
    { apiId: 'reasoning', label: '推理格式 (Reasoning)', objectsKey: 'reasoning' },
];

let settingsCache = null;
async function getSettings(force = false) {
    if (!settingsCache || force) {
        settingsCache = await post('/api/settings/get', {});
    }
    return settingsCache;
}

const adapters = {
    /* ---------------- 预设 ---------------- */
    presets: {
        label: '预设',
        editable: true,
        renamable: true,
        async load() {
            const s = await getSettings(true);
            const items = [];
            for (const kind of PRESET_KINDS) {
                if (kind.objectsKey) {
                    const arr = Array.isArray(s?.[kind.objectsKey]) ? s[kind.objectsKey] : [];
                    for (const obj of arr) {
                        if (!obj?.name) continue;
                        items.push({ id: `${kind.apiId}::${obj.name}`, name: obj.name, group: kind.label, apiId: kind.apiId, inline: obj });
                    }
                } else {
                    const names = Array.isArray(s?.[kind.namesKey]) ? s[kind.namesKey] : [];
                    const datas = Array.isArray(s?.[kind.dataKey]) ? s[kind.dataKey] : [];
                    names.forEach((name, i) => {
                        let parsed = null;
                        try { parsed = JSON.parse(datas[i]); } catch { /* 忽略 */ }
                        items.push({ id: `${kind.apiId}::${name}`, name, group: kind.label, apiId: kind.apiId, inline: parsed });
                    });
                }
            }
            return items;
        },
        async read(item) {
            return item.inline ?? {};
        },
        async write(item, data) {
            await post('/api/presets/save', { name: item.name, apiId: item.apiId, preset: data });
        },
        async remove(item) {
            await post('/api/presets/delete', { name: item.name, apiId: item.apiId });
        },
        async rename(item, newName) {
            const data = await this.read(item);
            await post('/api/presets/save', { name: newName, apiId: item.apiId, preset: data });
            await post('/api/presets/delete', { name: item.name, apiId: item.apiId });
        },
        async restore(backup) {
            await post('/api/presets/save', { name: backup.name, apiId: backup.apiId, preset: backup.data });
        },
        backupOf(item, data) {
            return { name: item.name, apiId: item.apiId, data };
        },
    },

    /* ---------------- 世界书 ---------------- */
    worlds: {
        label: '世界书',
        editable: true,
        renamable: true,
        async load() {
            const list = await post('/api/worldinfo/list', {});
            const arr = Array.isArray(list) ? list : [];
            return arr.map(w => ({
                id: w.file_id,
                name: w.file_id,
                group: '世界书 / 知识书',
                meta: w.name && w.name !== w.file_id ? `内部名: ${w.name}` : '',
            }));
        },
        async read(item) {
            return await post('/api/worldinfo/get', { name: item.name });
        },
        async write(item, data) {
            await post('/api/worldinfo/edit', { name: item.name, data });
        },
        async remove(item) {
            await post('/api/worldinfo/delete', { name: item.name });
        },
        async rename(item, newName) {
            const data = await this.read(item);
            await post('/api/worldinfo/edit', { name: newName, data });
            await post('/api/worldinfo/delete', { name: item.name });
        },
        async restore(backup) {
            await post('/api/worldinfo/edit', { name: backup.name, data: backup.data });
        },
        backupOf(item, data) {
            return { name: item.name, data };
        },
    },

    /* ---------------- 角色卡 ---------------- */
    characters: {
        label: '角色卡',
        editable: false,
        renamable: false,
        // 角色卡是 PNG，无法用 JSON 接口还原，因此删除前把卡直接下载到本地。
        downloadBackup: true,
        async load() {
            const all = await post('/api/characters/all', { shallow: true });
            const arr = Array.isArray(all) ? all : [];
            return arr.map(c => ({
                id: c.avatar,
                name: c.name || c.avatar,
                group: '角色卡',
                avatar: c.avatar,
                meta: c.create_date ? String(c.create_date).split('@')[0] : '',
                thumb: `/thumbnail?type=avatar&file=${encodeURIComponent(c.avatar)}`,
            }));
        },
        async backupToDisk(item) {
            const res = await fetch(`/characters/${encodeURIComponent(item.avatar)}`);
            if (!res.ok) throw new Error('无法读取角色卡文件');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = item.avatar;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        },
        async remove(item, opts = {}) {
            await post('/api/characters/delete', {
                avatar_url: item.avatar,
                delete_chats: !!opts.deleteChats,
            });
        },
    },

    /* ---------------- 聊天记录 ---------------- */
    chats: {
        label: '聊天记录',
        editable: true,
        renamable: true,
        needsCharacter: true,
        async load(state) {
            if (!state.avatar) return [];
            const list = await post('/api/chats/search', { avatar_url: state.avatar });
            const arr = Array.isArray(list) ? list : [];
            return arr.map(c => ({
                id: `${state.avatar}::${c.file_name}`,
                name: c.file_name,
                group: `聊天记录 — ${state.charName}`,
                avatar: state.avatar,
                meta: `${c.message_count ?? '?'} 条 · ${c.file_size ?? ''}`,
            }));
        },
        async read(item) {
            return await post('/api/chats/get', { avatar_url: item.avatar, file_name: item.name });
        },
        async write(item, data) {
            await post('/api/chats/save', { avatar_url: item.avatar, file_name: item.name, chat: data, force: true });
        },
        async remove(item) {
            await post('/api/chats/delete', { avatar_url: item.avatar, chatfile: `${item.name}.jsonl` });
        },
        async rename(item, newName) {
            await post('/api/chats/rename', {
                avatar_url: item.avatar,
                original_file: `${item.name}.jsonl`,
                renamed_file: `${newName}.jsonl`,
            });
        },
        async restore(backup) {
            await post('/api/chats/save', {
                avatar_url: backup.avatar,
                file_name: backup.name,
                chat: backup.data,
                force: true,
            });
        },
        backupOf(item, data) {
            return { name: item.name, avatar: item.avatar, data };
        },
    },

    /* ---------------- 主题 / 美化方案 ---------------- */
    themes: {
        label: '主题美化',
        editable: true,
        renamable: true,
        async load() {
            const s = await getSettings(true);
            const arr = Array.isArray(s?.themes) ? s.themes : [];
            return arr.map(t => ({
                id: t.name,
                name: t.name,
                group: '主题 / 美化方案',
                inline: t,
                meta: t.custom_css ? '含自定义 CSS' : '',
            }));
        },
        async read(item) { return item.inline ?? { name: item.name }; },
        async write(item, data) {
            await post('/api/themes/save', { ...data, name: item.name });
        },
        async remove(item) {
            await post('/api/themes/delete', { name: item.name });
        },
        async rename(item, newName) {
            const data = await this.read(item);
            await post('/api/themes/save', { ...data, name: newName });
            await post('/api/themes/delete', { name: item.name });
        },
        async restore(backup) {
            await post('/api/themes/save', { ...backup.data, name: backup.name });
        },
        backupOf(item, data) {
            return { name: item.name, data };
        },
    },
};

/* ------------------------------------------------------------------ *
 *  状态
 * ------------------------------------------------------------------ */

const state = {
    tab: 'presets',
    items: [],
    filter: '',
    selected: new Set(),
    avatar: '',          // 聊天记录标签用：当前角色
    charName: '',
    characters: [],
    lastBatch: null,     // { tab, entries: [...] } 用于撤销
    autoDownload: true,
};

/* ------------------------------------------------------------------ *
 *  UI
 * ------------------------------------------------------------------ */

function buildModal() {
    if (document.getElementById('stdm_overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'stdm_overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
    <div id="stdm_modal">
        <div id="stdm_header">
            <span class="stdm_title">🗂️ ${EXT_NAME}</span>
            <label class="stdm_flexrow" style="font-size:.82em;opacity:.85;gap:4px;">
                <input type="checkbox" id="stdm_autodl" checked> 删除时下载备份文件
            </label>
            <button class="stdm_btn" id="stdm_undo" disabled>↩ 撤销上次删除</button>
            <button class="stdm_btn" id="stdm_close">✕</button>
        </div>
        <div id="stdm_tabs"></div>
        <div id="stdm_toolbar">
            <select id="stdm_charpick" style="display:none;max-width:220px;"></select>
            <input type="text" id="stdm_search" placeholder="搜索名称…">
            <button class="stdm_btn" id="stdm_selall">全选</button>
            <button class="stdm_btn" id="stdm_selnone">清空</button>
            <button class="stdm_btn" id="stdm_refresh">刷新</button>
            <span class="stdm_spacer"></span>
            <button class="stdm_btn stdm_danger" id="stdm_delete">删除选中 (0)</button>
        </div>
        <div id="stdm_list"></div>
        <div id="stdm_status"></div>
    </div>`;
    document.body.appendChild(overlay);

    const editor = document.createElement('div');
    editor.id = 'stdm_editor_overlay';
    editor.hidden = true;
    editor.innerHTML = `
    <div id="stdm_editor_box">
        <div class="stdm_flexrow">
            <strong id="stdm_editor_title">编辑</strong>
            <span class="stdm_spacer"></span>
            <button class="stdm_btn" id="stdm_editor_save">保存</button>
            <button class="stdm_btn" id="stdm_editor_cancel">取消</button>
        </div>
        <textarea id="stdm_editor_text" spellcheck="false"></textarea>
        <div style="font-size:.78em;opacity:.65;">直接编辑 JSON。保存前会校验格式；格式错误不会写入。</div>
    </div>`;
    document.body.appendChild(editor);

    // 标签
    const tabsEl = overlay.querySelector('#stdm_tabs');
    for (const [key, ad] of Object.entries(adapters)) {
        const b = document.createElement('div');
        b.className = 'stdm_tab';
        b.dataset.tab = key;
        b.textContent = ad.label;
        b.addEventListener('click', () => switchTab(key));
        tabsEl.appendChild(b);
    }

    overlay.querySelector('#stdm_close').addEventListener('click', closeModal);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) closeModal(); });
    overlay.querySelector('#stdm_search').addEventListener('input', (e) => {
        state.filter = e.target.value.trim().toLowerCase();
        renderList();
    });
    overlay.querySelector('#stdm_selall').addEventListener('click', () => {
        visibleItems().forEach(i => state.selected.add(i.id));
        renderList();
    });
    overlay.querySelector('#stdm_selnone').addEventListener('click', () => {
        state.selected.clear();
        renderList();
    });
    overlay.querySelector('#stdm_refresh').addEventListener('click', () => reload());
    overlay.querySelector('#stdm_delete').addEventListener('click', deleteSelected);
    overlay.querySelector('#stdm_undo').addEventListener('click', undoLast);
    overlay.querySelector('#stdm_autodl').addEventListener('change', (e) => {
        state.autoDownload = e.target.checked;
    });
    overlay.querySelector('#stdm_charpick').addEventListener('change', (e) => {
        const opt = e.target.selectedOptions[0];
        state.avatar = e.target.value;
        state.charName = opt ? opt.textContent : '';
        reload();
    });

    editor.querySelector('#stdm_editor_cancel').addEventListener('click', () => { editor.hidden = true; });

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!editor.hidden) { editor.hidden = true; return; }
        if (!overlay.hidden) closeModal();
    });
}

function setStatus(msg) {
    const el = document.getElementById('stdm_status');
    if (el) el.textContent = msg;
}

function visibleItems() {
    if (!state.filter) return state.items;
    return state.items.filter(i =>
        i.name.toLowerCase().includes(state.filter) ||
        (i.group || '').toLowerCase().includes(state.filter));
}

function updateDeleteButton() {
    const btn = document.getElementById('stdm_delete');
    if (!btn) return;
    const n = state.selected.size;
    btn.textContent = `删除选中 (${n})`;
    btn.disabled = n === 0;
}

function renderList() {
    const list = document.getElementById('stdm_list');
    if (!list) return;
    list.innerHTML = '';

    const items = visibleItems();
    if (!items.length) {
        list.innerHTML = '<div style="opacity:.6;padding:20px;text-align:center;">没有条目</div>';
        updateDeleteButton();
        return;
    }

    const ad = adapters[state.tab];
    let currentGroup = null;

    for (const item of items) {
        if (item.group !== currentGroup) {
            currentGroup = item.group;
            const g = document.createElement('div');
            g.className = 'stdm_group';
            g.textContent = currentGroup;
            list.appendChild(g);
        }

        const row = document.createElement('div');
        row.className = 'stdm_row';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = state.selected.has(item.id);
        cb.addEventListener('change', () => {
            if (cb.checked) state.selected.add(item.id); else state.selected.delete(item.id);
            updateDeleteButton();
        });
        row.appendChild(cb);

        if (item.thumb) {
            const img = document.createElement('img');
            img.className = 'stdm_avatar';
            img.src = item.thumb;
            img.loading = 'lazy';
            img.onerror = () => img.remove();
            row.appendChild(img);
        }

        const name = document.createElement('div');
        name.className = 'stdm_name';
        name.textContent = item.name;
        name.title = item.name;
        row.appendChild(name);

        if (item.meta) {
            const meta = document.createElement('div');
            meta.className = 'stdm_meta';
            meta.textContent = item.meta;
            row.appendChild(meta);
        }

        const actions = document.createElement('div');
        actions.className = 'stdm_rowactions';

        if (ad.renamable) {
            const b = document.createElement('button');
            b.className = 'stdm_btn';
            b.textContent = '改名';
            b.addEventListener('click', () => renameItem(item));
            actions.appendChild(b);
        }
        if (ad.editable) {
            const b = document.createElement('button');
            b.className = 'stdm_btn';
            b.textContent = '编辑';
            b.addEventListener('click', () => editItem(item));
            actions.appendChild(b);
        }
        const dl = document.createElement('button');
        dl.className = 'stdm_btn';
        dl.textContent = '导出';
        dl.addEventListener('click', () => exportItem(item));
        actions.appendChild(dl);

        const del = document.createElement('button');
        del.className = 'stdm_btn stdm_danger';
        del.textContent = '删除';
        del.addEventListener('click', () => {
            state.selected.clear();
            state.selected.add(item.id);
            deleteSelected();
        });
        actions.appendChild(del);

        row.appendChild(actions);
        list.appendChild(row);
    }

    updateDeleteButton();
}

async function populateCharacterPicker() {
    const pick = document.getElementById('stdm_charpick');
    if (!pick) return;
    const all = await post('/api/characters/all', { shallow: true });
    state.characters = Array.isArray(all) ? all : [];
    pick.innerHTML = '';
    for (const c of state.characters) {
        const o = document.createElement('option');
        o.value = c.avatar;
        o.textContent = c.name || c.avatar;
        pick.appendChild(o);
    }
    if (!state.avatar && state.characters.length) {
        state.avatar = state.characters[0].avatar;
        state.charName = state.characters[0].name || state.avatar;
    }
    pick.value = state.avatar;
}

async function switchTab(key) {
    state.tab = key;
    state.selected.clear();
    document.querySelectorAll('.stdm_tab').forEach(t => {
        t.classList.toggle('stdm_active', t.dataset.tab === key);
    });
    const pick = document.getElementById('stdm_charpick');
    const needsChar = !!adapters[key].needsCharacter;
    pick.style.display = needsChar ? '' : 'none';
    if (needsChar) {
        setStatus('正在读取角色列表…');
        await populateCharacterPicker();
    }
    await reload();
}

async function reload() {
    const ad = adapters[state.tab];
    setStatus('加载中…');
    try {
        state.items = await ad.load(state);
        state.selected.clear();
        renderList();
        setStatus(`共 ${state.items.length} 条`);
    } catch (err) {
        console.error(err);
        setStatus(`加载失败：${err.message}`);
        toast(`加载失败：${err.message}`, 'error');
    }
}

/* ---------------- 操作 ---------------- */

async function exportItem(item) {
    const ad = adapters[state.tab];
    try {
        if (ad.downloadBackup) {
            await ad.backupToDisk(item);
        } else {
            const data = await ad.read(item);
            download(`${item.name}.json`, JSON.stringify(data, null, 2));
        }
        toast(`已导出 ${item.name}`, 'success');
    } catch (err) {
        toast(`导出失败：${err.message}`, 'error');
    }
}

async function renameItem(item) {
    const ad = adapters[state.tab];
    const newName = prompt(`把「${item.name}」改名为：`, item.name);
    if (!newName || newName === item.name) return;
    if (/[\\/:*?"<>|]/.test(newName)) {
        toast('名称不能包含 \\ / : * ? " < > | 这些字符', 'warning');
        return;
    }
    try {
        setStatus('改名中…');
        await ad.rename(item, newName);
        toast(`已改名为 ${newName}`, 'success');
        await reload();
    } catch (err) {
        toast(`改名失败：${err.message}`, 'error');
        setStatus(`改名失败：${err.message}`);
    }
}

async function editItem(item) {
    const ad = adapters[state.tab];
    const box = document.getElementById('stdm_editor_overlay');
    const text = document.getElementById('stdm_editor_text');
    const title = document.getElementById('stdm_editor_title');
    const saveBtn = document.getElementById('stdm_editor_save');

    try {
        const data = await ad.read(item);
        title.textContent = `编辑：${item.name}`;
        text.value = JSON.stringify(data, null, 2);
        box.hidden = false;

        const onSave = async () => {
            let parsed;
            try {
                parsed = JSON.parse(text.value);
            } catch (e) {
                toast(`JSON 格式错误：${e.message}`, 'error');
                return;
            }
            try {
                await ad.write(item, parsed);
                toast('已保存', 'success');
                box.hidden = true;
                saveBtn.removeEventListener('click', onSave);
                await reload();
            } catch (err) {
                toast(`保存失败：${err.message}`, 'error');
            }
        };
        // 先清掉旧监听，避免重复绑定
        const fresh = saveBtn.cloneNode(true);
        saveBtn.replaceWith(fresh);
        fresh.addEventListener('click', onSave);
    } catch (err) {
        toast(`读取失败：${err.message}`, 'error');
    }
}

async function deleteSelected() {
    const ad = adapters[state.tab];
    const targets = state.items.filter(i => state.selected.has(i.id));
    if (!targets.length) return;

    const names = targets.slice(0, 8).map(t => `· ${t.name}`).join('\n');
    const more = targets.length > 8 ? `\n…以及另外 ${targets.length - 8} 项` : '';
    let deleteChats = false;

    if (state.tab === 'characters') {
        if (!confirm(`确定删除 ${targets.length} 个角色卡？\n\n${names}${more}\n\n删除前会把卡片下载到本地作为备份。`)) return;
        deleteChats = confirm('同时删除这些角色的聊天记录吗？\n\n确定 = 一并删除；取消 = 保留聊天记录。');
    } else {
        if (!confirm(`确定删除 ${targets.length} 项？\n\n${names}${more}\n\n删除前会自动备份，可用「撤销上次删除」还原。`)) return;
    }

    const entries = [];
    let ok = 0, fail = 0;

    for (let n = 0; n < targets.length; n++) {
        const item = targets[n];
        setStatus(`正在处理 ${n + 1}/${targets.length}：${item.name}`);
        try {
            if (ad.downloadBackup) {
                try { await ad.backupToDisk(item); } catch (e) { console.warn('备份失败', item.name, e); }
            } else {
                const data = await ad.read(item);
                entries.push(ad.backupOf(item, data));
            }
            await ad.remove(item, { deleteChats });
            ok++;
        } catch (err) {
            console.error(err);
            fail++;
            toast(`删除「${item.name}」失败：${err.message}`, 'error');
        }
    }

    if (entries.length) {
        state.lastBatch = { tab: state.tab, entries };
        const undo = document.getElementById('stdm_undo');
        undo.disabled = false;
        undo.textContent = `↩ 撤销上次删除 (${entries.length})`;
        if (state.autoDownload) {
            download(`备份_${adapters[state.tab].label}_${stamp()}.json`,
                JSON.stringify({ tab: state.tab, time: new Date().toISOString(), entries }, null, 2));
        }
    }

    setStatus(`完成：成功 ${ok} 项${fail ? `，失败 ${fail} 项` : ''}`);
    toast(`删除完成：成功 ${ok} 项${fail ? `，失败 ${fail} 项` : ''}`, fail ? 'warning' : 'success');
    await reload();
}

async function undoLast() {
    if (!state.lastBatch) return;
    const { tab, entries } = state.lastBatch;
    const ad = adapters[tab];
    if (typeof ad.restore !== 'function') {
        toast('该类型不支持自动还原，请手动导入备份文件', 'warning');
        return;
    }
    if (!confirm(`还原 ${entries.length} 项到「${ad.label}」？`)) return;

    let ok = 0, fail = 0;
    for (const entry of entries) {
        try { await ad.restore(entry); ok++; } catch (e) { console.error(e); fail++; }
    }
    state.lastBatch = null;
    const undo = document.getElementById('stdm_undo');
    undo.disabled = true;
    undo.textContent = '↩ 撤销上次删除';
    toast(`还原完成：成功 ${ok} 项${fail ? `，失败 ${fail} 项` : ''}`, fail ? 'warning' : 'success');
    if (state.tab === tab) await reload();
}

/* ------------------------------------------------------------------ *
 *  开关
 * ------------------------------------------------------------------ */

async function openModal() {
    buildModal();
    document.getElementById('stdm_overlay').hidden = false;
    await switchTab(state.tab);
}

function closeModal() {
    const el = document.getElementById('stdm_overlay');
    if (el) el.hidden = true;
}

/* ------------------------------------------------------------------ *
 *  挂载入口
 * ------------------------------------------------------------------ */

function mount() {
    // 1) 魔棒菜单入口
    const menu = document.getElementById('extensionsMenu');
    if (menu && !document.getElementById('stdm_menu_entry')) {
        const entry = document.createElement('div');
        entry.id = 'stdm_menu_entry';
        entry.className = 'list-group-item flex-container flexGap5 interactable';
        entry.tabIndex = 0;
        entry.innerHTML = '<div class="fa-solid fa-folder-tree extensionsMenuExtensionButton"></div><span>数据管家</span>';
        entry.addEventListener('click', openModal);
        menu.appendChild(entry);
    }

    // 2) 扩展设置面板入口
    const settings = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
    if (settings && !document.getElementById('stdm_settings_block')) {
        const block = document.createElement('div');
        block.id = 'stdm_settings_block';
        block.className = 'inline-drawer';
        block.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>🗂️ 数据管家</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <p style="font-size:.85em;opacity:.8;">批量管理预设、世界书、角色卡、聊天记录和主题美化方案。删除前自动备份，可一键撤销。</p>
            <div class="menu_button menu_button_icon" id="stdm_open_btn">
                <i class="fa-solid fa-folder-tree"></i><span>打开数据管家</span>
            </div>
        </div>`;
        settings.appendChild(block);
        block.querySelector('#stdm_open_btn').addEventListener('click', openModal);
    }
}

/* 斜杠命令：/datamanager */
function registerSlashCommand() {
    try {
        const c = ctx();
        const SlashCommand = c.SlashCommand;
        const parser = c.SlashCommandParser;
        if (!SlashCommand || !parser) return;
        parser.addCommandObject(SlashCommand.fromProps({
            name: 'datamanager',
            aliases: ['dm', '数据管家'],
            helpString: '打开数据管家面板',
            callback: () => { openModal(); return ''; },
        }));
    } catch (e) {
        console.debug('[数据管家] 斜杠命令注册跳过', e);
    }
}

(function init() {
    const start = () => {
        mount();
        registerSlashCommand();
        // 菜单可能延迟渲染，补挂一次
        setTimeout(mount, 3000);
        console.log('[数据管家] 已加载');
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
