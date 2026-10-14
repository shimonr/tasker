import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import api, * as client from './api'

type Reply = { status: number; data?: unknown } | 'network'
let reply: Reply
let requests: InternalAxiosRequestConfig[]

beforeEach(() => {
  reply = { status: 200, data: { ok: true } }
  requests = []
  api.defaults.adapter = async (config) => {
    requests.push(config)
    if (reply === 'network') throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    const response = { data: reply.data, status: reply.status, statusText: 'x', headers: {}, config }
    if (reply.status >= 400) throw new AxiosError('fail', 'ERR_BAD_RESPONSE', config, null, response)
    return response
  }
})

const last = () => requests[requests.length - 1]

describe('api client', () => {
  it('sends each call to the right endpoint and unwraps data', async () => {
    const calls: [() => Promise<unknown>, string, string, unknown?][] = [
      [() => client.forgotPassword('a@b.c'), 'post', '/auth/forgot-password', { email: 'a@b.c' }],
      [() => client.resetPasswordWithToken('tok', 'pw'), 'post', '/auth/reset-password', { token: 'tok', new_password: 'pw' }],
      [() => client.getMe(), 'get', '/me'],
      [() => client.fetchUsers(), 'get', '/admin/users'],
      [() => client.createUser({ email: 'a@b.c', role: 'child', password: 'pw' }), 'post', '/admin/users'],
      [() => client.updateUser(4, { full_name: 'X' }), 'put', '/admin/users/4', { full_name: 'X' }],
      [() => client.deleteUser(4), 'delete', '/admin/users/4'],
      [() => client.resetPassword('a@b.c', 'pw'), 'post', '/admin/reset-password', { email: 'a@b.c', new_password: 'pw' }],
      [() => client.fetchChildren(), 'get', '/parent/children'],
      [() => client.fetchParentTasks(), 'get', '/parent/tasks'],
      [() => client.fetchStats(), 'get', '/parent/tasks/stats'],
      [() => client.createTask({ title: 't', assignee_ids: [], task_type: 'adhoc' }), 'post', '/parent/tasks'],
      [() => client.updateTask(5, { title: 't', assignee_ids: [], task_type: 'adhoc' }), 'put', '/parent/tasks/5'],
      [() => client.deleteTask(5), 'delete', '/parent/tasks/5'],
      [() => client.advanceTask(5), 'post', '/parent/tasks/5/advance'],
      [() => client.fetchTaskLogs(5), 'get', '/parent/tasks/5/log'],
      [() => client.updateTaskStatus(5, 'failed'), 'post', '/tasks/5/status', { status: 'failed' }],
      [() => client.updateOccurrenceStatus(7, 'completed'), 'put', '/occurrences/7/status', { status: 'completed' }],
      [() => client.fetchChildTasks(), 'get', '/child/tasks'],
      [() => client.fetchChildStats(), 'get', '/child/stats'],
      [() => client.completeTask(5), 'post', '/child/tasks/5/complete'],
      [() => client.completeOccurrence(7), 'post', '/occurrences/7/complete'],
    ]
    for (const [call, method, url, body] of calls) {
      await expect(call()).resolves.toEqual({ ok: true })
      expect([last().method, last().url, last().baseURL]).toEqual([method, url, '/api'])
      if (body) expect(JSON.parse(last().data)).toEqual(body)
    }
  })

  it('logs in with a form-encoded body', async () => {
    reply = { status: 200, data: { access_token: 'abc' } }
    await expect(client.login('mia', 'secret')).resolves.toEqual({ access_token: 'abc' })
    expect(last().data.toString()).toBe('username=mia&password=secret')
  })

  it('sets and clears the bearer token', async () => {
    client.setAuthToken('tok')
    await client.getMe()
    expect(AxiosHeaders.from(last().headers).get('Authorization')).toBe('Bearer tok')
    client.setAuthToken(null)
    await client.getMe()
    expect(AxiosHeaders.from(last().headers).has('Authorization')).toBe(false)
  })

  it('turns errors into friendly messages', async () => {
    reply = { status: 400, data: { detail: 'Email or username already registered' } }
    await expect(client.fetchUsers()).rejects.toThrow('Email address or username has already been used.')
    reply = { status: 400, data: { detail: 'Nope' } }
    await expect(client.fetchUsers()).rejects.toThrow('Nope')
    reply = { status: 422, data: { detail: [{ loc: ['body', 'password'], msg: 'too short' }, { loc: ['body', 'email'], msg: 'bad' }] } }
    await expect(client.fetchUsers()).rejects.toThrow('password: too short email: bad')
    reply = { status: 500, data: 'oops' }
    await expect(client.fetchUsers()).rejects.toThrow('Something went wrong. Please try again.')
    reply = 'network'
    await expect(client.fetchUsers()).rejects.toThrow("Can't reach the server")
    expect(client.messageFrom(new Error('plain'))).toBe('Something went wrong. Please try again.')
  })

  it('calls the unauthorized handler on 401 except for the login call', async () => {
    reply = { status: 401, data: { detail: 'Incorrect user or password' } }
    await expect(client.getMe()).rejects.toThrow() // default handler is a harmless no-op
    const handler = vi.fn()
    client.setUnauthorizedHandler(handler)
    await expect(client.login('mia', 'bad')).rejects.toThrow('Incorrect user or password')
    expect(handler).not.toHaveBeenCalled()
    await expect(client.getMe()).rejects.toThrow()
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
