const childProcess = require("child_process");
const path = require("path");
const readline = require("readline");
const fs = require("fs").promises;
const ripgrepPath = require("@vscode/ripgrep").rgPath;

const isWindows = /^win/.test(process.platform);
const binName = isWindows ? "rg.exe" : "rg";

const MAX_RESULTS = 300;
const MAX_LINE_LENGTH = 500;

function truncateLine(line, maxLength = MAX_LINE_LENGTH) {
    return line.length > maxLength ? line.substring(0, maxLength) + " [truncated...]" : line;
}

async function execRipgrep(bin, args) {
    return new Promise((resolve, reject) => {
        const rgProcess = childProcess.spawn(bin, args);
        const rl = readline.createInterface({
            input: rgProcess.stdout,
            crlfDelay: Infinity,
        });

        let output = "";
        let lineCount = 0;
        const maxLines = MAX_RESULTS * 5;

        rl.on("line", (line) => {
            if (lineCount < maxLines) {
                output += line + "\n";
                lineCount++;
            } else {
                rl.close();
                rgProcess.kill();
            }
        });

        let errorOutput = "";
        rgProcess.stderr.on("data", (data) => {
            errorOutput += data.toString();
        });
        rl.on("close", () => {
            if (errorOutput) {
                reject(new Error(`ripgrep process error: ${errorOutput}`));
            } else {
                resolve(output);
            }
        });
        rgProcess.on("error", (error) => {
            reject(new Error(`ripgrep process error: ${error.message}`));
        });
    });
}

async function regexSearchFiles(cwd, directoryPath, regex, filePattern) {
    if (!ripgrepPath) {
        throw new Error("Could not find ripgrep binary");
    }

    const args = ["--json", "-e", regex, "--glob", filePattern || "*", "--context", "1", directoryPath];

    let output;
    try {
        output = await execRipgrep(ripgrepPath, args);
    } catch (error) {
        console.error("Error executing ripgrep:", error);
        return "No results found";
    }

    const results = [];
    let currentFile = null;

    output.split("\n").forEach((line) => {
        if (line) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === "begin") {
                    currentFile = {
                        file: parsed.data.path.text.toString(),
                        searchResults: [],
                    };
                } else if (parsed.type === "end") {
                    if (currentFile) {
                        results.push(currentFile);
                    }
                    currentFile = null;
                } else if ((parsed.type === "match" || parsed.type === "context") && currentFile) {
                    const lineData = {
                        line: parsed.data.line_number,
                        text: truncateLine(parsed.data.lines.text),
                        isMatch: parsed.type === "match",
                        ...(parsed.type === "match" && { column: parsed.data.absolute_offset }),
                    };

                    const lastResult = currentFile.searchResults[currentFile.searchResults.length - 1];
                    if (lastResult?.lines.length > 0) {
                        const lastLine = lastResult.lines[lastResult.lines.length - 1];
                        if (parsed.data.line_number <= lastLine.line + 1) {
                            lastResult.lines.push(lineData);
                        } else {
                            currentFile.searchResults.push({
                                lines: [lineData],
                            });
                        }
                    } else {
                        currentFile.searchResults.push({
                            lines: [lineData],
                        });
                    }
                }
            } catch (error) {
                console.error("Error parsing ripgrep output:", error);
            }
        }
    });

    return formatResults(results, cwd);
}

function formatResults(fileResults, cwd) {
    let output = "";
    const totalResults = fileResults.reduce((sum, file) => sum + file.searchResults.length, 0);

    if (totalResults >= MAX_RESULTS) {
        output += `Showing first ${MAX_RESULTS} of ${MAX_RESULTS}+ results. Use a more specific search if necessary.\n\n`;
    } else {
        output += `Found ${totalResults === 1 ? "1 result" : `${totalResults.toLocaleString()} results`}.\n\n`;
    }

    const groupedResults = {};
    fileResults.slice(0, MAX_RESULTS).forEach((file) => {
        const relativeFilePath = path.relative(cwd, file.file).replace(/\\/g, '/');
        if (!groupedResults[relativeFilePath]) {
            groupedResults[relativeFilePath] = [];
        }
        groupedResults[relativeFilePath].push(...file.searchResults);
    });

    for (const [filePath, results] of Object.entries(groupedResults)) {
        output += `# ${filePath}\n`;
        results.forEach((result) => {
            if (result.lines.length > 0) {
                result.lines.forEach((line) => {
                    const lineNumber = String(line.line).padStart(3, " ");
                    output += `${lineNumber} | ${line.text.trimEnd()}\n`;
                });
                output += "----\n";
            }
        });
        output += "\n";
    }

    return output.trim();
}

module.exports = {
    regexSearchFiles,
};