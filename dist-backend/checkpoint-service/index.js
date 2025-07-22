"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHistory = exports.getDiff = exports.restoreCheckpoint = exports.saveCheckpoint = void 0;
const RepoPerTaskCheckpointService_1 = require("./RepoPerTaskCheckpointService");
// A simple cache to hold service instances per task
const serviceInstances = new Map();
function getServiceInstance(taskId, workspaceDir, shadowDir) {
    if (serviceInstances.has(taskId)) {
        return serviceInstances.get(taskId);
    }
    const options = {
        taskId,
        workspaceDir,
        shadowDir,
        log: (message) => console.log(`[CheckpointService][${taskId}] ${message}`),
    };
    const service = RepoPerTaskCheckpointService_1.RepoPerTaskCheckpointService.create(options);
    serviceInstances.set(taskId, service);
    // Initialize the shadow git repo in the background
    service.initShadowGit().catch((error) => {
        console.error(`[CheckpointService][${taskId}] Failed to initialize shadow git:`, error);
        // Handle initialization failure, maybe remove from instances
        serviceInstances.delete(taskId);
    });
    return service;
}
async function saveCheckpoint(taskId, workspaceDir, shadowDir, message) {
    const service = getServiceInstance(taskId, workspaceDir, shadowDir);
    if (!service.isInitialized) {
        await new Promise((resolve) => service.once("initialize", () => resolve()));
    }
    return await service.saveCheckpoint(message);
}
exports.saveCheckpoint = saveCheckpoint;
async function restoreCheckpoint(taskId, workspaceDir, shadowDir, commitHash) {
    const service = getServiceInstance(taskId, workspaceDir, shadowDir);
    if (!service.isInitialized) {
        await new Promise((resolve) => service.once("initialize", () => resolve()));
    }
    return await service.restoreCheckpoint(commitHash);
}
exports.restoreCheckpoint = restoreCheckpoint;
async function getDiff(taskId, workspaceDir, shadowDir, from, to) {
    const service = getServiceInstance(taskId, workspaceDir, shadowDir);
    if (!service.isInitialized) {
        await new Promise((resolve) => service.once("initialize", () => resolve()));
    }
    return await service.getDiff({ from, to });
}
exports.getDiff = getDiff;
async function getHistory(taskId, workspaceDir, shadowDir) {
    const service = getServiceInstance(taskId, workspaceDir, shadowDir);
    if (!service.isInitialized) {
        await new Promise((resolve) => service.once("initialize", () => resolve()));
    }
    return await service.getHistory();
}
exports.getHistory = getHistory;
