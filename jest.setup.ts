import "@testing-library/jest-dom";

// Next.js server helpers (e.g. `NextResponse`) expect WHATWG fetch globals.
// Jest's jsdom env doesn't always provide them.
import { TextDecoder, TextEncoder } from "util";
import { ReadableStream, TransformStream, WritableStream } from "stream/web";

// @ts-expect-error global polyfill for tests
globalThis.TextEncoder = globalThis.TextEncoder ?? TextEncoder;
// @ts-expect-error global polyfill for tests
globalThis.TextDecoder = globalThis.TextDecoder ?? TextDecoder;

// @ts-expect-error global polyfill for tests
globalThis.ReadableStream = globalThis.ReadableStream ?? ReadableStream;
// @ts-expect-error global polyfill for tests
globalThis.WritableStream = globalThis.WritableStream ?? WritableStream;
// @ts-expect-error global polyfill for tests
globalThis.TransformStream = globalThis.TransformStream ?? TransformStream;

// Use undici's WHATWG fetch primitives.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { Headers, Request, Response } = require("undici");
// @ts-expect-error global polyfill for tests
globalThis.Headers = globalThis.Headers ?? Headers;
// @ts-expect-error global polyfill for tests
globalThis.Request = globalThis.Request ?? Request;
// @ts-expect-error global polyfill for tests
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
