import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import {
    DEFAULT_CSS_PATH,
    FONTS_DIR,
    MARKDOWN_DIR,
} from "./paths.js";

let assetFingerprint = "";
let assetFingerprintChanged = false;

/**
 * @param {string} cssPath
 */
export async function computeCssFingerprint(cssPath) {
    const hash = createHash("md5");
    if (existsSync(DEFAULT_CSS_PATH)) {
        hash.update(await readFile(DEFAULT_CSS_PATH));
    }
    if (existsSync(cssPath)) {
        hash.update(await readFile(cssPath));
    }
    if (existsSync(FONTS_DIR)) {
        const fonts = await readdir(FONTS_DIR);
        for (const font of fonts.sort()) {
            if (font.endsWith(".ttf") || font.endsWith(".otf")) {
                hash.update(
                    await readFile(path.join(FONTS_DIR, font))
                );
            }
        }
    }
    return hash.digest("hex");
}

/**
 * @param {string} cssPath
 * @param {string} cacheDir
 */
export async function prepareIncrementalState(cssPath, cacheDir) {
    assetFingerprint = await computeCssFingerprint(cssPath);
    const fpFile = path.join(cacheDir, ".asset-fingerprint");
    let stored = "";
    if (existsSync(fpFile)) {
        stored = (await readFile(fpFile, "utf8")).trim();
    }
    await mkdir(cacheDir, { recursive: true });
    await writeFile(fpFile, assetFingerprint, "utf8");
    assetFingerprintChanged = stored !== "" && stored !== assetFingerprint;
    if (assetFingerprintChanged) {
        console.error("[init] Asset fingerprint changed; all PDFs will be rebuilt");
    } else if (stored) {
        console.error("[init] Incremental build enabled");
    } else {
        console.error("[init] Initial build (no prior asset fingerprint)");
    }
}

/**
 * @param {string} relPath
 */
async function localDepsMaxMtime(relPath) {
    const dir = path.join(MARKDOWN_DIR, path.dirname(relPath));
    if (!existsSync(dir)) return 0;

    let max = 0;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (entry.name.endsWith(".md")) continue;
        const mtime = (await stat(path.join(dir, entry.name))).mtimeMs;
        if (mtime > max) max = mtime;
    }
    return Math.floor(max / 1000);
}

/**
 * @param {string} relPath
 * @param {string} pdfPath
 * @param {import('./config.js').ConvertOptions} options
 */
export async function needsRebuild(relPath, pdfPath, options) {
    if (options.noCache || options.explicitTarget || options.dryRun) return true;
    if (assetFingerprintChanged) return true;
    if (!existsSync(pdfPath)) return true;

    const srcMd = path.join(MARKDOWN_DIR, relPath);
    if (!existsSync(srcMd)) return true;

    const mdMtime = Math.floor((await stat(srcMd)).mtimeMs / 1000);
    const depMtime = await localDepsMaxMtime(relPath);
    const metaDir = path.join(options.output, ".meta");
    const metaPath = path.join(metaDir, relPath.replace(/\.md$/, ".meta"));

    if (existsSync(metaPath)) {
        const line = (await readFile(metaPath, "utf8")).trim();
        const [storedMd, storedFp, storedDep] = line.split(" ");
        if (
            storedMd === String(mdMtime) &&
            storedFp === assetFingerprint &&
            storedDep === String(depMtime)
        ) {
            return false;
        }
    }

    return true;
}

/**
 * @param {string} relPath
 * @param {string} outputDir
 */
export async function writeRebuildMeta(relPath, outputDir) {
    const srcMd = path.join(MARKDOWN_DIR, relPath);
    const mdMtime = Math.floor((await stat(srcMd)).mtimeMs / 1000);
    const depMtime = await localDepsMaxMtime(relPath);
    const metaPath = path.join(outputDir, ".meta", relPath.replace(/\.md$/, ".meta"));
    await mkdir(path.dirname(metaPath), { recursive: true });
    await writeFile(
        metaPath,
        `${mdMtime} ${assetFingerprint} ${depMtime}\n`,
        "utf8"
    );
}

export function getAssetFingerprint() {
    return assetFingerprint;
}
