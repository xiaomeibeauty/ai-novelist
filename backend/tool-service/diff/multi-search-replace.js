const { distance } = require("fastest-levenshtein");
const { addLineNumbers, everyLineHasLineNumbers, stripLineNumbers } = require("../../utils/line-number-helpers");
const { normalizeString } = require("../../utils/text-normalization");

const BUFFER_LINES = 40;

function getSimilarity(original, search) {
    if (search === "") return 0;
    const normalizedOriginal = normalizeString(original);
    const normalizedSearch = normalizeString(search);
    if (normalizedOriginal === normalizedSearch) return 1;
    const dist = distance(normalizedOriginal, normalizedSearch);
    const maxLength = Math.max(normalizedOriginal.length, normalizedSearch.length);
    return 1 - dist / maxLength;
}

function fuzzySearch(lines, searchChunk, startIndex, endIndex) {
    let bestScore = 0;
    let bestMatchIndex = -1;
    let bestMatchContent = "";
    const searchLen = searchChunk.split(/\r?\n/).length;

    const midPoint = Math.floor((startIndex + endIndex) / 2);
    let leftIndex = midPoint;
    let rightIndex = midPoint + 1;

    while (leftIndex >= startIndex || rightIndex <= endIndex - searchLen) {
        if (leftIndex >= startIndex) {
            const originalChunk = lines.slice(leftIndex, leftIndex + searchLen).join("\n");
            const similarity = getSimilarity(originalChunk, searchChunk);
            if (similarity > bestScore) {
                bestScore = similarity;
                bestMatchIndex = leftIndex;
                bestMatchContent = originalChunk;
            }
            leftIndex--;
        }

        if (rightIndex <= endIndex - searchLen) {
            const originalChunk = lines.slice(rightIndex, rightIndex + searchLen).join("\n");
            const similarity = getSimilarity(originalChunk, searchChunk);
            if (similarity > bestScore) {
                bestScore = similarity;
                bestMatchIndex = rightIndex;
                bestMatchContent = originalChunk;
            }
            rightIndex++;
        }
    }
    return { bestScore, bestMatchIndex, bestMatchContent };
}

class MultiSearchReplaceStrategy {
    constructor(fuzzyThreshold, bufferLines) {
        this.fuzzyThreshold = fuzzyThreshold ?? 0.9;
        this.bufferLines = bufferLines ?? BUFFER_LINES;
    }

    unescapeMarkers(content) {
        return content
            .replace(/^\\<<<<<<</gm, "<<<<<<<")
            .replace(/^\\=======/gm, "=======")
            .replace(/^\\>>>>>>>/gm, ">>>>>>>")
            .replace(/^\\-------/gm, "-------")
            .replace(/^\\:start_line:/gm, ":start_line:");
    }

    validateMarkerSequencing(diffContent) {
        const State = { START: 0, AFTER_SEARCH: 1, AFTER_SEPARATOR: 2 };
        let state = { current: State.START, line: 0 };
        const lines = diffContent.split('\n');

        for (const line of lines) {
            state.line++;
            const marker = line.trim();
            switch (state.current) {
                case State.START:
                    if (marker === '=======') return { success: false, error: `Invalid diff format: Unexpected ======= on line ${state.line}.` };
                    if (marker === '>>>>>>> REPLACE') return { success: false, error: `Invalid diff format: Unexpected >>>>>>> REPLACE on line ${state.line}.` };
                    if (marker === '<<<<<<< SEARCH') state.current = State.AFTER_SEARCH;
                    break;
                case State.AFTER_SEARCH:
                    if (marker === '<<<<<<< SEARCH') return { success: false, error: `Invalid diff format: Unexpected <<<<<<< SEARCH on line ${state.line}.` };
                    if (marker === '>>>>>>> REPLACE') return { success: false, error: `Invalid diff format: Unexpected >>>>>>> REPLACE on line ${state.line}.` };
                    if (marker === '=======') state.current = State.AFTER_SEPARATOR;
                    break;
                case State.AFTER_SEPARATOR:
                    if (marker === '<<<<<<< SEARCH') return { success: false, error: `Invalid diff format: Unexpected <<<<<<< SEARCH on line ${state.line}.` };
                    if (marker === '=======') return { success: false, error: `Invalid diff format: Unexpected ======= on line ${state.line}.` };
                    if (marker === '>>>>>>> REPLACE') state.current = State.START;
                    break;
            }
        }
        if (state.current !== State.START) {
            return { success: false, error: `Invalid diff format: Unexpected end of content. Expected ${state.current === State.AFTER_SEARCH ? '=======' : '>>>>>>> REPLACE'}.` };
        }
        return { success: true };
    }

