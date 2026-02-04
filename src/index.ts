import { LangChainInstrumentation } from "@arizeai/openinference-instrumentation-langchain";
import { register } from "@arizeai/phoenix-otel";
import * as CallbackManagerModule from "@langchain/core/callbacks/manager";

import {
	END,
	type GraphNode,
	MessagesValue,
	START,
	StateGraph,
	StateSchema,
} from "@langchain/langgraph";

const provider = register({ projectName: "agents-do-work-101" });

const lcInstrumentation = new LangChainInstrumentation();
lcInstrumentation.manuallyInstrument(CallbackManagerModule);

process.on("beforeExit", async () => {
	await provider.shutdown();
});

const State = new StateSchema({ messages: MessagesValue });

const mockLlm: GraphNode<typeof State> = (state) => ({
	messages: [{ role: "ai", content: "hello world" }],
});

const graph = new StateGraph(State)
	.addNode("mock_llm", mockLlm)
	.addEdge(START, "mock_llm")
	.addEdge("mock_llm", END)
	.compile();

await graph.invoke({
	messages: [{ role: "user", content: "hi!" }],
});
console.log("done");
