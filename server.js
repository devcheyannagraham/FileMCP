#!/usr/bin/env node
/**
 * Exposes local filesystem tools through an MCP stdio process.
 * The SDK entry point supports current and legacy protocol clients.
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
  createDirectoryTool,
  createFileTool,
  listDirectoryTool,
  overwriteFileTool,
  readFileTool,
} from "./tools.js";
import {
  createDirectoryTool as createDirectoryToolSchema,
  createFiletoolSchema,
  listDirectoryTool as listDirectoryToolSchema,
  overwriteFileTool as overwriteFileToolSchema,
  readFileTool as readFileToolSchema,
} from "./toolSchemas.js";

/** MCP instance whose registered tools perform local filesystem I/O. */
export const server = new McpServer({
  name: "mcp file server",
  version: "1.0.0",
});

server.registerTool("createFileTool", createFiletoolSchema, createFileTool);
server.registerTool(
  "overwriteFileTool",
  overwriteFileToolSchema,
  overwriteFileTool,
);
server.registerTool(
  "createDirectoryTool",
  createDirectoryToolSchema,
  createDirectoryTool,
);
server.registerTool("readFileTool", readFileToolSchema, readFileTool);
server.registerTool(
  "listDirectoryTool",
  listDirectoryToolSchema,
  listDirectoryTool,
);

serveStdio(() => server);
console.error("MCP File Server is running...");
