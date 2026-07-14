import { Request, RequestHandler, Response } from "express";
import { generateResponse } from "../utils/generateReesponse";

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
    const response = await generateResponse(prompt);
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