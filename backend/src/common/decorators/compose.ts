/**
 * Gabungkan beberapa property decorator menjadi satu, dijalankan berurutan.
 * Pengganti applyDecorators untuk field DTO: tipe kembalian applyDecorators
 * di Nest 12 tidak diterima TypeScript 6 sebagai property decorator.
 */
export function composePropertyDecorators(
  ...decorators: PropertyDecorator[]
): PropertyDecorator {
  return (target, propertyKey) => {
    for (const decorator of decorators) {
      decorator(target, propertyKey);
    }
  };
}
