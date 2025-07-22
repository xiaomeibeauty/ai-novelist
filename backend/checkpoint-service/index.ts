import { RepoPerTaskCheckpointService } from "./RepoPerTaskCheckpointService"
import { CheckpointServiceOptions } from "./types"

// A simple cache to hold service instances per task
const serviceInstances = new Map<string, RepoPerTaskCheckpointService>()

function getServiceInstance(
	taskId: string,
	workspaceDir: string,
	shadowDir: string,
): RepoPerTaskCheckpointService {
	if (serviceInstances.has(taskId)) {
		return serviceInstances.get(taskId)!
	}

	const options: CheckpointServiceOptions = {
		taskId,
		workspaceDir,
		shadowDir,
		log: (message) => console.log(`[CheckpointService][${taskId}] ${message}`),
	}

	const service = RepoPerTaskCheckpointService.create(options)
	serviceInstances.set(taskId, service)

	// Initialize the shadow git repo in the background
	service.initShadowGit().catch((error) => {
		console.error(`[CheckpointService][${taskId}] Failed to initialize shadow git:`, error)
		// Handle initialization failure, maybe remove from instances
		serviceInstances.delete(taskId)
	})

	return service
}

export async function saveCheckpoint(
	taskId: string,
	workspaceDir: string,
	shadowDir: string,
	message: string,
) {
	const service = getServiceInstance(taskId, workspaceDir, shadowDir)
	if (!service.isInitialized) {
		await new Promise<void>((resolve) => service.once("initialize", () => resolve()))
	}
	return await service.saveCheckpoint(message)
}

export async function restoreCheckpoint(
	taskId: string,
	workspaceDir: string,
	shadowDir: string,
	commitHash: string,
) {
	const service = getServiceInstance(taskId, workspaceDir, shadowDir)
	if (!service.isInitialized) {
		await new Promise<void>((resolve) => service.once("initialize", () => resolve()))
	}
	return await service.restoreCheckpoint(commitHash)
}

export async function getDiff(
	taskId: string,
	workspaceDir: string,
	shadowDir: string,
	from?: string,
	to?: string,
) {
	const service = getServiceInstance(taskId, workspaceDir, shadowDir)
	if (!service.isInitialized) {
		await new Promise<void>((resolve) => service.once("initialize", () => resolve()))
	}
	return await service.getDiff({ from, to })
}

export async function getHistory(
	taskId: string,
	workspaceDir: string,
	shadowDir: string,
) {
	const service = getServiceInstance(taskId, workspaceDir, shadowDir)
	if (!service.isInitialized) {
		await new Promise<void>((resolve) => service.once("initialize", () => resolve()))
	}
	return await service.getHistory()
}