/**
 * 聊天注入工具模块
 * 将通话内容注入到 SillyTavern 聊天中
 */

export const ChatInjector = {
    /**
     * 将通话片段作为一条 assistant 消息注入聊天
     * 格式: 「某某给 user 打了电话，内容是：...」
     * 
     * @param {Object} options - 配置选项
     * @param {Array} options.segments - 对话片段数组 [{speaker, text, emotion}, ...]
     * @param {string} options.type - 类型: 'phone_call' | 'eavesdrop'
     * @param {string} options.callerName - 主叫人名称（电话场景）
     * @param {Array} options.speakers - 说话人列表（对话追踪场景）
     * @param {string} options.callId - 通话ID（可选）
     * @param {string} options.audioUrl - 音频URL（可选）
     * @param {string} options.sceneDescription - 场景描述（对话追踪场景，可选）
     * @returns {Promise<boolean>} 是否成功注入
     */
    async injectAsMessage(options) {
        const {
            segments = [],
            type = 'phone_call',
            callerName = '',
            speakers = [],
            callId = '',
            audioUrl = '',
            sceneDescription = ''
        } = options;

        if (!segments || segments.length === 0) {
            console.warn('[ChatInjector] ⚠️ 没有可注入的对话片段');
            return false;
        }

        try {
            const context = window.SillyTavern?.getContext?.();
            if (!context) {
                console.error('[ChatInjector] ❌ 无法获取 SillyTavern 上下文');
                return false;
            }

            const { addOneMessage, chat, name1 } = context;
            // saveChat 是 saveChatConditional 在 context 中的名称
            const saveChat = context.saveChat;
            const userName = name1 || '用户';

            // 构建消息内容
            let messageContent = '';

            if (type === 'phone_call') {
                // 主动电话格式
                messageContent = this._formatPhoneCallMessage(callerName, userName, segments, sceneDescription);
            } else if (type === 'eavesdrop') {
                // 对话追踪格式
                messageContent = this._formatEavesdropMessage(speakers, segments, sceneDescription);
            }

            // 构造消息对象
            const message = {
                name: type === 'phone_call' ? callerName : (speakers[0] || '旁白'),
                is_user: false,
                mes: messageContent,
                send_date: Date.now(),
                extra: {
                    // 标记为特殊消息类型
                    injected_type: type,
                    call_id: callId,
                    audio_url: audioUrl,
                    speakers: type === 'eavesdrop' ? speakers : [callerName]
                }
            };

            console.log('[ChatInjector] 📝 注入消息:', message);

            // 🔑 关键：先将消息 push 到 chat 数组，再调用 addOneMessage 渲染
            // 参考 SillyTavern 源码: "Callers push the new message to chat before calling addOneMessage"
            chat.push(message);
            addOneMessage(message);

            // 保存聊天记录
            if (saveChat) {
                await saveChat();
            }

            console.log('[ChatInjector] ✅ 通话内容已成功注入聊天');
            return true;

        } catch (error) {
            console.error('[ChatInjector] ❌ 注入失败:', error);
            return false;
        }
    },

    /**
     * 格式化主动电话消息
     * @private
     */
    _formatPhoneCallMessage(callerName, userName, segments, sceneDescription) {
        // 构建对话内容
        // 注意：callerName 现在是后端传递的 selected_speaker（LLM 选择的打电话人）
        const dialogueContent = segments.map(seg => {
            // 对于多人通话，使用 segment 中的 speaker；单人电话使用 callerName
            const speaker = seg.speaker || callerName;
            const text = seg.text || seg.content || '';
            const emotion = seg.emotion ? ` [${seg.emotion}]` : '';
            return `**${speaker}**${emotion}: "${text}"`;
        }).join('\n\n');

        // 组装可折叠的消息，防止剧透
        let sceneDesc = sceneDescription ? `\n*${sceneDescription}*` : '';

        const message = `<details>
<summary>📞 <strong>${callerName}</strong> 给 <strong>${userName}</strong> 打了一个电话 <em>(点击展开)</em></summary>
${sceneDesc}

---

${dialogueContent}

---

*通话结束*
</details>`;

        return message;
    },

    /**
     * 格式化对话追踪消息
     * @private
     */
    _formatEavesdropMessage(speakers, segments, sceneDescription) {
        const speakersText = speakers.join(' 和 ') || '角色们';

        // 构建对话内容
        const dialogueContent = segments.map(seg => {
            const speaker = seg.speaker || '???';
            const text = seg.text || seg.content || '';
            const emotion = seg.emotion ? ` [${seg.emotion}]` : '';
            return `**${speaker}**${emotion}: "${text}"`;
        }).join('\n\n');

        // 组装可折叠的消息，防止剧透
        let sceneDesc = sceneDescription ? `\n*${sceneDescription}*` : '';

        const message = `<details>
<summary>🎧 <strong>${speakersText}</strong> 正在私下交谈 <em>(点击展开)</em></summary>
${sceneDesc}

---

${dialogueContent}

---

*对话结束*
</details>`;

        return message;
    },

    /**
     * 将通话/窃听内容追加到最后一条 AI 消息中（不新增楼层）
     * 这样不会影响依赖楼层的触发逻辑，同时 LLM 下次对话能读到电话内容
     * 
     * @param {Object} options - 配置选项（同 injectAsMessage）
     * @returns {Promise<boolean>} 是否成功追加
     */
    async appendToLastAIMessage(options) {
        const context = window.SillyTavern?.getContext?.();
        if (!context) {
            console.error('[ChatInjector] ❌ 无法获取 SillyTavern 上下文');
            return false;
        }

        const { streamingProcessor, eventSource, eventTypes } = context;

        // 检测是否正在生成中
        const isGenerating = streamingProcessor?.isProcessing || streamingProcessor?.isFinished === false;

        if (isGenerating) {
            console.log('[ChatInjector] ⏳ 检测到正在生成中，等待生成完成后追加...');
            // 等待生成结束后再追加
            return new Promise((resolve) => {
                const handler = async () => {
                    eventSource.removeListener(eventTypes.GENERATION_ENDED, handler);
                    // 稍微延迟一下，确保消息已完全写入
                    await new Promise(r => setTimeout(r, 100));
                    const result = await this._doAppend(options);
                    resolve(result);
                };
                eventSource.on(eventTypes.GENERATION_ENDED, handler);
            });
        } else {
            return this._doAppend(options);
        }
    },

    /**
     * 执行追加操作
     * @private
     */
    async _doAppend(options) {
        const {
            segments = [],
            type = 'phone_call',
            callerName = '',
            speakers = [],
            sceneDescription = ''
        } = options;

        if (!segments || segments.length === 0) {
            console.warn('[ChatInjector] ⚠️ 没有可追加的对话片段');
            return false;
        }

        try {
            const context = window.SillyTavern?.getContext?.();
            if (!context) {
                console.error('[ChatInjector] ❌ 无法获取 SillyTavern 上下文');
                return false;
            }

            const { chat, updateMessageBlock, name1 } = context;
            const saveChat = context.saveChat;
            const userName = name1 || '用户';

            // 找到最后一条 AI 消息的索引
            const lastAIIndex = this._findLastAIMessageIndex(chat);
            if (lastAIIndex === -1) {
                console.warn('[ChatInjector] ⚠️ 未找到可追加的 AI 消息，回退到创建新消息');
                return this.injectAsMessage(options);
            }

            // 格式化电话/窃听内容
            let appendContent = '';
            if (type === 'phone_call') {
                appendContent = this._formatPhoneCallMessage(callerName, userName, segments, sceneDescription);
            } else if (type === 'eavesdrop') {
                appendContent = this._formatEavesdropMessage(speakers, segments, sceneDescription);
            }

            // 追加到消息末尾
            const targetMessage = chat[lastAIIndex];
            targetMessage.mes += '\n\n' + appendContent;

            // 如果消息有 extra 字段，添加追加记录
            if (!targetMessage.extra) {
                targetMessage.extra = {};
            }
            if (!targetMessage.extra.appended_content) {
                targetMessage.extra.appended_content = [];
            }
            targetMessage.extra.appended_content.push({
                type: type,
                timestamp: Date.now(),
                speakers: type === 'eavesdrop' ? speakers : [callerName]
            });

            console.log(`[ChatInjector] 📝 追加内容到消息 #${lastAIIndex}:`, appendContent.substring(0, 100) + '...');

            // 刷新 DOM 显示
            if (updateMessageBlock) {
                updateMessageBlock(lastAIIndex, targetMessage);
            }

            // 保存聊天记录
            if (saveChat) {
                await saveChat();
            }

            console.log('[ChatInjector] ✅ 内容已成功追加到最后一条 AI 消息');
            return true;

        } catch (error) {
            console.error('[ChatInjector] ❌ 追加失败:', error);
            return false;
        }
    },

    /**
     * 查找最后一条 AI 消息的索引
     * @private
     * @param {Array} chat - 聊天记录数组
     * @returns {number} 消息索引，未找到返回 -1
     */
    _findLastAIMessageIndex(chat) {
        if (!chat || chat.length === 0) {
            return -1;
        }
        // 从后往前找第一条非用户消息
        for (let i = chat.length - 1; i >= 0; i--) {
            if (!chat[i].is_user && chat[i].mes) {
                return i;
            }
        }
        return -1;
    }
};

export default ChatInjector;
