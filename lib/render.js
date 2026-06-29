import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import { createReadStream } from "node:fs";
import { chromium } from "playwright";
import { marked } from "marked";
import { DEFAULT_CSS_PATH, WORK_ROOT } from "./paths.js";
import { getAcceptLanguage, getChromiumArgs, getHtmlLang, getPlaywrightLocale } from "./locale.js";

const MERMAID_TIMEOUT_MS = 30_000;
const APP_ROOT = process.env.APP_ROOT || "/app";

/**
 * @typedef {{ prefix: string, dir: string }} StaticRoot
 */

/**
 * @param {StaticRoot[]} roots
 */
function createStaticServer(roots) {
    const resolved = roots.map((r) => ({
        prefix: r.prefix.replace(/\/$/, ""),
        dir: path.resolve(r.dir),
    }));

    const server = http.createServer((req, res) => {
        const urlPath = decodeURIComponent(
            new URL(req.url || "/", "http://x").pathname
        );

        for (const { prefix, dir } of resolved) {
            const prefixPath = prefix ? `/${prefix}` : "";
            if (urlPath === prefixPath || urlPath.startsWith(`${prefixPath}/`)) {
                const rel = prefix
                    ? urlPath.slice(prefixPath.length + 1)
                    : urlPath.slice(1);
                const filePath = path.normalize(path.join(dir, rel || "."));
                if (!filePath.startsWith(dir)) {
                    res.writeHead(403);
                    res.end();
                    return;
                }
                if (!existsSync(filePath)) {
                    continue;
                }
                const ext = path.extname(filePath).toLowerCase();
                const types = {
                    ".html": "text/html",
                    ".css": "text/css",
                    ".js": "text/javascript",
                    ".mjs": "text/javascript",
                    ".svg": "image/svg+xml",
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".ttf": "font/ttf",
                    ".pdf": "application/pdf",
                };
                res.writeHead(200, {
                    "Content-Type": types[ext] || "application/octet-stream",
                });
                createReadStream(filePath).pipe(res);
                return;
            }
        }

        res.writeHead(404);
        res.end();
    });

    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const addr = server.address();
            const port = typeof addr === "object" && addr ? addr.port : 0;
            resolve({ server, port, baseUrl: `http://127.0.0.1:${port}` });
        });
    });
}

/**
 * @param {string} css
 * @returns {string}
 */
function extractFontFamily(css) {
    const matches = [...css.matchAll(/font-family:\s*([^;!}]+)/gi)];
    if (matches.length > 0) {
        const raw = matches[matches.length - 1][1].trim();
        if (!/Noto Sans Mono CJK JP/.test(raw)) {
            return `${raw}, "Noto Sans Mono CJK JP", monospace`;
        }
        return raw;
    }
    return '"Noto Sans Mono CJK JP", monospace';
}

/**
 * @param {string} fontFamily
 * @returns {string}
 */
function mermaidFontCss(fontFamily) {
    return `
/* Mermaid diagram text (SVG + html labels) */
.mermaid svg text,
.mermaid svg tspan,
.mermaid svg .nodeLabel,
.mermaid svg .edgeLabel,
.mermaid .nodeLabel,
.mermaid .edgeLabel,
.mermaid p {
    font-family: ${fontFamily} !important;
}
`;
}

/**
 * @param {string} htmlBody
 * @param {boolean} hasMermaid
 * @param {string} baseHref
 * @param {string} cssUrl
 * @param {string} fontFamily
 */
