/**
 * Homepage template — lists all published pages.
 * Each entry renders with the same article-header layout as the page view.
 */

import { esc } from "../../../lib/escape.js";

export interface PageListItem {
  slug: string;
  title: string;
  description: string | null;
  date?: string | null;
  tags?: string[];
}

/**
 * Render the homepage body — a list of all published pages.
 * Each entry uses the same article-header structure as pageView.
 * Returns an HTML string suitable for embedding inside layout().body.
 */
export function homeView(pages: PageListItem[]): string {
  if (pages.length === 0) {
    return `<h1>Welcome</h1>\n<p class="empty-state">No published pages yet.</p>`;
  }

  const items = pages
    .map((p) => {
      const desc = p.description
        ? `<p class="article-description">${esc(p.description)}</p>`
        : "";

      const dateLine = p.date
        ? `<time datetime="${esc(p.date)}">${esc(p.date)}</time>`
        : "";

      const tagList =
        p.tags && p.tags.length > 0
          ? `<ul class="tags">${p.tags.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`
          : "";

      const metaLine =
        dateLine || tagList
          ? `<div class="article-meta">${dateLine}${tagList}</div>`
          : "";

      return `<li class="entry-card">
    <article>
      <header class="article-header">
        <h2 class="entry-card__title"><a href="/${esc(p.slug)}">${esc(p.title)}</a></h2>
        ${desc}
        ${metaLine}
      </header>
    </article>
  </li>`;
    })
    .join("\n");

  return `<div class="home-layout">
  <aside class="home-sidebar">
    <h2 class="sidebar-heading">Journal Entries</h2>
    <ul class="entry-list entry-list--mobile-only">
      ${items}
    </ul>
  </aside>
  <section class="editors-note">
    <h2 class="editors-note__title">A Note from the Editors</h2>
    <div class="editors-note__body">
      <p>The Williams Radar Journal exists for one kind of investor: the patient one.</p>
      <p>Not the trader watching every tick. Not the pundit explaining last week's move. Not the newsletter selling conviction it doesn't have.</p>
      <p>The patient investor. The one who understands that wealth — real, durable wealth — is built over time, not over a quarter. The one who knows that the market rewards discipline more than intelligence, and honesty more than confidence.</p>
      <p>We are here to help that investor extend their Wealthspan.</p>
      <p>Not by telling them what to buy. Not by pretending we know where the market goes next. But by giving them something rare in this industry: a model that looks at the same data every week, applies the same rules every week, and publishes the results every week — before the move, not after.</p>
      <p>No black boxes. No gurus. No stories retrofitted to the price action.</p>
      <p>The Williams Radar is a technical signal system built on Bill Williams' Awesome Oscillator and Accelerator Oscillator. It scans 254 tickers across 13 sectors. It identifies two configurations: S1 (early momentum building) and S2 (full confirmation — the entry signal). That is the entire model. No hidden layers. No proprietary secret.</p>
      <p>What makes it useful is not the model. It is the discipline of applying it consistently, publishing the record publicly, and letting time be the judge.</p>
      <p>Every ticker we name, every signal we flag, every entry candidate we identify — it goes into the record. When the next edition arrives, we report what happened. No edits. No omissions. The record is the product.</p>
      <p>If a signal fails, we say so.<br>If the model is wrong, we say so.<br>If the market does something the model didn't see coming, we say so.</p>
      <p>That is the deal.</p>
      <p>We are not for everyone. We are for the investor who values reason over noise, honesty over performance theater, and long-term compounding over short-term excitement.</p>
      <p>If that is you — welcome. This is your radar.</p>
      <p class="editors-note__signature">— The Williams Radar Team</p>
    </div>
  </section>
</div>`;
}
