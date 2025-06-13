# 贡献指南

[English Version](CONTRIBUTING_en.md) | 中文版

我们非常欢迎并感谢您对 AI小说家 MVP 项目的贡献！请在提交您的贡献之前，仔细阅读本指南。

## 行为准则

我们致力于创建一个开放和包容的社区。请阅读我们的行为准则（待补充），以了解我们对所有贡献者的期望。

## 如何贡献

### 1. 报告 Bug

如果您发现任何 Bug，请在 GitHub Issues 中提交一个 Bug 报告。请提供尽可能详细的信息，包括：
*   重现步骤
*   预期行为
*   实际行为
*   错误信息（如果有）
*   您的操作系统和环境信息

### 2. 提交功能请求

如果您有新的功能建议，也请在 GitHub Issues 中提交一个功能请求。请详细描述您的想法，以及它将如何改进项目。

### 3. 提交代码

我们欢迎代码贡献！请遵循以下步骤：

1.  **Fork 仓库**: 将本项目仓库 Fork 到您自己的 GitHub 账户。
2.  **克隆仓库**: 将您 Fork 的仓库克隆到本地。
    ```bash
    git clone git@github.com:18643751823/ai-novelist.git
    cd ai-novel
    ```
3.  **创建分支**: 为您的功能或 Bug 修复创建一个新的分支。
    ```bash
    git checkout -b feature/your-feature-name
    ```
4.  **进行更改**: 编写您的代码，并进行测试。
5.  **提交更改并签署 DCO**:
    本项目采用 **开发者原创证书 (Developer Certificate of Origin - DCO)**。所有贡献都必须通过在提交信息中添加 `Signed-off-by` 行来证明您同意 DCO。这表明您有权提交您的贡献，并同意您的贡献在项目的开源许可证下发布。

    您可以使用 `-s` 或 `--signoff` 选项来签署您的提交：
    ```bash
    git commit -s -m "feat: Add your feature"
    ```
    您的提交信息将包含类似以下内容：
    ```
    Your commit message

    Signed-off-by: Your Name <your.email@example.com>
    ```
    请确保 `Your Name` 和 `your.email@example.com` 与您的 Git 配置和实际信息一致。

    ### 许可证要求与自动化检查

    为确保项目的法律清晰性和可维护性，请注意以下几点：

    *   **许可证兼容性**: 所有提交的代码都必须是原创或明确兼容 [MIT 协议](LICENSE) 的。**严禁引入任何 GPL、AGPL 或其他 Copyleft 协议的代码**，这些协议可能会“传染”并强制整个项目开源。
    *   **DCO 强制执行**: 我们使用自动化工具强制要求每个提交都包含 `Signed-off-by` 行。如果您的提交未能通过 DCO 检查，请根据错误提示修正。
    *   **许可证扫描**: 项目集成了许可证扫描工具，用于检测第三方依赖的许可证合规性。请在引入新的第三方库之前，务必检查其许可证是否兼容 MIT 协议。

6.  **推送分支**: 将您的更改推送到您 Fork 的仓库。
    ```bash
    git push origin feature/your-feature-name
    ```
7.  **创建 Pull Request**: 在 GitHub 上创建一个 Pull Request，从您的 Fork 分支到本项目的主分支。请详细描述您的更改内容。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。

## CLA 政策（未来考虑）

目前，本项目不强制要求贡献者签署 CLA (贡献者许可协议)。所有贡献都将受到 MIT 许可证的保护。

然而，如果项目未来获得商业投资或需要更严格的知识产权管理，我们可能会考虑引入 CLA。届时，所有新的贡献将需要签署 CLA。我们将在引入 CLA 之前，在本指南和项目主页上发布通知，并提供详细的签署流程。对于已有的非 CLA 贡献，我们会在法律顾问的指导下，妥善处理知识产权归属问题。