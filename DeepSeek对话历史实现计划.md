# DeepSeek对话历史功能实现计划

## 目标
我们需要在这个项目中的“deepseek板块”增加对话历史功能，我们需要记录用户与ai的对话，并且保存在本地，以及需要对应的面板来显示历史对话，方便用户调出并加载到聊天窗口继续对话。   ---   这是我对前端ui的详细构想：历史对话主要集中在聊天窗口的上端，显示一个时钟图案的按钮，点击可以自上而下出现列表（占据右侧聊天窗口），支持滚动。用户点击这些列表所在条状框，则加载历史内容到聊天框，并收起历史记录列表。1. 前端ui中，历史记录列表显示ID为每个会话的前十个字，方便用户辨识。2. 后端存储历史对话在一个文件，方便解析后加载，渲染在前端的界面。3. 可以增加一个清理历史记录的按钮，点击则显现历史列表，并且每个ID后面有一个“×”符号，点击可以删除历史对话。其他没有进一步要求了

在“DeepSeek板块”增加对话历史功能，包括记录用户与AI的对话并保存在本地，提供面板显示历史对话，方便用户调出并加载到聊天窗口继续对话，并支持历史记录的删除。

## 详细计划

### 阶段一：后端消息存储实现（修改）

1.  **修改 `backend/utils/logger.js`**：
    *   取消之前 `DeepSeek消息存储实现计划.md` 中 `logDeepSeekRequest` 和 `logDeepSeekResponse` 分别记录request和response的逻辑。
    *   新增一个 `logDeepSeekConversation` 函数，接收 `sessionId` 和包含完整对话内容（用户消息和AI响应）的JSON对象。
    *   这个函数负责将完整的对话内容追加到一个统一的历史记录文件中（例如 `logs/deepseek/history.json`）。如果文件不存在则创建，如果存在则读取现有内容，添加新会话，然后写回文件。
    *   需要定义一个新的常量 `deepseekHistoryFilePath`。

2.  **修改 `backend/engine/api/deepseek.js`**：
    *   在 `chatWithDeepSeek` 函数中，生成 `sessionId` 的逻辑不变。
    *   在获取到AI响应后，构建一个包含用户消息和AI响应的完整会话对象。
    *   调用 `logger.logDeepSeekConversation(sessionId, conversationObject)` 来保存这个完整的会话。

### 阶段二：后端历史对话读取与删除接口实现（修改与新增）

1.  **修改 `backend/engine/ipc/handlers.js` 或新建文件添加新的IPC处理函数**：
    *   **修改 `getDeepSeekChatHistory` 函数**：
        *   不再读取多个JSON文件，而是读取 `logs/deepseek/history.json` 文件。
        *   解析该JSON文件，返回其中所有的会话记录。
    *   **新增 `deleteDeepSeekChatHistory` 函数**：
        *   接收 `sessionId` 作为参数。
        *   读取 `logs/deepseek/history.json` 文件，找到对应的 `sessionId` 的会话，从数组中删除该会话。
        *   将更新后的JSON数组写回 `logs/deepseek/history.json`。

### 阶段三：前端UI与逻辑实现（修改）

1.  **设计并实现 `ChatHistoryPanel` React组件**：
    *   用于显示历史对话列表。
    *   列表项显示每个会话的第一个用户消息的前十个字作为标识。
    *   每个列表项旁边增加一个“×”按钮，用于删除该条历史记录。
    *   “×”按钮的点击事件会触发一个IPC调用，通知后端删除对应的历史记录，并更新前端显示。

2.  **修改 `frontend/react-app/src/components/ChatPanel.js`**：
    *   在聊天窗口上端，添加一个时钟图标按钮。
    *   在时钟图标按钮旁边，增加一个“清理历史记录”按钮。
    *   点击时钟图标按钮时，显示 `ChatHistoryPanel`，但“×”按钮不可见。
    *   “清理历史记录”按钮的点击事件：
        *   显示 `ChatHistoryPanel`。
        *   使每个历史记录列表项旁边的“×”按钮可见。
    *   `ChatHistoryPanel` 与 `ChatPanel` 之间通过 props 或 Redux 进行数据交互：
        *   `ChatPanel` 传递 `toggleHistoryPanel` 函数给 `ChatHistoryPanel`。
        *   `ChatHistoryPanel` 传递加载历史对话的事件给 `ChatPanel`。
        *   `ChatHistoryPanel` 传递删除历史对话的事件给 `ChatPanel` (或直接通过IPC调用)。

3.  **状态管理更新**：
    *   在 `frontend/react-app/src/store/slices/chatSlice.js` 或新建一个Redux slice（例如 `historySlice.js`）中：
        *   管理历史对话列表的可见性状态（例如 `isHistoryPanelVisible`）。
        *   管理“×”按钮的可见性状态（例如 `isDeleteMode`）。
        *   管理加载的历史对话数据（例如 `deepSeekHistory`）。
        *   添加对应的reducer和action。

4.  **`frontend/react-app/src/hooks/useIpcRenderer.js`**：
    *   添加 `invoke` 方法，用于调用后端 `getDeepSeekChatHistory` 和 `deleteDeepSeekChatHistory` IPC接口。

## Mermaid流程图

```mermaid
graph TD
    A[用户] --> B{点击时钟按钮};
    A --> C{点击清理历史按钮};

    B --> D[ChatPanel组件 - 显示历史列表];
    C --> D;
    C -- 激活删除模式 --> D;

    D -- 控制可见性 --> E[ChatHistoryPanel组件];
    E -- 请求历史对话 --> F[useIpcRenderer Hook];
    F -- 调用 getDeepSeekChatHistory IPC --> G[后端主进程 (IPC Handlers)];
    G -- 读取 logs/deepseek/history.json --> H[文件系统];
    H -- 返回历史对话数据 --> G;
    G -- 返回历史对话数据 --> F;
    F -- 更新 Redux store --> I[Redux Store (chatSlice/historySlice)];
    I -- 数据流向 --> E;
    E --> J[渲染历史对话列表 (显示前十个字)];

    J --> K{用户点击列表项};
    K -- 触发加载事件 --> E;
    E -- 更新 Redux store --> I;
    I -- 数据流向 --> D;
    D -- 加载到聊天输入框 --> L[聊天输入框];
    L --> E -- 隐藏 --> M[ChatHistoryPanel组件];

    J --> N{用户点击"×"按钮 (删除模式下)};
    N -- 调用 deleteDeepSeekChatHistory IPC --> G;
    G -- 删除 logs/deepseek/history.json 中的记录 --> H;
    H -- 返回删除结果 --> G;
    G -- 返回删除结果 --> F;
    F -- 更新 Redux store --> I;
    I -- 重新渲染列表 --> E;


    subgraph 后端消息存储 (修改)
        O[DeepSeek消息发送/接收] --> P[backend/engine/api/deepseek.js];
        P -- 调用 logger.js --> Q[backend/utils/logger.js];
        Q -- 追加到 logs/deepseek/history.json --> H;
    end