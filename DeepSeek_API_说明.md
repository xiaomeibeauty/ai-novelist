# DeepSeek API 说明

本说明基于DeepSeek API 文档，旨在清晰地概述其主要功能、使用方式和关键特性。

## 1. DeepSeek API 概述

DeepSeek API 提供了一套与 **OpenAI 兼容**的接口，这意味着您可以利用现有的 OpenAI SDK (如 Python `openai`、Node.js `openai`) 或其他兼容 OpenAI API 的工具来访问 DeepSeek 的服务。

*   **基础 URL**: `https://api.deepseek.com`
    *   出于兼容性考虑，也可以设置为 `https://api.deepseek.com/v1`，但 `v1` 与模型版本无关。
*   **认证方式**: 通过 **Bearer Token** 进行 HTTP 认证。在请求头中设置 `Authorization: Bearer <您的 DeepSeek API Key>`。
*   **API Key**: 首次调用 API 前，请先在 DeepSeek 平台创建您的 API 密钥。

## 2. 可用模型

DeepSeek API 目前提供了以下主要模型用于对话补全：

*   `deepseek-chat`: 已全面升级为 **DeepSeek-V3**。这是 DeepSeek 的通用对话模型。
*   `deepseek-reasoner`: DeepSeek 最新推出的推理模型 **DeepSeek-R1**。适用于需要更强逻辑推理能力的场景。

## 3. 核心功能：对话补全 (Chat Completions)

这是 DeepSeek API 的主要功能，用于根据输入的对话历史生成回复。

*   **请求端点**: `POST https://api.deepseek.com/chat/completions`
*   **请求体参数**:
    *   `messages` (必填，数组): 对话的消息列表。每条消息是一个对象，包含 `role` 和 `content`。
        *   `role`: 消息发起者的角色，可以是 `system` (系统指令), `user` (用户输入), `assistant` (模型回复), `tool` (工具输出)。
        *   `content`: 消息的具体内容。
    *   `model` (必填，字符串): 调用的模型 ID，例如 `deepseek-chat` 或 `deepseek-reasoner`。
    *   `stream` (可选，布尔值): 如果设置为 `true`，模型将以流式（SSE）方式发送消息增量，适用于实时显示。
    *   `max_tokens` (可选，整数): 限制一次请求中模型生成补全的最大 token 数（默认 4096）。
    *   `temperature` (可选，浮点数): 采样温度，介于 0 和 2 之间。值越高，输出越随机。
    *   `top_p` (可选，浮点数): 与 `temperature` 类似，控制采样多样性。
    *   `frequency_penalty` (可选，浮点数): 介于 -2.0 和 2.0 之间，惩罚新 token 在已有文本中的出现频率。
    *   `presence_penalty` (可选，浮点数): 介于 -2.0 和 2.0 之间，惩罚新 token 是否已在已有文本中出现。
    *   `response_format` (可选，对象): 指定模型输出的格式，例如 `{"type": "json_object"}` 用于强制 JSON 输出。
    *   `stop` (可选，字符串或字符串数组): 遇到这些词时，API 将停止生成。
    *   `tools` (可选，数组): 模型可能调用的工具列表，目前仅支持 `function` 类型工具。
    *   `tool_choice` (可选，字符串或对象): 控制模型调用工具的行为 (e.g., `none`, `auto`, `required`)。

*   **响应结构**:
    *   成功响应通常包含 `id`, `choices` (模型生成的补全选择列表), `created` (时间戳), `model` 等字段。
    *   `choices` 数组中的每个元素包含 `finish_reason` (停止原因) 和 `message` (模型生成的消息)。
    *   `message` 对象包含 `content` 和 `role` (通常为 `assistant`)。

## 4. 关键特性

### 4.1. 多轮对话

DeepSeek API 是“无状态”的，服务端不记录对话上下文。因此，在进行多轮对话时，您需要在每次请求中将完整的对话历史（包括用户和模型的每一轮消息）作为一个 `messages` 数组传递给 API，以实现上下文的维持。

### 4.2. JSON 格式输出 (JSON Output)

您可以强制模型输出合法的 JSON 字符串，这对于需要结构化输出的场景非常有用。

*   **配置**: 设置 `response_format` 参数为 `{'type': 'json_object'}`。
*   **引导**: 在 `system` 或 `user` prompt 中必须包含“json”字样，并提供期望的 JSON 格式样例，以指导模型生成正确的 JSON。

### 4.3. 函数调用 (Function Calling)

Function Calling 允许模型能够调用外部工具，从而增强其能力（例如，获取实时信息、调用特定服务）。

*   **实现**: 通过 `tools` 参数向模型提供可用的函数定义列表。
*   **工作流**: 模型在必要时会返回一个 `tool_calls` 结构，指示需要调用的函数及其参数。您需要在外部执行这些函数，并将结果作为 `tool` 类型的消息传递回模型，以继续对话。

### 4.4. 流式输出

当 `stream` 参数设置为 `true` 时，API 将以 Server-Sent Events (SSE) 的形式实时发送消息增量，允许您在模型生成内容时逐步显示给用户。

