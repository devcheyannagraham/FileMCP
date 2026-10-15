/**
 * Restricts local filesystem tools to AgentFiles beneath the startup directory.
 * Shared validation rejects traversal, filesystem links, and unsafe Windows names.
 *
 * Filesystem vocabulary used below:
 * - Path traversal: using ".." (the parent folder) to leave the allowed folder.
 *   For example, AgentFiles/../private.txt names a file outside AgentFiles.
 * - Symbolic link (symlink): a filesystem entry that redirects to another path.
 *   AgentFiles/shortcut could point to a private folder outside the sandbox.
 *   Unlike a Windows .lnk shortcut, filesystem APIs normally follow it automatically.
 * - Junction: a Windows directory link. It can make a folder inside AgentFiles
 *   lead to a different folder, with the same escape risk as a directory symlink.
 * - Hard link: another filename for the SAME underlying file data, not a redirect.
 *   Writing through an inside filename would also change that file outside.
 *
 * These tools never create links, but links may already exist on disk. We reject
 * them even when they currently point inside, keeping the access policy simple.
 * This is application-level validation, not OS isolation: a hostile local process
 * can still race checks by changing directories between validation and access.
 */
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";

// Capture the startup folder once. Recomputing process.cwd() for every request
// would move the sandbox if another part of this process changed directories.
const sandboxRoot = path.resolve(process.cwd(), "AgentFiles");

// O_NOFOLLOW asks the OS not to follow a symlink at the final filename when opening
// it. Some platforms, including Windows, do not provide this flag; 0 adds no flag.
// The explicit link checks below are still needed, especially for parent folders.
const noFollow = constants.O_NOFOLLOW ?? 0;

/**
 * Wraps file contents or status text in matching MCP outputs without side effects.
 * Human-readable content and structuredContent carry the same value so different
 * clients can consume it. isError tells the agent an operation failed without
 * requiring it to guess from words such as "Error" in the response text.
 * @param {string} text Contents or status message to return.
 * @param {boolean} isError Whether the operation failed.
 * @returns {object} Text content and structured output containing the same text.
 */
const textResult = (text, isError = false) => ({
  content: [{ type: "text", text }],
  structuredContent: { text },
  isError,
});

/**
 * Validates relative input before any filesystem mutation, including Windows aliases.
 * @param {string} input Untrusted file or directory path.
 * @param {boolean} allowRoot Whether "." may name the sandbox itself.
 * @returns {string[]} Validated path components; throws for unsafe input.
 */
const pathParts = (input, allowRoot) => {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("A non-empty relative path is required.");
  }
  const name = input.trim();
  // Absolute paths choose their own starting location instead of using AgentFiles.
  // Check both Unix and Windows spellings regardless of the server's current OS.
  if (path.posix.isAbsolute(name) || path.win32.isAbsolute(name)) {
    throw new Error("Absolute paths are not allowed.");
  }
  // "." means "this folder". Listing may use it to inspect the sandbox root, but
  // file creation must name a file, not try to write to the root directory itself.
  if (allowRoot && name === ".") return [];
  const parts = name.split(/[\\/]/);
  // Validate the WHOLE path before creating anything. Splitting both slash styles
  // prevents "..\\private.txt" from bypassing a check written only for "../".
  //
  // Reject empty/dot/parent components, reserved punctuation and control bytes.
  // A colon also blocks Windows drive-relative paths (C:file.txt) and alternate
  // data streams (file.txt:hidden), which address more than an ordinary filename.
  // Windows can normalize trailing dots/spaces, so reject those inside components.
  // CON, NUL, COM1, etc. are Windows device names, even with extensions like .txt;
  // the Unicode escapes cover superscript digits Windows also treats as devices.
  if (parts.some((part) =>
    !part || part === "." || part === ".." ||
    /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
    /^(con|prn|aux|nul|com[1-9\u00b9\u00b2\u00b3]|lpt[1-9\u00b9\u00b2\u00b3])(?:\.|$)/i.test(part)
  )) {
    throw new Error("Invalid sandbox path.");
  }
  return parts;
};

/**
 * Checks existing entries without following links, preventing junction and hard-link access.
 * @param {string} target Absolute candidate within the sandbox.
 * @param {string} root Canonical sandbox root.
 * @returns {Promise<import('node:fs').Stats|null>} Metadata or null if missing; throws on unsafe entries.
 */
