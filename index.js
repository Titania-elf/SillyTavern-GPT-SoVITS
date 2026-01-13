(function () {
    // ================= 1. 配置区域 =================
    const lsConfig = localStorage.getItem('tts_plugin_remote_config');
    let remoteConfig = lsConfig ? JSON.parse(lsConfig) : { useRemote: false, ip: "" };
    let apiHost = "127.0.0.1";

    if (remoteConfig.useRemote && remoteConfig.ip) {
        apiHost = remoteConfig.ip;
    } else {
        const current = window.location.hostname;
        apiHost = (current === 'localhost' || current === '127.0.0.1') ? '127.0.0.1' : current;
    }

    const MANAGER_API = `http://${apiHost}:3000`;

    // ================= 2. 模块加载器 =================
    const loadModule = (name) => {
        return new Promise((resolve, reject) => {
            const url = `${MANAGER_API}/static/js/${name}.js?t=${new Date().getTime()}`;
            $.getScript(url)
                .done(() => {
                resolve();
            })
                .fail((jqxhr, settings, exception) => {
                console.error(`[TTS] 加载模块 ${name} 失败:`, exception);
                reject(exception);
            });
        });
    };

    // ================= 3. 主逻辑函数 =================
    function initPlugin() {
        console.log("✅ [TTS] 开始初始化插件核心...");

        const cachedStyle = localStorage.getItem('tts_bubble_style');
        if (cachedStyle) {
            document.body.setAttribute('data-bubble-style', cachedStyle);
        }

        // 1. 模块初始化 (确保所有子模块的 init 方法都被调用)
        if (window.TTS_API) window.TTS_API.init(MANAGER_API);
        if (window.TTS_State) window.TTS_State.init();
        if (window.TTS_Parser) window.TTS_Parser.init();
        if (window.TTS_Events) window.TTS_Events.init();
        if (window.TTS_Scheduler) window.TTS_Scheduler.init();

        // 2. 建立局部引用 (快捷方式)
        const TTS_Utils = window.TTS_Utils;
        const CACHE = window.TTS_State.CACHE;
        const Scheduler = window.TTS_Scheduler;

        const savedStyle = localStorage.getItem('tts_bubble_style') || 'default';
        document.body.setAttribute('data-bubble-style', savedStyle);

        // 3. 加载全局 CSS
        TTS_Utils.loadGlobalCSS(`${MANAGER_API}/static/css/style.css?t=${new Date().getTime()}`, (cssContent) => {
            // CSS加载完毕后，手动扫描一次
            if (window.TTS_Parser) window.TTS_Parser.scan();

            // 修复 Iframe 样式
            $('iframe').each(function() {
                try {
                    const head = $(this).contents().find('head');
                    if (head.length > 0 && head.find('#sovits-iframe-style').length === 0) {
                        head.append(`<style id='sovits-iframe-style'>${cssContent}</style>`);
                    }
                } catch(e) {}
            });
        });

        // 4. 定义核心回调函数 (传给 UI 模块使用)
        async function refreshData() {
            try {
                TTS_Utils.injectStyles();
                $('#tts-manager-btn').css({ 'border-color': 'rgba(255,255,255,0.3)', 'color': '#fff' }).text('🔊 TTS配置');

                const data = await window.TTS_API.getData();

                // 更新 State
                CACHE.models = data.models;
                CACHE.mappings = data.mappings;
                if (data.settings) CACHE.settings = { ...CACHE.settings, ...data.settings };

                if (CACHE.settings.bubble_style) {
                    // 1. 应用到 body 标签，让页面气泡立刻变色
                    document.body.setAttribute('data-bubble-style', CACHE.settings.bubble_style);

                    // 2. 存入本地缓存
                    localStorage.setItem('tts_bubble_style', CACHE.settings.bubble_style);

                    // ============================================================
                    // ✨ 【核心修改】适配自定义下拉菜单的回显逻辑
                    // ============================================================
                    const currentStyle = CACHE.settings.bubble_style || 'default';
                    const $trigger = $('.select-trigger'); // 获取下拉框的显示条
                    const $targetOption = $(`.option-item[data-value="${currentStyle}"]`); // 找到对应的选项

                    if ($targetOption.length > 0) {
                        // (1) 把显示条的文字变成对应的名字（例如 "💎 幻彩·琉璃"）
                        $trigger.find('span').text($targetOption.text());
                        // (2) 修改 data-value，触发 CSS 变色（变绿/变粉）
                        $trigger.attr('data-value', currentStyle);
                    }
                }

                // 强制覆盖 iframe_mode
                const localIframeMode = localStorage.getItem('tts_plugin_iframe_mode');
                if (localIframeMode !== null) CACHE.settings.iframe_mode = (localIframeMode === 'true');

                CACHE.pendingTasks.clear();

                // 刷新 UI
                if (window.TTS_UI) {
                    window.TTS_UI.renderModelOptions();
                    window.TTS_UI.renderDashboardList();
                }

                // 自动生成检查
                if (CACHE.settings.enabled !== false && CACHE.settings.auto_generate) {
                    Scheduler.scanAndSchedule();
                }
            } catch (e) {
                console.error("TTS Backend Error:", e);
                TTS_Utils.showNotification("❌ 未检测到 TTS 后端服务", "error");
                $('#tts-manager-btn').css({ 'border-color': '#ff5252', 'color': '#ff5252' }).text('⚠️ TTS断开');
            }
        }
        // 【新增】: 切换气泡风格的回调函数
        async function toggleBubbleStyle(checked) {
            if (checked) {
                document.body.classList.add('use-classic-style');
                localStorage.setItem('tts_style_classic', 'true');
            } else {
                document.body.classList.remove('use-classic-style');
                localStorage.setItem('tts_style_classic', 'false');
            }
            // 触发一次扫描，确保样式更新（有时需要重绘）
            if (window.TTS_Parser) window.TTS_Parser.scan();
        }

        async function toggleMasterSwitch(checked) {
            CACHE.settings.enabled = checked;
            if (checked && window.TTS_Parser) window.TTS_Parser.scan();
            try { await window.TTS_API.updateSettings({ enabled: checked }); } catch(e) {}
        }

        async function toggleAutoGenerate(checked) {
            CACHE.settings.auto_generate = checked;
            try {
                await window.TTS_API.updateSettings({ auto_generate: checked });
                if (checked && CACHE.settings.enabled !== false) Scheduler.scanAndSchedule();
            } catch(e) {}
        }
        // 【修改后的完整函数】
        async function changeBubbleStyle(styleName) {
            console.log("🎨 正在切换风格为:", styleName);

            // 1. 立即在前端生效 (无延迟体验)
            document.body.setAttribute('data-bubble-style', styleName);
            localStorage.setItem('tts_bubble_style', styleName);

            // 2. 发送到后端保存到 system_settings.json
            try {
                // 注意：MANAGER_API 已经在 index.js 开头定义了，通常是 http://127.0.0.1:3000
                const response = await fetch(`${MANAGER_API}/save_style`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ style: styleName })
                });

                const res = await response.json();
                if(res.status === 'success') {
                    console.log("✅ 风格已永久保存:", styleName);

                    // 更新本地缓存里的 settings，防止刷新前出现数据不一致
                    if(window.TTS_State && window.TTS_State.CACHE.settings) {
                        window.TTS_State.CACHE.settings.bubble_style = styleName;
                    }
                }
            } catch(e) {
                console.error("❌ 保存风格失败:", e);
            }
        }
        async function saveSettings(base, cache) {
            const b = base !== undefined ? base : $('#tts-base-path').val().trim();
            const c = cache !== undefined ? cache : $('#tts-cache-path').val().trim();
            try {
                await window.TTS_API.updateSettings({ base_dir: b, cache_dir: c });
                return true;
            } catch(e) { return false; }
        }

        // 5. 初始化 UI 模块
        if (window.TTS_UI) {
            window.TTS_UI.init({
                CACHE: CACHE,
                API_URL: MANAGER_API,
                Utils: TTS_Utils,
                Callbacks: { refreshData, saveSettings, toggleMasterSwitch, toggleAutoGenerate, changeBubbleStyle }
            });
        }
        // ============================================================
        // 【新增】自定义下拉菜单交互逻辑
        // ============================================================

        // 1. 点击触发器：切换菜单展开/收起
        $('body').on('click', '.select-trigger', function(e) {
            e.stopPropagation(); // 阻止冒泡
            $(this).parent('.tts-custom-select').toggleClass('open');
        });

        // 2. 点击选项：选中并关闭
        $('body').on('click', '.option-item', function() {
            const val = $(this).attr('data-value');
            const text = $(this).text();
            const $wrapper = $(this).closest('.tts-custom-select');

            // 更新触发器的文字和 data-value (触发 CSS 变色)
            const $trigger = $wrapper.find('.select-trigger');
            $trigger.find('span').text(text);
            $trigger.attr('data-value', val); // 这一步会让 Trigger 变成对应的颜色

            // 关闭菜单
            $wrapper.removeClass('open');

            // 执行核心切换逻辑
            changeBubbleStyle(val);
        });

        // 3. 点击页面其他地方：自动关闭菜单
        $(document).on('click', function() {
            $('.tts-custom-select').removeClass('open');
        });

        // 6. 启动心跳看门狗
        function runWatchdog() {
            if (document.hidden) return; // 页面不可见时不执行

            // 检查 UI 按钮
            if (window.TTS_UI && $('#tts-manager-btn').length === 0) {
                window.TTS_UI.init({
                    CACHE: CACHE,
                    API_URL: MANAGER_API,
                    Utils: TTS_Utils,
                    Callbacks: { refreshData, saveSettings, toggleMasterSwitch, toggleAutoGenerate }
                });
            }

            // 检查 CSS
            if (TTS_Utils && TTS_Utils.getStyleContent) {
                const currentCSS = TTS_Utils.getStyleContent();
                if ($('#sovits-iframe-style-main').length === 0 && currentCSS) {
                    $('head').append(`<style id='sovits-iframe-style-main'>${currentCSS}</style>`);
                }
            }

            // 检查气泡
            if (CACHE.settings.enabled && window.TTS_Parser) {
                window.TTS_Parser.scan();
            }
        }

        // 立即执行一次
        refreshData();

        // 启动循环
        setInterval(runWatchdog, 1500);

        // 启动 DOM 监听
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length > 0) {
                    shouldScan = true;
                    break;
                }
            }
            if (shouldScan && CACHE.settings.enabled && window.TTS_Parser) {
                window.TTS_Parser.scan();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });

        // 暴露全局刷新
        window.refreshTTS = refreshData;
        setTimeout(runWatchdog, 500);
    }

    // ================= 4. 启动引导流程 =================
    async function bootstrap() {
        try {
            console.log("🚀 [TTS] 正在加载模块...");

            // 按顺序加载依赖
            // 1. 工具与API
            await loadModule('utils');
            await loadModule('api');
            await loadModule('state');

            // 2. 核心组件
            await loadModule('dom_parser'); // 【修复点】之前写错了名字
            await loadModule('scheduler');
            await loadModule('events');

            // 3. 界面
            await loadModule('ui');

            console.log("✅ [Loader] 所有模块加载完毕，启动插件");
            initPlugin();

        } catch (error) {
            console.error("❌ TTS插件启动失败:", error);
            // 备用：如果 Promise 失败，尝试传统的 alert 提示
            if (window.TTS_Utils) window.TTS_Utils.showNotification("TTS插件加载失败，请按F12检查日志", "error");
        }
    }
    bootstrap();
})();
