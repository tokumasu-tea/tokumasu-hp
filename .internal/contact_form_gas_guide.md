# お問い合わせフォーム × GAS 連携 説明書

対象：Codex / Claude Code など、このリポジトリを触るAIエージェント全員。
**このフォルダ（`.internal/`）は GitHub Pages では公開されません**（後述）。
最終更新：2026-09-11（GAS バージョン8デプロイ時点）

---

## 1. 全体構成

```
ユーザーのブラウザ
  └ tokumasu_contact.html / tokumasu_contact_en.html
      └ tokumasu_contact.js（共通・日英両ページから読み込み）
          └ fetch(POST, ヘッダー無し, JSON) ──► GAS ウェブアプリ (doPost)
                                                    ├─ 店舗あて通知メール（MailApp）
                                                    ├─ お客様あて返信下書き（GmailApp.createDraft）
                                                    └─ お客様あて自動返信メール（MailApp・日英切替）
```

### フロント側ファイル
| ファイル | 役割 |
|---|---|
| `tokumasu_contact.html` | お問い合わせフォーム（日本語ページ） |
| `tokumasu_contact_en.html` | お問い合わせフォーム（英語ページ） |
| `tokumasu_contact.js` | 日英共通。入力チェック・文字数カウンター・郵便番号自動入力・画像添付（縮小・Base64化）・連続送信の抑止（フロント側・後述）・GASへの送信処理を全部ここに書いている |
| `tokumasu_contact.css` | 上記3ページ共通スタイル |

HTML側の `<script src="tokumasu_contact.js?v=20260911">` の `?v=` はキャッシュ対策のバージョンクエリ。
**JSの中身を変更したら、この日付を更新すること**（さもないとブラウザに古いJSがキャッシュされたまま残る）。

### GAS側
| 項目 | 値 |
|---|---|
| プロジェクト名 | `徳増HP_お問い合わせ自動化` |
| プロジェクトを開く | https://script.google.com/home （マイプロジェクト一覧）から同名プロジェクトを開く |
| ウェブアプリURL（doPostのエンドポイント。フォームJSの送信先） | `https://script.google.com/macros/s/AKfycbyFJ_CcL_FD5D8H_wQTFCfJxrwEgpmOxRjWWLQmhnpgv1Kl8LCSvAALmZMdyQXgALBX-w/exec` |
| ファイル | `Code.gs`（1ファイルのみ） |
| 現在のバージョン | **バージョン8**（2026-09-11 19:59 JST にデプロイ） |

同じフォルダに `gas_code_backup.gs.txt` として、上記バージョン8時点の `Code.gs` の全文控えを置いてある。

> 補足：このGASプロジェクトには `onFormSubmit(e)` という関数と `authorize_temp()` という関数も残っているが、
> これらは**現在のお問い合わせフォームとは無関係の古いコード**（Googleフォームのトリガー用と、権限取得用の使い捨て関数）。
> 実際にフォームから呼ばれているのは `doPost(e)` だけなので、混同しないこと。

---

## 2. doPost の処理の流れ

`tokumasu_contact.js` が `fetch(URL, {method:'POST', body: JSON.stringify(payload)})` で送るJSONを
GASの `doPost(e)` が `e.postData.contents` から受け取り、次の順で処理する。

1. `token` がフォーム側と一致するか確認（不一致なら `{ok:false}` を返して終了）
2. ハニーポット欄（`honey`）に値が入っていたら、何もせず `{ok:true}` を返して黙って捨てる（ボット対策）
3. **重複送信ガード**（3.で詳述）
4. 必須項目チェック（`name`, `inquiry`, `email`, `phone`, `country`, `address1`, `address2`）
5. メールアドレスの簡易形式チェック
6. 添付画像を受け取ってGAS側のBlobに変換（最大3枚、1枚あたり6MB超はスキップ）
7. **店舗あて通知メール**を送信（`MailApp.sendEmail`、`NOTIFY_TO` 宛）
8. **お客様あて返信下書き**を作成（`GmailApp.createDraft`、店主が中身を書き足して手動送信する用。自動送信はされない）
9. `SEND_AUTO_REPLY` が `true` のときだけ、**お客様あて自動返信メール**を送信（日英で本文を切替）
10. `{ok:true}` を返す（この時点でメール送信等がすべて成功していることを意味する。フロントJSはこれを見て「送信完了」画面に進む）

### 店舗あて通知メール
- 宛先：`NOTIFY_TO`（`tokumasullc+hp@gmail.com`。実体は `tokumasullc@gmail.com` の +エイリアスで、振り分け用）
- 言語：**常に日本語**（フォームがどちらの言語ページから送られても日本語）
- 添付：お客様が添付した画像を実ファイルとしてそのまま添付する
- 返信先（`replyTo`）：お客様のメールアドレス。このメールに直接「返信」すればお客様に届く

### お客様あて返信下書き
- `GmailApp.createDraft()` で下書きフォルダに自動生成されるだけ。**自動送信はしない**
- 店主がこの下書きを開いて本文を書き足し、手動で送信する運用
- 件名・本文は日英で切り替わる（`isEn` 判定）

### お客様あて自動返信メール（日英）
- `SEND_AUTO_REPLY = true` のときだけ送信（止めたい場合はこの定数を `false` にする）
- 日本語件名：`【徳増茶道具専門店】お問い合わせを受け付けました`
- 英語件名：`[Tokumasu Tea Ceremony Utensils] We have received your inquiry`
- 本文の構成：宛名 → お礼・案内文 → お問い合わせ内容の引用（`----...----` で挟む）→ **添付件数の一文（後述）** → 自動送信の注記・署名

