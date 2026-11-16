import { useId } from 'react'

export const AVATARS = ['🦊', '🐼', '🐸', '🦁', '🐯', '🐨', '🐙', '🦄', '🐶', '🐱', '🐵', '🐰', '🐻', '🐧', '🦖', '🚀']

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
}

/** Pick one avatar emoji from a grid of tiles. */
export default function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  const group = useId()
  return (
    <fieldset>
      <legend className="label">Avatar</legend>
      <div className="grid grid-cols-8 gap-1.5">
        {AVATARS.map((emoji) => (
          <label key={emoji} className="choice !px-0 text-2xl">
            <input type="radio" name={group} value={emoji} className="sr-only" checked={value === emoji} onChange={() => onChange(emoji)} />
            {emoji}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
