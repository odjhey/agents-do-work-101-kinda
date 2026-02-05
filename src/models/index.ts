import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { CONFIG } from "../config";

export const chatGptModel = new ChatOpenAI({
	model: "gpt-4.1-nano",
	temperature: 0.1,
	maxTokens: 1000,
	timeout: 30_000,
	apiKey: CONFIG().openaiApiKey,
});

export const embeddingsModel = new OpenAIEmbeddings({
	model: "text-embedding-3-small",
	apiKey: CONFIG().openaiApiKey,
});
