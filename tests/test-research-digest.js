import 'dotenv/config';

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'RVSXZXCE3Q5YS6MQ';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
const ALPHA_VANTAGE_ARTICLE_LIMIT = process.env.ALPHA_VANTAGE_ARTICLE_LIMIT || '10';
const N8N_RESEARCH_DIGEST_PROCESS_URL = process.env.N8N_RESEARCH_DIGEST_PROCESS_URL || 'http://localhost:5678/webhook/1b98a77b-fb76-4603-b879-01ee748fb5f3';

async function testAlphaVantageAPI() {
  console.log('\n=== TEST 1: Alpha Vantage NEWS_SENTIMENT API ===\n');

  const url = `${ALPHA_VANTAGE_BASE_URL}?function=NEWS_SENTIMENT&topics=financial_markets&sort=LATEST&limit=${ALPHA_VANTAGE_ARTICLE_LIMIT}&apikey=${ALPHA_VANTAGE_API_KEY}`;
  console.log(`Calling: ${url.replace(ALPHA_VANTAGE_API_KEY, '***')}`);

  try {
    const res = await fetch(url);
    console.log(`HTTP Status: ${res.status}`);

    if (!res.ok) {
      console.error(`FAIL: HTTP ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json();

    if (data.Note || data.Information) {
      console.warn(`RATE LIMITED: ${data.Note || data.Information}`);
      return null;
    }

    if (!data.feed || data.feed.length === 0) {
      console.error('FAIL: No feed data returned');
      return null;
    }

    console.log(`PASS: Received ${data.feed.length} articles`);
    console.log(`Sentiment definition: ${data.sentiment_score_definition}`);
    console.log(`\nSample article:`);
    const sample = data.feed[0];
    console.log(`  Title: ${sample.title}`);
    console.log(`  Source: ${sample.source}`);
    console.log(`  Published: ${sample.time_published}`);
    console.log(`  Sentiment: ${sample.overall_sentiment_label} (${sample.overall_sentiment_score})`);
    console.log(`  Tickers: ${sample.ticker_sentiment?.map(t => t.ticker).join(', ') || 'none'}`);
    console.log(`  Topics: ${sample.topics?.map(t => t.topic).join(', ') || 'none'}`);

    return data;
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    return null;
  }
}

async function testN8NWebhook(alphaVantageData) {
  console.log('\n=== TEST 2: N8N Research Digest Webhook ===\n');

  const feed = alphaVantageData?.feed || [];
  if (feed.length === 0) {
    console.warn('SKIP: No Alpha Vantage data to send (using mock data)');
    // Use minimal mock for testing connectivity
    feed.push({
      title: 'Test Article',
      time_published: '20260817T100000',
      overall_sentiment_score: -0.2,
      overall_sentiment_label: 'Somewhat-Bearish',
      topics: [{ topic: 'financial_markets', relevance_score: '0.9' }],
      ticker_sentiment: [{ ticker: 'TEST', relevance_score: '1.0', ticker_sentiment_score: '-0.2', ticker_sentiment_label: 'Somewhat-Bearish' }]
    });
  }

  const sessionId = `digest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payload = {
    sessionId,
    feed_text: JSON.stringify(feed),
    feed_article_count: feed.length,
    holdings_context: [],
    request_type: 'process_digest'
  };

  console.log(`Calling: ${N8N_RESEARCH_DIGEST_PROCESS_URL}`);
  console.log(`Payload: ${feed.length} articles in feed`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const res = await fetch(N8N_RESEARCH_DIGEST_PROCESS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    console.log(`HTTP Status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`FAIL: HTTP ${res.status} — ${text.slice(0, 200)}`);
      return null;
    }

    const n8nRaw = await res.json();
    const n8nData = Array.isArray(n8nRaw)
      ? (n8nRaw[0]?.output || n8nRaw[0] || n8nRaw)
      : (n8nRaw.output || n8nRaw);

    console.log(`PASS: N8N responded successfully`);
    console.log(`\nResponse structure:`);
    console.log(`  research_digest: ${n8nData.research_digest ? 'present' : 'MISSING'}`);
    console.log(`  holdings_news_ticker: ${Array.isArray(n8nData.holdings_news_ticker) ? n8nData.holdings_news_ticker.length + ' items' : 'MISSING'}`);
    console.log(`  market_narratives: ${Array.isArray(n8nData.market_narratives) ? n8nData.market_narratives.length + ' items' : 'MISSING'}`);

    if (n8nData.research_digest) {
      console.log(`\n  Digest summary:`);
      console.log(`    Market sentiment: ${n8nData.research_digest.market_sentiment}`);
      console.log(`    Articles processed: ${n8nData.research_digest.generated_from_articles}`);
      console.log(`    Dominant theme: ${n8nData.research_digest.dominant_theme}`);
    }

    return n8nData;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('FAIL: N8N webhook timed out (30s)');
    } else if (err.cause?.code === 'ECONNREFUSED') {
      console.error('FAIL: N8N is not running (connection refused)');
    } else {
      console.error(`FAIL: ${err.message}`);
    }
    return null;
  }
}

async function testLocalFallback(alphaVantageData) {
  console.log('\n=== TEST 3: Local Fallback Processor ===\n');

  try {
    const { processAlphaVantageToDigest } = await import('../server/research-digest-processor.js');

    const feed = alphaVantageData?.feed || [];
    if (feed.length === 0) {
      console.warn('SKIP: No Alpha Vantage data available for fallback test');
      return null;
    }

    const result = processAlphaVantageToDigest(feed);

    console.log(`PASS: Local processor completed`);
    console.log(`\nOutput:`);
    console.log(`  research_digest.market_sentiment: ${result.research_digest.market_sentiment}`);
    console.log(`  research_digest.generated_from_articles: ${result.research_digest.generated_from_articles}`);
    console.log(`  research_digest.bullish: ${result.research_digest.bullish_articles}, neutral: ${result.research_digest.neutral_articles}, bearish: ${result.research_digest.bearish_articles}`);
    console.log(`  research_digest.dominant_theme: ${result.research_digest.dominant_theme}`);
    console.log(`  holdings_news_ticker: ${result.holdings_news_ticker.length} items`);
    console.log(`  market_narratives: ${result.market_narratives.length} themes`);

    if (result.holdings_news_ticker.length > 0) {
      const top = result.holdings_news_ticker[0];
      console.log(`\n  Top ticker item:`);
      console.log(`    ${top.ticker} | ${top.headline.slice(0, 60)}...`);
      console.log(`    Sentiment: ${top.sentiment} (${top.ticker_sentiment_score})`);
      console.log(`    Importance: ${top.importance_score}/10`);
    }

    if (result.market_narratives.length > 0) {
      console.log(`\n  Narratives:`);
      for (const n of result.market_narratives) {
        console.log(`    - ${n.theme} (${n.sentiment}, ${n.supporting_articles} articles, tickers: ${n.supporting_tickers.slice(0, 4).join(', ')})`);
      }
    }

    return result;
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    return null;
  }
}

// Run all tests
async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   Research Digest Agent — Integration Tests      ║');
  console.log('╚═══════════════════════════════════════════════════╝');

  const avData = await testAlphaVantageAPI();
  const n8nResult = await testN8NWebhook(avData);
  const fallbackResult = await testLocalFallback(avData);

  console.log('\n=== SUMMARY ===');
  console.log(`  Alpha Vantage API: ${avData ? 'PASS' : 'FAIL/RATE-LIMITED'}`);
  console.log(`  N8N Webhook:       ${n8nResult ? 'PASS' : 'FAIL/OFFLINE'}`);
  console.log(`  Local Fallback:    ${fallbackResult ? 'PASS' : 'FAIL/NO-DATA'}`);
  console.log('');
}

runAllTests();
