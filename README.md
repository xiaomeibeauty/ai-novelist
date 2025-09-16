# 青烛 v1.0.0

[English Version](README_en.md) | 中文版

![项目截图](images/示例图片.png)

------------------------------------------------------------------------------------------------------------------
## 项目介绍

青烛（正式名） 是一个基于 Electron 框架构建的桌面应用程序，旨在为用户提供一个AI辅助小说创作的平台。

**核心功能**:
*   **AI 智能交互**: 与AI进行实时对话，从提供灵感到正文写作，修改润色等，写作全流程的智能辅助。
*   **章节管理**: 用户/AI直观地创建、编辑、删除和组织小说的章节，清晰呈现作品结构。
*   **内容编辑器**: 提供基础的文本编辑界面，支持小说内容的撰写和修改。
*   **文风模仿**: 基于rag技术，分析文本片段并模仿文风。
*   **工具调用**: 支持像vibecoding一样，调用工具解决问题。 

## 技术栈

*   **Electron**: 用于构建跨平台的桌面应用程序，结合了Web技术（HTML、CSS、JavaScript）和原生能力。
*   **React.js**: 前端用户界面框架，提供高效的组件化开发模式和出色的用户体验。
*   **Node.js**: 后端服务运行时环境，负责处理与AI的交互、文件系统操作以及与前端的IPC通信。
*   **AI API集成**: 目前已统一集成DeepSeek-v3和DeepSeek-r1模型API，实验性支持本地Ollama模型（存在较多适配问题）。
*   **ChromaDB**: 开源向量数据库，用于RAG（检索增强生成）功能，提供语义搜索和知识库管理。
*   **Redux**: 前端状态管理库，用于统一管理应用程序的复杂状态。
*   **Tiptap**: 优秀的富文本编辑器。
*   **electron-store**: 轻量级的Electron配置存储库，用于持久化应用程序设置，例如API Key。

------------------------------------------------------------------------------------------------------------------

## 快速开始：本地部署

### 环境条件
#### Windows11操作系统 √
*   Node.js (测试用版本v20.19.4)
*   npm 或 yarn（测试版本11.6.0）
*   Python 3.8+ (测试版本3.12.3)
*   windows_build_tools (实际使用Microsoft Visual C++ Build Tools 2022)
### 安装

1.  **克隆仓库**:
    ```bash
    git clone git@github.com:18643751823/ai-novelist.git
    cd ai-novelist
    ```

2.  **安装Python的包**:
    确保已安装 Python 3.8+，然后安装 ChromaDB:
    ```bash
    pip install chromadb
    ```

3.  **安装项目依赖**:
    在项目根目录 (`ai-novelist/`) 下执行依赖安装
    ```bash
    npm install
    ```
    进入前端目录
    ```bash
    cd frontend/react-app
    ```
    执行依赖安装
    ```bash
    npm install
    ```
4.  **前端和后端的建立**:
   使用提供的 npm 脚本构建项目的后端和前端组件
    ```bash
    npm run build:backend
    npm run build:react
    ```

### 运行应用

**启动 Electron 应用**:
项目根目录 (`ai-novelist/`) 执行：
```bash
npm run start:full .
```


**注意**: 首次运行时，ChromaDB 需要一些时间来初始化数据库。

**配置 API Key**:
应用启动后，您需要在应用的设置界面中输入您的 DeepSeek API Key。此API Key将通过 `electron-store` 进行安全存储。


## 贡献规则
- 所有代码提交必须包含 `Signed-off-by` 行（符合 [DCO](https://developercertificate.org/)）。
- 贡献者确认其代码依据 [MIT 协议](LICENSE) 授权。
- 所有代码必须是原创或兼容 MIT 协议，不可附加额外限制。
- 禁止引入 GPL/AGPL 等非兼容许可证的代码。

我们欢迎并感谢所有贡献者！如果您有任何 Bug 报告、功能建议或希望提交代码，请随时通过 GitHub Issues 或 Pull Requests 与我们联系。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。


---

## 致谢 (Acknowledgements)

本项目的开发在很大程度上借鉴了 `roo-code` 项目。我们对 `roo-code` 的开发者们表示衷心的感谢。

`roo-code` 项目基于 Apache License 2.0 开源。根据其许可证要求，我们在项目中包含了其原始的许可证声明，您可以在 [`LICENSE-roo-code.txt`](./LICENSE-roo-code.txt) 文件中查看。

## Acknowledgements

This project is heavily inspired by and based on the work of the `roo-code` project. We extend our sincere gratitude to the developers of `roo-code`.

The `roo-code` project is licensed under the Apache License, Version 2.0. In compliance with its terms, we have included the original license notice within our project, which can be found in the [`LICENSE-roo-code.txt`](./LICENSE-roo-code.txt) file.
