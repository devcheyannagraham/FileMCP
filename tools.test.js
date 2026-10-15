/**
 * Exercises sandbox filesystem boundaries using disposable local fixtures.
 * Tests cover valid operations, unsafe paths, links, and concurrent creation.
 * Each rejection must set isError; outside data must remain unchanged as well.
 */
import assert from "node:assert/strict";
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("filesystem tools enforce the startup sandbox", async (context) => {
  // Use an isolated temporary project, never real user files. Import tools only
  // after changing cwd because the module captures its sandbox location at import.
  const workspace = await mkdtemp(path.join(os.tmpdir(), "filemcp-test-"));
  const previousCwd = process.cwd();
  process.chdir(workspace);
  const tools = await import("./tools.js");
  // Returning to the original cwd also tests that later requests cannot move
  // the sandbox by making it recompute its root from the current directory.
  process.chdir(previousCwd);
  const root = path.join(workspace, "AgentFiles");
  const outside = path.join(workspace, "outside");
  await mkdir(outside);
  // A "sentinel" is known data we watch for unexpected changes. This file stands
  // in for a private document outside AgentFiles, but is safe test data to discard.
  await writeFile(path.join(outside, "sentinel.txt"), "unchanged");
  context.after(() => rm(workspace, { recursive: true, force: true }));

  await context.test("valid nested operations stay in the startup root", async () => {
    // Security checks must allow legitimate work too: create folders, create/read/
    // overwrite a file, and list the root using the special "." directory path.
    assert.equal((await tools.createDirectoryTool({ dirName: "nested/deeper" })).isError, false);
    assert.equal((await tools.createFileTool({ fileName: "nested/deeper/test.txt", content: "hello" })).isError, false);
    assert.equal((await tools.readFileTool({ filePath: "nested/deeper/test.txt" })).structuredContent.text, "hello");
    assert.equal((await tools.overwriteFileTool({ fileName: "nested/deeper/test.txt", content: "new" })).isError, false);
    assert.equal(await readFile(path.join(root, "nested/deeper/test.txt"), "utf8"), "new");
    assert.match((await tools.listDirectoryTool({ dirPath: "." })).structuredContent.text, /nested\//);
  });

  await context.test("all operations reject unsafe paths", async () => {
    // Cover both slash styles, absolute and drive-relative paths, network shares,
    // parent traversal, Windows streams/devices, normalized names, and wrong types.
    // Every tool receives every case so one missing validator cannot go unnoticed.
    const unsafe = ["../outside/sentinel.txt", "..\\outside\\sentinel.txt", outside,
      "C:\\outside.txt", "C:outside.txt", "\\\\server\\share\\file.txt", "/tmp/outside.txt",
      "nested/../../outside/sentinel.txt", "../AgentFiles-neighbor/file.txt",
      "file.txt:stream", "NUL", "con.txt", "nested/.. /file.txt",
      "trailing./file.txt", "bad\0name", "", "   ", null, 42];
    for (const name of unsafe) {
      for (const [tool, input] of [
        [tools.createFileTool, { fileName: name, content: "bad" }],
        [tools.overwriteFileTool, { fileName: name, content: "bad" }],
        [tools.createDirectoryTool, { dirName: name }],
        [tools.readFileTool, { filePath: name }],
        [tools.listDirectoryTool, { dirPath: name }],
      ]) {
        assert.equal((await tool(input)).isError, true, `${tool.name}: ${JSON.stringify(name)}`);
      }
    }
    // Checking only error messages could miss a tool that writes first and fails
    // afterward. Verify the outside contents AND the absence of newly created names.
    assert.equal(await readFile(path.join(outside, "sentinel.txt"), "utf8"), "unchanged");
    assert.deepEqual(await readdir(outside), ["sentinel.txt"]);
  });

  await context.test("concurrent creates do not overwrite existing content", async () => {
    // Start two creates together. We do not assume which wins, only that exactly
    // one succeeds and subsequent creates cannot change the winner's contents.
    const results = await Promise.all(["first", "second"].map((content) =>
      tools.createFileTool({ fileName: "exclusive.txt", content })));
    assert.equal(results.filter((result) => !result.isError).length, 1);
    const before = await readFile(path.join(root, "exclusive.txt"), "utf8");
    assert.equal((await tools.createFileTool({ fileName: "exclusive.txt", content: "third" })).isError, true);
    assert.equal(await readFile(path.join(root, "exclusive.txt"), "utf8"), before);
  });

  await context.test("directory links cannot redirect any operation outside", async () => {
    // Build a real redirect: AgentFiles/escape leads to our outside fixture.
    // A junction is Windows' directory-link mechanism; other systems use a directory
    // symlink here. Lexically these paths look safe, so string checks alone fail.
    await symlink(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
    assert.equal((await tools.createFileTool({ fileName: "escape/new.txt", content: "bad" })).isError, true);
    assert.equal((await tools.overwriteFileTool({ fileName: "escape/sentinel.txt", content: "bad" })).isError, true);
    assert.equal((await tools.createDirectoryTool({ dirName: "escape/new/deeper" })).isError, true);
    assert.equal((await tools.readFileTool({ filePath: "escape/sentinel.txt" })).isError, true);
    assert.equal((await tools.listDirectoryTool({ dirPath: "escape" })).isError, true);
    assert.equal(await readFile(path.join(outside, "sentinel.txt"), "utf8"), "unchanged");
  });

  await context.test("hard-linked files cannot expose or overwrite outside data", async () => {
    // Both names now refer to the same file data. There is no redirect for realpath
    // to reveal; the nlink metadata check must prevent writes through the inside name.
    await link(path.join(outside, "sentinel.txt"), path.join(root, "hardlink.txt"));
    assert.equal((await tools.readFileTool({ filePath: "hardlink.txt" })).isError, true);
    assert.equal((await tools.overwriteFileTool({ fileName: "hardlink.txt", content: "bad" })).isError, true);
    assert.equal(await readFile(path.join(outside, "sentinel.txt"), "utf8"), "unchanged");
  });

  await context.test("a linked sandbox root is rejected", async () => {
    // Replace AgentFiles itself with a redirect. This tests the trust boundary's
    // root, not just children. Restore it in finally even if an assertion fails.
    const saved = path.join(workspace, "saved-root");
    await rename(root, saved);
    await symlink(outside, root, process.platform === "win32" ? "junction" : "dir");
    try {
      assert.equal((await tools.createFileTool({ fileName: "new.txt", content: "bad" })).isError, true);
      assert.equal((await tools.overwriteFileTool({ fileName: "sentinel.txt", content: "bad" })).isError, true);
      assert.equal((await tools.createDirectoryTool({ dirName: "nested" })).isError, true);
      assert.equal((await tools.readFileTool({ filePath: "sentinel.txt" })).isError, true);
      assert.equal((await tools.listDirectoryTool({ dirPath: "." })).isError, true);
    } finally {
      await rm(root);
      await rename(saved, root);
    }
  });
});