## 5. 接入指南

### 5.1. 前置条件

*   **API Key**: 确保您已经从 DeepSeek 平台获取了 API 密钥。

### 5.2. Node.js (OpenAI SDK)

DeepSeek 推荐使用 OpenAI SDK 进行接入。

*   **安装**: `npm install openai`

```javascript
import OpenAI from "openai";

// for backward compatibility, you can still use `https://api.deepseek.com/v1` as `baseURL`.
const openai = new OpenAI({
    baseURL: 'https://api.deepseek.com', // DeepSeek API 的基础 URL
    apiKey: 'YOUR_DEEPSEEK_API_KEY'     // 您的 DeepSeek API Key
});

async function main() {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: "You are a helpful assistant." }],
    model: "deepseek-chat",
  });

  console.log(completion.choices[0].message.content);
}

main();
```

### 5.3. Python (OpenAI SDK)

*   **安装**: `pip3 install openai`

```python
from openai import OpenAI

client = OpenAI(api_key="<DeepSeek API Key>", base_url="https://api.deepseek.com")

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=[
        {"role": "system", "content": "You are a helpful assistant"},
        {"role": "user", "content": "Hello"},
    ],
    stream=False
)

print(response.choices[0].message.content)
```

### 5.4. CURL

适用于任何支持 cURL 的环境，常用于快速测试或命令行集成。

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <DeepSeek API Key>" \
  -d '{
        "model": "deepseek-chat",
        "messages": [
          {"role": "system", "content": "You are a helpful assistant."},
          {"role": "user", "content": "Hello!"}
        ],
        "stream": false
      }'
```

### 5.5. Axios (Node.js/浏览器)

需要先安装 `axios` 库: `npm install axios`

```javascript
const axios = require('axios');
let data = JSON.stringify({
  "messages": [
    {
      "content": "You are a helpful assistant",
      "role": "system"
    },
    {
      "content": "Hi",
      "role": "user"
    }
  ],
  "model": "deepseek-chat",
  "frequency_penalty": 0,
  "max_tokens": 2048,
  "presence_penalty": 0,
  "response_format": {
    "type": "text"
  },
  "stop": null,
  "stream": false,
  "stream_options": null,
  "temperature": 1,
  "top_p": 1,
  "tools": null,
  "tool_choice": "none",
  "logprobs": false,
  "top_logprobs": null
});

let config = {
  method: 'post',
  maxBodyLength: Infinity,
  url: 'https://api.deepseek.com/chat/completions',
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': 'Bearer <TOKEN>'
  },
  data : data
};

axios(config)
.then((response) => {
  console.log(JSON.stringify(response.data));
})
.catch((error) => {
  console.log(error);
});
```

### 5.6. 多轮对话示例

所有 DeepSeek API 都为无状态 API，因此在每次请求中，需要将完整的对话历史（包括用户和模型的每一轮消息）作为一个 `messages` 数组传递给 API，以实现上下文的维持。

```python
from openai import OpenAI
client = OpenAI(api_key="<DeepSeek API Key>", base_url="https://api.deepseek.com")

# Round 1
messages = [{"role": "user", "content": "What's the highest mountain in the world?"}]
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages
)

messages.append(response.choices[0].message)
print(f"Messages Round 1: {messages}")

# Round 2
messages.append({"role": "user", "content": "What is the second?"})
response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages
)

messages.append(response.choices[0].message)
print(f"Messages Round 2: {messages}")
```

### 5.7. JSON 输出示例

```python
import json
from openai import OpenAI

client = OpenAI(
    api_key="<your api key>",
    base_url="https://api.deepseek.com",
)

system_prompt = """
The user will provide some exam text. Please parse the "question" and "answer" and output them in JSON format.

EXAMPLE INPUT:
Which is the highest mountain in the world? Mount Everest.

EXAMPLE JSON OUTPUT:
{
    "question": "Which is the highest mountain in the world?",
    "answer": "Mount Everest"
}
"""

user_prompt = "Which is the longest river in the world? The Nile River."

messages = [{"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}]

response = client.chat.completions.create(
    model="deepseek-chat",
    messages=messages,
    response_format={
        'type': 'json_object'
    }
)

print(json.loads(response.choices[0].message.content))
```

### 5.8. 函数调用示例

```python
from openai import OpenAI

def send_messages(messages):
    response = client.chat.completions.create(
        model="deepseek-chat",
        messages=messages,
        tools=tools
    )
    return response.choices[0].message

client = OpenAI(
    api_key="<your api key>",
    base_url="https://api.deepseek.com",
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of an location, the user shoud supply a location first",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "The city and state, e.g. San Francisco, CA",
                    }
                },
                "required": ["location"]
            },
        }
    },
]

messages = [{"role": "user", "content": "How's the weather in Hangzhou?"}]
message = send_messages(messages)
print(f"User>\t {messages[0]['content']}")

tool = message.tool_calls[0]
messages.append(message)

messages.append({"role": "tool", "tool_call_id": tool.id, "content": "24℃"})
message = send_messages(messages)
print(f"Model>\t {message.content}")
```