import type { Embeddings } from "@langchain/core/embeddings";
import type { VectorStore } from "@langchain/core/vectorstores";
import { loadMemoryVectorStoreFromCache } from "../rag/load-vector-store";

let vectorStore: VectorStore;
export const getVectorStore = async (embedding: Embeddings) => {
	if (!vectorStore) {
		vectorStore = await loadMemoryVectorStoreFromCache(embedding);
	}
	return vectorStore;
};
