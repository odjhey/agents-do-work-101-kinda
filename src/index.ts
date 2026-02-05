import { LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain";
import { register } from "@arizeai/phoenix-otel";
import * as CallbackManagerModule from "@langchain/core/callbacks/manager";
import {
	AIMessage,
	SystemMessage,
	type ToolMessage,
} from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import {
	type ConditionalEdgeRouter,
	END,
	type GraphNode,
	MessagesValue,
	ReducedValue,
	START,
	StateGraph,
	StateSchema,
} from "@langchain/langgraph";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { z } from "zod/v4";
import { CONFIG } from "./config";
import { getVectorStore } from "./vector";

const provider = register({ projectName: "agents-do-work-101" });

const lcInstrumentation = new LangChainInstrumentation();
lcInstrumentation.manuallyInstrument(CallbackManagerModule);

process.on("beforeExit", async () => {
	await provider.shutdown();
});

// -----------------------------------------------------------------

const State = new StateSchema({
	messages: MessagesValue,
	userIdentity: new ReducedValue(
		z.object({
			name: z.string().min(1),
			designation: z.string().min(1),
		}),
		{
			// note: or could just use immer or something for deep merges
			reducer: (cur, next) => ({ ...cur, ...next }),
		},
	),
	llmCalls: new ReducedValue(z.number().default(0), {
		reducer: (x, y) => x + y,
	}),
});

const omniModelChatGptLlm = new ChatOpenAI({
	model: "gpt-4.1-nano",
	temperature: 0.1,
	maxTokens: 1000,
	timeout: 30_000,
	apiKey: CONFIG().openaiApiKey,
});

const embeddingsModel = new OpenAIEmbeddings({
	model: "text-embedding-3-small",
	apiKey: CONFIG().openaiApiKey,
});

const vectorStore = await getVectorStore(embeddingsModel);

const jobPostsSearchTool = tool(
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

const toolsByName = {
	[jobPostsSearchTool.name]: jobPostsSearchTool,
};
const tools = Object.values(toolsByName);
const omniModelWithTools = omniModelChatGptLlm.bindTools(tools);

const userIdent: GraphNode<typeof State> = async (state) => {
	// In a real-world scenario, this could fetch user data from a database
	// For this example, we'll return a static user identity
	return {
		userIdentity: {
			name: "Alice",
			designation: "Developer - Erlang and BEAM",
		},
	};
};

const llmCall: GraphNode<typeof State> = async (state) => {
	const userIdentPartialPrompt = `You are speaking to a user named ${state.userIdentity.name} who is a ${state.userIdentity.designation}. Use this information to tailor your responses appropriately.`;

	const response = await omniModelWithTools.invoke([
		new SystemMessage(
			[
				`You are an expert resourceful job searching assistant. `,
				`Right now, your goal is to help the user without asking much more questions,`,
				`You instead rely on tools provided.`,
				userIdentPartialPrompt,
			].join("\n"),
		),
		...state.messages,
	]);

	return {
		messages: [response],
		llmCalls: 1,
	};
};

const toolNode: GraphNode<typeof State> = async (state) => {
	const lastMessage = state.messages.at(-1);

	if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
		return { messages: [] };
	}

	const result: ToolMessage[] = [];
	for (const toolCall of lastMessage.tool_calls ?? []) {
		// note: blindly trust that tool name passed is valid
		const toolName = toolCall.name as keyof typeof toolsByName;
		const tool = toolsByName[toolName];
		const toolResult = await tool.invoke(toolCall);
		result.push(toolResult);
	}

	// question: can we update other parts of the state here? should we?
	return {
		messages: result,
	};
};

const shouldContinue: ConditionalEdgeRouter<typeof State> = (state) => {
	const lastMessage = state.messages.at(-1);

	// Check if it's an AIMessage before accessing tool_calls
	if (!lastMessage || !AIMessage.isInstance(lastMessage)) {
		return END;
	}

	// note: hard limit for safety
	if (state.llmCalls > 10) {
		return END;
	}

	// If the LLM makes a tool call, then perform an action
	if (lastMessage.tool_calls?.length) {
		return "toolNode";
	}

	// Otherwise, we stop (reply to the user)
	return END;
};

const graph = new StateGraph(State)
	.addNode("llmCall", llmCall)
	.addNode("userIdent", userIdent)
	.addNode("toolNode", toolNode)

	.addEdge(START, "userIdent")
	.addEdge("userIdent", "llmCall")
	.addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
	.addEdge("toolNode", "llmCall")

	.compile();

await graph.invoke({
	messages: [
		{
			role: "user",
			content: "Could help me search a proper job role fit for me?",
			// content: "What tools are available at your disposal?",
		},
	],
});
console.log("done!!!");
