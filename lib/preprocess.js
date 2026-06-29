import path from "node:path";
import { readmeLinkToPdfPath } from "./readme-index.js";

/**
 * @param {string} content
 * @param {string} fallbackBasename
 * @returns {string}
 */
export function extractTitle(content, fallbackBasename) {
    const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontMatterMatch) {
        const titleLine = frontMatterMatch[1]
            .split("\n")
            .find((line) => /^title:\s*/.test(line));
        if (titleLine) {
            return titleLine.replace(/^title:\s*/, "").trim();
        }
    }

    const h1Match = content.match(/^# (.+)$/m);
    if (h1Match) {
        return h1Match[1].trim();
    }

    return fallbackBasename;
}

/**
 * @param {string} content
 * @param {boolean} [readmeIndex=false]
 * @returns {string}
 */
export function rewriteMdLinks(content, readmeIndex = false) {
    return content.replace(
        /\]\(([^)]*)\.md([^)]*)\)/g,
        (_match, prefix, suffix) =>
            `](${readmeLinkToPdfPath(prefix, readmeIndex)}${suffix})`
    );
}

/**
 * @param {string} content
 * @returns {string}
 */
export function convertPdfStyleBlocks(content) {
    return content.replace(
        /<!--pdf-style([\s\S]*?)pdf-style-->/g,
        (_match, inner) => `<style>${inner}</style>`
    );
}

/**
 * @param {string} content
 * @param {string} mdPath
 * @param {boolean} [readmeIndex=false]
 * @returns {{ content: string, title: string }}
 */
export function preprocessMarkdown(content, mdPath, readmeIndex = false) {
    const fallbackBasename = path.basename(mdPath, ".md");
    const title = extractTitle(content, fallbackBasename);
    let processed = convertPdfStyleBlocks(
        rewriteMdLinks(content, readmeIndex)
    );
    return { content: processed, title };
}
