import type { paths, components } from './generated/shoal-api'

type Op<P extends keyof paths, M extends keyof paths[P]> = paths[P][M]

type JsonBody<T> = T extends { content: { 'application/json': infer B } }
  ? B
  : never

type RequestBody<T> = T extends { requestBody: infer R } ? JsonBody<R> : never

type ResponseBody<
  T,
  S extends number,
> = T extends { responses: infer R }
  ? S extends keyof R
    ? JsonBody<R[S]>
    : never
  : never

export type JoinRequest = RequestBody<
  Op<'/api/pools/{pool_id}/join', 'post'>
>
export type JoinResponse = ResponseBody<
  Op<'/api/pools/{pool_id}/join', 'post'>,
  201
>


export type WorkerSitesResponse = ResponseBody<
  Op<'/api/pools/{pool_id}/workers/me/sites', 'get'>,
  200
>

export type PollResponse = ResponseBody<
  Op<'/api/pools/{pool_id}/workers/me/jobs', 'get'>,
  200
>

export type SubmitRequest = RequestBody<
  Op<'/api/pools/{pool_id}/workers/me/jobs', 'post'>
>

export type SubmitResponse = ResponseBody<
  Op<'/api/pools/{pool_id}/workers/me/jobs', 'post'>,
  201
>

export type HeartbeatResponse = ResponseBody<
  Op<'/api/pools/{pool_id}/workers/me/heartbeat', 'get'>,
  200
>

export type SyncSitesRequest = RequestBody<
  Op<'/api/pools/{pool_id}/workers/me/sites', 'put'>
>

export type SyncSitesResponse = ResponseBody<
  Op<'/api/pools/{pool_id}/workers/me/sites', 'put'>,
  200
>

export type ErrorResponse = components['schemas']['ErrorResponse']
