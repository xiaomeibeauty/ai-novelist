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
Object.defineProperty(exports, "__esModule", { value: true });
exports.NovelArchiveService = void 0;
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
class NovelArchiveService {
    constructor(archivesDir, workspaceDir, log = console.log) {
        this.archivesDir = archivesDir;
        this.workspaceDir = workspaceDir;
        this.log = log;
    }
    async init() {
        await fs.mkdir(this.archivesDir, { recursive: true });
        this.log(`[NovelArchiveService] Initialized. Archives directory: ${this.archivesDir}`);
    }
    async createNovelArchive(message) {
        // 1. 生成一个基于时间戳的唯一ID和文件夹名
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Sanitize the message to remove characters that are invalid in filenames
        const sanitizedMessage = message.replace(/[<>:"/\\|?*\s]/g, '_');
        const archiveId = `${timestamp}_${sanitizedMessage}`;
        const archivePath = path.join(this.archivesDir, archiveId);
        // 2. 在 archivesDir 中创建这个新文件夹
        await fs.mkdir(archivePath, { recursive: true });
        // 3. 将 workspaceDir 的内容完整复制到新文件夹中
        await fs.cp(this.workspaceDir, archivePath, { recursive: true });
        const newArchive = {
            id: archiveId,
            message: message,
            path: archivePath,
        };
        this.log(`[NovelArchiveService] Created new archive: ${archiveId}`);
        return newArchive;
    }
    async restoreNovelArchive(archiveId) {
        // 1. 根据 archiveId 找到存档文件夹的路径
        const archivePath = path.join(this.archivesDir, archiveId);
        if (!await fs.stat(archivePath).then(s => s.isDirectory()).catch(() => false)) {
            throw new Error(`Archive with ID "${archiveId}" not found.`);
        }
        // 2. 清空 workspaceDir
        await fs.rm(this.workspaceDir, { recursive: true, force: true });
        await fs.mkdir(this.workspaceDir, { recursive: true });
        // 3. 将存档文件夹的内容复制回 workspaceDir
        await fs.cp(archivePath, this.workspaceDir, { recursive: true });
        this.log(`[NovelArchiveService] Restored workspace from archive: ${archiveId}`);
    }
    async listNovelArchives() {
        // 1. 读取 archivesDir 下的所有子文件夹
        const entries = await fs.readdir(this.archivesDir, { withFileTypes: true });
        const archiveFolders = entries.filter(e => e.isDirectory());
        const archives = archiveFolders.map(folder => {
            const [timestamp, ...messageParts] = folder.name.split('_');
            return {
                id: folder.name,
                message: messageParts.join(' ').replace(/_/g, ' '),
                path: path.join(this.archivesDir, folder.name),
            };
        });
        // 按时间戳降序排序
        return archives.sort((a, b) => b.id.localeCompare(a.id));
    }
    async deleteNovelArchive(archiveId) {
        const archivePath = path.join(this.archivesDir, archiveId);
        if (!await fs.stat(archivePath).then(s => s.isDirectory()).catch(() => false)) {
            throw new Error(`Archive with ID "${archiveId}" not found for deletion.`);
        }
        await fs.rm(archivePath, { recursive: true, force: true });
        this.log(`[NovelArchiveService] Deleted archive: ${archiveId}`);
    }
}
exports.NovelArchiveService = NovelArchiveService;
