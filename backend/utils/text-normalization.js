/**
 * Common character mappings for normalization
 */
const NORMALIZATION_MAPS = {
	// Smart quotes to regular quotes
	SMART_QUOTES: {
		"\u201C": '"', // Left double quote (U+201C)
		"\u201D": '"', // Right double quote (U+201D)
		"\u2018": "'", // Left single quote (U+2018)
		"\u2019": "'", // Right single quote (U+2019)
	},
	// Other typographic characters
	TYPOGRAPHIC: {
		"\u2026": "...", // Ellipsis
		"\u2014": "-", // Em dash
		"\u2013": "-", // En dash
		"\u00A0": " ", // Non-breaking space
	},
};

/**
 * Default options for normalization
 */
const DEFAULT_OPTIONS = {
	smartQuotes: true,
	typographicChars: true,
	extraWhitespace: true,
	trim: true,
};

/**
 * Normalizes a string based on the specified options
 *
 * @param {string} str The string to normalize
 * @param {object} options Normalization options
 * @returns {string} The normalized string
 */
function normalizeString(str, options = DEFAULT_OPTIONS) {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	let normalized = str;

	// Replace smart quotes
	if (opts.smartQuotes) {
		for (const [smart, regular] of Object.entries(NORMALIZATION_MAPS.SMART_QUOTES)) {
			normalized = normalized.replace(new RegExp(smart, "g"), regular);
		}
	}

	// Replace typographic characters
	if (opts.typographicChars) {
		for (const [typographic, regular] of Object.entries(NORMALIZATION_MAPS.TYPOGRAPHIC)) {
			normalized = normalized.replace(new RegExp(typographic, "g"), regular);
		}
	}

	// Normalize whitespace (This part is not in the original reference but is good practice)
    // Note: The reference implementation did have this, but it was collapsing all whitespace.
    // The reference implementation's logic is preserved here.
	if (opts.extraWhitespace) {
		normalized = normalized.replace(/\s+/g, " ");
	}

	// Trim whitespace
	if (opts.trim) {
		normalized = normalized.trim();
	}

	return normalized;
}

module.exports = {
    normalizeString,
};