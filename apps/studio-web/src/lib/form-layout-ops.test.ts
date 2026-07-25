import type { FormLayout } from '@agentform/studio-design';
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  addField,
  moveField,
  moveFieldIntoContainer,
  normalizeFormLayout,
  removeField,
  setFieldWidget,
} from './form-layout-ops';

describe('normalizeFormLayout', () => {
  it('defaults input/output to empty arrays', () => {
    expect(normalizeFormLayout(undefined)).toEqual({ input: [], output: [] });
  });

  it('preserves existing content', () => {
    const layout: FormLayout = { input: [{ id: 'a', type: 'field', fieldPath: 'a' }] };
    expect(normalizeFormLayout(layout)).toEqual({ input: layout.input, output: [] });
  });
});

describe('addField', () => {
  it('appends a new field to an empty section', () => {
    const layout = addField({ input: [], output: [] }, 'input', { path: 'name', label: 'Name' });
    expect(layout.input).toEqual([{ id: 'name', type: 'field', label: 'Name', fieldPath: 'name' }]);
  });

  it('is a no-op when the field is already present', () => {
    const layout: FormLayout = { input: [{ id: 'name', type: 'field', fieldPath: 'name' }] };
    const result = addField(layout, 'input', { path: 'name', label: 'Name' });
    expect(result.input).toHaveLength(1);
  });

  it('does not touch the other section', () => {
    const layout = addField({ input: [], output: [] }, 'input', { path: 'name', label: 'Name' });
    expect(layout.output).toEqual([]);
  });
});

describe('removeField', () => {
  it('removes a top-level field', () => {
    const layout: FormLayout = { input: [{ id: 'name', type: 'field', fieldPath: 'name' }] };
    expect(removeField(layout, 'input', 'name').input).toEqual([]);
  });

  it('removes a field nested inside a container', () => {
    const layout: FormLayout = {
      input: [
        {
          id: 'group',
          type: 'container',
          children: [{ id: 'name', type: 'field', fieldPath: 'name' }],
        },
      ],
    };
    const result = removeField(layout, 'input', 'name');
    expect(result.input?.[0]?.children).toEqual([]);
  });

  it('is a no-op when the field is not present', () => {
    const layout: FormLayout = { input: [{ id: 'name', type: 'field', fieldPath: 'name' }] };
    expect(removeField(layout, 'input', 'ghost').input).toHaveLength(1);
  });
});

describe('setFieldWidget', () => {
  it('sets the widget on a top-level field', () => {
    const layout: FormLayout = { input: [{ id: 'name', type: 'field', fieldPath: 'name' }] };
    const result = setFieldWidget(layout, 'input', 'name', 'textarea');
    expect(result.input?.[0]?.widget).toBe('textarea');
  });

  it('sets the widget on a nested field', () => {
    const layout: FormLayout = {
      input: [
        {
          id: 'group',
          type: 'container',
          children: [{ id: 'name', type: 'field', fieldPath: 'name' }],
        },
      ],
    };
    const result = setFieldWidget(layout, 'input', 'name', 'number');
    expect(result.input?.[0]?.children?.[0]?.widget).toBe('number');
  });
});

describe('moveField', () => {
  const layout: FormLayout = {
    input: [
      { id: 'a', type: 'field', fieldPath: 'a' },
      { id: 'b', type: 'field', fieldPath: 'b' },
      { id: 'c', type: 'field', fieldPath: 'c' },
    ],
  };

  it('moves a field up', () => {
    const result = moveField(layout, 'input', 'b', 'up');
    expect(result.input?.map((n) => n.fieldPath)).toEqual(['b', 'a', 'c']);
  });

  it('moves a field down', () => {
    const result = moveField(layout, 'input', 'b', 'down');
    expect(result.input?.map((n) => n.fieldPath)).toEqual(['a', 'c', 'b']);
  });

  it('is a no-op moving the first field up', () => {
    const result = moveField(layout, 'input', 'a', 'up');
    expect(result.input?.map((n) => n.fieldPath)).toEqual(['a', 'b', 'c']);
  });

  it('is a no-op moving the last field down', () => {
    const result = moveField(layout, 'input', 'c', 'down');
    expect(result.input?.map((n) => n.fieldPath)).toEqual(['a', 'b', 'c']);
  });

  it('reorders within a nested container without affecting top-level siblings', () => {
    const nested: FormLayout = {
      input: [
        { id: 'x', type: 'field', fieldPath: 'x' },
        {
          id: 'group',
          type: 'container',
          children: [
            { id: 'a', type: 'field', fieldPath: 'a' },
            { id: 'b', type: 'field', fieldPath: 'b' },
          ],
        },
      ],
    };
    const result = moveField(nested, 'input', 'b', 'up');
    expect(result.input?.[1]?.children?.map((n) => n.fieldPath)).toEqual(['b', 'a']);
    expect(result.input?.[0]?.fieldPath).toBe('x');
  });
});

describe('addContainer', () => {
  it('slugifies the label into an id', () => {
    const result = addContainer({ input: [], output: [] }, 'input', 'Personal Details');
    expect(result.input?.[0]).toMatchObject({ id: 'personal-details', type: 'container', label: 'Personal Details' });
  });

  it('de-duplicates a colliding id', () => {
    const once = addContainer({ input: [], output: [] }, 'input', 'Group');
    const twice = addContainer(once, 'input', 'Group');
    expect(twice.input?.map((n) => n.id)).toEqual(['group', 'group-2']);
  });
});

describe('moveFieldIntoContainer', () => {
  it('moves a top-level field into a container, preserving its widget', () => {
    const layout: FormLayout = {
      input: [
        { id: 'name', type: 'field', fieldPath: 'name', widget: 'text' },
        { id: 'group', type: 'container', children: [] },
      ],
    };
    const result = moveFieldIntoContainer(layout, 'input', 'name', 'group');
    expect(result.input).toHaveLength(1);
    expect(result.input?.[0]?.children).toEqual([
      { id: 'name', type: 'field', fieldPath: 'name', widget: 'text' },
    ]);
  });

  it('is a no-op when the container does not exist', () => {
    const layout: FormLayout = { input: [{ id: 'name', type: 'field', fieldPath: 'name' }] };
    const result = moveFieldIntoContainer(layout, 'input', 'name', 'ghost-group');
    expect(result.input).toEqual(layout.input);
  });

  it('is a no-op when the field does not exist', () => {
    const layout: FormLayout = { input: [{ id: 'group', type: 'container', children: [] }] };
    const result = moveFieldIntoContainer(layout, 'input', 'ghost-field', 'group');
    expect(result.input?.[0]?.children).toEqual([]);
  });
});
