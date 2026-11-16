import type { InputHTMLAttributes } from 'react'

/** A labelled text-style input with the shared look. */
export default function FormField({ id, label, ...input }: { id: string; label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" {...input} />
    </div>
  )
}

/** A native colour picker wrapped in the shared label style. */
export function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (color: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full cursor-pointer rounded-2xl border-2 border-grape-100 bg-white p-1"
      />
    </div>
  )
}
