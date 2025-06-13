const fs = require('fs').promises;
const path = require('path');

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
      let cleanPath = args.path;
      // 如果 AI 提供的路径以 'novel/' 或 'novel\' 开头，则移除它
      if (cleanPath.startsWith('novel/') || cleanPath.startsWith('novel\\')) {
        cleanPath = cleanPath.substring('novel/'.length);
      }
      const filePath = path.join(this.novelPath, cleanPath);
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        success: true,
        content: content
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = MCPService;