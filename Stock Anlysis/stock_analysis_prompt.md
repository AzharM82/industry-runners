# Stock Analysis Dashboard Generator Prompt

## Overview
Generate a comprehensive single-page stock analysis dashboard for **{TICKER_SYMBOL}** in the style of "Stock Taper" - a vintage/retro financial research platform with a warm, paper-like aesthetic.

---

## Visual Design Specifications

### Color Palette
- **Background**: Warm cream/beige (#F5F0E6 or similar parchment color)
- **Primary Accent**: Muted olive green (#6B7B4C) for buttons, highlights, and interactive elements
- **Secondary Accent**: Burnt orange/coral (#E07B54) for charts and data visualization
- **Text**: Dark brown/charcoal (#3D3D3D) for body text
- **Borders/Dividers**: Light tan (#D4C9B5)
- **Negative Values**: Red (#C45C4A)
- **Positive Values**: Green (#5A8B5A)

### Typography
- **Headers**: Serif font (similar to Georgia or Times) for a classic financial newspaper feel
- **Body/Data**: Clean sans-serif for readability in tables
- **Logo/Brand**: Stylized vintage typewriter or newspaper masthead aesthetic

### Layout Style
- **Overall**: Vintage newspaper/financial report aesthetic
- **Cards/Sections**: Subtle shadows, rounded corners, cream background
- **Tables**: Clean lines, alternating row hints, compact data presentation
- **Charts**: Combination bar charts with line overlays, warm color scheme

---

## Required Sections & Data Components

### 1. Header Section
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] Stock Taper                    ☕ Buy Me Coffee      │
│                                                             │
│ 🔲 {TICKER} [+ Add to watchlist]     🔍 Search Stocks & ETFs│
│ {Company Name} • {Exchange} ${Price} ▲ {Change%} ({Change$})│
│                                                             │
│ [1D] [5W] [1M] [3M] [6M] [YTD] [1YR] [5YR] [10YR] [All]    │
│                                                             │
│ ┌─────────────────────────────┐      Market Cap    ${XX.XXB}│
│ │   INTRADAY PRICE CHART      │      52w High     ${XXX.XX} │
│ │   (Line chart with times)   │      52w Low      ${XX.XX}  │
│ │                             │      P/E          {XX.X}    │
│ └─────────────────────────────┘      Volume       {XX.XXM}  │
│                                      Outstanding  {XXX.XXM} │
└─────────────────────────────────────────────────────────────┘
```

**Data Required:**
- Ticker symbol and company name
- Current price with daily change ($ and %)
- Intraday price chart (time series)
- Key metrics: Market Cap, 52-week High/Low, P/E Ratio, Volume, Outstanding Shares

### 2. About Company Section (Right Sidebar)
```
About {Company Name}
{Website URL}

{2-3 sentence company description covering:
- Primary business activities
- Key products/services
- Founding date and headquarters location}
```

### 3. Income Statement Section
```
┌─────────────────────────────────────────────────────────────┐
│ Income Statement                    [Quarterly] [Annually]  │
├─────────────────────────────────────────────────────────────┤
│ PERIOD | REVENUE | OPERATING | NET    | NET PROFIT | EPS   │
│        |         | EXPENSE   | INCOME | MARGIN     |       │
├─────────────────────────────────────────────────────────────┤
│ Q1-20XX│ $X.XXB  │ $XXXM     │ $XXXM  │ X.XX%      │ $X.XX │
│ Q4-20XX│ $X.XXB  │ $XXXM ▼   │ -$XXM  │ -X.XX%     │-$X.XX │
│ Q3-20XX│ $X.XXB ▼│ $X.XXB    │ $XXXM ▼│ -XX.XX%    │-$XX.XX│
│ Q2-20XX│ $X.XXB  │ $XXXM ▲   │ $XXXM ▲│ X.XX%      │ $X.XX │
│ Q1-20XX│ $X.XXB  │ $XXXM     │ $XXXM  │ XX.XX%     │ $X.XX │
├─────────────────────────────────────────────────────────────┤
│ [COMBO BAR/LINE CHART]                                      │
│ ▓ Revenue  ▓ Net Income  ─ Profit Margin                   │
│                                                             │
│ [Explain These Numbers] button                              │
└─────────────────────────────────────────────────────────────┘
```

**Chart Specifications:**
- Dual-axis combo chart
- Bars: Revenue (tall, muted orange) and Net Income (shorter, darker orange)
- Line: Profit Margin % (overlaid, with right Y-axis showing percentage)
- X-axis: Quarterly periods
- Include EBITDA column if available

### 4. Balance Statement Section
```
┌─────────────────────────────────────────────────────────────┐
│ Balance Statement                   [Quarterly] [Annually]  │
├─────────────────────────────────────────────────────────────┤
│ PERIOD | CASH &      | TOTAL   | TOTAL       | TOTAL       │
│        | SHORT-TERM  | ASSETS  | LIABILITIES | EQUITY      │
├─────────────────────────────────────────────────────────────┤
│ Q1-20XX│ $X.XXB      │ $XX.XXB ▼│ $X.XXB ▼   │ $X.XXB      │
│ Q4-20XX│ $X.XXB ▼    │ $XX.XXB  │ $X.XXB ▼   │ $X.XXB ▲    │
│ Q3-20XX│ $X.XXB      │ $XX.XXB ▲│ $X.XXB ▲   │ $X.XXB ▲    │
│ Q2-20XX│ $XXXM       │ $XX.XXB ▲│ $X.XXB ▲   │ $XXM ▼      │
│ Q1-20XX│ $XXXM       │ $XX.XXB  │ $X.XXB     │ $XX.XXB     │
├─────────────────────────────────────────────────────────────┤
│ [STACKED BAR CHART]                                         │
│ ▓ Total Assets  ▓ Total Liabilities                        │
│                                                             │
│ [Explain These Numbers] button                              │
└─────────────────────────────────────────────────────────────┘
```

### 5. Cash Flow Statement Section
```
┌─────────────────────────────────────────────────────────────┐
│ Cash Flow Statement                 [Quarterly] [Annually]  │
├─────────────────────────────────────────────────────────────┤
│ PERIOD | NET    | CASH FROM  | CASH FROM | CASH FROM |     │
│        | INCOME | OPERATIONS | INVESTING | FINANCING |     │
│        |        |            |           |           |NET  │
│        |        |            |           |           |CHANGE│
│        |        |            |           |           |FREE │
├─────────────────────────────────────────────────────────────┤
│ [5 quarters of data with arrows indicating trends]          │
├─────────────────────────────────────────────────────────────┤
│ [GROUPED BAR CHART - 4 categories per period]               │
│ ▓ Operations ▓ Investing ▓ Financing (color coded)         │
│                                                             │
│ [Explain These Numbers] button                              │
└─────────────────────────────────────────────────────────────┘
```

### 6. Revenue by Products Section
```
┌─────────────────────────────────────────────────────────────┐
│ Revenue by Products                 [Quarterly] [Annually]  │
├─────────────────────────────────────────────────────────────┤
│ PRODUCT          │ Q2-20XX   │ Q4-20XX   │ Q1-20XX         │
├─────────────────────────────────────────────────────────────┤
│ 🖥 {Product 1}   │ $X.XXBn ▲ │ $X.XXBn ▲ │ $XXX.XXM ▼      │
│ ☁ {Product 2}   │ $XXX.XXM ▲│ $XXX.XXM ▲│ $XXX.XXM ▼      │
│ 👤 {Product 3}   │ $XXX.XXM ▲│           │ $X.XXBn ▲       │
└─────────────────────────────────────────────────────────────┘
```

### 7. Revenue by Geography Section
```
┌─────────────────────────────────────────────────────────────┐
│ Revenue by Geography                [Quarterly] [Annually]  │
├─────────────────────────────────────────────────────────────┤
│ REGION           │ Q4-20XX   │ Q3-20XX   │ Q2-20XX         │
├─────────────────────────────────────────────────────────────┤
│ 🌎 Americas      │ $X ▲      │ $XXX.XXM ▲│ $XXX.XXM ▲      │
│ 🌏 Asia          │ $X ▲      │ $X.XXBn ▲ │ $X.XXBn ▲       │
│ 🌍 EMEA          │ $X.XXBn ▲ │ $XXX.XXM ▲│ $XXX.XXM ▲      │
└─────────────────────────────────────────────────────────────┘
```

### 8. Compensation Summary Section (Right Side)
```
┌─────────────────────────────────────────────────────────────┐
│ Compensation Summary (Year 20XX)                            │
├─────────────────────────────────────────────────────────────┤
│ [CEO Photo/Avatar]        Salary          $XXX,XXX          │
│                           Bonus           $X,XXX,XXX        │
│ CEO                       Stock Awards    $XX,XXX,XXX       │
│ {CEO Name}                Incentive Pay   $X,XXX,XXX        │
│                           ─────────────────────────         │
│                           Total           $XX,XXX,XXX       │
├─────────────────────────────────────────────────────────────┤
│ Industry         {Industry Category}                        │
│ Sector           {Sector}                                   │
│ Went Public      {Date}                                     │
│ Method           {IPO/Direct/SPAC}                          │
│ Full Time Emp.   {X,XXX}                                    │
└─────────────────────────────────────────────────────────────┘
```

### 9. ETFs Holding This Stock Section
```
┌─────────────────────────────────────────────────────────────┐
│ ETFs Holding This Stock                                     │
├─────────────────────────────────────────────────────────────┤
│ [ETF Logo] {ETF1}    Weight: X.XX%                Summary   │
│ Vanguard            Shares: X.XXM                           │
│                                                   Total: XXX│
│ [ETF Logo] {ETF2}    Weight: X.XX%               Showing Top│
│ iShares             Shares: X.XXM                  3 of XXX │
│                                                             │
│ [ETF Logo] {ETF3}    Weight: X.XX%        [Show All ETFs]   │
│                     Shares: X.XXM                           │
└─────────────────────────────────────────────────────────────┘
```

### 10. Ratings Snapshot Section
```
┌─────────────────────────────────────────────────────────────┐
│ Ratings Snapshot                                            │
├─────────────────────────────────────────────────────────────┤
│ Rating: {X} / C                                             │
│                                                             │
│ [PENTAGON/RADAR CHART]          Discounted Cash Flow   X   │
│     DCF                          Return On Equity       X   │
│   /     \                        Return On Assets       X   │
│  ROE    ROA                      Debt To Equity         X   │
│   \     /                        Price To Earnings      X   │
│    P/E-D/E                       Price To Book          X   │
│                                  ─────────────────────────  │
│                                  Overall Score          X   │
│                                                             │
│ [What Does This Mean?] button                               │
└─────────────────────────────────────────────────────────────┘
```

### 11. Most Recent Analyst Grades Section
```
┌─────────────────────────────────────────────────────────────┐
│ Most Recent Analyst Grades                                  │
├─────────────────────────────────────────────────────────────┤
│ [Bank Logo] {Bank 1}                      Grade Summary     │
│             {Rating}                      ─────────────     │
│                                           Buy           X   │
│ [Bank Logo] {Bank 2}                      Outperform    X   │
│             {Rating}                      Positive      X   │
│                                           Overweight    X   │
│ [Bank Logo] {Bank 3}          [Total Weight]                │
│             {Rating}                                        │
│                               Showing Top X of XX           │
│ [Bank Logo] {Bank 4}                                        │
│             {Rating}          [View All Grades]             │
│                                                             │
│ [Bank Logo] {Bank 5}                                        │
│             {Rating}                                        │
└─────────────────────────────────────────────────────────────┘
```

### 12. Price Target Section
```
┌─────────────────────────────────────────────────────────────┐
│ Price Target                                                │
├─────────────────────────────────────────────────────────────┤
│ Target High                               $XXX              │
│ Target Low                                $XX               │
│ Target Median                             $XXX              │
│ Target Consensus                          $XXX.XX           │
└─────────────────────────────────────────────────────────────┘
```

### 13. Institutional Ownership Section
```
┌─────────────────────────────────────────────────────────────┐
│ Institutional Ownership                                     │
├─────────────────────────────────────────────────────────────┤
│ [Logo] {Institution 1}     Summary                          │
│        Shares: XX.XXM      ─────────────────────────────    │
│        Value: $X.XXB       % of Shares Owned       XX.XX%   │
│                            Total Number Of Holders  XXX     │
│ [Logo] {Institution 2}                                      │
│        Shares: XX.XXM      Showing Top 3 of XXX             │
│        Value: $X.XXB                                        │
│                            [View All Holders]               │
│ [Logo] {Institution 3}                                      │
│        Shares: XX.XXM                                       │
│        Value: $X.XXB                                        │
└─────────────────────────────────────────────────────────────┘
```

### 14. Trades By Congress Section
```
┌─────────────────────────────────────────────────────────────┐
│ Trades By Congress                                          │
├─────────────────────────────────────────────────────────────┤
│ HOUSE TRADES                                                │
│                                                             │
│ [Photo] {Rep Name 1}        [Photo] {Rep Name 2}           │
│         {Action}                     {Action}               │
│         {Date}                       {Date}                 │
│                                                             │
│ [Alert Me On Future Trades] button                          │
└─────────────────────────────────────────────────────────────┘
```

### 15. Sector Peers Section
```
┌─────────────────────────────────────────────────────────────┐
│ Sector Peers                                                │
├─────────────────────────────────────────────────────────────┤
│ PEER        │ PRICE      │ MARKET CAP  │                    │
├─────────────────────────────────────────────────────────────┤
│ 🔶 {TICK1}  │ $XXX.XX    │ $XX.XXB     │ [Compare]          │
│ ── {TICK2}  │ $XXX.XX    │ $XX.XXB     │ [Compare]          │
│ 🟡 {TICK3}  │ $XXX.XX    │ $XX.XXB     │ [Compare]          │
│ 🔊 {TICK4}  │ $X.XX      │ $XX.XXB     │ [Compare]          │
│ ⬡ {TICK5}   │ $XX.XX     │ $XX.XXB     │ [Compare]          │
│ 📦 {TICK6}  │ $XXX.XX    │ $XX.XXB     │ [Compare]          │
│ 🔷 {TICK7}  │ $XXX.XX    │ $XX.XXB     │ [Compare]          │
│ ✖ {TICK8}   │ $XX.XX     │ $XX.XXB     │ [Compare]          │
│ 🔗 {TICK9}  │ $XX.XX     │ $XX.XXB     │ [Compare]          │
└─────────────────────────────────────────────────────────────┘
```

### 16. Footer Section
```
┌─────────────────────────────────────────────────────────────┐
│ Company              Legal                   Resources      │
│ About                Privacy Policy          Stocks         │
│ Blog                 Terms of Service        ETFs           │
│ Contact                                      Institutions   │
│                                              Congress       │
│                                              Analysts       │
│                                              Earnings Cal   │
├─────────────────────────────────────────────────────────────┤
│              © 20XX Stock Taper. All rights reserved.       │
└─────────────────────────────────────────────────────────────┘
```

---

## Chart Styling Guidelines

### Bar Charts
- Use warm, muted colors (coral/orange tones)
- Rounded corners on bars
- Subtle grid lines in background
- Clean axis labels
- Hover states for interactivity

### Line Charts
- Smooth curves (not sharp angles)
- Dot markers at data points
- Area fill with transparency optional
- Distinct colors for multiple series

### Radar/Pentagon Charts
- 5-6 axis points
- Filled area with transparency
- Clear axis labels around perimeter
- Score values listed alongside

### Combo Charts (Bar + Line)
- Dual Y-axis (left for absolute values, right for percentages)
- Bars grouped by period
- Line overlaid for margin/trend data

---

## Interactive Elements

1. **[Quarterly] / [Annually]** toggle buttons on financial tables
2. **[Explain These Numbers]** buttons for AI-generated explanations
3. **[+ Add to watchlist]** button in header
4. **[Compare]** buttons for peer comparison
5. **[View All ___]** expansion buttons
6. **[Alert Me On Future Trades]** notification signup
7. **Time period selectors**: 1D, 5W, 1M, 3M, 6M, YTD, 1YR, 5YR, 10YR, All

---

## Data Sources Required

To generate this dashboard, you need:

1. **Real-time/delayed quote data**: Current price, change, volume
2. **Company fundamentals**: From SEC filings (10-K, 10-Q)
3. **Financial statements**: Income, Balance Sheet, Cash Flow
4. **Segment data**: Revenue by product and geography
5. **Analyst data**: Ratings, price targets
6. **ETF holdings**: From ETF providers
7. **Institutional holdings**: 13F filings
8. **Congressional trades**: STOCK Act disclosures
9. **Company metadata**: Description, sector, industry, employee count
10. **Executive compensation**: Proxy statements (DEF 14A)

---

## Example Usage

```
Generate a Stock Taper-style analysis dashboard for:

Ticker: SNDK
Company: SanDisk Corporation
Exchange: NASDAQ
Current Price: $377.41
Daily Change: +12.85% (+$42.86)

Include all 16 sections with:
- 5 quarters of financial data
- Top 3 ETF holders
- Top 5 analyst ratings
- Top 3 institutional holders
- 9 sector peers for comparison
- Recent congressional trades if any
- Complete compensation summary
```

---

## Technical Implementation Notes

### For HTML/React Implementation:
- Use CSS Grid or Flexbox for responsive layout
- Implement with Recharts, Chart.js, or D3.js for visualizations
- Use CSS variables for the color palette
- Consider a card-based component structure
- Add loading states for data fetching

### For Static Report Generation:
- Use a template engine (Jinja2, Handlebars)
- Generate SVG charts or use charting libraries
- Export to PDF with proper page breaks
- Ensure print-friendly styling

---

## Sample Color CSS Variables

```css
:root {
  --bg-primary: #F5F0E6;
  --bg-card: #FFFDF8;
  --accent-green: #6B7B4C;
  --accent-orange: #E07B54;
  --accent-orange-light: #F4A574;
  --text-primary: #3D3D3D;
  --text-secondary: #6B6B6B;
  --border-color: #D4C9B5;
  --positive: #5A8B5A;
  --negative: #C45C4A;
  --chart-bar-1: #E07B54;
  --chart-bar-2: #C45C4A;
  --chart-line: #6B7B4C;
}
```
