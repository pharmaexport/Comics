(() => {
  const host = document.createElement('div');
  host.id = 'readerCompatibilityElements';
  host.hidden = true;
  host.setAttribute('aria-hidden', 'true');

  const definitions = [
    ['h2', 'libraryTitle'],
    ['p', 'librarySubtitle'],
    ['span', 'formatBadge'],
    ['progress', 'cardProgress'],
    ['span', 'cardProgressText'],
    ['canvas', 'coverCanvas'],
    ['button', 'openCurrentComic']
  ];

  for (const [tag, id] of definitions) {
    if (document.getElementById(id)) continue;
    const element = document.createElement(tag);
    element.id = id;
    if (tag === 'button') element.type = 'button';
    if (tag === 'progress') {
      element.max = 1;
      element.value = 0;
    }
    host.appendChild(element);
  }

  document.body.appendChild(host);
})();
