import { useState } from 'react'
import styles from './TimerForm.module.css'

interface Props {
  onStart: (name: string) => void
}

export function TimerForm({ onStart }: Props) {
  const [name, setName] = useState('')

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault()
    if (!name.trim()) return
    onStart(name.trim())
    setName('')
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <input
        className={styles.input}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="どんなジュースにしますか？"
        type="text"
        aria-label="ジュースの種類"
        autoFocus
      />
      <button
        className={styles.button}
        type="submit"
        disabled={!name.trim()}
      >
        注ぐ
      </button>
    </form>
  )
}
