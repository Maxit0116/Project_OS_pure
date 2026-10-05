import { memo } from 'react'
import { ListTodo, Minus, Plus } from 'lucide-react'
import type { NodeProps } from '@xyflow/react'
import type { ChecklistItem, PlanMapArtifact } from '@contracts/index'
import { useI18n } from '../../i18n'
import MapArtifactChrome, { type MapArtifactNodeData } from './MapArtifactChrome'
import styles from './mapArtifactNodes.module.css'
import { newCriterionId, useDebouncedArtifactUpdate } from './useDebouncedArtifactUpdate'
import { useReconciledArtifactItems } from './useReconciledArtifactItems'

type Data = MapArtifactNodeData & { artifact: PlanMapArtifact }

function MapPlanNode({ data }: NodeProps & { data: Data }) {
  const { ts } = useI18n()
  const { schedule, flush } = useDebouncedArtifactUpdate(data.artifact.id)
  const [items, setItems] = useReconciledArtifactItems<ChecklistItem>(
    data.artifact.id,
    data.artifact.updatedAt,
    data.artifact.plan.items,
  )

  const persist = (nextItems: ChecklistItem[]) => {
    schedule({
      plan: {
        ...data.artifact.plan,
        items: nextItems,
      },
    })
  }

  const flushPlan = (nextItems: ChecklistItem[]) => {
    flush({
      plan: {
        ...data.artifact.plan,
        items: nextItems,
      },
    })
  }

  const updateItem = (id: string, patch: Partial<ChecklistItem>) => {
    const nextItems = items.map((item) => (item.id === id ? { ...item, ...patch } : item))
    setItems(nextItems)
    persist(nextItems)
  }

  const addItem = () => {
    const nextItems = [...items, { id: newCriterionId(), text: '', done: false }]
    setItems(nextItems)
    persist(nextItems)
    flushPlan(nextItems)
  }

  const removeItem = (id: string) => {
    const nextItems = items.filter((item) => item.id !== id)
    setItems(nextItems)
    persist(nextItems)
    flushPlan(nextItems)
  }

  return (
    <MapArtifactChrome
      artifact={data.artifact}
      artifactType="plan"
      typeIcon={<ListTodo size={14} strokeWidth={1.75} />}
      scopeLabel={data.scopeLabel}
      isSelected={data.isSelected}
      linked={data.linked}
      dimmed={data.dimmed}
      onHeaderContextMenu={data.onHeaderContextMenu}
    >
      <div className={`${styles.criteriaList} nodrag nopan`}>
        {items.map((item) => (
          <div key={item.id} className={`${styles.criteriaRow} nodrag nopan`}>
            <input
              type="checkbox"
              className="nodrag nopan"
              checked={item.done}
              onChange={(e) => {
                const nextItems = items.map((row) =>
                  row.id === item.id ? { ...row, done: e.target.checked } : row,
                )
                setItems(nextItems)
                persist(nextItems)
                flushPlan(nextItems)
              }}
            />
            <input
              className={`${styles.input} ${styles.criteriaInput} nodrag nopan`}
              value={item.text}
              placeholder={ts('mapArtifacts.planStepPlaceholder')}
              onChange={(e) => updateItem(item.id, { text: e.target.value })}
              onBlur={() => flushPlan(items)}
            />
            <button
              type="button"
              className={`${styles.removeCriterionBtn} nodrag nopan`}
              aria-label={ts('mapArtifacts.removeCriterion')}
              onClick={() => removeItem(item.id)}
            >
              <Minus size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className={`${styles.addBtn} nodrag nopan`} onClick={addItem}>
        <Plus size={12} strokeWidth={2} aria-hidden />
        {ts('mapArtifacts.addPlanStep')}
      </button>
    </MapArtifactChrome>
  )
}

export default memo(MapPlanNode)
