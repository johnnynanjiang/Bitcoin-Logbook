# Bitcoin DCA Calculator

Live page: <https://bitcoinlogbook.com/apps/bitcoin-dca-calculator/>

A static page that runs entirely in the browser: no Node.js, no npm and no build step to use it or deploy it. Open `index.html` straight from disk (`file://`) or serve it with the rest of the site.

```
index.html                        page: inline CSS + one inline UI script
lib/core.js                       dates, CSV parsing, schedules, validation, simulation, strategy registry
lib/results-history.js            "Previous results" list (sort, best, per-row CSV, localStorage)
strategies/<id>/<id>-strategy.js  one folder per strategy (standard-dca, lump-sum) + its .test.js
data/                             BTC/USD daily closes (see below)
tests/                            tests: tests/index.html in a browser, or node tests/run.js
```

## Price data

| File | What it is |
|---|---|
| `data/btc-usd-daily.csv` | `date,close`. One row per UTC day from 2010-07-18 to the last finished UTC day. |
| `data/btc-usd-daily.meta.json` | Source, licence, first/last date, row count, last close, SHA-256 of the CSV, Coinbase cross-check result. |
| `data/btc-usd-daily.js` | The same CSV text + metadata as a script (`window.BTC_USD_DAILY`). The page and the browser tests load this, because a page opened from `file://` cannot `fetch()` the `.csv`. **Generated: never edit by hand.** |

- **Source:** [Coin Metrics Community Data](https://coinmetrics.io/community-network-data/), metric `PriceUSD`, daily. Row `D` = BTC/USD reference rate at the end of UTC day `D`.
- **Licence:** CC BY-NC 4.0. Credit is on the page; the licence is non-commercial.
- **Precision:** prices are stored at 10 significant digits, so the 2010 sub-dollar prices survive and rewrites are byte-identical.

Never edit the three files by hand. Every change goes through the updater script, which validates the data and keeps the files in sync.

## Updating the data

### Automatically (normal case)

`.github/workflows/update-btc-prices.yml` (at the website repo root) does it every day:

1. Runs at **00:17 UTC**, with a catch-up run at 06:17 UTC.
2. Runs `python3 .github/scripts/update_btc_prices.py`, which appends any missing finished UTC days.
3. Runs `node apps/bitcoin-dca-calculator/tests/run.js`. If any test fails, nothing is committed or deployed.
4. If the CSV changed, it commits `apps/bitcoin-dca-calculator/data/` as `data: BTC daily close through YYYY-MM-DD` and pushes to `main`.
5. Deploys the whole site to GitHub Pages.
6. Turns the run red (GitHub emails you) if the data is more than 3 days old. The site still deploys.

The workflow also runs on every push to `main` (deploy only, no data fetch). You can start it by hand from **Actions → "BTC prices: update & deploy site" → Run workflow**. Tick **full_rebuild** to rebuild the whole history from 2010.

**One-time setup** (needed before the workflow can deploy): in the GitHub repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**. Until then the schedule can still update the data, but the deploy step fails. To confirm it works, look for the bot's `data: BTC daily close through …` commits on `main`, or check the Actions tab.

### By hand (on your Mac)

Run these from the **website repo root** (the folder containing `.github/`, `index.html` and `apps/`). It needs Python 3 only, with no packages to install.

```bash
cd /Users/nanjiang/Documents/dev/projects/Startup/J-Labs/documents/MPC/VastLink/code/BitcoinLogbook.com/code/website

# 1. Add the missing days (up to yesterday, UTC)
python3 .github/scripts/update_btc_prices.py

# 2. Check that the data and the calculator still agree
node apps/bitcoin-dca-calculator/tests/run.js     # or open apps/bitcoin-dca-calculator/tests/index.html

# 3. Publish
git add apps/bitcoin-dca-calculator/data/
git commit -m "data: BTC daily close through $(python3 -c "import json;print(json.load(open('apps/bitcoin-dca-calculator/data/btc-usd-daily.meta.json'))['lastDate'])")"
git push
```

Other options:

```bash
python3 .github/scripts/update_btc_prices.py --full             # re-download everything from 2010-07-18
python3 .github/scripts/update_btc_prices.py --js-only          # only regenerate data/btc-usd-daily.js from the .csv + .meta.json
python3 .github/scripts/update_btc_prices.py --max-age-days=3   # update, then exit 1 if data is >3 days old
```

**`CERTIFICATE_VERIFY_FAILED` on macOS?** The python.org build of Python sometimes has no CA certificates. Run it like this instead:

```bash
SSL_CERT_FILE=/etc/ssl/cert.pem python3 .github/scripts/update_btc_prices.py
```

(Or run `Install Certificates.command` once from `/Applications/Python 3.x/`.) Do not turn off certificate checks in the script.

### What the updater checks before writing

It writes nothing and exits 1 if any of these checks fail:

- History starts on 2010-07-18.
- Every day is present once (no gaps, no duplicates).
- Every price is > 0.
- No row is for today's unfinished UTC day.
- The newest days (at least 30) are within 5% of Coinbase's BTC-USD daily close. If Coinbase cannot be reached, it skips this check and says so.

The new CSV is written atomically (temp file, then rename). The `.meta.json` and `.js` copy are then regenerated to match. Running the script again on the same day changes nothing.

## Tests that guard the data

`node tests/run.js` (or `tests/index.html` in a browser) includes:

- **Price data** (`tests/data.test.js`)
  - The file starts on 2010-07-18, is contiguous and ends before today (UTC).
  - It matches its metadata and passes spot checks.
  - `btc-usd-daily.js` is an exact copy of the `.csv` and `.meta.json` (command line only).
- **Figures on the page** (`tests/page-figures.test.js`): every number written into `index.html` is re-calculated from the data:
  - the prefilled $100/week 2025-08-01 → 2026-08-01 example
  - the $100/month tables from 2015, 2018 and 2021
  - the fee table and the daily/weekly/monthly FAQ answer

  All of these use fixed end dates, so daily updates do not change them. Only a correction to past prices would (for example after `--full`, if Coin Metrics revised history). If that happens, the test fails and the workflow stops before deploying. Update the numbers in `index.html` (text, tables, static metrics, FAQ and the FAQPage JSON-LD), then the expected values in the test.

If `btc-usd-daily.js` is out of date (for example after someone edited the CSV by hand), fix it with `python3 .github/scripts/update_btc_prices.py --js-only`.

## Running the tests

```bash
node apps/bitcoin-dca-calculator/tests/run.js       # add -v for every check's details
```

Or double-click `tests/index.html`. It works from disk and needs no server.
