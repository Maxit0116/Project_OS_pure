import { useI18n } from '../../../i18n'
import Button from '../../ui/Button'
import styles from './FirstPrinciples.module.css'

interface Props {
  onAccept: () => void
  onDismiss: () => void
}

export default function FirstPrinciplesSuggestChip({ onAccept, onDismiss }: Props) {
  const { ts } = useI18n()
  return (
    <div className={styles.suggestChip} role="status">
      <span>{ts('firstPrinciples.suggestChip')}</span>
      <div className={styles.suggestActions}>
        <Button variant="mode" onClick={onAccept}>
          {ts('firstPrinciples.suggestStart')}
        </Button>
        <Button variant="secondary" onClick={onDismiss}>
          {ts('firstPrinciples.suggestDismiss')}
        </Button>
      </div>
    </div>
  )
}
