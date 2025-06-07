const { ipcRenderer } = require('electron');

const novelContent = document.getElementById('novelContent');
const chatDisplay = document.getElementById('chatDisplay');
const chatInput = document.getElementById('chatInput');
const sendMessage = document.getElementById('sendMessage');
const currentFile = document.getElementById('currentFile');

// 获取预置的批量工具建议容器
const batchToolSuggestionsContainer = document.getElementById('batch-tool-suggestions-container');
const toolCardsWrapper = batchToolSuggestionsContainer.querySelector('.tool-cards-wrapper');
const batchApproveAllButton = batchToolSuggestionsContainer.querySelector('.approve-all-button');
const batchRejectAllButton = batchToolSuggestionsContainer.querySelector('.reject-all-button');

// 新增：用于存储当前批次待处理的工具建议，与 main.js 中的 pendingToolCalls 对应
let currentBatchToolSuggestions = [];

sendMessage.addEventListener('click', async () => {
    const command = chatInput.value;
    chatInput.value = '';
    appendMessage('user', command); // 先显示用户消息
    // 发送命令到主进程，主进程将异步发送 AI 响应回来
    ipcRenderer.invoke('process-command', command);
});

function appendMessage(sender, message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add(sender);
    messageElement.innerText = `${sender.toUpperCase()}: ${message}`;
    chatDisplay.appendChild(messageElement);
    chatDisplay.scrollTop = chatDisplay.scrollHeight; // Scroll to bottom
}

// IPC 监听器：处理来自主进程的 AI 响应
ipcRenderer.on('ai-response', (event, aiResponse) => {
    console.log("Received AI response:", aiResponse); // 调试日志
    if (aiResponse.type === 'text') {
        appendMessage('ai', aiResponse.payload);
    } else if (aiResponse.type === 'tool_suggestion') { // 单个工具建议 (兼容旧版，但主进程现在发送复数)
        console.warn("Received deprecated 'tool_suggestion' type. Please update main.js to send 'tool_suggestions'.");
        // 兼容旧版，但将其包装成批处理形式
        appendBatchToolSuggestions([aiResponse.payload]);
    } else if (aiResponse.type === 'tool_suggestions') { // 多个工具建议 (新版)
        console.log('Renderer received tool_suggestions:', aiResponse.payload); // 新增日志
        appendBatchToolSuggestions(aiResponse.payload);
    } else if (aiResponse.type === 'error') {
        appendMessage('error', aiResponse.payload); // 显示错误信息
    } else if (aiResponse.type === 'end_task') {
        // AI 任务完成，显示最终消息并应用特殊样式
        const messageElement = document.createElement('div');
        messageElement.classList.add('ai');
        messageElement.classList.add('task-end'); // 新增 class 用于样式控制
        messageElement.innerText = `AI: 任务完成 - ${aiResponse.payload}`;
        chatDisplay.appendChild(messageElement);
        chatDisplay.scrollTop = chatDisplay.scrollHeight; // Scroll to bottom
        // 可选：在这里添加响铃提醒或其他完成提示
    } else if (aiResponse.type === 'ask_user_question') {
        appendQuestionCard(aiResponse.payload);
    } else if (aiResponse.type === 'tool_execution_status') { // 工具执行状态处理（来自 main.js 的 performToolExecution）
        const payload = aiResponse.payload;
        const toolCard = document.getElementById(`tool-suggestion-${payload.toolCallId}`);
        if (toolCard) {
            const statusText = toolCard.querySelector('.tool-status-text');
            if (statusText) {
                statusText.innerText = `状态: ${payload.message}`;
            }
            toolCard.classList.remove('executing'); // 移除执行中状态
            if (payload.success) {
                toolCard.classList.add('executed');
            } else {
                toolCard.classList.add('failed');
            }
            // 禁用此工具卡片上的所有按钮 (如果之前没有禁用)
            const buttons = toolCard.querySelectorAll('.tool-actions button');
            buttons.forEach(btn => btn.disabled = true);
        }
        appendToolExecutionStatus(aiResponse.payload); // 仍然显示在聊天区
    } else if (aiResponse.type === 'tool_action_status') { // 单个工具动作状态 (来自 main.js 的 process-tool-action)
        const payload = aiResponse.payload;
        const toolCard = document.getElementById(`tool-suggestion-${payload.toolCallId}`);
        if (toolCard) {
            const statusText = toolCard.querySelector('.tool-status-text');
            if (statusText) {
                statusText.innerText = `状态: ${payload.message || payload.status}`;
            }
            // 移除旧状态
            toolCard.classList.remove('executing', 'rejected', 'executed', 'failed');
            // 添加新状态
            toolCard.classList.add(payload.status);
            // 禁用此工具卡片上的批准/拒绝按钮
            const approveButton = toolCard.querySelector('.approve-button');
            const rejectButton = toolCard.querySelector('.reject-button');
            if (approveButton) approveButton.disabled = true;
            if (rejectButton) rejectButton.disabled = true;
        }
    } else if (aiResponse.type === 'batch_action_status') { // 批量工具动作状态 (来自 main.js 的 process-batch-action)
        const payload = aiResponse.payload;
        // batchToolSuggestionsContainer 已经是预置的容器
        if (batchToolSuggestionsContainer) {
            batchToolSuggestionsContainer.classList.remove('executing_all', 'rejected_all');
            batchToolSuggestionsContainer.classList.add(payload.status);
            const header = batchToolSuggestionsContainer.querySelector('p');
            if (header) {
                header.innerText = `AI 建议执行以下多项操作：${payload.message || payload.status}`;
            }
            // 禁用所有按钮
            disableAllToolActionButtons();
        }
    } else if (aiResponse.type === 'batch_processing_complete') { // 批处理完成，隐藏容器
        if (batchToolSuggestionsContainer) {
            batchToolSuggestionsContainer.style.display = 'none'; // 隐藏容器
        }
        // 清空本地状态
        currentBatchToolSuggestions = [];
        // 清空 toolCardsWrapper 的内容
        if (toolCardsWrapper) {
            toolCardsWrapper.innerHTML = '';
        }
    }
});

