import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONFIG_PATH, DEFAULTS, WORK_ROOT } from "./paths.js";

/**
 * @typedef {object} ConvertOptions
 * @property {string[]|null} target
 * @property {string[]} exclude
 * @property {string} output
 * @property {boolean} recurse
 * @property {boolean} relativeLink
 * @property {string} css
 * @property {boolean} readmeIndex
 * @property {boolean} dryRun
 * @property {boolean} noCache
 * @property {boolean} explicitTarget
 */

/**
 * @param {Partial<ConvertOptions>} cli
 * @returns {Promise<ConvertOptions>}
 */
export async function loadConfig(cli = {}) {
    /** @type {Partial<ConvertOptions>} */
    let fileConfig = {};

    if (existsSync(CONFIG_PATH)) {
        const raw = await readFile(CONFIG_PATH, "utf8");
        const parsed = YAML.parse(raw) || {};
        fileConfig = {
            target: parsed.target ?? null,
            exclude: parsed.exclude ?? [],
            output: parsed.output,
            recurse: parsed.recurse,
            relativeLink: parsed.relative_link,
            css: parsed.css,
            readmeIndex: parsed.readme_index,
        };
    }

    const merged = {
        ...DEFAULTS,
        ...fileConfig,
        ...cli,
    };

    if (merged.output && !path.isAbsolute(merged.output)) {
        merged.output = path.join(WORK_ROOT, merged.output);
    }

    if (merged.css && !path.isAbsolute(merged.css)) {
        merged.css = path.join(WORK_ROOT, merged.css);
    }

    return /** @type {ConvertOptions} */ (merged);
}
