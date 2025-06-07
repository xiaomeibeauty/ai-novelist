const fs = require('fs').promises;
const path = require('path');

class MCPService {
  constructor(novelPath) {
    this.novelPath = novelPath;
  }

  async writeFile(args) {
    try {
      const filePath = path.join(this.novelPath, args.path);
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
      const filePath = path.join(this.novelPath, args.path);
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