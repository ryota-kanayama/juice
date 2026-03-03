import styles from './DurationEditDialog.module.css'

interface Props {
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function DurationEditDialog({ value, onChange, onConfirm, onClose }: Props) {
  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <p className={styles.title}>合計時間を編集</p>
        <div className={styles.row}>
          <input
            className={styles.input}
            type="number"
            min="1"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onConfirm()
              if (e.key === 'Escape') onClose()
            }}
            autoFocus
          />
          <span className={styles.unit}>分</span>
        </div>
        <div className={styles.actions}>
          <button className={styles.cancelButton} onClick={onClose}>キャンセル</button>
          <button className={styles.confirmButton} onClick={onConfirm}>確定</button>
        </div>
      </div>
    </div>
  )
}
