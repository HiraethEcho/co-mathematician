export type MathPart = { kind: 'text'; raw: string } | { kind: 'math'; raw: string; value: string; display: boolean };

const environments = /^(equation\*?|align\*?|alignat\*?|gather\*?|multline\*?|displaymath|math)$/;

/** Only explicit math notation is interpreted. Code examples remain literal. */
export function splitMath(source: string, markdown = false): MathPart[] {
  const parts: MathPart[] = [];
  let start = 0;
  let index = 0;
  let examined = 0;
  while (index < source.length) {
    if (markdown && (index === 0 || source[index - 1] === '\n')) {
      const line = source.slice(index, source.indexOf('\n', index) < 0 ? source.length : source.indexOf('\n', index));
      const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
      if (fence) {
        const close = new RegExp(`^ {0,3}${fence[1][0]}{${fence[1].length},}[ \\t]*$`, 'gm');
        close.lastIndex = index + line.length + 1;
        const match = close.exec(source);
        index = match ? match.index + match[0].length : source.length;
        continue;
      }
      if (/^( {4}|\t)/.test(line)) { index += line.length + 1; continue; }
    }
    if (markdown && source[index] === '`') {
      const ticks = /^`+/.exec(source.slice(index))![0];
      const close = new RegExp(`(?<!\x60)\x60{${ticks.length}}(?!\x60)`, 'g');
      close.lastIndex = index + ticks.length;
      const match = close.exec(source);
      index = match ? match.index + ticks.length : index + ticks.length;
      continue;
    }
    const verbatim = /^\\begin\{(verbatim\*?|lstlisting|minted)\}/.exec(source.slice(index));
    if (verbatim) {
      const close = `\\end{${verbatim[1]}}`;
      const end = source.indexOf(close, index + verbatim[0].length);
      index = end < 0 ? source.length : end + close.length;
      continue;
    }
    let left = '', right = '', display = false, environment = '';
    if (source.startsWith('$$', index)) { left = right = '$$'; display = true; }
    else if (source[index] === '$' && /\S/.test(source[index + 1] || ' ')) { left = right = '$'; }
    else if (source.startsWith('\\(', index)) { left = '\\('; right = '\\)'; }
    else if (source.startsWith('\\[', index)) { left = '\\['; right = '\\]'; display = true; }
    else if (source.startsWith('\\begin{', index)) {
      const match = /^\\begin\{([^}]+)\}/.exec(source.slice(index));
      if (match && environments.test(match[1])) { environment = match[1]; left = match[0]; right = `\\end{${environment}}`; display = environment !== 'math'; }
    }
    if (!left) { index += source[index] === '\\' ? 2 : 1; continue; }
    let end = index + left.length, braces = 0;
    for (; end < source.length; end++) {
      // Malformed input must not repeatedly scan the same long tail on the UI thread.
      if (++examined > source.length * 4) break;
      if (braces === 0 && source.startsWith(right, end)) {
        if (right !== '$' || (!/\s/.test(source[end - 1]) && !/\d/.test(source[end + 1] || ''))) break;
      }
      if (right === '$' && source.startsWith('\n\n', end)) break;
      if (source[end] === '\\') end++;
      else if (source[end] === '{') braces++;
      else if (source[end] === '}') braces = Math.max(0, braces - 1);
    }
    if (examined > source.length * 4) break;
    if (end >= source.length || !source.startsWith(right, end)) { index += left.length; continue; }
    if (start < index) parts.push({ kind: 'text', raw: source.slice(start, index) });
    const raw = source.slice(index, end + right.length);
    let value = source.slice(index + left.length, end);
    if (/^alignat/.test(environment)) value = `\\begin{alignedat}${value}\\end{alignedat}`;
    else if (/^align/.test(environment)) value = `\\begin{aligned}${value}\\end{aligned}`;
    else if (/^(gather|multline)/.test(environment)) value = `\\begin{gathered}${value}\\end{gathered}`;
    parts.push({ kind: 'math', raw, value, display });
    start = index = end + right.length;
  }
  if (start < source.length) parts.push({ kind: 'text', raw: source.slice(start) });
  return parts;
}

export function normalizeMath(source: string): string {
  return splitMath(source, true).map(part => part.kind === 'text' || part.raw.startsWith('$') ? part.raw : part.display
    ? `\n\n$$\n${part.value.trim()}\n$$\n\n`
    : `$${part.value.trim()}$`).join('');
}

/** Read simple local macro definitions; never load TeX packages or included files. */
export function latexDocument(source: string): { content: string; macros: Record<string, string>; unsupportedMacros: string[] } {
  let clean = '';
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\') { clean += source.slice(i, i + 2); i++; }
    else if (source[i] === '%') { const end = source.indexOf('\n', i); i = end < 0 ? source.length : end - 1; }
    else clean += source[i];
  }
  const begin = clean.indexOf('\\begin{document}');
  const end = clean.lastIndexOf('\\end{document}');
  const content = begin < 0 ? clean : clean.slice(begin + '\\begin{document}'.length, end < 0 ? undefined : end).trim();
  const preamble = begin < 0 ? '' : clean.slice(0, begin);
  const macros: Record<string, string> = {};
  const unsupportedMacros: string[] = [];
  const definition = /\\(newcommand|renewcommand|providecommand|DeclareMathOperator)(\*)?\s*(?:\{(\\[a-zA-Z]+)\}|(\\[a-zA-Z]+))\s*(?:\[([0-9])\])?\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = definition.exec(preamble))) {
    let end = definition.lastIndex, braces = 1;
    for (; end < preamble.length; end++) {
      if (preamble[end] === '\\') end++;
      else if (preamble[end] === '{') braces++;
      else if (preamble[end] === '}' && --braces === 0) break;
    }
    if (braces !== 0) break;
    const name = match[3] || match[4];
    const value = preamble.slice(definition.lastIndex, end);
    const usedArguments = Math.max(0, ...[...value.matchAll(/#([1-9])/g)].map(item => Number(item[1])));
    if (Number(match[5] || 0) !== usedArguments) unsupportedMacros.push(name);
    else if (match[1] !== 'providecommand' || !Object.hasOwn(macros, name)) {
      macros[name] = match[1] === 'DeclareMathOperator' ? `\\operatorname${match[2] || ''}{${value}}` : value;
    }
    definition.lastIndex = end + 1;
  }
  const bodyDefinition = /\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator|def|gdef|edef|xdef|let|futurelet)\*?\s*(?:\{\s*(\\[a-zA-Z]+)\s*\}|(\\[a-zA-Z]+))/g;
  unsupportedMacros.push(...[...content.matchAll(bodyDefinition)].map(match => match[1] || match[2]));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, value] of Object.entries(macros)) {
      if (!unsupportedMacros.includes(name) && (value.match(/\\[a-zA-Z]+/g) || []).some(command => unsupportedMacros.includes(command))) {
        unsupportedMacros.push(name); changed = true;
      }
    }
  }
  // A body redefinition cannot be applied retroactively to earlier equations.
  for (const name of unsupportedMacros) delete macros[name];
  return { content, macros, unsupportedMacros };
}
