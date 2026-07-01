# NUMO — 英語の数字リスニング

英語の数字・日付・年を、聞いて答え合わせするブラウザ学習アプリです。
数字ジャンルでは、ランダム出題に加えて2桁・3桁・4桁・5桁の集中練習を選べます。

## 公開URL / Render

このアプリはChatGPT APIキーを安全に扱うため、Renderのサーバー経由で公開します。

Render版:

https://flashcard2-yiaq.onrender.com/

以前のGitHub Pages URLも、このRender版へ転送するように変更済みです。

Render側の環境変数:

- `OPENAI_API_KEY`: 自分のOpenAI APIキー
- `OPENAI_MODEL`: 任意。未変更なら `gpt-4.1-mini`
- `OPENAI_TTS_MODEL`: 任意。未変更なら `gpt-4o-mini-tts`
- `OPENAI_TTS_VOICE`: 任意。未変更なら `alloy`

GitHub Pages版は静的ページのためAPIキーを安全に隠せません。API出題を使う場合はRender版を使います。
スマホではブラウザ内蔵の読み上げが止まることがあるため、Render経由でMP3音声を作って再生します。カード表示時に音声を先読みし、同じ英文・同じ速度の音声は再利用して待ち時間を短くします。

### Renderでの設定

RenderでこのGitHubリポジトリをBlueprintまたはWeb Serviceとして作成します。

- Build Command: `npm install`
- Start Command: `npm start`
- Environment Variable: `OPENAI_API_KEY`

`render.yaml` も同梱しているので、Blueprintとして読み込む場合は `OPENAI_API_KEY` の入力を求められます。

## 起動

### スマホで見る

`スマホで開く.command` をダブルクリックすると、スマホ用のURLが表示されます。

Macとスマホを同じWi-Fiにつないで、スマホで表示されたURLを開いてください。
初回に「ネットワーク接続を許可しますか」のような確認が出た場合は許可してください。

止めるときは、開いたターミナル画面で `Ctrl + C` を押します。

ChatGPT APIで問題を作る場合は、`.env.example` をコピーして `.env` にリネームし、`OPENAI_API_KEY` を自分のキーに書き換えてから `スマホで開く.command` を起動してください。APIキーを設定しない場合は内蔵問題で動きます。

### Macだけで見る

Node.js 18以降で、フォルダ内から次を実行します。

```bash
npm start
```

ブラウザで `http://127.0.0.1:4173` を開きます。APIキーなしでも内蔵問題で全機能を試せます。

## ChatGPT APIを使う

APIキーは画面やソースコードに書かず、起動時の環境変数に設定します。

```bash
OPENAI_API_KEY="your_api_key" npm start
```

任意のモデルへ変更する場合は `OPENAI_MODEL` も指定できます（既定値は `gpt-4.1-mini`）。

```bash
OPENAI_API_KEY="your_api_key" OPENAI_MODEL="gpt-4.1-mini" npm start
```

「もう一度」で残した問題と発音速度は、ブラウザのローカルストレージに保存されます。
