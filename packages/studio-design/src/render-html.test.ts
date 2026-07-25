import { describe, expect, it } from 'vitest';
import { renderDesignToHtml } from './render-html.js';
import type { DesignArtifact } from './types.js';

function design(overrides: Partial<DesignArtifact> = {}): DesignArtifact {
  return {
    binding: { resourceType: 'agents', resourceId: 'assistant' },
    designVersion: '1',
    specVersionTarget: 'sha256:test',
    contentHash: 'sha256:test',
    ...overrides,
  };
}

describe('renderDesignToHtml', () => {
  it('renders an empty preview shell when there is no layout', () => {
    const html = renderDesignToHtml(design());
    expect(html).toContain('data-empty="true"');
  });

  it('renders input and output sections with field widgets', () => {
    const html = renderDesignToHtml(
      design({
        layout: {
          input: [{ id: 'name', type: 'field', label: 'Name', widget: 'text' }],
          output: [{ id: 'summary', type: 'field', label: 'Summary', widget: 'textarea' }],
        },
      }),
    );
    expect(html).toContain('af-form-input');
    expect(html).toContain('af-form-output');
    expect(html).toContain('<input type="text" name="name">');
    expect(html).toContain('<textarea name="summary"></textarea>');
    expect(html).toContain('Name');
    expect(html).toContain('Summary');
  });

  it('renders nested containers', () => {
    const html = renderDesignToHtml(
      design({
        layout: {
          input: [
            {
              id: 'group',
              type: 'container',
              label: 'Group',
              children: [{ id: 'age', type: 'field', widget: 'number' }],
            },
          ],
        },
      }),
    );
    expect(html).toContain('data-container-id="group"');
    expect(html).toContain('<input type="number" name="age">');
  });

  it('escapes user-provided label text, never injects raw markup', () => {
    const html = renderDesignToHtml(
      design({
        layout: {
          input: [{ id: 'f1', type: 'field', label: '<script>alert(1)</script>', widget: 'text' }],
        },
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('applies style tokens as CSS custom properties', () => {
    const html = renderDesignToHtml(
      design({
        layout: { input: [] },
        styleTokens: { spacing: { md: '12px' }, color: { primary: '#336' } },
      }),
    );
    expect(html).toContain('--af-spacing-md: 12px;');
    expect(html).toContain('--af-color-primary: #336;');
  });
});
