/**
 * Defines Zod input validation and structured output contracts for filesystem tools.
 * MCP clients use these schemas to discover and invoke the local operations.
 */
import * as z from "zod";

/** Contract accepting a file name and UTF-8 content and returning creation status. */
export const createFiletoolSchema = {
  description: "Creates a file with the specified name and content.",
  inputSchema: z.object({
    fileName: z.string().describe("The name of the file to be created."),
    content: z.string().describe("The content to be written to the file."),
  }),
  outputSchema: z.object({
    text: z
      .string()
      .describe(
        "The result of the file creation operation, indicating success or failure.",
      ),
  }),
};

/** Contract accepting a file name and replacement content and returning write status. */
export const overwriteFileTool = {
  description:
    "Overwrites a file with the specified name and content under 'AgentFiles'.",
  inputSchema: z.object({
    fileName: z.string().describe("The name of the file to be overwritten."),
    content: z.string().describe("The content to be written to the file."),
  }),
  outputSchema: z.object({
    text: z
      .string()
      .describe(
        "The result of the file overwrite operation, indicating success or failure.",
      ),
  }),
};

/** Contract accepting a relative directory name and returning creation status. */
export const createDirectoryTool = {
  description:
    "Creates a directory with the specified name. The directory will be created inside the 'AgentFiles' directory.",
  inputSchema: z.object({
    dirName: z.string().describe("The name of the directory to be created."),
  }),
  outputSchema: z.object({
    text: z
      .string()
      .describe(
        "The result of the directory creation operation, indicating success or failure.",
      ),
  }),
};

/** Contract accepting a relative file path and returning UTF-8 contents or status. */
export const readFileTool = {
  description:
    "Reads a file from the 'AgentFiles' directory and returns its contents as text.",
  inputSchema: z.object({
    filePath: z
      .string()
      .describe(
        "The path to the file to read, relative to the 'AgentFiles' directory.",
      ),
  }),
  outputSchema: z.object({
    text: z.string().describe("The contents of the file or an error message."),
  }),
};

/** Contract accepting a relative directory path and returning entry names or status. */
export const listDirectoryTool = {
  description: "Lists files and folders in a directory under 'AgentFiles'.",
  inputSchema: z.object({
    dirPath: z
      .string()
      .describe(
        "The directory path to list, relative to the 'AgentFiles' directory.",
      ),
  }),
  outputSchema: z.object({
    text: z
      .string()
      .describe("A newline-delimited list of entries or an error message."),
  }),
};
