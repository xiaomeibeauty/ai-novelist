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
exports.executeRipgrep = exports.getBinPath = void 0;
const childProcess = __importStar(require("child_process"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const fs_1 = require("../../utils/fs");
const electron_is_dev_1 = __importDefault(require("electron-is-dev"));
const electron_1 = require("electron");
const isWindows = /^win/.test(process.platform);
const binName = isWindows ? "rg.exe" : "rg";
/**
 * Get the path to the ripgrep binary. In Electron, we can use require.resolve.
 */
async function getBinPath() {
    // In production, the binary is copied to the resources/bin directory.
    if (!electron_is_dev_1.default) {
        // In a packaged app, app.getAppPath() returns /path/to/app.asar
        // We need to go up one level to get to the resources directory.
        const prodPath = path.join(electron_1.app.getAppPath(), "..", "bin", binName);
        if (await (0, fs_1.fileExistsAtPath)(prodPath)) {
            console.log(`[ripgrep] Found ripgrep at production path: ${prodPath}`);
            return prodPath;
        }
        console.error(`[ripgrep] Could not find ripgrep at expected production path: ${prodPath}`);
    }
    // In development, resolve the path from node_modules.
    try {
        // A more robust way to find the binary: resolve the package.json, then build the path.
        const packageJsonPath = require.resolve("@vscode/ripgrep/package.json");
        const packageRoot = path.dirname(packageJsonPath);
        const binPath = path.join(packageRoot, "bin", binName);
        if (await (0, fs_1.fileExistsAtPath)(binPath)) {
            console.log(`[ripgrep] Found ripgrep at dev path: ${binPath}`);
            return binPath;
        }
    }
    catch (e) {
        console.error("[ripgrep] Failed to resolve ripgrep path via require.resolve('package.json'):", e);
    }
    // Fallback for development environment if direct resolve fails
    try {
        const devPath = path.join(__dirname, "../../../../node_modules/@vscode/ripgrep/bin", binName);
        if (await (0, fs_1.fileExistsAtPath)(devPath)) {
            console.log(`[ripgrep] Found ripgrep at fallback dev path: ${devPath}`);
            return devPath;
        }
    }
    catch (e) {
        console.error("[ripgrep] Failed to resolve ripgrep path via __dirname fallback:", e);
    }
    console.error("[ripgrep] Ripgrep binary not found in any of the checked locations.");
    return undefined;
}
exports.getBinPath = getBinPath;
// Minimal executeRipgrep for the needs of ShadowCheckpointService
async function executeRipgrep({ args, workspacePath, }) {
    const rgPath = await getBinPath();
    if (!rgPath) {
        const err = new Error(`ripgrep not found`);
        console.error("[ripgrep#executeRipgrep]", err);
        throw err;
    }
    console.log(`[ripgrep#executeRipgrep] Executing: ${rgPath} ${args.join(" ")} in ${workspacePath}`);
    return new Promise((resolve, reject) => {
        const rgProcess = childProcess.spawn(rgPath, args, { cwd: workspacePath });
        const rl = readline.createInterface({ input: rgProcess.stdout, crlfDelay: Infinity });
        const results = [];
        rl.on("line", (line) => {
            if (line) {
                // In this context, we only expect folder paths for .git directories
                results.push({ path: line, type: "folder" });
            }
        });
        let errorOutput = "";
        rgProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });
        rl.on("close", () => {
            if (errorOutput) {
                // ripgrep can output to stderr for non-critical errors (e.g., permission denied),
                // so we don't always reject, just resolve with what we have.
                console.warn(`[ripgrep#executeRipgrep] process stderr: ${errorOutput}`);
            }
            console.log(`[ripgrep#executeRipgrep] process finished. Found ${results.length} paths.`);
            resolve(results);
        });
        rgProcess.on("error", (error) => {
            console.error("[ripgrep#executeRipgrep] process error:", error);
            reject(new Error(`ripgrep process error: ${error.message}`));
        });
    });
}
exports.executeRipgrep = executeRipgrep;
