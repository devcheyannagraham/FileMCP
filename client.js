/**
 * Connects Node.js applications to FileMCP without repeating stdio setup.
 * Connection lifecycle stays separate from server tools and AI orchestration.
 */
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Starts FileMCP and completes the MCP handshake for a local application.
 * @param {object} [options] Connection settings.
 * @param {string} [options.cwd] Existing directory whose AgentFiles folder to use;
 * defaults to the current working directory. Relative paths resolve from there.
 * @returns {Promise<Client>} Connected SDK client; caller must await client.close().
 * @throws {TypeError} If options or cwd are invalid.
 * @throws {Error} If startup or connection fails; closes the transport before rejecting.
 */
export async function connectFileMcp(options = {}) {
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Connection options must be an object.");
  }
  const { cwd = process.cwd() } = options;
  if (typeof cwd !== "string" || !cwd.trim() || cwd.includes("\0")) {
    throw new TypeError("cwd must be a non-empty directory path without null bytes.");
  }

  const client = new Client({ name: "filemcp-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.js", import.meta.url))],
    cwd: path.resolve(cwd),
  });

  try {
    await client.connect(transport);
    return client;
  } catch (error) {
    // Preserve the connection error even if cleanup fails; do not leave a child running.
    await transport.close().catch(() => {});
    throw error;
  }
}