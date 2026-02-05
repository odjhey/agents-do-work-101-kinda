import "dotenv/config";
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
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod/v4";

const CONFIG = () => {
	const schema = z.object({
		openaiApiKey: z.string().min(1, "OPENAI_API_KEY is required"),
	});

	const parsed = schema.parse({
		openaiApiKey: process.env.OPENAI_API_KEY,
	});

	return parsed;
};

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

const rolesLibraryTool = tool(
	({ query }) => {
		// In a real-world scenario, this would query a database/RAG or some api
		return `Available roles and projects
		- PHP Developer for project XYZ - Backend development using PHP and MySQL.
		- Node JS Backend with typescript for project ABC - Building scalable backend services for a real estate company.
		- Elixir Developer for project TELCO - Working on high-performance applications using Elixir and Phoenix for a telco company.
		`;
	},
	{
		name: "roles_projects_lookup",
		description: "look into available roles and projects we have.",
		schema: z.object({
			query: z.string().min(1),
		}),
	},
);

const toolsByName = {
	[rolesLibraryTool.name]: rolesLibraryTool,
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
				"You are an expert adviser based on user preferences and information you have. You care not to overfit the user's information when making decisions.",
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
			content:
				"Could help me with a next project we should take within the company",
		},
	],
});
console.log("done!!!");
