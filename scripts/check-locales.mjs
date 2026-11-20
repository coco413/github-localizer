import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'acorn';

const directory = process.argv[2] ?? 'extension';
const files = ['repository-words.js', 'issue-pr-words.js', 'extended-pages.js'];
const modes = ['beginner', 'professional'];
const placeholder = /\{\{[\w.-]+\}\}|\{[\w.-]+\}|%(?:\d+\$)?[sdif]|\$[A-Z_][A-Z_0-9]*\$/g;
const inlineTag = /<\/?[a-z][\w-]*(?:\s[^<>]*?)?\s*\/?\s*>/gi;
const errors = [];

function selectorAlternatives(selector) {
  let depth = 0;
  let start = 0;
  const alternatives = [];
  for (const token of selector.matchAll(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\\.|[()[\],]/g)) {
    if (token[0] === '(' || token[0] === '[') depth += 1;
    if (token[0] === ')' || token[0] === ']') depth -= 1;
    if (token[0] !== ',' || depth !== 0) continue;
    alternatives.push(selector.slice(start, token.index).trim());
    start = token.index + 1;
  }
  alternatives.push(selector.slice(start).trim());
  return alternatives;
}

function keyOf(property) {
  if (property.type !== 'Property' || property.computed) return undefined;
  return property.key.name ?? property.key.value;
}

function visit(node, fn) {
  if (!node?.type) return;
  fn(node);
  for (const member of Object.values(node)) {
    if (Array.isArray(member)) member.forEach(child => visit(child, fn));
    else visit(member, fn);
  }
}

for (const file of files) {
  const source = await readFile(join(directory, file), 'utf8');
  const report = (node, message) => errors.push(`${file}:${node.loc.start.line}:${node.loc.start.column + 1}: ${message}`);
  const ast = parse(source, { ecmaVersion: 'latest', locations: true });
  const constants = new Map();
  const translationTables = new Set();
  visit(ast, (node) => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
      constants.set(node.id.name, node.init);
    }
  });

  function entries(object, visited = new Set()) {
    if (object?.type === 'Identifier') object = constants.get(object.name);
    if (object?.type !== 'ObjectExpression' || visited.has(object)) return [];
    return object.properties.flatMap(property => property.type === 'SpreadElement'
      ? entries(property.argument, new Set([...visited, object])) : [property]);
  }

  function registerTable(node) {
    if (node?.type === 'Identifier') node = constants.get(node.name);
    if (node?.type === 'ObjectExpression') translationTables.add(node);
  }

  visit(ast, node => {
    if (node.type === 'ArrayExpression' && node.elements.length === 2) {
      const [, words] = node.elements;
      registerTable(words);
    }
    if (node.type === 'CallExpression' && ['translate', 'translateText'].includes(node.callee.name)) {
      registerTable(node.arguments.at(-1));
    }
    if (node.type === 'AssignmentExpression' && node.left.property?.name === 'githubLocalizerRepositoryWords') {
      for (const property of entries(node.right)) registerTable(property.value);
    }
  });

  function selectorText(node, visited = new Set()) {
    if (node.type === 'Literal') return node.value;
    if (node.type === 'Identifier' && constants.has(node.name) && !visited.has(node.name)) {
      return selectorText(constants.get(node.name), new Set([...visited, node.name]));
    }
    if (node.type === 'TemplateLiteral') {
      return node.quasis.map(({ value }, index) =>
        value.cooked + (node.expressions[index] ? selectorText(node.expressions[index], visited) : '')).join('');
    }
    return source.slice(node.start, node.end);
  }

  function validate(sourceText, translation, node) {
    if (typeof translation !== 'string' || !translation.trim()) {
      report(node, `empty or invalid translation for "${sourceText}"`);
      return;
    }
    for (const [label, pattern, ordered] of [['placeholder', placeholder, false], ['inline tag', inlineTag, true]]) {
      const expected = sourceText.match(pattern) ?? [];
      const actual = translation.match(pattern) ?? [];
      if (!ordered) {
        expected.sort();
        actual.sort();
      }
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        report(node, `${label} mismatch for "${sourceText}" (expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)})`);
      }
    }
  }

  visit(ast, (node) => {
    if (node.type === 'ObjectExpression') {
      const seen = new Set();
      for (const property of entries(node)) {
        const key = keyOf(property);
        if (typeof key !== 'string') continue;
        if (seen.has(key)) report(property, `duplicate key "${key}"`);
        seen.add(key);
        const value = property.value;
        if (typeof value.value === 'string') validate(key, value.value, value);
        if (value.type === 'ObjectExpression' &&
            (translationTables.has(node) || value.properties.some(mode => modes.includes(keyOf(mode))))) {
          for (const mode of modes) {
            const translation = entries(value).find(property => keyOf(property) === mode);
            if (!translation) report(value, `missing ${mode} translation for "${key}"`);
            else validate(key, translation.value.value, translation.value);
          }
        } else if (translationTables.has(node) && typeof value.value !== 'string') {
          validate(key, value.value, value);
        }
      }
    }

    // Issue/PR and any future stock rule tables use a list of [selector, words] pairs per page.
    if (node.type !== 'ArrayExpression') return;
    const seen = new Map();
    for (let rule of node.elements) {
      if (rule?.type !== 'ArrayExpression' || rule.elements.length !== 2) continue;
      const [selector, words] = rule.elements;
      if (!selector || !words) continue;
      const scope = String(selectorText(selector)).trim();
      for (const property of entries(words)) {
        const key = keyOf(property);
        if (typeof key !== 'string') continue;
        const value = property.value;
        const translation = value.type === 'ObjectExpression'
          ? JSON.stringify(modes.map(mode => entries(value).find(property => keyOf(property) === mode)?.value.value))
          : JSON.stringify(modes.map(() => value.value));
        for (const alternative of selectorAlternatives(scope)) {
          const signature = JSON.stringify([alternative, key]);
          if (seen.has(signature) && seen.get(signature) !== translation) {
            report(property, `rule conflict for "${key}" within ${alternative}`);
          }
          seen.set(signature, translation);
        }
      }
    }
  });
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
} else {
  console.log('Stock locale and rule checks passed.');
}
