
import * as z from "zod";

export const createFiletoolSchema =
{
    description: "Creates a file with the specified name and content. ",
    inputSchema: z.object({
        fileName: z.string().describe("The name of the file to be created."),
        content: z.string().describe("The content to be written to the file.")
    }),
    outputSchema: z.string().describe("The result of the file creation operation, indicating success or failure."),
};


export const overwriteFileTool =
{
    type: "function",
    name: "overwriteFileTool",
    description: "Overwrites a file with the specified name and content under 'CAFiles'.",
    // Only works on models >gpt-5.4
    defer_loading: true,
    parameters: {
        type: "object",
        properties: {
            fileName: {
                type: "string",
                description: "The name of the file to be overwritten."
            },
            content: {
                type: "string",
                description: "The content to be written to the file."
            }
        },
        required: ["fileName", "content"],
        additionalProperties: false,
    },
    strict: true,
};


export const createDirectoryTool =
{
    type: "function",
    name: "createDirectoryTool",
    description: "Creates a directory with the specified name. The directory will be created inside the 'CAFiles' directory.",
    // Only works on models >gpt-5.4
    defer_loading: true,
    parameters: {
        type: "object",
        properties: {
            dirName: {
                type: "string",
                description: "The name of the directory to be created."
            }
        },
        required: ["dirName"],
        additionalProperties: false,
    },
    strict: true,
};


export const readFileTool =
{
    type: "function",
    name: "readFileTool",
    description: "Reads a file from the 'CAFiles' directory and returns its contents as text.",
    // Only works on models >gpt-5.4
    defer_loading: true,
    parameters: {
        type: "object",
        properties: {
            filePath: {
                type: "string",
                description: "The path to the file to read, relative to the 'CAFiles' directory."
            }
        },
        required: ["filePath"],
        additionalProperties: false,
    },
    strict: true,
};


export const listDirectoryTool =
{

    type: "function",
    name: "listDirectoryTool",
    description: "Lists files and folders in a directory under 'CAFiles'.",
    // Only works on models >gpt-5.4
    defer_loading: true,
    parameters: {
        type: "object",
        properties: {
            dirPath: {
                type: "string",
                description: "The directory path to list, relative to the 'CAFiles' directory."
            }
        },
        required: ["dirPath"],
        additionalProperties: false,
    },
    strict: true,
};
