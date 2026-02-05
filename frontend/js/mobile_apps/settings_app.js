/**
 * 系统设置 App 模块 (分页式设计)
 * 将设置功能分组到不同页面，提升移动端体验
 */

// 页面配置
const PAGES = [
    { id: 'basic', icon: '⚙️', name: '基础' },
    { id: 'network', icon: '🌐', name: '连接' },
    { id: 'appearance', icon: '🎨', name: '外观' },
    { id: 'binding', icon: '🔗', name: '绑定' }
];

// 当前页面状态
let currentPage = 'basic';

/**
 * 渲染设置 App
 * @param {jQuery} container - App 容器
 * @param {Function} createNavbar - 创建导航栏函数
 */
export async function render(container, createNavbar) {
    container.html(`
        <div style="display:flex; flex-direction:column; height:100%; align-items:center; justify-content:center; color:#888;">
            <div style="font-size:24px; margin-bottom:10px;">⚙️</div>
            <div>正在同步配置...</div>
        </div>
    `);

    // 刷新数据
    try {
        if (window.refreshTTS) await window.refreshTTS();
        else if (window.TTS_UI && window.TTS_UI.CTX && window.TTS_UI.CTX.Callbacks.refreshData) {
            await window.TTS_UI.CTX.Callbacks.refreshData();
        }
    } catch (e) { console.error("刷新数据失败", e); }

    // 检查依赖
    if (!window.TTS_UI || !window.TTS_UI.CTX) {
        container.html('<div style="padding:20px; text-align:center;">⚠️ 核心UI模块未就绪</div>');
        return;
    }

    const CTX = window.TTS_UI.CTX;

    if (!CTX.CACHE) {
        container.html('<div style="padding:20px; text-align:center;">⚠️ 数据缓存未初始化</div>');
        return;
    }

    // 构建主容器
    container.empty();
    container.append(createNavbar("系统设置"));

    // 添加分页内容区域
    const $pageContainer = $('<div class="settings-page-container"></div>');
    container.append($pageContainer);

    // 添加底部分页导航
    const $tabBar = createTabBar();
    container.append($tabBar);

    // 渲染默认页面
    renderPage($pageContainer, currentPage, CTX);

    // 绑定分页切换事件
    $tabBar.find('.settings-tab-item').click(function () {
        const pageId = $(this).data('page');
        if (pageId === currentPage) return;

        currentPage = pageId;
        $tabBar.find('.settings-tab-item').removeClass('active');
        $(this).addClass('active');
        renderPage($pageContainer, pageId, CTX);
    });
}

/**
 * 创建底部分页导航栏
 */
function createTabBar() {
    const tabsHtml = PAGES.map(page => `
        <div class="settings-tab-item ${page.id === currentPage ? 'active' : ''}" data-page="${page.id}">
            <span class="settings-tab-icon">${page.icon}</span>
            <span class="settings-tab-name">${page.name}</span>
        </div>
    `).join('');

    return $(`
        <div class="settings-tab-bar">
            ${tabsHtml}
        </div>
    `);
}

/**
 * 渲染指定页面内容
 */
function renderPage($container, pageId, CTX) {
    $container.empty();

    const settings = CTX.CACHE.settings || {};
    let config = { useRemote: false, ip: "" };
    try {
        const saved = localStorage.getItem('tts_plugin_remote_config');
        if (saved) config = JSON.parse(saved);
    } catch (e) { }

    switch (pageId) {
        case 'basic':
            renderBasicPage($container, settings);
            break;
        case 'network':
            renderNetworkPage($container, config);
            break;
        case 'appearance':
            renderAppearancePage($container, settings);
            break;
        case 'binding':
            renderBindingPage($container, settings, CTX);
            break;
    }
}

/**
 * 基础设置页面
 */
