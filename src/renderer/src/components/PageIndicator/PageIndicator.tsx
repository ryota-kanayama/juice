import styles from './PageIndicator.module.css'

interface Props {
  totalPages: number
  currentPage: number
  onChangePage: (page: number) => void
}

export function PageIndicator({ totalPages, currentPage, onChangePage }: Props) {
  if (totalPages <= 1) return null

  return (
    <div className={styles.pageIndicator}>
      {Array.from({ length: totalPages }, (_, i) => (
        <button
          key={i}
          className={`${styles.pageDot} ${i === currentPage ? styles.pageDotActive : ''}`}
          onClick={() => onChangePage(i)}
          aria-label={`ページ ${i + 1}`}
        />
      ))}
    </div>
  )
}