function wrapHtml(htmlBody, hasMermaid, baseHref, cssUrl, fontFamily) {
    const htmlLang = getHtmlLang();
    const mermaidScript = hasMermaid
        ? `<script type="module">
import mermaid from '/node_modules/mermaid/dist/mermaid.esm.min.mjs';
await document.fonts.ready;
mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    theme: 'base',
    themeVariables: {
        fontFamily: ${JSON.stringify(fontFamily)},
    },
});
await mermaid.run({ querySelector: '.mermaid' });
window.__mermaidDone = true;
</script>`
        : `<script>window.__mermaidDone = true;</script>`;

    return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8">
<base href="${baseHref}">
<link rel="stylesheet" href="${cssUrl}">
</head>
<body>
<div class="markdown-body">
${htmlBody}
</div>
${mermaidScript}
</body>
</html>`;
}

marked.use({
    renderer: {
        code({ text, lang }) {
            if (lang === "mermaid") {
                return `<pre class="mermaid">${text}</pre>\n`;
            }
            const escaped = text
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            return `<pre><code class="language-${lang || ""}">${escaped}</code></pre>\n`;
        },
    },
});

/**
 * @param {string} cssPath
 * @param {string} cacheDir
 * @returns {Promise<{ outPath: string, fontFamily: string }>}
 */
export async function buildCombinedCss(cssPath, cacheDir) {
    let css = "";
    if (existsSync(DEFAULT_CSS_PATH)) {
        css += await readFile(DEFAULT_CSS_PATH, "utf8");
        css += "\n";
    }
    if (existsSync(cssPath)) {
        let userCss = await readFile(cssPath, "utf8");
        userCss = userCss.replace(/url\("\/work\//g, 'url("/');
        css += userCss;
    }

    const fontFamily = extractFontFamily(css);
    css += mermaidFontCss(fontFamily);

    await mkdir(cacheDir, { recursive: true });
    const outPath = path.join(cacheDir, "style-combined.css");
    await writeFile(outPath, css, "utf8");
    return { outPath, fontFamily };
}

/**
 * @param {object} params
 * @param {string} params.mdContent
 * @param {string} params.mdAbsPath
 * @param {string} params.pdfPath
 * @param {string} params.cacheDir
 * @param {string} params.cssPath
 * @param {import('playwright').Browser} [params.browser]
 */
export async function renderMarkdownToPdf({
    mdContent,
    mdAbsPath,
    pdfPath,
    cacheDir,
    cssPath,
    browser: existingBrowser,
}) {
    const { fontFamily } = await buildCombinedCss(cssPath, cacheDir);

    const hasMermaid =
        /```mermaid/.test(mdContent) || /class="mermaid"/.test(mdContent);
    const htmlBody = await marked.parse(mdContent);

    const mdRel = path.relative(path.join(WORK_ROOT, "markdown"), mdAbsPath);
    const mdDirUrl = path.dirname(mdRel).split(path.sep).join("/");
    const basePath = mdDirUrl ? `/markdown/${mdDirUrl}/` : "/markdown/";

    const htmlName = `render-${path.basename(mdAbsPath, ".md")}.html`;
    const htmlPath = path.join(cacheDir, htmlName);

    const ownBrowser = !existingBrowser;
    const browser =
        existingBrowser ||
        (await chromium.launch({
            args: getChromiumArgs(),
        }));

    const { server, baseUrl } = await createStaticServer([
        { prefix: "", dir: WORK_ROOT },
        { prefix: "node_modules", dir: path.join(APP_ROOT, "node_modules") },
    ]);

    const baseHref = `${baseUrl}${basePath}`;
    const cssUrl = `${baseUrl}/.cache/style-combined.css`;
    const html = wrapHtml(htmlBody, hasMermaid, baseHref, cssUrl, fontFamily);
    await writeFile(htmlPath, html, "utf8");

    let context;
    try {
        context = await browser.newContext({
            locale: getPlaywrightLocale(),
            extraHTTPHeaders: {
                "Accept-Language": getAcceptLanguage(),
            },
        });
        const page = await context.newPage();
        const pageUrl = `${baseUrl}/.cache/${htmlName}`;
        await page.goto(pageUrl, {
            waitUntil: "networkidle",
            timeout: MERMAID_TIMEOUT_MS,
        });

        if (hasMermaid) {
            await page.waitForFunction(() => window.__mermaidDone === true, {
                timeout: MERMAID_TIMEOUT_MS,
            });
            await page
                .waitForSelector(".mermaid svg", {
                    timeout: MERMAID_TIMEOUT_MS,
                })
                .catch(() => {});
        }

        await mkdir(path.dirname(pdfPath), { recursive: true });
        await page.pdf({
            path: pdfPath,
            format: "A4",
            printBackground: true,
            preferCSSPageSize: true,
        });
    } finally {
        if (context) await context.close();
        server.close();
        if (ownBrowser) await browser.close();
    }
}

export async function createBrowser() {
    return chromium.launch({
        args: getChromiumArgs(),
    });
}
