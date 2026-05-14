import "@testing-library/jest-dom";

/**
 * Jest test environment setup.
 *
 * @remarks
 * Some modules under test import Next.js server utilities (notably
 * `next/server`, `NextRequest`, `NextResponse`) which assume a WHATWG/Web
 * platform runtime. Jest's `jsdom` environment can be missing pieces of that
 * surface (TextEncoder, Streams, Request/Response/Headers), leading to runtime
 * errors like `Request is not defined` or ESM-only polyfill import issues.
 *
 * We polyfill the minimal set of globals needed for deterministic tests while
 * keeping the rest of the environment as close to jsdom defaults as possible.
 */

// Next.js server helpers (e.g. `NextResponse`) expect WHATWG fetch globals.
// Jest's jsdom env doesn't always provide them.
import { TextDecoder, TextEncoder } from "util";
import { ReadableStream, TransformStream, WritableStream } from "stream/web";

globalThis.TextEncoder = globalThis.TextEncoder ?? TextEncoder;
globalThis.TextDecoder = globalThis.TextDecoder ?? TextDecoder;

globalThis.ReadableStream = globalThis.ReadableStream ?? ReadableStream;
globalThis.WritableStream = globalThis.WritableStream ?? WritableStream;
globalThis.TransformStream = globalThis.TransformStream ?? TransformStream;

// Use undici's WHATWG fetch primitives.
const { Headers, Request, Response } = require("undici");
globalThis.Headers = globalThis.Headers ?? Headers;
globalThis.Request = globalThis.Request ?? Request;
globalThis.Response = globalThis.Response ?? Response;

jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  }),
  usePathname: jest.fn(() => "/"),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));
