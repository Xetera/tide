import type {
  ArrayFieldDescriptor,
  FieldDescriptor,
  LiteralFieldDescriptor,
  NodeFieldDescriptor,
  VariantDescriptor,
} from './scrapeer'

export interface FieldVisitor {
  onNodeField?(path: string, descriptor: NodeFieldDescriptor): void
  onArrayField?(path: string, descriptor: ArrayFieldDescriptor): void
  onLiteralField?(path: string, descriptor: LiteralFieldDescriptor): void
  onVariantArray?(path: string, variants: VariantDescriptor[]): void
  onVariant?(path: string, variant: VariantDescriptor): void
}

function isNodeField(value: FieldDescriptor): value is NodeFieldDescriptor {
  return !('$selectorEach' in value) && !('$literal' in value) && ('$extractor' in value || '$fields' in value || '$selector' in value || '$ifMissing' in value)
}

function isArrayField(value: FieldDescriptor): value is ArrayFieldDescriptor {
  return '$selectorEach' in value
}

function isLiteral(value: FieldDescriptor): value is LiteralFieldDescriptor {
  return '$literal' in value
}

export function walkFields(
  fields: Record<string, FieldDescriptor>,
  visitor: FieldVisitor,
  prefix = '',
) {
  for (const [key, descriptor] of Object.entries(fields)) {
    const path = prefix ? `${prefix}.${key}` : key

    if (Array.isArray(descriptor)) {
      visitor.onVariantArray?.(path, descriptor)
      for (const variant of descriptor) {
        visitor.onVariant?.(path, variant)
        if (variant.$fields) {
          walkFields(variant.$fields, visitor, path)
        }
      }
    } else if (isLiteral(descriptor)) {
      visitor.onLiteralField?.(path, descriptor)
    } else if (isArrayField(descriptor)) {
      visitor.onArrayField?.(path, descriptor)
      if (descriptor.$fields) {
        walkFields(descriptor.$fields, visitor, path)
      }
    } else if (isNodeField(descriptor)) {
      visitor.onNodeField?.(path, descriptor)
      if (descriptor.$fields) {
        walkFields(descriptor.$fields, visitor, path)
      }
    }
  }
}