// 新增函数：显示工具执行状态
function appendToolExecutionStatus(payload) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('chat-message');
    messageElement.classList.add('system-message'); // 增加一个系统消息类
    if (payload.success) {
        messageElement.classList.add('tool-success'); // 成功类
    } else {
        messageElement.classList.add('tool-failure'); // 失败类
    }
    messageElement.innerHTML = `
        <div class="message-header">系统通知</div>
        <div class="message-content">${payload.message}</div>
    `;
    chatDisplay.appendChild(messageElement);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// 辅助函数：显示提问卡片
function appendQuestionCard(payload) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('ai');
    messageElement.classList.add('ask-question'); // 用于样式控制

    const questionText = document.createElement('p');
    questionText.innerText = `AI 提问：${payload.question}`;
    messageElement.appendChild(questionText);

    const questionActionsDiv = document.createElement('div');
    questionActionsDiv.classList.add('question-actions');

    if (payload.options && payload.options.length > 0) {
        // 如果有选项，渲染按钮
        payload.options.forEach(option => {
            const btn = document.createElement('button');
            btn.innerText = option;
            btn.addEventListener('click', () => {
                // 发送用户选择的选项回主进程
                ipcRenderer.invoke('send-user-response', option, payload.toolCallId);
                // 禁用所有按钮
                Array.from(questionActionsDiv.children).forEach(b => b.disabled = true);
                messageElement.classList.add('responded'); // 标记为已回复
                appendMessage('user', option); // 在聊天中显示用户的回复
            });
            questionActionsDiv.appendChild(btn);
        });
    } else {
        // 如果没有选项，渲染输入框让用户自由回复
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '请输入您的回复...';
        questionActionsDiv.appendChild(input);

        const sendBtn = document.createElement('button');
        sendBtn.innerText = '发送回复';
        sendBtn.addEventListener('click', () => {
            const userResponse = input.value;
            if (userResponse) {
                ipcRenderer.invoke('send-user-response', userResponse, payload.toolCallId);
                input.disabled = true;
                sendBtn.disabled = true;
                messageElement.classList.add('responded'); // 标记为已回复
                appendMessage('user', userResponse); // 在聊天中显示用户的回复
            }
        });
        questionActionsDiv.appendChild(sendBtn);
    }

    messageElement.appendChild(questionActionsDiv);
    chatDisplay.appendChild(messageElement);
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// IPC 监听器：更新小说内容
ipcRenderer.on('update-novel-content', (event, content) => {
    novelContent.value = content;
});

// IPC 监听器：更新当前文件
ipcRenderer.on('update-current-file', (event, filename) => {
    currentFile.innerText = filename;
});

