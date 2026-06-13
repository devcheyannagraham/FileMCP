# FileMCP

FileMCP is a small Model Context Protocol (MCP) file server for AI Agents.

It includes both:

- an MCP server that exposes controlled file tools
- a client wrapper that starts and connects to that server from agent code

The server exposes simple file operations under an `AgentFiles` folder.

## What It Does

FileMCP exposes these MCP tools:

- `createFileTool`: creates a new file under `AgentFiles` and refuses to silently overwrite an existing file.
- `overwriteFileTool`: writes or replaces a file under `AgentFiles`.
- `createDirectoryTool`: creates a directory under `AgentFiles`.
- `readFileTool`: reads a UTF-8 text file from `AgentFiles`.
- `listDirectoryTool`: lists files and folders under `AgentFiles`.

The read and list tools include path traversal checks so requests cannot escape the `AgentFiles` directory.

## Requirements

- Node.js 18+
- npm

## Install FileMCP

From your root directory:

```bash
npm install --save https://github.com/devcheyannagraham/FileMCP.git
```

## Use With An Agent

This repo includes `mcpclient.ts`, which is the primary integration point for agent code. It creates a singleton MCP SDK `Client` using `StdioClientTransport`.

In your agent project, import the client wrapper and pass it into your agent config:

```ts
import { filemcp } from "filemcp/mcpclient.ts";
import { agent } from "<your-agent-sdk>";

const myAgent = agent({
  mcpServer: filemcp,
});
```



## File Operations
File operations are relative to an `AgentFiles` folder in the working directory.
Asking the agent to read file.txt actually reads AgentFiles/file.txt.
Same with writes.

Ensure there is a folder called 'Agent Directory' in the root directory for the agent to read. 

The code is simple and you can change this locally if you want. :)



## Project Files

- `server.ts`: creates the MCP server, registers tools, and starts stdio transport.
- `tools.ts`: implements the filesystem tools.
- `toolSchemas.ts`: defines tool descriptions and Zod schemas.
- `mcpclient.ts`: MCP SDK client wrapper used by agent code to start and connect to the server.
