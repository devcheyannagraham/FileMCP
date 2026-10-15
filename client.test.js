/**
 * Verifies the public connection helper against the real FileMCP server.
 * Temporary fixtures check sandbox selection; mocks cover failure cleanup.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { connectFileMcp } from "@chey.dev/filemcp/client";

test("public helper connects and writes in the selected working directory", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "filemcp-client-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  const client = await connectFileMcp({ cwd: workspace });
  try {
    assert.ok(client instanceof Client);
    const listing = await client.listTools();
    assert.equal(listing.tools.length, 5);
    const created = await client.callTool({
      name: "createFileTool",
      arguments: { fileName: "helper.txt", content: "Connected through the helper" },
    });
    assert.equal(created.isError, false);
    assert.equal(await readFile(path.join(workspace, "AgentFiles", "helper.txt"), "utf8"),
      "Connected through the helper");
    const result = await client.callTool({
      name: "readFileTool", arguments: { filePath: "helper.txt" },
    });
    assert.equal(result.structuredContent.text, "Connected through the helper");
  } finally {
    await client.close();
  }
});

test("helper supports default and relative working directories", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "filemcp-client-cwd-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(path.join(workspace, "relative"));
  const previousCwd = process.cwd();
  process.chdir(workspace);
  try {
    for (const [options, directory] of [[undefined, workspace],
      [{ cwd: "relative" }, path.join(workspace, "relative")]]) {
      const client = await connectFileMcp(options);
      try {
        const result = await client.callTool({
          name: "createFileTool", arguments: { fileName: "cwd.txt", content: "selected" },
        });
        assert.equal(result.isError, false);
        assert.equal(await readFile(path.join(directory, "AgentFiles", "cwd.txt"), "utf8"), "selected");
      } finally {
        await client.close();
      }
    }
  } finally {
    process.chdir(previousCwd);
  }
});

test("helper rejects invalid options before starting a server", async () => {
  for (const options of [null, [], "directory", { cwd: "" }, { cwd: " " },
    { cwd: null }, { cwd: 42 }, { cwd: "bad\0path" }]) {
    await assert.rejects(connectFileMcp(options), TypeError);
  }
});

test("helper rejects a missing working directory", async (context) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "filemcp-client-missing-"));
  context.after(() => rm(workspace, { recursive: true, force: true }));
  await assert.rejects(connectFileMcp({ cwd: path.join(workspace, "missing") }));
});

test("helper closes failed connections and preserves the original error", async (context) => {
  const connectionError = new Error("Connection failed");
  context.mock.method(Client.prototype, "connect", async () => { throw connectionError; });
  const close = context.mock.method(StdioClientTransport.prototype, "close", async () => {
    throw new Error("Cleanup failed");
  });
  await assert.rejects(connectFileMcp(), (error) => error === connectionError);
  assert.equal(close.mock.callCount(), 1);
});