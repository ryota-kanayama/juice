export interface TimeInterval {
  startTime: string
  endTime: string | null
}

export interface Session {
  id: string
  taskId: string
  name: string
  projectCode: string
  workCategory: string
  times: TimeInterval[]
  date: string
  color: string
  totalTime: number
}

export interface SessionFile {
  sessions: Session[]
}
