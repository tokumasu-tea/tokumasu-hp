#!/usr/bin/env node
// 茶道 実用辞典 ページ生成スクリプト
// sadogu-jiten-data/ のデータファイルを読み、sadogu-jiten/index.html を作り直します。
// 本文はこのファイルに書かないでください（本文はすべてデータファイル側）。
// 使い方：sadogu-jiten-data/辞典を更新する.command をダブルクリック
//        （またはターミナルで node scripts/build-sadogu-jiten.mjs）

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'sadogu-jiten-data');
const OUT_DIR = path.join(ROOT, 'sadogu-jiten');
const OUT = path.join(OUT_DIR, 'index.html');
const SITE = 'https://tokumasu.co.jp';
const PAGE_URL = `${SITE}/sadogu-jiten/`;
const SCHOOL_NOTE = '流派・社中によって異なります。お稽古先の先生にご確認ください。';

const errors = [];
const err = (file, msg) => errors.push(`・${file}：${msg}`);

// ---------- 読み込み ----------
function readJson(file) {
  const rel = path.relative(ROOT, file);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    err(rel, `ファイルの書き方に誤りがあります（カンマ「,」や「"」の抜け・余分がないか確認してください）。詳細: ${e.message}`);
    return null;
  }
}
function readDir(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.'))
    .map((f) => {
      const full = path.join(dir, f);
      return { file: f, rel: path.relative(ROOT, full), mtime: fs.statSync(full).mtimeMs, data: readJson(full) };
    })
    .filter((x) => x.data);
}

const categories = readJson(path.join(DATA, 'categories.json')) || [];
const catMap = new Map(categories.map((c) => [c.id, c]));

const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const cleanList = (v) => (Array.isArray(v) ? v.map((s) => String(s ?? '').trim()).filter(Boolean) : []);
function checkDate(rel, v) {
  if (!DATE_RE.test(v || '') || Number.isNaN(Date.parse(v))) err(rel, `「更新日」は 2026-11-19 のように YYYY-MM-DD で書いてください（今は「${v ?? ''}」）`);
}
function checkId(rel, file, id) {
  if (!ID_RE.test(id || '')) err(rel, `「id」は英小文字・数字・ハイフンだけで書いてください（今は「${id ?? ''}」）`);
  else if (file !== `${id}.json`) err(rel, `ファイル名を「${id}.json」にしてください（id とファイル名をそろえます）`);
}

// ---------- 道具 ----------
const tools = readDir(path.join(DATA, 'tools')).map(({ file, rel, mtime, data: d }) => {
  checkId(rel, file, d.id);
  for (const k of ['名前', '読み方']) if (!String(d[k] ?? '').trim()) err(rel, `「${k}」が空です`);
  if (!catMap.has(d['カテゴリ'])) err(rel, `「カテゴリ」は次のどれかにしてください：${categories.map((c) => `${c.id}（${c['名前']}）`).join('、')}（今は「${d['カテゴリ'] ?? ''}」）`);
  const t = {
    id: d.id, name: String(d['名前'] ?? '').trim(), reading: String(d['読み方'] ?? '').trim(), cat: d['カテゴリ'],
    use: cleanList(d['用途']), choose: cleanList(d['選び方の目安']), how: cleanList(d['使い方']), care: cleanList(d['手入れ・保管']),
    troubles: (Array.isArray(d['よくあるトラブル']) ? d['よくあるトラブル'] : [])
      .map((x) => ({ p: String(x?.['症状'] ?? '').trim(), s: String(x?.['対処'] ?? '').trim() }))
      .filter((x) => x.p || x.s),
    keywords: cleanList(d['キーワード']), school: d['流派注意'] === true, schoolText: String(d['流派注意の補足'] ?? '').trim(),
    images: (Array.isArray(d['画像']) ? d['画像'] : [])
      .map((x) => ({ src: String(x?.['ファイル'] ?? '').trim(), alt: String(x?.['説明'] ?? '').trim() }))
      .filter((x) => x.src || x.alt),
    table: d['比較表'] && typeof d['比較表'] === 'object' ? {
      title: String(d['比較表']['見出し'] ?? '').trim(),
      cols: cleanList(d['比較表']['列']),
      rows: (Array.isArray(d['比較表']['行']) ? d['比較表']['行'] : []).map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : [])),
      notes: cleanList(d['比較表']['注記']),
    } : null,
    order: d['並び順'] === undefined || d['並び順'] === null || d['並び順'] === '' ? Infinity : Number(d['並び順']),
    updated: d['更新日'], mtime, rel,
  };
  if (Number.isNaN(t.order)) err(rel, `「並び順」は 1、2、3 のような数字にしてください（今は「${d['並び順']}」）`);
  if (d['画像'] !== undefined && !Array.isArray(d['画像'])) err(rel, '「画像」は [ ] で囲んだ一覧にしてください');
  t.images.forEach((x, i) => {
    if (!/^\/images\/[\w\-./]+\.(jpe?g|png|webp)$/i.test(x.src)) err(rel, `「画像」の${i + 1}件目の「ファイル」は /images/sadogu-jiten/〇〇.jpg のように書いてください（今は「${x.src}」）`);
    else if (!fs.existsSync(path.join(ROOT, x.src))) err(rel, `「画像」の${i + 1}件目のファイル「${x.src}」が見つかりません（images/sadogu-jiten フォルダに入れてください）`);
    if (!x.alt) err(rel, `「画像」の${i + 1}件目の「説明」（何が写っているか）が空です`);
  });
  if (t.table) {
    if (!t.table.cols.length) err(rel, '「比較表」の「列」（表の見出し）を書いてください');
    if (!t.table.rows.length) err(rel, '「比較表」の「行」を1つ以上書いてください');
    t.table.rows.forEach((r, i) => { if (r.length !== t.table.cols.length) err(rel, `「比較表」の${i + 1}行目は、列と同じ ${t.table.cols.length} 個の項目にしてください（今は ${r.length} 個）`); });
  }
  for (const [k, v] of [['用途', t.use], ['使い方', t.how], ['手入れ・保管', t.care]]) if (!v.length) err(rel, `「${k}」を1つ以上書いてください`);
  if (typeof d['流派注意'] !== 'boolean') err(rel, '「流派注意」は true（流派で違う）か false（違わない）にしてください');
  t.troubles.forEach((x, i) => { if (!x.p || !x.s) err(rel, `「よくあるトラブル」の${i + 1}件目は「症状」と「対処」の両方を書いてください`); });
  if (d['出典'] !== undefined && !Array.isArray(d['出典'])) err(rel, '「出典」は [ ] で囲んだ一覧にしてください');
  (Array.isArray(d['出典']) ? d['出典'] : []).forEach((x, i) => {
    if (x && typeof x === 'object' && String(x['内容'] ?? '').trim() && !String(x['出典名'] ?? '').trim()) err(rel, `「出典」の${i + 1}件目は「出典名」も書いてください`);
  });
  checkDate(rel, t.updated);
  return t;
});
const toolIds = new Set();
for (const t of tools) { if (toolIds.has(t.id)) err(t.rel, `id「${t.id}」が他の項目と重複しています`); toolIds.add(t.id); }

