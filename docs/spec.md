# GitHub Pages + 公開CSV方式 試合速報サイト仕様書

本仕様書は、GoogleサイトやGAS（Google Apps Script）ウェブアプリで発生する「Googleログイン必須化」および「サードパーティCookie/トラッキング防止によるネットワークエラー」の壁を完全に回避し、「誰でも・ログイン不要・無料・スマホ対応」で安定稼働する試合速報システムを構築するための手順とプログラム仕様です。

## 1. システムアーキテクチャの概要

```
[ 管理者 ] ──(手動編集 or B-Opsアプリ)──> [ Googleスプレッドシート (非公開/編集用) ]
                                                      │
                                           (ファイル ＞ ウェブに公開)
                                                      ▼
[ 閲覧者 ] <──(fetchでCSV直読み)── [ 公開CSVエンドポイント ]
   │
   └─> [ GitHub Pages (静的HTML hosting) ] （誰でもログイン不要で閲覧可能）

```

* **データベース**: Googleスプレッドシート（これまで通り管理者が編集）。
* **データ配信**: スプレッドシートの標準機能「ウェブに公開（CSV形式）」を利用するため、GASのウェブアプリ（`script.google.com`）を経由しません。
* **ホスティング**: GitHub Pages（完全無料、SSL対応、CDN配信のため高速かつ高可用性）。
* **複数大会**: 1つのリポジトリ内に大会別ディレクトリを配置し、各大会に異なるURLと公開CSVを割り当てる。ルートURLは設定ファイルに基づく大会一覧を表示する。

### 大会ごとのサイト分割

大会ページのURLは`https://<ユーザー名>.github.io/<リポジトリ名>/tournaments/<大会ID>/`とする。大会IDは半角英数字とハイフンを使い、重複しない値にする。

大会を追加する際は、`tournaments/<大会ID>/`を作成し、`tournaments/index.template.html`を`index.html`として、`tournaments/config.template.js`を`config.js`としてコピーする。大会別の`config.js`には大会名とその大会の公開CSV URLを設定する。大会ページはルートの`app.js`を共有するため、表示ロジックを大会ごとに複製しない。

ルートの`index.html`は大会一覧を表示する。ルートの`config.js`には各大会の`id`、`name`、`visible`を設定し、`visible: true`の大会だけにリンクを表示する。非表示設定は一覧上のリンクを隠すだけであり、直接URLへのアクセスを制限しない。大会ページの設定と公開CSVは閲覧者に公開されるため、秘密情報を含めない。

## 2. Googleスプレッドシートの準備とCSV公開手順

### Step 1: シートの構成

スプレッドシートの1行目にヘッダー（列名）を配置し、2行目以降に試合データを入力します。個人戦・団体戦のどちらにも対応可能です。

**主要なヘッダー（列名）の例:**

* `matchId`: 試合の一意ID (例: `m1`, `m2`)
* `teamMatchId`: 団体戦の場合のグループID (個人戦は空欄)
* `matchNumber`: 試合番号 (例: `1`, `2`)。団体戦ではチーム対戦ごとに1つの番号を付け、同じ`teamMatchId`の各行で共通にする。
* `date`: 日付
* `category`: 種目 (例: `男子シングルス`, `男子団体`)
* `round`: ラウンド (例: `1回戦`, `準決勝`)
* `court`: コート名 (例: `第1コート`)
* `homeTeam` / `awayTeam`: 団体戦のチーム名
* `tieOrder`: 団体戦のオーダー (例: `S1`, `D1`)
* `homePlayer` / `awayPlayer`: 選手名
* `homeClub` / `awayClub`: 所属
* `homeScore1`〜`3` / `awayScore1`〜`3`: 各ゲームのスコア
* `status`: 個人戦のステータス (`進行中`, `終了`, または空欄)。団体戦では不要。

団体戦は全対戦のスコアを入力し、対戦ごとの`status`は使用しない。画面上ではチーム単位の勝数を親カードに表示し、親カード全体をタップして対戦詳細をアコーディオン表示する。親カードのヘッダーは個人戦カードと同じ形式で、種目・チーム対戦番号・ラウンド・コートを表示し、ラウンドとコートにはツールチップを付ける。対戦番号は選手間の各試合ではなく、チーム同士の対戦につき1つとし、グループ内の全行で同じ`matchNumber`を使う。対戦詳細カードにはオーダーと選手・スコアを表示する。

