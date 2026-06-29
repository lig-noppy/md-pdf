import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isReadmeMd, readmeMdToIndexPdfRel } from "./readme-index.js";
import { MARKDOWN_DIR } from "./paths.js";

/**
 * @param {string} pattern
 * @param {string} value
 */
function globMatch(pattern, value) {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
    return new RegExp(`^${escaped}$`).test(value);
}

/**
 * @param {string} relPath
 * @param {string[]} exclude
 */
export function isExcluded(relPath, exclude) {
    const base = path.basename(relPath);
    for (const pattern of exclude) {
        if (pattern.includes("/")) {
            if (globMatch(pattern, relPath)) return true;
        } else if (globMatch(pattern, base)) {
            return true;
        }
    }
    return false;
}

/**
 * @param {string} dir
 * @param {boolean} recurse
 * @returns {Promise<string[]>}
 */
async function collectMdInDir(dir, recurse) {
    const results = [];
    if (!existsSync(dir)) return results;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (recurse) {
                results.push(...(await collectMdInDir(full, true)));
            }
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
            results.push(full);
        }
    }
    return results.sort();
}

/**
 * @param {import('./config.js').ConvertOptions} options
 * @returns {Promise<string[]>} relative paths from markdown/
 */
export async function collectTargets(options) {
    let files = [];

    if (options.target && options.target.length > 0) {
        for (const t of options.target) {
            const rel = t.replace(/^\.\//, "");
            const abs = path.join(MARKDOWN_DIR, rel);
            const st = await stat(abs);
            if (st.isDirectory()) {
                files.push(
                    ...(await collectMdInDir(abs, options.recurse))
                );
            } else if (st.isFile()) {
                files.push(abs);
            }
        }
    } else {
        files = await collectMdInDir(MARKDOWN_DIR, options.recurse);
    }

    let relPaths = files.map((f) =>
        path.relative(MARKDOWN_DIR, f).split(path.sep).join("/")
    );

    if (!options.explicitTarget && options.exclude.length > 0) {
        relPaths = relPaths.filter((rel) => {
            if (options.readmeIndex && isReadmeMd(rel)) return true;
            return !isExcluded(rel, options.exclude);
        });
    }

    return relPaths.sort();
}

/**
 * @param {string} relPath
 * @param {import('./config.js').ConvertOptions} options
 * @returns {string} absolute PDF output path
 */
export function resolveOutputPdf(relPath, options) {
    if (options.readmeIndex && isReadmeMd(relPath)) {
        return path.join(options.output, readmeMdToIndexPdfRel(relPath));
    }
    const pdfRel = relPath.replace(/\.md$/, ".pdf");
    return path.join(options.output, pdfRel);
}
