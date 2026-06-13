import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Singleton wrapper to ensure the MCP stdio server is created and connected only once.
// This avoids multiple child processes and inconsistent tool registrations across agents.
class FileMcpClient {
  // Single shared instance for the process.
  private static instance: FileMcpClient | null = null;
  // Shared MCP client used to talk to the stdio server process.
  private readonly client: Client;
  private readonly transport: StdioClientTransport;
  // Cached connection promise so repeated connect calls await the same handshake.
  private connectPromise: Promise<void> | null = null;

  // Private ctor enforces singleton usage via getInstance().
  private constructor() {
    this.client = new Client(
      {
        name: "filemcp-client",
        version: "1.0.0",
      },
      { capabilities: {} },
    );

    this.transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "node_modules/filemcp/server.ts"],
    });
  }

  // Lazy initialization keeps startup fast until an agent actually needs tools.
  static getInstance(): FileMcpClient {
    if (!FileMcpClient.instance) {
      FileMcpClient.instance = new FileMcpClient();
    }
    return FileMcpClient.instance;
  }

  // Expose the MCP SDK client for tool calls and capability queries.
  getClient(): Client {
    return this.client;
  }

  // Connect once and reuse the same promise to avoid multiple stdio connections.
  connect(): Promise<void> {
    if (!this.connectPromise) {
      this.connectPromise = this.client.connect(this.transport);
    }
    return this.connectPromise;
  }
}

// Module-level singleton instance; keep it internal to ensure a single connection.
const fileMcpClient = FileMcpClient.getInstance();
export const filemcp = fileMcpClient.getClient();

// Kick off the connection early so tools are available before first agent run.
fileMcpClient.connect().catch((error) => {
  console.error("File MCP Server connection failed:", error);
});
