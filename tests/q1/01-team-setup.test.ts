import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestApp } from "../helpers/app-helper.js";
import { realisticSeasonFixture, realisticTeamProfileFixture } from "../fixtures/q1-realistic-fixtures.js";

// Helper per creare un contesto isolato e riproducibile per ogni test
function setupFreshContext() {
  const ctx = createTestApp();
  return ctx;
}

test("1.1 Team profile starts unconfigured (null) and public route returns 404", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    const adminRes = await app.inject({
      method: "GET",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
    });
    assert.equal(adminRes.statusCode, 200);
    assert.equal(adminRes.json(), null);

    const publicRes = await app.inject({
      method: "GET",
      url: "/api/v1/public/team",
    });
    assert.equal(publicRes.statusCode, 404);
    assert.deepEqual(publicRes.json(), { error: "public_team_not_found" });
  } finally {
    await app.close();
  }
});

test("1.2 Create season persists with valid date range and labels", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    assert.equal(res.statusCode, 201);
    const body = res.json<{ id: string; label: string; startsOn: string; endsOn: string }>();
    assert.ok(body.id);
    assert.equal(body.label, realisticSeasonFixture.label);
    assert.equal(body.startsOn, realisticSeasonFixture.startsOn);
    assert.equal(body.endsOn, realisticSeasonFixture.endsOn);
  } finally {
    await app.close();
  }
});

test("1.3 Reject season creation with invalid dates or endsOn before startsOn", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    const invalidDate = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: { label: "2026/2027-bad", startsOn: "not-a-date", endsOn: "2027-06-30" },
    });
    assert.equal(invalidDate.statusCode, 400);

    const invertedDates = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: { label: "2026/2027-inverted", startsOn: "2027-06-30", endsOn: "2026-09-01" },
    });
    assert.equal(invertedDates.statusCode, 400);
    assert.equal(invertedDates.json().error, "season_end_before_start");
  } finally {
    await app.close();
  }
});

test("1.4 Duplicate season label causes 409 conflict", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    // Prima creazione
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    assert.equal(first.statusCode, 201);

    // Tentativo duplicato
    const dup = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.json().error, "season_label_exists");
  } finally {
    await app.close();
  }
});

test("1.5 Team setup with branding, colors, and season link", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    const sRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    const seasonId = sRes.json<{ id: string }>().id;

    const configRes = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: {
        name: realisticTeamProfileFixture.name,
        crestUrl: realisticTeamProfileFixture.crestUrl,
        primaryColor: realisticTeamProfileFixture.primaryColor,
        secondaryColor: realisticTeamProfileFixture.secondaryColor,
        currentSeasonId: seasonId,
      },
    });
    assert.equal(configRes.statusCode, 200);
    const team = configRes.json<{
      id: number;
      name: string;
      crestUrl: string;
      primaryColor: string;
      secondaryColor: string;
      currentSeasonId: string;
      publishedAt: string | null;
    }>();

    assert.equal(team.id, 1);
    assert.equal(team.name, realisticTeamProfileFixture.name);
    assert.equal(team.crestUrl, realisticTeamProfileFixture.crestUrl);
    assert.equal(team.primaryColor, realisticTeamProfileFixture.primaryColor);
    assert.equal(team.secondaryColor, realisticTeamProfileFixture.secondaryColor);
    assert.equal(team.currentSeasonId, seasonId);
    assert.equal(team.publishedAt, null);

    // Ancora non pubblicato: rotta pubblica ritorna 404
    const publicRes = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(publicRes.statusCode, 404);
  } finally {
    await app.close();
  }
});

test("1.6 Team profile validation: crestUrl must be https and colors must be hex", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    const badHttpCrest = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: { crestUrl: "http://insecure.example.org/crest.png" },
    });
    assert.equal(badHttpCrest.statusCode, 400);
    assert.equal(badHttpCrest.json().error, "crest_url_must_be_https");

    const badColor = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: { primaryColor: "red" },
    });
    assert.equal(badColor.statusCode, 400);
    assert.equal(badColor.json().error, "request_validation_failed");
  } finally {
    await app.close();
  }
});

test("1.7 Team publication makes branding and current season publicly visible", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    const sRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    const seasonId = sRes.json<{ id: string }>().id;

    await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: {
        name: realisticTeamProfileFixture.name,
        crestUrl: realisticTeamProfileFixture.crestUrl,
        primaryColor: realisticTeamProfileFixture.primaryColor,
        secondaryColor: realisticTeamProfileFixture.secondaryColor,
        currentSeasonId: seasonId,
      },
    });

    const pubRes = await app.inject({
      method: "POST",
      url: "/api/v1/admin/team/publish",
      headers: adminHeaders,
    });
    assert.equal(pubRes.statusCode, 200);
    const pubData = pubRes.json<{ publishedAt: string }>();
    assert.ok(pubData.publishedAt);

    const publicRes = await app.inject({ method: "GET", url: "/api/v1/public/team" });
    assert.equal(publicRes.statusCode, 200);
    const publicTeam = publicRes.json<{
      name: string;
      crestUrl: string;
      primaryColor: string | null;
      secondaryColor: string | null;
      currentSeason: { id: string; label: string; startsOn: string; endsOn: string } | null;
    }>();

    assert.equal(publicTeam.name, realisticTeamProfileFixture.name);
    assert.equal(publicTeam.crestUrl, realisticTeamProfileFixture.crestUrl);
    assert.equal(publicTeam.primaryColor, realisticTeamProfileFixture.primaryColor);
    assert.equal(publicTeam.secondaryColor, realisticTeamProfileFixture.secondaryColor);
    assert.ok(publicTeam.currentSeason);
    assert.equal(publicTeam.currentSeason.label, realisticSeasonFixture.label);
  } finally {
    await app.close();
  }
});

test("1.8 Published team cannot clear required fields (name, crest)", async () => {
  const { app, adminHeaders } = setupFreshContext();
  try {
    await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: {
        name: realisticTeamProfileFixture.name,
        crestUrl: realisticTeamProfileFixture.crestUrl,
      },
    });
    await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    const clearName = await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: { name: "   " },
    });
    assert.equal(clearName.statusCode, 400);
    assert.equal(clearName.json().error, "team_name_and_crest_required_when_published");
  } finally {
    await app.close();
  }
});

test("1.9 Audit trail is recorded for team and season modifications", async () => {
  const { app, db, adminHeaders } = setupFreshContext();
  try {
    await app.inject({
      method: "POST",
      url: "/api/v1/admin/seasons",
      headers: adminHeaders,
      payload: realisticSeasonFixture,
    });
    await app.inject({
      method: "PUT",
      url: "/api/v1/admin/team",
      headers: adminHeaders,
      payload: {
        name: realisticTeamProfileFixture.name,
        crestUrl: realisticTeamProfileFixture.crestUrl,
      },
    });
    await app.inject({ method: "POST", url: "/api/v1/admin/team/publish", headers: adminHeaders });

    const audits = db.getAuditEvents();
    assert.ok(audits.length >= 3, "Expected at least 3 audit records");

    const seasonAudit = audits.find((a) => a.entity_type === "season" && a.operation === "create");
    assert.ok(seasonAudit);
    assert.equal(seasonAudit.actor_subject, "admin-user-q1");
    assert.equal(seasonAudit.source_kind, "admin_entry");

    const teamPublishAudit = audits.find((a) => a.entity_type === "team" && a.operation === "publish");
    assert.ok(teamPublishAudit);
    assert.equal(teamPublishAudit.actor_subject, "admin-user-q1");
  } finally {
    await app.close();
  }
});