// ---------- FAQ ----------
const faqs = readDir(path.join(DATA, 'faq')).map(({ file, rel, mtime, data: d }) => {
  checkId(rel, file, d.id);
  const f = {
    id: d.id, q: String(d['質問'] ?? '').trim(), a: String(d['回答'] ?? '').trim(),
    related: cleanList(d['関連する道具']), keywords: cleanList(d['キーワード']), updated: d['更新日'], mtime, rel,
  };
  if (!f.q) err(rel, '「質問」が空です');
  if (!f.a) err(rel, '「回答」が空です');
  for (const r of f.related) if (!toolIds.has(r)) err(rel, `「関連する道具」の「${r}」という id の道具が見つかりません`);
  checkDate(rel, f.updated);
  return f;
});

// ---------- 目的別セット（点前用道具・席入り道具 など） ----------
const sets = readDir(path.join(DATA, 'sets')).map(({ file, rel, data: d }) => {
  checkId(rel, file, d.id);
  const st = {
    id: d.id, key: `set-${d.id}`, en: String(d["英語"] ?? "").trim(), name: String(d['名前'] ?? '').trim(), target: String(d['対象'] ?? '').trim(),
    order: Number(d['並び順']) || 99, desc: String(d['説明'] ?? '').trim(), note: String(d['注意文'] ?? '').trim(), updated: d['更新日'], rel,
    items: (Array.isArray(d['道具']) ? d['道具'] : []).map((x) => ({
      ids: (Array.isArray(x?.id) ? x.id : [x?.id]).map((v) => String(v ?? '').trim()).filter(Boolean),
      label: String(x?.['表示名'] ?? '').trim(), reason: String(x?.['理由'] ?? '').trim(),
    })).filter((x) => x.ids.length || x.reason),
  };
  if (!st.name) err(rel, '「名前」が空です');
  if (!st.items.length) err(rel, '「道具」を1つ以上書いてください');
  st.items.forEach((x, i) => {
    if (!x.ids.length) err(rel, `「道具」の${i + 1}件目に id を書いてください`);
    for (const id of x.ids) if (!toolIds.has(id)) err(rel, `「道具」の${i + 1}件目の「${id}」という id の道具が見つかりません（先に tools に追加してください）`);
    if (!x.reason) err(rel, `「道具」の${i + 1}件目の「理由」（なぜ必要か）が空です`);
  });
  checkDate(rel, st.updated);
  return st;
}).sort((a, b) => a.order - b.order);
const setsOf = (toolId) => sets.filter((st) => st.items.some((x) => x.ids.includes(toolId))).map((st) => st.key);

if (errors.length) {
  console.error('\n✖ 辞典ページは更新していません。次の箇所を直してから、もう一度実行してください。\n');
  console.error(errors.join('\n'));
  console.error('');
  process.exit(1);
}

// ---------- 並び順 ----------
const ja = new Intl.Collator('ja');
const catOrder = new Map(categories.map((c, i) => [c.id, i]));
tools.sort((a, b) => catOrder.get(a.cat) - catOrder.get(b.cat) || (a.order === b.order ? 0 : a.order < b.order ? -1 : 1) || ja.compare(a.reading, b.reading));
const faqOrder = (f) => Math.min(...f.related.map((r) => tools.findIndex((t) => t.id === r)).filter((i) => i >= 0), 9999);
faqs.sort((a, b) => faqOrder(a) - faqOrder(b) || ja.compare(a.q, b.q));
// 新しく追加・更新した項目：更新日が新しい順、同じ日なら後から保存したものを先に
const recent = [...tools].sort((a, b) => b.updated.localeCompare(a.updated) || b.mtime - a.mtime).slice(0, 3);
const lastUpdated = [...tools, ...faqs].map((x) => x.updated).sort().pop() || '';

// ---------- HTML部品 ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const jaDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return `${y}年${m}月${dd}日`; };
const ul = (list) => `<ul class="jt-list">${list.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>`;
const searchText = (...parts) => esc(parts.flat().join(' '));

// 絞り込みボタン・目次の並び：先頭カテゴリ（抹茶）→ 目的別セット → 残りのカテゴリ
const catChip = (c) => `<button type="button" class="jt-chip" data-cat="${c.id}" aria-pressed="false">${esc(c['名前'])}</button>`;
const setChip = (st) => `<button type="button" class="jt-chip jt-chip-set" data-cat="${st.key}" aria-pressed="false">${esc(st.name)}${st.target ? `（${esc(st.target)}）` : ''}</button>`;
const tocCat = (c) => `<p class="jt-toc-cat">${esc(c['名前'])}</p>
        <ul class="jt-toc-list">${tools.filter((t) => t.cat === c.id).map((t) => `<li><a href="#${t.id}" class="jt-jump">${esc(t.name)}</a></li>`).join('')}</ul>`;

