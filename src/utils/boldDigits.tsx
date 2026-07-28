import { Children, cloneElement, isValidElement, type ReactNode } from 'react';

/**
 * Maps plain digits 0-9 to their Unicode "Mathematical Bold" equivalents
 * (𝟎 𝟏 𝟐 𝟑 𝟒 𝟓 𝟔 𝟕 𝟖 𝟗 — U+1D7CE..U+1D7D7). These are real characters,
 * not a font style, so they render bold in *any* font/typeface.
 */
const BOLD_DIGITS: Record<string, string> = {
  '0': '𝟎',
  '1': '𝟏',
  '2': '𝟐',
  '3': '𝟑',
  '4': '𝟒',
  '5': '𝟓',
  '6': '𝟔',
  '7': '𝟕',
  '8': '𝟖',
  '9': '𝟗',
};

export function toBoldDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => BOLD_DIGITS[d]);
}

// Tags whose children must stay as real digits (form controls, raw code/markup)
// so typing, parsing, and editing amounts keeps working normally.
const SKIP_TAGS = new Set(['input', 'textarea', 'select', 'option', 'script', 'style', 'code', 'pre']);

function transform(node: ReactNode): ReactNode {
  if (typeof node === 'string') {
    return toBoldDigits(node);
  }
  if (typeof node === 'number') {
    return toBoldDigits(String(node));
  }
  if (!isValidElement(node)) {
    return node;
  }
  if (typeof node.type === 'string' && SKIP_TAGS.has(node.type)) {
    return node;
  }
  const children = (node.props as { children?: ReactNode }).children;
  if (children === undefined || children === null) {
    return node;
  }
  const transformedChildren = Children.map(children, transform);
  return cloneElement(node, undefined, transformedChildren);
}

/**
 * Wraps the app once (see main.tsx) and rewrites every plain digit rendered
 * anywhere inside — amounts, percentages, scores, dates, counts — into bold
 * Unicode digits. Form inputs are left untouched so editing/parsing still works.
 */
export default function BoldDigits({ children }: { children: ReactNode }) {
  return <>{Children.map(children, transform)}</>;
}
