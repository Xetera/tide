import gleam/option
import gleam/regexp
import gleam/result
import media/fingerprint/types.{
  type IdentityError, type MediaRecord, IdentityError,
}

pub fn image_identity(media: MediaRecord) -> Result(String, IdentityError) {
  use re <- result.try(
    regexp.from_string("/(?:.+)_([0-9a-z]+)\\.[a-z]+$")
    |> result.map_error(fn(_) { IdentityError("invalid regex") }),
  )
  case regexp.scan(re, media.url) {
    [match, ..] ->
      case match.submatches {
        [option.Some(id), ..] -> Ok(id)
        _ -> Error(IdentityError("no image identity in shbdn url"))
      }
    _ -> Error(IdentityError("url does not match shbdn cdn filename pattern"))
  }
}
