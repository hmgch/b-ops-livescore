# 試合結果・速報

公開中のGoogleスプレッドシートCSVを読み込み、個人戦・団体戦のスコアを表示する静的サイトです。GitHub Pagesとブラウザーの`fetch`だけを使用し、GASや閲覧者のGoogleログインは必要ありません。

## 大会一覧の表示設定

サイトのルートURLには、大会ページへのリンク一覧を表示します。表示する大会は[`config.js`](./config.js)の`LIVESCORE_PORTAL_CONFIG.tournaments`で設定します。

```js
{
  id: "test-indiv",
  name: "個人戦テスト大会",
  visible: true,
}
```

- `id`: `tournaments/<id>/`のフォルダー名
- `name`: 一覧に表示する大会名
- `visible`: `true`で一覧に表示、`false`でリンクを非表示

リンクの表示設定は認証・アクセス制御ではありません。`visible: false`でも大会ページのURLを直接知っている人は閲覧できます。大会ページ自体を公開したくない場合は、一覧設定ではなく公開方法を変更してください。

## 大会ごとのCSV設定

各大会の試合データは個別のGoogleスプレッドシートCSVで管理します。スプレッドシートで **ファイル > 共有 > ウェブに公開** を選び、対象シートをCSV形式で公開した後、発行されたURLをその大会フォルダー内の`config.js`の`csvUrl`に設定してください。設定ファイルと公開CSVは誰でも閲覧できます。パスワードや非公開のスプレッドシートURLは記載しないでください。

CSVの1行目には列名を設定してください。サイトは`matchId`、`teamMatchId`、`matchNumber`、`date`、`category`、`round`、`court`、`homeTeam`、`awayTeam`、`tieOrder`、`homePlayer`、`awayPlayer`、`homeClub`、`awayClub`、`homeScore1`〜`homeScore3`、`awayScore1`〜`awayScore3`、`status`を利用します。個人戦では`teamMatchId`を空欄にし、団体戦では同じ対戦の各試合に共通の`teamMatchId`を設定してください。ステータスには`進行中`または`終了`を指定できます。

## 大会ごとにサイトを分ける

同じリポジトリ内で大会ごとに異なるURLとCSVを使えます。大会を追加するたびに、次のファイルを作成します。

1. `tournaments` の下にURL用のID（半角英数字とハイフンを推奨）でフォルダーを作成します。例: `tournaments/2026-summer-cup/`
2. [`tournaments/index.template.html`](./tournaments/index.template.html)をそのフォルダーの`index.html`としてコピーします。
3. [`tournaments/config.template.js`](./tournaments/config.template.js)を同じフォルダーの`config.js`としてコピーし、`tournamentName`と`csvUrl`を設定します。
4. 変更を`main`／`master`にpushします。Actionsのデプロイ完了後、`https://<ユーザー名>.github.io/<リポジトリ名>/tournaments/2026-summer-cup/`で公開されます。

大会ページは共通の[`app.js`](./app.js)を読み込むため、表示機能の更新は各大会ページに反映されます。大会データや大会名はそれぞれのフォルダーの`config.js`で独立して管理します。ルートの[`index.html`](./index.html)は大会一覧ページとして使用し、ルートの[`config.js`](./config.js)でリンク表示を管理します。

大会別の`config.js`も公開されるため、パスワードや非公開のスプレッドシートURLは記載しないでください。`csvUrl`には「ウェブに公開」したCSV URLを設定してください。

テスト用として、[個人戦テスト大会](./tournaments/test-indiv/)（`test-indiv`）と[団体戦テスト大会](./tournaments/test-team/)（`test-team`）を用意しています。両大会は初期設定で一覧に表示されます。表示・非表示を切り替える場合はルートの`config.js`にある該当大会の`visible`を変更してください。各大会ページは同じフォルダーの`matches.csv`を読み込みます。公開CSVに切り替える場合は、それぞれの大会フォルダーの`config.js`にある`csvUrl`を変更してください。

## GitHub Pagesの有効化

1. リポジトリの **Settings > Pages** を開きます。
2. **Build and deployment** のSourceに **GitHub Actions** を選びます。
3. `main`／`master`へのpush、またはActionsタブからの手動実行でデプロイします。

デプロイ後のトップページURLはActionsの **Deploy to GitHub Pages** ワークフローの実行結果に表示されます。大会別ページのURLはトップページURLの末尾に`/tournaments/<大会ID>/`を追加したものです。変更をpushするたびに自動で再デプロイされます。

## 表示と更新

- ページ表示時にCSVを読み込み、その後10秒ごとに自動更新します。
- 団体戦はチーム単位の勝数を表示し、詳細を開くと各試合のスコアを確認できます。
- 試合データはHTMLとして解釈せずテキスト表示します。
- 公開CSV URLが未設定、または取得に失敗した場合はページ上に状態を表示します。