function renderBasicPage($container, settings) {
    const isEnabled = settings.enabled !== false;

    const html = `
        <div class="settings-page">
            <div class="settings-section">
                <div class="settings-section-title">系统控制</div>
                
                <div class="settings-item">
                    <div class="settings-item-content">
                        <div class="settings-item-title">启用 TTS 插件</div>
                        <div class="settings-item-desc">开启后自动为对话生成语音</div>
                    </div>
                    <label class="settings-switch">
                        <input type="checkbox" id="tts-master-switch" ${isEnabled ? 'checked' : ''}>
                        <span class="settings-switch-slider"></span>
                    </label>
                </div>

                <div class="settings-item">
                    <div class="settings-item-content">
                        <div class="settings-item-title">预加载模型</div>
                        <div class="settings-item-desc">自动生成语音，建议开启</div>
                    </div>
                    <label class="settings-switch">
                        <input type="checkbox" id="tts-toggle-auto" ${settings.auto_generate ? 'checked' : ''}>
                        <span class="settings-switch-slider"></span>
                    </label>
                </div>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">语言配置</div>
                
                <div class="settings-item settings-item-select">
                    <div class="settings-item-content">
                        <div class="settings-item-title">参考音频语言</div>
                        <div class="settings-item-desc">对应 reference_audios 子文件夹</div>
                    </div>
                    <select id="tts-lang-select" class="settings-select">
                        <option value="default" ${settings.default_lang === 'default' ? 'selected' : ''}>Default</option>
                        <option value="Chinese" ${settings.default_lang === 'Chinese' ? 'selected' : ''}>中文</option>
                        <option value="Japanese" ${settings.default_lang === 'Japanese' ? 'selected' : ''}>日语</option>
                        <option value="English" ${settings.default_lang === 'English' ? 'selected' : ''}>英语</option>
                    </select>
                </div>
            </div>

            <div class="settings-section">
                <button id="tts-btn-save-paths" class="settings-btn-primary">
                    💾 保存配置
                </button>
            </div>
        </div>
    `;

    $container.html(html);
    bindBasicEvents();
}

/**
 * 网络连接页面
 */
function renderNetworkPage($container, config) {
    const html = `
        <div class="settings-page">
            <div class="settings-section">
                <div class="settings-section-title">连接模式</div>
                
                <div class="settings-item">
                    <div class="settings-item-content">
                        <div class="settings-item-title">远程模式</div>
                        <div class="settings-item-desc">局域网部署时使用</div>
                    </div>
                    <label class="settings-switch">
                        <input type="checkbox" id="tts-remote-switch" ${config.useRemote ? 'checked' : ''}>
                        <span class="settings-switch-slider"></span>
                    </label>
                </div>
            </div>

            <div class="settings-section" id="tts-remote-input-area" style="display:${config.useRemote ? 'block' : 'none'};">
                <div class="settings-section-title">远程服务器</div>
                
                <div class="settings-input-group">
                    <label class="settings-input-label">电脑 IP 地址</label>
                    <input type="text" id="tts-remote-ip" class="settings-input" 
                           value="${config.ip}" placeholder="192.168.x.x">
                </div>

                <button id="tts-save-remote" class="settings-btn-primary" style="margin-top:15px;">
                    🔗 保存并连接
                </button>
            </div>

            <div class="settings-section settings-info-box">
                <div class="settings-info-icon">💡</div>
                <div class="settings-info-text">
                    远程模式用于将 TTS 服务部署在另一台电脑上。
                    请确保两台设备在同一局域网内。
                </div>
            </div>
        </div>
    `;

    $container.html(html);
    bindNetworkEvents();
}

/**
 * 外观设置页面
 */
