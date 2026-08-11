/* PoC Research Papers — ledger view.
 *
 * README.md stays the single source of truth. This script reads the HTML that
 * Jekyll renders from it, regroups the entries, and draws the year spine from
 * the real per-year counts. Anything it cannot recognise is left alone, and if
 * it throws, the raw rendered markdown is shown instead.
 */
(function () {
  'use strict';

  var SITE = {
    repo: 'https://github.com/MarkLee131/PoC-Research-Papers',
    pulls: 'https://github.com/MarkLee131/PoC-Research-Papers/pulls',
    author: 'Kaixuan Li',
    authorUrl: 'https://kaixuanli-ecnu.github.io/'
  };

  var md = document.getElementById('md');
  if (!md) return;

  var reveal = function () { md.classList.add('ready'); };

  try {
    build();
  } catch (err) {
    reveal();
    if (window.console) console.error('ledger:', err);
  }

  /* ---------------------------------------------------------------- parsing */

  // Split the rendered markdown into <h2> sections. The lead-in (title, badges,
  // tagline) comes back as the section with a null title.
  function splitSections(root) {
    var out = [];
    var cur = { title: null, nodes: [] };
    Array.prototype.forEach.call(root.children, function (el) {
      if (el.tagName === 'H2') {
        out.push(cur);
        cur = { title: text(el), nodes: [] };
      } else if (el.tagName !== 'HR') {
        cur.nodes.push(el);
      }
    });
    out.push(cur);
    return out;
  }

  function findSection(sections, name) {
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].title && sections[i].title.toLowerCase() === name) return sections[i];
    }
    return null;
  }

  // Turn a flat run of h3 / h4 / p / ul into groups of subgroups.
  function groupNodes(nodes) {
    var groups = [];
    var group = null;
    var sub = null;

    function openGroup(label) {
      group = { label: label, note: '', subs: [] };
      sub = null;
      groups.push(group);
    }
    function openSub(label) {
      if (!group) openGroup('');
      sub = { label: label, items: [] };
      group.subs.push(sub);
    }

    nodes.forEach(function (el) {
      if (el.tagName === 'H3') {
        openGroup(text(el));
      } else if (el.tagName === 'H4') {
        openSub(text(el));
      } else if (el.tagName === 'P' && group && !group.subs.length) {
        group.note = text(el);
      } else if (el.tagName === 'UL' || el.tagName === 'OL') {
        if (!sub) openSub('');
        Array.prototype.forEach.call(el.children, function (li) {
          if (li.tagName === 'LI') sub.items.push(li);
        });
      }
    });

    return groups.filter(function (g) {
      return g.subs.some(function (s) { return s.items.length; });
    });
  }

  // One list item -> { title, href, kind, venue, year, notes }.
  // Titles carry their metadata in trailing parentheses, e.g.
  //   "Diffploit: ... (ICSE '26, Journal-first) [pdf](...)"
  function parseEntry(li, venueHint) {
    var link = li.querySelector('a[href]');
    var clone = li.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('a'), function (a) {
      a.parentNode.removeChild(a);
    });

    var title = text(clone).replace(/[\s ]+/g, ' ').trim();
    var venue = venueHint || '';
    var year = '';
    var notes = [];

    // Peel trailing "(...)" groups off the title, newest-first.
    var m;
    while ((m = /\s*\(([^()]*)\)\s*$/.exec(title))) {
      var consumed = false;
      m[1].split(',').forEach(function (part) {
        part = part.trim();
        if (!part) return;
        var v = /^(.+?)\s*['‘’](\d{2})$/.exec(part);
        if (v) {
          if (!venue) venue = v[1].trim();
          if (!year) year = (Number(v[2]) > 70 ? '19' : '20') + v[2];
          consumed = true;
        } else {
          notes.push(part);
          consumed = true;
        }
      });
      if (!consumed) break;
      title = title.slice(0, m.index).trim();
    }

    return {
      title: title,
      href: link ? link.getAttribute('href') : '',
      kind: link ? text(link).trim() : '',
      venue: venue,
      year: year,
      notes: notes
    };
  }

  /* --------------------------------------------------------------- building */

  function build() {
    var sections = splitSections(md);
    var lead = sections[0];
    var byYear = findSection(sections, 'all papers');
    if (!byYear) { reveal(); return; }

    var byTopic = findSection(sections, 'papers by topic');
    var preprints = findSection(sections, 'preprints');
    var contributing = findSection(sections, 'contributing');
    var license = findSection(sections, 'license');

    var yearGroups = groupNodes(byYear.nodes);
    var topicGroups = byTopic ? groupNodes(byTopic.nodes) : [];
    var preprintGroups = preprints ? groupNodes(preprints.nodes) : [];

    var frag = document.createDocumentFragment();
    var state = { entries: [], venues: {}, query: '', venueFilter: {} };

    frag.appendChild(masthead(lead, yearGroups, preprintGroups, state));

    var shell = el('div', 'shell');
    var railEl = rail();
    var mainEl = el('main', 'main');
    mainEl.id = 'main';
    shell.appendChild(railEl);
    shell.appendChild(mainEl);
    frag.appendChild(shell);

    // Views
    var views = [
      { id: 'year', label: 'By year', groups: yearGroups, spine: true },
      { id: 'topic', label: 'By topic', groups: topicGroups },
      { id: 'preprint', label: 'Preprints', groups: preprintGroups }
    ].filter(function (v) { return v.groups.length; });

    var bar = el('div', 'viewbar');
    var tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    var tally = el('p', 'tally');
    tally.setAttribute('aria-live', 'polite');
    bar.appendChild(tabs);
    bar.appendChild(tally);
    mainEl.appendChild(bar);

    views.forEach(function (v, i) {
      var tab = el('button', 'tab', v.label);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(i === 0));
      tab.setAttribute('aria-controls', 'view-' + v.id);
      tab.id = 'tab-' + v.id;
      tabs.appendChild(tab);

      v.el = el('section', 'view');
      v.el.id = 'view-' + v.id;
      v.el.setAttribute('role', 'tabpanel');
      v.el.setAttribute('aria-labelledby', tab.id);
      if (i !== 0) v.el.hidden = true;
      var cols = el('div', 'ledger-head');
      cols.appendChild(el('span', '', '#'));
      cols.appendChild(el('span', '', 'Entry'));
      cols.appendChild(el('span', '', 'Source'));
      cols.setAttribute('aria-hidden', 'true');
      v.el.appendChild(cols);
      v.seq = 0;
      v.groups.forEach(function (g) { v.el.appendChild(renderGroup(g, v, state)); });
      mainEl.appendChild(v.el);

      tab.setAttribute('tabindex', i === 0 ? '0' : '-1');
      tab.addEventListener('click', function () {
        views.forEach(function (o) {
          var on = o === v;
          o.el.hidden = !on;
          var t = document.getElementById('tab-' + o.id);
          t.setAttribute('aria-selected', String(on));
          t.setAttribute('tabindex', on ? '0' : '-1');
        });
        railEl.querySelector('.rail-spine').hidden = !v.spine;
        applyFilters();
      });

      // A tablist is arrow-navigable; Tab itself moves on to the panel.
      tab.addEventListener('keydown', function (e) {
        var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        var next = views[(i + step + views.length) % views.length];
        var el2 = document.getElementById('tab-' + next.id);
        el2.click();
        el2.focus();
      });
    });

    var empty = el('div', 'empty');
    empty.hidden = true;
    empty.appendChild(el('p', '', 'No papers match that filter.'));
    var clearBtn = el('button', '', 'Clear filters');
    clearBtn.type = 'button';
    empty.appendChild(clearBtn);
    mainEl.appendChild(empty);

    frag.appendChild(colophon(contributing, license, lead));

    md.textContent = '';
    md.classList.remove('raw');
    md.appendChild(frag);

    /* ------------------------------------------------------------ behaviour */

    var search = document.getElementById('q');
    var chipBox = railEl.querySelector('.chips');
    var venueNames = Object.keys(state.venues).sort(function (a, b) {
      return state.venues[b] - state.venues[a] || a.localeCompare(b);
    });
    venueNames.forEach(function (name) {
      var chip = el('button', 'chip', name);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', 'false');
      chip.dataset.venue = name;
      chip.addEventListener('click', function () {
        var on = chip.getAttribute('aria-pressed') === 'true';
        chip.setAttribute('aria-pressed', String(!on));
        if (on) delete state.venueFilter[name];
        else state.venueFilter[name] = true;
        applyFilters();
      });
      chipBox.appendChild(chip);
    });

    function applyFilters() {
      var q = state.query.trim().toLowerCase();
      var venues = Object.keys(state.venueFilter);
      var view = views.filter(function (v) { return !v.el.hidden; })[0];
      var shown = 0, total = 0;

      state.entries.forEach(function (e) {
        if (!view.el.contains(e.node)) return;
        total++;
        var ok = (!q || e.haystack.indexOf(q) !== -1) &&
                 (!venues.length || state.venueFilter[e.data.venue]);
        e.node.hidden = !ok;
        if (ok) shown++;
      });

      // Roll the visibility up through subgroups and groups.
      Array.prototype.forEach.call(view.el.querySelectorAll('.subgroup'), function (s) {
        s.hidden = !s.querySelector('.paper:not([hidden])');
      });
      Array.prototype.forEach.call(view.el.querySelectorAll('.group'), function (g) {
        g.hidden = !g.querySelector('.subgroup:not([hidden])');
        var c = g.querySelector('.count');
        if (c) c.textContent = g.querySelectorAll('.paper:not([hidden])').length + ' papers';
      });

      empty.hidden = shown !== 0;
      tally.innerHTML = '';
      tally.appendChild(el('b', '', String(shown)));
      tally.appendChild(document.createTextNode(
        shown === total ? ' papers' : ' of ' + total + ' papers'
      ));

      var filtering = !!(q || venues.length);
      railEl.querySelector('.reset').hidden = !filtering;
    }

    search.addEventListener('input', function () {
      state.query = search.value;
      applyFilters();
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { search.value = ''; state.query = ''; applyFilters(); }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== search &&
          !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        search.focus();
      }
    });

    function resetAll() {
      search.value = '';
      state.query = '';
      state.venueFilter = {};
      Array.prototype.forEach.call(chipBox.children, function (c) {
        c.setAttribute('aria-pressed', 'false');
      });
      applyFilters();
    }
    clearBtn.addEventListener('click', resetAll);
    railEl.querySelector('.reset').addEventListener('click', resetAll);

    var known = state.entries
      .map(function (e) { return Number(e.data.year); })
      .filter(function (y) { return y > 1900; });
    var spanEl = document.querySelector('.eyebrow .span');
    if (spanEl && known.length) {
      spanEl.textContent = Math.min.apply(null, known) + String.fromCharCode(8211) + Math.max.apply(null, known);
    }

    themeToggle(railEl.querySelector('.theme'));
    mirrorSpine();
    scrollSpy();
    railOpenState(railEl);
    applyFilters();
  }

  /* --------------------------------------------------------------- sections */

  function masthead(lead, yearGroups, preprintGroups, state) {
    var head = el('header', 'masthead');

    var counts = yearGroups.map(function (g) {
      return { label: g.label, n: countItems(g) };
    });
    var totalYear = counts.reduce(function (a, c) { return a + c.n; }, 0);
    var totalPre = preprintGroups.reduce(function (a, g) { return a + countItems(g); }, 0);
    var eyebrow = el('p', 'eyebrow');
    eyebrow.appendChild(el('span', '', 'A curated bibliography'));
    eyebrow.appendChild(el('span', 'dot', '/'));
    // Filled in once every entry has been parsed; the oldest papers live inside
    // the "2016 and Before" group, so the group labels alone understate the span.
    eyebrow.appendChild(el('span', 'span', ''));
    eyebrow.appendChild(el('span', 'dot', '/'));
    eyebrow.appendChild(el('span', '', totalYear + ' papers, ' + totalPre + ' preprints'));
    head.appendChild(eyebrow);

    var h1 = el('h1');
    h1.appendChild(el('span', 'l1', 'Proof-of-Concept'));
    h1.appendChild(el('span', 'l2', 'Research Papers'));
    head.appendChild(h1);

    var src = lead.nodes.filter(function (n) { return n.tagName === 'BLOCKQUOTE'; })[0];
    var lede = el('p', 'lede');
    lede.textContent = src
      ? text(src).replace(/\s*Feel free to make contributions[\s\S]*$/, '').trim()
      : 'Papers on proof-of-concept exploits: generation, empirical analysis, and applications.';
    head.appendChild(lede);

    var by = el('p', 'byline');
    by.appendChild(document.createTextNode('Maintained by '));
    var who = el('a', '', SITE.author);
    who.href = SITE.authorUrl;
    who.rel = 'noopener';
    by.appendChild(who);
    head.appendChild(by);

    var badges = lead.nodes.filter(function (n) { return n.querySelector && n.querySelector('img'); });
    if (badges.length) {
      var box = el('p', 'badges');
      badges.forEach(function (b) {
        Array.prototype.slice.call(b.childNodes).forEach(function (n) { box.appendChild(n); });
      });
      head.appendChild(box);
    }

    head.appendChild(spine(counts, 'Papers per year'));
    return head;
  }

  function spine(counts, caption) {
    var max = counts.reduce(function (a, c) { return Math.max(a, c.n); }, 1);
    var wrap = el('div', 'spine');

    var h = el('div', 'spine-head');
    h.appendChild(el('span', '', caption));
    h.appendChild(el('span', '', 'peak ' + max));
    wrap.appendChild(h);

    counts.forEach(function (c) {
      var row = el('a', 'spine-row');
      row.href = '#g-' + slug(c.label);
      row.dataset.year = c.label;
      // "2016 and Before" would wrap over three lines in a year column.
      var short = /^\d{4}$/.test(c.label)
        ? c.label
        : (/(\d{4})/.exec(c.label) ? '≤' + /(\d{4})/.exec(c.label)[1] : c.label);
      row.title = c.n + (c.n === 1 ? ' paper' : ' papers') + ' — ' + c.label;
      row.appendChild(el('span', 'yr', short));
      var track = el('span', 'track');
      var bar = el('span', 'bar');
      bar.style.width = Math.max(3, Math.round((c.n / max) * 100)) + '%';
      track.appendChild(bar);
      row.appendChild(track);
      row.appendChild(el('span', 'n', String(c.n)));
      wrap.appendChild(row);
    });

    return wrap;
  }

  function rail() {
    var r = el('details', 'rail');
    r.appendChild(el('summary', '', 'Browse and filter'));
    var body = el('div', 'rail-body');
    r.appendChild(body);

    var field = el('div', 'field');
    var input = el('input');
    input.type = 'search';
    input.id = 'q';
    input.placeholder = 'Search titles, venues…';
    input.setAttribute('aria-label', 'Search papers');
    field.appendChild(input);
    field.appendChild(el('kbd', '', '/'));
    body.appendChild(field);

    var h = el('h2', '', 'Venue');
    var reset = el('button', 'reset', 'Reset');
    reset.type = 'button';
    reset.hidden = true;
    h.appendChild(reset);
    body.appendChild(h);
    body.appendChild(el('div', 'chips'));

    var sp = el('div', 'rail-spine');
    sp.appendChild(el('h2', '', 'Year'));
    body.appendChild(sp);

    var foot = el('div', 'rail-foot');
    var home = el('a', '', SITE.author + '’s homepage');
    home.href = SITE.authorUrl;
    home.rel = 'noopener';
    foot.appendChild(home);
    var repo = el('a', '', 'Repository on GitHub');
    repo.href = SITE.repo;
    foot.appendChild(repo);
    var add = el('a', '', 'Add a paper');
    add.href = SITE.pulls;
    foot.appendChild(add);
    var theme = el('button', 'theme', 'Switch to dark');
    theme.type = 'button';
    foot.appendChild(theme);
    body.appendChild(foot);

    return r;
  }

  function renderGroup(g, view, state) {
    var sec = el('section', 'group');
    sec.id = 'g-' + slug(g.label);

    // A section with no <h3> (Preprints) needs no heading of its own.
    if (g.label) {
      var head = el('div', 'group-head');
      head.appendChild(el('h3', '', g.label));
      head.appendChild(el('span', 'count'));
      sec.appendChild(head);
    }

    if (g.note) sec.appendChild(el('p', 'group-note', g.note));

    g.subs.forEach(function (s) {
      if (!s.items.length) return;
      var sub = el('section', 'subgroup');
      if (s.label) sub.appendChild(el('h4', 'subgroup-head', s.label));

      var list = el('ul', 'papers');
      s.items.forEach(function (li) {
        // In the year view the <h4> is the venue; in the topic view it is a theme.
        var hint = view.id === 'year' ? normVenue(s.label) : '';
        var d = parseEntry(li, hint);
        if (view.id === 'year') {
          // Years come from the <h3> ("2025"), or from the venue heading in the
          // catch-all group, where they read "SIGKDD '10".
          var sy = /['‘’](\d{2})\s*$/.exec(s.label);
          if (/^\d{4}$/.test(g.label)) d.year = d.year || g.label;
          else if (sy) d.year = d.year || (Number(sy[1]) > 70 ? '19' : '20') + sy[1];
        }
        d.venue = normVenue(d.venue);
        if (d.venue) state.venues[d.venue] = (state.venues[d.venue] || 0) + 1;

        var node = renderEntry(d, ++view.seq, d.venue !== normVenue(s.label));
        list.appendChild(node);
        state.entries.push({
          node: node,
          data: d,
          haystack: [d.title, d.venue, d.year, s.label, g.label]
            .concat(d.notes).join(' ').toLowerCase()
        });
      });
      sub.appendChild(list);
      sec.appendChild(sub);
    });

    return sec;
  }

  function renderEntry(d, index, showVenue) {
    var li = el('li', 'paper');
    li.appendChild(el('span', 'idx', pad(index)));

    var main = el('span', 'body');
    var title = el(d.href ? 'a' : 'span', 'title', d.title);
    if (d.href) { title.href = d.href; title.rel = 'noopener'; }
    main.appendChild(title);

    if ((d.venue && showVenue) || d.notes.length) {
      var tags = el('span', 'tags');
      if (d.venue && showVenue) {
        tags.appendChild(el('span', 'tag venue', d.venue + (d.year ? " '" + d.year.slice(2) : '')));
      }
      d.notes.forEach(function (n) {
        tags.appendChild(el('span', 'tag' + (/award/i.test(n) ? ' award' : ''), n));
      });
      main.appendChild(tags);
    }
    li.appendChild(main);

    if (d.href) {
      var src = el('a', 'src', (d.kind || 'link') + ' ↗');
      src.href = d.href;
      src.rel = 'noopener';
      src.setAttribute('aria-label', d.kind + ' for ' + d.title);
      li.appendChild(src);
    } else {
      li.appendChild(el('span', 'src none', 'no link'));
    }
    return li;
  }

  function colophon(contributing, license, lead) {
    var c = el('footer', 'colophon');
    [
      { title: 'Contributing', sec: contributing },
      { title: 'License', sec: license }
    ].forEach(function (part) {
      if (!part.sec) return;
      var box = el('section');
      box.appendChild(el('h2', '', part.title));
      part.sec.nodes.forEach(function (n) { box.appendChild(n); });
      c.appendChild(box);
    });
    return c;
  }

  /* -------------------------------------------------------------- behaviour */

  function scrollSpy() {
    var groups = Array.prototype.slice.call(
      document.querySelectorAll('#view-year .group')
    );
    if (!groups.length || !('IntersectionObserver' in window)) return;

    var rows = Array.prototype.slice.call(document.querySelectorAll('.spine-row'));
    var seen = {};

    var io = new IntersectionObserver(function (items) {
      items.forEach(function (i) { seen[i.target.id] = i.isIntersecting; });
      var active = groups.filter(function (g) { return seen[g.id]; })[0];
      rows.forEach(function (r) {
        r.classList.toggle('is-active', !!active && r.hash === '#' + active.id);
      });
    }, { rootMargin: '-15% 0px -70% 0px' });

    groups.forEach(function (g) { io.observe(g); });
  }

  function themeToggle(btn) {
    if (!btn) return;
    var sync = function () {
      var dark = document.documentElement.getAttribute('data-theme') === 'dark' ||
        (!document.documentElement.getAttribute('data-theme') &&
          window.matchMedia('(prefers-color-scheme: dark)').matches);
      btn.textContent = dark ? 'Switch to light' : 'Switch to dark';
      return dark;
    };
    var dark = sync();
    btn.addEventListener('click', function () {
      dark = !dark;
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      try { localStorage.setItem('poc-theme', dark ? 'dark' : 'light'); } catch (e) {}
      sync();
    });
  }

  // The rail is a disclosure on narrow screens and an always-open column above.
  function railOpenState(railEl) {
    var mq = window.matchMedia('(min-width: 62rem)');
    var apply = function () { railEl.open = mq.matches; };
    apply();
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(apply);
  }

  /* ------------------------------------------------------------------ utils */

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function text(n) { return (n.textContent || '').trim(); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function slug(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  function countItems(g) {
    return g.subs.reduce(function (a, s) { return a + s.items.length; }, 0);
  }
  // "USENIX Security '18" and "USENIX Security" are the same venue.
  function normVenue(v) {
    return String(v || '').replace(/\s*['‘’]\d{2}\s*$/, '').trim();
  }

  // The rail carries a compact copy of the masthead spine.
  function mirrorSpine() {
    var host = document.querySelector('.rail-spine');
    var source = document.querySelector('.masthead .spine');
    if (!host || !source || host.querySelector('.spine')) return;
    host.appendChild(source.cloneNode(true));
  }
})();
