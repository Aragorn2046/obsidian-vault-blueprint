import type { NodeDef, CategoryDef, CustomCategory } from "../types";
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

  // Merge default + custom categories
  const allCategories = buildAllCategoryRules(options.customCategories ?? []);
  const validCategories = new Set(allCategories.map((c) => c.id));

  for (const node of nodes) {
    const file = fileMap.get(node.path ?? "");
    if (!file) {
      node.cat = "default";
      continue;
    }

    node.cat =
      matchOverride(file.path, options.categoryOverrides) ??
      matchFrontmatterType(file.frontmatter, validCategories) ??
      matchTags(file.tags, allCategories) ??
      matchFolder(file.path, allCategories) ??
      matchFilePattern(file.name, allCategories) ??
      "default";
  }

  return { categories: buildCategoryDefs(colorOverrides, options.customCategories ?? []) };
}

/** Convert custom categories to CategoryRules and merge with defaults */
function buildAllCategoryRules(custom: CustomCategory[]): CategoryRule[] {
  const customRules: CategoryRule[] = custom.map(c => ({
    id: c.id,
    label: c.label,
    color: c.color,
    dark: c.dark,
    folderPatterns: c.folderPatterns ?? [],
    filePatterns: [],
    tags: c.tags ?? [],
  }));
  // Custom categories come before "default" so they take priority
  const withoutDefault = DEFAULT_CATEGORIES.filter(c => c.id !== 'default');
  const defaultCat = DEFAULT_CATEGORIES.find(c => c.id === 'default')!;
  return [...customRules, ...withoutDefault, defaultCat];
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
  customCategories?: CustomCategory[],
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
  // Add custom categories
  if (customCategories) {
    for (const cat of customCategories) {
      const custom = colorOverrides?.[cat.id];
      result[cat.id] = {
        color: custom?.color ?? cat.color,
        dark: custom?.dark ?? cat.dark,
        label: cat.label,
        visible: true,
      };
    }
  }
  return result;
}
