import type { DesignArtifact, LayoutNode, StyleTokens } from './types.js';

const WIDGET_MARKUP: Record<NonNullable<LayoutNode['widget']>, (id: string) => string> = {
  text: (id) => `<input type="text" name="${id}">`,
  textarea: (id) => `<textarea name="${id}"></textarea>`,
  number: (id) => `<input type="number" name="${id}">`,
  select: (id) => `<select name="${id}"></select>`,
  checkbox: (id) => `<input type="checkbox" name="${id}">`,
  date: (id) => `<input type="date" name="${id}">`,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

function renderNode(node: LayoutNode): string {
  const label = node.label ? `<span class="af-label">${escapeHtml(node.label)}</span>` : '';

  if (node.type === 'field') {
    const markup = node.widget ? WIDGET_MARKUP[node.widget](escapeAttribute(node.id)) : '';
    return `<label class="af-field" data-field-id="${escapeAttribute(node.id)}">${label}${markup}</label>`;
  }

  const children = (node.children ?? []).map(renderNode).join('');
  return `<div class="af-container" data-container-id="${escapeAttribute(node.id)}">${label}${children}</div>`;
}

function renderStyleTokenVariables(styleTokens: StyleTokens): string {
  const declarations: string[] = [];
  for (const [group, tokens] of Object.entries(styleTokens)) {
    if (!tokens) {
      continue;
    }
    for (const [name, value] of Object.entries(tokens)) {
      declarations.push(`--af-${group}-${name}: ${escapeAttribute(String(value))};`);
    }
  }
  return declarations.join(' ');
}

/**
 * Compiles a form-layout design artifact to a static HTML preview — the
 * "render target" §34.6 requires. Purely structural: it renders the layout
 * tree and widget choices, never anything from the design's own or the
 * spec's runtime data, so there is nothing here that could leak a secret —
 * fields render as empty, named inputs, never pre-filled values.
 */
export function renderDesignToHtml(design: DesignArtifact): string {
  if (!design.layout) {
    return '<div class="af-design-preview" data-empty="true"></div>';
  }

  const style = design.styleTokens
    ? ` style="${renderStyleTokenVariables(design.styleTokens)}"`
    : '';
  const sections: string[] = [];
  if (design.layout.input) {
    sections.push(
      `<section class="af-form-input" aria-label="Input">${design.layout.input.map(renderNode).join('')}</section>`,
    );
  }
  if (design.layout.output) {
    sections.push(
      `<section class="af-form-output" aria-label="Output">${design.layout.output.map(renderNode).join('')}</section>`,
    );
  }

  return `<div class="af-design-preview"${style}>${sections.join('')}</div>`;
}
