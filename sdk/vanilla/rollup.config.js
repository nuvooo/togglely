import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

export default [
  // ESM build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.esm.js',
      format: 'esm',
      sourcemap: true
    },
    plugins: [resolve(), typescript({ tsconfig: './tsconfig.json' })],
    external: ['@flagify/sdk-core']
  },
  // CJS build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true
    },
    plugins: [resolve(), typescript({ tsconfig: './tsconfig.json' })],
    external: ['@flagify/sdk-core']
  },
  // UMD build (for CDN)
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.umd.js',
      format: 'umd',
      name: 'Flagify',
      sourcemap: true,
      globals: {}
    },
    plugins: [resolve(), typescript({ tsconfig: './tsconfig.json' })]
  },
  // UMD minified build
  {
    input: 'src/index.ts',
    output: {
      file: 'dist/index.umd.min.js',
      format: 'umd',
      name: 'Flagify',
      sourcemap: true,
      globals: {}
    },
    plugins: [resolve(), typescript({ tsconfig: './tsconfig.json' }), terser()]
  }
];
