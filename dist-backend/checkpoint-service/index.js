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
exports.initializeTaskCheckpoint = exports.saveShadowCheckpoint = exports.restoreCheckpoint = exports.getDiff = exports.getHistory = exports.deleteNovelArchive = exports.restoreNovelArchive = exports.saveArchive = void 0;
const path = __importStar(require("path"));
const RepoPerTaskCheckpointService_1 = require("./RepoPerTaskCheckpointService");
const NovelArchiveService_1 = require("./NovelArchiveService");
// Caches for service instances per task
const novelArchiveServices = new Map();
const chatHistoryServices = new Map();
function getNovelArchiveService(taskId, workspaceDir, shadowDir) {
    if (novelArchiveServices.has(taskId)) {
        return novelArchiveServices.get(taskId);
    }
    const novelWorkspace = workspaceDir; // workspaceDir is already the correct path to the novel files
    const archivesDir = path.join(shadowDir, 'tasks', taskId, 'novel-archives');
    const service = new NovelArchiveService_1.NovelArchiveService(archivesDir, novelWorkspace, (message) => console.log(`[NovelArchiveService][${taskId}] ${message}`));
    service.init().catch(error => {
        console.error(`[NovelArchiveService][${taskId}] Failed to initialize:`, error);
        novelArchiveServices.delete(taskId);
    });
    novelArchiveServices.set(taskId, service);
    return service;
}
function getChatHistoryService(taskId, workspaceDir, shadowDir) {
    if (chatHistoryServices.has(taskId)) {
        return chatHistoryServices.get(taskId);
    }
    const options = {
        taskId,
        workspaceDir,
        shadowDir,
        log: (message) => console.log(`[ChatHistoryService][${taskId}] ${message}`),
    };
    const service = RepoPerTaskCheckpointService_1.RepoPerTaskCheckpointService.create(options);
    chatHistoryServices.set(taskId, service);
    service.initShadowGit().catch((error) => {
        console.error(`[ChatHistoryService][${taskId}] Failed to initialize shadow git:`, error);
        chatHistoryServices.delete(taskId);
    });
    return service;
}
async function saveArchive(taskId, workspaceDir, shadowDir, message) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    if (!chatService.isInitialized) {
        await new Promise((resolve) => chatService.once("initialize", () => resolve()));
    }
    // Perform both archiving operations
    const novelPromise = novelService.createNovelArchive(message);
    const chatPromise = chatService.saveCheckpoint(message);
    // We can run them in parallel
    await Promise.all([novelPromise, chatPromise]);
}
exports.saveArchive = saveArchive;
async function restoreNovelArchive(taskId, workspaceDir, shadowDir, archiveId) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    return await novelService.restoreNovelArchive(archiveId);
}
exports.restoreNovelArchive = restoreNovelArchive;
async function deleteNovelArchive(taskId, workspaceDir, shadowDir, archiveId) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    return await novelService.deleteNovelArchive(archiveId);
}
exports.deleteNovelArchive = deleteNovelArchive;
// This function now specifically gets the novel archives for the UI.
async function getHistory(taskId, workspaceDir, shadowDir) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    return await novelService.listNovelArchives();
}
exports.getHistory = getHistory;
// The diff function is likely tied to Git, so we leave it for chat history for now,
// or decide on a new folder-diffing strategy later.
async function getDiff(taskId, workspaceDir, shadowDir, from, to) {
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    if (!chatService.isInitialized) {
        await new Promise((resolve) => chatService.once("initialize", () => resolve()));
    }
    return await chatService.getDiff({ from, to });
}
exports.getDiff = getDiff;
async function restoreCheckpoint(taskId, workspaceDir, shadowDir, commitHash) {
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    if (!chatService.isInitialized) {
        await new Promise((resolve) => chatService.once("initialize", () => resolve()));
    }
    return await chatService.restoreCheckpoint(commitHash);
}
exports.restoreCheckpoint = restoreCheckpoint;
async function saveShadowCheckpoint(taskId, workspaceDir, shadowDir, message) {
    // Initialization is now handled at the beginning of the task.
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    // Directly call saveCheckpoint, assuming service is already initialized.
    return await chatService.saveCheckpoint(message);
}
exports.saveShadowCheckpoint = saveShadowCheckpoint;
async function initializeTaskCheckpoint(taskId, workspaceDir, shadowDir) {
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    if (!chatService.isInitialized) {
        // Wait for the async initialization to complete
        await new Promise((resolve, reject) => {
            chatService.once("initialize", () => resolve());
            chatService.once("error", (err) => reject(err.error));
        });
    }
    // After initialization, the baseHash is set and can be used as the first checkpoint ID
    return {
        success: true,
        message: `Checkpoint service for task ${taskId} is initialized.`,
        checkpointId: chatService.baseHash
    };
}
exports.initializeTaskCheckpoint = initializeTaskCheckpoint;
