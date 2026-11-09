import { useEffect, useRef, useState } from 'react'
import { PROJECT_DESCRIPTION_MAX_CHARACTERS } from '@contracts/index'
import { useI18n } from '../../i18n'
import { useWorkbenchStore } from '../../state/workbenchStore'
import Button from '../ui/Button'
import TextArea from '../ui/TextArea'
import SettingsGroup from './SettingsGroup'
import SettingsRow from './SettingsRow'
import styles from './SettingsPanel.module.css'
import {
  normalizedProjectDescriptionDraft,
  reconcileProjectDescriptionDraft,
} from './projectDescriptionDraft'

export default function ProjectDescriptionSection() {
  const projectDescription = useWorkbenchStore((state) => state.projectDescription)
  const saving = useWorkbenchStore((state) => state.projectDescriptionSaving)
  const saveProjectDescription = useWorkbenchStore((state) => state.saveProjectDescription)
  const { ts } = useI18n()
  const [draft, setDraft] = useState(projectDescription?.conciseDescription ?? '')
  const sourceRef = useRef(projectDescription?.conciseDescription ?? '')
  const projectIdRef = useRef(projectDescription?.projectId)

  useEffect(() => {
    const nextSource = projectDescription?.conciseDescription ?? ''
    setDraft((currentDraft) => {
      if (projectIdRef.current !== projectDescription?.projectId) {
        projectIdRef.current = projectDescription?.projectId
        sourceRef.current = nextSource
        return nextSource
      }
      const next = reconcileProjectDescriptionDraft({
        draft: currentDraft,
        source: sourceRef.current,
      }, nextSource)
      sourceRef.current = next.source
      return next.draft
    })
  }, [projectDescription])

  if (!projectDescription) return null

  const characterCount = [...draft].length
  const unchanged = draft.trim() === projectDescription.conciseDescription

  return (
    <section className={styles.section}>
      <SettingsGroup label={ts('settings.projectDescriptionLabel')}>
        <SettingsRow
          title={ts('settings.projectDescriptionTitle')}
          description={ts('settings.projectDescriptionHelp')}
          stacked
        >
          <TextArea
            value={draft}
            rows={7}
            aria-label={ts('settings.projectDescriptionLabel')}
            onChange={(event) => {
              if ([...event.target.value].length <= PROJECT_DESCRIPTION_MAX_CHARACTERS) {
                setDraft(event.target.value)
              }
            }}
          />
          <div className={styles.descriptionMeta}>
            <span>
              {ts('settings.projectDescriptionSource', {
                source: ts(`settings.projectDescriptionSources.${projectDescription.source}`),
              })}
            </span>
            <span>
              {ts('settings.projectDescriptionCount', {
                count: characterCount,
                max: PROJECT_DESCRIPTION_MAX_CHARACTERS,
              })}
            </span>
          </div>
          <div className={styles.rowActions}>
            <Button
              onClick={() => void saveProjectDescription(normalizedProjectDescriptionDraft(draft))}
              disabled={saving || !draft.trim() || unchanged}
            >
              {saving ? ts('settings.projectDescriptionSaving') : ts('settings.projectDescriptionSave')}
            </Button>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </section>
  )
}
