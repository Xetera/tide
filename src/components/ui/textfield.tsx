import { cn } from '~/cn'
import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import * as TextFieldPrimitive from '@kobalte/core/text-field'
import type { ValidComponent, VoidProps } from 'solid-js'
import { splitProps } from 'solid-js'

type TextFieldProps = TextFieldPrimitive.TextFieldRootProps & {
  class?: string
}

export const TextFieldRoot = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, TextFieldProps>,
) => {
  const [local, rest] = splitProps(props as TextFieldProps, ['class'])
  return (
    <TextFieldPrimitive.Root class={cn('flex flex-col gap-1', local.class)} {...rest} />
  )
}

type TextFieldLabelProps = TextFieldPrimitive.TextFieldLabelProps & {
  class?: string
}

export const TextFieldLabel = <T extends ValidComponent = 'label'>(
  props: PolymorphicProps<T, TextFieldLabelProps>,
) => {
  const [local, rest] = splitProps(props as TextFieldLabelProps, ['class'])
  return (
    <TextFieldPrimitive.Label
      class={cn('t-label', local.class)}
      {...rest}
    />
  )
}

type TextFieldErrorMessageProps = TextFieldPrimitive.TextFieldErrorMessageProps & {
  class?: string
}

export const TextFieldErrorMessage = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, TextFieldErrorMessageProps>,
) => {
  const [local, rest] = splitProps(props as TextFieldErrorMessageProps, ['class'])
  return (
    <TextFieldPrimitive.ErrorMessage
      class={cn('text-[var(--destructive)] text-[11px]', local.class)}
      {...rest}
    />
  )
}

type TextFieldDescriptionProps = TextFieldPrimitive.TextFieldDescriptionProps & {
  class?: string
}

export const TextFieldDescription = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, TextFieldDescriptionProps>,
) => {
  const [local, rest] = splitProps(props as TextFieldDescriptionProps, ['class'])
  return (
    <TextFieldPrimitive.Description
      class={cn('t-mono-xs', local.class)}
      {...rest}
    />
  )
}

type TextFieldInputProps = VoidProps<
  TextFieldPrimitive.TextFieldDescriptionProps & {
    class?: string
    readOnly?: boolean
  }
>

export const TextField = <T extends ValidComponent = 'input'>(
  props: PolymorphicProps<T, TextFieldInputProps>,
) => {
  const [local, rest] = splitProps(props as TextFieldInputProps, ['class', 'readOnly'])
  return (
    <TextFieldPrimitive.Input
      class={cn('input', local.readOnly && 'input-readonly', local.class)}
      readOnly={local.readOnly}
      {...rest}
    />
  )
}
