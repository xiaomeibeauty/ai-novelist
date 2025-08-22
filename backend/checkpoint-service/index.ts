import * as path from "path";
import { RepoPerTaskCheckpointService } from "./RepoPerTaskCheckpointService";
import { NovelArchiveService } from "./NovelArchiveService";
import { CheckpointServiceOptions } from "./types";

// Caches for service instances per task
const novelArchiveServices = new Map<string, NovelArchiveService>();
const chatHistoryServices = new Map<string, RepoPerTaskCheckpointService>();

function getNovelArchiveService(taskId: string, workspaceDir: string, shadowDir: string): NovelArchiveService {
    if (novelArchiveServices.has(taskId)) {
        return novelArchiveServices.get(taskId)!;
    }
    const novelWorkspace = workspaceDir; // workspaceDir is already the correct path to the novel files
    const archivesDir = path.join(shadowDir, 'tasks', taskId, 'novel-archives');
    const service = new NovelArchiveService(archivesDir, novelWorkspace, (message) => console.log(`[NovelArchiveService][${taskId}] ${message}`));
    
    service.init().catch(error => {
        console.error(`[NovelArchiveService][${taskId}] Failed to initialize:`, error);
        novelArchiveServices.delete(taskId);
    });
    
    novelArchiveServices.set(taskId, service);
    return service;
}

function getChatHistoryService(taskId: string, workspaceDir: string, shadowDir: string): RepoPerTaskCheckpointService {
    if (chatHistoryServices.has(taskId)) {
        return chatHistoryServices.get(taskId)!;
    }
    
    const options: CheckpointServiceOptions = {
        taskId,
        workspaceDir,
        shadowDir,
        log: (message) => console.log(`[ChatHistoryService][${taskId}] ${message}`),
    };
    
    const service = RepoPerTaskCheckpointService.create(options);
    chatHistoryServices.set(taskId, service);
    
    service.initShadowGit().catch((error) => {
        console.error(`[ChatHistoryService][${taskId}] Failed to initialize shadow git:`, error);
        chatHistoryServices.delete(taskId);
    });
    
    return service;
}

export async function saveArchive(taskId: string, workspaceDir: string, shadowDir: string, message: string) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);

    if (!chatService.isInitialized) {
        await new Promise<void>((resolve) => chatService.once("initialize", () => resolve()));
    }

    // Perform both archiving operations
    const novelPromise = novelService.createNovelArchive(message);
    const chatPromise = chatService.saveCheckpoint(message);

    // We can run them in parallel
    await Promise.all([novelPromise, chatPromise]);
}

export async function restoreNovelArchive(taskId: string, workspaceDir: string, shadowDir: string, archiveId: string) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    return await novelService.restoreNovelArchive(archiveId);
}

export async function deleteNovelArchive(taskId: string, workspaceDir: string, shadowDir: string, archiveId: string) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    return await novelService.deleteNovelArchive(archiveId);
}

// This function now specifically gets the novel archives for the UI.
export async function getHistory(taskId: string, workspaceDir: string, shadowDir: string) {
    const novelService = getNovelArchiveService(taskId, workspaceDir, shadowDir);
    return await novelService.listNovelArchives();
}

// The diff function is likely tied to Git, so we leave it for chat history for now,
// or decide on a new folder-diffing strategy later.
export async function getDiff(taskId: string, workspaceDir: string, shadowDir: string, from?: string, to?: string) {
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    if (!chatService.isInitialized) {
        await new Promise<void>((resolve) => chatService.once("initialize", () => resolve()));
    }
    return await chatService.getDiff({ from, to });
}

export async function restoreCheckpoint(taskId: string, workspaceDir: string, shadowDir: string, commitHash: string) {
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    if (!chatService.isInitialized) {
        await new Promise<void>((resolve) => chatService.once("initialize", () => resolve()));
    }
    return await chatService.restoreCheckpoint(commitHash);
}

export async function saveShadowCheckpoint(taskId: string, workspaceDir: string, shadowDir: string, message: string) {
    // Initialization is now handled at the beginning of the task.
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    // Directly call saveCheckpoint, assuming service is already initialized.
    return await chatService.saveCheckpoint(message);
}
export async function initializeTaskCheckpoint(taskId: string, workspaceDir: string, shadowDir: string) {
    const chatService = getChatHistoryService(taskId, workspaceDir, shadowDir);
    if (!chatService.isInitialized) {
        // Wait for the async initialization to complete
        await new Promise<void>((resolve, reject) => {
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