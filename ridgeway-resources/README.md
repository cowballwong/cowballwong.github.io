# Ridgeway Church Resources · 廣道教會資源

Bilingual sermon transcripts, study notes, and special-event materials for the Cantonese-speaking community at Ridgeway Church, St Albans.

**Live site:** https://anzonwong.com/ridgeway-resources/

## Structure

- `index.html` — landing page (English / 繁體中文) with a category top bar: Sermon · Bible Study · Music (links to anzonwong.com/worship-music) · Special
- `away-day-2026/` — Thematic Bible Overview: REST · 主題聖經導覽：安息
- Sunday sermon folders will follow the pattern `sermons/YYYY-MM-DD-slug/`
- Bible study guides follow the pattern `studies/YYYY-MM-DD-slug/` (the newest is the featured card on the Bible Study tab; every study also has a row, grouped by its `data-group` topic)

## Adding a Sunday sermon

1. Create folder `sermons/YYYY-MM-DD-slug/`
2. Place `index.html` (bilingual transcript) and `audio/*.mp3` inside
3. On the landing page, swap the `★ This Sunday` card and add an `<article class="srow" data-date="YYYY-MM-DD">` row below the SERMON-ROWS marker (the page groups rows by year and month itself). `sermon_watcher.py` does this step automatically, and `_tools/inject_home_button.py` gives the page its "← Resources" button
4. Commit and push — GitHub Pages rebuilds automatically

## Not published here

- Names of group members or leaders, contact details, meeting times or places, or leaders' own documents (studies are published only after a privacy pass)
- Any unreleased or pastoral material
