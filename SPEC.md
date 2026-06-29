# Docker コンテナ仕様

Markdown → PDF 変換ツールの Docker イメージ・実行環境に関する仕様。

## イメージ構成

- ベースイメージ: `mcr.microsoft.com/playwright:v1.52.0-noble`
- コンテナ内アプリ配置: `/app` (`bin/`, `lib/`, `default.css`)
- npm 依存の `playwright` は `1.52.0` に固定（ベースイメージの Chromium と整合）

```bash
cd <Dockerfile_DIR>
docker build -t md-pdf:latest .
```

### 同梱パッケージ

- `locales` + `ja_JP.UTF-8` ロケール生成
- `fonts-noto-cjk`（日本語フォールバック用 CJK フォント）
- [fontconfig/local.conf](fontconfig/local.conf) による日本語フォント優先設定

## アーキテクチャ

- Playwright ベースで PDF 変換
- PDF 変換前後の処理 (相対リンク変換・前処理等) は JavaScript (Node.js) で行う

### 変換パイプライン

1. **前処理** (Node.js): 対象列挙、差分判定、`.md`→`.pdf` リンク変換、`pdf-style` ブロック変換、タイトル抽出
2. **描画** (Playwright): MD→HTML、mermaid インライン描画、CSS 適用、`page.pdf()`
3. **後処理** (Node.js): 相対リンク修正、PDF タイトル設定、`.meta` 書き込み

## 実行方法

### docker run

```bash
cd <WORK_DIR>

# md -> pdf (--env-file指定は任意)
docker run --rm -u "$(id -u):$(id -g)" \
  --env-file .env \
  -v "$PWD":/work \
  md-pdf:latest convert
```

- ホストの `work/` をコンテナの `/work` にマウントする
- `convert` サブコマンドは省略可能
- ENTRYPOINT: `node /app/bin/md-pdf.js`

### 設定の優先度

**CLI オプション > config.yaml > デフォルト**

### target / exclude のパス解決

- 基準ディレクトリ: `markdown/` からの相対パス
- 未指定時: `markdown/` 以下の全 `.md` ファイル
- `--target` 指定時: `exclude` は適用しない

**exclude のマッチング**:

- スラッシュを含まない行: basename の glob 一致 (例: `README.md` は全階層の `README.md` に一致)
- スラッシュを含む行: `markdown/` からの相対パス全体の glob 一致 (例: `09_example/sample01.md`)

### 終了コード

| コード | 意味 |
|--------|------|
| 0 | 全成功、または変換対象 0 件 |
| 1 | 1 件以上の変換失敗 |


## 環境変数

### コンテナ内デフォルト（Dockerfile）

| 変数 | 値 | 用途 |
|------|-----|------|
| `LANG` | `ja_JP.UTF-8` | ロケール |
| `LANGUAGE` | `ja_JP:ja` | ロケール |
| `LC_ALL` | `ja_JP.UTF-8` | ロケール |
| `APP_ROOT` | `/app` | Node.js アプリ・node_modules |
| `WORK_ROOT` | `/work` | マウントされた作業ディレクトリ |
| `DEFAULT_CSS_PATH` | `/app/default.css` | イメージ同梱の既定 CSS |

### ホストからの上書き

- .env の `LANG` / `LANGUAGE` / `LC_ALL` を `docker run --env-file` で渡す。
- Linux / WSL2 では compose の `user: "${UID}:${GID}"` により出力ファイルの所有者を揃える（`.env` で指定、未設定時 `1000:1000`）。

## ロケール・フォント

- Playwright ベースイメージ同梱の WenQuanYi（中国語フォント）が generic `monospace` に選ばれないよう、fontconfig で Noto CJK **JP** を優先する
- Chromium 起動時に `--lang=ja-JP` を指定する
- Playwright ブラウザコンテキストに `locale` / `Accept-Language` を設定し、日本語の漢字字形・フォントフォールバックを優先する
- カスタムフォント未適用箇所のフォールバック用に `fonts-noto-cjk` を同梱する

## マウントとコンテナ内パス

| ホスト | コンテナ | 用途 |
|--------|----------|------|
| `work/` | `/work` | 作業ディレクトリ全体 |
| `work/markdown/` | `/work/markdown/` | 入力 Markdown |
| `work/output/` | `/work/output/` | PDF 出力 |
| `work/output/.meta/` | `/work/output/.meta/` | 差分ビルドメタ |
| `work/.cache/` | `/work/.cache/` | 中間ファイル・Playwright 一時ファイル |
| `work/assets/fonts/` | `/work/assets/fonts/` | フォント (TTF) |
| `work/config.yaml` | `/work/config.yaml` | 設定（任意） |
| `work/style.css` | `/work/style.css` | テーマ CSS（任意） |


## 各機能の仕様

### 既定 CSS

- イメージ同梱の [default.css](default.css) を `/app/default.css` として配置
- `/work/style.css` が存在しない場合は `default.css` のみ適用
- 存在する場合は `default.css` をベースに `/work/style.css` を末尾連結して適用

### PDF タイトル

以下の優先度で設定する:

1. YAML front matter の `title` フィールド
2. 最初の `#` 見出し (H1)
3. ファイル名 (拡張子なし)

### pdf-style ブロック

Markdown 内の `<!--pdf-style ... pdf-style-->` コメントブロックを `<style>...</style>` に変換する。GitHub 上で `<style>` タグの直接記述を避けるための仕組み。

### Mermaid

Playwright で HTML 描画時に `mermaid.js` をインライン実行し、完了後に PDF 化する (1パス方式)。

1. Markdown を HTML に変換 (`marked`)
2. `<script type="module">` で mermaid.js を読み込み、`mermaid.run()` を実行
3. `waitForFunction` で `.mermaid svg` の出現または mermaid ブロック不在を確認 (タイムアウト: 30秒)
4. `page.pdf()` で PDF 生成

失敗時は当該ファイルをエラー扱いとし、他ファイルの変換は継続する (部分成功)。

### 相対リンク変換

`relative_link: true` (デフォルト) のとき、PDF 生成後に `pdf-lib` でリンク URI を修正する。

- ルート: `output/`
- アルゴリズム: リンク先 PDF の `output/` からの相対パスを、現在の PDF の `output/` からのディレクトリを基準に `path.relative` で計算
- HTML 描画前の前処理で `.md` リンクを `.pdf` に変換する

### README.md -> index.pdf変換

- `readme_index: true` (デフォルト) のとき、各ディレクトリの `README.md` は同階層の `index.pdf` として出力する (例: `markdown/09_example/README.md` → `output/09_example/index.pdf`)
- `output/**/README.pdf` は生成しない
- `.md` リンクの前処理では `README.md` へのリンクを `index.pdf` に変換する (例: `./some/README.md` → `./some/index.pdf`)
- PDF 後処理でもリンク URI を `index.pdf` に補正する

### 差分ビルド

`output/.meta/<rel-path>.meta` に以下を 1 行で保存する:

```
<md_mtime> <css_fingerprint> <local_deps_mtime>
```

- `md_mtime`: ソース `.md` の更新時刻 (Unix epoch 秒)
- `css_fingerprint`: `style.css` + `default.css` + フォントファイル内容の MD5
- `local_deps_mtime`: 同一ディレクトリ内の非 `.md` ファイル (画像・SVG 等) の最新 mtime

CSS fingerprint が前回と異なる場合は全件リビルドする。`--target` / `--dry-run` / `--no-cache` 指定時は差分スキップしない。
