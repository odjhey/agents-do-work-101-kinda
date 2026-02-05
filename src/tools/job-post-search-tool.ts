import { tool } from "@langchain/core/tools";
import { z } from "zod/v4";
import { embeddingsModel } from "../models";
import { getVectorStore } from "../vector";

const vectorStore = await getVectorStore(embeddingsModel);

export const jobPostsSearchTool = tool(
	async ({ query }) => {
		const hits = await vectorStore.similaritySearch(query, 5);
		if (hits.length === 0) {
			return "No relevant job posts found.";
		}
		return [
			"Relevant job posts found is shown below, it contains job id, job title, and descriptions",
			hits.map((hit, i) => `${i + 1}. ${hit.pageContent}`).join("\n"),
		].join("\n");
	},
	{
		name: "job_posts_search",
		description: "search for available job posts based on user query",
		schema: z.object({
			query: z.string().min(1),
		}),
	},
);
