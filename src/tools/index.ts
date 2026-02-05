import { jobPostsSearchTool } from "./job-post-search-tool";

export const toolsByName = {
	[jobPostsSearchTool.name]: jobPostsSearchTool,
};
export const tools = Object.values(toolsByName);
