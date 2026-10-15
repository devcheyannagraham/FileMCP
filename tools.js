/**
 * Implements local file and directory tools under the working directory's AgentFiles.
 * Results expose status text and structured output for MCP clients.
 */
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Wraps file contents or status text in matching MCP outputs without side effects.
 * @param {string} text Contents or status message to return.
 * @returns {object} Text content and structured output containing the same text.
 */
const textResult = (text) => ({
  content: [{ type: "text", text }],
  structuredContent: { text },
});

/**
 * Creates a UTF-8 file, reporting existing files rather than intentionally replacing them.
 * @param {{fileName: string, content: string}} input Relative name and file contents.
 * @returns {Promise<object>} Creation, confirmation-needed, or I/O error status.
 */
export const createFileTool = async ({ fileName, content }) => {
  console.error("Creating file:", fileName);
  try {
    const trimmedName = fileName?.trim();
    if (!trimmedName) {
      return textResult("Error: file name cannot be empty.");
    }
    const baseDir = path.join(process.cwd(), "AgentFiles");
    await mkdir(baseDir, { recursive: true });
    const targetPath = path.join(baseDir, trimmedName);
    const exists = await access(targetPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      console.error(`File already exists at: ${targetPath}`);
      return textResult(`Overwrite confirmation required: ${trimmedName}`);
    }
    await writeFile(targetPath, content, "utf8");
    console.error(`File created successfully at: ${targetPath}`);
    return textResult(`File created: ${trimmedName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create file failed:", message);
    return textResult(`Error: ${message}`);
  }
};

/**
 * Writes UTF-8 content, explicitly allowing replacement or creation of a file.
 * @param {{fileName: string, content: string}} input Relative name and new contents.
 * @returns {Promise<object>} Write status or an I/O error message.
 */
export const overwriteFileTool = async ({ fileName, content }) => {
  console.error("Overwriting file:", fileName);
  try {
    const trimmedName = fileName.trim();
    if (!trimmedName) {
      return textResult("Error: file name cannot be empty.");
    }
    const baseDir = path.join(process.cwd(), "AgentFiles");
    await mkdir(baseDir, { recursive: true });
    const targetPath = path.join(baseDir, trimmedName);
    await writeFile(targetPath, content, "utf8");
    console.error(`File overwritten successfully at: ${targetPath}`);
    return textResult(`File overwritten: ${trimmedName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Overwrite file failed:", message);
    return textResult(`Error: ${message}`);
  }
};

/**
 * Creates a directory recursively so nested folders can be prepared for file tools.
 * @param {{dirName: string}} input Directory name relative to AgentFiles.
 * @returns {Promise<object>} Creation, existence, or I/O error status.
 */
export const createDirectoryTool = async ({ dirName }) => {
  console.error("Creating directory:", dirName);
  try {
    const trimmedName = dirName.trim();
    if (!trimmedName) {
      return textResult("Error: directory name cannot be empty.");
    }
    const baseDir = path.join(process.cwd(), "AgentFiles");
    const targetPath = path.join(baseDir, trimmedName);
    const exists = await access(targetPath)
      .then(() => true)
      .catch(() => false);
    if (exists) {
      console.error(`Directory already exists at: ${targetPath}`);
      return textResult(`Directory already exists: ${trimmedName}`);
    }
    await mkdir(targetPath, { recursive: true });
    console.error(`Directory created successfully at: ${targetPath}`);
    return textResult(`Directory created: ${trimmedName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Create directory failed:", message);
    return textResult(`Error: ${message}`);
  }
};

/**
 * Reads UTF-8 text after rejecting paths that lexically escape AgentFiles.
 * @param {{filePath: string}} input Relative file path to read.
 * @returns {Promise<object>} File contents, a missing-file status, or an error message.
 */
export const readFileTool = async ({ filePath }) => {
  console.error("Reading file:", filePath);
  try {
    const trimmedPath = filePath.trim();
    if (!trimmedPath) {
      return textResult("Error: file path cannot be empty.");
    }
    const baseDir = path.join(process.cwd(), "AgentFiles");
    const resolvedPath = path.resolve(baseDir, trimmedPath);
    if (
      resolvedPath !== baseDir &&
      !resolvedPath.startsWith(baseDir + path.sep)
    ) {
      return textResult("Error: invalid file path.");
    }
    const contents = await readFile(resolvedPath, "utf8");
    return textResult(contents);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.error("Read file failed: file not found");
      return textResult("File not found.");
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Read file failed:", message);
    return textResult(`Error: ${message}`);
  }
};

/**
 * Lists directory entries after rejecting paths that lexically escape AgentFiles.
 * @param {{dirPath: string}} input Relative directory path; use "." for the root.
 * @returns {Promise<object>} Newline-delimited names with folder suffixes, or status text.
 */
export const listDirectoryTool = async ({ dirPath }) => {
  console.error("Listing directory:", dirPath);
  try {
    const trimmedPath = dirPath.trim();
    if (!trimmedPath) {
      return textResult("Error: directory path cannot be empty.");
    }
    const baseDir = path.join(process.cwd(), "AgentFiles");
    const resolvedPath = path.resolve(baseDir, trimmedPath);
    if (
      resolvedPath !== baseDir &&
      !resolvedPath.startsWith(baseDir + path.sep)
    ) {
      return textResult("Error: invalid directory path.");
    }
    const entries = await readdir(resolvedPath, { withFileTypes: true });
    if (entries.length === 0) {
      return textResult("Directory is empty.");
    }
    const lines = entries.map((entry) => {
      const suffix = entry.isDirectory() ? "/" : "";
      return `${entry.name}${suffix}`;
    });
    return textResult(lines.join("\n"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.error("List directory failed: directory not found");
      return textResult("Directory not found.");
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("List directory failed:", message);
    return textResult(`Error: ${message}`);
  }
};