function toolHtml(t) {
  const cat = catMap.get(t.cat);
  const relFaqs = faqs.filter((f) => f.related.includes(t.id));
  const blocks = [
    ['用途', t.use.length && ul(t.use)],
    ['選び方の目安', t.choose.length && ul(t.choose)],
    [t.table ? esc(t.table.title || '比較') : '', t.table && `<div class="jt-table-wrap"><table class="jt-table"><thead><tr>${t.table.cols.map((c) => `<th scope="col">${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.table.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td data-label="${esc(t.table.cols[i])}">${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>${t.table.notes.length ? `<ul class="jt-table-notes">${t.table.notes.map((n) => `<li>※ ${esc(n)}</li>`).join('')}</ul>` : ''}`],
    ['使い方', t.how.length && ul(t.how)],
    ['手入れ・保管', t.care.length && ul(t.care)],
    ['よくあるトラブル', t.troubles.length && `<dl class="jt-trouble">${t.troubles.map((x) => `<div><dt>${esc(x.p)}</dt><dd>${esc(x.s)}</dd></div>`).join('')}</dl>`],
  ].filter(([, html]) => html);
  return `
      <article class="jt-item" id="${t.id}" data-cat="${[t.cat, ...setsOf(t.id)].join(' ')}" data-search="${searchText(t.name, t.reading, cat['名前'], t.keywords, t.use, t.choose, t.how, t.care, t.troubles.map((x) => [x.p, x.s]), t.table ? [t.table.cols, t.table.rows, t.table.notes] : [])}">
        <header class="jt-item-head">
          <h3 class="jt-item-title">${esc(t.name)}<span class="jt-item-reading">${esc(t.reading)}</span></h3>
          <span class="jt-item-cat">${esc(cat['名前'])}</span>
        </header>
        ${t.school ? `<p class="jt-school">※ ${esc(t.schoolText || SCHOOL_NOTE)}</p>` : ''}
        ${t.images.length ? `<div class="jt-figs">${t.images.map((x) => `<figure class="jt-fig"><img src="${esc(x.src)}" alt="${esc(x.alt)}" loading="lazy" decoding="async"><figcaption>${esc(x.alt)}</figcaption></figure>`).join('')}</div>` : ''}
        ${blocks.map(([h, html]) => `<section class="jt-block"><h4>${h}</h4>${html}</section>`).join('\n        ')}
        ${relFaqs.length ? `<p class="jt-related">関連するよくある質問：${relFaqs.map((f) => `<a href="#faq-${f.id}">${esc(f.q)}</a>`).join(' ／ ')}</p>` : ''}
        <p class="jt-updated">最終更新：${jaDate(t.updated)}</p>
      </article>`;
}

function faqHtml(f) {
  const cats = [...new Set(f.related.map((r) => tools.find((t) => t.id === r)?.cat).filter(Boolean))];
  const relTools = f.related.map((r) => tools.find((t) => t.id === r)).filter(Boolean);
  return `
      <details class="jt-faq" id="faq-${f.id}" data-cat="${[...cats, ...new Set(f.related.flatMap(setsOf))].join(' ')}" data-search="${searchText(f.q, f.a, f.keywords, relTools.map((t) => [t.name, t.reading, t.keywords]))}">
        <summary><h3>${esc(f.q)}</h3></summary>
        <div class="jt-faq-a">
          <p>${esc(f.a)}</p>
          ${relTools.length ? `<p class="jt-related">関連する道具：${relTools.map((t) => `<a href="#${t.id}">${esc(t.name)}</a>`).join(' ／ ')}</p>` : ''}
          <p class="jt-updated">最終更新：${jaDate(f.updated)}</p>
        </div>
      </details>`;
}

const usedCats = categories.filter((c) => tools.some((t) => t.cat === c.id));
const toolNames = tools.map((t) => t.name).join('・');
const title = '茶道 実用辞典｜選び方・使い方・手入れ・よくあるトラブル｜徳増茶道具専門店';
const desc = `抹茶と、茶碗・茶筅・棗・釜など茶道で使うもの${tools.length}種の用途、選び方の目安、使い方、手入れ・保管、カビや錆などのよくあるトラブルと対処を、茶道具専門店がまとめた茶道の実用辞典です。`;

const jsonLd = [
  {
    '@context': 'https://schema.org', '@type': 'FAQPage', '@id': `${PAGE_URL}#faq`, url: PAGE_URL,
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  },
  {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ホーム', item: `${SITE}/tokumasu_homepage.html` },
      { '@type': 'ListItem', position: 2, name: '茶道 実用辞典', item: PAGE_URL },
    ],
  },
];

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<!-- このファイルは scripts/build-sadogu-jiten.mjs が自動で作ります。直接編集しないでください（本文は sadogu-jiten-data/ を編集）。 -->
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-L4QHGRGLLR"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', 'G-L4QHGRGLLR');
</script>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${PAGE_URL}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${PAGE_URL}">
<meta property="og:site_name" content="徳増茶道具専門店 Tokumasu">
<meta property="og:locale" content="ja_JP">
<meta property="og:image" content="${SITE}/ogp-tokumasu.jpg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:image" content="${SITE}/ogp-tokumasu.jpg">
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%230d0d0d'/%3E%3Ctext x='32' y='46' font-family='Georgia%2Cserif' font-size='38' font-weight='400' text-anchor='middle' fill='%23c8a96e'%3ET%3C/text%3E%3C/svg%3E">
<meta name="theme-color" content="#0d0d0d">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500&family=Noto+Serif+JP:wght@300;400&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify(jsonLd, null, 2).replace(/</g, '\\u003c')}
</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{--black:#0d0d0d;--gold:#c8a96e;--gold-light:#e8d5a3;--cream:#f5f0e8;--text:#1a1a1a;--muted:#6b6b6b;--border:#d4c9b0}
html{scroll-behavior:smooth;scroll-padding-top:150px}
body{font-family:'Noto Sans JP',sans-serif;color:var(--text);background:#fff;overflow-x:hidden}
nav{position:fixed;top:0;left:0;right:0;z-index:1000;background:rgba(13,13,13,0.96);backdrop-filter:blur(8px)}
.nav-inner{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;height:64px}
.nav-logo{display:flex;flex-direction:column;align-items:flex-start;gap:2px;text-decoration:none}
.nav-logo-en{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:300;color:#fff;letter-spacing:0.12em}
.nav-logo-since{font-size:9px;letter-spacing:0.2em;color:var(--gold)}
.nav-links{display:flex;gap:28px;list-style:none}
.nav-links a{color:rgba(255,255,255,0.7);text-decoration:none;font-size:12px;letter-spacing:0.1em;transition:color 0.2s}
.nav-links a:hover{color:var(--gold)}
.nav-cta{background:var(--gold);color:var(--black);padding:8px 20px;font-size:11px;letter-spacing:0.15em;text-decoration:none;transition:background 0.2s}
.nav-cta:hover{background:var(--gold-light)}
.hamburger{display:none;flex-direction:column;justify-content:center;gap:5px;cursor:pointer;padding:8px;background:none;border:none}
.hamburger span{display:block;width:22px;height:1.5px;background:#fff;transition:all 0.3s}
.hamburger.open span:nth-child(1){transform:translateY(6.5px) rotate(45deg)}
.hamburger.open span:nth-child(2){opacity:0}
.hamburger.open span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg)}
.mobile-menu{display:none;position:fixed;top:64px;left:0;right:0;bottom:0;background:rgba(10,10,10,0.98);z-index:999;flex-direction:column;padding:40px 32px;overflow-y:auto}
.mobile-menu.open{display:flex}
.mobile-menu a{color:rgba(255,255,255,0.8);text-decoration:none;font-size:18px;font-family:'Noto Serif JP',serif;font-weight:300;padding:18px 0;border-bottom:1px solid rgba(255,255,255,0.08);letter-spacing:0.1em;transition:color 0.2s}
.mobile-menu a:hover{color:var(--gold)}
.mobile-menu-cta{margin-top:32px;background:var(--gold) !important;color:var(--black) !important;padding:16px 32px;text-align:center;border-bottom:none !important;font-family:'Noto Sans JP',sans-serif !important;font-size:13px !important;letter-spacing:0.2em !important;border-radius:0}
.breadcrumb{background:var(--black);padding:96px 24px 20px;text-align:center}
.breadcrumb a{color:rgba(255,255,255,0.5);text-decoration:none;font-size:11px;letter-spacing:0.1em;transition:color 0.2s}
.breadcrumb a:hover{color:var(--gold)}
.breadcrumb span{color:rgba(255,255,255,0.25);margin:0 8px;font-size:11px}
.cat-hero{background:var(--black);padding:24px 24px 56px;text-align:center}
.cat-hero-label{font-size:9px;letter-spacing:0.38em;color:var(--gold);display:block;margin-bottom:16px}
.cat-hero-title{font-family:'Noto Serif JP',serif;font-weight:300;font-size:clamp(26px,3.6vw,40px);color:#fff;letter-spacing:0.08em;line-height:1.6}
.cat-hero-lead{font-size:13px;color:rgba(255,255,255,0.6);line-height:2.1;margin-top:20px}
.cat-hero-line{width:40px;height:1px;background:var(--gold);margin:24px auto 0}
section.jt-sec{padding:72px 24px}
.section-inner{max-width:960px;margin:0 auto}
.section-label{font-size:9px;letter-spacing:0.38em;color:var(--gold);display:block;margin-bottom:12px}
.section-title{font-family:'Noto Serif JP',serif;font-weight:300;font-size:clamp(22px,2.6vw,34px);line-height:1.55;margin-bottom:24px}
/* 辞典 */
.jt-intro{background:var(--cream)}
.jt-notes{list-style:none;font-size:13px;color:var(--muted);line-height:2}
.jt-notes li{padding-left:1.2em;text-indent:-1.2em}
.jt-notes li::before{content:'・'}
.jt-tools{position:sticky;top:64px;z-index:50;background:rgba(255,255,255,0.97);border-bottom:1px solid var(--border);padding:14px 24px}
.jt-tools-inner{max-width:960px;margin:0 auto}
.jt-search{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid var(--border);background:#fff;color:var(--text);border-radius:0;-webkit-appearance:none}
.jt-search:focus{outline:none;border-color:var(--gold)}
.jt-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
@media(max-width:600px){.jt-tools{position:static}html{scroll-padding-top:80px}}
.jt-chip{flex:none;font:inherit;font-size:12px;letter-spacing:0.06em;padding:7px 14px;border:1px solid var(--border);background:#fff;color:var(--muted);cursor:pointer;border-radius:0}
.jt-chip:hover{border-color:var(--gold);color:var(--text)}
.jt-chip[aria-pressed="true"]{background:var(--black);border-color:var(--black);color:var(--gold)}
.jt-count{font-size:11px;color:var(--muted);margin-top:8px;letter-spacing:0.06em}
.jt-panels{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:8px}
.jt-panel{border:1px solid var(--border);background:#fff;padding:24px}
.jt-panel h2{font-family:'Noto Serif JP',serif;font-weight:400;font-size:16px;margin-bottom:14px;letter-spacing:0.06em}
.jt-recent{list-style:none}
.jt-recent li{padding:8px 0;border-bottom:1px solid #eee;font-size:13px;display:flex;justify-content:space-between;gap:12px}
.jt-recent li:last-child{border-bottom:none}
.jt-recent time{color:var(--muted);font-size:11px;flex:none}
.jt-panel a{color:var(--text);text-decoration:none;border-bottom:1px solid var(--border)}
.jt-panel a:hover{color:var(--gold);border-color:var(--gold)}
.jt-toc-cat{font-size:11px;color:var(--gold);letter-spacing:0.12em;margin:12px 0 4px}
.jt-toc-cat:first-of-type{margin-top:0}
.jt-toc-list{list-style:none;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:13px;line-height:1.9}
.jt-cat{margin-top:56px}
.jt-cat-head{border-bottom:1px solid var(--gold);padding-bottom:10px;margin-bottom:24px}
.jt-cat-head .section-label{margin-bottom:6px}
.jt-cat-head h2{font-family:'Noto Serif JP',serif;font-weight:300;font-size:clamp(20px,2.4vw,28px);letter-spacing:0.06em}
.jt-item{border:1px solid var(--border);background:#fff;padding:28px;margin-bottom:24px}
.jt-item-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.jt-item-title{font-family:'Noto Serif JP',serif;font-weight:400;font-size:22px;letter-spacing:0.06em}
.jt-item-reading{font-family:'Noto Sans JP',sans-serif;font-size:12px;color:var(--muted);margin-left:12px;letter-spacing:0.08em;font-weight:300}
.jt-item-cat{font-size:10px;letter-spacing:0.16em;color:var(--gold)}
.jt-school{font-size:12px;line-height:1.9;color:#7a5f2c;background:#faf6ec;border-left:2px solid var(--gold);padding:8px 12px;margin-bottom:16px}
.jt-block{margin-top:16px}
.jt-block h4{font-size:12px;font-weight:500;letter-spacing:0.14em;color:var(--text);margin-bottom:6px;padding-left:10px;border-left:2px solid var(--gold);line-height:1.4}
.jt-list{list-style:none;font-size:14px;line-height:1.9;color:#333}
.jt-list li{padding-left:1.1em;position:relative}
.jt-list li::before{content:'';position:absolute;left:0.2em;top:0.85em;width:5px;height:5px;background:var(--gold);border-radius:50%}
.jt-trouble div{padding:8px 0;border-bottom:1px dashed #e5ddc9}
.jt-trouble div:last-child{border-bottom:none}
.jt-trouble dt{font-size:14px;font-weight:500;line-height:1.8}
.jt-trouble dt::before{content:'Q. ';color:var(--gold)}
.jt-trouble dd{font-size:14px;line-height:1.9;color:#333;padding-left:1.6em}
.jt-figs{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin:4px 0 8px}
.jt-fig img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border:1px solid var(--border);background:#faf6ec}
.jt-fig figcaption{font-size:12px;color:var(--muted);line-height:1.7;margin-top:6px}
.jt-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border)}
.jt-table{width:100%;min-width:640px;border-collapse:collapse;font-size:13px;line-height:1.75;color:#333}
.jt-table th,.jt-table td{padding:8px 10px;border-bottom:1px solid #e5ddc9;text-align:left;vertical-align:top}
.jt-table thead th{background:#faf6ec;font-weight:500;font-size:12px;letter-spacing:0.08em;white-space:nowrap}
.jt-table tbody th{font-weight:500;white-space:nowrap;background:#fdfbf6}
.jt-table td:nth-child(2){white-space:nowrap}
.jt-table tbody tr:last-child th,.jt-table tbody tr:last-child td{border-bottom:none}
@media(max-width:600px){
.jt-table-wrap{border:none;overflow:visible}
.jt-table{min-width:0}
.jt-table thead{display:none}
.jt-table,.jt-table tbody,.jt-table tr,.jt-table th,.jt-table td{display:block;width:100%}
.jt-table tr{border:1px solid var(--border);margin-bottom:10px;background:#fff}
.jt-table tbody th{background:#faf6ec;border-bottom:1px solid #e5ddc9;font-size:14px}
.jt-table td{border-bottom:1px dashed #e5ddc9;white-space:normal!important}
.jt-table tbody tr td:last-child{border-bottom:none}
.jt-table td::before{content:attr(data-label);display:block;font-size:11px;letter-spacing:0.1em;color:var(--gold)}
}
.jt-table-notes{list-style:none;font-size:12px;color:var(--muted);line-height:1.8;margin-top:6px}
.jt-related{font-size:12px;color:var(--muted);margin-top:16px;line-height:1.9}
.jt-related a{color:var(--muted);text-decoration:underline;text-decoration-color:var(--border)}
.jt-related a:hover{color:var(--gold)}
.jt-updated{font-size:11px;color:var(--muted);text-align:right;margin-top:14px;letter-spacing:0.06em}
.jt-faq-sec{background:var(--cream)}
.jt-faq{background:#fff;border:1px solid var(--border);margin-bottom:12px}
.jt-faq summary{cursor:pointer;list-style:none;padding:18px 48px 18px 20px;position:relative}
.jt-faq summary::-webkit-details-marker{display:none}
.jt-faq summary::after{content:'+';position:absolute;right:20px;top:50%;transform:translateY(-50%);color:var(--gold);font-size:20px}
.jt-faq[open] summary::after{content:'−'}
.jt-faq summary h3{font-family:'Noto Serif JP',serif;font-weight:400;font-size:15px;line-height:1.7}
.jt-faq summary h3::before{content:'Q. ';color:var(--gold)}
.jt-faq-a{padding:0 20px 18px;font-size:14px;line-height:2;color:#333}
.jt-chip-set{border-color:var(--gold);color:#7a5f2c}
.jt-set{border:1px solid var(--gold);background:#fffdf8;padding:28px;margin-top:32px}
.jt-set h2{font-family:'Noto Serif JP',serif;font-weight:400;font-size:clamp(18px,2.2vw,24px);letter-spacing:0.06em;margin-bottom:8px}
.jt-set-target{font-size:13px;color:var(--muted);font-family:'Noto Sans JP',sans-serif;font-weight:300;letter-spacing:0.04em}
.jt-set-desc{font-size:14px;color:#333;line-height:1.9;margin-bottom:12px}
.jt-set-list{list-style:none;border-top:1px solid #eee}
.jt-set-list li{display:grid;grid-template-columns:13em 1fr;gap:4px 16px;padding:10px 0;border-bottom:1px solid #eee;font-size:14px;line-height:1.8}
.jt-set-name{color:var(--text);font-weight:500;text-decoration:none;border-bottom:1px solid var(--border);justify-self:start}
.jt-set-name:hover{color:var(--gold);border-color:var(--gold)}
.jt-set-reason{color:#333}
.jt-set-sub{grid-column:2;font-size:12px;color:var(--muted)}
.jt-set-sub a{color:var(--muted)}
.jt-set-more{margin-top:14px;text-align:right}
.jt-set-filter{font:inherit;font-size:12px;letter-spacing:0.06em;background:none;border:none;border-bottom:1px solid var(--border);color:var(--muted);cursor:pointer;padding:0 0 2px}
.jt-set-filter:hover{color:var(--gold);border-color:var(--gold)}
@media(max-width:600px){.jt-set{padding:20px 16px}.jt-set-list li{grid-template-columns:1fr}.jt-set-sub{grid-column:1}}
.jt-empty{display:none;text-align:center;color:var(--muted);font-size:14px;padding:40px 0}
.jt-shop{text-align:center;padding:56px 24px;border-top:1px solid var(--border)}
.jt-shop p{font-size:13px;color:var(--muted);line-height:2;margin-bottom:20px}
.jt-shop-btn{display:inline-block;background:var(--gold);color:var(--black);padding:15px 36px;font-size:12px;letter-spacing:0.16em;text-decoration:none;transition:background 0.2s}
.jt-shop-btn:hover{background:var(--gold-light)}
.is-hidden{display:none !important}
footer{background:#070707;padding:72px 24px 32px}
.footer-inner{max-width:1200px;margin:0 auto}
.footer-top{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;padding-bottom:52px;border-bottom:1px solid rgba(255,255,255,0.07)}
.footer-brand-logo{font-family:'Cormorant Garamond',serif;font-size:26px;font-weight:300;color:#fff;letter-spacing:0.12em;display:block}
.footer-brand-since{font-size:9px;letter-spacing:0.2em;color:var(--gold);margin:6px 0 18px;display:block}
.footer-col h4{font-size:9px;letter-spacing:0.3em;color:var(--gold);margin-bottom:18px}
.footer-col ul{list-style:none}
.footer-col ul li{margin-bottom:10px}
.footer-col ul li a{font-size:12px;color:rgba(255,255,255,0.45);text-decoration:none;transition:color 0.2s}
.footer-col ul li a:hover{color:var(--gold)}
.footer-bottom{margin-top:32px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}
.footer-copy{font-size:11px;color:rgba(255,255,255,0.2);letter-spacing:0.08em}
.footer-wordmark{font-family:'Cormorant Garamond',serif;font-size:20px;color:rgba(255,255,255,0.1);letter-spacing:0.2em}
@media(max-width:960px){
  .footer-top{grid-template-columns:1fr 1fr}
  .footer-brand{grid-column:1/-1}
}
@media(max-width:768px){
  .nav-links,.nav-cta{display:none}
  .hamburger{display:flex}
  section.jt-sec{padding:48px 16px}
  .breadcrumb{padding:84px 16px 16px}
  .jt-tools{padding:10px 16px}
  .jt-panels{grid-template-columns:1fr;gap:16px}
  .jt-item{padding:20px 16px}
  .jt-item-title{font-size:19px}
}
@media(max-width:480px){
  .footer-top{grid-template-columns:1fr}
}
</style>
</head>
<body>

<nav>
  <div class="nav-inner">
    <a href="/tokumasu_homepage.html" class="nav-logo">
      <span class="nav-logo-en">Tokumasu</span>
      <span class="nav-logo-since">Tea Ceremony · Since 1957</span>
    </a>
    <ul class="nav-links">
      <li><a href="/tokumasu_homepage.html#about">私たちについて</a></li>
      <li><a href="/tokumasu_homepage.html#story">ブランドへの想い</a></li>
      <li><a href="/tokumasu_homepage.html#shops">ショップ</a></li>
      <li><a href="/shop.html">オンラインショップ</a></li>
      <li><a href="/tokumasu_homepage.html#contact">お問い合わせ</a></li>
      <li><a href="/blog/">ブログ</a></li>
    </ul>
    <a href="/shop.html" class="nav-cta">Shop Now</a>
    <button class="hamburger" onclick="toggleMenu()" aria-label="メニュー">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<div class="mobile-menu" id="mobileMenu">
  <a href="/tokumasu_homepage.html#about" onclick="closeMenu()">私たちについて</a>
  <a href="/tokumasu_homepage.html#story" onclick="closeMenu()">ブランドへの想い</a>
  <a href="/tokumasu_homepage.html#shops" onclick="closeMenu()">ショップ一覧</a>
  <a href="/shop.html" onclick="closeMenu()">オンラインショップ</a>
  <a href="/tokumasu_homepage.html#contact" onclick="closeMenu()">お問い合わせ</a>
  <a href="/blog/" onclick="closeMenu()">ブログ</a>
  <a href="/shop.html" class="mobile-menu-cta" onclick="closeMenu()">商品を見る →</a>
</div>

<div class="breadcrumb">
  <a href="/tokumasu_homepage.html">ホーム</a><span>›</span><span style="color:rgba(255,255,255,0.85);margin:0">茶道 実用辞典</span>
</div>

<div class="cat-hero">
  <span class="cat-hero-label">TEA CEREMONY GUIDE</span>
  <h1 class="cat-hero-title">茶道 実用辞典</h1>
  <p class="cat-hero-lead">道具の用途・選び方の目安・使い方・手入れ、<br>よくあるトラブルの対処をまとめました。</p>
  <div class="cat-hero-line"></div>
</div>

<section class="jt-sec jt-intro">
  <div class="section-inner">
    <ul class="jt-notes">
      <li>数値は、出典の考え方にもとづく目安です。道具や作り手によって異なります。</li>
      <li>流派・社中によって異なる点は、項目内に注意書きを入れています。お稽古先の先生にご確認ください。</li>
      <li>在庫・価格は各商品ページでご確認ください。</li>
    </ul>
    <p class="jt-count" style="margin-top:16px">掲載 ${tools.length}項目・よくある質問 ${faqs.length}件 ／ 最終更新：${lastUpdated ? jaDate(lastUpdated) : ''}</p>
  </div>
</section>

<div class="jt-tools" role="search">
  <div class="jt-tools-inner">
    <input type="search" class="jt-search" id="jtSearch" placeholder="道具名や症状で探す（例：抹茶、茶筅、カビ、錆）" aria-label="辞典を検索" autocomplete="off">
    <div class="jt-chips" id="jtChips">
      <button type="button" class="jt-chip" data-cat="" aria-pressed="true">すべて</button>
      ${[...usedCats.slice(0, 1).map(catChip), ...sets.map(setChip), ...usedCats.slice(1).map(catChip)].join('\n      ')}
    </div>
    <p class="jt-count" id="jtCount" aria-live="polite"></p>
  </div>
</div>

<section class="jt-sec">
  <div class="section-inner">
    <div class="jt-panels">
      <div class="jt-panel">
        <h2>新しく追加・更新した項目</h2>
        <ul class="jt-recent">
          ${recent.map((t) => `<li><a href="#${t.id}" class="jt-jump">${esc(t.name)}</a><time datetime="${t.updated}">${jaDate(t.updated)}</time></li>`).join('\n          ')}
        </ul>
      </div>
      <div class="jt-panel" role="navigation" aria-label="目次">
        <h2>目次</h2>
        ${usedCats.slice(0, 1).map(tocCat).join('')}
        ${sets.length ? `<p class="jt-toc-cat">目的別にそろえる</p>
        <ul class="jt-toc-list">${sets.map((st) => `<li><a href="#${st.key}" class="jt-jump">${esc(st.name)}${st.target ? `（${esc(st.target)}）` : ''}</a></li>`).join('')}</ul>` : ''}
        ${usedCats.slice(1).map(tocCat).join('\n        ')}
        <p class="jt-toc-cat">よくある質問</p>
        <ul class="jt-toc-list"><li><a href="#faq" class="jt-jump">よくある質問（${faqs.length}件）</a></li></ul>
      </div>
    </div>

    ${sets.map((st) => `
    <section class="jt-set" id="${st.key}" data-set="${st.key}">
      <span class="section-label">${esc(st.en)}</span>
      <h2>${esc(st.name)}${st.target ? `<span class="jt-set-target">（${esc(st.target)}）</span>` : ''}</h2>
      ${st.desc ? `<p class="jt-set-desc">${esc(st.desc)}</p>` : ''}
      ${st.note ? `<p class="jt-school">※ ${esc(st.note)}</p>` : ''}
      <ul class="jt-set-list">
        ${st.items.map((x) => {
          const ts = x.ids.map((id) => tools.find((t) => t.id === id));
          const label = x.label || ts.map((t) => t.name).join('・');
          const sub = ts.length > 1 ? `<span class="jt-set-sub">${ts.map((t) => `<a href="#${t.id}" class="jt-jump">${esc(t.name)}</a>`).join('／')}</span>` : '';
          return `<li><a href="#${ts[0].id}" class="jt-jump jt-set-name">${esc(label)}</a><span class="jt-set-reason">${esc(x.reason)}</span>${sub}</li>`;
        }).join('\n        ')}
      </ul>
      <p class="jt-set-more"><button type="button" class="jt-set-filter" data-cat="${st.key}">この道具だけを下に表示する</button></p>
    </section>`).join('\n')}

    ${usedCats.map((c) => `
    <div class="jt-cat" data-cat-group="${c.id}">
      <div class="jt-cat-head">
        <span class="section-label">${esc(c['英語'] || '')}</span>
        <h2>${esc(c['名前'])}</h2>
      </div>
      ${tools.filter((t) => t.cat === c.id).map(toolHtml).join('\n')}
    </div>`).join('\n')}

    <p class="jt-empty" id="jtEmptyTools">該当する道具が見つかりませんでした。言葉を変えてお試しください。</p>
  </div>
</section>

<section class="jt-sec jt-faq-sec" id="faq">
  <div class="section-inner">
    <span class="section-label">FAQ</span>
    <h2 class="section-title">よくある質問</h2>
    ${faqs.map(faqHtml).join('\n')}
    <p class="jt-empty" id="jtEmptyFaq">該当する質問が見つかりませんでした。</p>
  </div>
</section>

<div class="jt-shop">
  <p>道具の在庫・価格は、公式オンラインショップの各商品ページでご確認ください。</p>
  <a href="/shop.html" class="jt-shop-btn">公式オンラインショップへ</a>
</div>

<footer>
  <div class="footer-inner">
    <div class="footer-top">
      <div class="footer-brand">
        <span class="footer-brand-logo">Tokumasu</span>
        <span class="footer-brand-since">Tea Ceremony · Since 1957</span>
      </div>
      <div class="footer-col">
        <h4>GUIDE</h4>
        <ul>
          <li><a href="/sadogu-jiten/">茶道 実用辞典</a></li>
          <li><a href="/blog/">ブログ</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>SHOP</h4>
        <ul>
          <li><a href="/shop.html">公式オンラインショップ</a></li>
          <li><a href="https://www.rakuten.co.jp/auc-tokumasu/" target="_blank" rel="noopener">楽天市場店</a></li>
          <li><a href="https://tokumasu.ocnk.net/" target="_blank" rel="noopener">おちゃのこネット店</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>COMPANY</h4>
        <ul>
          <li><a href="/tokumasu_homepage.html#about">私たちについて</a></li>
          <li><a href="/tokumasu_homepage.html#contact">お問い合わせ</a></li>
          <li><a href="/tokumasu_tokushoho.html">特定商取引法に基づく表記</a></li>
          <li><a href="/tokumasu_privacypolicy.html">プライバシーポリシー</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span class="footer-copy">© 2025 合同会社徳増 / 徳増茶道具専門店. All rights reserved.</span>
      <span class="footer-wordmark">Tokumasu</span>
    </div>
  </div>
</footer>

<script>
function toggleMenu(){
  var m=document.getElementById('mobileMenu');
  var b=document.querySelector('.hamburger');
  m.classList.toggle('open');
  b.classList.toggle('open');
  document.body.style.overflow=m.classList.contains('open')?'hidden':'';
}
function closeMenu(){
  var m=document.getElementById('mobileMenu');
  var b=document.querySelector('.hamburger');
  m.classList.remove('open');
  b.classList.remove('open');
  document.body.style.overflow='';
}
document.addEventListener('click',function(e){
  var m=document.getElementById('mobileMenu');
  if(m.classList.contains('open')&&!m.contains(e.target)&&!e.target.closest('.hamburger')){closeMenu();}
});

// 検索・カテゴリ絞り込み（ページ内のデータから自動で動きます）
(function(){
  var input=document.getElementById('jtSearch');
  var chips=[].slice.call(document.querySelectorAll('.jt-chip'));
  var items=[].slice.call(document.querySelectorAll('.jt-item'));
  var faqs=[].slice.call(document.querySelectorAll('.jt-faq'));
  var groups=[].slice.call(document.querySelectorAll('[data-cat-group]'));
  var count=document.getElementById('jtCount');
  var cat='';
  var setCards=[].slice.call(document.querySelectorAll('.jt-set'));
  function norm(s){
    return (s||'').normalize('NFKC').toLowerCase()
      .replace(/[\\u30a1-\\u30f6]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-0x60);})
      .replace(/\\s+/g,' ');
  }
  items.concat(faqs).forEach(function(el){el._s=norm(el.getAttribute('data-search'));});
  function apply(){
    var words=norm(input.value).trim().split(' ').filter(Boolean);
    function hit(el){
      if(cat&&(' '+el.getAttribute('data-cat')+' ').indexOf(' '+cat+' ')<0)return false;
      return words.every(function(w){return el._s.indexOf(w)>=0;});
    }
    var nTool=0,nFaq=0;
    items.forEach(function(el){var ok=hit(el);el.classList.toggle('is-hidden',!ok);if(ok)nTool++;});
    faqs.forEach(function(el){var ok=hit(el);el.classList.toggle('is-hidden',!ok);if(ok)nFaq++;if(ok&&words.length)el.open=true;});
    setCards.forEach(function(c){c.classList.toggle('is-hidden',words.length>0||(cat!==''&&cat!==c.getAttribute('data-set')));});
    groups.forEach(function(g){g.classList.toggle('is-hidden',!g.querySelector('.jt-item:not(.is-hidden)'));});
    document.getElementById('jtEmptyTools').style.display=nTool?'none':'block';
    document.getElementById('jtEmptyFaq').style.display=nFaq?'none':'block';
    count.textContent=(words.length||cat)?('道具 '+nTool+'件・よくある質問 '+nFaq+'件が見つかりました'):'';
  }
  input.addEventListener('input',apply);
  function setCat(v){
    cat=v;
    chips.forEach(function(x){x.setAttribute('aria-pressed',x.getAttribute('data-cat')===v?'true':'false');});
    apply();
  }
  chips.forEach(function(b){b.addEventListener('click',function(){setCat(b.getAttribute('data-cat'));});});
  document.querySelectorAll('.jt-set-filter').forEach(function(b){
    b.addEventListener('click',function(){input.value='';setCat(b.getAttribute('data-cat'));var c=document.getElementById(b.getAttribute('data-cat'));if(c)c.scrollIntoView();});
  });
  // 目次・新着から飛ぶときは絞り込みを解除して必ず表示する
  document.querySelectorAll('.jt-jump, .jt-related a').forEach(function(a){
    a.addEventListener('click',function(){
      var t=document.querySelector(a.getAttribute('href'));
      if(t&&t.classList.contains('is-hidden')){input.value='';setCat('');}
      if(t&&t.tagName==='DETAILS')t.open=true;
    });
  });
  var q=new URLSearchParams(location.search).get('q');
  if(q){input.value=q;apply();}
  if(location.hash){var h=document.querySelector(location.hash);if(h&&h.tagName==='DETAILS')h.open=true;}
})();
</script>
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, html);
console.log(`✔ 辞典ページを更新しました：道具 ${tools.length}項目・よくある質問 ${faqs.length}件・目的別 ${sets.length}区分`);
console.log(`  新しく追加・更新した項目：${recent.map((t) => t.name).join('、')}`);
console.log(`  出力先：${path.relative(ROOT, OUT)}`);
