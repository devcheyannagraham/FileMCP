# FileMCP

FileMCP is a small Model Context Protocol (MCP) file server for AI Agents.

The server exposes simple file operations under an `AgentFiles` folder.

## What It Does

FileMCP exposes these MCP tools:

- `createFileTool`: creates a new file under `AgentFiles` and refuses to silently overwrite an existing file.
- `overwriteFileTool`: writes or replaces a file under `AgentFiles`.
- `createDirectoryTool`: creates a directory under `AgentFiles`.
- `readFileTool`: reads a UTF-8 text file from `AgentFiles`.
- `listDirectoryTool`: lists files and folders under `AgentFiles`.

All five tools validate sandbox paths before accessing the filesystem. They reject
absolute paths, `..` components, Windows device names and alternate data streams,
symbolic links, junctions, and hard-linked files. File creation uses an exclusive
write so concurrent requests cannot silently replace an existing file. Failed
operations return MCP's `isError: true` flag.

## Requirements

- Node.js 20+
- npm

## Install FileMCP

Once published to npm, install it from your agent project's root directory:

```bash
npm install @chey.dev/filemcp
```

## Use With An Agent

Launch the installed executable as a stdio MCP server from your agent project:

```bash
npx --no-install filemcp
```

`npx` runs a package's executable. `--no-install` prevents it from installing a
missing package, so install FileMCP with the command above first.
The npm package is named `@chey.dev/filemcp`; its executable is named `filemcp`.

Configure your agent's MCP client to launch that command with its working directory
set to the project whose `AgentFiles` sandbox you intend to use. No compilation or
MCP client package is needed in this server project.

## File Operations

File operations are relative to an `AgentFiles` folder in the server's startup
working directory. This location is captured once and does not change if the
process later changes its working directory.
Asking the agent to read file.txt actually reads AgentFiles/file.txt.
Same with writes.

The server creates `AgentFiles` automatically. Use `.` to list its root. Create
nested directories before writing files into them. Overwrites are allowed only
through `overwriteFileTool`; requesting a new file never overwrites existing data.

## Security Boundary

These checks constrain paths supplied to this server's tools; they are not an
operating-system sandbox. A hostile local process that can modify sandbox
directories concurrently can race filesystem checks. Keep the sandbox and its
parent directory under trusted control. For isolation from other local processes,
run under a restricted OS account or in a container with only the intended sandbox
mounted writable. Other filesystem or shell tools available to your agent are not
restricted by this server.

## Project Files

- `server.js`: creates the MCP server, registers tools, and starts stdio transport.
- `tools.js`: implements sandboxed filesystem tools.
- `toolSchemas.js`: defines tool descriptions and Zod schemas.
