import { useEffect, useState } from 'react'
import { TOUR_STEPS, type TourStep } from './tourSteps'

const STORAGE_KEY = 'juice.tourCompleted'

export interface TourState {
  isActive: boolean
  index: number
  total: number
  step: TourStep | null
  isLast: boolean
  start: () => void
  next: () => void
  prev: () => void
  skip: () => void
  finish: () => void
}

export function useTour(): TourState {
  // null = 非アクティブ
  const [index, setIndex] = useState<number | null>(null)

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) !== 'true') setIndex(0)
  }, [])

  const total = TOUR_STEPS.length
  const isActive = index !== null
  const step = index !== null ? TOUR_STEPS[index] : null

  const complete = (): void => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setIndex(null)
  }

  return {
    isActive,
    index: index ?? 0,
    total,
    step,
    isLast: index === total - 1,
    start: () => setIndex(0),
    next: () => setIndex(i => (i === null ? i : Math.min(total - 1, i + 1))),
    prev: () => setIndex(i => (i === null ? i : Math.max(0, i - 1))),
    skip: complete,
    finish: complete,
  }
}
