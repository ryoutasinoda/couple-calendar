# Couple Calendar Cloudflare 構成設計

> 2026-09-21時点の設計案。認証・同期・外部AIは未導入。

## 1. 方針

- ReactからD1へ直接接続しない。
- すべてのデータアクセスをCloudflare Workers API経由にする。
- Workersで認証、夫婦所属、入力値、対象者、日付・時刻を検証する。
- パスワードと招待コードは平文保存しない。
- 認証情報はlocalStorageへ保存せず、HttpOnly Cookieセッションを使う。
- AI機能を追加する場合も、AIは下書きや検索条件を返すだけにする。
- AIの結果をユーザー確認なしにイベント保存・変更・削除へ使わない。

## 2. 構成

```text
React / PWA
  -> HTTPS
Cloudflare Workers
  -> D1: users, sessions, couples, events
  -> KV: 必要なレート制限や一時データのみ
  -> Workers AI: 採用時に構造化解析のみ
```

D1の認証情報やAIキーをフロントエンドへ公開しない。Cloudflare Pagesを静的配信に使う場合も、APIはWorkers側に置く。

## 3. 最小データモデル

### users

- `id` INTEGER PRIMARY KEY
- `login_id` TEXT NOT NULL UNIQUE
- `display_name` TEXT NOT NULL
- `password_hash` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### sessions

- `id` TEXT PRIMARY KEY
- `user_id` INTEGER NOT NULL
- `expires_at` TEXT NOT NULL
- `created_at` TEXT NOT NULL

セッションIDは十分な乱数で生成し、Cookieには `HttpOnly; Secure; SameSite=Lax` を付ける。ログイン後のセッション固定攻撃を避けるため、ログイン成功時に新しいセッションを発行する。

### couples

- `id` INTEGER PRIMARY KEY
- `invite_code_hash` TEXT
- `invite_code_expires_at` TEXT
- `created_at` TEXT NOT NULL

### couple_members

- `couple_id` INTEGER NOT NULL
- `user_id` INTEGER NOT NULL
- `role` TEXT NOT NULL CHECK(role IN ('husband', 'wife'))
- `created_at` TEXT NOT NULL
- `UNIQUE(couple_id, user_id)`
- `UNIQUE(couple_id, role)`

### events

- `id` INTEGER PRIMARY KEY
- `couple_id` INTEGER NOT NULL
- `created_by` INTEGER NOT NULL
- `title` TEXT NOT NULL
- `start_date` TEXT NOT NULL
- `end_date` TEXT
- `start_time` TEXT
- `end_time` TEXT
- `is_all_day` INTEGER NOT NULL DEFAULT 1
- `target` TEXT NOT NULL CHECK(target IN ('husband', 'wife', 'both'))
- `icon` TEXT NOT NULL
- `location` TEXT
- `memo` TEXT
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

日付は `YYYY-MM-DD`、時刻は `HH:mm`、タイムゾーンは `Asia/Tokyo` を基準にする。終日予定では開始・終了時刻をNULLにする。開始時刻と終了時刻の順序はWorkersでも検証する。

## 4. API境界

### 認証

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 夫婦

- `POST /api/couple/create`
- `POST /api/couple/join`
- `GET /api/couple`
- `POST /api/couple/invite-code/regenerate`

### イベント

- `GET /api/events?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/events/:id`
- `POST /api/events`
- `PUT /api/events/:id`
- `DELETE /api/events/:id`

すべてのイベントAPIで、Cookieセッションから取得したユーザーが対象イベントのcouple memberであることを確認する。URLのIDやリクエストの `couple_id` だけを信用しない。

## 5. 入力検証

- タイトルは空白のみを拒否する。
- 日付は厳密な `YYYY-MM-DD` として検証する。
- 時刻は厳密な `HH:mm` として検証する。
- `is_all_day=true` の場合、時間は空に正規化する。
- 終了時刻が開始時刻より前なら400を返す。
- `target`、`icon`、`role` は許可リストで検証する。
- event id、couple id、user idの所属をWorkers側で検証する。
- 保存前にエラー理由と修正方法をJSONで返す。

## 6. 招待コード

- 8〜10文字の見間違えにくい英数字を生成する。
- 画面には発行時だけ平文を表示する。
- D1にはハッシュのみ保存する。
- 再発行時は古いハッシュを無効化する。
- 有効期限と試行回数制限は実装前に決定する。
- ログに招待コードを出力しない。

## 7. 実装フェーズ

1. D1 migrationとWorkersのhealth endpointを作成する。
2. register/login/me/logoutとCookieセッションを実装する。
3. couple create/joinと所属チェックを実装する。
4. events APIを実装し、既存localStorageモデルとの変換を行う。
5. Reactの保存先をAPIへ切り替える。移行中はlocalStorageを勝手に削除しない。
6. 本番公開前にCookie、CORS、CSRF、レート制限、ログ内容を確認する。

## 8. 未決定事項

- パスワードハッシュ方式とWorkersでの実装方法。
- セッションの有効期間と失効方法。
- 招待コードの有効期限・再発行権限・失敗回数。
- 同期移行時に既存localStorageをどう取り込むか。
- Cloudflareの無料枠、D1容量、Workers利用量、AI料金上限。

未決定のまま認証情報や本番D1へ接続する実装は始めない。
