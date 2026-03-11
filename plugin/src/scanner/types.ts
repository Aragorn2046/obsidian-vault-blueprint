import type { App } from "obsidian";

export interface ScannerOptions {
  app: App;
  excludePaths: string[];
  minBacklinks: number;
  categoryOverrides: Record<string, string>;
  categoryColors: Record<string, { color: string; dark: string }>;
  showFolderGroups: boolean;
}

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  folder: string;
  topFolder: string;
  isRoot: boolean;
  tags: string[];
  frontmatter: Record<string, unknown> | null;
  outgoingLinks: string[];
  incomingLinkCount: number;
}

export interface LinkInfo {
  sourcePath: string;
  targetPath: string;
  isFromFrontmatter: boolean;
}

export interface CategoryRule {
  id: string;
  label: string;
  color: string;
  dark: string;
  folderPatterns: string[];
  filePatterns: string[];
  tags: string[];
}

export type InclusionReason =
  | "moc"
  | "config"
  | "command"
  | "template"
  | "canvas"
  | "todo-inbox"
  | "well-connected"
  | "hub";

export const DEFAULT_CATEGORIES: CategoryRule[] = [
  { id: "config", label: "Config", color: "#6366f1", dark: "#4338ca", folderPatterns: [], filePatterns: ["CLAUDE.md", "MEMORY.md", "*.config.*"], tags: [] },
  { id: "cmd", label: "Commands", color: "#22d3ee", dark: "#0891b2", folderPatterns: ["commands"], filePatterns: [], tags: [] },
  { id: "kb", label: "Knowledge Base", color: "#a78bfa", dark: "#7c3aed", folderPatterns: ["knowledge base", "kb", "knowledge-base", "claude knowledge base"], filePatterns: [], tags: [] },
  { id: "vault", label: "Vault Structure", color: "#34d399", dark: "#059669", folderPatterns: [], filePatterns: ["*MOC*", "*TODO*", "*Inbox*", "*Cortex*"], tags: [] },
  { id: "content", label: "Content", color: "#f59e0b", dark: "#d97706", folderPatterns: ["articles", "content", "drafts", "posts"], filePatterns: [], tags: [] },
  { id: "concept", label: "Concepts", color: "#2dd4bf", dark: "#0d9488", folderPatterns: ["concepts"], filePatterns: [], tags: ["#concept"] },
  { id: "auto", label: "Automation", color: "#fb923c", dark: "#ea580c", folderPatterns: [], filePatterns: ["*.sh", "*.py"], tags: [] },
  { id: "rules", label: "Rules", color: "#f43f5e", dark: "#e11d48", folderPatterns: ["rules"], filePatterns: [], tags: [] },
  { id: "people", label: "People", color: "#ec4899", dark: "#db2777", folderPatterns: ["people"], filePatterns: [], tags: ["#person", "#thinker"] },
  { id: "default", label: "Other", color: "#8899aa", dark: "#64748b", folderPatterns: [], filePatterns: [], tags: [] },
];
