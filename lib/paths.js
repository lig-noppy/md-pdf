import path from "node:path";

export const WORK_ROOT = process.env.WORK_ROOT || "/work";
export const MARKDOWN_DIR = path.join(WORK_ROOT, "markdown");
export const OUTPUT_DIR = path.join(WORK_ROOT, "output");
export const CACHE_DIR = path.join(WORK_ROOT, ".cache");
export const META_DIR = path.join(OUTPUT_DIR, ".meta");
export const ASSETS_DIR = path.join(WORK_ROOT, "assets");
export const FONTS_DIR = path.join(ASSETS_DIR, "fonts");
export const CONFIG_PATH = path.join(WORK_ROOT, "config.yaml");
export const DEFAULT_CSS_PATH =
    process.env.DEFAULT_CSS_PATH || "/app/default.css";

export const DEFAULTS = {
    target: null,
    exclude: [],
    output: "output",
    recurse: true,
    relativeLink: true,
    css: "style.css",
    readmeIndex: true,
    dryRun: false,
    noCache: false,
};
