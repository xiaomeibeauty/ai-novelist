"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ShadowCheckpointService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path = __importStar(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const events_1 = __importDefault(require("events"));
const simple_git_1 = __importDefault(require("simple-git"));
const fs_1 = require("../utils/fs");
const ripgrep_1 = require("../services/ripgrep");
const constants_1 = require("./constants");
const excludes_1 = require("./excludes");
class ShadowCheckpointService extends events_1.default {
    get baseHash() {
        return this._baseHash;
    }
    set baseHash(value) {
        this._baseHash = value;
    }
    get isInitialized() {
        return !!this.git;
    }
    constructor(taskId, checkpointsDir, workspaceDir, log) {
        super();
        this._checkpoints = [];
        // The `log` parameter is now optional and deprecated, as we use electron-log via console.
        if (log) {
            console.warn("[ShadowCheckpointService] The `log` parameter in the constructor is deprecated.");
        }
        const homedir = os_1.default.homedir();
        const desktopPath = path.join(homedir, "Desktop");
        const documentsPath = path.join(homedir, "Documents");
        const downloadsPath = path.join(homedir, "Downloads");
        const protectedPaths = [homedir, desktopPath, documentsPath, downloadsPath];
        if (protectedPaths.includes(workspaceDir)) {
            throw new Error(`Cannot use checkpoints in ${workspaceDir}`);
        }
        this.taskId = taskId;
        this.checkpointsDir = checkpointsDir;
        this.workspaceDir = workspaceDir;
        this.dotGitDir = path.join(this.checkpointsDir, ".git");
    }
    async initShadowGit(onInit) {
        if (this.git) {
            throw new Error("Shadow git repo already initialized");
        }
        await promises_1.default.mkdir(this.checkpointsDir, { recursive: true });
        const git = (0, simple_git_1.default)(this.checkpointsDir);
        const gitVersion = await git.version();
        console.log(`[${this.constructor.name}#create] git = ${gitVersion}`);
        let created = false;
        const startTime = Date.now();
        if (await (0, fs_1.fileExistsAtPath)(this.dotGitDir)) {
            console.log(`[${this.constructor.name}#initShadowGit] shadow git repo already exists at ${this.dotGitDir}`);
            const worktree = await this.getShadowGitConfigWorktree(git);
            if (worktree && worktree !== this.workspaceDir) {
                console.warn(`[ShadowCheckpointService] Workspace directory has changed. Updating from "${worktree}" to "${this.workspaceDir}".`);
                await git.addConfig("core.worktree", this.workspaceDir);
            }
            await this.writeExcludeFile();
            this.baseHash = await git.revparse(["HEAD"]);
        }
        else {
            console.log(`[${this.constructor.name}#initShadowGit] creating shadow git repo at ${this.checkpointsDir}`);
            await git.init();
            await git.addConfig("core.worktree", this.workspaceDir); // Sets the working tree to the current workspace.
            await git.addConfig("commit.gpgSign", "false"); // Disable commit signing for shadow repo.
            await git.addConfig("user.name", "Roo Code");
            await git.addConfig("user.email", "noreply@example.com");
            await this.writeExcludeFile();
            await this.stageAll(git); // <-- This is now desired behavior based on user feedback.
            const { commit } = await git.commit("initial commit", { "--allow-empty": null });
            this.baseHash = commit;
            created = true;
        }
        const duration = Date.now() - startTime;
        console.log(`[${this.constructor.name}#initShadowGit] initialized shadow repo with base commit ${this.baseHash} in ${duration}ms`);
        this.git = git;
        await onInit?.();
        this.emit("initialize", {
            type: "initialize",
            workspaceDir: this.workspaceDir,
            baseHash: this.baseHash,
            created,
            duration,
        });
        return { created, duration };
    }
    // Add basic excludes directly in git config, while respecting any
    // .gitignore in the workspace.
    // .git/info/exclude is local to the shadow git repo, so it's not
    // shared with the main repo - and won't conflict with user's
    // .gitignore.
    async writeExcludeFile() {
        await promises_1.default.mkdir(path.join(this.dotGitDir, "info"), { recursive: true });
        const patterns = await (0, excludes_1.getExcludePatterns)(this.workspaceDir);
        await promises_1.default.writeFile(path.join(this.dotGitDir, "info", "exclude"), patterns.join("\n"));
    }
    async stageAll(git) {
        await this.renameNestedGitRepos(true);
        try {
            await git.add(".");
        }
        catch (error) {
            console.error(`[${this.constructor.name}#stageAll] failed to add files to git:`, error);
        }
        finally {
            await this.renameNestedGitRepos(false);
        }
    }
    // Since we use git to track checkpoints, we need to temporarily disable
    // nested git repos to work around git's requirement of using submodules for
    // nested repos.
    async renameNestedGitRepos(disable) {
        try {
            // Find all .git directories that are not at the root level.
            const gitDir = ".git" + (disable ? "" : constants_1.GIT_DISABLED_SUFFIX);
            const args = ["--files", "--hidden", "--follow", "-g", `**/${gitDir}/HEAD`, this.workspaceDir];
            const gitPaths = await (await (0, ripgrep_1.executeRipgrep)({ args, workspacePath: this.workspaceDir })).filter(({ type, path }) => type === "folder" && path.includes(".git") && !path.startsWith(".git"));
            if (!gitPaths || gitPaths.length === 0) {
                console.log(`[${this.constructor.name}#renameNestedGitRepos] no nested git repos found or ripgrep failed. Skipping.`);
                return;
            }
            // For each nested .git directory, rename it based on operation.
            for (const gitPath of gitPaths) {
                if (gitPath.path.startsWith(".git")) {
                    continue;
                }
                const currentPath = path.join(this.workspaceDir, gitPath.path);
                let newPath;
                if (disable) {
                    newPath = !currentPath.endsWith(constants_1.GIT_DISABLED_SUFFIX)
                        ? currentPath + constants_1.GIT_DISABLED_SUFFIX
                        : currentPath;
                }
                else {
                    newPath = currentPath.endsWith(constants_1.GIT_DISABLED_SUFFIX)
                        ? currentPath.slice(0, -constants_1.GIT_DISABLED_SUFFIX.length)
                        : currentPath;
                }
                if (currentPath === newPath) {
                    continue;
                }
                try {
                    await promises_1.default.rename(currentPath, newPath);
                    console.log(`[${this.constructor.name}#renameNestedGitRepos] ${disable ? "disabled" : "enabled"} nested git repo ${currentPath}`);
                }
                catch (error) {
                    console.error(`[${this.constructor.name}#renameNestedGitRepos] failed to ${disable ? "disable" : "enable"} nested git repo ${currentPath}:`, error);
                }
            }
        }
        catch (error) {
            console.error(`[${this.constructor.name}#renameNestedGitRepos] failed to ${disable ? "disable" : "enable"} nested git repos:`, error);
        }
    }
    async getShadowGitConfigWorktree(git) {
        if (!this.shadowGitConfigWorktree) {
            try {
                this.shadowGitConfigWorktree = (await git.getConfig("core.worktree")).value || undefined;
            }
            catch (error) {
                console.error(`[${this.constructor.name}#getShadowGitConfigWorktree] failed to get core.worktree:`, error);
            }
        }
        return this.shadowGitConfigWorktree;
    }
    async saveCheckpoint(message) {
        try {
            console.log(`[${this.constructor.name}#saveCheckpoint] starting checkpoint save`);
            if (!this.git) {
                throw new Error("Shadow git repo not initialized");
            }
            const startTime = Date.now();
            await this.stageAll(this.git);
            const result = await this.git.commit(message);
            const isFirst = this._checkpoints.length === 0;
            const fromHash = this._checkpoints[this._checkpoints.length - 1] ?? this.baseHash;
            const toHash = result.commit || fromHash;
            this._checkpoints.push(toHash);
            const duration = Date.now() - startTime;
            if (isFirst || result.commit) {
                this.emit("checkpoint", { type: "checkpoint", isFirst, fromHash, toHash, duration });
            }
            if (result.commit) {
                console.log(`[${this.constructor.name}#saveCheckpoint] checkpoint saved in ${duration}ms -> ${result.commit}`);
                // 修正：返回一个标准的 CheckpointResult 对象
                // 修正：返回一个兼容 CheckpointResult 的对象
                // CommitResult 对象本身就包含了 commit 字段，可以直接返回
                return result;
            }
            else {
                console.log(`[${this.constructor.name}#saveCheckpoint] found no changes to commit in ${duration}ms`);
                return undefined;
            }
        }
        catch (error) {
            console.error(`[${this.constructor.name}#saveCheckpoint] failed to create checkpoint:`, error);
            this.emit("error", { type: "error", error: error });
            throw error;
        }
    }
    async restoreCheckpoint(commitHash) {
        try {
            console.log(`[${this.constructor.name}#restoreCheckpoint] starting checkpoint restore`);
            if (!this.git) {
                throw new Error("Shadow git repo not initialized");
            }
            const start = Date.now();
            // Per user request, perform a hard reset.
            // The frontend is now responsible for warning the user about data loss.
            await this.git.clean("f", ["-d", "-f"]);
            await this.git.reset(["--hard", commitHash]);
            const duration = Date.now() - start;
            this.emit("restore", { type: "restore", commitHash, duration });
            console.log(`[${this.constructor.name}#restoreCheckpoint] restored checkpoint ${commitHash} in ${duration}ms`);
            return { success: true, commitHash };
        }
        catch (error) {
            console.error(`[${this.constructor.name}#restoreCheckpoint] failed to restore checkpoint:`, error);
            this.emit("error", { type: "error", error: error });
            throw error;
        }
    }
    async getDiff({ from, to }) {
        if (!this.git) {
            throw new Error("Shadow git repo not initialized");
        }
        const result = [];
        if (!from) {
            from = (await this.git.raw(["rev-list", "--max-parents=0", "HEAD"])).trim();
        }
        // Stage all changes so that untracked files appear in diff summary.
        await this.stageAll(this.git);
        console.log(`[${this.constructor.name}#getDiff] diffing ${to ? `${from}..${to}` : `${from}..HEAD`}`);
        const { files } = to ? await this.git.diffSummary([`${from}..${to}`]) : await this.git.diffSummary([from]);
        const cwdPath = (await this.getShadowGitConfigWorktree(this.git)) || this.workspaceDir || "";
        for (const file of files) {
            const relPath = file.file;
            const absPath = path.join(cwdPath, relPath);
            const before = await this.git.show([`${from}:${relPath}`]).catch(() => "");
            const after = to
                ? await this.git.show([`${to}:${relPath}`]).catch(() => "")
                : await promises_1.default.readFile(absPath, "utf8").catch(() => "");
            result.push({ paths: { relative: relPath, absolute: absPath }, content: { before, after } });
        }
        return result;
    }
    async getHistory() {
        if (!this.git) {
            throw new Error("Shadow git repo not initialized");
        }
        return await this.git.log();
    }
    /**
        * EventEmitter
     */
    emit(event, data) {
        return super.emit(event, data);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
    once(event, listener) {
        return super.once(event, listener);
    }
    /**
     * Storage
     */
    static hashWorkspaceDir(workspaceDir) {
        return crypto_1.default.createHash("sha256").update(workspaceDir).digest("hex").toString().slice(0, 8);
    }
    static taskRepoDir({ taskId, globalStorageDir }) {
        return path.join(globalStorageDir, "tasks", taskId, "checkpoints");
    }
    static workspaceRepoDir({ globalStorageDir, workspaceDir, }) {
        return path.join(globalStorageDir, "checkpoints", this.hashWorkspaceDir(workspaceDir));
    }
    static async deleteTask({ taskId, globalStorageDir, workspaceDir, }) {
        const workspaceRepoDir = this.workspaceRepoDir({ globalStorageDir, workspaceDir });
        const branchName = `roo-${taskId}`;
        const git = (0, simple_git_1.default)(workspaceRepoDir);
        const success = await this.deleteBranch(git, branchName);
        if (success) {
            console.log(`[${this.name}#deleteTask.${taskId}] deleted branch ${branchName}`);
        }
        else {
            console.error(`[${this.name}#deleteTask.${taskId}] failed to delete branch ${branchName}`);
        }
    }
    static async deleteBranch(git, branchName) {
        const branches = await git.branchLocal();
        if (!branches.all.includes(branchName)) {
            console.error(`[${this.constructor.name}#deleteBranch] branch ${branchName} does not exist`);
            return false;
        }
        const currentBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
        if (currentBranch === branchName) {
            const worktree = await git.getConfig("core.worktree");
            try {
                await git.raw(["config", "--unset", "core.worktree"]);
                await git.reset(["--hard"]);
                await git.clean("f", ["-d"]);
                const defaultBranch = branches.all.includes("main") ? "main" : "master";
                await git.checkout([defaultBranch, "--force"]);
                const { default: pWaitFor } = await Promise.resolve().then(() => __importStar(require("p-wait-for")));
                await pWaitFor(async () => {
                    const newBranch = await git.revparse(["--abbrev-ref", "HEAD"]);
                    return newBranch === defaultBranch;
                }, { interval: 500, timeout: 2000 });
                await git.branch(["-D", branchName]);
                return true;
            }
            catch (error) {
                console.error(`[${this.constructor.name}#deleteBranch] failed to delete branch ${branchName}: ${error instanceof Error ? error.message : String(error)}`);
                return false;
            }
            finally {
                if (worktree.value) {
                    await git.addConfig("core.worktree", worktree.value);
                }
            }
        }
        else {
            await git.branch(["-D", branchName]);
            return true;
        }
    }
}
exports.ShadowCheckpointService = ShadowCheckpointService;