// 辅助函数：渲染单个工具建议卡片（现在用于批处理内部）
function renderToolSuggestionCard(toolData) {
    const messageElement = document.createElement('div');
    console.log('Rendering tool suggestion card for:', toolData.toolName, toolData.toolCallId); // 新增日志
    messageElement.classList.add('ai'); // 样式与 AI 消息一致
    messageElement.classList.add('tool-suggestion'); // 添加额外 class 用于样式控制
    // 为每个工具卡片添加一个唯一的 ID，方便后续查找和更新
    messageElement.id = `tool-suggestion-${toolData.toolCallId}`;

    // 简化 AI 解释
    const explanation = document.createElement('p');
    explanation.innerText = `AI: 需要执行 ${toolData.toolName} 操作。`; // 简化提示
    messageElement.appendChild(explanation);

    // 折叠容器 for 参数
    const detailsElement = document.createElement('details');
    detailsElement.classList.add('tool-params-details'); // 用于样式控制

    const summaryElement = document.createElement('summary');
    summaryElement.classList.add('tool-params-summary'); // 用于样式控制
    summaryElement.innerHTML = `参数详情 <span class="collapse-icon"></span>`; // 添加图标占位符
    detailsElement.appendChild(summaryElement);

    const toolInfoCode = document.createElement('pre'); // 使用 pre 保持格式
    const codeElement = document.createElement('code');
    codeElement.innerText = JSON.stringify(toolData.toolArgs, null, 2); // 格式化 JSON
    toolInfoCode.appendChild(codeElement);
    detailsElement.appendChild(toolInfoCode);

    messageElement.appendChild(detailsElement); // 将折叠容器添加到消息元素

    // 操作按钮
    const actionsDiv = document.createElement('div');
    actionsDiv.classList.add('tool-actions');

    const approveButton = document.createElement('button');
    approveButton.innerText = '批准执行';
    approveButton.classList.add('approve-button'); // 新增类
    approveButton.addEventListener('click', async () => {
        // 调用主进程处理单个工具动作 (批准)
        await ipcRenderer.invoke('process-tool-action', toolData.toolCallId, 'approve');
        // 禁用按钮，避免重复点击
        approveButton.disabled = true;
        rejectButton.disabled = true;
        // 可以在这里更新卡片UI，例如添加“执行中”状态
        messageElement.classList.add('executing');
        messageElement.querySelector('.tool-status-text').innerText = '状态: 执行中...';
        // 渲染进程不需要等待执行结果，main.js 会在执行完毕后通知前端
    });
    actionsDiv.appendChild(approveButton);

    const rejectButton = document.createElement('button');
    rejectButton.innerText = '拒绝';
    rejectButton.classList.add('reject-button'); // 新增类
    rejectButton.addEventListener('click', async () => {
        // 调用主进程处理单个工具动作 (拒绝)
        await ipcRenderer.invoke('process-tool-action', toolData.toolCallId, 'reject');
        // 禁用按钮，避免重复点击
        approveButton.disabled = true;
        rejectButton.disabled = true;
        messageElement.classList.add('rejected');
        messageElement.querySelector('.tool-status-text').innerText = '状态: 已拒绝';
    });
    actionsDiv.appendChild(rejectButton);

    // 新增一个显示状态的文本元素
    const statusText = document.createElement('p');
    statusText.classList.add('tool-status-text');
    statusText.innerText = '状态: 待处理';
    messageElement.appendChild(statusText);

    messageElement.appendChild(actionsDiv);
    return messageElement;
}

// 辅助函数：追加批处理工具建议卡片 (现在是更新预置容器)
function appendBatchToolSuggestions(toolSuggestions) {
    console.log('Inside appendBatchToolSuggestions. Tool suggestions:', toolSuggestions); // 新增日志

    // 确保批量操作按钮在渲染新卡片前是启用的
    batchApproveAllButton.disabled = false;
    batchRejectAllButton.disabled = false;
    
    currentBatchToolSuggestions = toolSuggestions; // 更新全局变量
 
    // 清空 toolCardsWrapper 的内容
    toolCardsWrapper.innerHTML = '';
    
    currentBatchToolSuggestions.forEach(toolData => {
        const card = renderToolSuggestionCard(toolData);
        toolCardsWrapper.appendChild(card);
    });
 
    // 批量操作按钮的事件监听器 (只绑定一次，因为按钮是预置的)
    // 确保事件监听器只绑定一次
    if (!batchApproveAllButton.dataset.listenerAttached) {
        batchApproveAllButton.addEventListener('click', async () => {
            await ipcRenderer.invoke('process-batch-action', 'approve_all');
        });
        batchApproveAllButton.dataset.listenerAttached = true;
    }
 
    if (!batchRejectAllButton.dataset.listenerAttached) {
        batchRejectAllButton.addEventListener('click', async () => {
            await ipcRenderer.invoke('process-batch-action', 'reject_all');
        });
        batchRejectAllButton.dataset.listenerAttached = true;
    }
 
    // 显示容器
    batchToolSuggestionsContainer.style.display = 'block';
    
    // 滚动到最底部
    chatDisplay.scrollTop = chatDisplay.scrollHeight;
}
 
// 新增辅助函数：禁用所有工具操作按钮 (包括单个工具和批量操作按钮)
function disableAllToolActionButtons() {
   const buttons = batchToolSuggestionsContainer.querySelectorAll('.tool-actions button, .batch-actions button');
   buttons.forEach(button => button.disabled = true);
}