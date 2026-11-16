import type { FamilyView } from '../types'
import { avatarFor, userName } from '../lib/tasks'

interface FamilyPanelProps {
  family: FamilyView
  onNewCode: () => void
  onNotify: (text: string, kind?: 'success' | 'error') => void
}

/** The link another grown-up or a kid opens to join this family. */
export const inviteLink = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL}join?code=${encodeURIComponent(code)}`

export default function FamilyPanel({ family, onNewCode, onNotify }: FamilyPanelProps) {
  const link = inviteLink(family.invite_code)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      onNotify('Invite link copied! 📋')
    } catch {
      onNotify("Couldn't copy it. Select the link and copy it yourself.", 'error')
    }
  }

  return (
    <section className="card border-leaf-200" aria-labelledby="family-heading">
      <h2 id="family-heading" className="text-2xl text-grape-900">
        🏠 {family.name}
      </h2>
      <p className="mt-1 text-grape-700">Invite another grown-up or a kid with this link. Anyone who has it can join.</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input readOnly aria-label="Invite link" value={link} className="input min-w-0 py-2 text-sm" />
        <button type="button" className="btn-primary btn-sm" onClick={copy}>
          📋 Copy link
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" className="btn-ghost btn-sm" onClick={onNewCode}>
          🎟️ New invite code
        </button>
        <span className="text-sm text-grape-400">A new code makes the old link stop working.</span>
      </div>

      <h3 className="mt-5 text-lg text-grape-900">Family members ({family.members.length})</h3>
      <ul aria-label="Family members" className="mt-2 space-y-2">
        {family.members.map((member) => (
          <li key={member.id} className="flex items-center gap-3 rounded-2xl bg-grape-50 px-3 py-2">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-2xl" style={{ backgroundColor: member.color ?? undefined }} aria-hidden="true">
              {avatarFor(member)}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{userName(member)}</span>
            <span className="chip bg-white text-grape-700">{member.role === 'child' ? '🌟 Kid' : '🦸 Parent'}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
