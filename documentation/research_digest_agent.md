# Research Digest Agent — Full Implementation Documentation

## Overview

The Research Digest Agent is a feature of the Advisory Agent MVP that provides advisors with real-time financial news insights on their Book Overview dashboard. It fetches market news from Alpha Vantage, processes it through an N8N AI workflow (with local fallback), persists results in SQLite for API conservation, and renders two interactive widgets.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React/Vite)                         │
│                                                                     │
│  Book Overview Tab                                                  │
│  ├── Research Digest Agent Header (sentiment badge, article count)  │
│  ├── Widget 1: ResearchNewsTicker (auto-scrolling marquee)         │
│  └── Widget 2: MarketNarratives (static card grid)                 │
│                                                                     │
│  User Action: [Refresh Digest] button (manual only)                │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                    POST /api/research-digest/refresh
                             │
┌────────────────────────────▼────────────────────────────────────────┐
│                     BACKEND (Express/Node.js)                        │
│                                                                     │
│  Step 1: GET Alpha Vantage NEWS_SENTIMENT API (50 articles)        │
│  Step 2: POST raw feed → N8N Webhook for AI processing             │
│  Step 3: If N8N fails → Local Fallback Processor                   │
│  Step 4: INSERT result into SQLite (research_digest table)         │
│  Step 5: Return MVP Output JSON to frontend                        │
│                                                                     │
│  On page load: GET /api/research-digest → reads SQLite cache       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
┌──────────────────┐ ┌────────────┐ ┌──────────────────┐
│  Alpha Vantage   │ │    N8N     │ │     SQLite       │
│  NEWS_SENTIMENT  │ │  Webhook   │ │ research_digest  │
│  (Free Tier)     │ │  AI Agent  │ │     table        │
└──────────────────┘ └────────────┘ └──────────────────┘
```

---

## Data Flow

### Manual Refresh (User clicks button)
1. Frontend: `POST /api/research-digest/refresh`
2. Express fetches `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets&sort=LATEST&limit=50&apikey=<KEY>`
3. Express POSTs the full `feed` array to N8N webhook
4. N8N returns structured MVP Output JSON (or Express uses local fallback if N8N is offline)
5. Express INSERTs into `research_digest` SQLite table
6. Express returns MVP Output JSON to frontend
7. Frontend renders Widget 1 + Widget 2

### Page Load (Cached read)
1. Frontend: `GET /api/research-digest`
2. Express: `SELECT * FROM research_digest ORDER BY created_at DESC LIMIT 1`
3. Returns cached JSON (no external API call)

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ALPHA_VANTAGE_API_KEY` | `RVSXZXCE3Q5YS6MQ` | Alpha Vantage API key (free tier: 25 requests/day) |
| `N8N_RESEARCH_DIGEST_PROCESS_URL` | `http://localhost:5678/webhook/1b98a77b-fb76-4603-b879-01ee748fb5f3` | N8N webhook that processes raw Alpha Vantage data into MVP Output JSON |

### Alpha Vantage API Details

- **Endpoint:** `https://www.alphavantage.co/query`
- **Function:** `NEWS_SENTIMENT`
- **Parameters:**
  - `topics=financial_markets`
  - `sort=LATEST`
  - `limit=50`
  - `apikey=<ALPHA_VANTAGE_API_KEY>`
- **Rate Limit:** Free tier = 25 requests/day, 5 requests/minute
- **Response:** JSON with `feed` array containing 50 news articles with sentiment scores

---

## Database Schema

### Table: `research_digest`

Located in: `sourceData/advisor_portal.db`

```sql
CREATE TABLE IF NOT EXISTS research_digest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  digest_json TEXT NOT NULL,            -- Full MVP Output JSON (stringified)
  source_article_count INTEGER,         -- Number of articles from Alpha Vantage
  market_sentiment TEXT,                -- Overall sentiment label
  generated_at TEXT NOT NULL,           -- ISO timestamp when digest was generated
  alpha_vantage_fetched_at TEXT,        -- When AV API was last called
  created_at TEXT DEFAULT (datetime('now'))
);
```

The table is auto-created on server startup if it doesn't exist.

---

## MVP Output JSON Schema

This is the structured data produced by N8N (or the local fallback) and stored in `digest_json`:

```json
{
  "research_digest": {
    "market_sentiment": "Somewhat-Bearish",
    "generated_from_articles": 50,
    "bullish_articles": 8,
    "neutral_articles": 15,
    "bearish_articles": 27,
    "dominant_theme": "Earnings Season & Results",
    "secondary_theme": "Tech Sector Movement"
  },
  "holdings_news_ticker": [
    {
      "ticker": "TSLA",
      "headline": "This Week in Tesla: EV Sales Fall",
      "impact": "Bearish",
      "sentiment": "Somewhat-Bearish",
      "importance_score": 7,
      "source_article_title": "This Week in Tesla: Elon Musk's Financial Windfall...",
      "source_topic": "energy_transportation",
      "source_sentiment": "Somewhat-Bearish",
      "source_sentiment_score": -0.210766,
      "ticker_sentiment_score": -0.22925,
      "ticker_sentiment_label": "Somewhat-Bearish",
      "article_date": "2026-08-16T14:06:00Z"
    }
  ],
  "market_narratives": [
    {
      "theme": "Earnings Season & Results",
      "sentiment": "Somewhat-Bearish",
      "importance_score": 8,
      "supporting_articles": 12,
      "summary": "12 articles covering Earnings Season & Results. Average sentiment is somewhat-bearish with a score of -0.145.",
      "supporting_topics": ["earnings"],
      "supporting_tickers": ["MDT", "MLCO", "KPTI", "WMT", "LOVE"],
      "sample_articles": ["Medtronic Faces Fresh Scrutiny...", "Melco Resorts Just Missed Earnings..."],
      "average_sentiment_score": -0.145
    }
  ]
}
```

