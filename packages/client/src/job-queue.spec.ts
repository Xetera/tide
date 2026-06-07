import { describe, it, expect, vitest, vi } from 'vitest'
import { JobQueue } from './job-queue'

describe('job-queue', () => {
  const job = 69

  it('should immediately run the first queued job', () => {
    const fn = vi.fn()
    const q = new JobQueue<number>({ minimumWaitSeconds: 1, run: fn })
    q.addJob(job)
    q.start()
    expect(fn.mock.calls.length).toBe(1)
  })

  it('should wait until the minimum time to run the next job', () => {
    const fn = vi.fn()
    const q = new JobQueue<number>({ minimumWaitSeconds: 1, run: fn })
    vitest.useFakeTimers()
    q.addJob(job)
    q.addJob(job)
    q.addJob(job)
    q.start()
    expect(fn.mock.calls.length).toBe(1)
    vitest.advanceTimersByTime(1200)
    expect(fn.mock.calls.length).toBe(2)
    vitest.advanceTimersByTime(1100)
    expect(fn.mock.calls.length).toBe(3)
    vitest.useRealTimers()
  })

  it("should throttle if the minimum time has't been reached", () => {
    const fn = vi.fn()
    const q = new JobQueue<number>({ minimumWaitSeconds: 1, run: fn })
    vitest.useFakeTimers()
    q.addJob(job)
    q.addJob(job)
    q.addJob(job)
    q.start()
    expect(fn.mock.calls.length).toBe(1)
    vitest.advanceTimersByTime(900)
    expect(fn.mock.calls.length).toBe(1)
    vitest.useRealTimers()
  })
  it('should stop abruptly in the middle of checks', () => {
    const fn = vi.fn()
    const q = new JobQueue<number>({ minimumWaitSeconds: 1, run: fn })
    vitest.useFakeTimers()
    q.addJob(job)
    q.addJob(job)
    q.start()
    vitest.advanceTimersByTime(800)
    q.stop()
    vitest.advanceTimersByTime(800)
    expect(fn.mock.calls.length).toBe(1)
  })

  it('should derive size properly', () => {
    const fn = vi.fn()
    const q = new JobQueue<number>({ minimumWaitSeconds: 1, run: fn })
    vitest.useFakeTimers()
    expect(q.size).toBe(0)
    q.addJob(job)
    q.addJob(job)
    expect(q.size).toBe(2)
    q.start()
    vitest.advanceTimersByTime(1100)
    expect(q.size).toBe(0)
  })
})
