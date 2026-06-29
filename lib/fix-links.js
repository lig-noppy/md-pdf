import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    PDFDocument,
    PDFName,
    PDFDict,
    PDFArray,
    PDFString,
    PDFHexString,
} from "pdf-lib";
import { readmePdfToIndexPdfRel } from "./readme-index.js";

/**
 * @param {import('pdf-lib').PDFObject} obj
 */
function getUri(obj) {
    if (obj instanceof PDFString) return obj.asString();
    if (obj instanceof PDFHexString) return obj.decodeText();
    return null;
}

/**
 * @param {string} mdRel
 * @param {boolean} readmeIndex
 * @returns {string}
 */
function mdRelToOutputRel(mdRel, readmeIndex) {
    let rel = mdRel.split(path.sep).join("/");
    if (rel.endsWith(".md")) {
        rel = rel.replace(/\.md$/, ".pdf");
    }
    if (readmeIndex) {
        return readmePdfToIndexPdfRel(rel);
    }
    return rel;
}

/**
 * @param {string} uri
 * @param {string} markdownDir
 * @param {string} outputDir
 * @param {boolean} readmeIndex
 * @param {string} currentMdRelPath markdown/ からの相対パス (例: 09_example/link-test.md)
 */
function uriToOutputRel(uri, markdownDir, outputDir, readmeIndex, currentMdRelPath) {
    const currentMdDir = path.dirname(currentMdRelPath);
    const mdDirPrefix = markdownDir.endsWith("/")
        ? markdownDir
        : `${markdownDir}/`;
    const outPrefix = outputDir.endsWith("/") ? outputDir : `${outputDir}/`;

    if (uri.startsWith("http://") || uri.startsWith("https://")) {
        const pathname = decodeURIComponent(new URL(uri).pathname);
        const mdMarker = "/markdown/";
        const idx = pathname.indexOf(mdMarker);
        if (idx !== -1) {
            return mdRelToOutputRel(
                pathname.slice(idx + mdMarker.length),
                readmeIndex
            );
        }
        const outMarker = "/output/";
        const outIdx = pathname.indexOf(outMarker);
        if (outIdx !== -1) {
            return pathname.slice(outIdx + outMarker.length);
        }
        return null;
    }

    if (uri.startsWith("file://")) {
        const filePath = decodeURIComponent(new URL(uri).pathname);
        if (filePath.startsWith(mdDirPrefix)) {
            return mdRelToOutputRel(
                filePath.slice(mdDirPrefix.length),
                readmeIndex
            );
        }
        if (filePath.startsWith(outPrefix)) {
            return filePath.slice(outPrefix.length);
        }
        return null;
    }

    if (!uri.startsWith("/")) {
        const resolvedMd = path.normalize(path.join(currentMdDir, uri));
        return mdRelToOutputRel(resolvedMd, readmeIndex);
    }

    return null;
}

/**
 * @param {string} pdfPath
 * @param {string} outputDir
 * @param {string} markdownDir
 * @param {string} mdRelPath
 * @param {string} title
 * @param {boolean} readmeIndex
 * @param {boolean} [rewriteLinks=true]
 */
export async function fixPdfLinks(
    pdfPath,
    outputDir,
    markdownDir,
    mdRelPath,
    title,
    readmeIndex,
    rewriteLinks = true
) {
    const pdfBytes = await readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
    pdfDoc.setTitle(title);

    const pdfRel = path.relative(outputDir, pdfPath).split(path.sep).join("/");
    const currentOutDir =
        path.dirname(pdfRel) === "." ? "." : path.dirname(pdfRel);

    for (const page of pdfDoc.getPages()) {
        const annotsRef = page.node.get(PDFName.of("Annots"));
        if (!annotsRef) continue;

        const annots = page.node.context.lookup(annotsRef);
        if (!(annots instanceof PDFArray)) continue;

        for (let i = 0; i < annots.size(); i++) {
            const annot = page.node.context.lookup(annots.get(i));
            if (!(annot instanceof PDFDict)) continue;

            const actionRef = annot.get(PDFName.of("A"));
            if (!actionRef) continue;
            const action = page.node.context.lookup(actionRef);
            if (!(action instanceof PDFDict)) continue;

            const uriRef = action.get(PDFName.of("URI"));
            if (!uriRef) continue;
            const uri = getUri(page.node.context.lookup(uriRef));
            if (!uri || !uri.includes(".pdf")) continue;
            if (!rewriteLinks) continue;

            const targetInOutput = uriToOutputRel(
                uri,
                markdownDir,
                outputDir,
                readmeIndex,
                mdRelPath
            );
            if (!targetInOutput) continue;

            const relative = path
                .relative(currentOutDir, targetInOutput)
                .split(path.sep)
                .join("/");

            action.set(PDFName.of("URI"), PDFString.of(relative));
        }
    }

    const out = await pdfDoc.save();
    await writeFile(pdfPath, out);
}
