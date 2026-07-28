(() => {
  const bestScoreElements = document.querySelectorAll("[data-best-score]");

  for (const element of bestScoreElements) {
    let score = 0;
    const maximumScore = Number(element.dataset.maximumScore);

    try {
      const scoreKeys = [
        element.dataset.bestScore,
        element.dataset.legacyBestScore,
      ].filter(Boolean);

      for (const key of scoreKeys) {
        const storedScore = Number(localStorage.getItem(key));
        if (Number.isSafeInteger(storedScore)
          && storedScore >= 0
          && Number.isSafeInteger(maximumScore)
          && storedScore <= maximumScore) {
          score = Math.max(score, storedScore);
        }
      }
    } catch {
      // The homepage remains usable when storage is blocked or unavailable.
    }

    element.textContent = `🏆 Best: ${score.toLocaleString()}`;
  }
})();
