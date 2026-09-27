# 再ビルド（Linux）

モデルが作ったbuild-single-file.mjsは実験時の`/work`を前提にします。Codex作成の`tools/build.py`が一時領域を用意し、ネットワークなしのbubblewrap内で同じスクリプトを動かします。アプリのソースを修正するラッパーではありません。

必要: Python 3.11以降、Node.js 24、bubblewrap、esbuild **0.28.1**の自分のCPU向け実行ファイル。Ubuntu等では`sudo apt install bubblewrap`で導入できます。

esbuildをnpmで入れる場合（このインストールのみnpmへの通信が必要）:

```sh
npm install --prefix .build-deps --ignore-scripts --no-audit --no-fund esbuild@0.28.1
# Linux x64 の例。ARM64では linux-arm64 を指定。
python3 tools/build.py --esbuild .build-deps/node_modules/@esbuild/linux-x64/bin/esbuild
```

`build/index.html`が生成され、配布済みHTMLとのSHA-256一致を確認します。既存出力は上書きしません。

`source/app/`に原本とThree.js、`source/provided-maps/`に地図、`source/provided-geography/`に地名、`source/provided-acquisition/`に取得専用道具を収録しています。個人環境のLLM接続先やキーは不要です。
