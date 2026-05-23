
import * as z from "zod";

export const createFiletoolSchema =
{
    description: "Creates a file with the specified name and content. ",
    inputSchema: z.object({
        fileName: z.string().describe("The name of the file to be created."),
        content: z.string().describe("The content to be written to the file.")
    }),
    outputSchema: z.object({
        text: z.string().describe("The result of the file creation operation, indicating success or failure."),
    }),
};


export const overwriteFileTool =
{
    description: "Overwrites a file with the specified name and content under 'AgentFiles'.",
    inputSchema: z.object({
        fileName: z.string().describe("The name of the file to be overwritten."),
        content: z.string().describe("The content to be written to the file.")
    }),
    outputSchema: z.object({
        text: z.string().describe("The result of the file overwrite operation, indicating success or failure."),
    }),
};


export const createDirectoryTool =
{
    description: "Creates a directory with the specified name. The directory will be created inside the 'AgentFiles' directory.",
    inputSchema: z.object({
        dirName: z.string().describe("The name of the directory to be created.")
    }),
    outputSchema: z.object({
        text: z.string().describe("The result of the directory creation operation, indicating success or failure."),
    }),
};


export const readFileTool =
{
    description: "Reads a file from the 'AgentFiles' directory and returns its contents as text.",
    inputSchema: z.object({
        filePath: z.string().describe("The path to the file to read, relative to the 'AgentFiles' directory.")
    }),
    outputSchema: z.object({
        text: z.string().describe("The contents of the file or an error message."),
    }),
};


export const listDirectoryTool =
{
    description: "Lists files and folders in a directory under 'AgentFiles'.",
    inputSchema: z.object({
        dirPath: z.string().describe("The directory path to list, relative to the 'AgentFiles' directory.")
    }),
    outputSchema: z.object({
        text: z.string().describe("A newline-delimited list of entries or an error message."),
    }),
};
