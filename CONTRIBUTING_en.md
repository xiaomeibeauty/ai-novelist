# Contribution Guide

[中文版](CONTRIBUTING.md) | English Version

We warmly welcome and thank you for your contributions to the AI Novelist MVP project! Please read this guide carefully before submitting your contributions.

## Code of Conduct

We are committed to creating an open and inclusive community. Please read our Code of Conduct (to be supplemented) to understand our expectations for all contributors.

## How to Contribute

### 1. Report Bugs

If you find any bugs, please submit a bug report in GitHub Issues. Please provide as much detail as possible, including:
*   Steps to reproduce
*   Expected behavior
*   Actual behavior
*   Error messages (if any)
*   Your operating system and environment information

### 2. Submit Feature Requests

If you have new feature suggestions, please also submit a feature request in GitHub Issues. Please describe your ideas in detail and how they will improve the project.

### 3. Submit Code

We welcome code contributions! Please follow these steps:

1.  **Fork the Repository**: Fork this project repository to your own GitHub account.
2.  **Clone the Repository**: Clone your forked repository to your local machine.
    ```bash
    git clone git@github.com:18643751823/ai-novelist.git
    cd ai-novel
    ```
3.  **Create a Branch**: Create a new branch for your feature or bug fix.
    ```bash
    git checkout -b feature/your-feature-name
    ```
4.  **Make Changes**: Write your code and test it.
5.  **Commit Changes and Sign DCO**:
    This project adopts the **Developer Certificate of Origin (DCO)**. All contributions must be accompanied by a `Signed-off-by` line in the commit message to certify that you agree to the DCO. This indicates that you have the right to submit your contribution and agree that your contribution will be released under the project's open-source license.

    You can use the `-s` or `--signoff` option to sign off your commit:
    ```bash
    git commit -s -m "feat: Add your feature"
    ```
    Your commit message will include something like:
    ```
    Your commit message

    Signed-off-by: Your Name <your.email@example.com>
    ```
    Please ensure that `Your Name` and `your.email@example.com` match your Git configuration and actual information.

    To ensure the legal clarity and maintainability of the project, please note:

    *   **License Compatibility**: All submitted code must be original or explicitly compatible with the [MIT License](LICENSE). **Strictly prohibit the introduction of any GPL, AGPL, or other Copyleft licensed code**, as these licenses may "infect" and force the entire project to be open source.

6.  **Push Branch**: Push your changes to your forked repository.
    ```bash
    git push origin feature/your-feature-name
    ```
7.  **Create a Pull Request**: Create a Pull Request on GitHub, from your forked branch to the main branch of this project. Please describe your changes in detail.

## License

This project uses the [MIT License](LICENSE).

## CLA Policy (Future Consideration)

Currently, this project does not mandate contributors to sign a CLA (Contributor License Agreement). All contributions will be protected under the MIT License.

However, if the project receives commercial investment or requires more stringent intellectual property management in the future, we may consider introducing a CLA. At that time, all new contributions will require signing a CLA. Before introducing a CLA, we will publish notices in this guide and on the project homepage, and provide detailed signing procedures. For existing non-CLA contributions, we will properly handle intellectual property ownership issues under the guidance of legal counsel.