const BaseModelAdapter = require('./adapters/baseAdapter');

class ModelRegistry {
    constructor() {
        this.adapters = {}; // { adapter_name: adapter_instance }
        this.modelMapping = {}; // { model_id: adapter_name }
    }

    /**
     * 注册一个新的模型适配器。
     * @param {string} name - 适配器名称。
     * @param {BaseModelAdapter} adapterInstance - 适配器实例。
     */
    async registerAdapter(name, adapterInstance) { // 变为 async
        if (!(adapterInstance instanceof BaseModelAdapter)) {
            throw new Error("Registered adapter must be an instance of BaseModelAdapter.");
        }
        if (this.adapters[name]) {
            console.warn(`适配器 '${name}' 已存在，将被覆盖。`);
        }

        this.adapters[name] = adapterInstance;

        // 注册此适配器支持的所有模型
        const models = await adapterInstance.listModels(); // 添加 await
        models.forEach(modelInfo => {
            const modelId = modelInfo.id;
            if (this.modelMapping[modelId] && this.modelMapping[modelId] !== name) {
                console.warn(`模型 '${modelId}' 已被适配器 '${this.modelMapping[modelId]}' 注册，将被适配器 '${name}' 覆盖。`);
            }
            this.modelMapping[modelId] = name;
            console.log(`已注册模型: ${modelId} -> ${name}`);
        });
    }

    /**
     * 根据模型ID获取对应的适配器。
     * @param {string} modelId - 模型ID。
     * @returns {BaseModelAdapter|null} 对应的适配器实例，如果未找到则返回null。
     */
    getAdapterForModel(modelId) {
        const adapterName = this.modelMapping[modelId];
        if (!adapterName) {
            return null;
        }
        return this.adapters[adapterName];
    }

    /**
     * 列出所有已注册的模型。
     * @returns {Array<Object>} 所有模型的信息列表。
     */
    async listAllModels() { // 变为 async
        let allModels = [];
        for (const adapterName in this.adapters) {
            // 需要等待每个适配器的 listModels 结果
            const adapterModels = await this.adapters[adapterName].listModels();
            allModels = allModels.concat(adapterModels);
        }
        return allModels;
    }
}

module.exports = ModelRegistry;