function renderAppearancePage($container, settings) {
    const styles = [
        { value: 'default', name: '🌿 森野·极简' },
        { value: 'cyberpunk', name: '⚡ 赛博·霓虹' },
        { value: 'ink', name: '✒️ 水墨·烟雨' },
        { value: 'kawaii', name: '💎 幻彩·琉璃' },
        { value: 'bloom', name: '🌸 花信·初绽' },
        { value: 'rouge', name: '💋 魅影·微醺' },
        { value: 'holo', name: '🛸 星舰·光环' },
        { value: 'scroll', name: '📜 羊皮·史诗' },
        { value: 'steampunk', name: '⚙️ 蒸汽·机械' },
        { value: 'tactical', name: '🎯 战术·指令' },
        { value: 'obsidian', name: '🌑 黑曜石·极夜' },
        { value: 'classic', name: '📼 旧日·回溯' }
    ];

    const currentStyle = settings.bubble_style || 'default';

    const styleGridHtml = styles.map(style => `
        <div class="settings-style-item ${style.value === currentStyle ? 'active' : ''}" 
             data-value="${style.value}">
            <span class="settings-style-name">${style.name}</span>
        </div>
    `).join('');

    const html = `
        <div class="settings-page">
            <div class="settings-section">
                <div class="settings-section-title">显示模式</div>
                
                <div class="settings-item">
                    <div class="settings-item-content">
                        <div class="settings-item-title">美化卡模式</div>
                        <div class="settings-item-desc">非前端美化卡请勿开启</div>
                    </div>
                    <label class="settings-switch">
                        <input type="checkbox" id="tts-iframe-switch" ${settings.iframe_mode ? 'checked' : ''}>
                        <span class="settings-switch-slider"></span>
                    </label>
                </div>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">气泡风格</div>
                <div class="settings-style-grid">
                    ${styleGridHtml}
                </div>
            </div>
        </div>
    `;

    $container.html(html);
    bindAppearanceEvents();
}

/**
 * 角色绑定页面
 */
function renderBindingPage($container, settings, CTX) {
    const mappings = CTX.CACHE.mappings || {};
    const models = CTX.CACHE.models || {};

    const modelOptions = Object.keys(models).map(k =>
        `<option value="${k}">${k}</option>`
    ).join('');

    const bindingListHtml = Object.keys(mappings).length === 0
        ? '<div class="settings-empty">暂无绑定记录</div>'
        : Object.keys(mappings).map(k => `
            <div class="settings-binding-item">
                <div class="settings-binding-info">
                    <div class="settings-binding-char">${k}</div>
                    <div class="settings-binding-model">${mappings[k]}</div>
                </div>
                <button class="settings-btn-danger settings-unbind-btn" data-char="${k}">解绑</button>
            </div>
        `).join('');

    const html = `
        <div class="settings-page">
            <div class="settings-section">
                <div class="settings-section-title">新增绑定</div>
                
                <div class="settings-input-group">
                    <label class="settings-input-label">角色名称</label>
                    <input type="text" id="tts-new-char" class="settings-input" placeholder="输入角色名">
                </div>

                <div class="settings-input-group">
                    <label class="settings-input-label">选择模型</label>
                    <select id="tts-new-model" class="settings-select">
                        <option value="">选择模型...</option>
                        ${modelOptions}
                    </select>
                </div>

                <button id="tts-btn-bind-new" class="settings-btn-primary" style="margin-top:15px;">
                    ➕ 添加绑定
                </button>
            </div>

            <div class="settings-section">
                <div class="settings-section-title">已绑定角色</div>
                <div class="settings-binding-list" id="tts-mapping-list">
                    ${bindingListHtml}
                </div>
            </div>
        </div>
    `;

    $container.html(html);
    bindBindingEvents(CTX);
}

// ===================== 事件绑定函数 =====================

function bindBasicEvents() {
    const CTX = window.TTS_UI.CTX;

    $('#tts-master-switch').off('change').on('change', function () {
        CTX.Callbacks.toggleMasterSwitch($(this).is(':checked'));
    });

    $('#tts-toggle-auto').off('change').on('change', function () {
        CTX.Callbacks.toggleAutoGenerate($(this).is(':checked'));
    });

    $('#tts-lang-select').off('change').on('change', async function () {
        const lang = $(this).val();
        CTX.CACHE.settings.default_lang = lang;
        await window.TTS_API.updateSettings({ default_lang: lang });
    });

    $('#tts-btn-save-paths').off('click').on('click', async function () {
        const btn = $(this);
        const oldText = btn.text();
        btn.text('保存中...').prop('disabled', true);

        const success = await CTX.Callbacks.saveSettings('', '');
        if (success) {
            showToast('✅ 配置已保存');
        } else {
            showToast('❌ 保存失败');
        }
        btn.text(oldText).prop('disabled', false);
    });
}

