const TOPIC_LABELS = {
  earnings: 'Earnings Season & Results',
  financial_markets: 'Financial Markets & Trading',
  technology: 'Tech Sector Movement',
  life_sciences: 'Healthcare & Life Sciences',
  energy_transportation: 'Energy & Transportation',
  economy_macro: 'Macro Economy & Policy',
  mergers_and_acquisitions: 'M&A Activity',
  retail_wholesale: 'Retail & Consumer',
  finance: 'Banking & Finance',
  ipo: 'IPO & New Listings',
  real_estate: 'Real Estate',
  manufacturing: 'Manufacturing & Industry'
};

function getSentimentLabel(score) {
  if (score <= -0.35) return 'Bearish';
  if (score <= -0.15) return 'Somewhat-Bearish';
  if (score < 0.15) return 'Neutral';
  if (score < 0.35) return 'Somewhat-Bullish';
  return 'Bullish';
}

function getImpact(score) {
  if (score < -0.15) return 'Bearish';
  if (score > 0.15) return 'Bullish';
  return 'Neutral';
}

function parseArticleDate(timePublished) {
  if (!timePublished) return null;
  const y = timePublished.slice(0, 4);
  const m = timePublished.slice(4, 6);
  const d = timePublished.slice(6, 8);
  const h = timePublished.slice(9, 11);
  const min = timePublished.slice(11, 13);
  return `${y}-${m}-${d}T${h}:${min}:00Z`;
}

export function processAlphaVantageToDigest(feed) {
  if (!feed || !Array.isArray(feed) || feed.length === 0) {
    return {
      research_digest: {
        market_sentiment: 'Neutral',
        generated_from_articles: 0,
        bullish_articles: 0,
        neutral_articles: 0,
        bearish_articles: 0,
        dominant_theme: '',
        secondary_theme: ''
      },
      holdings_news_ticker: [],
      market_narratives: []
    };
  }

  // --- Holdings News Ticker ---
  const tickerItems = [];
  for (const article of feed) {
    if (!article.ticker_sentiment) continue;
    for (const ts of article.ticker_sentiment) {
      const score = parseFloat(ts.ticker_sentiment_score) || 0;
      const relevance = parseFloat(ts.relevance_score) || 0;
      const importanceRaw = relevance * Math.abs(score) * 10;
      const importance = Math.min(10, Math.max(1, Math.round(importanceRaw * 2)));

      tickerItems.push({
        ticker: ts.ticker,
        headline: article.title,
        impact: getImpact(score),
        sentiment: ts.ticker_sentiment_label || getSentimentLabel(score),
        importance_score: importance,
        source_article_title: article.title,
        source_topic: article.topics?.[0]?.topic || '',
        source_sentiment: article.overall_sentiment_label,
        source_sentiment_score: article.overall_sentiment_score,
        ticker_sentiment_score: score,
        ticker_sentiment_label: ts.ticker_sentiment_label || getSentimentLabel(score),
        article_date: parseArticleDate(article.time_published)
      });
    }
  }

  tickerItems.sort((a, b) => Math.abs(b.ticker_sentiment_score) - Math.abs(a.ticker_sentiment_score));

  // --- Market Narratives ---
  const topicGroups = {};
  for (const article of feed) {
    if (!article.topics || article.topics.length === 0) continue;
    const primaryTopic = article.topics.reduce((best, t) =>
      parseFloat(t.relevance_score) > parseFloat(best.relevance_score) ? t : best
    );
    const topicKey = primaryTopic.topic;
    if (!topicGroups[topicKey]) {
      topicGroups[topicKey] = { articles: [], sentiments: [], tickers: new Set() };
    }
    topicGroups[topicKey].articles.push(article);
    topicGroups[topicKey].sentiments.push(article.overall_sentiment_score);
    if (article.ticker_sentiment) {
      for (const ts of article.ticker_sentiment) {
        topicGroups[topicKey].tickers.add(ts.ticker);
      }
    }
  }

  const narratives = Object.entries(topicGroups)
    .filter(([, group]) => group.articles.length >= 2)
    .map(([topic, group]) => {
      const avgSentiment = group.sentiments.reduce((s, v) => s + v, 0) / group.sentiments.length;
      const importanceRaw = Math.min(10, Math.round((group.articles.length / feed.length) * 20));
      return {
        theme: TOPIC_LABELS[topic] || topic.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        sentiment: getSentimentLabel(avgSentiment),
        importance_score: Math.max(1, importanceRaw),
        supporting_articles: group.articles.length,
        summary: `${group.articles.length} articles covering ${TOPIC_LABELS[topic] || topic}. Average sentiment is ${getSentimentLabel(avgSentiment).toLowerCase()} with a score of ${avgSentiment.toFixed(3)}.`,
        supporting_topics: [topic],
        supporting_tickers: [...group.tickers].slice(0, 8),
        sample_articles: group.articles.slice(0, 2).map(a => a.title),
        average_sentiment_score: parseFloat(avgSentiment.toFixed(4))
      };
    })
    .sort((a, b) => b.supporting_articles - a.supporting_articles)
    .slice(0, 5);

  // --- Research Digest Summary ---
  let bullish = 0, neutral = 0, bearish = 0;
  let totalSentiment = 0;
  for (const article of feed) {
    totalSentiment += article.overall_sentiment_score || 0;
    const s = article.overall_sentiment_score || 0;
    if (s >= 0.15) bullish++;
    else if (s <= -0.15) bearish++;
    else neutral++;
  }
  const avgOverall = totalSentiment / feed.length;

  return {
    research_digest: {
      market_sentiment: getSentimentLabel(avgOverall),
      generated_from_articles: feed.length,
      bullish_articles: bullish,
      neutral_articles: neutral,
      bearish_articles: bearish,
      dominant_theme: narratives[0]?.theme || '',
      secondary_theme: narratives[1]?.theme || ''
    },
    holdings_news_ticker: tickerItems,
    market_narratives: narratives
  };
}
