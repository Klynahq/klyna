/*
 * Klyna Reviews — storefront widget.
 *
 * Loads published reviews + the aggregate from the App Proxy, renders the list
 * and "write a review" form, and posts new submissions back to the proxy. Photo
 * uploads are read as data URLs and sent inline (the server stores the URLs);
 * swap to a presigned-upload flow for large files in production.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-klyna-reviews]');
  if (!root) return;

  var proxy = root.getAttribute('data-proxy') || '/apps/reviews';
  var productId = root.getAttribute('data-product-id');
  var productHandle = root.getAttribute('data-product-handle') || '';
  var productTitle = root.getAttribute('data-product-title') || 'Product';
  var token = root.getAttribute('data-token') || '';

  var summaryEl = root.querySelector('[data-klyna-summary]');
  var listEl = root.querySelector('[data-klyna-list]');
  var moreBtn = root.querySelector('[data-klyna-more]');
  var writeBtn = root.querySelector('[data-klyna-write]');
  var form = root.querySelector('[data-klyna-form]');
  var cancelBtn = root.querySelector('[data-klyna-cancel]');
  var statusEl = root.querySelector('[data-klyna-status]');
  var ratingInput = form ? form.querySelector('input[name="rating"]') : null;
  var ratingStars = root.querySelectorAll('[data-klyna-rating] .klyna-form__star');
  var photoInput = root.querySelector('[data-klyna-photos]');

  var page = 0;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function starRow(value) {
    var full = Math.round(value);
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += '<span class="klyna-stars__star' + (i <= full ? ' is-on' : '') + '">★</span>';
    }
    return '<span class="klyna-stars__row">' + out + '</span>';
  }

  function renderSummary(agg) {
    if (!summaryEl) return;
    if (!agg || agg.reviewCount === 0) {
      summaryEl.innerHTML = '<span class="klyna-reviews__empty">No reviews yet — be the first.</span>';
      return;
    }
    summaryEl.innerHTML =
      starRow(agg.ratingValue) +
      '<span class="klyna-reviews__avg">' + agg.ratingValue + ' out of 5</span>' +
      '<span class="klyna-reviews__total">' + agg.reviewCount +
      (agg.reviewCount === 1 ? ' review' : ' reviews') + '</span>';
  }

  function reviewCard(r) {
    var photos = '';
    if (r.photos && r.photos.length) {
      photos = '<div class="klyna-review__photos">';
      for (var i = 0; i < r.photos.length; i++) {
        photos += '<img loading="lazy" src="' + esc(r.photos[i]) + '" alt="Customer photo" />';
      }
      photos += '</div>';
    }
    var reply = r.reply
      ? '<div class="klyna-review__reply"><strong>Store reply</strong><p>' + esc(r.reply) + '</p></div>'
      : '';
    var verified = r.verified ? '<span class="klyna-review__badge">Verified purchase</span>' : '';
    var date = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '';
    return (
      '<article class="klyna-review">' +
      '<header class="klyna-review__head">' +
      starRow(r.rating) +
      '<span class="klyna-review__author">' + esc(r.author) + '</span>' +
      verified +
      '<span class="klyna-review__date">' + esc(date) + '</span>' +
      '</header>' +
      (r.title ? '<h3 class="klyna-review__title">' + esc(r.title) + '</h3>' : '') +
      '<p class="klyna-review__body">' + esc(r.body) + '</p>' +
      photos +
      reply +
      '</article>'
    );
  }

  function load(append) {
    var qs =
      '?productId=' + encodeURIComponent(productId) +
      '&handle=' + encodeURIComponent(productHandle) +
      '&title=' + encodeURIComponent(productTitle) +
      '&page=' + page;
    return fetch(proxy + qs, { headers: { Accept: 'application/json' } })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        renderSummary(data.aggregate);
        var html = data.reviews.map(reviewCard).join('');
        if (append) {
          listEl.insertAdjacentHTML('beforeend', html);
        } else {
          listEl.innerHTML = html || '<p class="klyna-reviews__empty">No published reviews yet.</p>';
        }
        if (moreBtn) moreBtn.hidden = !data.hasMore;
      })
      .catch(function (err) {
        if (summaryEl) summaryEl.innerHTML =
          '<span class="klyna-reviews__empty">Could not load reviews.</span>';
        if (window.console) console.error('Klyna Reviews:', err);
      });
  }

  // Star picker.
  function setRating(value) {
    if (ratingInput) ratingInput.value = String(value);
    ratingStars.forEach(function (s) {
      var v = parseInt(s.getAttribute('data-value'), 10);
      s.classList.toggle('is-on', v <= value);
    });
  }
  ratingStars.forEach(function (s) {
    s.addEventListener('click', function () {
      setRating(parseInt(s.getAttribute('data-value'), 10));
    });
  });

  if (writeBtn && form) {
    writeBtn.addEventListener('click', function () {
      form.hidden = false;
      writeBtn.hidden = true;
    });
  }
  if (cancelBtn && form) {
    cancelBtn.addEventListener('click', function () {
      form.hidden = true;
      if (writeBtn) writeBtn.hidden = false;
    });
  }

  function readPhotos() {
    if (!photoInput || !photoInput.files || !photoInput.files.length) {
      return Promise.resolve([]);
    }
    var files = Array.prototype.slice.call(photoInput.files, 0, 6);
    return Promise.all(
      files.map(function (file) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = function () { resolve(null); };
          reader.readAsDataURL(file);
        });
      }),
    ).then(function (urls) {
      return urls.filter(Boolean);
    });
  }

  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!ratingInput || ratingInput.value === '0') {
        statusEl.textContent = 'Please pick a star rating.';
        return;
      }
      statusEl.textContent = 'Submitting…';

      readPhotos().then(function (photos) {
        var body = new FormData();
        body.append('productId', productId);
        body.append('productTitle', productTitle);
        body.append('productHandle', productHandle);
        body.append('rating', ratingInput.value);
        body.append('title', form.title.value || '');
        body.append('body', form.body.value || '');
        body.append('authorName', form.authorName.value || '');
        body.append('authorEmail', form.authorEmail ? form.authorEmail.value : '');
        if (token) body.append('token', token);
        photos.forEach(function (url) { body.append('photos', url); });

        fetch(proxy, { method: 'POST', body: body })
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data.error) {
              statusEl.textContent = data.error;
              return;
            }
            statusEl.textContent = data.message || 'Thanks for your review!';
            form.reset();
            setRating(0);
            // Re-load so auto-published reviews appear immediately.
            page = 0;
            load(false);
          })
          .catch(function () {
            statusEl.textContent = 'Something went wrong. Please try again.';
          });
      });
    });
  }

  if (moreBtn) {
    moreBtn.addEventListener('click', function () {
      page += 1;
      load(true);
    });
  }

  load(false);
})();