function bindNetworkEvents() {
    $('#tts-remote-switch').off('change').on('change', function () {
        const checked = $(this).is(':checked');
        if (checked) {
            $('#tts-remote-input-area').slideDown();
        } else {
            $('#tts-remote-input-area').slideUp();
            const ip = $('#tts-remote-ip').val().trim();
            localStorage.setItem('tts_plugin_remote_config', JSON.stringify({ useRemote: false, ip: ip }));
            showToast('已切换到本地模式，即将刷新...');
            setTimeout(() => location.reload(), 1000);
        }
    });

    $('#tts-save-remote').off('click').on('click', function () {
        const ip = $('#tts-remote-ip').val().trim();
        if (!ip) {
            showToast('请输入 IP 地址');
            return;
        }
        localStorage.setItem('tts_plugin_remote_config', JSON.stringify({ useRemote: true, ip: ip }));
        showToast('设置已保存，即将刷新...');
        setTimeout(() => location.reload(), 1000);
    });
}

function bindAppearanceEvents() {
    const CTX = window.TTS_UI.CTX;

    $('#tts-iframe-switch').off('change').on('change', async function () {
        const isChecked = $(this).is(':checked');
        try {
            await window.TTS_API.updateSettings({ iframe_mode: isChecked });
            CTX.CACHE.settings.iframe_mode = isChecked;
            localStorage.setItem('tts_plugin_iframe_mode', isChecked);
            showToast(`${isChecked ? '开启' : '关闭'}美化卡模式，即将刷新...`);
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            console.error("保存失败", e);
            showToast('保存失败');
            $(this).prop('checked', !isChecked);
        }
    });

    $('.settings-style-item').off('click').on('click', async function () {
        const val = $(this).data('value');

        // 更新UI
        $('.settings-style-item').removeClass('active');
        $(this).addClass('active');

        // 立即应用
        document.body.setAttribute('data-bubble-style', val);
        localStorage.setItem('tts_bubble_style', val);

        try {
            if (CTX.CACHE && CTX.CACHE.settings) {
                CTX.CACHE.settings.bubble_style = val;
            }
            if (window.TTS_API && window.TTS_API.updateSettings) {
                await window.TTS_API.updateSettings({ bubble_style: val });
            }
            showToast('✅ 风格已切换');
        } catch (err) {
            console.error("样式保存失败", err);
        }
    });
}

function bindBindingEvents(CTX) {
    $('#tts-btn-bind-new').off('click').on('click', async function () {
        const charName = $('#tts-new-char').val().trim();
        const modelName = $('#tts-new-model').val();

        if (!charName || !modelName) {
            showToast('请填写角色名并选择模型');
            return;
        }

        try {
            await window.TTS_API.bindCharacter(charName, modelName);
            await CTX.Callbacks.refreshData();
            $('#tts-new-char').val('');
            showToast('✅ 绑定成功');

            // 刷新绑定列表
            const $container = $('.settings-page-container');
            renderBindingPage($container, CTX.CACHE.settings, CTX);
        } catch (e) {
            console.error(e);
            showToast('绑定失败');
        }
    });

    $('.settings-unbind-btn').off('click').on('click', async function () {
        const charName = $(this).data('char');
        if (!confirm(`确定要解绑角色 "${charName}" 吗？`)) return;

        try {
            await window.TTS_API.unbindCharacter(charName);
            await CTX.Callbacks.refreshData();
            showToast('✅ 已解绑');

            // 刷新绑定列表
            const $container = $('.settings-page-container');
            renderBindingPage($container, CTX.CACHE.settings, CTX);
        } catch (e) {
            console.error(e);
            showToast('解绑失败');
        }
    });
}

/**
 * 显示简单的 Toast 提示
 */
function showToast(message) {
    // 移除已有的 toast
    $('.settings-toast').remove();

    const $toast = $(`<div class="settings-toast">${message}</div>`);
    $('body').append($toast);

    // 动画显示
    setTimeout(() => $toast.addClass('show'), 10);

    // 自动消失
    setTimeout(() => {
        $toast.removeClass('show');
        setTimeout(() => $toast.remove(), 300);
    }, 2000);
}

export default { render };
