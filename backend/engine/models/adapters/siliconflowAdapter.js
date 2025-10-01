const BaseModelAdapter = require('../BaseModelAdapter');
const OpenAI = require('openai');

class SiliconFlowAdapter extends BaseModelAdapter {
  /**
   * 硅基流动适配器构造函数
   * @param {Object} config - 适配器配置
   * @param {string} config.apiKey - 硅基流动API密钥
   * @param {string} [config.baseURL="https://api.siliconflow.cn/v1"] - API基础URL
   */
  constructor(config) {
    const adapterConfig = {
      providerId: 'siliconflow',
      providerName: 'SiliconFlow',
      providerType: 'siliconflow',
      isEnabled: true,
      ...config
    };

    super(adapterConfig);

    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL || 'https://api.siliconflow.cn/v1';
    this.client = null; // 延迟初始化
    this.providerModels = {}; // 模型缓存
  }

  /**
   * 获取 OpenAI 客户端（延迟初始化）
   * @returns {OpenAI|null} OpenAI 客户端实例，如果没有API密钥则返回null
   * @private
   */
  _getClient() {
    if (!this.client) {
      if (!this.apiKey) {
        console.warn("SiliconFlow API key is not set. Please configure it in the settings.");
        return null; // 返回null而不是抛出错误
      }

      this.client = new OpenAI({
        apiKey: this.apiKey,
        baseURL: this.baseURL,
        defaultHeaders: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "accept": "application/json",
          "content-type": "application/json"
        },
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
    let modelId = options.model || 'siliconflow/auto'; // 直接使用 options 中的 model

    // 在发送到 SiliconFlow API 之前，移除内部使用的 'siliconflow/' 前缀
    if (modelId.startsWith('siliconflow/')) {
      modelId = modelId.substring('siliconflow/'.length);
    }

    const completionParams = {
      model: modelId,
      messages: messages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens,
      stream: options.stream !== false, // 默认启用流式
      // 硅基流动特有参数
      // enable_thinking: options.enable_thinking || false, // 暂时注释，不向服务器发送此参数，未来开发"关闭思考模式"功能时再启用
      thinking_budget: options.thinking_budget || 4096,
      min_p: options.min_p,
      top_p: options.top_p || 0.7,
      top_k: options.top_k,
      frequency_penalty: options.frequency_penalty,
      n: options.n || 1,
      response_format: options.response_format,
      stop: options.stop
    };

    // 传递工具相关参数
    if (options.tools && options.tools.length > 0) {
      completionParams.tools = options.tools;
      completionParams.tool_choice = options.tool_choice || "auto";
    }

    // 添加调试日志 - 打印完整请求体
    console.log('=== SiliconFlow API Request Body ===');
    console.log('URL:', this.baseURL + '/chat/completions');
    console.log('Headers:', {
      'accept': 'application/json',
      'content-type': 'application/json',
      'authorization': 'Bearer ' + (this.apiKey ? this.apiKey.substring(0, 10) + '...' : '未设置')
    });
    console.log('完整的请求参数:');
    console.log('传入的 options 参数:', JSON.stringify(options, null, 2));
    console.log('最终生成的 completionParams:', JSON.stringify(completionParams, null, 2));
    console.log('====================================');

    try {
      const client = this._getClient();

      if (completionParams.stream) {
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
      console.error('SiliconFlow API call failed:', error);
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
    try {
      const client = this._getClient();
      const modelsList = await client.models.list();
      
      // 检查 modelsList 和 modelsList.data 是否存在
      if (!modelsList || !modelsList.data) {
        console.warn('SiliconFlow API returned empty models list, using default models');
        return this._getDefaultModels();
      }
      
      const models = Array.from(modelsList.data);
      
      // 更新内部的 providerModels 缓存
      models.forEach(model => {
        this.providerModels[model.id] = { 
          ...model, 
          provider: this.providerId,
          name: model.id // 使用模型ID作为名称
        };
      });

      // 返回符合格式的列表
      return Object.values(this.providerModels);
    } catch (error) {
      console.error('Failed to fetch models from SiliconFlow:', error);
      // 如果获取失败，返回已知的默认模型
      return this._getDefaultModels();
    }
  }

  /**
   * 获取默认模型列表
   * @returns {Array<Object>} 默认模型列表
   * @private
   */
  _getDefaultModels() {
    return [{
      id: 'siliconflow/auto',
      name: 'Auto (best model)',
      description: 'Automatically selects the best model for the task.',
      provider: 'siliconflow'
    }];
  }

  /**
   * 获取特定模型的详细信息
   * @param {string} modelId - 模型ID
   * @returns {Promise<Object>} 模型详细信息
   */
  async getModelInfo(modelId) {
    // 先从缓存中查找
    if (this.providerModels[modelId]) {
      return this.providerModels[modelId];
    }

    // 如果缓存中没有，尝试获取所有模型
    const models = await this.listModels();
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      throw new Error(`模型 '${modelId}' 不存在于 SiliconFlowAdapter 中。`);
    }
    
    return model;
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

  // SiliconFlow 特定验证 - API密钥改为可选，允许无密钥注册
  // 如果没有API密钥，适配器仍然可以注册，但无法实际使用
  if (!config.apiKey) {
    console.warn('SiliconFlow API key is not set. Adapter will be registered but cannot be used until configured.');
  }

  return { isValid: true, errors }; // 总是返回有效，允许注册
}

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   * @returns {Promise<void>}
   */
  async updateConfig(newConfig) {
    // 重置客户端以应用新配置
    if (newConfig.apiKey || newConfig.baseURL) {
      this.client = null;
      this.providerModels = {}; // 清空模型缓存
    }
    
    await super.updateConfig(newConfig);
  }
}

module.exports = SiliconFlowAdapter;