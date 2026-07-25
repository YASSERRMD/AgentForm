import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceForm } from './ResourceForm';

const MODEL_SCHEMA = {
  type: 'object',
  properties: {
    provider: { type: 'string' },
    temperature: { type: 'number' },
  },
};

describe('ResourceForm', () => {
  it('renders a text input for a string field, pre-filled from value', () => {
    render(
      <ResourceForm jsonSchema={MODEL_SCHEMA} value={{ provider: 'openai' }} onChange={vi.fn()} />,
    );

    expect(screen.getByDisplayValue('openai')).toBeInTheDocument();
  });

  it('calls onChange with the merged object when a field is edited', () => {
    const onChange = vi.fn();
    render(
      <ResourceForm jsonSchema={MODEL_SCHEMA} value={{ provider: 'openai' }} onChange={onChange} />,
    );

    fireEvent.change(screen.getByDisplayValue('openai'), { target: { value: 'anthropic' } });

    expect(onChange).toHaveBeenCalledWith({ provider: 'anthropic' });
  });

  it('renders a select for an enum field with its real declared options', () => {
    const schema = {
      type: 'object',
      properties: { role: { type: 'string', enum: ['assistant', 'reviewer'] } },
    };

    render(<ResourceForm jsonSchema={schema} value={{ role: 'assistant' }} onChange={vi.fn()} />);

    const select = screen.getByDisplayValue('assistant');
    expect(select.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'reviewer' })).toBeInTheDocument();
  });

  it('falls back to a raw JSON field for a free-form record with no fixed properties', () => {
    const schema = {
      type: 'object',
      properties: { metadata: { type: 'object', additionalProperties: {} } },
    };

    render(<ResourceForm jsonSchema={schema} value={{ metadata: { a: 1 } }} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue(/"a": 1/)).toBeInTheDocument();
  });

  it('recurses into a nested object field with fixed properties', () => {
    const schema = {
      type: 'object',
      properties: {
        limits: {
          type: 'object',
          properties: { maxSteps: { type: 'number' } },
        },
      },
    };

    render(
      <ResourceForm jsonSchema={schema} value={{ limits: { maxSteps: 4 } }} onChange={vi.fn()} />,
    );

    expect(screen.getByDisplayValue('4')).toBeInTheDocument();
  });
});
