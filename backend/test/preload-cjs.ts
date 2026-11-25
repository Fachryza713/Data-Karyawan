// @nestjs/throttler masih CommonJS dan me-require() @nestjs/common (ESM).
// Di loader ESM Jest, require itu gagal ("Cannot require() ES Module ... in a
// cycle") jika terjadi di tengah graf import aplikasi. Dimuat lebih dulu di
// sini supaya modulnya sudah ada di cache saat aplikasi mengimpornya.
await import('@nestjs/common');
await import('@nestjs/throttler');
