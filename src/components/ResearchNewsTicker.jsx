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

export default function ResearchNewsTicker({ items }) {
  if (!items || items.length === 0) {
    return (
      <div className="news-ticker-wrapper news-ticker-empty">
        <span>No ticker news available. Click Refresh to fetch latest market data.</span>
      </div>
    );
  }

  const displayItems = items.slice(0, 30);

  return (
    <div className="news-ticker-wrapper">
      <div className="news-ticker-track">
        {[...displayItems, ...displayItems].map((item, idx) => (
          <div key={idx} className="news-ticker-item">
            <span className="ticker-badge">{item.ticker}</span>
            <span className="ticker-headline">{item.headline}</span>
            <span
              className="sentiment-pill"
              style={{ color: getSentimentColor(item.sentiment), background: getSentimentBg(item.sentiment) }}
            >
              {item.impact || item.sentiment}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
