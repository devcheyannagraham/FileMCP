# FileMCP

Minimal MCP (Model Context Protocol) file server for safe file operations under a local `AgentFiles` directory.

## What This Project Does

This project exposes filesystem tools over MCP using a stdio transport.

The server supports:
- Creating files
- Overwriting files
- Creating directories
- Reading files
- Listing directories

All reads/lists are constrained to `AgentFiles` and include basic path traversal protection.

## Project Structure

- `server.ts`: MCP server setup and tool registration.
- `tools.ts`: Tool implementations for filesystem operations.
- `toolSchemas.ts`: Zod input/output schemas for each tool.
- `mcpclient.ts`: Singleton MCP stdio client wrapper for use with agent runtimes.

## Requirements

- Node.js 18+
- npm

## Install

```bash
npm install
```

If `tsx` is not globally available, run with `npx tsx` as shown below.

## Run The MCP Server

```bash
npx tsx server.ts
```

The server runs on stdio and logs status messages to stderr.

## Available Tools

All tools return text payloads in MCP response content.

1. `createFileTool`
- Input: `fileName`, `content`
- Behavior: Creates a file under `AgentFiles`; returns overwrite confirmation text if file exists.

2. `overwriteFileTool`
- Input: `fileName`, `content`
- Behavior: Writes content under `AgentFiles`, replacing existing content.

3. `createDirectoryTool`
- Input: `dirName`
- Behavior: Creates a directory under `AgentFiles`.

4. `readFileTool`
- Input: `filePath`
- Behavior: Reads UTF-8 file content from `AgentFiles` with traversal checks.

5. `listDirectoryTool`
- Input: `dirPath`
- Behavior: Lists directory entries from `AgentFiles` with traversal checks.

## Using The Client Wrapper

`mcpclient.ts` provides a singleton MCP SDK `Client` backed by `StdioClientTransport` and connects once:

```ts
import { filemcp } from "./mcpclient.js";

await filemcp.listTools();
```

The wrapper now uses only `@modelcontextprotocol/sdk` (no OpenAI Agents dependency).

## Notes

- Server version: `1.0.0`
- Server name: `mcp file server`
- Base working directory for tools: `<repo>/AgentFiles`