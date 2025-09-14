const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const { Document } = require('langchain/document');

/**
 * 智能语义文本分割器
 * 基于LangChain的RecursiveCharacterTextSplitter实现语义感知的文本分割
 */
class SemanticTextSplitter {
    constructor(options = {}) {
        this.options = {
            chunkSize: 1000,          // 每个片段的最大字符数
            chunkOverlap: 200,        // 片段之间的重叠字符数
            separators: ["\n\n", "\n", "。", "！", "？", ".", "!", "?", " ", ""],
            keepSeparator: true,      // 是否保留分隔符
            ...options
        };
        
        // 初始化LangChain分割器
        this.recursiveSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: this.options.chunkSize,
            chunkOverlap: this.options.chunkOverlap,
            separators: this.options.separators,
            keepSeparator: this.options.keepSeparator
        });
    }

    /**
     * 文本预处理 - 清理和标准化文本
     * @param {string} text 原始文本
     * @returns {string} 处理后的文本
     */
    preprocessText(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }

        return text
            .replace(/\r\n/g, '\n')           // 统一换行符
            .replace(/\r/g, '\n')             // 统一换行符
            .replace(/\t/g, ' ')              // 制表符转空格
            .replace(/\s+/g, ' ')             // 合并多余空格
            .replace(/[^\w\s\u4e00-\u9fa5。！？.,!?\-:;'"()\[\]{}]/g, '') // 清理特殊字符
            .trim();
    }

    /**
     * 语义分割主方法
     * @param {string} text 要分割的文本
     * @returns {Promise<string[]>} 分割后的文本片段数组
     */
    async splitText(text) {
        try {
            const cleanedText = this.preprocessText(text);
            
            if (!cleanedText) {
                return [];
            }

            // 使用LangChain的分割器进行语义分割
            const documents = await this.recursiveSplitter.splitDocuments([
                new Document({ pageContent: cleanedText })
            ]);
            
            // 提取分割后的文本内容
            const chunks = documents.map(doc => doc.pageContent.trim());
            
            // 过滤空字符串和过短的片段
            return chunks.filter(chunk => chunk.length > 10);
            
        } catch (error) {
            console.error('[SemanticTextSplitter] 分割文本失败:', error);
            // 降级处理：使用简单的字符分割
            return this.fallbackSplit(text);
        }
    }

    /**
     * 降级分割方法 - 当语义分割失败时使用
     * @param {string} text 要分割的文本
     * @returns {string[]} 分割后的文本片段
     */
    fallbackSplit(text) {
        const chunks = [];
        const chunkSize = this.options.chunkSize;
        const chunkOverlap = this.options.chunkOverlap;
        
        for (let i = 0; i < text.length; i += chunkSize - chunkOverlap) {
            const end = Math.min(i + chunkSize, text.length);
            const chunk = text.substring(i, end).trim();
            if (chunk.length > 0) {
                chunks.push(chunk);
            }
        }
        
        return chunks;
    }

    /**
     * 批量分割文本
     * @param {string[]} texts 文本数组
     * @returns {Promise<string[][]>} 分割后的文本片段二维数组
     */
    async splitTexts(texts) {
        const results = [];
        for (const text of texts) {
            const chunks = await this.splitText(text);
            results.push(chunks);
        }
        return results;
    }

    /**
     * 获取分割统计信息
     * @param {string} text 文本
     * @returns {Promise<Object>} 统计信息
     */
    async getSplitStats(text) {
        const chunks = await this.splitText(text);
        return {
            totalChunks: chunks.length,
            avgChunkLength: chunks.reduce((sum, chunk) => sum + chunk.length, 0) / chunks.length,
            minChunkLength: Math.min(...chunks.map(chunk => chunk.length)),
            maxChunkLength: Math.max(...chunks.map(chunk => chunk.length)),
            totalCharacters: text.length
        };
    }
}

module.exports = SemanticTextSplitter;