import { FormEvent, useState } from 'react'
import type { ProfileUpdate, User } from '../types'
import { DEFAULT_COLOR, avatarFor } from '../lib/tasks'
import EmojiPicker from './EmojiPicker'
import FormField, { ColorField } from './FormField'

interface ProfileEditorProps {
  user: User
  onSave: (profile: ProfileUpdate) => void
}

/** Change my name, avatar emoji and colour. */
export default function ProfileEditor({ user, onSave }: ProfileEditorProps) {
  const [fullName, setFullName] = useState(user.full_name ?? '')
  const [avatar, setAvatar] = useState(avatarFor(user))
  const [color, setColor] = useState(user.color ?? DEFAULT_COLOR)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSave({ full_name: fullName, avatar, color })
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} aria-label="My look">
      <FormField id="profile-name" label="My name" required maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} />
      <EmojiPicker value={avatar} onChange={setAvatar} />
      <ColorField id="profile-color" label="My favourite colour" value={color} onChange={setColor} />
      <button type="submit" className="btn-primary w-full">
        💾 Save my look
      </button>
    </form>
  )
}
