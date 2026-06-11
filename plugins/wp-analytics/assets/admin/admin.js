/**
 * Klyna Analytics admin dashboard.
 *
 * No build step — vanilla JS that talks to the REST endpoints registered by
 * Rest::register_routes(). Renders the totals, top pages/referrers/events
 * tables, and the views-over-time chart on a <canvas> (no chart library).
 */
(function () {
  'use strict';

  var cfg = window.KlynaAnalyticsAdmin || {};
  var app = document.getElementById('klyna-analytics-app');
  if (!app || !cfg.apiBase) {
    return;
  }

  var rangeSelect = document.getElementById('klyna-an-range');
  var canvas = document.getElementById('klyna-an-chart');

  function fmt(n) {
    try {
      return new Intl.NumberFormat().format(n);
    } catch (e) {
      return String(n);
    }
  }

  function api(path) {
    return wp.apiFetch({
      url: cfg.apiBase + path,
      headers: { 'X-WP-Nonce': cfg.nonce },
    });
  }

  function setText(id, value) {
    var el = document.getElementById(id);
    if (el) {
      el.textContent = value;
    }
  }

  function renderRows(tableId, rows, build) {
    var table = document.getElementById(tableId);
    if (!table) return;
    var body = table.querySelector('tbody');
    body.innerHTML = '';
    if (!rows || rows.length === 0) {
      var tr = document.createElement('tr');
      tr.className = 'klyna-an-empty';
      var td = document.createElement('td');
      td.textContent = 'No data in this range yet.';
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    var max = rows.reduce(function (m, r) {
      return Math.max(m, build.value(r));
    }, 0) || 1;
    rows.forEach(function (row) {
      var tr = document.createElement('tr');

      var label = document.createElement('td');
      label.className = 'klyna-an-cell-label';
      var bar = document.createElement('span');
      bar.className = 'klyna-an-bar';
      bar.style.width = Math.max(2, (build.value(row) / max) * 100) + '%';
      label.appendChild(bar);
      label.appendChild(build.label(row));

      var value = document.createElement('td');
      value.className = 'klyna-an-cell-value';
      value.textContent = fmt(build.value(row));

      tr.appendChild(label);
      tr.appendChild(value);
      body.appendChild(tr);
    });
  }

  function anchor(text, href) {
    var a = document.createElement('a');
    a.textContent = text;
    a.href = href;
    a.target = '_blank';
    a.rel = 'noreferrer';
    return a;
  }

  function loadStats(days) {
    api('/stats?days=' + days)
      .then(function (data) {
        setText('klyna-an-views', fmt(data.totals.views));
        setText('klyna-an-visitors', fmt(data.totals.visitors));
        var ratio = data.totals.visitors
          ? data.totals.views / data.totals.visitors
          : 0;
        setText('klyna-an-ratio', ratio.toFixed(1));

        renderRows('klyna-an-pages', data.top_pages, {
          value: function (r) {
            return r.views;
          },
          label: function (r) {
            return anchor(r.path, r.url);
          },
        });

        renderRows('klyna-an-referrers', data.top_referrers, {
          value: function (r) {
            return r.views;
          },
          label: function (r) {
            return anchor(r.host, 'https://' + r.host);
          },
        });

        renderRows('klyna-an-events', data.events, {
          value: function (r) {
            return r.hits;
          },
          label: function (r) {
            var span = document.createElement('span');
            span.textContent = r.event;
            return span;
          },
        });
      })
      .catch(showError);
  }

  function loadChart(days) {
    api('/stats/timeseries?days=' + days)
      .then(function (data) {
        drawChart(data.series || []);
      })
      .catch(showError);
  }

  function showError(err) {
    var msg = err && err.message ? err.message : String(err);
    var foot = app.querySelector('.klyna-an-foot');
    if (foot) {
      foot.textContent = 'Could not load analytics: ' + msg;
      foot.classList.add('klyna-an-error');
    }
  }

  /**
   * Draw the views-over-time area chart on the canvas. Handles HiDPI scaling
   * and redraws on resize. No external chart library.
   */
  var chartSeries = [];
  function drawChart(series) {
    chartSeries = series;
    if (!canvas || !canvas.getContext) {
      return;
    }
    var ctx = canvas.getContext('2d');
    var ratio = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || canvas.parentNode.clientWidth || 600;
    var cssH = 220;
    canvas.width = cssW * ratio;
    canvas.height = cssH * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    if (!series.length) {
      return;
    }

    var padL = 8;
    var padR = 8;
    var padT = 14;
    var padB = 22;
    var plotW = cssW - padL - padR;
    var plotH = cssH - padT - padB;

    var max = series.reduce(function (m, p) {
      return Math.max(m, p.views);
    }, 0) || 1;

    var stepX = series.length > 1 ? plotW / (series.length - 1) : 0;
    function x(i) {
      return padL + i * stepX;
    }
    function y(v) {
      return padT + plotH - (v / max) * plotH;
    }

    // Baseline.
    ctx.strokeStyle = '#2a2a35';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, padT + plotH);
    ctx.lineTo(padL + plotW, padT + plotH);
    ctx.stroke();

    // Area fill.
    ctx.beginPath();
    ctx.moveTo(x(0), padT + plotH);
    series.forEach(function (p, i) {
      ctx.lineTo(x(i), y(p.views));
    });
    ctx.lineTo(x(series.length - 1), padT + plotH);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, 'rgba(124,92,255,0.28)');
    grad.addColorStop(1, 'rgba(124,92,255,0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Line.
    ctx.beginPath();
    series.forEach(function (p, i) {
      var px = x(i);
      var py = y(p.views);
      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    });
    ctx.strokeStyle = '#7c5cff';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Endpoint dot.
    var last = series[series.length - 1];
    ctx.beginPath();
    ctx.arc(x(series.length - 1), y(last.views), 3, 0, Math.PI * 2);
    ctx.fillStyle = '#9277ff';
    ctx.fill();

    // First / last date labels.
    ctx.fillStyle = '#71717a';
    ctx.font = '11px -apple-system, system-ui, sans-serif';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillText(series[0].date, padL, cssH - 4);
    ctx.textAlign = 'right';
    ctx.fillText(last.date, padL + plotW, cssH - 4);
  }

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      drawChart(chartSeries);
    }, 150);
  });

  function reload() {
    var days = parseInt(rangeSelect ? rangeSelect.value : '30', 10) || 30;
    loadStats(days);
    loadChart(days);
  }

  if (rangeSelect) {
    rangeSelect.addEventListener('change', reload);
  }

  reload();
})();
