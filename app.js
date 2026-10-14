(() => {
  "use strict";

  const REFRESH_INTERVAL = 10_000;
  const config = window.LIVESCORE_CONFIG;
  const matchContainer = document.getElementById("match-container");
  const siteTitle = document.getElementById("site-title");
  const lastUpdated = document.getElementById("last-updated");
  const connectionMessage = document.getElementById("connection-message");
  const statusDot = document.getElementById("status-dot");
  let refreshInProgress = false;
  let hasLoadedData = false;

  if (config && typeof config.tournamentName === "string" && config.tournamentName.trim()) {
    const title = config.tournamentName.trim();
    siteTitle.textContent = title;
    document.title = `${title} | 試合結果・速報`;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let value = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      const nextCharacter = text[index + 1];

      if (insideQuotes) {
        if (character === '"' && nextCharacter === '"') {
          value += '"';
          index += 1;
        } else if (character === '"') {
          insideQuotes = false;
        } else {
          value += character;
        }
      } else if (character === '"' && value.length === 0) {
        insideQuotes = true;
      } else if (character === ",") {
        row.push(value.trim());
        value = "";
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && nextCharacter === "\n") {
          index += 1;
        }
        row.push(value.trim());
        rows.push(row);
        row = [];
        value = "";
      } else {
        value += character;
      }
    }

    if (insideQuotes) {
      throw new Error("CSVの引用符が閉じられていません。");
    }
    if (value.length > 0 || row.length > 0) {
      row.push(value.trim());
      rows.push(row);
    }

    return rows;
  }

  function readMatches(csvText) {
    const rows = parseCSV(csvText.replace(/^\uFEFF/, ""));
    if (rows.length === 0 || rows[0].every((header) => header === "")) {
      throw new Error("CSVにヘッダー行がありません。");
    }

    const headers = rows[0];
    if (headers.some((header) => header === "")) {
      throw new Error("CSVのヘッダーに空の列名があります。");
    }
    if (new Set(headers).size !== headers.length) {
      throw new Error("CSVのヘッダーに重複した列名があります。");
    }

    return rows.slice(1).reduce((matches, row) => {
      if (row.every((cell) => cell === "")) {
        return matches;
      }
      const match = {};
      headers.forEach((header, index) => {
        match[header] = row[index] || "";
      });
      matches.push(match);
      return matches;
    }, []);
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function appendBadge(parent, text, className) {
    parent.append(element("span", className, text));
  }

  function getScore(match, side, game) {
    return (match[`${side}Score${game}`] || "").trim();
  }

  function getGameWins(match) {
    let home = 0;
    let away = 0;
    let hasScore = false;

    for (let game = 1; game <= 3; game += 1) {
      const homeScore = getScore(match, "home", game);
      const awayScore = getScore(match, "away", game);
      if (homeScore === "" || awayScore === "") {
        continue;
      }

      hasScore = true;
      const homeValue = Number.parseInt(homeScore, 10);
      const awayValue = Number.parseInt(awayScore, 10);
      if (!Number.isFinite(homeValue) || !Number.isFinite(awayValue)) {
        continue;
      }
      if (homeValue > awayValue) {
        home += 1;
      } else if (awayValue > homeValue) {
        away += 1;
      }
    }

    return { home, away, hasScore };
  }

  function makeStatusBadge(status) {
    const badge = element(
      "span",
      "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
    );
    if (status === "進行中") {
      badge.classList.add("border-red-200", "bg-red-50", "text-red-600");
      const pulse = element("span", "h-1.5 w-1.5 animate-ping rounded-full bg-red-500");
      pulse.setAttribute("aria-hidden", "true");
      badge.append(pulse, document.createTextNode("試合中"));
    } else if (status === "終了") {
      badge.classList.add("border-slate-200", "bg-slate-100", "text-slate-600");
      badge.textContent = "終了";
    }
    return badge;
  }

  function makeMatchHeader(match, showStatus = true) {
    const header = element(
      "div",
      "mb-2 flex items-center justify-between gap-2 border-b border-slate-50 pb-1 text-xs",
    );
    const labels = element("div", "flex flex-wrap items-center gap-2");
    const category = match.category || "";
    const number = (match.matchNumber || "").trim();
    const order = match.tieOrder ? `【${match.tieOrder}】` : "";
    const matchLabel = category && number
      ? `${order} ${category}-${number}`
      : `${order} ${category || number}`;

    if (matchLabel.trim()) {
      appendBadge(labels, matchLabel.trim(), "text-xs font-bold text-slate-900 sm:text-sm");
    }
    if (match.round) {
      const roundBadge = element(
        "span",
        "rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600",
        match.round,
      );
      roundBadge.title = `ラウンド: ${match.round}`;
      labels.append(roundBadge);
    }
    const court = (match.court || "").trim();
    const courtBadge = element(
      "span",
      "rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600",
      court ? (court.endsWith("コート") ? court : `${court}コート`) : "未定",
    );
    if (court) {
      courtBadge.title = `コート: ${court}`;
    }
    labels.append(courtBadge);
    header.append(labels);
    if (showStatus) {
      header.append(makeStatusBadge(match.status));
    }
    return header;
  }

  function makeMatchCard(match, isTeamMatch = false) {
    const card = element("article", "rounded-lg border border-slate-100 bg-white p-3 shadow-sm");
    if (isTeamMatch) {
      const header = element(
        "div",
        "mb-2 flex items-center justify-between gap-2 border-b border-slate-50 pb-1 text-xs",
      );
      const labels = element("div", "flex flex-wrap items-center gap-2");
      const order = (match.tieOrder || "").trim();
      if (order) {
        const orderBadge = element(
          "span",
          "rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700",
          order,
        );
        orderBadge.title = `団体戦のオーダー: ${order}`;
        labels.append(orderBadge);
      }
      header.append(labels);
      card.append(header);
    } else {
      card.append(makeMatchHeader(match));
    }

    const { home, away, hasScore } = getGameWins(match);
    const finished = hasScore && (isTeamMatch || match.status === "終了");
    const content = element("div", "grid grid-cols-12 items-center gap-1 py-1 sm:gap-2");
    const homeSide = element("div", "col-span-4 min-w-0 pr-1 text-left");
    const homeName = element("div", "flex flex-wrap items-center justify-start");
    homeName.append(
      element(
        "span",
        `text-xs sm:text-sm ${finished && home > away ? "font-bold text-slate-900" : "text-slate-700"}`,
        match.homePlayer || "未定",
      ),
    );
    homeSide.append(homeName);
    if (match.homeClub) {
      homeSide.append(element("div", "mt-0.5 truncate text-xs text-slate-400", match.homeClub));
    }

    const scoreArea = element("div", "col-span-4 flex items-center justify-center gap-1 sm:gap-2");
    const winsClass = "min-w-[26px] rounded-lg border px-2 py-1 text-center text-sm shadow-sm sm:text-base";
    const homeWinsClass = hasScore
      ? `${winsClass} border-slate-200 bg-slate-100 text-slate-800 ${home > away ? "font-bold" : "font-normal"}`
      : `${winsClass} border-slate-100 bg-slate-50 font-bold text-slate-300`;
    const awayWinsClass = hasScore
      ? `${winsClass} border-slate-200 bg-slate-100 text-slate-800 ${away > home ? "font-bold" : "font-normal"}`
      : `${winsClass} border-slate-100 bg-slate-50 font-bold text-slate-300`;
    scoreArea.append(element("span", homeWinsClass, hasScore ? String(home) : "-"));
    const scoreList = element(
      "div",
      "flex-1 rounded-lg border border-slate-100 bg-slate-50 py-1 text-center shadow-inner",
    );
    const hasAnyGameScore = [1, 2, 3].some(
      (game) => getScore(match, "home", game) !== "" || getScore(match, "away", game) !== "",
    );
    if (hasAnyGameScore) {
      for (let game = 1; game <= 3; game += 1) {
        const homeScore = getScore(match, "home", game);
        const awayScore = getScore(match, "away", game);
        if (game > 1 && homeScore === "" && awayScore === "") {
          continue;
        }
        const isLastGame = ![game + 1, game + 2].some(
          (nextGame) => nextGame <= 3
            && (getScore(match, "home", nextGame) !== "" || getScore(match, "away", nextGame) !== ""),
        );
        scoreList.append(
          element(
            "div",
            `px-2 py-0.5 text-center text-xs font-bold text-slate-800 ${isLastGame ? "" : "border-b border-slate-100"}`,
            `${homeScore || "-"} - ${awayScore || "-"}`,
          ),
        );
      }
    } else {
      scoreList.append(element("div", "py-1 text-center text-xs text-slate-400", "-"));
    }
    scoreArea.append(scoreList, element("span", awayWinsClass, hasScore ? String(away) : "-"));

    const awaySide = element("div", "col-span-4 min-w-0 pl-1 text-right");
    const awayName = element("div", "flex flex-wrap items-center justify-end");
    awayName.append(
      element(
        "span",
        `text-xs sm:text-sm ${finished && away > home ? "font-bold text-slate-900" : "text-slate-700"}`,
        match.awayPlayer || "未定",
      ),
    );
    awaySide.append(awayName);
    if (match.awayClub) {
      awaySide.append(element("div", "mt-0.5 truncate text-xs text-slate-400", match.awayClub));
    }

    content.append(homeSide, scoreArea, awaySide);
    card.append(content);
    return card;
  }

  function makeTeamCard(group, expandedTeamIds) {
    const card = element("article", "rounded-xl border border-slate-100 bg-white shadow-sm");
    const summary = group.matches.reduce(
      (result, match) => {
        const wins = getGameWins(match);
        if (wins.hasScore && wins.home > wins.away) {
          result.home += 1;
        } else if (wins.hasScore && wins.away > wins.home) {
          result.away += 1;
        }
        return result;
      },
      { home: 0, away: 0 },
    );
    const isExpanded = expandedTeamIds.has(group.id);
    const summaryButton = element(
      "button",
      "w-full rounded-xl p-4 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500",
    );
    summaryButton.type = "button";
    summaryButton.setAttribute("aria-expanded", String(isExpanded));
    summaryButton.setAttribute(
      "aria-label",
      isExpanded ? "対戦スコアの詳細を閉じる" : `対戦スコアの詳細を表示 (${group.matches.length}試合)`,
    );
    const detailsId = `team-details-${group.id}`;
    summaryButton.setAttribute("aria-controls", detailsId);
    summaryButton.append(makeMatchHeader(group, false));
    const homeWon = summary.home > summary.away;
    const awayWon = summary.away > summary.home;
    const teams = element("div", "grid grid-cols-12 items-center gap-1 py-2 sm:gap-2");
    const homeTeam = element("div", "col-span-5 flex min-w-0 items-center gap-1 text-left");
    homeTeam.append(
      element(
        "span",
        `text-sm ${homeWon ? "font-bold text-slate-900" : "text-slate-700"}`,
        group.homeTeam || "ホームチーム",
      ),
    );
    const teamScore = element("div", "col-span-2 flex items-center justify-center gap-1");
    const teamScoreClass =
      "min-w-[28px] rounded-lg border border-slate-200 bg-slate-100 px-2 py-1 text-center text-sm text-slate-800";
    teamScore.append(
      element("span", `${teamScoreClass} ${homeWon ? "font-bold" : "font-normal"}`, String(summary.home)),
      element("span", "text-xs text-slate-400", "-"),
      element("span", `${teamScoreClass} ${awayWon ? "font-bold" : "font-normal"}`, String(summary.away)),
    );
    const awayTeam = element("div", "col-span-5 flex min-w-0 items-center justify-end gap-1 text-right");
    awayTeam.append(
      element(
        "span",
        `text-sm ${awayWon ? "font-bold text-slate-900" : "text-slate-700"}`,
        group.awayTeam || "アウェイチーム",
      ),
    );
    teams.append(homeTeam, teamScore, awayTeam);
    const affordance = element(
      "span",
      "mt-3 flex items-center justify-center gap-1 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500",
      isExpanded ? "▲" : "▼",
    );
    summaryButton.append(teams, affordance);

    const details = element(
      "div",
      `space-y-2 border-t border-dashed border-slate-200 px-4 pb-4 pt-3${isExpanded ? "" : " hidden"}`,
    );
    details.id = detailsId;
    group.matches.forEach((match) => details.append(makeMatchCard(match, true)));
    summaryButton.addEventListener("click", () => {
      const nowExpanded = details.classList.toggle("hidden") === false;
      summaryButton.setAttribute("aria-expanded", String(nowExpanded));
      summaryButton.setAttribute(
        "aria-label",
        nowExpanded ? "対戦スコアの詳細を閉じる" : `対戦スコアの詳細を表示 (${group.matches.length}試合)`,
      );
      affordance.textContent = nowExpanded ? "▲" : "▼";
      if (nowExpanded) {
        expandedTeamIds.add(group.id);
      } else {
        expandedTeamIds.delete(group.id);
      }
    });
    card.append(summaryButton, details);
    return card;
  }

  function renderMatches(matches) {
    const expandedTeamIds = new Set(
      Array.from(matchContainer.querySelectorAll("[data-team-id]"))
        .filter((card) => !card.querySelector(".hidden"))
        .map((card) => card.dataset.teamId),
    );
    const items = [];
    const groups = new Map();

    matches.forEach((match) => {
      const teamMatchId = (match.teamMatchId || "").trim();
      if (!teamMatchId) {
        items.push({ type: "match", match });
        return;
      }
      if (!groups.has(teamMatchId)) {
        const group = {
          id: teamMatchId,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          category: match.category,
          matchNumber: match.matchNumber,
          round: match.round,
          court: match.court,
          matches: [],
        };
        groups.set(teamMatchId, group);
        items.push({ type: "team", group });
      }
      groups.get(teamMatchId).matches.push(match);
    });

    const fragment = document.createDocumentFragment();
    if (items.length === 0) {
      fragment.append(
        element(
          "div",
          "rounded-xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-400 shadow-sm",
          "現在、予定されている試合データはありません。",
        ),
      );
    } else {
      items.forEach((item) => {
        if (item.type === "match") {
          fragment.append(makeMatchCard(item.match));
        } else {
          const card = makeTeamCard(item.group, expandedTeamIds);
          card.dataset.teamId = item.group.id;
          fragment.append(card);
        }
      });
    }
    matchContainer.replaceChildren(fragment);
  }

  function setConnectionState(state, message) {
    connectionMessage.textContent = message;
    statusDot.className = state === "connected"
      ? "inline-block h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"
      : "inline-block h-2.5 w-2.5 rounded-full bg-amber-400";
  }

  async function fetchMatchData() {
    if (refreshInProgress) {
      return;
    }
    if (!config || !config.csvUrl || !config.csvUrl.trim()) {
      setConnectionState("waiting", "公開CSVのURLを config.js に設定してください。");
      lastUpdated.textContent = "未設定";
      if (!hasLoadedData) {
        matchContainer.replaceChildren(
          element(
            "div",
            "rounded-xl border border-slate-100 bg-white p-6 text-center text-sm text-slate-500 shadow-sm",
            "試合データの公開CSV URLが設定されていません。",
          ),
        );
      }
      return;
    }

    refreshInProgress = true;
    try {
      const response = await fetch(config.csvUrl.trim(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`CSVの取得に失敗しました (HTTP ${response.status})`);
      }
      const matches = readMatches(await response.text());
      renderMatches(matches);
      hasLoadedData = true;
      lastUpdated.textContent = `最終更新: ${new Intl.DateTimeFormat("ja-JP", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date())}`;
      setConnectionState("connected", "");
    } catch (error) {
      console.error("試合データの取得に失敗しました:", error);
      setConnectionState("waiting", error.message || "試合データを取得できません。");
      lastUpdated.textContent = hasLoadedData ? lastUpdated.textContent : "接続待機中";
      if (!hasLoadedData) {
        matchContainer.replaceChildren(
          element(
            "div",
            "rounded-xl border border-amber-100 bg-white p-6 text-center text-sm text-slate-500 shadow-sm",
            "試合データに接続できません。時間をおいて再読み込みしてください。",
          ),
        );
      }
    } finally {
      refreshInProgress = false;
    }
  }

  fetchMatchData();
  window.setInterval(fetchMatchData, REFRESH_INTERVAL);
})();