---

## 3. 添付件数の一文（2026-09-11 追加）

お問い合わせ内容の引用ブロックの**すぐ下**に、添付画像が1枚以上あるときだけ挿入される。

- 日本語：「添付ファイル◯件を受け付けました。」
- 英語：「We have received ◯ attachments.」（**1件のときだけ**「We have received 1 attachment.」と単数形）
- 添付が0枚のときはこの一文自体が出ない（空文字になるだけ）

実装は `doPost` 内の `const attachCount = atts.length;`（店舗通知メール用に集めた添付Blob配列 `atts` の件数を再利用）と、
自動返信メール本文中の三項演算子（`attachCount > 0 ? ... : ''`）。
**店舗あて通知メールと返信下書きのコードはこの機能追加で一切変更していない。**

---

## 4. 重複送信ガードの仕様（2026-09-11 変更）

`doPost` の冒頭、`CacheService.getScriptCache()` を使って180秒（3分）だけキャッシュするガード。

- **キー**：受信した **リクエスト本文（JSONそのもの）のMD5ハッシュ**（`Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw)`）
- **効果**：完全に同一内容のリクエストが180秒以内に再度来たら、何もせず `{ok:true}` だけ返す（実際にはメール送信も下書き作成もしない）
- **つまり**：二重クリックやネットワーク再送などで**まったく同じ内容**が2回届いた場合だけを無視する。
  お名前・お問い合わせ内容・添付画像などが少しでも違えば、同じメールアドレス・3分以内でも**通常どおり処理される**

### 変更前との違い（重要）
- **旧仕様**（〜バージョン7）：`'sent_' + base64(メールアドレス)` をキーにしていたため、**同じメールアドレスなら内容が違っても** 180秒間ブロックされていた
- **新仕様**（バージョン8〜）：内容そのもののハッシュをキーにしているため、内容が違えば同じメールアドレスでも即座に処理される

### フロント側の抑止と混同しないこと
`tokumasu_contact.js` 側にも**別の仕組み**として、送信成功後に同じブラウザの `localStorage`
（キー：`tokumasu_contact_last_sent`）に送信時刻を記録し、3分以内は「確認画面へ」ボタンを無効化する
UIレベルの抑止がある。これは**ブラウザ単位**で、内容が同じでも違ってもとにかく3分間ボタンを無効化する。
GAS側の重複送信ガード（内容ベース）とは目的も実装も別物なので、片方だけ直して「動かない」と混乱しないこと。

---

## 5. 更新時の注意（必読）

### デプロイの仕方（絶対に守ること）
GASのコードを変更したら、**「新しいデプロイ」は絶対に作らないこと**。
新しいデプロイを作ると別のURLが発行され、フォームJS（`tokumasu_contact.html` / `_en.html`）が
呼んでいる既存のURLと食い違って、**フォームが動かなくなる**。

正しい手順：
1. Apps Script エディタでコードを編集 → 保存（Cmd/Ctrl+S）
2. 右上「デプロイ」→「デプロイを管理」
3. 一覧のデプロイ（ウェブアプリURLが `AKfycbyFJ_CcL_FD5D8H_wQTFCfJxrwEgpmOxRjWWLQmhnpgv1Kl8LCSvAALmZMdyQXgALBX-w` のもの）の「編集」（鉛筆アイコン）をクリック
4. 「バージョン」を「新バージョン」に変更し、説明を一言書く
5. 「デプロイ」をクリック（URL・デプロイIDは変わらないことを確認する）

### デプロイ後に必ずやること
- 実際に `https://tokumasu.co.jp/tokumasu_contact.html` と `_en.html` の両方から、テストで1件ずつ送信して確認する
  （店舗あて通知・返信下書き・自動返信・添付・重複ガードなど、変更した箇所が期待通り動くこと）
- GASのコードを変更したら、**このフォルダの `gas_code_backup.gs.txt` も必ず最新の内容に更新する**
  （新しいバージョン番号・更新日もこのファイルと `contact_form_gas_guide.md` の両方に反映する）

### このフォルダが公開されない理由
このリポジトリは GitHub Pages（独自ドメイン `tokumasu.co.jp`、`main` ブランチのリポジトリ直下を公開）で配信されている。
既存の `docs/` フォルダは実際には `https://tokumasu.co.jp/docs/...` として**外部から普通に閲覧できてしまう**ため、
このフォルダは GitHub Pages のビルド（Jekyll）が既定で無視する **`.` で始まるフォルダ名（`.internal/`）** にしてある。
新しく社外秘のメモ・控えを追加するときも、`docs/` ではなくこの `.internal/` 配下に置くこと。

---

## 6. 関連ファイル早見表

| 用途 | パス |
|---|---|
| フォーム（日本語） | `tokumasu_contact.html` |
| フォーム（英語） | `tokumasu_contact_en.html` |
| 共通JS | `tokumasu_contact.js` |
| 共通CSS | `tokumasu_contact.css` |
| この説明書 | `.internal/contact_form_gas_guide.md` |
| GASコード控え | `.internal/gas_code_backup.gs.txt` |
| GAS本体（編集はここで行う） | Apps Script エディタ（プロジェクト名「徳増HP_お問い合わせ自動化」） |
