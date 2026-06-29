# md-pdf (Docker イメージ)

Markdown → PDF 変換 CLI。コンテナ内 `/app` に配置される。

```
bin/md-pdf.js       CLI エントリ
lib/                変換ロジック
default.css         既定スタイル
fontconfig/         日本語フォント優先設定
Dockerfile
package.json
```

- コンテナ・イメージの仕様: [SPEC.md](SPEC.md)
