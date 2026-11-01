/**
 * js/charts.js — thin wrapper around Chart.js (loaded from a CDN in index.html).
 * Every chart card has a <canvas> and a .chart-empty message. If there is no
 * real data (or Chart.js failed to load) the message is shown instead of a
 * dummy chart.
 * (Restyle: only colours changed so charts read well on the light theme and
 *  follow the dark theme; data/logic is identical.)
 */
(function () {
  'use strict';
  const CX = (window.CX = window.CX || {});
  const instances = new Map();
  const COLORS = ['#4f46e5', '#14b8a6', '#f59e0b', '#ef4444', '#7c3aed', '#0ea5e9'];

  /** Reads a CSS variable from :root so charts follow the light/dark theme. */
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function empty(card, message) {
    const body = card.querySelector('.chart-body');
    const old = instances.get(card.id);
    if (old) { old.destroy(); instances.delete(card.id); }
    body.classList.add('is-empty');
    if (message) body.querySelector('.chart-empty').textContent = message;
  }

  /** type: 'line' | 'bar'; datasets: [{label, data, color?}] ; opts.horizontal, opts.reverseRank */
  function draw(cardId, type, labels, datasets, opts = {}) {
    const card = document.getElementById(cardId);
    if (!card) return;
    if (!labels.length || !datasets.length) { empty(card, opts.emptyMessage || 'No records available for this selection.'); return; }
    if (typeof window.Chart === 'undefined') { empty(card, 'Charts could not load (Chart.js is unavailable offline).'); return; }
    const body = card.querySelector('.chart-body');
    body.classList.remove('is-empty');
    const old = instances.get(cardId);
    if (old) old.destroy();
    const muted = cssVar('--mu', '#596083');
    const text = cssVar('--tx', '#151a3a');
    const lineColor = cssVar('--ln', '#e5e8f6');
    const rankAxis = { reverse: opts.reverseRank !== false, title: { display: true, text: 'Rank (lower is better)', color: muted }, ticks: { color: muted }, grid: { color: lineColor } };
    const catAxis = { ticks: { color: muted }, grid: { color: lineColor } };
    const horizontal = !!opts.horizontal;
    const reduce = CX.utils.reducedMotion();
    const chart = new window.Chart(card.querySelector('canvas'), {
      type,
      data: {
        labels,
        datasets: datasets.map((d, i) => ({
          label: d.label, data: d.data, borderColor: d.color || COLORS[i % COLORS.length], backgroundColor: (d.color || COLORS[i % COLORS.length]) + (type === 'bar' ? 'cc' : '33'),
          tension: 0.3, spanGaps: true, pointRadius: 4, borderWidth: 2,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: reduce ? false : { duration: 500 },
        indexAxis: horizontal ? 'y' : 'x',
        plugins: { legend: { labels: { color: text }, display: datasets.length > 1 || type === 'bar' }, tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + (c.parsed[horizontal ? 'x' : 'y'] ?? 'n/a').toLocaleString('en-IN') } } },
        scales: horizontal ? { x: { ...rankAxis, reverse: false }, y: catAxis } : { x: catAxis, y: rankAxis },
      },
    });
    instances.set(cardId, chart);
  }
  CX.charts = { draw, empty };
})();
