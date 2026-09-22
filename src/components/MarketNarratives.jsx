import React from 'react';

function getSentimentColor(sentiment) {
  if (!sentiment) return 'var(--ink-muted)';
  const s = sentiment.toLowerCase();
  if (s.includes('bullish')) return 'var(--success)';
  if (s.includes('bearish')) return 'var(--critical)';
  return 'var(--caution)';
}

function getSentimentBg(sentiment) {
  if (!sentiment) return 'var(--surface-alt)';
  const s = sentiment.toLowerCase();
  if (s.includes('bullish')) return 'var(--success-light)';
  if (s.includes('bearish')) return 'var(--critical-light)';
  return 'var(--caution-light)';
}

function ImportanceIndicator({ score }) {
  const filled = Math.min(5, Math.max(1, Math.round(score / 2)));
  return (
    <span className="importance-indicator" title={`Importance: ${score}/10`}>
      {'★'.repeat(filled)}{'☆'.repeat(5 - filled)}
    </span>
  );
}

export default function MarketNarratives({ narratives, onCardClick }) {
  if (!narratives || narratives.length === 0) {
    return (
      <div className="market-narrative-grid">
        <div className="narrative-card narrative-empty">
          <p>No market narratives available. Click Refresh to generate insights.</p>
        </div>
      </div>
    );
  }

  const handleClick = (narrative) => {
    if (!onCardClick) return;
    const tickers = narrative.supporting_tickers?.join(', ') || '';
    const message = `Analyze the "${narrative.theme}" narrative against our advisory book holdings. Sentiment: ${narrative.sentiment}. Key tickers: ${tickers}. Summary: ${narrative.summary} — Are any of these tickers in our client portfolios? What actions should I consider? Can you suggest any talking points with the client?`;
    onCardClick(message);
  };

  return (
    <div className="market-narrative-grid">
      {narratives.map((narrative, idx) => (
        <div
          key={idx}
          className="narrative-card narrative-clickable"
          onClick={() => handleClick(narrative)}
          title="Click to analyze against your holdings"
        >
          <div className="narrative-header">
            <h4 className="narrative-theme">{narrative.theme}</h4>
            <ImportanceIndicator score={narrative.importance_score} />
          </div>

          <span
            className="sentiment-pill"
            style={{ color: getSentimentColor(narrative.sentiment), background: getSentimentBg(narrative.sentiment) }}
          >
            {narrative.sentiment}
          </span>

          <p className="narrative-summary">{narrative.summary}</p>

          {narrative.supporting_tickers && narrative.supporting_tickers.length > 0 && (
            <div className="narrative-tickers">
              {narrative.supporting_tickers.map((ticker, tIdx) => (
                <span key={tIdx} className="ticker-pill">{ticker}</span>
              ))}
            </div>
          )}

          <div className="narrative-footer">
            <span className="narrative-footnote">
              Based on {narrative.supporting_articles} article{narrative.supporting_articles !== 1 ? 's' : ''}
            </span>
            <span className="narrative-cta">Ask Copilot</span>
          </div>
        </div>
      ))}
    </div>
  );
}
