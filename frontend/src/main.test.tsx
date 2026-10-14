const render = vi.fn()
vi.mock('react-dom/client', () => ({ default: { createRoot: vi.fn(() => ({ render })) } }))
vi.mock('./App', () => ({ default: () => null }))

it('mounts the app into #root', async () => {
  document.body.innerHTML = '<div id="root"></div>'
  const { default: ReactDOM } = await import('react-dom/client')
  await import('./main')
  expect(ReactDOM.createRoot).toHaveBeenCalledWith(document.getElementById('root'))
  expect(render).toHaveBeenCalledTimes(1)
})
