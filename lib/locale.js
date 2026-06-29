/**
 * LANG=ja_JP.UTF-8 形式の環境変数を Playwright の locale (ja-JP) に変換する。
 * @returns {string}
 */
export function getPlaywrightLocale() {
    const lang =
        process.env.LC_ALL || process.env.LANG || "ja_JP.UTF-8";
    const match = lang.match(/^([a-z]{2})_([A-Z]{2})/i);
    if (match) {
        return `${match[1].toLowerCase()}-${match[2].toUpperCase()}`;
    }
    return "ja-JP";
}

/**
 * @returns {string}
 */
export function getAcceptLanguage() {
    if (process.env.LANGUAGE) {
        return process.env.LANGUAGE.replace(/:/g, ",");
    }
    const locale = getPlaywrightLocale();
    const lang = locale.split("-")[0];
    return `${locale},${lang}`;
}

/**
 * @returns {string}
 */
export function getHtmlLang() {
    return getPlaywrightLocale().split("-")[0];
}

/**
 * @returns {string[]}
 */
export function getChromiumArgs() {
    return [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--lang=${getPlaywrightLocale()}`,
    ];
}
