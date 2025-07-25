import * as childProcess from "child_process"
import * as path from "path"
import * as readline from "readline"
import { fileExistsAtPath } from "../../utils/fs"
import isDev from "electron-is-dev"
import { app } from "electron"

const isWindows = /^win/.test(process.platform)
const binName = isWindows ? "rg.exe" : "rg"

/**
 * Get the path to the ripgrep binary. In Electron, we can use require.resolve.
 */
export async function getBinPath(): Promise<string | undefined> {
	// In production, the binary is copied to the resources/bin directory.
	if (!isDev) {
		// In a packaged app, app.getAppPath() returns /path/to/app.asar
		// We need to go up one level to get to the resources directory.
		const prodPath = path.join(app.getAppPath(), "..", "bin", binName)
		if (await fileExistsAtPath(prodPath)) {
			console.log(`[ripgrep] Found ripgrep at production path: ${prodPath}`)
			return prodPath
		}
		console.error(`[ripgrep] Could not find ripgrep at expected production path: ${prodPath}`)
	}

	// In development, resolve the path from node_modules.
	try {
		// A more robust way to find the binary: resolve the package.json, then build the path.
		const packageJsonPath = require.resolve("@vscode/ripgrep/package.json")
		const packageRoot = path.dirname(packageJsonPath)
		const binPath = path.join(packageRoot, "bin", binName)

		if (await fileExistsAtPath(binPath)) {
			console.log(`[ripgrep] Found ripgrep at dev path: ${binPath}`)
			return binPath
		}
	} catch (e) {
		console.error("[ripgrep] Failed to resolve ripgrep path via require.resolve('package.json'):", e)
	}

	// Fallback for development environment if direct resolve fails
	try {
		const devPath = path.join(__dirname, "../../../../node_modules/@vscode/ripgrep/bin", binName)
		if (await fileExistsAtPath(devPath)) {
			console.log(`[ripgrep] Found ripgrep at fallback dev path: ${devPath}`)
			return devPath
		}
	} catch (e) {
		console.error("[ripgrep] Failed to resolve ripgrep path via __dirname fallback:", e)
	}

	console.error("[ripgrep] Ripgrep binary not found in any of the checked locations.")
	return undefined
}

// Minimal executeRipgrep for the needs of ShadowCheckpointService
export async function executeRipgrep({
	args,
	workspacePath,
}: {
	args: string[]
	workspacePath: string
}): Promise<{ path: string; type: "file" | "folder" }[]> {
	const rgPath = await getBinPath()

	if (!rgPath) {
		const err = new Error(`ripgrep not found`)
		console.error("[ripgrep#executeRipgrep]", err)
		throw err
	}

	console.log(`[ripgrep#executeRipgrep] Executing: ${rgPath} ${args.join(" ")} in ${workspacePath}`)

	return new Promise((resolve, reject) => {
		const rgProcess = childProcess.spawn(rgPath, args, { cwd: workspacePath })
		const rl = readline.createInterface({ input: rgProcess.stdout, crlfDelay: Infinity })
		const results: { path: string; type: "file" | "folder" }[] = []

		rl.on("line", (line) => {
			if (line) {
				// In this context, we only expect folder paths for .git directories
				results.push({ path: line, type: "folder" })
			}
		})

		let errorOutput = ""
		rgProcess.stderr.on("data", (data) => {
			errorOutput += data.toString()
		})

		rl.on("close", () => {
			if (errorOutput) {
				// ripgrep can output to stderr for non-critical errors (e.g., permission denied),
				// so we don't always reject, just resolve with what we have.
				console.warn(`[ripgrep#executeRipgrep] process stderr: ${errorOutput}`)
			}
			console.log(`[ripgrep#executeRipgrep] process finished. Found ${results.length} paths.`)
			resolve(results)
		})

		rgProcess.on("error", (error) => {
			console.error("[ripgrep#executeRipgrep] process error:", error)
			reject(new Error(`ripgrep process error: ${error.message}`))
		})
	})
}