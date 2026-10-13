# 試合結果・速報

公開中のGoogleスプレッドシートCSVを読み込み、個人戦・団体戦のスコアを表示する静的サイトです。GitHub Pagesとブラウザーの`fetch`だけを使用し、GASや閲覧者のGoogleログインは必要ありません。

## 公開CSVの設定

1. Googleスプレッドシートで、試合データのシートを **ファイル > 共有 > ウェブに公開** からCSV形式で公開します。
2. 発行されたCSV URLをコピーし、リポジトリの[`config.js`](./config.js)の`csvUrl`に設定します。

   ```js
   window.LIVESCORE_CONFIG = {
     csvUrl: "https://docs.google.com/spreadsheets/d/e/.../pub?output=csv",
   };
   ```

3. 変更を`main`ブランチにpushします。公開URLやスプレッドシートURLなどのシークレットはこの設定に含めないでください。公開CSVのデータは誰でも閲覧できます。

CSVの1行目には列名を設定してください。サイトは`matchId`、`teamMatchId`、`matchNumber`、`date`、`category`、`round`、`court`、`homeTeam`、`awayTeam`、`tieOrder`、`homePlayer`、`awayPlayer`、`homeClub`、`awayClub`、`homeScore1`〜`homeScore3`、`awayScore1`〜`awayScore3`、`status`を利用します。個人戦では`teamMatchId`を空欄にし、団体戦では同じ対戦の各試合に共通の`teamMatchId`を設定してください。ステータスには`進行中`または`終了`を指定できます。

## GitHub Pagesの有効化

1. リポジトリの **Settings > Pages** を開きます。
2. **Build and deployment** のSourceに **GitHub Actions** を選びます。
3. `main`／`master`へのpush、またはActionsタブからの手動実行でデプロイします。

デプロイ後のURLはActionsの **Deploy to GitHub Pages** ワークフローの実行結果に表示されます。変更をpushするたびに自動で再デプロイされます。

## 表示と更新

- ページ表示時にCSVを読み込み、その後10秒ごとに自動更新します。
- 団体戦はチーム単位の勝数を表示し、詳細を開くと各試合のスコアを確認できます。
- 試合データはHTMLとして解釈せずテキスト表示します。
- 公開CSV URLが未設定、または取得に失敗した場合はページ上に状態を表示します。
