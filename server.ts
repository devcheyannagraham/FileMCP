// Create a simple MCP server that listens for stdin/stdout connections and returns a joke.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { StdioServerTransport } from "../../node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js";
import { createFileTool } from "./tools.js";
import { createFiletoolSchema } from "./toolSchemas.js";

// Initialize the MCP server with a name and version.
const server = new McpServer({
    name: "mcp file server", version: "1.0.0",
});

// Register a tool that returns a single programming joke string.
server.registerTool(
    "createFileTool", 
    createFiletoolSchema,
    // @ts-ignore
    createFileTool
);

// Start the server using stdio transport so it can be launched as a child process.
const startServer = async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP File Server is running...");
};

// Kick off the async startup.
startServer();