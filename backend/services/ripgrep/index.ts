import * as childProcess from "child_process"
import * as path from "path"
import * as readline from "readline"
import { fileExistsAtPath } from "../../utils/fs"

const isWindows = /^win/.test(process.platform)
const binName = isWindows ? "rg.exe" : "rg"

/**
 * Get the path to the ripgrep binary. In Electron, we can use require.resolve.
 */
export async function getBinPath(): Promise<string | undefined> {
	try {
		// Correctly resolve the path to the ripgrep binary within the package
		const rgPath = require.resolve("@vscode/ripgrep/bin/rg")
		// The path from require.resolve might point to a file inside the bin folder,
		// so we need to find the actual binary.
		const binPath = path.join(path.dirname(rgPath), binName)
		if (await fileExistsAtPath(binPath)) {
			return binPath
		}
		// Fallback for different package structures
		const altPath = path.join(path.dirname(rgPath), "../bin", binName)
		if (await fileExistsAtPath(altPath)) {
			return altPath
		}
	} catch (e) {
		// ignore
	}

	// Fallback for development environment if direct resolve fails
	try {
		const devPath = path.join(__dirname, "../../../../node_modules/@vscode/ripgrep/bin", binName)
		if (await fileExistsAtPath(devPath)) {
			return devPath
		}
	} catch (e) {
		// ignore
	}

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
		throw new Error(`ripgrep not found`)
	}

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
				console.warn(`ripgrep process stderr: ${errorOutput}`)
			}
			resolve(results)
		})

		rgProcess.on("error", (error) => {
			reject(new Error(`ripgrep process error: ${error.message}`))
		})
	})
}