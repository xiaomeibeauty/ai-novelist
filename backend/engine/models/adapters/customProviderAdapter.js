const BaseModelAdapter = require('../BaseModelAdapter');
const OpenAI = require('openai');

class CustomProviderAdapter extends BaseModelAdapter {
  /**
   * 自定义提供商适配器构造函数
   * @param {Object} config - 适配器配置
   * @param {string} config.providerName - 提供商唯一名称
   * @param {string} config.apiKey - API密钥
   * @param {string} config.baseURL - API基础URL
   * @param {string} config.modelId - 默认模型ID
   * @param {string} [config.modelName] - 模型显示名称
   * @param {string} [config.modelDescription] - 模型描述
   * @param {number} [config.maxTokens] - 最大token数
   * @param {string} [config.providerType="openai"] - 提供商类型
   */
  constructor(config) {
    // 验证必需配置
    if (!config.providerName || !config.apiKey || !config.baseURL || !config.modelId) {
      throw new Error("CustomProviderAdapter requires providerName, apiKey, baseURL, and modelId in its configuration.");
    }

    const adapterConfig = {
      providerId: config.providerName.toLowerCase().replace(/\s+/g, '-'),
      providerName: config.providerName,
      providerType: config.providerType || 'openai',
      isEnabled: true,
      ...config
    };

    super(adapterConfig);

    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.modelId = config.modelId;
    this.client = null; // 延迟初始化

    // 创建模型信息
    this.modelInfo = {
      id: config.modelId,
      name: config.modelName || config.modelId,
      description: config.modelDescription || `Custom model: ${config.modelId}`,
      provider: this.providerId,
      maxTokens: config.maxTokens
    };
  }

  /**
   * 获取 OpenAI 客户端（延迟初始化）
   * @returns {OpenAI} OpenAI 客户端实例
   * @private
   */
  _getClient() {
    if (!this.client) {
      if (!this.apiKey) {
        throw new Error(`${this.providerName} API key is not set. Please configure it in the settings.`);
      }

      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        timeout: 30000,
        maxRetries: 2
      });
    }
    return this.client;
  }

  /**
   * 生成AI完成响应
   * @param {Array} messages - 聊天消息数组
   * @param {Object} options - 生成选项
   * @returns {AsyncIterable<Object>} 统一格式的AI响应异步迭代器
   */
  async *generateCompletion(messages, options = {}) {
    const modelId = options.model || this.modelId;
    const stream = options.stream !== false; // 默认启用流式

    const completionParams = {
      model: modelId,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens,
      stream: stream,
      ...(options.tools && { tools: options.tools }),
      ...(options.tool_choice && { tool_choice: options.tool_choice }),
    };

    try {
      const client = this._getClient();

      if (stream) {
        const stream = await client.chat.completions.create(completionParams);
        yield* this._transformStreamToGenerator(stream);
      } else {
        const response = await client.chat.completions.create(completionParams);
        const message = response.choices[0]?.message;
        
        if (message) {
          yield {
            type: "text",
            text: message.content || '',
            ...(message.tool_calls && { tool_calls: message.tool_calls })
          };

          if (response.usage) {
            yield {
              type: "usage",
              inputTokens: response.usage.prompt_tokens || 0,
              outputTokens: response.usage.completion_tokens || 0,
            };
          }
        }
      }
    } catch (error) {
      console.error(`${this.providerName} API call failed:`, error);
      throw this._standardizeError(error, 'API call failed');
    }
  }

  /**
   * 转换流式响应为生成器
   * @param {AsyncIterable} stream - OpenAI 流式响应
   * @returns {AsyncIterable<Object>} 标准化响应生成器
   * @private
   */
  async *_transformStreamToGenerator(stream) {
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield {
          type: "text",
          text: delta.content
        };
      }

      if (delta?.tool_calls) {
        yield {
          type: "tool_calls",
          tool_calls: delta.tool_calls,
        };
      }

      if (chunk.usage) {
        yield {
          type: "usage",
          inputTokens: chunk.usage.prompt_tokens || 0,
          outputTokens: chunk.usage.completion_tokens || 0,
        };
      }
    }
  }

  /**
   * 列出提供商支持的所有模型
   * @returns {Promise<Array<Object>>} 模型信息列表
   */
  async listModels() {
    // 自定义提供商通常只支持一个模型
    return [this.modelInfo];
  }

  /**
   * 获取特定模型的详细信息
   * @param {string} modelId - 模型ID
   * @returns {Promise<Object>} 模型详细信息
   */
  async getModelInfo(modelId) {
    if (modelId !== this.modelId) {
      throw new Error(`模型 '${modelId}' 不存在于 ${this.providerName} 适配器中。`);
    }
    return this.modelInfo;
  }

  /**
   * 配置验证（重写父类方法）
   * @param {Object} config - 配置对象
   * @returns {{isValid: boolean, errors: string[]}} 验证结果
   */
  validateConfig(config) {
    const errors = [];
    
    // 基础验证
    const baseValidation = super.validateConfig(config);
    if (!baseValidation.isValid) {
      return baseValidation;
    }

    // 自定义提供商特定验证
    if (!config.apiKey) {
      errors.push('apiKey is required for custom provider adapter');
    }
    if (!config.baseURL) {
      errors.push('baseURL is required for custom provider adapter');
    }
    if (!config.modelId) {
      errors.push('modelId is required for custom provider adapter');
    }

    // URL 格式验证
    if (config.baseURL) {
      try {
        new URL(config.baseURL);
      } catch (error) {
        errors.push('baseURL must be a valid URL');
      }
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   * @returns {Promise<void>}
   */
  async updateConfig(newConfig) {
    // 重置客户端以应用新配置
    if (newConfig.apiKey || newConfig.baseURL || newConfig.modelId) {
      this.client = null;
      
      // 更新模型信息
      if (newConfig.modelId) {
        this.modelId = newConfig.modelId;
        this.modelInfo.id = newConfig.modelId;
        this.modelInfo.name = newConfig.modelName || newConfig.modelId;
        this.modelInfo.description = newConfig.modelDescription || `Custom model: ${newConfig.modelId}`;
        this.modelInfo.maxTokens = newConfig.maxTokens;
      }
    }
    
    await super.updateConfig(newConfig);
  }

  /**
   * 获取提供商元数据（重写父类方法）
   * @returns {Object} 提供商元数据
   */
  getProviderMetadata() {
    return {
      ...super.getProviderMetadata(),
      baseURL: this.baseURL,
      modelId: this.modelId
    };
  }
}

module.exports = CustomProviderAdapter;