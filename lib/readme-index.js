import path from "node:path";

/**
 * @param {string} relPath
 */
export function isReadmeMd(relPath) {
    return path.basename(relPath) === "README.md";
}

/**
 * @param {string} mdRelPath markdown/ からの相対パス (例: 09_example/sub-directory/README.md)
 * @returns {string} output/ からの相対パス (例: 09_example/sub-directory/index.pdf)
 */
export function readmeMdToIndexPdfRel(mdRelPath) {
    const dir = path.dirname(mdRelPath).split(path.sep).join("/");
    return dir === "." ? "index.pdf" : `${dir}/index.pdf`;
}

/**
 * @param {string} pdfRelPath output/ からの相対パス (例: 09_example/sub-directory/README.pdf)
 * @returns {string}
 */
export function readmePdfToIndexPdfRel(pdfRelPath) {
    const normalized = pdfRelPath.split(path.sep).join("/");
    if (path.basename(normalized) !== "README.pdf") {
        return normalized;
    }
    const dir = path.posix.dirname(normalized);
    return dir === "." ? "index.pdf" : `${dir}/index.pdf`;
}

/**
 * @param {string} linkPrefix リンクの .md 直前までのパス (例: ./some/README)
 * @param {boolean} readmeIndex
 */
export function readmeLinkToPdfPath(linkPrefix, readmeIndex) {
    if (!readmeIndex) {
        return `${linkPrefix}.pdf`;
    }
    const normalized = linkPrefix.replace(/\\/g, "/");
    if (normalized === "README" || normalized.endsWith("/README")) {
        const dir =
            normalized === "README"
                ? ""
                : normalized.slice(0, -"/README".length);
        return dir ? `${dir}/index.pdf` : "index.pdf";
    }
    return `${linkPrefix}.pdf`;
}
