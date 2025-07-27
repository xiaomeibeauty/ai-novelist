const fs = require('fs').promises;
const path = require('path');
const { MultiSearchReplaceStrategy } = require('./tool-service/diff/multi-search-replace.js');
const ripgrepService = require('./tool-service/ripgrep-service.js');

class MCPService {
  constructor(novelPath) {
    this.novelPath = novelPath;
  }

  async writeFile(args) {
    try {
      let cleanPath = args.path;
      // 如果 AI 提供的路径以 'novel/' 或 'novel\' 开头，则移除它，因为 this.novelPath 已经包含了 'novel' 目录
      if (cleanPath.startsWith('novel/') || cleanPath.startsWith('novel\\')) {
        cleanPath = cleanPath.substring('novel/'.length);
      }
      const filePath = path.join(this.novelPath, cleanPath);
      // 确保文件所在的目录存在
      const dirForFile = path.dirname(filePath);
      await fs.mkdir(dirForFile, { recursive: true });
      await fs.writeFile(filePath, args.content, 'utf-8');
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async readFile(args) {
    try {
      const { path: relPath, start_paragraph, end_paragraph } = args;
      let cleanPath = relPath;
      
      if (cleanPath.startsWith('novel/') || cleanPath.startsWith('novel\\')) {
        cleanPath = cleanPath.substring('novel/'.length);
      }
      
      const filePath = path.join(this.novelPath, cleanPath);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      let paragraphs = fileContent.split('\n');
      
      const start = start_paragraph ? parseInt(start_paragraph, 10) - 1 : 0;
      const end = end_paragraph ? parseInt(end_paragraph, 10) : paragraphs.length;
      
      if (start < 0 || end > paragraphs.length || start > end) {
          throw new Error("提供的段落号范围无效。");
      }

      const selectedParagraphs = paragraphs.slice(start, end);
      
      const contentWithParagraphNumbers = selectedParagraphs.map((paragraph, index) => {
        const paragraphNumber = start + index + 1;
        return `${paragraphNumber} | ${paragraph}`;
      }).join('\n');
      
      return {
        success: true,
        content: contentWithParagraphNumbers
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async insertContent(args) {
    try {
      const { path: relPath, paragraph, content } = args;
      // 如果 AI 提供的路径以 'novel/' 或 'novel\' 开头，则移除它
      let cleanPath = relPath;
      if (cleanPath.startsWith('novel/') || cleanPath.startsWith('novel\\')) {
        cleanPath = cleanPath.substring('novel/'.length);
      }
      const filePath = path.join(this.novelPath, cleanPath);
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const paragraphs = fileContent.split('\n');
      
      const paragraphNumber = parseInt(paragraph, 10);
      if (isNaN(paragraphNumber) || paragraphNumber < 0) {
        throw new Error('无效的段落号。');
      }

      if (paragraphNumber === 0) {
        paragraphs.push(content);
      } else {
        paragraphs.splice(paragraphNumber - 1, 0, content);
      }
      
      const updatedContent = paragraphs.join('\n');
      await fs.writeFile(filePath, updatedContent, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async searchAndReplace(args) {
    try {
      const { path: relPath, search, replace, use_regex, ignore_case } = args;
      // 如果 AI 提供的路径以 'novel/' 或 'novel\' 开头，则移除它
      let cleanPath = relPath;
      if (cleanPath.startsWith('novel/') || cleanPath.startsWith('novel\\')) {
        cleanPath = cleanPath.substring('novel/'.length);
      }
      const filePath = path.join(this.novelPath, cleanPath);
      const fileContent = await fs.readFile(filePath, 'utf-8');

      const flags = ignore_case ? 'gi' : 'g';
      const searchPattern = use_regex ? new RegExp(search, flags) : new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      
      const updatedContent = fileContent.replace(searchPattern, replace);
      
      await fs.writeFile(filePath, updatedContent, 'utf-8');
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async applyDiff(args) {
    try {
        const { path: relPath, diff } = args;
        if (!diff || typeof diff !== 'string') {
            throw new Error("Diff content is invalid.");
        }

        // 如果 AI 提供的路径以 'novel/' 或 'novel\' 开头，则移除它
        let cleanPath = relPath;
        if (cleanPath.startsWith('novel/') || cleanPath.startsWith('novel\\')) {
          cleanPath = cleanPath.substring('novel/'.length);
        }
        const filePath = path.join(this.novelPath, cleanPath);

        // 1. Read original content
        const originalContent = await fs.readFile(filePath, 'utf-8');

        // 2. Instantiate and use the new strategy
        const strategy = new MultiSearchReplaceStrategy(0.9);
        const result = await strategy.applyDiff(originalContent, diff);

        // 3. Check the result from the strategy
        if (result.success) {
            // 4. On success, write the updated content back to the file
            await fs.writeFile(filePath, result.content, 'utf-8');
            if (result.failParts && result.failParts.length > 0) {
                const errorDetails = result.failParts.map(p => p.error).join('; ');
                return { success: true, notice: `Completed with some failures: ${errorDetails}` };
            }
            return { success: true };
        } else {
            // 5. On failure, throw an error with the detailed message from the strategy
            const errorMessage = result.error || "An unknown error occurred during diff application.";
            const errorDetails = result.failParts ? result.failParts.map(p => p.error).join('; ') : 'No details';
            throw new Error(`Failed to apply diff: ${errorMessage}\nDetails: ${errorDetails}`);
        }

    } catch (error) {
        return { success: false, error: error.message };
    }
  }

  async searchFiles(args) {
    try {
        const { path: dirPath, regex, file_pattern } = args;
        // 如果 AI 提供的路径以 'novel/' 或 'novel\' 开头，则移除它，因为 this.novelPath 已经包含了 'novel' 目录
        let cleanDirPath = dirPath;
        if (cleanDirPath.startsWith('novel/') || cleanDirPath.startsWith('novel\\')) {
            cleanDirPath = cleanDirPath.substring('novel/'.length);
        } else if (cleanDirPath === 'novel') {
            // 如果路径就是 'novel' 本身, 意味着搜索 novel 根目录, 此时 cleanDirPath 应该为空字符串
            cleanDirPath = '';
        }

        // Always base the search inside this.novelPath for security and consistency.
        const absolutePath = path.join(this.novelPath, cleanDirPath);

        // We pass novelPath as the CWD to get relative paths in the results from the 'novel' root.
        const results = await ripgrepService.regexSearchFiles(this.novelPath, absolutePath, regex, file_pattern);
        return { success: true, results: results };
    } catch (error) {
        return { success: false, error: error.message };
    }
  }
}

module.exports = MCPService;