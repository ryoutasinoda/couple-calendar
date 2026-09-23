# Push通知の本番設定手順

この手順は、Cloudflare WorkerのPush通知を本番で有効化するためのものです。秘密鍵はリポジトリ、チャット、ソースコードへ保存しません。

## 1. VAPID鍵を生成する

プロジェクトルートで実行します。

```powershell
npx.cmd web-push generate-vapid-keys
```

出力された以下の2つを一時的に安全な場所へ控えます。

- `publicKey`
- `privateKey`

## 2. Cloudflare Worker Secretへ登録する

Cloudflareへログインしている状態で、プロジェクトルートから実行します。

```powershell
npx.cmd wrangler secret put VAPID_PUBLIC_KEY
npx.cmd wrangler secret put VAPID_PRIVATE_KEY
```

各コマンド実行時に、対応する鍵を端末へ直接貼り付けます。鍵はCopilotへ送らないでください。

対象Workerは `wrangler.jsonc` の `name` に設定された `couple-calendar-api` です。

## 3. デプロイ

```powershell
npx.cmd wrangler deploy
```

Pages Functionsを同じデプロイフローで公開している場合は、プロジェクトの通常のPagesデプロイも実行します。

## 4. 設定確認

公開APIで公開鍵が返ることを確認します。

```powershell
Invoke-WebRequest -UseBasicParsing https://<公開URL>/api/push/public-key
```

期待する応答は、`publicKey` が `null` ではないJSONです。秘密鍵が応答に含まれていないことも確認します。

## 5. 実機確認

1. iPhoneはSafariで公開URLを開き、「ホーム画面に追加」してから起動する
2. AndroidはChromeのインストール案内またはブラウザメニューからホーム画面へ追加する
3. ログイン後、「通知を有効にする」を押す
4. ブラウザまたはOSの通知許可を承認する
5. 予定に「前日に通知する」を設定して保存する
6. 対象日前日の日本時間09:00以降に通知を確認する

## 6. 動かない場合の確認

- Worker Secret名が正確に `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` になっているか
- 公開鍵と秘密鍵が同じペアか
- HTTPSでアクセスしているか
- iOSはホーム画面から起動しているか
- ブラウザとOSの通知許可が有効か
- `/api/push/public-key` の `publicKey` が `null` ではないか
- 予定の `notify_before_day` が有効か
- `wrangler tail` でWorkerエラーを確認する

```powershell
npx.cmd wrangler tail couple-calendar-api
```

## 7. 現在の送信仕様

- 送信時刻: Asia/Tokyo 09:00
- 対象: 翌日の予定で「前日に通知する」が有効なもの
- 共有予定: `target` の役割に応じたユーザーへ送信
- 非共有予定: 作成者だけへ送信
- 無効な購読: 404/410応答時に自動削除
- 重複防止: イベント・ユーザー・通知対象日の組み合わせで管理
