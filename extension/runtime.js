(() => {
  if (location.origin !== 'https://github.com' || globalThis.githubLocalizerRuntime) return;

  const translators = new Map();
  const owned = new Map();
  const options = {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: [
      'aria-label', 'placeholder', 'title', 'lang', 'datetime', 'href', 'role',
      'class', 'id', 'contenteditable', 'type', 'for', 'app-name',
      'data-content', 'data-testid', 'data-component',
    ],
  };
  let state = { enabled: true, mode: 'beginner', original: false };
  const currentRoute = () => location.pathname + location.search;
  let route = currentRoute();
  let roots;
  let parents;
  let pending = [];
  let scheduled = false;
  let refresh = false;
  let checked;
  let fullScan = false;

  function read(node, attribute) {
    return attribute ? node.getAttribute(attribute) : node.data;
  }

  function write(node, attribute, value) {
    if (!attribute) node.data = value;
    else if (value === null) node.removeAttribute(attribute);
    else node.setAttribute(attribute, value);
  }

  function source(node, attribute) {
    const current = read(node, attribute);
    const binding = owned.get(node)?.get(attribute);
    return binding && binding.value === current ? binding.source : current;
  }

  function replace(node, attribute, value) {
    const original = source(node, attribute);
    let binding = owned.get(node)?.get(attribute);
    if (read(node, attribute) !== value) {
      if (!owned.has(node)) owned.set(node, new Map());
      binding = { source: original, value };
      owned.get(node).set(attribute, binding);
      write(node, attribute, value);
    }
    if (binding) checked.add(binding);
  }

  function restore(node, values) {
    for (const [attribute, { source, value }] of values) {
      if (read(node, attribute) === value) write(node, attribute, source);
    }
    owned.delete(node);
  }

  function matches(selector, scope = document) {
    if (fullScan) return scope.querySelectorAll(selector);
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

  function affected(node) {
    const element = node instanceof Element ? node : node.parentElement;
    if (parents.has(element)) return true;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      if (roots.has(ancestor)) return true;
    }
    return false;
  }

  function recheckScope(scope) {
    const changed = affected(scope);
    if (changed) roots.add(scope);
    return fullScan || changed;
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
    fullScan = refresh || reset;
    refresh = false;
    if (!fullScan && !records.length) return;

    // Mutation records from GitHub supersede recorded originals, even when a
    // component explicitly writes the same display value the extension wrote.
    enroll(records);
    observer.disconnect();
    checked = new Set();
    try {
      route = nextRoute;
      state = nextState;
      for (const [node, values] of owned) {
        if (reset || !node.isConnected) restore(node, values);
      }
      if (state.enabled && !state.original) {
        for (const translate of translators.values()) translate();
        if (!reset && records.length) {
          for (const [node, bindings] of owned) {
            if (!affected(node)) continue;
            for (const [attribute, binding] of bindings) {
              if (checked.has(binding)) continue;
              if (read(node, attribute) === binding.value) write(node, attribute, binding.source);
              bindings.delete(attribute);
            }
            if (!bindings.size) owned.delete(node);
          }
        }
      }
    } finally {
      fullScan = false;
      checked = null;
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
    recheckScope,
    source,
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
