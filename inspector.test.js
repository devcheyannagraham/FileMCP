/**
 * Tests the running stdio server through MCP Inspector's non-interactive CLI.
 * Disposable fixtures verify protocol results against actual filesystem state.
 * Connection checks prove a client can reach the tools; disk checks prove the
 * tools really perform the requested work rather than just reporting success.
 */
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
// Resolve executable paths relative to this test, not the temporary working
// folder. Launching JavaScript with Node also avoids Windows shell wrappers.
const inspectorPath = fileURLToPath(new URL(
  "./node_modules/@modelcontextprotocol/inspector/clients/launcher/build/index.js",
  import.meta.url,
));
const serverPath = fileURLToPath(new URL("./server.js", import.meta.url));

test("Inspector can discover and use the stdio filesystem server", async (context) => {
  // FileMCP puts AgentFiles under its startup working directory. A temporary
  // working directory keeps every test operation away from real project files.
  const workspace = await mkdtemp(path.join(os.tmpdir(), "filemcp-inspector-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const root = path.join(workspace, "AgentFiles");
  const target = path.join(root, "nested", "test.txt");
  // Multiline text and shell-sensitive characters must survive the CLI and MCP
  // round trip unchanged, not just a simple one-word payload.
  const original = "Hello from Inspector\nQuotes: \"hello\"; symbols: = & $";
  const replacement = "Updated through MCP\nSecond line";

  /**
   * Launches Inspector and the real server in an isolated working directory.
    * Each invocation uses a new connection and server process, so later calls
    * must recover file contents from disk rather than server memory.
   * @param {string[]} args Inspector method and argument flags.
   * @param {number} expectedCode Required exit code, including intentional refusals.
   * @returns {Promise<object>} Parsed MCP result; rejects on CLI or JSON failures.
   */
  const inspect = async (args, expectedCode = 0) => {
    let execution;
    let exitCode = 0;
    try {
      // Node runs Inspector, which runs a second Node process for FileMCP.
      // JSON output lets us inspect results without parsing human-readable logs.
      // Connection and process timeouts prevent a broken server from hanging CI;
      // stored-auth-only prevents Inspector from waiting for interactive login.
      execution = await execute(process.execPath, [
        inspectorPath, "--cli", process.execPath, serverPath,
        "--format", "json", "--connect-timeout", "5000",
        "--stored-auth-only", ...args,
      ], {
        cwd: workspace,
        timeout: 20000,
        maxBuffer: 1024 * 1024,
        windowsHide: true,
        // Keep Inspector non-interactive and its auth state separate from the
        // developer's settings. Both storage paths override inherited locations.
        env: {
          ...process.env,
          MCP_AUTO_OPEN_ENABLED: "false",
          MCP_INSPECTOR_SECRET_STORE: "memory",
          MCP_STORAGE_DIR: path.join(workspace, "inspector-storage"),
          MCP_INSPECTOR_OAUTH_STATE_PATH: path.join(workspace, "oauth.json"),
        },
      });
    } catch (error) {
      // execFile rejects for any nonzero exit, including expected tool refusals.
      // Preserve stdout so we can check the MCP error response as well as the
      // exit code; an unrelated crash must not count as a successful rejection.
      execution = error;
      exitCode = error.code;
    }
    assert.equal(exitCode, expectedCode,
      `Inspector ${args.join(" ")}: ${execution.stderr || execution.message || execution.stdout}`);
    // Inspector wraps the server's MCP response in { result: ... }. Only stdout
    // is JSON; stderr can contain the server's startup banner and diagnostics.
    const envelope = JSON.parse(execution.stdout);
    assert.ok(envelope.result, "Inspector must return a JSON result envelope");
    return envelope.result;
  };

  /**
   * Calls a registered MCP tool and checks its agent-facing response contract.
    * This shared check keeps successful and rejected calls readable by clients;
    * individual scenarios below verify file contents and other side effects.
   * @param {string} name Registered tool name.
   * @param {object} args JSON tool inputs, passed without shell interpolation.
   * @param {boolean} isError Whether the operation must be refused.
   * @returns {Promise<object>} Tool result; performs server I/O and asserts errors.
   */
  const callTool = async (name, args, isError = false) => {
    // JSON preserves argument types and text without shell interpolation.
    // Inspector exits 0 for success and 5 when the tool reports isError: true.
    const result = await inspect([
      "--method", "tools/call", "--tool-name", name,
      "--tool-args-json", JSON.stringify(args),
    ], isError ? 5 : 0);
    // MCP allows isError to be omitted on success. FileMCP also promises matching
    // text and structured outputs so human-facing and programmatic clients agree.
    assert.equal(result.isError ?? false, isError);
    assert.equal(typeof result.structuredContent.text, "string");
    assert.deepEqual(result.content, [{ type: "text", text: result.structuredContent.text }]);
    return result;
  };

  await context.test("handshake and discovery expose all five tools and input schemas", async () => {
    // initialize is MCP's opening handshake, not a file operation. It checks
    // that the launched process speaks MCP before testing the tools themselves.
    const connection = await inspect(["--method", "initialize"]);
    // Identify the intended server, catching accidental connections to another
    // executable. This name comes from FileMCP's server configuration.
    assert.equal(connection.serverInfo.name, "mcp file server");
    // protocolVersion identifies the MCP rules agreed on by client and server.
    // We only require a value here, not a specific version: Inspector performs
    // the negotiation, and SDK upgrades may support newer protocol versions.
    assert.ok(connection.protocolVersion);
    // Capabilities advertise which MCP features a server supports. Advertising
    // tools tells clients that tool discovery/calls are available. This alone
    // does not prove they work; the remaining checks discover and call them.
    assert.ok(connection.capabilities.tools);
    // tools/list is what clients use to learn tool names and accepted inputs.
    // --strict also fails on Inspector's error-level schema portability findings,
    // which could stop a client from consuming otherwise valid JSON schemas.
    const listing = await inspect(["--method", "tools/list", "--strict"]);
    const inputs = {
      createFileTool: ["content", "fileName"],
      overwriteFileTool: ["content", "fileName"],
      createDirectoryTool: ["dirName"],
      readFileTool: ["filePath"],
      listDirectoryTool: ["dirPath"],
    };
    // Require the intended public tool set and required argument names. A tool
    // function existing in tools.js is not enough: it must be registered with
    // the right schema for a client to discover how to invoke it.
    assert.deepEqual(listing.tools.map((tool) => tool.name).sort(), Object.keys(inputs).sort());
    for (const tool of listing.tools) {
      assert.equal(tool.inputSchema.type, "object");
      assert.deepEqual([...tool.inputSchema.required].sort(), inputs[tool.name]);
    }
  });

  await context.test("directory and file creation produce real disk entries", async () => {
    // Check disk state independently of the MCP response: returning "created"
    // without making a directory or writing the exact content must fail.
    await callTool("createDirectoryTool", { dirName: "nested" });
    assert.equal((await stat(path.join(root, "nested"))).isDirectory(), true);
    await callTool("createFileTool", { fileName: "nested/test.txt", content: original });
    assert.equal(await readFile(target, "utf8"), original);
  });

  await context.test("new server processes can read and list persisted files", async () => {
    // These calls start fresh server processes but reuse the same sandbox.
    // Exact readback proves persistence; listing checks both the nested folder
    // and the special "." input used to inspect the sandbox root.
    const result = await callTool("readFileTool", { filePath: "nested/test.txt" });
    assert.equal(result.structuredContent.text, original);
    const listing = await callTool("listDirectoryTool", { dirPath: "nested" });
    assert.match(listing.structuredContent.text, /test\.txt/);
    assert.deepEqual(await readdir(path.join(root, "nested")), ["test.txt"]);
    const rootListing = await callTool("listDirectoryTool", { dirPath: "." });
    assert.match(rootListing.structuredContent.text, /nested\//);
  });

  await context.test("duplicate creation returns a tool error without overwriting", async () => {
    // Creating an existing file must report failure AND preserve the original
    // bytes. Checking only the error would miss a write followed by an error.
    await callTool("createFileTool", { fileName: "nested/test.txt", content: "bad" }, true);
    assert.equal(await readFile(target, "utf8"), original);
  });

  await context.test("explicit overwrite changes disk contents and subsequent reads", async () => {
    // Replacing data is allowed through the dedicated overwrite tool. Check
    // both disk and a later MCP read so neither a fake success nor stale read
    // can pass unnoticed.
    await callTool("overwriteFileTool", { fileName: "nested/test.txt", content: replacement });
    assert.equal(await readFile(target, "utf8"), replacement);
    const result = await callTool("readFileTool", { filePath: "nested/test.txt" });
    assert.equal(result.structuredContent.text, replacement);
  });

  await context.test("missing files and traversal return MCP errors without outside changes", async () => {
    // A missing file should produce a tool error rather than crash the server.
    await callTool("readFileTool", { filePath: "missing.txt" }, true);
    // The sentinel is disposable known data OUTSIDE AgentFiles, but still in
    // our temporary workspace. ".." tries to escape the sandbox to reach it.
    // Both reads and overwrites must be refused; verify the outside bytes too.
    const sentinel = path.join(workspace, "outside.txt");
    await writeFile(sentinel, "unchanged");
    await callTool("readFileTool", { filePath: "../outside.txt" }, true);
    await callTool("overwriteFileTool", { fileName: "../outside.txt", content: "bad" }, true);
    assert.equal(await readFile(sentinel, "utf8"), "unchanged");
  });
});