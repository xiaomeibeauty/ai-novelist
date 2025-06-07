// 定义 AI 工具描述
const tools = [
  {
    type: "function",
    function: {
      name: "write_file",
      description: "将内容写入指定文件。如果文件不存在则创建，如果存在则覆盖。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "要写入的文件路径，路径应相对于**工作区目录**，例如需要在工作区目录下写入'测试文件夹/Untitled.txt'，则给出的path参数为'测试文件夹/Untitled.txt'。"
          },
          content: {
            type: "string",
            description: "要写入文件的内容。"
          }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "读取指定文件的内容。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "要读取的文件路径，路径应相对于**工作区目录**。例如需要在工作区目录下读取'测试文件夹/Untitled.txt'，则给出的path参数为'测试文件夹/Untitled.txt'。"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "end_task",
      description: "表示当前多轮工具调用任务已完成，AI将给出最终回复并结束当前对话循环。",
      parameters: {
        type: "object",
        properties: {
          final_message: {
            type: "string",
            description: "AI给出的最终总结性回复。"
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ask_user_question",
      description: "当AI需要用户提供更多信息时，向用户提问并提供可选答案。",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "要向用户提出的问题。"
          },
          options: {
            type: "array",
            items: { type: "string" },
            description: "可选的答案列表，用户可以选择其中一个。如果为空，用户可以自由回复。"
          }
        },
        required: ["question"]
      }
    }
  }
];

module.exports = tools;