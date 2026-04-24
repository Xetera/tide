import gleam/bit_array
import gleam/list
import gleam/option
import gleam/result
import gleam/uri

pub fn get_query_param(url: String, param: String) -> Result(String, Nil) {
  use parsed <- result.try(uri.parse(url))
  use query <- result.try(option.to_result(parsed.query, Nil))
  use pairs <- result.try(uri.parse_query(query))
  pairs
  |> list.find(fn(pair) { pair.0 == param })
  |> result.map(fn(pair) { pair.1 })
}

pub fn base64_decode_string(encoded: String) -> Result(String, Nil) {
  encoded
  |> bit_array.base64_decode()
  |> result.try(bit_array.to_string)
}
