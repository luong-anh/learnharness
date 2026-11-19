import assert from "node:assert/strict";
import { test } from "node:test";
import { installRandomUUID } from "../lib/browser-crypto.ts";
import { newAnswerResult, newPlanBlockMessage } from "../src/core/native-messages.ts";
import { newSideThreadId } from "../src/core/side-chat.ts";

test("preserves an existing UUID implementation and its receiver", () => {
	const native: Crypto["randomUUID"] = function (this: unknown) {
		assert.equal(this, crypto);
		return "12345678-1234-4234-8234-123456789abc";
	};
	const crypto = { randomUUID: native, getRandomValues: () => assert.fail("Native UUID should be used") };
	installRandomUUID(crypto);
	assert.equal(crypto.randomUUID, native);
	assert.equal(crypto.randomUUID(), "12345678-1234-4234-8234-123456789abc");
});

test("HTTP fallback uses secure bytes, sets UUID version/variant, and installs only once", () => {
	let calls = 0;
	const crypto: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = {
		getRandomValues<T extends ArrayBufferView | null>(array: T): T {
			assert(array instanceof Uint8Array);
			assert.equal(array.length, 16);
			calls++;
			array.forEach((_, index) => { array[index] = index; });
			return array;
		},
	};
	installRandomUUID(crypto);
	const installed = crypto.randomUUID!;
	assert.equal(crypto.randomUUID!(), "00010203-0405-4607-8809-0a0b0c0d0e0f");
	assert.equal(calls, 1);
	installRandomUUID(crypto);
	assert.equal(crypto.randomUUID, installed);
});

test("question answers, plan blocks, and side-question IDs work without native randomUUID", () => {
	const original = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
	const crypto: Pick<Crypto, "getRandomValues"> & Partial<Pick<Crypto, "randomUUID">> = {
		getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto),
	};
	try {
		Object.defineProperty(globalThis, "crypto", { configurable: true, value: crypto });
		installRandomUUID(crypto);
		const answer = newAnswerResult("question", "ask_user_question", {
			kind: "ask", questionText: "Why?", dontKnow: false, answers: [], text: "My answer", answeredAt: new Date().toISOString(),
		});
		assert.match(answer.id, /^msg_[a-z0-9]+_[a-f0-9]{8}$/);
		assert.equal(answer.role, "toolResult");
		assert.equal(answer.toolCallId, "question");
		assert.match(newPlanBlockMessage("plan", {}).id, /^pb_[a-z0-9]+_[a-f0-9]{8}$/);
		assert.match(newSideThreadId(), /^side_[a-z0-9]+_[a-f0-9]{8}$/);
		assert.match(crypto.randomUUID!().replaceAll("-", ""), /^[a-f0-9]{32}$/);
	} finally {
		Object.defineProperty(globalThis, "crypto", original);
	}
});
