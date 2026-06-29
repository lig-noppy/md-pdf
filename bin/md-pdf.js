#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import { loadConfig } from "../lib/config.js";
import { runConvert } from "../lib/convert.js";
import { WORK_ROOT } from "../lib/paths.js";

function parseConvertOptions(cmd) {
    const opts = cmd.opts();
    /** @type {Record<string, unknown>} */
    const cli = {};

    if (opts.target?.length) {
        cli.target = opts.target;
        cli.explicitTarget = true;
    }
    if (opts.ignore?.length) cli.exclude = opts.ignore;
    if (opts.output) cli.output = opts.output;
    if (opts.recurse === false) cli.recurse = false;
    if (opts.relativeLink === false) cli.relativeLink = false;
    if (opts.css) cli.css = opts.css;
    if (opts.readmeIndex === false) cli.readmeIndex = false;
    if (opts.dryRun) cli.dryRun = true;
    if (opts.cache === false) cli.noCache = true;

    return cli;
}

function addConvertOptions(command) {
    return command
        .option(
            "--target <path>",
            "処理対象 (複数指定可)",
            (val, prev) => [...prev, val],
            []
        )
        .option(
            "--ignore <path>",
            "除外対象 (複数指定可)",
            (val, prev) => [...prev, val],
            []
        )
        .option("--output <dir>", "出力フォルダ")
        .option("--no-recurse", "サブディレクトリを処理しない")
        .option("--no-relative-link", "リンクの相対パス化を無効化")
        .option("--css <file>", "CSSテーマファイル")
        .option("--no-readme-index", "README.md の index.pdf 化を無効化")
        .option("--dry-run", "対象一覧のみ表示")
        .option("--no-cache", "差分チェックをせず全対象を変換");
}

async function main() {
    if (!existsSync(WORK_ROOT)) {
        console.error(`[error] Work directory not found: ${WORK_ROOT}`);
        process.exit(1);
    }

    const program = new Command();
    program.name("md-pdf");

    const convertCmd = addConvertOptions(
        program.command("convert").description("markdownをPDFに変換する")
    );

    addConvertOptions(
        program.description("markdownをPDFに変換する").action(async function () {
            const cli = parseConvertOptions(this);
            const options = await loadConfig(cli);
            const result = await runConvert(options);
            process.exit(result.failed > 0 ? 1 : 0);
        })
    );

    convertCmd.action(async function () {
        const cli = parseConvertOptions(this);
        const options = await loadConfig(cli);
        const result = await runConvert(options);
        process.exit(result.failed > 0 ? 1 : 0);
    });

    await program.parseAsync(process.argv);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
