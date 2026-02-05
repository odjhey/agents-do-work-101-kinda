import {
	AIMessage,
	SystemMessage,
	type ToolMessage,
} from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
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
import { z } from "zod/v4";
import { chatGptModel } from "./models";
import { tools, toolsByName } from "./tools";

export type PromptId = "job_role_v2" | "job_role_v1";
export type MyConfig = RunnableConfig & {
	configurable?: {
		promptId?: PromptId;
		experiment?: string;
		evalCaseId?: string;
	};
};

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

const omniModelChatGptLlm = chatGptModel;
const omniModelWithTools = omniModelChatGptLlm.bindTools(tools);

const userIdent: GraphNode<typeof State> = async (state) => {
	// Do nothiing for now, we off-loaded setting identity info outside the graph, before invoke
	return {
		// userIdentity: {
		// 	name: "Alice",
		// 	designation: "Developer - Erlang and BEAM",
		// },
	};
};

const llmCall: GraphNode<typeof State> = async (state, config?: MyConfig) => {
	const userIdentPartialPrompt = `You are speaking to a user named ${state.userIdentity.name} who is a ${state.userIdentity.designation}. Use this information to tailor your responses appropriately.`;

	const variantPrompts: Record<PromptId, string> = {
		job_role_v1: `Based on the user's background and skills, suggest suitable job roles that align with their experience. Provide a brief explanation for each suggested role.`,
		job_role_v2: `Considering the user's expertise and career aspirations, recommend job roles that would be a great fit. Include insights on why these roles are appropriate and how they align with the user's skills.`,
	};

	const response = await omniModelWithTools.invoke(
		[
			new SystemMessage(
				[
					"You are an expert resourceful job searching assistant. ",
					variantPrompts[config?.configurable?.promptId ?? "job_role_v1"],
					"Right now, your goal is to help the user without asking much more questions,",
					"You instead rely on tools provided.",
					"If at the end we cannot help the user, just say so.",
					"No need to inquire the user further, but make sure that tool use options is exhausted.",
					"Reply with the job posting ID, if none found, just say so",
					userIdentPartialPrompt,
				].join("\n"),
			),
			...state.messages,
		],
		config,
	);

	return {
		messages: [response],
		llmCalls: 1,
	};
};

const toolNode: GraphNode<typeof State> = async (state, config?: MyConfig) => {
	const lastMessage = state.messages.at(-1);

	if (lastMessage == null || !AIMessage.isInstance(lastMessage)) {
		return { messages: [] };
	}

	const result: ToolMessage[] = [];
	for (const toolCall of lastMessage.tool_calls ?? []) {
		// note: blindly trust that tool name passed is valid
		const toolName = toolCall.name as keyof typeof toolsByName;
		const tool = toolsByName[toolName];
		const toolResult = await tool.invoke(toolCall, config);
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

export const graph = new StateGraph(State)
	.addNode("llmCall", llmCall)
	.addNode("userIdent", userIdent)
	.addNode("toolNode", toolNode)

	.addEdge(START, "userIdent")
	.addEdge("userIdent", "llmCall")
	.addConditionalEdges("llmCall", shouldContinue, ["toolNode", END])
	.addEdge("toolNode", "llmCall")

	.compile();
