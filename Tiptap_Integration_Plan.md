# Tiptap 编辑器集成与自定义功能实现计划

## 任务目标

将项目中现有的 Monaco Editor 替换为 Tiptap 编辑器，并实现以下自定义功能：
1.  支持 Markdown 格式渲染。
2.  实现一键将 Markdown 内容转换为普通文本（去除所有 Markdown 格式）。
3.  实现从文件导入内容到 Tiptap 编辑器。

## 计划概览

1.  **环境准备**：
    *   移除 Monaco Editor 相关的依赖。
    *   安装 Tiptap 核心库、`StarterKit` 和必要的 Markdown 扩展。
2.  **代码修改**：
    *   修改 `EditorPanel.js`，将 Monaco Editor 替换为 Tiptap 编辑器。
    *   集成 Markdown 渲染。
    *   实现一键转换纯文本功能。
    *   处理文件内容导入功能。
3.  **功能验证**：
    *   验证 Tiptap 编辑器是否正常显示和工作。
    *   验证 Markdown 渲染和纯文本转换。
    *   验证文件内容导入功能是否正常。

## 详细步骤

### 步骤 1: 环境准备

1.  **移除 Monaco Editor 依赖**
    *   在 `frontend/react-app/package.json` 中删除所有 Monaco Editor 相关的依赖项：
        *   `@monaco-editor/loader`
        *   `@monaco-editor/react`
        *   `monaco-editor`
        *   `monaco-editor-chinese-plugin`
        *   `monaco-editor-nls`
    *   **执行命令**：
        ```bash
        npm uninstall @monaco-editor/loader @monaco-editor/react monaco-editor monaco-editor-chinese-plugin monaco-editor-nls --prefix frontend/react-app
        ```

2.  **安装 Tiptap 依赖**
    *   在 `frontend/react-app/package.json` 中添加以下依赖：
        *   `@tiptap/core`
        *   `@tiptap/starter-kit`
        *   `@tiptap/pm`
        *   `@tiptap/extension-text`
        *   `@tiptap/extension-markdown`
    *   **执行命令**：
        ```bash
        npm install @tiptap/core @tiptap/starter-kit @tiptap/pm @tiptap/extension-text @tiptap/extension-markdown --prefix frontend/react-app
        ```

### 步骤 2: 代码修改

1.  **修改 `frontend/react-app/src/components/EditorPanel.js`**
    *   **移除 Monaco Editor 相关导入**：
        *   删除 `import loader from '@monaco-editor/loader';`
        *   删除 `import * as monaco from 'monaco-editor';`
    *   **添加 Tiptap 核心库和扩展相关导入**：
        ```javascript
        import { Editor } from '@tiptap/core';
        import StarterKit from '@tiptap/starter-kit';
        import Text from '@tiptap/extension-text';
        import { Markdown } from '@tiptap/extension-markdown';
        ```
    *   **手动初始化 Tiptap 编辑器实例**：
        *   保留 `monacoEl` 的 `useRef`，它将用于 Tiptap 编辑器的 DOM 容器。
        *   在 `useEffect` 中，删除 Monaco Editor 的初始化代码。
        *   使用 `new Editor({})` 创建 Tiptap 实例，并将其绑定到 `monacoEl.current`。
        *   在 `extensions` 中包含 `StarterKit`、`Text` 和 `Markdown`。
        *   设置 `onUpdate` 回调，将 `editor.getHTML()` 或 `editor.getText()` 的内容 dispatch 到 Redux store。
        *   确保在组件卸载时销毁 Tiptap 实例。
    *   **实现一键转换纯文本功能**：
        *   可以在 `EditorPanel` 组件中添加一个按钮。当用户点击该按钮时，调用 Tiptap 实例的 `editor.getText()` 方法来获取纯文本内容。获取到的纯文本可以显示在界面上或复制到剪贴板。
    *   **更新编辑器内容处理**：当 `novelContent` 从 Redux store 更新时，通过 Tiptap 实例的 `setContent` 方法更新内容。

### 步骤 3: 功能验证

1.  **启动应用**：
    *   **执行命令**：
        ```bash
        npm run electron-dev --prefix frontend/react-app
        ```
2.  **检查 Tiptap 编辑器**是否正确渲染和工作，并测试 Markdown 输入和渲染效果。
3.  **验证文件内容导入**功能：确认通过 Redux store 传递的 `novelContent` 能够正确显示在 Tiptap 编辑器中。
4.  **测试一键转换纯文本功能**：确认按钮点击后能够正确提取纯文本内容。

## Mermaid 图示

```mermaid
graph TD
    A[用户任务: Tiptap集成与自定义功能] --> B{环境准备};
    B --> B1[移除Monaco依赖];
    B --> B2[安装Tiptap核心库、StarterKit、Text、Markdown扩展];
    B1 --> C{代码修改: EditorPanel.js};
    B2 --> C;
    C --> C1[移除Monaco导入和逻辑];
    C --> C2[添加Tiptap核心库及所需扩展导入];
    C --> C3[手动初始化Tiptap Editor实例，配置Markdown扩展];
    C --> C4[更新内容处理，支持html/text获取];
    C --> C5[添加一键转换纯文本功能];
    C5 --> D[功能验证];
    D --> D1[启动应用];
    D --> D2[验证Tiptap编辑器基本功能及Markdown渲染];
    D --> D3[验证文件导入功能];
    D --> D4[测试一键转换纯文本功能];