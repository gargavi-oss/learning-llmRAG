import dotenv from "dotenv"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { Annotation, END, GraphNode, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { TavilySearch } from "@langchain/tavily";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises"

dotenv.config();

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  prompt: Annotation<string>(),
});

const webSearchTool = new TavilySearch({
  maxResults: 5,
  topic: "general",
})

const checkPointer = new MemorySaver()

export const currentDateTimeTool = tool(
  async () => {
    const now = new Date();

    return {
      date: now.toLocaleDateString("en-IN"),
      time: now.toLocaleTimeString("en-IN"),
      iso: now.toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  },
  {
    name: "get_current_datetime",
    description: "Returns the current date, time, and timezone.",
    schema: z.object({}),
  }
);

export const calculatorTool = tool(
  async ({ expression }) => {
    try {
      const result = Function(`"use strict"; return (${expression})`)();

      return result.toString();
    } catch {
      return "Invalid mathematical expression.";
    }
  },
  {
    name: "calculator",
    description: "Evaluate a mathematical expression.",
    schema: z.object({
      expression: z.string(),
    }),
  }
);
export const fileReadTool = tool(
  async ({ path }) => {
    return await fs.readFile(path, "utf8");
  },
  {
    name: "read_file",
    description: "Read a text file.",
    schema: z.object({
      path: z.string(),
    }),
  }
);

export const fileWriteTool = tool(
  async ({ path, content }) => {
    await fs.writeFile(path, content);

    return "File written successfully.";
  },
  {
    name: "write_file",
    description: "Write content to a file.",
    schema: z.object({
      path: z.string(),
      content: z.string(),
    }),
  }
);



const tools:any = [webSearchTool,currentDateTimeTool,calculatorTool,fileReadTool,fileWriteTool]
const toolNode = new ToolNode(tools)


const llm = new ChatGoogleGenerativeAI({
    model: "gemini-2.5-flash",
    temperature: 0.8,
    maxRetries: 2,
    apiKey: process.env.GEMINI_API_KEY,
})
const llmWithTools = llm.bindTools(tools);
const callLLm: GraphNode<typeof State> = async (state)=>{
    console.log(state)
     const aiMsg = await llmWithTools.invoke([
  {
    role: "system",
    content:
      "You are a technical development assistant made by Avi. Your name is Jarvis.",
  },
  ...state.messages,
])
return {messages: [aiMsg]}
}

function shouldContinue(state: typeof State.State) {
  const lastMessage = state.messages[state.messages.length - 1];

   if (
    lastMessage instanceof AIMessage &&
    lastMessage.tool_calls!.length > 0
  ) {
    return "tools";
  }

  return END;
}

const graph = new StateGraph(State)
  .addNode("llm", callLLm)
  .addNode("tools", toolNode)
  .addEdge(START, "llm")
  .addConditionalEdges("llm", shouldContinue)
  .addEdge("tools", "llm")
  .compile({checkpointer:checkPointer});


export async function generateResponse(prompt: string) {
    const result = await graph.invoke({
    messages: [new HumanMessage(prompt)]
},{configurable:{thread_id:"user12"}});

const last = result.messages[result.messages.length - 1];

return result;

}

