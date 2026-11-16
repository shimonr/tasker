import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import EmojiPicker from './EmojiPicker'
import FormField, { ColorField } from './FormField'

describe('FormField and ColorField', () => {
  it('labels a text input and reports what was typed', async () => {
    const onChange = vi.fn()
    render(<FormField id="nick" label="Nickname" value="" onChange={onChange} maxLength={5} />)
    const input = screen.getByLabelText('Nickname')
    expect(input).toHaveClass('input')
    expect(input).toHaveAttribute('maxLength', '5')
    await userEvent.type(input, 'a')
    expect(onChange).toHaveBeenCalled()
  })

  it('picks a colour', async () => {
    const onChange = vi.fn()
    render(<ColorField id="colour" label="Favourite colour" value="#ff4fa0" onChange={onChange} />)
    const input = screen.getByLabelText('Favourite colour')
    expect(input).toHaveAttribute('type', 'color')
    expect(input).toHaveValue('#ff4fa0')
    fireEvent.change(input, { target: { value: '#000000' } })
    expect(onChange).toHaveBeenCalledWith('#000000')
  })
})

describe('EmojiPicker', () => {
  it('shows the chosen avatar and reports a new pick', async () => {
    const onChange = vi.fn()
    render(<EmojiPicker value="🦊" onChange={onChange} />)
    expect(screen.getByLabelText('🦊')).toBeChecked()
    expect(screen.getByLabelText('🐼')).not.toBeChecked()
    await userEvent.click(screen.getByLabelText('🦄'))
    expect(onChange).toHaveBeenCalledWith('🦄')
  })

  it('keeps each picker in its own group', async () => {
    const Harness = () => {
      const [value, setValue] = useState('🦊')
      return (
        <>
          <EmojiPicker value={value} onChange={setValue} />
          <EmojiPicker value="🐼" onChange={() => {}} />
          <p data-testid="picked">{value}</p>
        </>
      )
    }
    render(<Harness />)
    const [first, second] = screen.getAllByLabelText('🐼')
    expect(first.getAttribute('name')).not.toBe(second.getAttribute('name'))
    expect(second).toBeChecked()
    await userEvent.click(screen.getAllByLabelText('🐸')[0])
    expect(screen.getByTestId('picked')).toHaveTextContent('🐸')
    expect(second).toBeChecked()
  })
})