const inspectEntry = async (target, root) => {
  let entry;
  try {
    // lstat examines the entry itself. stat would follow a symlink first, hiding
    // the fact that this apparent sandbox entry actually redirects somewhere else.
    entry = await lstat(target);
  } catch (error) {
    // ENOENT means "does not exist". Missing entries are allowed here because a
    // create operation needs to validate a destination before that destination exists.
    if (error.code === "ENOENT") return null;
    throw error;
  }
  // Node reports directory junctions through isSymbolicLink() too. nlink counts
  // filenames referencing a file's data; more than one indicates hard links.
  // We cannot tell where the other names live, so reject all multiply linked files.
  if (entry.isSymbolicLink() || (entry.isFile() && entry.nlink > 1)) {
    throw new Error("Filesystem links are not allowed in the sandbox.");
  }
  // realpath obtains the actual on-disk destination; "canonical" means this
  // resolved form. The relative path from root must not go up via ".." or switch
  // drives. A simple text prefix is insufficient: AgentFiles-neighbor also starts
  // with "AgentFiles", but is not a child of it.
  const relative = path.relative(root, await realpath(target));
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Path escapes the sandbox.");
  }
  return entry;
};

/**
 * Resolves a validated path, checking each existing component before access or creation.
 * @param {string} input Relative path supplied by the agent.
 * @param {{allowRoot?: boolean, createDirectories?: boolean}} options Directory handling policy.
 * @returns {Promise<string>} Checked absolute path; may create directories or throw on unsafe entries.
 */
