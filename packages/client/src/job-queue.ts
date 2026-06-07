import dayjs from 'dayjs'

export class JobQueue<T> {
  #lastJobDate: Date | null = null
  #queue: T[] = []
  #running = false
  #CHECK_INTERVAL = 100
  #timer?: NodeJS.Timeout

  constructor(private readonly options: JobQueueOptions<T>) {}

  addJob(job: T) {
    const nextLength = this.#queue.push(job)

    const queueWasEmpty = nextLength === 1
    if (this.#running && queueWasEmpty) {
      this.#tick()
    }
  }

  get size() {
    return this.#queue.length
  }

  start() {
    this.#running = true
    this.#timer = setInterval(() => {
      this.#tick()
    }, this.#CHECK_INTERVAL)
    this.#tick()
  }

  stop() {
    this.#running = false
    if (this.#timer) {
      clearInterval(this.#timer)
    }
  }

  #tick() {
    if (!this.#running) {
      return
    }

    if (this.#queue.length === 0) {
      return
    }

    if (!this.#canRunJob()) {
      return
    }

    const job = this.#queue.shift()
    if (job !== undefined) {
      this.options.run(job)
      this.#lastJobDate = new Date()
    }
  }

  #canRunJob() {
    return (
      this.#lastJobDate == null ||
      dayjs(this.#lastJobDate.getTime()).add(1, 'second').isBefore(new Date())
    )
  }
}

interface JobQueueOptions<T> {
  minimumWaitSeconds: number
  run(data: T): Promise<void> | void
}
