(() => {
  "use strict";

  const tournamentList = document.getElementById("tournament-list");
  const portalMessage = document.getElementById("portal-message");
  const config = window.LIVESCORE_PORTAL_CONFIG;

  function showError(message) {
    console.error(message);
    tournamentList.replaceChildren();
    portalMessage.textContent = message;
    portalMessage.className = "mt-4 text-sm text-red-700";
  }

  if (!config || !Array.isArray(config.tournaments)) {
    showError("大会一覧の設定を読み込めません。config.js を確認してください。");
    return;
  }

  const ids = new Set();
  for (const tournament of config.tournaments) {
    if (
      !tournament
      || typeof tournament.id !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tournament.id)
      || typeof tournament.name !== "string"
      || !tournament.name.trim()
      || typeof tournament.visible !== "boolean"
      || ids.has(tournament.id)
    ) {
      showError("大会一覧の設定に不正な項目があります。config.js を確認してください。");
      return;
    }
    ids.add(tournament.id);
  }

  const visibleTournaments = config.tournaments.filter((tournament) => tournament.visible);
  if (visibleTournaments.length === 0) {
    tournamentList.replaceChildren();
    portalMessage.textContent = "現在、公開中の大会はありません。";
    return;
  }

  const cards = visibleTournaments.map((tournament) => {
    const link = document.createElement("a");
    link.className =
      "rounded-xl border border-slate-200 bg-white p-5 text-lg font-bold text-slate-800 shadow-sm transition hover:border-blue-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500";
    link.href = `./tournaments/${tournament.id}/`;
    link.textContent = tournament.name.trim();
    return link;
  });
  tournamentList.replaceChildren(...cards);
  portalMessage.textContent = "";
})();
