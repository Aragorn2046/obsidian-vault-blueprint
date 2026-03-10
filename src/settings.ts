import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultBlueprintPlugin from "./main";

export class VaultBlueprintSettingTab extends PluginSettingTab {
  plugin: VaultBlueprintPlugin;

  constructor(app: App, plugin: VaultBlueprintPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Excluded paths")
      .setDesc(
        "Comma-separated folder paths to exclude from vault scanning. " +
        "Example: .obsidian, node_modules, templates"
      )
      .addText((text) =>
        text
          .setPlaceholder(".obsidian, node_modules")
          .setValue(this.plugin.settings.excludePaths.join(", "))
          .onChange(async (value) => {
            this.plugin.settings.excludePaths = value
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
            this.plugin.settingsChanged();
          })
      );

    new Setting(containerEl)
      .setName("Minimum backlinks")
      .setDesc(
        "Notes with fewer incoming backlinks than this threshold " +
        "will be excluded from the blueprint. Set to 0 to show all notes."
      )
      .addText((text) =>
        text
          .setPlaceholder("3")
          .setValue(String(this.plugin.settings.minBacklinks))
          .onChange(async (value) => {
            const parsed = parseInt(value, 10);
            if (!isNaN(parsed) && parsed >= 0) {
              this.plugin.settings.minBacklinks = parsed;
              await this.plugin.saveSettings();
              this.plugin.settingsChanged();
            }
          })
      );

    new Setting(containerEl)
      .setName("Show folder groups")
      .setDesc(
        "When enabled, top-level vault folders are rendered as " +
        "visual group boxes containing their notes."
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showFolderGroups)
          .onChange(async (value) => {
            this.plugin.settings.showFolderGroups = value;
            await this.plugin.saveSettings();
            this.plugin.settingsChanged();
          })
      );

    new Setting(containerEl)
      .setName("Category overrides")
      .setDesc(
        "Map folder path patterns to custom category names. " +
        'One per line, format: "path pattern = Category Name". ' +
        "Example:\n  1 Worldview = Core Concepts\n  3 Business = Business"
      )
      .addTextArea((area) => {
        const current = Object.entries(
          this.plugin.settings.categoryOverrides
        )
          .map(([k, v]) => `${k} = ${v}`)
          .join("\n");

        area
          .setPlaceholder("folder/path = Category Name")
          .setValue(current)
          .onChange(async (value) => {
            const overrides: Record<string, string> = {};
            for (const line of value.split("\n")) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.includes("=")) continue;
              const eqIndex = trimmed.indexOf("=");
              const key = trimmed.slice(0, eqIndex).trim();
              const val = trimmed.slice(eqIndex + 1).trim();
              if (key && val) {
                overrides[key] = val;
              }
            }
            this.plugin.settings.categoryOverrides = overrides;
            await this.plugin.saveSettings();
            this.plugin.settingsChanged();
          });

        area.inputEl.rows = 6;
        area.inputEl.cols = 40;
      });
  }
}
