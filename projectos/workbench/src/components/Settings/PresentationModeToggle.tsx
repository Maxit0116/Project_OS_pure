import styles from './SettingsPanel.module.css'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
}

export default function PresentationModeToggle({
  checked,
  onChange,
  label,
  description,
}: Props) {
  return (
    <label className={styles.toggleRow}>
      <div>
        <div className={styles.toggleLabel}>{label}</div>
        {description && <div className={styles.toggleDesc}>{description}</div>}
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={styles.toggleInput}
      />
    </label>
  )
}