const resolveSandboxPath = async (input, { allowRoot = false, createDirectories = false } = {}) => {
  const parts = pathParts(input, allowRoot);
  try {
    // Create only the root here, not a recursive chain supplied by the agent.
    // EEXIST merely says something already occupies that name; inspect it next.
    await mkdir(sandboxRoot);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  // The root itself needs checking: validating only children would trust an
  // AgentFiles junction that redirected the entire sandbox into a private folder.
  const rootEntry = await lstat(sandboxRoot);
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory()) {
    throw new Error("Sandbox root must be a directory, not a filesystem link.");
  }
  const root = await realpath(sandboxRoot);
  let target = root;
  // Walk from the trusted root outward. For "reports/2026/note.txt", check reports
  // and 2026 as well as note.txt; a linked parent can redirect an ordinary filename.
  for (const [index, part] of parts.entries()) {
    target = path.join(target, part);
    let entry = await inspectEntry(target, root);
    if (!entry && createDirectories) {
      // Recursive mkdir could follow a linked parent without giving us a chance
      // to inspect it. Create one folder, then check it before proceeding deeper.
      try {
        await mkdir(target);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
      entry = await inspectEntry(target, root);
    }
    // Intermediate components must be directories. The final component must also
    // be a directory for mkdir; read/write tools check their final file separately.
    if (entry && (createDirectories || index < parts.length - 1) && !entry.isDirectory()) {
      throw new Error("A path component is not a directory.");
    }
  }
  return target;
};

/**
 * Opens a checked path and validates the actual file before reading or truncating it.
 * @param {string} target Checked absolute path.
 * @param {number} flags Node file-open flags, including no-follow where supported.
 * @returns {Promise<import('node:fs/promises').FileHandle>} Caller-owned handle; throws for non-files or hard links.
 */
const openSandboxFile = async (target, flags) => {
  const handle = await open(target, flags);
  try {
    // A file handle refers to the file actually opened, not just its pathname.
    // Check that object again before reading or destroying content; the earlier
    // path inspection and this open are separate filesystem operations.
    const entry = await handle.stat();
    if (!entry.isFile() || entry.nlink > 1) {
      throw new Error("Only regular, non-linked files are allowed.");
    }
    return handle;
  } catch (error) {
    // open() succeeded, so rejecting the file must also release its OS handle.
    // Successful callers own the handle and close it in their own finally block.
    await handle.close();
    throw error;
  }
};

/**
 * Creates a UTF-8 file exclusively so concurrent requests cannot overwrite existing data.
 * @param {{fileName: string, content: string}} input Relative name and file contents.
 * @returns {Promise<object>} Creation, confirmation-needed, or I/O error status.
 */
export const createFileTool = async ({ fileName, content }) => {
  // stdout carries MCP messages. Diagnostics go to stderr to avoid corrupting them.
  console.error("Creating file:", fileName);
  try {
    if (typeof content !== "string") throw new Error("File content must be a string.");
    const targetPath = await resolveSandboxPath(fileName);
    // O_WRONLY = write access; O_CREAT = create if absent; O_EXCL = fail if present.
    // The OS checks existence and creates in one atomic operation. A separate
    // "does it exist?" check followed by a normal write could race another request
    // and overwrite a file created between those two steps.
    const handle = await openSandboxFile(targetPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow);
    try {
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    console.error(`File created successfully at: ${targetPath}`);
    return textResult(`File created: ${fileName.trim()}`);
  } catch (error) {
    // Report the conflict, but do not automatically call the overwrite tool.
    // The agent/client must decide separately whether replacing content is intended.
    if (error.code === "EEXIST") return textResult(`Overwrite confirmation required: ${fileName.trim()}`, true);
    console.error("Create file failed:", error);
    // Detailed OS errors stay in stderr; public errors avoid leaking host paths.
    return textResult("Error: unable to create file in sandbox.", true);
  }
};

/**
 * Creates or overwrites a regular sandbox file, checking its handle before truncation.
 * @param {{fileName: string, content: string}} input Relative name and new contents.
 * @returns {Promise<object>} Write status or an I/O error message.
 */
export const overwriteFileTool = async ({ fileName, content }) => {
  console.error("Overwriting file:", fileName);
  try {
    if (typeof content !== "string") throw new Error("File content must be a string.");
    const targetPath = await resolveSandboxPath(fileName);
    // Deliberately omit O_TRUNC, which would erase data during open(), BEFORE the
    // handle's hard-link/type checks. Only truncate after openSandboxFile approves.
    const handle = await openSandboxFile(targetPath, constants.O_WRONLY | constants.O_CREAT | noFollow);
    try {
      // truncate(0) empties the file so shorter replacement text leaves no old tail.
      // This write is not crash-atomic: an interruption can leave partial contents.
      await handle.truncate(0);
      await handle.writeFile(content, "utf8");
    } finally {
      await handle.close();
    }
    console.error(`File overwritten successfully at: ${targetPath}`);
    return textResult(`File overwritten: ${fileName.trim()}`);
  } catch (error) {
    console.error("Overwrite file failed:", error);
    return textResult("Error: unable to overwrite file in sandbox.", true);
  }
};

/**
 * Creates nested sandbox directories one checked component at a time.
 * @param {{dirName: string}} input Directory name relative to AgentFiles.
 * @returns {Promise<object>} Creation, existence, or I/O error status.
 */
export const createDirectoryTool = async ({ dirName }) => {
  console.error("Creating directory:", dirName);
  try {
    const targetPath = await resolveSandboxPath(dirName, { createDirectories: true });
    console.error(`Directory created successfully at: ${targetPath}`);
    return textResult(`Directory created: ${dirName.trim()}`);
  } catch (error) {
    console.error("Create directory failed:", error);
    return textResult("Error: unable to create directory in sandbox.", true);
  }
};

/**
 * Reads UTF-8 contents from a checked regular sandbox file without following links.
 * @param {{filePath: string}} input Relative file path to read.
 * @returns {Promise<object>} File contents, a missing-file status, or an error message.
 */
export const readFileTool = async ({ filePath }) => {
  console.error("Reading file:", filePath);
  try {
    const targetPath = await resolveSandboxPath(filePath);
    // O_RDONLY grants read-only access; this operation cannot intentionally write.
    const handle = await openSandboxFile(targetPath, constants.O_RDONLY | noFollow);
    try {
      return textResult(await handle.readFile("utf8"));
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      console.error("Read file failed: file not found");
      return textResult("File not found.", true);
    }
    console.error("Read file failed:", error);
    return textResult("Error: unable to read file in sandbox.", true);
  }
};

/**
 * Lists names in a checked sandbox directory without following its linked entries.
 * @param {{dirPath: string}} input Relative directory path; use "." for the root.
 * @returns {Promise<object>} Newline-delimited names with folder suffixes, or status text.
 */
export const listDirectoryTool = async ({ dirPath }) => {
  console.error("Listing directory:", dirPath);
  try {
    const targetPath = await resolveSandboxPath(dirPath, { allowRoot: true });
    // withFileTypes gives entry names/types without opening the files or following
    // their links. A link name may appear in the list, but accessing it through
    // another tool will fail the shared validation above.
    const entries = await readdir(targetPath, { withFileTypes: true });
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
      return textResult("Directory not found.", true);
    }
    console.error("List directory failed:", error);
    return textResult("Error: unable to list directory in sandbox.", true);
  }
};
