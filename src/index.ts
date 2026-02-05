import "./otel-setup";
import {
	AIMessage,
	SystemMessage,
	type ToolMessage,
} from "@langchain/core/messages";
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
				"You are an expert resourceful job searching assistant. ",
				"Right now, your goal is to help the user without asking much more questions,",
				"You instead rely on tools provided.",
				"If at the end we cannot help the user, just say so.",
				"No need to inquire the user further, but make sure that tool use options is exhausted.",
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
