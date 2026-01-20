// static/js/events.js
// ģ���ڲ�������������Ⱦȫ�� window
let currentAudio = null;

export const TTS_Events = {
    init() {
        this.bindClickEvents();
        this.bindMessageEvents();
        this.bindMenuEvents();
        console.log("??[Events] �¼��������Ѽ���");
    },

    // --- ͳһ���ſ���??---
    playAudio(key, audioUrl) {
        // 1. ֹͣ��ǰ���ڲ���??
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }

        // 2. �����������ж�??UI
        const resetAnim = () => {
            $('.voice-bubble').removeClass('playing');
            $('iframe').each(function () {
                try { $(this).contents().find('.voice-bubble').removeClass('playing'); } catch (e) { }
            });
        };
        resetAnim();

        // 3. ��������??
        if (!audioUrl) return;
        const audio = new Audio(audioUrl);
        currentAudio = audio;

        // 4. ���嶯��ͬ������
        const setAnim = (active) => {
            const func = active ? 'addClass' : 'removeClass';
            $(`.voice-bubble[data-key='${key}']`)[func]('playing');
            $('iframe').each(function () {
                try { $(this).contents().find(`.voice-bubble[data-key='${key}']`)[func]('playing'); } catch (e) { }
            });
        };

        setAnim(true); // ��ʼ��??

        audio.onended = () => {
            currentAudio = null;
            setAnim(false); // ��������
        };

        // ������
        audio.onerror = () => {
            console.error("��Ƶ���ų���");
            setAnim(false);
            currentAudio = null;
        };

        audio.play();
    },
    // === ��ȡ���Ĳ˵���ʾ�߼� (??Iframe ����) ===
    handleContextMenu(e, $btn) {
        e.preventDefault();

        // 1. ֻ�������ɵ��������������??
        if ($btn.attr('data-status') !== 'ready') return;

        const $menu = $('#tts-bubble-menu');
        $menu.data('target', $btn);

        // 2. �������� (���� Iframe ����??e �����Ǿ�������������α����Ҳ������ԭ���¼�)
        let clientX = e.clientX;
        let clientY = e.clientY;

        // ���ݴ���
        if (e.originalEvent && e.originalEvent.touches && e.originalEvent.touches.length > 0) {
            clientX = e.originalEvent.touches[0].clientX;
            clientY = e.originalEvent.touches[0].clientY;
        }

        // 3. �߽��??
        let left = clientX + 10;
        let top = clientY + 10;
        if (left + 150 > $(window).width()) left = $(window).width() - 160;
        if (top + 160 > $(window).height()) top = $(window).height() - 170;

        $menu.css({ top: top + 'px', left: left + 'px' }).fadeIn(150);
    },

    bindClickEvents() {
        $(document).on('click', '.voice-bubble', (e) => {
            const $btn = $(e.currentTarget); // ʹ�� currentTarget ȷ���㵽���ǰ�ť����
            const charName = $btn.data('voice-name');
            const CACHE = window.TTS_State.CACHE;
            const Scheduler = window.TTS_Scheduler;

            // ״??A: ����??(Ready)
            if ($btn.attr('data-status') === 'ready') {
                const audioUrl = $btn.attr('data-audio-url') || $btn.data('audio-url');

                if (!audioUrl) {
                    $btn.attr('data-status', 'error').removeClass('playing');
                    alert("音频加载失败,请刷新页面重试");
                    return;
                }

                // === �����߼��������ǰ���ڲ��ţ���ͣ??(Toggle Stop) ===
                if ($btn.hasClass('playing')) {
                    // 1. ֹͣ��Ƶ
                    if (currentAudio) {
                        currentAudio.pause();
                        currentAudio = null;
                    }
                    // 2. ��������涯??
                    $('.voice-bubble').removeClass('playing');
                    // 3. ��� Iframe �ڶ�??(��ֹ���򱨴�??try-catch)
                    $('iframe').each(function () {
                        try { $(this).contents().find('.voice-bubble').removeClass('playing'); } catch (e) { }
                    });
                    return; // ֱ�ӽ�������ִ�к��������߼�
                }
                // ========================================================

                // ��ȡ key (���û�� data-key�������� Scheduler ����һ�������ݾɰ�)
                const key = $btn.data('key') || Scheduler.getTaskKey(charName, $btn.data('text'));

                // ����Ҫ�޸���ǿ�ƽ� key д�� DOM��ȷ??playAudio ��ͨ������ѡ�����ҵ���
                $btn.attr('data-key', key);

                this.playAudio(key, audioUrl);
            }
            // ״??B: δ���ɻ�ʧ�ܣ�������??
            else if ($btn.attr('data-status') === 'waiting' || $btn.attr('data-status') === 'error') {
                if (CACHE.settings.enabled === false) {
                    alert('TTS 功能可能已关闭,请检查设置后重试');
                    return;
                }

                if (!CACHE.mappings[charName]) {
                    // ���� UI ģ����ʾ���
                    if (window.TTS_UI) {
                        window.TTS_UI.showDashboard();
                        $('#tts-new-char').val(charName);
                        $('#tts-new-model').focus();
                    }
                    alert(`?? ��ɫ "${charName}" ��δ�� TTS ģ�ͣ����Զ�Ϊ�������ɫ����\n�����Ҳ�ѡ��ģ�Ͳ�������󶨡���`);
                } else {
                    $btn.removeClass('error');
                    $btn.data('auto-play-after-gen', true); // ������ɺ��Զ���??
                    Scheduler.addToQueue($btn);
                    Scheduler.run();
                }
            }
        });
        // === ����������??(PC) ??���� (�ֻ�) ����˵� ===
        $(document).on('contextmenu', '.voice-bubble', (e) => {
            this.handleContextMenu(e, $(e.currentTarget));
        });

        // === �����������ҳ��հ״��رղ˵� ===
        $(document).on('click', (e) => {
            // �������Ĳ��ǲ˵������Ҳ���ǲ˵���İ�ť���͹�??
            if (!$(e.target).closest('#tts-bubble-menu').length) {
                $('#tts-bubble-menu').fadeOut(100);
            }
        });
    },

    // --- �細����Ϣ��??(Iframe -> Main) ---
    bindMessageEvents() {
        window.addEventListener('message', (event) => {
            if (!event.data || event.data.type !== 'play_tts') return;

            const { key, text, charName, emotion } = event.data;
            const CACHE = window.TTS_State.CACHE;
            const Scheduler = window.TTS_Scheduler;

            // 1. ����??
            if (!CACHE.mappings[charName]) {
                if (window.TTS_UI) {
                    window.TTS_UI.showDashboard();
                    $('#tts-new-char').val(charName);
                    $('#tts-new-model').focus();
                }
                // ��΢�ӳ�һ??alert��������??UI ��Ⱦ
                setTimeout(() => {
                    alert(`?? ��ɫ "${charName}" ��δ�� TTS ģ�͡�\n��Ϊ���Զ���ý�ɫ���������Ҳ�ѡ��ģ�Ͳ�������󶨡���`);
                }, 100);
                return;
            }

            // 2. �����Ƿ񻺴棬��ֹͣ��ǰ���� (??playAudio �ڲ������������Ϊ���߼������ȴ�����沥??
            if (CACHE.audioMemory[key]) {
                this.playAudio(key, CACHE.audioMemory[key]);
                return;
            }

            if (CACHE.settings.enabled === false) { alert('TTS 功能已关闭'); return; }

            let $realBtn = null;
            $('iframe').each(function () {
                try {
                    const b = $(this).contents().find(`.voice-bubble[data-key='${key}']`);
                    if (b.length) $realBtn = b;
                } catch (e) { }
            });
            if (!$realBtn || !$realBtn.length) $realBtn = $(`.voice-bubble[data-key='${key}']`);

            // 4. ִ�е���
            if ($realBtn && $realBtn.length) {
                $realBtn.attr('data-key', key);
                $realBtn.removeClass('error').attr('data-status', 'waiting');
                Scheduler.addToQueue($realBtn);
                Scheduler.run();
            } else {
                console.warn("[TTS] 按钮DOM丢失,等待DOM刷新后重试...");
                setTimeout(() => { window.postMessage(event.data, '*'); }, 200);
            }
        });
    },

    // === �������غ��� ===
    async downloadAudio(audioUrl, speaker, text) {
        if (!audioUrl) {
            alert("无法下载:音频文件不存在");
            return;
        }

        const cleanText = text.substring(0, 50).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

        // �����ļ�?? ˵��??��������.wav
        const filename = `${speaker}:${cleanText}.wav`;

        // ?? �ؼ��Ż�:���� Blob URL �ͷ�����·��
        const isBlobUrl = audioUrl.startsWith('blob:');

        // ���� Blob URL,ʹ�� fetch ��ʽ(ͬԴ,??CORS ����)
        if (isBlobUrl) {
            try {
                const response = await fetch(audioUrl);
                const blob = await response.blob();

                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();

                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(downloadUrl);
                }, 100);

                if (window.TTS_Utils && window.TTS_Utils.showNotification) {
                    window.TTS_Utils.showNotification("?? ���سɹ�: " + filename, "success");
                }
            } catch (e) {
                console.error("����ʧ��:", e);
                alert("??����ʧ��: " + e.message);
            }
        }
        // ���ڷ�����·??ֱ��ʹ�ü����ط�??���� CORS)
        else {
            try {
                const a = document.createElement('a');
                a.href = audioUrl;
                a.download = filename;
                // ����??target='_blank',�������ֱ������
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);

                if (window.TTS_Utils && window.TTS_Utils.showNotification) {
                    window.TTS_Utils.showNotification("?? ���سɹ�: " + filename, "success");
                }
            } catch (e) {
                console.error("����ʧ��:", e);
                alert("??����ʧ��: " + e.message);
            }
        }
    },

    bindMenuEvents() {
        // 0. �������� (Download)
        $(document).on('click', '#tts-action-download', async () => {
            const $btn = $('#tts-bubble-menu').data('target');
            $('#tts-bubble-menu').fadeOut(100);

            if (!$btn || !$btn.length) return;

            const audioUrl = $btn.attr('data-audio-url') || $btn.data('audio-url');
            const speaker = $btn.data('voice-name') || 'Unknown';
            const text = $btn.data('text') || '';

            // ���ù������غ���
            await window.TTS_Events.downloadAudio(audioUrl, speaker, text);
        });

        // 1. �ػ� (Re-Roll) - �����ķ����ɾ��
        $(document).on('click', '#tts-action-reroll', async () => {
            const $btn = $('#tts-bubble-menu').data('target');
            $('#tts-bubble-menu').fadeOut(100);

            if (!$btn || !$btn.length) return;

            // ���ؼ���??1�����ٴ� audioUrl ���ļ���������ֱ�Ӷ�ȡ����??Scheduler ���õ���ʵ�ļ�??
            const serverFilename = $btn.attr('data-server-filename');

            // ���û���ļ�����˵����û���ɹ�������ʧ���ˣ������Ǿɰ汾���棨��û���ļ���??
            // ��������£�ֱ������ UI �����������ɼ��ɣ�����Ҫ��Ҳ�޷���ɾ���������??
            if (!serverFilename) {
                console.warn("未找到服务器文件名记录,跳过删除缓存,直接重新生成");
                resetAndRegen($btn);
                return;
            }

            if (!confirm("确定要清除缓存并重新生成吗?")) return;

            try {
                console.log(`准备删除服务器缓存: ${serverFilename}`);
                await window.TTS_API.deleteCache(serverFilename);
                console.log(`[Re-roll] 服务器缓存 ${serverFilename} 已删除`);
            } catch (e) {
                console.warn("删除服务器缓存失败,可能文件已不存在,继续执行重新生成", e);
            }

            // B. ִ�����ú���??
            // �����顿����ǰ�Ѿɵ��ļ�����¼Ҳ���������߼�����
            $btn.removeAttr('data-server-filename');
            resetAndRegen($btn);
        });

        // ��װһ�����ò����ɵĸ�����??
        function resetAndRegen($btn) {
            const key = $btn.data('key');
            const CACHE = window.TTS_State.CACHE;
            const Scheduler = window.TTS_Scheduler;

            // 1. ���ǰ���ڴ滺�� (���??
            if (key && CACHE.audioMemory[key]) {
                // �ͷ� Blob URL �ڴ�
                URL.revokeObjectURL(CACHE.audioMemory[key]);
                delete CACHE.audioMemory[key];
            }

            // 2. ֹͣ��ǰ�������ڲ��ŵ������??
            if ($btn.hasClass('playing')) {
                // ��������¼���ֹͣ������ֱ�ӵ�??API ֹͣ
                if (window.TTS_Events.playAudio) window.TTS_Events.playAudio(null, null);
            }

            // 3. ���ð�ť״??
            $btn.attr('data-status', 'waiting')
                .removeClass('ready error playing')
                .css('opacity', '0.6'); // �Ӿ�����

            // 4. ���¼������
            // Scheduler �����¶�??global settings ??character mapping
            // �Զ������µ�������������Ҫ��??params
            Scheduler.addToQueue($btn);
            Scheduler.run();
        }


        $(document).on('click', '#tts-action-fav', async () => {
            const $btn = $('#tts-bubble-menu').data('target');
            $('#tts-bubble-menu').fadeOut(100);
            if (!$btn) return;

            const serverFilename = $btn.attr('data-server-filename');
            if (!serverFilename) {
                alert("无法收藏:未找到源文件(可能是旧缓存)");
                return;
            }

            const msgFingerprint = window.TTS_Utils.getEnhancedFingerprint($btn);
            const branchId = window.TTS_Utils.getCurrentChatBranch();

            // ��ȡ����??
            let context = [];
            try {
                if (window.SillyTavern && window.SillyTavern.getContext) {
                    const stContext = window.SillyTavern.getContext();
                    const chatMessages = stContext.chat;

                    const recentMessages = chatMessages.slice(-4, -1);
                    context = recentMessages.map(msg => {
                        const text = msg.mes || '';
                        return text.substring(0, 100) + (text.length > 100 ? "..." : "");
                    });
                } else {
                    throw new Error('API not available');
                }
            } catch (e) {
                // ����??DOM ��ѯ
                let $msgContainer = $btn.closest('.mes, .message-body');
                if ($msgContainer.length) {
                    let $prev = $msgContainer.prevAll('.mes, .message-body').slice(0, 3);
                    $($prev.get().reverse()).each((i, el) => {
                        let text = $(el).find('.mes_text, .markdown-content').text() || $(el).text();
                        context.push(text.substring(0, 100) + "...");
                    });
                }
            }

            // --- ������������ ---
            const favItem = {
                char_name: $btn.data('voice-name') || "Unknown",
                text: $btn.data('text'),
                filename: serverFilename,
                audio_url: $btn.attr('data-audio-url'),
                fingerprint: msgFingerprint,
                chat_branch: branchId,
                context: context,
                emotion: $btn.data('voice-emotion') || $btn.attr('data-voice-emotion') || ""
            };

            try {
                await window.TTS_API.addFavorite(favItem);
                if (window.TTS_Utils && window.TTS_Utils.showNotification) {
                    window.TTS_Utils.showNotification("?? ���ղص���֧: " + branchId, "success");
                } else {
                    alert("收藏成功");
                }
            } catch (e) {
                console.error(e);
                alert("�ղ�ʧ��: " + e.message);
            }
        });
    }
};
