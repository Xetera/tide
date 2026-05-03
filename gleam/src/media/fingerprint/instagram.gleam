import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/option
import gleam/regexp
import gleam/result
import gleam/string
import media/fingerprint/shared
import media/fingerprint/types.{type IdentityError, type MediaRecord, IdentityError}

fn image_identity_from_cache_key(
  url: String,
) -> Result(String, IdentityError) {
  use cache_key <- result.try(
    shared.get_query_param(url, "ig_cache_key")
    |> result.map_error(types.err("missing ig_cache_key query param")),
  )
  use b64 <- result.try(
    cache_key
    |> string.split(".")
    |> list.first()
    |> result.map_error(types.err("ig_cache_key has no segments")),
  )
  shared.base64_decode_string(b64)
  |> result.map_error(types.err("failed to base64 decode ig_cache_key"))
}

fn image_identity_from_filename(url: String) -> Result(String, IdentityError) {
  // no clue if this is actually the identity or what the other fields represent
  use re <- result.try(
    regexp.from_string("/v/t[0-9.\\-]+/([0-9]+_[0-9]+_[0-9]+)_n\\.[a-z]+")
    |> result.map_error(fn(_) { IdentityError("invalid regex") }),
  )
  case regexp.scan(re, url) {
    [match, ..] ->
      case match.submatches {
        [option.Some(id), ..] -> Ok(id)
        _ -> Error(IdentityError("no instagram id in url"))
      }
    _ ->
      Error(IdentityError("url does not match instagram cdn filename pattern"))
  }
}

pub fn image_identity(media: MediaRecord) -> Result(String, IdentityError) {
  result.lazy_or(image_identity_from_cache_key(media.url), fn() {
    image_identity_from_filename(media.url)
  })
}

fn video_identity_from_efg(url: String) -> Result(String, IdentityError) {
  use efg <- result.try(
    shared.get_query_param(url, "efg")
    |> result.map_error(types.err("missing efg query param")),
  )
  use decoded <- result.try(
    shared.base64_decode_string(efg)
    |> result.map_error(types.err("failed to base64 decode efg")),
  )
  let decoder = decode.at(["xpv_asset_id"], decode.int)
  json.parse(decoded, decoder)
  |> result.map(int.to_string)
  |> result.map_error(types.err("xpv_asset_id not found in efg"))
}

pub fn video_identity(media: MediaRecord) -> Result(String, IdentityError) {
  result.lazy_or(video_identity_from_efg(media.url), fn() {
    image_identity(media)
  })
}