    async applyDiff(originalContent, diffContent) {
        console.log("Original Content:", originalContent);
        console.log("Diff Content:", diffContent);
        console.log("Original Content:", originalContent);
        console.log("Diff Content:", diffContent);
        console.log("Original Content:", originalContent);
        console.log("Diff Content:", diffContent);
        const validSeq = this.validateMarkerSequencing(diffContent);
        if (!validSeq.success) return validSeq;

        const diffBlockRegex = /(?:^|\n)(?<!\\)<<<<<<< SEARCH\s*\n([\s\S]*?)(?<!\\)-------\s*\n([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)=======\s*\n)([\s\S]*?)(?:\n)?(?:(?<=\n)(?<!\\)>>>>>>> REPLACE)(?=\n|$)/g;
        const matches = [...diffContent.matchAll(diffBlockRegex)];

        if (matches.length === 0) return { success: false, error: "Invalid diff format - no valid SEARCH/REPLACE blocks found." };

        const lineEnding = originalContent.includes("\r\n") ? "\r\n" : "\n";
        let resultLines = originalContent.split(/\r?\n/);
        let delta = 0;
        let appliedCount = 0;
        const failParts = [];

        const replacements = matches.map(match => {
            const metadataBlock = match[1];
            const searchContent = match[2];
            const replaceContent = match[3];

            let startLine = 0;
            const startLineMatch = metadataBlock.match(/\:(?:start_line|start_paragraph):\s*(\d+)/);
            if (startLineMatch) {
                startLine = Number(startLineMatch[1]);
            }
            
            return {
                startLine,
                searchContent,
                replaceContent,
            };
        }).sort((a, b) => a.startLine - b.startLine);

        for (let replacement of replacements) {
            let { searchContent, replaceContent } = replacement;
            let startLine = replacement.startLine + (replacement.startLine === 0 ? 0 : delta);
            console.log("Replacement:", replacement);
            console.log("Start Line:", startLine);
            console.log("Search Content:", searchContent);
            console.log("Replace Content:", replaceContent);
            console.log("Replacement:", replacement);
            console.log("Start Line:", startLine);
            console.log("Search Content:", searchContent);
            console.log("Replace Content:", replaceContent);
            console.log("Replacement:", replacement);
            console.log("Start Line:", startLine);
            console.log("Search Content:", searchContent);
            console.log("Replace Content:", replaceContent);

            searchContent = this.unescapeMarkers(searchContent);
            replaceContent = this.unescapeMarkers(replaceContent);

            const hasAllLineNumbers = (everyLineHasLineNumbers(searchContent) && everyLineHasLineNumbers(replaceContent)) || (everyLineHasLineNumbers(searchContent) && replaceContent.trim() === "");
            if (hasAllLineNumbers && startLine === 0) {
                startLine = parseInt(searchContent.split("\n")[0].split("|")[0]);
            }
            if (hasAllLineNumbers) {
                searchContent = stripLineNumbers(searchContent);
                replaceContent = stripLineNumbers(replaceContent);
            }

            if (searchContent === "" || searchContent === replaceContent) {
                failParts.push({ success: false, error: "Search content is empty or identical to replace content." });
                continue;
            }

            let searchLines = searchContent.split(/\r?\n/);
            let replaceLines = replaceContent.split(/\r?\n/);
            let searchChunk = searchLines.join("\n");

            let matchIndex = -1;
            let bestMatchScore = 0;
            let bestMatchContent = "";
            let searchStartIndex = 0;
            let searchEndIndex = resultLines.length;

            if (startLine) {
                const exactStartIndex = startLine - 1;
                const originalChunk = resultLines.slice(exactStartIndex, exactStartIndex + searchLines.length).join("\n");
                const similarity = getSimilarity(originalChunk, searchChunk);
                if (similarity >= this.fuzzyThreshold) {
                    matchIndex = exactStartIndex;
                    bestMatchScore = similarity;
                } else {
                    searchStartIndex = Math.max(0, startLine - (this.bufferLines + 1));
                    searchEndIndex = Math.min(resultLines.length, startLine + searchLines.length + this.bufferLines);
                }
            }
            console.log("Match Index:", matchIndex);
            console.log("Best Match Score:", bestMatchScore);

            if (matchIndex === -1) {
                const searchResult = fuzzySearch(resultLines, searchChunk, searchStartIndex, searchEndIndex);
                matchIndex = searchResult.bestMatchIndex;
                bestMatchScore = searchResult.bestScore;
                bestMatchContent = searchResult.bestMatchContent;
            }
            console.log("Match Index:", matchIndex);
            console.log("Best Match Score:", bestMatchScore);
            console.log("Match Index:", matchIndex);
            console.log("Best Match Score:", bestMatchScore);


            if (matchIndex === -1 || bestMatchScore < this.fuzzyThreshold) {
                // Aggressive fallback
                const aggressiveSearchContent = stripLineNumbers(searchContent, true);
                if (aggressiveSearchContent !== searchContent) {
                    const aggressiveSearchChunk = aggressiveSearchContent.split(/\r?\n/).join("\n");
                    const searchResult = fuzzySearch(resultLines, aggressiveSearchChunk, searchStartIndex, searchEndIndex);
                    if (searchResult.bestMatchIndex !== -1 && searchResult.bestScore >= this.fuzzyThreshold) {
                        matchIndex = searchResult.bestMatchIndex;
                        bestMatchScore = searchResult.bestScore;
                        bestMatchContent = searchResult.bestMatchContent;
                        searchContent = aggressiveSearchContent;
                        replaceContent = stripLineNumbers(replaceContent, true);
                        searchLines = searchContent.split(/\r?\n/);
                        replaceLines = replaceContent.split(/\r?\n/);
                    }
                }
            }

            if (matchIndex === -1 || bestMatchScore < this.fuzzyThreshold) {
                const error = `No sufficiently similar match found (Score: ${bestMatchScore.toFixed(2)}, Needed: ${this.fuzzyThreshold})`;
                const originalContentSection = addLineNumbers(resultLines.slice(Math.max(0, startLine - 5), startLine + 5).join('\n'), Math.max(1, startLine - 4));
                failParts.push({ success: false, error: `${error}\nNear line ${startLine}:\n${originalContentSection}`});
                continue;
            }

            const matchedLines = resultLines.slice(matchIndex, matchIndex + searchLines.length);
            const originalIndents = matchedLines.map((line) => (line.match(/^[\t ]*/) || [""])[0]);
            const searchIndents = searchLines.map((line) => (line.match(/^[\t ]*/) || [""])[0]);

            const indentedReplaceLines = replaceLines.map((line) => {
                const matchedIndent = originalIndents[0] || "";
                const currentIndent = (line.match(/^[\t ]*/) || [""])[0];
                const searchBaseIndent = searchIndents[0] || "";
                const searchBaseLevel = searchBaseIndent.length;
                const currentLevel = currentIndent.length;
                const relativeLevel = currentLevel - searchBaseLevel;
                const finalIndent = relativeLevel < 0
                    ? matchedIndent.slice(0, Math.max(0, matchedIndent.length + relativeLevel))
                    : matchedIndent + currentIndent.slice(searchBaseLevel);
                return finalIndent + line.trim();
            });

            resultLines.splice(matchIndex, searchLines.length, ...indentedReplaceLines);
            delta += replaceLines.length - searchLines.length;
            appliedCount++;
        }

        if (appliedCount === 0) {
            return { success: false, error: "No changes were applied. All diff parts failed.", failParts };
        }
        console.log("Final Content:", resultLines.join(lineEnding));
        return { success: true, content: resultLines.join(lineEnding), failParts };
    }
}

module.exports = { MultiSearchReplaceStrategy };