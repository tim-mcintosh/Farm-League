(() => {
  const bestScoreElements = document.querySelectorAll("[data-best-score]");

  for (const element of bestScoreElements) {
    let score = 0;

    try {
      const scoreKeys = [
        element.dataset.bestScore,
        element.dataset.legacyBestScore,
      ].filter(Boolean);

      for (const key of scoreKeys) {
        const storedScore = Number(localStorage.getItem(key));
        if (Number.isFinite(storedScore) && storedScore >= 0) {
          score = Math.max(score, Math.floor(storedScore));
        }
      }
    } catch {
      // The homepage remains usable when storage is blocked or unavailable.
    }

    element.textContent = `🏆 Best: ${score.toLocaleString()}`;
  }
})();
