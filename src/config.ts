import "dotenv/config";
import { z } from "zod/v4";

export const CONFIG = () => {
	const schema = z.object({
		openaiApiKey: z.string().min(1, "OPENAI_API_KEY is required"),
	});

	const parsed = schema.parse({
		openaiApiKey: process.env.OPENAI_API_KEY,
	});

	return parsed;
};
