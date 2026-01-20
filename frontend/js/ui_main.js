// 文件: ui_main.js
console.log("🔵 [UI] TTS_UI.js (Refactored) 开始加载...");

// 确保 window.TTS_UI 存在
if (!window.TTS_UI) {
    window.TTS_UI = {};
}

export const TTS_UI = window.TTS_UI;

(function (scope) {
    // 1. 定义核心状�?
    scope.CTX = {
        CACHE: null,
        API_URL: "",
        Utils: null,
        Callbacks: {}
    };

    // 2. 初始化入�?
    // 🟡 【修改点】增�?renderButton 参数，默认值为 true
    scope.init = function (context, renderButton = true) {
        // 更新内部引用
        scope.CTX = context;

        // 🟡 【修改点】增加判断：只有 renderButton �?true 时才创建悬浮�?
        if (renderButton && $('#tts-manager-btn').length === 0) {
            console.log("�?[UI] UI模块挂载/重置");
            scope.initFloatingButton();
        }
        // 【新增】注入气泡菜�?(如果还没有的�?
        if ($('#tts-bubble-menu').length === 0) {
            $('body').append(window.TTS_UI.Templates.getBubbleMenuHTML());
        }
    };

    // 3. 悬浮球逻辑
    scope.initFloatingButton = function () {
        if ($('#tts-manager-btn').length > 0) return;

        // 使用 Template 模块获取 HTML
        $('body').append(window.TTS_UI.Templates.getFloatingButtonHTML());

        if (scope.CTX.Utils && scope.CTX.Utils.makeDraggable) {
            scope.CTX.Utils.makeDraggable($('#tts-manager-btn'), scope.showDashboard);
        } else {
            $('#tts-manager-btn').click(scope.showDashboard);
        }
    };

    // 4. 显示面板主流�?
    scope.showDashboard = function () {
        // 清理旧面�?
        $('#tts-dashboard-overlay').remove();

        // 准备数据供模版使�?
        const settings = scope.CTX.CACHE.settings || {};
        const savedConfig = localStorage.getItem('tts_plugin_remote_config');
        const config = savedConfig ? JSON.parse(savedConfig) : { useRemote: false, ip: "" };

        const templateData = {
            isEnabled: settings.enabled !== false,
            settings: settings,
            isRemote: config.useRemote,
            remoteIP: config.ip,
            currentBase: settings.base_dir || "",
            currentCache: settings.cache_dir || "",
            currentLang: settings.default_lang || "default"
        };

        // 获取并插�?HTML
        const html = window.TTS_UI.Templates.getDashboardHTML(templateData);
        $('body').append(html);

        // 调用 Dashboard 模块的方法进行渲染和事件绑定
        scope.renderDashboardList();
        scope.renderModelOptions();
        scope.bindDashboardEvents();
    };

    // 5. 解绑操作 (必须暴露�?window.TTS_UI 下供 HTML inline onclick 调用)
    scope.handleUnbind = async function (c) {
        if (!confirm(`确定要解绑角�?"${c}" 吗？`)) return;

        try {
            await window.TTS_API.unbindCharacter(c);
            await scope.CTX.Callbacks.refreshData();
            scope.renderDashboardList();
            // 重置状�?
            $(`.voice-bubble[data-voice-name="${c}"]`).attr('data-status', 'waiting').removeClass('error playing ready');
        } catch (e) {
            console.error(e);
            alert("解绑失败");
        }
    };

})(window.TTS_UI);
