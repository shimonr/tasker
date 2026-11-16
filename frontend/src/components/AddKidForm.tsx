import { FormEvent, useState } from 'react'
import type { NewChild } from '../types'
import { DEFAULT_COLOR } from '../lib/tasks'
import EmojiPicker, { AVATARS } from './EmojiPicker'
import FormField, { ColorField } from './FormField'

interface AddKidFormProps {
  onSubmit: (child: NewChild) => Promise<unknown>
  onCancel: () => void
}

/** Create a kid's account in this family. Remount to start again. */
export default function AddKidForm({ onSubmit, onCancel }: AddKidFormProps) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0])
  const [color, setColor] = useState(DEFAULT_COLOR)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    await onSubmit({ full_name: fullName, email, username: username || undefined, password, avatar, color })
    setSaving(false)
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} aria-label="Add a kid">
      <FormField id="kid-name" label="Full name" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Mia Rivera" />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="kid-email" type="email" label="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <FormField
          id="kid-username"
          label="Username (optional)"
          autoCapitalize="none"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <FormField
        id="kid-password"
        type="password"
        label="Password (8+ characters)"
        autoComplete="new-password"
        minLength={8}
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <EmojiPicker value={avatar} onChange={setAvatar} />
      <ColorField id="kid-color" label="Favourite colour" value={color} onChange={setColor} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="submit" disabled={saving} className="btn-success flex-1">
          ✨ Add kid
        </button>
        <button type="button" className="btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
