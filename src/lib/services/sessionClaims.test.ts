import { describe, it, expect } from "vitest";
import { carryUserId, applyUserId } from "@/lib/services/sessionClaims";

describe("carryUserId", () => {
  it("puts the database id on the token at sign-in so later requests can use it", () => {
    const token = carryUserId({ email: "admin@kca.kr" }, { id: "7" });

    expect(token).toMatchObject({ uid: "7" });
  });

  it("keeps the id already on the token when the user is absent on later requests", () => {
    const token = carryUserId({ uid: "7", email: "admin@kca.kr" }, undefined);

    expect(token).toMatchObject({ uid: "7" });
  });

  it("does not invent an id when neither side has one", () => {
    expect(carryUserId({ email: "admin@kca.kr" }, undefined)).not.toHaveProperty("uid");
  });
});

describe("applyUserId", () => {
  it("exposes the id on the session so route handlers can record who ran an analysis", () => {
    const session = applyUserId(
      { user: { email: "admin@kca.kr" }, expires: "2026-12-31" },
      { uid: "7" },
    );

    expect(session.user).toMatchObject({ id: "7", email: "admin@kca.kr" });
  });

  it("leaves the session untouched when the token carries no id", () => {
    const session = applyUserId({ user: { email: "admin@kca.kr" }, expires: "2026-12-31" }, {});

    expect(session.user).not.toHaveProperty("id");
  });

  it("survives a session without a user", () => {
    expect(applyUserId({ expires: "2026-12-31" }, { uid: "7" })).toEqual({ expires: "2026-12-31" });
  });
});