### Step 2: 「ウェブに公開」の設定

1. スプレッドシートのメニュー **\[ファイル\] > \[共有\] > \[ウェブに公開\]** をクリック。
2. 「リンク」タブで、公開したいシート（タブ）を選択。
3. 形式を **\[カンマ区切り値 (.csv)\]** に設定する。
4. 「公開」をクリックし、生成された **CSVの公開URL** をコピーしておく。

## 3. フロントエンド（`index.html`）の仕様と実装

GitHub Pagesに配置する `index.html` は、静的なHTML + Tailwind CSS + Vanilla JavaScriptで構成し、定期的に公開CSVを `fetch` してパース（解析）し、画面を自動更新します。

### 実装コード（`index.html` サンプル）

```
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
  </style>
</head>
<body class="p-2 sm:p-4">
  <div class="max-w-2xl mx-auto">
    <div class="flex justify-between items-center mb-4 px-2">
      <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
        <span id="status-dot" class="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
        試合結果・速報
      </h2>
      <span id="last-updated" class="text-xs text-slate-400">更新中...</span>
    </div>
    <div id="match-container" class="space-y-3">
      <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-100 animate-pulse flex justify-between items-center">
        <div class="h-10 bg-slate-200 rounded w-1/3"></div>
        <div class="h-8 bg-slate-200 rounded w-1/4"></div>
        <div class="h-10 bg-slate-200 rounded w-1/3"></div>
      </div>
    </div>
  </div>

  <script>
    // 【設定】Googleスプレッドシートの公開CSV URL
    const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT.../pub?output=csv";
    const REFRESH_INTERVAL = 10000; // 10秒ごとに自動更新

    // 簡易CSVパーサー（ダブルクォーテーション対応）
    function parseCSV(text) {
      let lines = [];
      let row = [];
      let insideQuote = false;
      let currentVal = '';

      for (let i = 0; i < text.length; i++) {
        let c = text[i];
        let next = text[i + 1];

        if (c === '"' && insideQuote && next === '"') {
          currentVal += '"';
          i++;
        } else if (c === '"') {
          insideQuote = !insideQuote;
        } else if (c === ',' && !insideQuote) {
          row.push(currentVal.trim());
          currentVal = '';
        } else if ((c === '\r' && next === '\n') || c === '\n' && !insideQuote) {
          if (c === '\r') i++;
          row.push(currentVal.trim());
          lines.push(row);
          row = [];
          currentVal = '';
        } else {
          currentVal += c;
        }
      }
      if (currentVal !== '' || row.length > 0) {
        row.push(currentVal.trim());
        lines.push(row);
      }
      return lines;
    }

    async function fetchMatchData() {
      try {
        const response = await fetch(CSV_URL);
        if (!response.ok) throw new Error("CSV fetch failed");
        const csvText = await response.text();
        const parsedRows = parseCSV(csvText);

        if (parsedRows.length < 2) {
          renderMatches([]);
          return;
        }

        const headers = parsedRows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
        const matches = [];

        for (let i = 1; i < parsedRows.length; i++) {
          const r = parsedRows[i];
          if (r.length === 0 || r.every(val => val === "")) continue;

          let matchObj = {};
          headers.forEach((h, idx) => {
            matchObj[h] = r[idx] !== undefined ? r[idx].replace(/^["']|["']$/g, '').trim() : "";
          });
          matches.push(matchObj);
        }

        renderMatches(matches);
        const now = new Date();
        document.getElementById("last-updated").textContent = 
          `最終更新: ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
        document.getElementById("status-dot").className = "inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse";

      } catch (error) {
        console.error("Fetch error:", error);
        document.getElementById("last-updated").textContent = "接続待機中...";
      }
    }

    function generateMatchCardHtml(match) {
      let statusBadge = '';
      if (match.status === '進行中') {
        statusBadge = `<span class="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> 試合中</span>`;
      } else if (match.status === '終了') {
        statusBadge = `<span class="bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">終了</span>`;
      }

      const h1 = match.homeScore1 || "";
      const h2 = match.homeScore2 || "";
      const h3 = match.homeScore3 || "";
      const a1 = match.awayScore1 || "";
      const a2 = match.awayScore2 || "";
      const a3 = match.awayScore3 || "";

      const hasAnyScore = (h1 !== "" && a1 !== "") || (h2 !== "" && a2 !== "") || (h3 !== "" && a3 !== "");

      let homeGameWins = 0;
      let awayGameWins = 0;
      if (hasAnyScore) {
        if (h1 !== "" && a1 !== "") { if (parseInt(h1) > parseInt(a1)) homeGameWins++; else if (parseInt(a1) > parseInt(h1)) awayGameWins++; }
        if (h2 !== "" && a2 !== "") { if (parseInt(h2) > parseInt(a2)) homeGameWins++; else if (parseInt(a2) > parseInt(h2)) awayGameWins++; }
        if (h3 !== "" && a3 !== "") { if (parseInt(h3) > parseInt(a3)) homeGameWins++; else if (parseInt(a3) > parseInt(h3)) awayGameWins++; }
      }

      const isFinished = match.status === '終了';
      const isHomeWinner = isFinished && hasAnyScore && (homeGameWins > awayGameWins);
      const isAwayWinner = isFinished && hasAnyScore && (awayGameWins > homeGameWins);

      const homePlayerClass = isHomeWinner ? 'font-bold text-slate-900' : 'text-slate-700';
      const awayPlayerClass = isAwayWinner ? 'font-bold text-slate-900' : 'text-slate-700';
      const homeWinnerMark = isHomeWinner ? '<span class="text-xs text-amber-500 font-bold ml-1">★</span>' : '';
      const awayWinnerMark = isAwayWinner ? '<span class="text-xs text-amber-500 font-bold mr-1">★</span>' : '';

      const cat = match.category || '';
      const num = match.matchNumber || '';
      const tieOrder = match.tieOrder ? `【${match.tieOrder}】` : '';
      let catMatchNum = cat && num !== '' ? `${tieOrder} ${cat}-${num}` : (cat ? `${tieOrder} ${cat}` : `${tieOrder} ${num}`);

      const roundBadge = match.round ? `<span class="bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold px-2 py-0.5 rounded-md">${match.round}</span>` : '';
      const courtDisplay = match.court ? (match.court.endsWith('コート') ? match.court : `${match.court}コート`) : '未定';
      const courtBadge = `<span class="bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold px-2 py-0.5 rounded-md">${courtDisplay}</span>`;

      let scoreHtml = '';
      let homeWinDisplay = '';
      let awayWinDisplay = '';

      if (hasAnyScore) {
        homeWinDisplay = `<div class="text-sm sm:text-base font-extrabold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-center min-w-[26px] shadow-sm">${homeGameWins}</div>`;
        awayWinDisplay = `<div class="text-sm sm:text-base font-extrabold text-slate-800 bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 text-center min-w-[26px] shadow-sm">${awayGameWins}</div>`;

        scoreHtml += `<div class="text-center text-xs font-bold text-slate-800 px-2 py-0.5 ${h2 !== "" || h3 !== "" ? 'border-b border-slate-100' : ''}">${h1 !== "" ? h1 : '-'} - ${a1 !== "" ? a1 : '-'}</div>`;
        if (h2 !== "" || a2 !== "") {
          scoreHtml += `<div class="text-center text-xs font-bold text-slate-800 px-2 py-0.5 ${h3 !== "" ? 'border-b border-slate-100' : ''}">${h2 !== "" ? h2 : '-'} - ${a2 !== "" ? a2 : '-'}</div>`;
        }
        if (h3 !== "" || a3 !== "") {
          scoreHtml += `<div class="text-center text-xs font-bold text-slate-800 px-2 py-0.5">${h3 !== "" ? h3 : '-'} - ${a3 !== "" ? a3 : '-'}</div>`;
        }
      } else {
        homeWinDisplay = `<div class="text-sm sm:text-base font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-center min-w-[26px]">-</div>`;
        awayWinDisplay = `<div class="text-sm sm:text-base font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 text-center min-w-[26px]">-</div>`;
        scoreHtml = `<div class="text-center text-xs text-slate-400 py-1">-</div>`;
      }

      return `
        <div class="bg-white p-3 rounded-lg shadow-sm border border-slate-100">
          <div class="flex justify-between items-center mb-2 pb-1 border-b border-slate-50 text-xs">
            <div class="flex items-center gap-2 flex-wrap">
              ${catMatchNum ? `<span class="font-bold text-slate-900 text-xs sm:text-sm">${catMatchNum}</span>` : ''}
              ${roundBadge}
              ${courtBadge}
            </div>
            <div>${statusBadge}</div>
          </div>
          <div class="grid grid-cols-12 items-center gap-1 sm:gap-2 py-1">
            <div class="col-span-4 text-left pr-1">
              <div class="flex items-center justify-start flex-wrap">
                ${homeWinnerMark}
                <div class="text-xs sm:text-sm ${homePlayerClass}">${match.homePlayer || '未定'}</div>
              </div>
              ${match.homeClub ? `<div class="text-xs text-slate-400 mt-0.5 truncate">${match.homeClub}</div>` : ''}
            </div>
            <div class="col-span-4 flex items-center justify-center gap-1 sm:gap-2">
              ${homeWinDisplay}
              <div class="bg-slate-50 py-1 rounded-lg border border-slate-100 text-center shadow-inner flex-1">${scoreHtml}</div>
              ${awayWinDisplay}
            </div>
            <div class="col-span-4 text-right pl-1">
              <div class="flex items-center justify-end flex-wrap">
                <div class="text-xs sm:text-sm ${awayPlayerClass}">${match.awayPlayer || '未定'}</div>
                ${awayWinnerMark}
              </div>
              ${match.awayClub ? `<div class="text-xs text-slate-400 mt-0.5 truncate">${match.awayClub}</div>` : ''}
            </div>
          </div>
        </div>`;
    }

    function renderMatches(matches) {
      const container = document.getElementById("match-container");
      if (!matches || matches.length === 0) {
        container.innerHTML = `<div class="bg-white p-6 rounded-xl text-center text-slate-400 text-sm shadow-sm border border-slate-100">現在、予定されている試合データはありません。</div>`;
        return;
      }

      const hasTeamMatches = matches.some(m => m.teamMatchId && m.teamMatchId.trim() !== "");

      if (hasTeamMatches) {
        const groups = {};
        const groupOrder = [];

        matches.forEach(match => {
          const tId = match.teamMatchId ? match.teamMatchId.trim() : 'fallback';
          if (!groups[tId]) {
            groups[tId] = {
              teamMatchId: tId,
              homeTeam: match.homeTeam || 'ホームチーム',
              awayTeam: match.awayTeam || 'アウェイチーム',
              court: match.court || '',
              round: match.round || '',
              matches: []
            };
            groupOrder.push(tId);
          }
          groups[tId].matches.push(match);
        });

        container.innerHTML = groupOrder.map(tId => {
          const group = groups[tId];
          let homeTeamWins = 0, awayTeamWins = 0, finishedCount = 0;
          const totalTies = group.matches.length;

          group.matches.forEach(m => {
            const h1 = m.homeScore1, h2 = m.homeScore2, h3 = m.homeScore3;
            const a1 = m.awayScore1, a2 = m.awayScore2, a3 = m.awayScore3;
            const hasScore = (h1 && a1) || (h2 && a2) || (h3 && a3);
            if (hasScore) {
              let hW = 0, aW = 0;
              if (h1 && a1) { if (parseInt(h1) > parseInt(a1)) hW++; else if (parseInt(a1) > parseInt(h1)) aW++; }
              if (h2 && a2) { if (parseInt(h2) > parseInt(a2)) hW++; else if (parseInt(a2) > parseInt(h2)) aW++; }
              if (h3 && a3) { if (parseInt(h3) > parseInt(a3)) hW++; else if (parseInt(a3) > parseInt(h3)) aW++; }
              if (hW > aW) homeTeamWins++; else if (aW > hW) awayTeamWins++;
            }
            if (m.status === '終了') finishedCount++;
          });

          const groupStatus = (finishedCount === totalTies && totalTies > 0) ? '終了' : '試合中';
          const statusBadge = groupStatus === '終了' 
            ? `<span class="bg-slate-100 text-slate-600 border border-slate-200 text-xs font-semibold px-2.5 py-0.5 rounded-full">終了</span>`
            : `<span class="bg-red-50 text-red-600 border border-red-200 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping"></span> 試合中 (${finishedCount}/${totalTies}タイ)</span>`;

          const isHomeWinner = groupStatus === '終了' && (homeTeamWins > awayTeamWins);
          const isAwayWinner = groupStatus === '終了' && (awayTeamWins > homeTeamWins);
          const innerHtml = group.matches.map(m => generateMatchCardHtml(m)).join('');

          return `
            <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <div class="flex justify-between items-center mb-3 pb-2 border-b border-slate-50 text-xs">
                <span class="font-bold text-slate-900 text-sm">団体戦</span>
                <div>${statusBadge}</div>
              </div>
              <div class="grid grid-cols-12 items-center gap-1 sm:gap-2 py-2">
                <div class="col-span-5 text-left pr-1">
                  <div class="flex items-center gap-1">
                    ${isHomeWinner ? '<span class="text-xs text-amber-500 font-bold">★</span>' : ''}
                    <div class="text-base font-bold ${isHomeWinner ? 'text-slate-900' : 'text-slate-700'}">${group.homeTeam}</div>
                  </div>
                </div>
                <div class="col-span-2 flex items-center justify-center gap-1">
                  <div class="text-base font-extrabold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-center min-w-[32px]">${homeTeamWins}</div>
                  <span class="text-xs text-slate-400">-</span>
                  <div class="text-base font-extrabold text-slate-800 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200 text-center min-w-[32px]">${awayTeamWins}</div>
                </div>
                <div class="col-span-5 text-right pl-1">
                  <div class="flex items-center justify-end gap-1">
                    <div class="text-base font-bold ${isAwayWinner ? 'text-slate-900' : 'text-slate-700'}">${group.awayTeam}</div>
                    ${isAwayWinner ? '<span class="text-xs text-amber-500 font-bold">★</span>' : ''}
                  </div>
                </div>
              </div>
              <button onclick="toggleAccordion('${tId}')" class="w-full mt-3 pt-2 border-t border-slate-100 text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1">
                <span id="icon-${tId}">▼</span> <span id="text-${tId}">対戦詳細・スコアを表示 (${totalTies}試合)</span>
              </button>
              <div id="accordion-${tId}" class="hidden space-y-2 mt-3 pt-3 border-t border-dashed border-slate-200">
                ${innerHtml}
              </div>
            </div>`;
        }).join('');
      } else {
        container.innerHTML = matches.map(m => generateMatchCardHtml(m)).join('');
      }
    }

    function toggleAccordion(tId) {
      const content = document.getElementById(`accordion-${tId}`);
      const icon = document.getElementById(`icon-${tId}`);
      const text = document.getElementById(`text-${tId}`);
      if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.textContent = '▲';
        text.textContent = '詳細を閉じる';
      } else {
        content.classList.add('hidden');
        icon.textContent = '▼';
        text.textContent = text.textContent.replace('詳細を閉じる', '対戦詳細・スコアを表示');
      }
    }

    fetchMatchData();
    setInterval(fetchMatchData, REFRESH_INTERVAL);
  </script>
</body>
</html>

```

## 4. GitHub Pagesへのデプロイ手順

1. **GitHubアカウントの準備**: 無料のGitHubアカウントを作成（または既存のアカウントを使用）。
2. **リポジトリの作成**: 新規パブリックリポジトリ（例: `tournament-livescore`）を作成。
3. **ファイルのアップロード**: 上記のコードを `index.html` というファイル名で保存し、GitHubのリポジトリ画面からドラッグ＆ドロップでアップロードする。
4. **GitHub Pagesの有効化**:
   * リポジトリの **\[Settings\] > \[Pages\]** を開く。
   * **Build and deployment** の Source を **\[GitHub Actions\]** にする。
5. `main`／`master`へのpush、またはActionsからの手動実行でデプロイする。トップページのURLに加え、大会ごとに`/tournaments/<大会ID>/`のURLで公開される。