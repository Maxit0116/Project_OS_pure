import { Plus, Trash2 } from 'lucide-react'
import {
  newDutyItemId,
  dutyItemsFromPrompt,
  type IntentGraphNode,
  type LoopDutyItem,
} from '@contracts/index'
import { useI18n } from '../../i18n'
import TextInput from '../ui/TextInput'
import styles from './LoopNodeDutyEditor.module.css'

interface Props {
  node: IntentGraphNode
  readOnly?: boolean
  onChange: (patch: Partial<IntentGraphNode>) => void
}

export default function LoopNodeDutyEditor({
  node,
  readOnly = false,
  onChange,
}: Props) {
  const { ts } = useI18n()
  const items = node.dutyItems ?? []

  const commit = (nextItems: LoopDutyItem[]) => {
    onChange({
      dutyItems: nextItems,
      dutyEdited: true,
      // Keep prompt as a narrative summary for compile/legacy.
      prompt:
        nextItems.map((item) => item.text).join('\n') || node.prompt,
    })
  }

  const updateItem = (id: string, text: string) => {
    commit(
      items.map((item) =>
        item.id === id
          ? { ...item, text: text.slice(0, 240), source: 'user' as const }
          : item,
      ),
    )
  }

  const removeItem = (id: string) => {
    commit(items.filter((item) => item.id !== id))
  }

  const addItem = () => {
    commit([
      ...items,
      {
        id: newDutyItemId(),
        text: ts('chat.loopGraph.dutyNewItem'),
        kind: node.type === 'human' ? 'human' : 'machine',
        required: true,
        source: 'user',
      },
    ])
  }

  const convertFromPrompt = () => {
    const kind = node.type === 'human' ? 'human' : 'machine'
    const next = dutyItemsFromPrompt(node.prompt, {
      kind,
      source: 'user',
    })
    if (next.length === 0) {
      addItem()
      return
    }
    commit(next)
  }

  return (
    <div className={styles.editor} data-loop-duty-editor="">
      <div className={styles.header}>
        <span className={styles.label}>{ts('chat.loopGraph.dutyChecklist')}</span>
        {!readOnly ? (
          <div className={styles.actions}>
            {(items.length === 0 && node.prompt.trim()) || items.length === 0 ? (
              <button
                type="button"
                className={styles.linkBtn}
                onClick={convertFromPrompt}
              >
                {ts('chat.loopGraph.dutyConvertPrompt')}
              </button>
            ) : null}
            <button type="button" className={styles.iconBtn} onClick={addItem} aria-label={ts('chat.loopGraph.dutyAdd')}>
              <Plus size={14} strokeWidth={1.75} />
            </button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className={styles.empty}>
          {node.prompt.trim()
            ? ts('chat.loopGraph.dutyCapabilityHint')
            : ts('chat.loopGraph.dutyEmpty')}
        </p>
      ) : (
        <ul className={styles.list}>
          {items.map((item, index) => (
            <li key={item.id} className={styles.row}>
              <span className={styles.index} aria-hidden>
                {index + 1}
              </span>
              <TextInput
                fieldClassName={styles.field}
                value={item.text}
                disabled={readOnly}
                aria-label={ts('chat.loopGraph.dutyItemLabel', { index: index + 1 })}
                onChange={(event) => updateItem(item.id, event.target.value)}
              />
              {!readOnly ? (
                <button
                  type="button"
                  className={styles.iconBtn}
                  aria-label={ts('chat.loopGraph.dutyRemove')}
                  onClick={() => removeItem(item.id)}
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
