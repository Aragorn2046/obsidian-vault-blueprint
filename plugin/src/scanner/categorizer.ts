import type { NodeDef, CategoryDef } from "../types";
import type { FileInfo, ScannerOptions, CategoryRule } from "./types";
import { DEFAULT_CATEGORIES } from "./types";

export interface CategorizationResult {
  categories: Record<string, CategoryDef>;
}

export function categorizeNodes(
  nodes: NodeDef[],
  files: FileInfo[],
  options: ScannerOptions,
  colorOverrides?: Record<string, { color: string; dark: string }>,
): CategorizationResult {
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const validCategories = new Set(DEFAULT_CATEGORIES.map((c) => c.id));

  for (const node of nodes) {
    const file = fileMap.get(node.path ?? "");
    if (!file) {
      node.cat = "default";
      continue;
    }

    node.cat =
      matchOverride(file.path, options.categoryOverrides) ??
      matchFrontmatterType(file.frontmatter, validCategories) ??
      matchTags(file.tags, DEFAULT_CATEGORIES) ??
      matchFolder(file.path, DEFAULT_CATEGORIES) ??
      matchFilePattern(file.name, DEFAULT_CATEGORIES) ??
      "default";
  }

  return { categories: buildCategoryDefs(colorOverrides) };
}

function matchOverride(
  filePath: string,
  overrides: Record<string, string>
): string | null {
  for (const [pattern, categoryId] of Object.entries(overrides)) {
    if (pattern.includes("*")) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      if (regex.test(filePath)) return categoryId;
    } else {
      if (
        filePath === pattern ||
        filePath.startsWith(pattern.endsWith("/") ? pattern : pattern + "/")
      ) {
        return categoryId;
      }
    }
  }
  return null;
}

function matchFrontmatterType(
  frontmatter: Record<string, unknown> | null,
  validCategories: Set<string>
): string | null {
  if (!frontmatter?.type) return null;
  const type = String(frontmatter.type).toLowerCase();
  if (validCategories.has(type)) return type;
  return null;
}

function matchTags(tags: string[], categories: CategoryRule[]): string | null {
  for (const cat of categories) {
    if (cat.tags.length === 0) continue;
    for (const tag of tags) {
      if (cat.tags.includes(tag.toLowerCase())) return cat.id;
    }
  }
  return null;
}

function matchFolder(filePath: string, categories: CategoryRule[]): string | null {
  const pathLower = filePath.toLowerCase();
  const segments = pathLower.split("/");

  for (const cat of categories) {
    for (const pattern of cat.folderPatterns) {
      if (segments.some((seg) => seg === pattern)) return cat.id;
    }
  }

  // Root-level files → config
  if (segments.length === 1) return "config";

  return null;
}

function matchFilePattern(
  fileName: string,
  categories: CategoryRule[]
): string | null {
  const nameLower = fileName.toLowerCase();

  for (const cat of categories) {
    for (const pattern of cat.filePatterns) {
      const patternLower = pattern.toLowerCase().replace(/\.md$/, "");
      if (patternLower.includes("*")) {
        const regex = new RegExp(
          "^" + patternLower.replace(/\./g, "\\.").replace(/\*/g, ".*") + "$"
        );
        if (regex.test(nameLower)) return cat.id;
      } else {
        if (nameLower === patternLower) return cat.id;
      }
    }
  }
  return null;
}

function buildCategoryDefs(
  colorOverrides?: Record<string, { color: string; dark: string }>,
): Record<string, CategoryDef> {
  const result: Record<string, CategoryDef> = {};
  for (const cat of DEFAULT_CATEGORIES) {
    const custom = colorOverrides?.[cat.id];
    result[cat.id] = {
      color: custom?.color ?? cat.color,
      dark: custom?.dark ?? cat.dark,
      label: cat.label,
      visible: true,
    };
  }
  return result;
}