---

## Alpha Vantage Response Structure

Each article in the `feed` array:

```json
{
  "title": "Article headline",
  "url": "https://...",
  "time_published": "20260816T143213",
  "authors": ["Author Name"],
  "summary": "Article summary text...",
  "banner_image": "https://...",
  "source": "Source Name",
  "source_domain": "domain.com",
  "topics": [
    { "topic": "earnings", "relevance_score": "0.810479" },
    { "topic": "financial_markets", "relevance_score": "0.733522" }
  ],
  "overall_sentiment_score": -0.288679,
  "overall_sentiment_label": "Somewhat-Bearish",
  "ticker_sentiment": [
    {
      "ticker": "MDT",
      "relevance_score": "1.000000",
      "ticker_sentiment_score": "-0.255937",
      "ticker_sentiment_label": "Somewhat-Bearish"
    }
  ]
}
```

### Sentiment Score Ranges
- `x <= -0.35`: Bearish
- `-0.35 < x <= -0.15`: Somewhat-Bearish
- `-0.15 < x < 0.15`: Neutral
- `0.15 <= x < 0.35`: Somewhat-Bullish
- `x >= 0.35`: Bullish

---

## File Structure

```
advisoryAgentMVP/
├── server.js                                    # Backend (modified)
├── server/
│   ├── research-digest-processor.js             # NEW: Local fallback processor
│   └── google-drive.js                          # Existing
├── src/
│   ├── App.jsx                                  # Modified: new digest widgets
│   ├── index.css                                # Modified: new CSS styles
│   └── components/
│       ├── ResearchNewsTicker.jsx               # NEW: Marquee ticker widget
│       ├── MarketNarratives.jsx                 # NEW: Narrative cards widget
│       ├── DocumentVault.jsx                    # Existing
│       └── ...
└── sourceData/
    └── advisor_portal.db                        # SQLite (new table added)
```

---

## Backend Implementation Details

### File: `server.js`

#### Imports Added
```javascript
import { processAlphaVantageToDigest } from './server/research-digest-processor.js';
```

#### Constants Added
```javascript
const N8N_RESEARCH_DIGEST_PROCESS_URL = process.env.N8N_RESEARCH_DIGEST_PROCESS_URL || 'http://localhost:5678/webhook/1b98a77b-fb76-4603-b879-01ee748fb5f3';
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'RVSXZXCE3Q5YS6MQ';
const ALPHA_VANTAGE_BASE_URL = 'https://www.alphavantage.co/query';
```

#### GET /api/research-digest
- Queries: `SELECT * FROM research_digest ORDER BY created_at DESC LIMIT 1`
- Returns parsed `digest_json` with `generated_at` and `stale` flag
- If no rows: returns empty structure with `stale: true`

#### POST /api/research-digest/refresh
1. Calls Alpha Vantage API
2. Checks for rate limit response (`Note` or `Information` fields) → returns 429
3. Attempts N8N processing (with AbortController timeout)
4. Falls back to `processAlphaVantageToDigest(feed)` if N8N fails
5. Inserts result into SQLite
6. Returns processed data

---

## Local Fallback Processor

### File: `server/research-digest-processor.js`

**Export:** `processAlphaVantageToDigest(feed)`

### Holdings News Ticker Generation
1. Iterates each article's `ticker_sentiment` array
2. Creates item with: ticker, headline, sentiment, scores, dates
3. Calculates `importance_score` (1-10): `relevance_score * abs(sentiment_score) * 10 * 2`
4. Derives `impact`: "Bearish" if score < -0.15, "Bullish" if > 0.15, else "Neutral"
5. Sorts by absolute sentiment score (most impactful first)

### Market Narratives Generation
1. Groups articles by primary topic (highest relevance_score)
2. Filters: only groups with 2+ articles
3. For each group: calculates avg sentiment, counts articles, collects tickers
4. Maps topic keys to human-readable labels (e.g., `earnings` → "Earnings Season & Results")
5. Sorts by article count descending, limits to top 5

### Topic Label Mapping
```javascript
{
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
}
```

---

## Frontend Implementation Details

### State Variables (App.jsx)

```javascript
const [researchDigestData, setResearchDigestData] = useState(null);
const [digestLoading, setDigestLoading] = useState(false);
const [digestRefreshing, setDigestRefreshing] = useState(false);
```

### Functions

