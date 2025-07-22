/**
 * Adds line numbers to a string of content.
 * @param {string} content The content to add line numbers to.
 * @param {number} startLine The starting line number.
 * @returns {string} The content with line numbers.
 */
function addLineNumbers(content, startLine = 1) {
	if (content === "") {
		return startLine === 1 ? "" : `${startLine} | \n`;
	}

	const lines = content.split("\n");
	const lastLineEmpty = lines[lines.length - 1] === "";
	if (lastLineEmpty) {
		lines.pop();
	}

	const maxLineNumberWidth = String(startLine + lines.length - 1).length;
	const numberedContent = lines
		.map((line, index) => {
			const lineNumber = String(startLine + index).padStart(maxLineNumberWidth, " ");
			return `${lineNumber} | ${line}`;
		})
		.join("\n");

	return numberedContent + "\n";
}

/**
 * Checks if every line in the content has line numbers prefixed.
 * @param {string} content The content to check.
 * @returns {boolean} True if every line has a line number.
 */
function everyLineHasLineNumbers(content) {
	const lines = content.split(/\r?\n/);
    // Handles empty last line
    if (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
    }
	return lines.length > 0 && lines.every((line) => /^\s*\d+\s+\|(?!\|)/.test(line));
}

/**
 * Strips line numbers from content.
 * @param {string} content The content to process.
 * @param {boolean} aggressive Whether to use a more lenient pattern.
 * @returns {string} The content with line numbers removed.
 */
function stripLineNumbers(content, aggressive = false) {
	const lines = content.split(/\r?\n/);

	const processedLines = lines.map((line) => {
		const match = aggressive ? line.match(/^\s*(?:\d+\s)?\|\s?(.*)$/) : line.match(/^\s*\d+\s+\|(?!\|)\s?(.*)$/);
		return match ? match[1] : line;
	});

	const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
	return processedLines.join(lineEnding);
}

module.exports = {
    addLineNumbers,
    everyLineHasLineNumbers,
    stripLineNumbers,
};