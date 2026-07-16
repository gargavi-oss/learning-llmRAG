import dotenv from "dotenv"
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai"
import { Annotation, END, GraphNode, MemorySaver, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { TavilySearch } from "@langchain/tavily";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import fs from "fs/promises"
import { PDFParse } from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { TaskType } from "@google/generative-ai";
import { QdrantVectorStore } from "@langchain/qdrant";

dotenv.config();

const State = Annotation.Root({
  ...MessagesAnnotation.spec,
  context: Annotation<string>(),
});


const webSearchTool = new TavilySearch({
  maxResults: 5,
  topic: "general",
})

const checkPointer = new MemorySaver();

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: "gemini-embedding-001", // 768 dimensions
  taskType: TaskType.RETRIEVAL_DOCUMENT,
  title: "Document title",
  apiKey: process.env.GEMINI_API_KEY,
});

export async function genrateVectorStore(){
const vectorStore = await QdrantVectorStore.fromExistingCollection(embeddings, {
  url: process.env.QDRANT_URL,
  collectionName: "grocery-store",
});

return vectorStore;
}



async function uploadDetails(){
  const pdfPath = "/Users/avigarg/backendDevelopment/course/level4/FreshMart_Grocery_Catalog_20_Pages.pdf"
  const buffer= await fs.readFile(pdfPath);
  const pdfResult =new PDFParse({ data: buffer });
  const result = await pdfResult.getText();
  const text = result.text
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 100
  })
  const docs = await splitter.createDocuments([text])

  const vectorStore = await genrateVectorStore();
  await vectorStore.addDocuments(docs);
}

// uploadDetails()


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
const callLLm: GraphNode<typeof State> = async (state) => {
  const history = state.messages.filter(
    (message) => !(message instanceof SystemMessage)
  );

  const aiMsg = await llmWithTools.invoke([
    new SystemMessage(`
${systemPrompt}

Retrieved Context:
${state.context}
    `),
    ...history,
  ]);

  return {
    messages: [aiMsg],
  };
};

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


const systemPrompt = `
You are Jarvis, an AI-powered Grocery Store RAG Assistant created by Avi.

Your purpose is to help customers by answering questions ONLY using the retrieved grocery store knowledge provided in the context.

Rules:
1. Use ONLY the information present in the provided context.
2. Never use your own knowledge, assumptions, or external information.
3. If the answer cannot be found in the provided context, respond exactly:
   "I'm sorry, I couldn't find that information in the store's catalog."
4. Never invent products, prices, discounts, availability, brands, or policies.
5. If multiple matching products exist, list only those found in the context.
6. If the customer asks about prices, provide only the prices present in the context.
7. If the customer asks about product descriptions, ingredients, or availability, answer only from the context.
8. If the context contains insufficient information, clearly state that the information is unavailable.
9. Keep responses concise, friendly, and helpful.
10. Do not mention that you are using retrieved context unless the user asks.

Response Guidelines:
- Use bullet points when listing products.
- Mention product name, price, and description if available.
- Format prices using the currency provided in the context.
- Do not add recommendations unless they are explicitly supported by the context.

Remember:
The provided context is the single source of truth. If it is not in the context, you do not know it.
`;

export async function generateResponse(
  context: string,
  prompt: string
) {
  const result = await graph.invoke(
    {
      context,
      messages: [new HumanMessage(prompt)],
    },
    {
      configurable: {
        thread_id: "user12",
      },
    }
  );

  const last = result.messages[result.messages.length - 1];
  return last.content;
}
