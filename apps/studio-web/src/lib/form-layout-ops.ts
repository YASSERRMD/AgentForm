import type { FormLayout, LayoutNode, LayoutWidget } from '@agentform/studio-design';
import type { ExtractedField } from './extract-schema-fields';

export type FormLayoutSection = 'input' | 'output';

export function normalizeFormLayout(layout: FormLayout | undefined): FormLayout {
  return { input: layout?.input ?? [], output: layout?.output ?? [] };
}

function containsField(nodes: readonly LayoutNode[], fieldPath: string): boolean {
  return nodes.some(
    (node) =>
      (node.type === 'field' && node.fieldPath === fieldPath) ||
      containsField(node.children ?? [], fieldPath),
  );
}

function findFieldNode(nodes: readonly LayoutNode[], fieldPath: string): LayoutNode | undefined {
  for (const node of nodes) {
    if (node.type === 'field' && node.fieldPath === fieldPath) {
      return node;
    }
    const found = findFieldNode(node.children ?? [], fieldPath);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function removeFieldFromNodes(nodes: readonly LayoutNode[], fieldPath: string): LayoutNode[] {
  return nodes
    .filter((node) => !(node.type === 'field' && node.fieldPath === fieldPath))
    .map((node) =>
      node.children ? { ...node, children: removeFieldFromNodes(node.children, fieldPath) } : node,
    );
}

function setWidgetInNodes(
  nodes: readonly LayoutNode[],
  fieldPath: string,
  widget: LayoutWidget,
): LayoutNode[] {
  return nodes.map((node) => {
    if (node.type === 'field' && node.fieldPath === fieldPath) {
      return { ...node, widget };
    }
    return node.children ? { ...node, children: setWidgetInNodes(node.children, fieldPath, widget) } : node;
  });
}

function moveInNodes(
  nodes: readonly LayoutNode[],
  fieldPath: string,
  direction: 'up' | 'down',
): LayoutNode[] {
  const index = nodes.findIndex((node) => node.type === 'field' && node.fieldPath === fieldPath);
  if (index === -1) {
    return nodes.map((node) =>
      node.children ? { ...node, children: moveInNodes(node.children, fieldPath, direction) } : node,
    );
  }
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= nodes.length) {
    return [...nodes];
  }
  const next = [...nodes];
  [next[index], next[swapWith]] = [next[swapWith]!, next[index]!];
  return next;
}

function addContainerId(existing: readonly LayoutNode[], label: string): string {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'group';
  const usedIds = new Set(existing.map((node) => node.id));
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function containerExists(nodes: readonly LayoutNode[], containerId: string): boolean {
  return nodes.some(
    (node) =>
      (node.type === 'container' && node.id === containerId) ||
      containerExists(node.children ?? [], containerId),
  );
}

function insertIntoContainer(
  nodes: readonly LayoutNode[],
  containerId: string,
  field: LayoutNode,
): LayoutNode[] {
  return nodes.map((node) => {
    if (node.id === containerId && node.type === 'container') {
      return { ...node, children: [...(node.children ?? []), field] };
    }
    return node.children ? { ...node, children: insertIntoContainer(node.children, containerId, field) } : node;
  });
}

function updateSection(
  layout: FormLayout,
  section: FormLayoutSection,
  fn: (nodes: readonly LayoutNode[]) => readonly LayoutNode[],
): FormLayout {
  const normalized = normalizeFormLayout(layout);
  return { ...normalized, [section]: fn(normalized[section] ?? []) };
}

/** No-ops if the field is already present anywhere in this section. */
export function addField(layout: FormLayout, section: FormLayoutSection, field: ExtractedField): FormLayout {
  return updateSection(layout, section, (nodes) => {
    if (containsField(nodes, field.path)) {
      return nodes;
    }
    return [...nodes, { id: field.path, type: 'field', label: field.label, fieldPath: field.path }];
  });
}

export function removeField(layout: FormLayout, section: FormLayoutSection, fieldPath: string): FormLayout {
  return updateSection(layout, section, (nodes) => removeFieldFromNodes(nodes, fieldPath));
}

export function setFieldWidget(
  layout: FormLayout,
  section: FormLayoutSection,
  fieldPath: string,
  widget: LayoutWidget,
): FormLayout {
  return updateSection(layout, section, (nodes) => setWidgetInNodes(nodes, fieldPath, widget));
}

/** Reorders within whichever sibling list currently holds the field — top level or inside a container. */
export function moveField(
  layout: FormLayout,
  section: FormLayoutSection,
  fieldPath: string,
  direction: 'up' | 'down',
): FormLayout {
  return updateSection(layout, section, (nodes) => moveInNodes(nodes, fieldPath, direction));
}

/** Appends a new, empty container at the section's top level. Id is a slugified, de-duplicated form of the label. */
export function addContainer(layout: FormLayout, section: FormLayoutSection, label: string): FormLayout {
  return updateSection(layout, section, (nodes) => [
    ...nodes,
    { id: addContainerId(nodes, label), type: 'container', label, children: [] },
  ]);
}

/** Moves a field (wherever it currently is) into the named container's children, preserving its label/widget. No-ops if the field or container isn't found. */
export function moveFieldIntoContainer(
  layout: FormLayout,
  section: FormLayoutSection,
  fieldPath: string,
  containerId: string,
): FormLayout {
  return updateSection(layout, section, (nodes) => {
    const field = findFieldNode(nodes, fieldPath);
    if (!field || !containerExists(nodes, containerId)) {
      return nodes;
    }
    const withoutField = removeFieldFromNodes(nodes, fieldPath);
    return insertIntoContainer(withoutField, containerId, field);
  });
}