- `fetchResearchDigest()` — Called on mount, reads from SQLite cache via GET
- `refreshResearchDigest()` — Called on button click, triggers full refresh via POST
  - Handles 429 rate limit by showing a chat message
  - Updates `researchDigestData` state on success

### Widget 1: ResearchNewsTicker

**File:** `src/components/ResearchNewsTicker.jsx`

- Auto-scrolling horizontal marquee (CSS `@keyframes marquee`)
- Content duplicated 2x for seamless infinite loop
- Displays up to 30 items
- Each item: `[TICKER_BADGE] headline text [SENTIMENT_PILL]`
- Pauses on hover
- Empty state: informational message

**Sentiment Color Logic:**
- Bullish → green (`--success` / `--success-light`)
- Bearish → red (`--critical` / `--critical-light`)
- Neutral → amber (`--caution` / `--caution-light`)

### Widget 2: MarketNarratives

**File:** `src/components/MarketNarratives.jsx`

- CSS Grid layout: `repeat(auto-fill, minmax(260px, 1fr))`
- Each card shows:
  - Theme name (bold)
  - Importance stars (1-5, derived from score/2)
  - Sentiment pill
  - Summary (3-line clamp)
  - Supporting ticker pills
  - Article count footnote
- Hover effect: shadow elevation
- Empty state: informational message

---

## CSS (index.css additions)

### Key Classes

| Class | Purpose |
|-------|---------|
| `.research-digest-section` | Container for the entire digest section |
| `.digest-header` | Flex row: title + meta + refresh button |
| `.digest-meta` | Flex row: sentiment badge + article count + timestamp |
| `.news-ticker-wrapper` | Overflow hidden container (height: 48px) |
| `.news-ticker-track` | Animated inner div (60s linear infinite) |
| `.news-ticker-item` | Individual item: badge + headline + pill |
| `.ticker-badge` | Monospace ticker symbol badge (accent themed) |
| `.ticker-headline` | Headline text (ellipsis truncated at 280px) |
| `.sentiment-pill` | Colored sentiment indicator (9px, uppercase) |
| `.market-narrative-grid` | CSS Grid container for narrative cards |
| `.narrative-card` | Individual card with flex column layout |
| `.narrative-theme` | Bold theme name header |
| `.importance-indicator` | Star rating (highlight color) |
| `.narrative-summary` | 3-line clamped summary text |
| `.narrative-tickers` | Flex wrap container for ticker pills |
| `.ticker-pill` | Small monospace ticker tag |
| `.narrative-footnote` | Article count text at card bottom |

### Animation

```css
@keyframes marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
```

Paused on hover via:
```css
.news-ticker-wrapper:hover .news-ticker-track {
  animation-play-state: paused;
}
```

---

## N8N Webhook Specification

### Endpoint
`POST http://localhost:5678/webhook/1b98a77b-fb76-4603-b879-01ee748fb5f3`

### Request Payload
```json
{
  "feed": [...],              // Full Alpha Vantage feed array (50 articles)
  "holdings_context": [],     // Reserved for future: tickers in the advisory book
  "request_type": "process_digest"
}
```

### Expected Response
The N8N workflow should return the complete MVP Output JSON structure (see schema above). The workflow should:
1. Analyze the 50 articles for themes and patterns
2. Generate AI-enhanced summaries for each market narrative
3. Score and rank ticker news items by relevance and impact
4. Calculate aggregate sentiment metrics
5. Return the structured JSON

If the response is wrapped in an array or `output` field, the backend unwraps it automatically.

---

## Rate Limiting & API Conservation

- **Free Tier:** 25 requests/day, 5 requests/minute
- **Strategy:** Manual refresh only (no auto-polling)
- **Caching:** Results persisted in SQLite; page loads read from cache
- **Rate Limit Handling:** Alpha Vantage returns a `Note` or `Information` field when rate-limited; backend returns HTTP 429 and frontend shows a chat message

---

## Testing Checklist

1. Start server → verify `research_digest` table is created (check console log)
2. `GET /api/research-digest` → returns `{ stale: true, holdings_news_ticker: [], market_narratives: [] }`
3. `POST /api/research-digest/refresh` → calls Alpha Vantage, processes, stores, returns data
4. Stop N8N → trigger refresh → verify local fallback produces valid MVP JSON
5. Open Book Overview tab → see digest section with widgets
6. Click "Refresh Digest" → loading state → widgets populate
7. Marquee scrolls, pauses on hover, sentiment colors are correct
8. Narrative cards show theme, stars, tickers, summary
9. Toggle dark mode → all colors adapt
10. Rate limit test: rapidly click refresh → verify 429 handling
11. Reload page → cached data loads without API call

---

## Future Enhancements (Post-MVP)

- Filter news by advisory book holdings (match `ticker_sentiment` against `holding` table)
- Scheduled background refresh (cron every 6 hours)
- Historical sentiment trending chart
- Click-through to article source URLs
- Configurable topic filters (let advisor choose which sectors to monitor)
- Additional Alpha Vantage endpoints: TOP_GAINERS_LOSERS, GDP, RSI/MACD for held ETFs
