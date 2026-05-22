// Filesystem tools for the assistant (create, read, list, and directory management under AgentFiles).
// These helpers return user-friendly status strings instead of throwing on common failures.
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
// Path utilities keep us OS-agnostic and help prevent traversal attacks.
import path from "node:path";

const textResult = (text: string) => ({ type: "text", text });


// Creates a file under AgentFiles, returning a confirmation-needed status if it exists.
export const createFileTool = async ({ fileName, content }: { fileName: string, content: string }) => {
    console.error("Creating file:", fileName);

    try {
        // Normalize and validate the input name early.
        const trimmedName = fileName?.trim();
        if (!trimmedName) {
            return textResult("Error: file name cannot be empty.");
        }

        // Ensure the base directory exists.
        const baseDir = path.join(process.cwd(), "AgentFiles");
        await mkdir(baseDir, { recursive: true });

        // Resolve the target path within the base directory.
        const targetPath = path.join(baseDir, trimmedName);
        // Check for existence to avoid silent overwrites.
        const exists = await access(targetPath).then(() => true).catch(() => false);

        if (exists) {
            console.error(`File already exists at: ${targetPath}`);
            return textResult(`Overwrite confirmation required: ${trimmedName}`);
        }

        // Write the file contents; this throws on permission or IO errors.
        await writeFile(targetPath, content, "utf8");

        console.error(`File created successfully at: ${targetPath}`);
        return textResult(`File created: ${trimmedName}`);
    } catch (error) {
        // Convert unexpected failures into user-friendly messages.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Create file failed:", message);
        return textResult(`Error: ${message}`);
    }
}

// Overwrites an existing file (or creates it if missing) under AgentFiles.
export const overwriteFileTool = async ({fileName, content}: {fileName: string, content: string}) => {
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
}

// Creates a directory under AgentFiles and returns a status message.
export const createDirectoryTool = async ({dirName}: {dirName: string}) => {
    console.error("Creating directory:", dirName);

    try {
        // Normalize and validate the input name early.
        const trimmedName = dirName.trim();
        if (!trimmedName) {
            return textResult("Error: directory name cannot be empty.");
        }

        // Resolve and create the directory under the base directory.
        const baseDir = path.join(process.cwd(), "AgentFiles");
        const targetPath = path.join(baseDir, trimmedName);
        // Report existence instead of returning a path.
        const exists = await access(targetPath).then(() => true).catch(() => false);

        if (exists) {
            console.error(`Directory already exists at: ${targetPath}`);
            return textResult(`Directory already exists: ${trimmedName}`);
        }

        // Recursive creation handles nested folders if provided.
        await mkdir(targetPath, { recursive: true });

        console.error(`Directory created successfully at: ${targetPath}`);
        return textResult(`Directory created: ${trimmedName}`);
    } catch (error) {
        // Convert unexpected failures into user-friendly messages.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Create directory failed:", message);
        return textResult(`Error: ${message}`);
    }
}

// Reads a text file from AgentFiles with traversal protection.
export const readFileTool = async ({filePath}: {filePath: string}) => {
    console.error("Reading file:", filePath);

    try {
        // Normalize and validate the input path early.
        const trimmedPath = filePath.trim();
        if (!trimmedPath) {
            return textResult("Error: file path cannot be empty.");
        }

        // Resolve within the base directory and ensure the result does not escape it.
        const baseDir = path.join(process.cwd(), "AgentFiles");
        const resolvedPath = path.resolve(baseDir, trimmedPath);

        // Basic path traversal guard.
        if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseDir + path.sep)) {
            return textResult("Error: invalid file path.");
        }

        // Read file as UTF-8 text; throws on missing files or permissions.
        const contents = await readFile(resolvedPath, "utf8");

        console.error("file read successfully");
        return textResult(contents);
    } catch (error) {
        // Convert missing file into a friendly message for the assistant.
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            console.error("Read file failed: file not found");
            return textResult("File not found.");
        }

        // Convert unexpected failures into user-friendly messages.
        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("Read file failed:", message);
        return textResult(`Error: ${message}`);
    }
}

// Lists files and folders under AgentFiles with traversal protection.
export const listDirectoryTool = async ({dirPath}: {dirPath: string}) => {
    console.error("Listing directory:", dirPath);

    try {
        const trimmedPath = dirPath.trim();
        if (!trimmedPath) {
            return textResult("Error: directory path cannot be empty.");
        }

        const baseDir = path.join(process.cwd(), "AgentFiles");
        const resolvedPath = path.resolve(baseDir, trimmedPath);

        if (resolvedPath !== baseDir && !resolvedPath.startsWith(baseDir + path.sep)) {
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
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
            console.error("List directory failed: directory not found");
            return textResult("Directory not found.");
        }

        const message = error instanceof Error ? error.message : "Unknown error";
        console.error("List directory failed:", message);
        return textResult(`Error: ${message}`);
    }
}
