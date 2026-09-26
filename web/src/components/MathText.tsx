import { useMemo } from 'react';
import katex from 'katex';
import { latexDocument, splitMath } from '../math';

/** Plain prose keeps its line breaks, without Markdown interpreting the text. */
export function MathText({ children, inline = false, latex = false }: { children: string; inline?: boolean; latex?: boolean }) {
  const content = useMemo(() => {
    const document = latex ? latexDocument(children) : { content: children, macros: {}, unsupportedMacros: [] };
    return splitMath(document.content).map((part, index) => {
      if (part.kind === 'text') return part.raw;
      try {
        if (document.unsupportedMacros.some(name => part.value.match(/\\[a-zA-Z]+/g)?.includes(name))) throw new Error('正文中的命令定义需要完整 LaTeX 排版');
        const html = katex.renderToString(part.value, { displayMode: part.display && !inline, macros: { ...document.macros }, trust: false, strict: 'ignore', maxSize: 20, maxExpand: 1000 });
        return <span key={index} dangerouslySetInnerHTML={{ __html: html }}/>;
      } catch {
        return <code className="math-fallback" key={index} title="暂时无法排版，显示原公式">{part.raw}</code>;
      }
    });
  }, [children, inline, latex]);
  return inline ? <span className="math-text">{content}</span> : <div className="math-text extracted-document">{content}</div>;
}
