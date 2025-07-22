class BaseModelAdapter {
    /**
     * 接收统一格式的聊天消息和选项，返回统一格式的 AI 响应。
     * @param {Array} messages - 聊天消息数组。
     * @param {Object} options - 聊天选项。
     * @returns {Promise<Object>} 统一格式的 AI 响应。
     */
    /**
     * 接收统一格式的聊天消息和选项，返回统一格式的 AI 响应。
     * @param {Array} messages - 聊天消息数组。
     * @param {Object} options - 聊天选项。
     * @returns {AsyncIterable<Object>} 统一格式的 AI 响应的异步迭代器。
     */
    async *generateCompletion(messages, options) {
        throw new Error("Method 'generateCompletion()' must be implemented.");
    }

    /**
     * 返回该适配器支持的模型列表。
     * @returns {Array<Object>} 模型列表，每个模型包含 id 和其他信息。
     */
    listModels() {
        throw new Error("Method 'listModels()' must be implemented.");
    }

    /**
     * 获取特定模型的详细信息。
     * @param {string} modelId - 模型ID。
     * @returns {Object} 模型的详细信息。
     */
    getModelInfo(modelId) {
        throw new Error("Method 'getModelInfo()' must be implemented.");
    }
}

module.exports = BaseModelAdapter;