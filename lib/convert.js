import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { CACHE_DIR, MARKDOWN_DIR, WORK_ROOT } from "./paths.js";
import {
    prepareIncrementalState,
    needsRebuild,
    writeRebuildMeta,
} from "./incremental.js";
import { preprocessMarkdown } from "./preprocess.js";
import { collectTargets, resolveOutputPdf } from "./targets.js";
import { renderMarkdownToPdf, createBrowser } from "./render.js";
import { fixPdfLinks } from "./fix-links.js";

/**
 * @param {import('./config.js').ConvertOptions} options
 */
export async function runConvert(options) {
    await mkdir(options.output, { recursive: true });
    await mkdir(path.join(options.output, ".meta"), { recursive: true });
    await mkdir(CACHE_DIR, { recursive: true });

    console.error("[init] Preparing build environment...");
    if (options.noCache) {
        console.error("[init] --no-cache: converting all targets");
    }
    await prepareIncrementalState(options.css, CACHE_DIR);

    const targets = await collectTargets(options);

    if (targets.length === 0) {
        console.error("[warn] No .md files found");
        return { success: 0, failed: 0, skipped: 0, total: 0 };
    }

    if (options.dryRun) {
        for (const rel of targets) {
            console.log(rel);
        }
        return { success: 0, failed: 0, skipped: 0, total: targets.length };
    }

    console.log("");
    console.log(`=== Converting ${targets.length} files ===`);
    console.log("");

    const browser = await createBrowser();
    let success = 0;
    let failed = 0;
    let skipped = 0;

    try {
        for (let i = 0; i < targets.length; i++) {
            const relPath = targets[i];
            const num = i + 1;
            const mdAbsPath = path.join(MARKDOWN_DIR, relPath);
            const pdfPath = resolveOutputPdf(relPath, options);

            console.log(`[${num}/${targets.length}] ${relPath}`);

            if (!(await needsRebuild(relPath, pdfPath, options))) {
                console.log("  [skip] up to date");
                skipped++;
                continue;
            }

            try {
                const raw = await readFile(mdAbsPath, "utf8");
                const { content, title } = preprocessMarkdown(
                    raw,
                    mdAbsPath,
                    options.readmeIndex
                );

                await renderMarkdownToPdf({
                    mdContent: content,
                    mdAbsPath,
                    pdfPath,
                    cacheDir: CACHE_DIR,
                    cssPath: options.css,
                    browser,
                });

                try {
                    await fixPdfLinks(
                        pdfPath,
                        options.output,
                        MARKDOWN_DIR,
                        relPath,
                        title,
                        options.readmeIndex,
                        options.relativeLink
                    );
                } catch (err) {
                    console.error(
                        `  [warn] PDF metadata fix failed: ${err.message}`
                    );
                }

                await writeRebuildMeta(relPath, options.output);
                const outRel = path.relative(options.output, pdfPath);
                console.log(`  [ok] → ${outRel}`);
                success++;
            } catch (err) {
                console.error(`  [error] ${err.message}`);
                failed++;
            }
        }
    } finally {
        await browser.close();
    }

    console.log("");
    console.log("=== Complete ===");
    console.log(`  Success: ${success} / ${targets.length}`);
    if (skipped > 0) console.log(`  Skipped: ${skipped} / ${targets.length}`);
    if (failed > 0) console.log(`  Failed:  ${failed} / ${targets.length}`);
    console.log(`  Output:  ${options.output}/`);

    return { success, failed, skipped, total: targets.length };
}
