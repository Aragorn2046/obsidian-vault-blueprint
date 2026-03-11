import { App, TFile, TFolder, TAbstractFile, CachedMetadata } from "obsidian";
import type { FileInfo, ScannerOptions } from "./types";

export interface CollectorResult {
  files: FileInfo[];
  folders: Map<string, string[]>;
  topFolders: string[];
}

export function collectFiles(app: App, options: ScannerOptions): CollectorResult {
  const mdFiles: TFile[] = app.vault.getMarkdownFiles();
  const allFiles: TAbstractFile[] = app.vault.getAllLoadedFiles();

  const canvasFiles = allFiles.filter(
    (f): f is TFile => f instanceof TFile && f.extension === "canvas"
  );

  const allContentFiles = [...mdFiles, ...canvasFiles];
  const files: FileInfo[] = [];

  for (const file of allContentFiles) {
    if (isExcluded(file, options.excludePaths)) continue;
    files.push(buildFileInfo(file, app));
  }

  // Build folder map
  const folders = new Map<string, string[]>();
  for (const fi of files) {
    const folder = fi.folder || "(root)";
    if (!folders.has(folder)) folders.set(folder, []);
    folders.get(folder)!.push(fi.path);
  }

  const topFolders = [...new Set(files.map((fi) => fi.topFolder).filter(Boolean))];

  return { files, folders, topFolders };
}

function isExcluded(file: TFile, excludePaths: string[]): boolean {
  const path = file.path;

  // Hidden folders
  if (path.startsWith(".") || path.includes("/.")) return true;

  // User exclude patterns
  for (const pattern of excludePaths) {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*"));
      if (regex.test(path)) return true;
    } else {
      if (
        path === pattern ||
        path.startsWith(pattern.endsWith("/") ? pattern : pattern + "/")
      ) {
        return true;
      }
    }
  }

  // Non-content extensions
  if (file.extension !== "md" && file.extension !== "canvas") return true;

  // Empty files
  if (file.stat.size === 0) return true;

  return false;
}

function buildFileInfo(file: TFile, app: App): FileInfo {
  const cache = app.metadataCache.getFileCache(file);
  const pathSegments = file.path.split("/");
  const isRoot = pathSegments.length === 1;

  return {
    path: file.path,
    name: file.basename,
    extension: file.extension,
    size: file.stat.size,
    folder: file.parent?.path ?? "",
    topFolder: isRoot ? "" : pathSegments[0],
    isRoot,
    tags: extractTags(cache),
    frontmatter: (cache?.frontmatter as Record<string, unknown>) ?? null,
    outgoingLinks: extractOutgoingLinks(cache, app, file),
    incomingLinkCount: 0,
  };
}

function extractTags(cache: CachedMetadata | null): string[] {
  if (!cache) return [];
  const tags: string[] = [];

  if (cache.tags) {
    for (const t of cache.tags) {
      tags.push(t.tag);
    }
  }

  if (cache.frontmatter?.tags) {
    const fmTags = cache.frontmatter.tags;
    if (Array.isArray(fmTags)) {
      for (const t of fmTags) {
        const normalized = String(t).startsWith("#") ? String(t) : "#" + String(t);
        tags.push(normalized);
      }
    }
  }

  return [...new Set(tags)];
}

function extractOutgoingLinks(
  cache: CachedMetadata | null,
  app: App,
  file: TFile
): string[] {
  if (!cache) return [];
  const paths: string[] = [];

  if (cache.links) {
    for (const link of cache.links) {
      const resolved = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (resolved) paths.push(resolved.path);
    }
  }

  if (cache.frontmatterLinks) {
    for (const link of cache.frontmatterLinks) {
      const resolved = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
      if (resolved) paths.push(resolved.path);
    }
  }

  return [...new Set(paths)];
}
