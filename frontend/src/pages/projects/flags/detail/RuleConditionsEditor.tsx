import { Plus, X } from 'lucide-react'
import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CONDITION_OPERATORS,
  type ConditionBlock,
  type ConditionNode,
  type ConditionOperator,
  type ConditionTree,
  isListOperator,
  MAX_CONDITIONS,
  MAX_TREE_DEPTH,
  normalizeConditionValue,
  type RuleMatchOperator,
} from '@/lib/targeting-rules'

export const fieldClass =
  'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

export interface LeafDraft {
  key: number
  type: 'condition'
  attribute: string
  operator: ConditionOperator
  value: string
}

export interface BlockDraft {
  key: number
  type: ConditionBlock['type']
  children: NodeDraft[]
}

export type NodeDraft = LeafDraft | BlockDraft

/** Root of the editor: AND or OR like the stored tree. */
export interface RootDraft extends BlockDraft {
  type: RuleMatchOperator
}

let draftKey = 0

const emptyLeaf = (): LeafDraft => ({
  key: ++draftKey,
  type: 'condition',
  attribute: '',
  operator: 'EQUALS',
  value: '',
})

/** A new block starts with one empty condition (blocks are never empty). */
const emptyBlock = (type: BlockDraft['type']): BlockDraft => ({
  key: ++draftKey,
  type,
  children: [emptyLeaf()],
})

export const emptyRoot = (): RootDraft => ({
  key: ++draftKey,
  type: 'AND',
  children: [emptyLeaf()],
})

const toDraft = (node: ConditionNode): NodeDraft =>
  node.type === 'condition'
    ? { ...node, key: ++draftKey }
    : { key: ++draftKey, type: node.type, children: node.children.map(toDraft) }

/** Editable copy of a rule's condition tree. */
export function draftFromTree(tree: ConditionTree): RootDraft {
  return {
    key: ++draftKey,
    type: tree.type,
    children: tree.children.length ? tree.children.map(toDraft) : [emptyLeaf()],
  }
}

const toNode = (draft: NodeDraft): ConditionNode =>
  draft.type === 'condition'
    ? {
        type: 'condition',
        attribute: draft.attribute.trim(),
        operator: draft.operator,
        value: normalizeConditionValue(draft.operator, draft.value),
      }
    : { type: draft.type, children: draft.children.map(toNode) }

/** The tree for the API (trimmed attributes, normalized list values). */
export function treeFromDraft(root: RootDraft): ConditionTree {
  return { type: root.type, children: root.children.map(toNode) }
}

/** Replaces the node with `key` anywhere below `node`. */
function mapNode(
  node: NodeDraft,
  key: number,
  update: (node: NodeDraft) => NodeDraft | null
): NodeDraft | null {
  if (node.key === key) return update(node)
  if (node.type === 'condition') return node
  return {
    ...node,
    children: node.children
      .map((child) => mapNode(child, key, update))
      .filter((child): child is NodeDraft => child !== null),
  }
}

interface RuleConditionsEditorProps {
  root: RootDraft
  onChange: (root: RootDraft) => void
}

/**
 * Conditions of a targeting rule, built from blocks like the conditions of
 * a Home Assistant automation: the top level combines its entries (all /
 * at least one), entries are conditions or AND / OR / NOT blocks, which can
 * hold conditions and further blocks. Conditions and blocks are numbered
 * in reading order for their labels.
 */
