(() => {
  if (location.origin !== 'https://github.com' || globalThis.githubLocalizerRuntime) return;

  const translators = new Map();
  const owned = new Map();
  const options = {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['aria-label', 'placeholder', 'title', 'lang', 'datetime', 'href', 'data-content', 'role', 'data-testid'],
  };
  let state = { enabled: true, mode: 'beginner', original: false };
  const currentRoute = () => location.pathname + location.search;
  let route = currentRoute();
  let roots;
  let parents;
  let pending = [];
  let scheduled = false;
  let refresh = false;

  function read(node, attribute) {
    return attribute ? node.getAttribute(attribute) : node.data;
  }

  function write(node, attribute, value) {
    if (!attribute) node.data = value;
    else if (value === null) node.removeAttribute(attribute);
    else node.setAttribute(attribute, value);
  }

  function replace(node, attribute, value) {
    const source = read(node, attribute);
    if (source === value) return;
    if (!owned.has(node)) owned.set(node, new Map());
    owned.get(node).set(attribute, { source, value });
    write(node, attribute, value);
  }

  function restore(node, values) {
    for (const [attribute, { source, value }] of values) {
      if (read(node, attribute) === value) write(node, attribute, source);
    }
    owned.delete(node);
  }

  function matches(selector, scope = document) {
    if (!roots) return scope.querySelectorAll(selector);
    const result = new Set();
    for (const root of roots) {
      if (!root.isConnected) continue;
      if (scope.contains(root)) {
        if (scope !== root && root.matches(selector)) result.add(root);
        root.querySelectorAll(selector).forEach((element) => result.add(element));
      } else if (root.contains(scope)) {
        scope.querySelectorAll(selector).forEach((element) => result.add(element));
      }
    }
    for (const element of parents) {
      if (element !== scope && scope.contains(element) && element.matches(selector)) result.add(element);
    }
    return result;
  }

  function enroll(records) {
    roots = new Set();
    parents = new Set();
    for (const record of records) {
      const { target, type, attributeName } = record;
      if (type === 'childList') {
        for (const node of record.addedNodes) {
          if (node instanceof Element) roots.add(node);
        }
      } else {
        const values = owned.get(target);
        values?.delete(attributeName);
        if (values?.size === 0) owned.delete(target);
        if (type === 'attributes') roots.add(target);
      }
      const element = type === 'characterData' ? target.parentElement : target;
      for (let parent = element; parent instanceof Element && !parents.has(parent); parent = parent.parentElement) {
        parents.add(parent);
      }
    }
  }

  function flush(settings = {}) {
    const records = pending.concat(observer.takeRecords());
    pending = [];
    const nextRoute = currentRoute();
    const navigated = nextRoute !== route;
    const nextState = { ...state, ...(navigated && { original: false }), ...settings };
    const reset = navigated || Object.keys(state).some((key) => state[key] !== nextState[key]);
    const full = refresh || reset;
    refresh = false;
    if (!full && !records.length) return;

    // Mutation records from GitHub supersede recorded originals, even when a
    // component explicitly writes the same display value the extension wrote.
    enroll(records);
    observer.disconnect();
    try {
      route = nextRoute;
      state = nextState;
      for (const [node, values] of owned) {
        if (reset || !node.isConnected) restore(node, values);
      }
      if (full) roots = null;
      if (state.enabled && !state.original) {
        for (const translate of translators.values()) translate();
      }
    } finally {
      roots = null;
      parents = null;
      observer.observe(document, options);
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      flush();
    });
  }

  const observer = new MutationObserver((records) => {
    pending.push(...records);
    schedule();
  });

  globalThis.githubLocalizerRuntime = {
    register(name, translate) {
      if (translators.has(name)) return;
      translators.set(name, translate);
      refresh = true;
      schedule();
    },
    configure(settings) {
      flush(settings);
    },
    getState() {
      flush();
      return { ...state };
    },
    matches,
    replace,
    word(value) {
      return typeof value === 'string' ? value : value[state.mode];
    },
  };

  addEventListener('popstate', schedule);
  addEventListener('pageshow', schedule);
  document.addEventListener('turbo:load', schedule);
  if (globalThis.navigation) {
    globalThis.navigation.addEventListener('currententrychange', schedule);
  } else {
    // Older browsers do not emit an event for pushState/replaceState.
    setInterval(() => {
      if (currentRoute() !== route) schedule();
    }, 100);
  }
})();
