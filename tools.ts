// Filesystem tools for the assistant (create, read, list, and directory management under AgentCreatedFiles).
// These helpers return user-friendly status strings instead of throwing on common failures.
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
// Path utilities keep us OS-agnostic and help prevent traversal attacks.
import path from "node:path";


// Creates a file under AgentCreatedFiles, returning a confirmation-needed status if it exists.
export const createFileTool = async ({ fileName, content }: { fileName: string, content: string }) => {
    console.error("Creating file:", fileName);

    try {
        // Normalize and validate the input name early.
        const trimmedName = fileName?.trim();
        if (!trimmedName) {
            return { type: "text", text: "Error: file name cannot be empty." };
        }

        // Ensure the base directory exists.
        const baseDir = path.join(process.cwd(), "AgentCreatedFiles");
        await mkdir(baseDir, { recursive: true });

        // Resolve the target path within the base directory.
        const targetPath = path.join(baseDir, trimmedName);
        // Check for existence to avoid silent overwrites.
        const exists = await access(targetPath).then(() => true).catch(() => false);

        if (exists) {
            console.error(`File already exists at: ${targetPath}`);
            return { type: "text", text: `Overwrite confirmation required: ${trimmedName}` };
        }

        // Write the file contents; this throws on permission or IO errors.
        await writeFile(targetPath, content, "utf8");

        console.error(`File created successfully at: ${targetPath}`);
        return { type: "text", text: `File created: ${trimmedName}` };
    } catch (error) {
        // Convert unexpected failures into user-friendly messages.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Create file failed:", message);
        return { type: "text", text: `Error: ${message}` };
    }
}

// Overwrites an existing file (or creates it if missing) under AgentCreatedFiles.
export const overwriteFileTool = async (fileName: string, content: string) => {
    console.error("Overwriting file:", fileName);

    try {
        const trimmedName = fileName.trim();
        if (!trimmedName) {
            return "Error: file name cannot be empty.";
        }

        const baseDir = path.join(process.cwd(), "AgentCreatedFiles");
        await mkdir(baseDir, { recursive: true });

        const targetPath = path.join(baseDir, trimmedName);
        await writeFile(targetPath, content, "utf8");

        console.error(`File overwritten successfully at: ${targetPath}`);
        return `File overwritten: ${trimmedName}`;
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Overwrite file failed:", message);
        return `Error: ${message}`;
    }
}

// Creates a directory under AgentCreatedFiles and returns a status message.
export const createDirectoryTool = async (dirName: string) => {
    console.error("Creating directory:", dirName);

    try {
        // Normalize and validate the input name early.
        const trimmedName = dirName.trim();
        if (!trimmedName) {
            return "Error: directory name cannot be empty.";
        }

        // Resolve and create the directory under the base directory.
        const baseDir = path.join(process.cwd(), "AgentCreatedFiles");
        const targetPath = path.join(baseDir, trimmedName);
        // Report existence instead of returning a path.
        const exists = await access(targetPath).then(() => true).catch(() => false);

        if (exists) {
            console.error(`Directory already exists at: ${targetPath}`);
            return `Directory already exists: ${trimmedName}`;
        }

        // Recursive creation handles nested folders if provided.
        await mkdir(targetPath, { recursive: true });

        console.error(`Directory created successfully at: ${targetPath}`);
        return `Directory created: ${trimmedName}`;
    } catch (error) {
        // Convert unexpected failures into user-friendly messages.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Create directory failed:", message);
        return `Error: ${message}`;
    }
}

// Reads a text file from AgentCreatedFiles with traversal protection.
export const readFileTool = async (filePath: string) => {
    console.error("Reading file:", filePath);

    try {
        // Normalize and validate the input path early.
        const trimmedPath = filePath.trim();
        if (!trimmedPath) {
            return "Error: file path cannot be empty.";
        }

        // Resolve within the base directory and ensure the result does not escape it.
        const baseDir = path.join(process.cwd(), "AgentCreatedFiles");
        const resolvedPath = path.resolve(baseDir, trimmedPath);

        // Basic path traversal guard.
        if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseDir + path.sep)) {
            return "Error: invalid file path.";
        }

        // Read file as UTF-8 text; throws on missing files or permissions.
        const contents = await readFile(resolvedPath, "utf8");
        return contents;
    } catch (error) {
        // Convert missing file into a friendly message for the assistant.
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            console.error("Read file failed: file not found");
            return "File not found.";
        }

        // Convert unexpected failures into user-friendly messages.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Read file failed:", message);
        return `Error: ${message}`;
    }
}

// Lists files and folders under AgentCreatedFiles with traversal protection.
export const listDirectoryTool = async (dirPath: string) => {
    console.error("Listing directory:", dirPath);

    try {
        const trimmedPath = dirPath.trim();
        if (!trimmedPath) {
            return "Error: directory path cannot be empty.";
        }

        const baseDir = path.join(process.cwd(), "AgentCreatedFiles");
        const resolvedPath = path.resolve(baseDir, trimmedPath);

        if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseDir + path.sep)) {
            return "Error: invalid directory path.";
        }

        const entries = await readdir(resolvedPath, { withFileTypes: true });
        if (entries.length === 0) {
            return "Directory is empty.";
        }

        const lines = entries.map((entry) => {
            const suffix = entry.isDirectory() ? "/" : "";
            return `${entry.name}${suffix}`;
        });

        return lines.join("\n");
    } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            console.error("List directory failed: directory not found");
            return "Directory not found.";
        }

        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("List directory failed:", message);
        return `Error: ${message}`;
    }
}
