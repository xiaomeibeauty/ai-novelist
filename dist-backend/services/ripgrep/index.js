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
exports.executeRipgrep = exports.getBinPath = void 0;
const childProcess = __importStar(require("child_process"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
const fs_1 = require("../../utils/fs");
const isWindows = /^win/.test(process.platform);
const binName = isWindows ? "rg.exe" : "rg";
/**
 * Get the path to the ripgrep binary. In Electron, we can use require.resolve.
 */
async function getBinPath() {
    try {
        // Correctly resolve the path to the ripgrep binary within the package
        const rgPath = require.resolve("@vscode/ripgrep/bin/rg");
        // The path from require.resolve might point to a file inside the bin folder,
        // so we need to find the actual binary.
        const binPath = path.join(path.dirname(rgPath), binName);
        if (await (0, fs_1.fileExistsAtPath)(binPath)) {
            return binPath;
        }
        // Fallback for different package structures
        const altPath = path.join(path.dirname(rgPath), "../bin", binName);
        if (await (0, fs_1.fileExistsAtPath)(altPath)) {
            return altPath;
        }
    }
    catch (e) {
        // ignore
    }
    // Fallback for development environment if direct resolve fails
    try {
        const devPath = path.join(__dirname, "../../../../node_modules/@vscode/ripgrep/bin", binName);
        if (await (0, fs_1.fileExistsAtPath)(devPath)) {
            return devPath;
        }
    }
    catch (e) {
        // ignore
    }
    return undefined;
}
exports.getBinPath = getBinPath;
// Minimal executeRipgrep for the needs of ShadowCheckpointService
async function executeRipgrep({ args, workspacePath, }) {
    const rgPath = await getBinPath();
    if (!rgPath) {
        throw new Error(`ripgrep not found`);
    }
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
                console.warn(`ripgrep process stderr: ${errorOutput}`);
            }
            resolve(results);
        });
        rgProcess.on("error", (error) => {
            reject(new Error(`ripgrep process error: ${error.message}`));
        });
    });
}
exports.executeRipgrep = executeRipgrep;
