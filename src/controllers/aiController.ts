import { Request, RequestHandler, Response } from "express";
import { generateResponse, genrateVectorStore } from "../utils/generateReesponse";

interface PromptBody {
    prompt: string;
}

interface SuccessResponse {
  generatedResponse: string | any;
}

interface ErrorResponse {
  message: string;
}


export async function getResponse(req: Request<{},{},PromptBody>, res: Response<SuccessResponse | ErrorResponse>) {
  try {
    const { prompt } = req.body;
    const vectorStore = await genrateVectorStore();
    const docs = await vectorStore.similaritySearch(prompt,5);
    const context = docs.map((d)=>d.pageContent).join("\n")
    const response = await generateResponse(context,prompt);
    console.log(docs)
    return res.status(200).json({
       generatedResponse: response!
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
}