export function RuleConditionsEditor({
  root,
  onChange,
}: RuleConditionsEditorProps) {
  const { t } = useTranslation()

  // Running numbers in reading order (labels "Condition 3", "block 2")
  const leafNumber = new Map<number, number>()
  const blockNumber = new Map<number, number>()
  const number = (node: NodeDraft) => {
    if (node.type === 'condition') {
      leafNumber.set(node.key, leafNumber.size + 1)
      return
    }
    blockNumber.set(node.key, blockNumber.size + 1)
    node.children.forEach(number)
  }
  root.children.forEach(number)
  const full = leafNumber.size >= MAX_CONDITIONS

  const update = (key: number, change: (node: NodeDraft) => NodeDraft | null) =>
    onChange(mapNode(root, key, change) as RootDraft)

  const addChild = (parentKey: number, child: NodeDraft) =>
    update(parentKey, (node) =>
      node.type === 'condition'
        ? node
        : { ...node, children: [...node.children, child] }
    )

  const blockTitle = (type: BlockDraft['type']) =>
    type === 'AND'
      ? t('flag-detail.targeting.block-and')
      : type === 'OR'
        ? t('flag-detail.targeting.block-or')
        : t('flag-detail.targeting.block-not')

  /** "Condition / AND / OR / NOT" buttons of the root or of a block. */
  const addButtons = (parent: BlockDraft, depth: number) => {
    const n = blockNumber.get(parent.key)
    const label = (key: string) => (n === undefined ? undefined : t(key, { n }))
    const blocksAllowed = depth < MAX_TREE_DEPTH && !full
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => addChild(parent.key, emptyLeaf())}
          disabled={full}
          aria-label={label('flag-detail.targeting.add-condition-to-block')}
        >
          <Plus className="mr-1 h-4 w-4" />
          {t('flag-detail.targeting.add-condition')}
        </Button>
        {(['AND', 'OR', 'NOT'] as const).map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => addChild(parent.key, emptyBlock(type))}
            disabled={!blocksAllowed}
            aria-label={label(
              `flag-detail.targeting.add-${type.toLowerCase()}-block-to-block`
            )}
          >
            <Plus className="mr-1 h-4 w-4" />
            {type === 'AND'
              ? t('flag-detail.targeting.add-and-block')
              : type === 'OR'
                ? t('flag-detail.targeting.add-or-block')
                : t('flag-detail.targeting.add-not-block')}
          </Button>
        ))}
      </div>
    )
  }

  const renderLeaf = (leaf: LeafDraft, siblings: number) => {
    const n = leafNumber.get(leaf.key) ?? 0
    const change = (patch: Partial<LeafDraft>) =>
      update(leaf.key, (node) => ({ ...node, ...patch }) as NodeDraft)
    return (
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Input
            aria-label={t('flag-detail.targeting.condition-attribute', { n })}
            value={leaf.attribute}
            onChange={(e) => change({ attribute: e.target.value })}
            placeholder={t('flag-detail.targeting.attribute-placeholder')}
            maxLength={100}
            required
            className="sm:flex-1"
          />
          <select
            aria-label={t('flag-detail.targeting.condition-operator', { n })}
            value={leaf.operator}
            onChange={(e) =>
              change({ operator: e.target.value as ConditionOperator })
            }
            className={`${fieldClass} sm:w-44`}
          >
            {CONDITION_OPERATORS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>
          <Input
            aria-label={t('flag-detail.targeting.condition-value', { n })}
            value={leaf.value}
            onChange={(e) => change({ value: e.target.value })}
            placeholder={
              isListOperator(leaf.operator)
                ? 'DE, AT, CH'
                : t('flag-detail.targeting.value-placeholder')
            }
            maxLength={1000}
            required
            className="sm:flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 self-center text-muted-foreground hover:text-destructive"
            onClick={() => update(leaf.key, () => null)}
            // A block keeps at least one entry; remove the block instead
            disabled={siblings <= 1}
            aria-label={t('flag-detail.targeting.remove-condition', { n })}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {isListOperator(leaf.operator) && (
          <p className="mt-1 text-xs text-muted-foreground">
            {t('flag-detail.targeting.list-hint')}
          </p>
        )}
      </div>
    )
  }

  const renderBlock = (block: BlockDraft, depth: number) => {
    const n = blockNumber.get(block.key) ?? 0
    return (
      <div
        className={`space-y-2 rounded-md border p-3 ${
          block.type === 'NOT' ? 'border-destructive/40' : 'border-primary/40'
        } bg-muted/30`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold">
            {blockTitle(block.type)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => update(block.key, () => null)}
            aria-label={t('flag-detail.targeting.remove-block', { n })}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {renderChildren(block, depth)}
        {addButtons(block, depth)}
      </div>
    )
  }

  /** Entries of the root or a block, with AND / OR between them. */
  const renderChildren = (parent: BlockDraft, depth: number) => (
    <div className="space-y-2">
      {parent.children.map((child, index) => (
        <Fragment key={child.key}>
          {index > 0 && (
            <p className="text-xs font-semibold text-primary">
              {parent.type === 'AND' ? 'AND' : 'OR'}
            </p>
          )}
          {child.type === 'condition'
            ? renderLeaf(child, parent.children.length)
            : renderBlock(child, depth + 1)}
        </Fragment>
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium">
        {t('flag-detail.targeting.conditions')}
      </span>
      <div className="sm:w-72">
        <label
          htmlFor="rule-match"
          className="block text-xs font-medium text-muted-foreground"
        >
          {t('flag-detail.targeting.match')}
        </label>
        <select
          id="rule-match"
          value={root.type}
          onChange={(e) =>
            onChange({ ...root, type: e.target.value as RuleMatchOperator })
          }
          className={`${fieldClass} mt-1`}
        >
          <option value="AND">
            {t('flag-detail.targeting.match-all-tree')}
          </option>
          <option value="OR">
            {t('flag-detail.targeting.match-any-tree')}
          </option>
        </select>
      </div>
      {renderChildren(root, 1)}
      {addButtons(root, 1)}
    </div>
  )
}
