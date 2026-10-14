import type { ReactNode } from 'react'
import type { Task } from '../types'
import { groupTasks } from '../lib/tasks'

interface TaskSectionsProps {
  tasks: Task[]
  empty: ReactNode
  renderTask: (task: Task) => ReactNode
}

/** Tasks grouped by kind (one-time, daily, …), skipping empty groups. */
export default function TaskSections({ tasks, empty, renderTask }: TaskSectionsProps) {
  const sections = groupTasks(tasks)
  if (sections.length === 0) {
    return <div className="card border-dashed border-grape-200 py-10 text-center text-lg text-grape-700">{empty}</div>
  }
  return (
    <div className="space-y-8">
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`section-${section.key}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id={`section-${section.key}`} className="text-2xl text-grape-900">
              <span aria-hidden="true">{section.emoji}</span> {section.title}
            </h2>
            <span className="chip bg-white text-grape-700 shadow-chunky">{section.tasks.length}</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">{section.tasks.map(renderTask)}</div>
        </section>
      ))}
    </div>
  )
}
