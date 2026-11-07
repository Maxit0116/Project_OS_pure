import Switch from '../ui/Switch'
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
    <div className={styles.toggleRow}>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        label={label}
        description={description}
        aria-label={label}
      />
    </div>
  )
}
