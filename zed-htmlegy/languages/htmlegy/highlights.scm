; Comments
(line_comment) @comment

; Frontmatter
(frontmatter_entry
  key: (frontmatter_key) @property
  value: (frontmatter_value) @string)

; Keywords
"match" @keyword
"watch" @keyword
"await" @keyword

; Selectors
(each_selector
  (selector_body) @string.regex)
(single_selector
  (selector_body) @string.regex)

; Context / root refs
(context_ref) @variable.special
(root_ref) @variable.special
(alias_ref
  (identifier) @variable)
(alias_each_source
  (identifier) @variable)
(alias_single_source
  (identifier) @variable)

; Colon transforms
(colon_transform) @function.builtin

; Pipe transforms
(pipe_transform
  (identifier) @function)

; Pipe arg keyword
(pipe_arg
  key: (identifier) @variable.parameter)

; Object field keys
(field
  key: (string) @property)

; Arrow
"=>" @operator

; Fallback selector operator
(fallback_selector) @operator

; Pipe and conditional operators
"|" @operator
"?" @operator
":" @operator

; Strings
(string) @string
(escape_sequence) @string.escape

; Numbers
(number) @number

; Literals
(true) @boolean
(false) @boolean
(null) @constant.builtin

; Punctuation
"{" @punctuation.bracket
"}" @punctuation.bracket
"[" @punctuation.bracket
"]" @punctuation.bracket
"(" @punctuation.bracket
")" @punctuation.bracket
"," @punctuation.delimiter
